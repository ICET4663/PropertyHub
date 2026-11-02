-- Rent, service charge and deposit payments through Paystack (test mode until the owner approves live).
--
-- A public.payments row is a charge: what a tenant owes (pending / overdue) or has paid. Each attempt to
-- pay it through Paystack is a public.paystack_transactions row with its own status
-- (pending / success / failed / abandoned / refunded), separate from the charge and from the lease.
--
-- Only the Edge Functions in supabase/functions (secret key) start and settle attempts, through
-- paystack_begin() and paystack_record() below. The amount always comes from the charge, never from
-- the app. A charge becomes paid only after Paystack confirms the attempt (verify API or a signed
-- webhook), and settling is idempotent on the reference, so a repeated webhook changes nothing.
--
-- Money settles straight into the organisation's Paystack account (D4). Refunds and vendor payouts are
-- recorded by hand for the MVP; deposits are held by the organisation, not in escrow.
--
-- Run after 20261023000000_push_notifications.sql (uses private.notify and the payments_received trigger).

-- ---------------------------------------------------------------- charges
alter table public.payments
  add column paid_at timestamptz,
  add column reference text;  -- the Paystack reference that paid it; null for charges recorded by hand

-- ---------------------------------------------------------------- attempts
create table public.paystack_transactions (
  reference text primary key,
  payment_id text not null references public.payments (id) on delete restrict,
  tenant_id text not null references public.tenants (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,  -- who started it
  amount bigint not null check (amount > 0),  -- naira, copied from the charge when the attempt starts
  currency text not null default 'NGN',
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'abandoned', 'refunded')),
  return_url text not null default '',
  channel text,
  paystack_id bigint,
  fees bigint,               -- naira
  gateway_response text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.paystack_transactions (payment_id);
create index on public.paystack_transactions (tenant_id);

alter table public.paystack_transactions enable row level security;
create policy "paystack_transactions: scoped read" on public.paystack_transactions for select to authenticated
  using (
    tenant_id = private.my_tenant_id()
    or private.my_role() in ('super_admin', 'accountant')
    or exists (select 1 from public.tenants t where t.id = tenant_id and private.can_see_property(t.property_id))
  );
-- No write policies: only paystack_begin() and paystack_record() change attempts.

-- Every webhook delivery, kept for reconciliation and support. Not readable from the app.
create table private.paystack_events (
  id bigint generated always as identity primary key,
  event text not null,
  reference text,
  received_at timestamptz not null default now(),
  payload jsonb not null
);
revoke all on private.paystack_events from public, anon, authenticated;

-- ---------------------------------------------------------------- guard app writes to charges
-- Managers still record cash and bank payments by hand, but nobody signed in to the app can mark a
-- charge as paid by Paystack, or change or delete a charge Paystack has paid.
create function private.guard_payments() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.my_role() is null then return coalesce(new, old); end if;  -- server functions and the seed
  if tg_op = 'DELETE' then
    if old.reference is not null then raise exception 'A payment made through Paystack can’t be deleted.'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.reference is not null then
    raise exception 'A payment made through Paystack can’t be changed.';
  end if;
  if new.reference is not null or (tg_op = 'INSERT' and new.paid_at is not null)
     or (tg_op = 'UPDATE' and new.paid_at is distinct from old.paid_at) then
    raise exception 'Only Paystack can mark a payment as paid online.';
  end if;
  return new;
end $$;

create trigger payments_guard before insert or update or delete on public.payments
  for each row execute function private.guard_payments();

-- ---------------------------------------------------------------- start an attempt
-- Called by the paystack-initialize function after it has checked the caller's session.
-- Returns the reference and the amount to charge, both decided here.
create function public.paystack_begin(p_user uuid, p_payment_id text, p_return_url text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  pay public.payments;
  ref text;
begin
  select * into me from public.profiles where id = p_user and status <> 'suspended';
  if me.id is null or me.role <> 'tenant' or me.tenant_id is null then
    raise exception 'Only a tenant can pay their own charges.';
  end if;
  select * into pay from public.payments where id = p_payment_id for update;
  if pay.id is null or pay.tenant_id <> me.tenant_id then raise exception 'Payment not found.'; end if;
  if pay.status not in ('pending', 'overdue') then raise exception 'This payment has already been made.'; end if;
  if pay.amount <= 0 then raise exception 'There is nothing to pay on this charge.'; end if;
  if exists (select 1 from public.paystack_transactions where payment_id = pay.id and status = 'success') then
    raise exception 'This payment has already been made.';
  end if;
  if (select count(*) from public.paystack_transactions where payment_id = pay.id and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Too many payment attempts. Wait a few minutes and try again.';
  end if;

  ref := 'PH-' || pay.id || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  insert into public.paystack_transactions (reference, payment_id, tenant_id, profile_id, amount, return_url)
  values (ref, pay.id, pay.tenant_id, me.id, pay.amount, coalesce(p_return_url, ''));
  return jsonb_build_object('reference', ref, 'amount', pay.amount, 'currency', 'NGN', 'email', me.email, 'tenant_id', pay.tenant_id);
end $$;

-- ---------------------------------------------------------------- settle an attempt
-- p_status is what Paystack reported: 'success' | 'failed' | 'abandoned' | 'pending'.
-- p_data is Paystack's transaction object (amount in kobo, currency, channel, id, fees, paid_at,
-- gateway_response). Safe to call any number of times for the same reference.
-- p_event / p_payload log a webhook delivery (also when the reference isn't ours).
create function public.paystack_record(p_reference text, p_status text, p_data jsonb default '{}', p_event text default null, p_payload jsonb default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  tx public.paystack_transactions;
  pay public.payments;
  tenant_name text;
  paid timestamptz := coalesce(nullif(p_data ->> 'paid_at', '')::timestamptz, nullif(p_data ->> 'paidAt', '')::timestamptz, now());
begin
  if p_event is not null then
    insert into private.paystack_events (event, reference, payload) values (p_event, p_reference, coalesce(p_payload, '{}'));
  end if;

  select * into tx from public.paystack_transactions where reference = p_reference for update;
  if tx.reference is null then return 'unknown'; end if;
  -- Final states: a success is never undone here (refunds are recorded by hand).
  if tx.status in ('success', 'refunded') then return tx.status; end if;

  if p_status = 'success' then
    if (p_data ->> 'amount')::bigint is distinct from tx.amount * 100 or upper(coalesce(p_data ->> 'currency', '')) <> tx.currency then
      update public.paystack_transactions
        set status = 'failed', gateway_response = 'Amount or currency did not match the charge', updated_at = now()
        where reference = tx.reference;
      perform private.notify('staff', 'Rent', 'Payment needs checking',
        'Paystack reported a payment for ' || tx.reference || ' that does not match the charge. It was not marked as paid.',
        'Rent · Payments', 'danger', jsonb_build_object('name', 'tenant', 'params', jsonb_build_object('id', tx.tenant_id)));
      return 'failed';
    end if;

    update public.paystack_transactions set
      status = 'success',
      channel = p_data ->> 'channel',
      paystack_id = (p_data ->> 'id')::bigint,
      fees = round(coalesce((p_data ->> 'fees')::numeric, 0) / 100),
      gateway_response = p_data ->> 'gateway_response',
      paid_at = paid,
      updated_at = now()
    where reference = tx.reference;

    select * into pay from public.payments where id = tx.payment_id for update;
    if pay.status = 'paid' then
      -- Paid already (by hand, or by another attempt that finished first): the money still arrived.
      select name into tenant_name from public.tenants where id = tx.tenant_id;
      perform private.notify('staff', 'Rent', 'Paid twice: refund needed',
        coalesce(tenant_name, tx.tenant_id) || ' paid ' || private.money(tx.amount) || ' for ' || pay.label
          || ' through Paystack (' || tx.reference || '), but it was already marked as paid.',
        'Rent · Payments', 'danger', jsonb_build_object('name', 'tenant', 'params', jsonb_build_object('id', tx.tenant_id)));
    else
      -- The payments_received trigger tells the tenant.
      update public.payments set
        status = 'paid',
        method = 'Paystack · ' || initcap(replace(coalesce(p_data ->> 'channel', 'online'), '_', ' ')),
        date = (paid at time zone 'Africa/Lagos')::date,
        paid_at = paid,
        reference = tx.reference
      where id = pay.id;
    end if;
    return 'success';
  end if;

  if p_status in ('failed', 'abandoned') then
    update public.paystack_transactions
      set status = p_status, gateway_response = coalesce(p_data ->> 'gateway_response', gateway_response), updated_at = now()
      where reference = tx.reference;
    return p_status;
  end if;

  update public.paystack_transactions set updated_at = now() where reference = tx.reference;
  return tx.status;
end $$;

revoke execute on function public.paystack_begin(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.paystack_record(text, text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.paystack_begin(uuid, text, text) to service_role;
grant execute on function public.paystack_record(text, text, jsonb, text, jsonb) to service_role;

-- ---------------------------------------------------------------- live updates
-- The tenant sees the receipt, and the ledger updates, as soon as the server confirms.
alter publication supabase_realtime add table public.payments, public.paystack_transactions;
