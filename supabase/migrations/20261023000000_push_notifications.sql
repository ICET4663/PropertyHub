-- Push notifications.
--
-- Every row added to public.notifications is also sent to the phones of the people it is for, through
-- Expo's push service (https://exp.host/--/api/v2/push/send) using pg_net. The in-app feed stays the
-- record; a push is only a copy of a row, so anything that already posts a notification (request
-- workflow, KYC, leases, announcements) now also reaches phones, and each row is pushed once.
--
-- A daily job adds the reminders nobody triggers by hand: rent due / overdue and lease ending. Each
-- one is logged in private.reminders_sent so it goes out once.
--
-- Run after 20261020000200_maintenance_workflow.sql (uses private.notify and maintenance_requests.caretaker_id).
-- Needs the pg_net and pg_cron extensions (both available on Supabase).

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------- device tokens
-- One row per installed app. A token belongs to whoever signed in on that phone last.
create table public.push_tokens (
  token text primary key check (token like 'ExponentPushToken[%]' or token like 'ExpoPushToken[%]'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
create policy "push_tokens: read mine" on public.push_tokens for select to authenticated
  using (user_id = auth.uid());
create policy "push_tokens: remove mine" on public.push_tokens for delete to authenticated
  using (user_id = auth.uid());
-- No insert/update policies: register_push_token() below is the only way in, so a token moves to the
-- new account when someone else signs in on the same phone.

create function public.register_push_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.my_role() is null then raise exception 'Sign in first'; end if;
  insert into public.push_tokens (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, last_seen = now();
end $$;

revoke execute on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

-- ---------------------------------------------------------------- who gets a push
-- Tenant rows: that tenant's account. Staff rows go to fewer people than the shared staff feed: the
-- managers of the property the link points at (super admins when it has none), the caretaker on the
-- job for request links, and accountants for rent. Staff notices with no property go to super admins.
create function private.push_recipients(n public.notifications) returns setof uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  target text := n.link -> 'params' ->> 'id';
  pid text;
  carer uuid;
begin
  if n.audience <> 'staff' then
    return query select p.id from public.profiles p
      where p.role = 'tenant' and p.tenant_id = n.audience and p.status <> 'suspended';
    return;
  end if;

  case n.link ->> 'name'
    when 'request' then select r.property_id, r.caretaker_id into pid, carer from public.maintenance_requests r where r.id = target;
    when 'tenant' then select t.property_id into pid from public.tenants t where t.id = target;
    when 'lease' then select l.property_id into pid from public.leases l where l.id = target;
    when 'renew' then select l.property_id into pid from public.leases l where l.id = target;
    when 'unit' then select u.property_id into pid from public.units u where u.id = target;
    when 'property' then pid := target;
    else null;
  end case;

  return query
    with managers as (
      select pp.profile_id as id from public.profile_properties pp
      join public.profiles p on p.id = pp.profile_id
      where pid is not null and pp.property_id = pid and p.role = 'manager' and p.status <> 'suspended'
    )
    select id from managers
    union
    select p.id from public.profiles p
      where p.status <> 'suspended' and (
        (p.role = 'super_admin' and not exists (select 1 from managers))
        or (p.role = 'caretaker' and p.id = carer)
        or (p.role = 'accountant' and n.category = 'Rent')
      );
end $$;

-- ---------------------------------------------------------------- sending
-- Request ids from pg_net with the tokens they went to, in order, so private.prune_push_tokens() can
-- match Expo's tickets back to tokens and drop the ones for uninstalled apps.
create table private.push_sends (
  request_id bigint primary key,
  tokens text[] not null,
  sent_at timestamptz not null default now()
);

create function private.send_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  batch record;
  req bigint;
begin
  -- Old rows (seed data, imports) are history, not news. `at` can come from a phone's clock, so allow
  -- for one that is a little behind.
  if new.at < now() - interval '1 hour' then return new; end if;

  -- Expo takes at most 100 messages per request.
  for batch in
    select array_agg(t.token order by t.token) as tokens,
           jsonb_agg(jsonb_build_object(
             'to', t.token,
             'title', left(new.title, 120),
             'body', left(new.body, 240),
             'sound', 'default',
             'channelId', 'default',
             'data', jsonb_build_object('notificationId', new.id, 'link', new.link)
           ) order by t.token) as messages
    from (
      select pt.token, (row_number() over (order by pt.token) - 1) / 100 as chunk
      from public.push_tokens pt
      where pt.user_id in (select private.push_recipients(new))
    ) t
    group by t.chunk
  loop
    begin
      select net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := batch.messages,
        headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
      ) into req;
      insert into private.push_sends (request_id, tokens) values (req, batch.tokens);
    exception when others then
      -- A push is a copy; never lose the notification itself because sending failed.
      raise warning 'push for % not sent: %', new.id, sqlerrm;
    end;
  end loop;
  return new;
end $$;

create trigger notifications_push after insert on public.notifications
  for each row execute function private.send_push();

-- Drops tokens Expo reports as DeviceNotRegistered (app uninstalled or notifications reset), then
-- forgets sends older than a day. pg_net keeps responses for a few hours, so this runs hourly.
create function private.prune_push_tokens() returns void
language plpgsql security definer set search_path = '' as $$
declare
  s record;
  ticket jsonb;
  i int;
begin
  for s in
    select ps.request_id, ps.tokens, r.content::jsonb -> 'data' as tickets
    from private.push_sends ps join net._http_response r on r.id = ps.request_id
    where r.status_code = 200
  loop
    if jsonb_typeof(s.tickets) = 'array' then
      for i in 0 .. jsonb_array_length(s.tickets) - 1 loop
        ticket := s.tickets -> i;
        if ticket ->> 'status' = 'error' and ticket -> 'details' ->> 'error' = 'DeviceNotRegistered' then
          delete from public.push_tokens where token = s.tokens[i + 1];
        end if;
      end loop;
    end if;
    delete from private.push_sends where request_id = s.request_id;
  end loop;
  delete from private.push_sends where sent_at < now() - interval '1 day';
end $$;

-- ---------------------------------------------------------------- reminders
-- Keys like 'due:pay-123', 'overdue:pay-123', 'lease30:LS-0042', 'paid:pay-123'.
create table private.reminders_sent (
  key text primary key,
  sent_at timestamptz not null default now()
);

create function private.money(n bigint) returns text
language sql immutable as $$
  select '₦' || to_char(n, 'FM999,999,999,999')
$$;

-- Daily. Rent due in the next 7 days, rent past its date, and leases ending in 60 / 30 / 7 days.
-- It only posts notifications; it never changes payment or lease records.
create function private.send_reminders() returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  days int;
  bucket text;
  staff_link jsonb;
begin
  for r in
    select p.* from public.payments p
    where p.status = 'pending' and p.date between current_date and current_date + 7
  loop
    insert into private.reminders_sent (key) values ('due:' || r.id) on conflict do nothing;
    if found then
      perform private.notify(r.tenant_id, 'Rent',
        case when r.date = current_date then 'Rent is due today.' else 'Rent is due on ' || to_char(r.date, 'FMDD Mon YYYY') || '.' end,
        r.label || ': ' || private.money(r.amount) || '.', 'Rent', 'warning', '{"name": "myLease"}'::jsonb);
    end if;
  end loop;

  for r in
    select p.*, t.name as tenant_name from public.payments p join public.tenants t on t.id = p.tenant_id
    where p.status = 'overdue' or (p.status = 'pending' and p.date < current_date)
  loop
    insert into private.reminders_sent (key) values ('overdue:' || r.id) on conflict do nothing;
    if found then
      staff_link := case when r.lease_id is not null
        then jsonb_build_object('name', 'lease', 'params', jsonb_build_object('id', r.lease_id))
        else jsonb_build_object('name', 'tenant', 'params', jsonb_build_object('id', r.tenant_id)) end;
      perform private.notify(r.tenant_id, 'Rent', 'Your rent is overdue.',
        r.label || ': ' || private.money(r.amount) || ', due ' || to_char(r.date, 'FMDD Mon YYYY') || '. Please pay or contact the management office.',
        'Rent', 'danger', '{"name": "myLease"}'::jsonb);
      perform private.notify('staff', 'Rent', 'Rent overdue',
        r.tenant_name || ': ' || r.label || ', ' || private.money(r.amount) || ', due ' || to_char(r.date, 'FMDD Mon YYYY') || '.',
        'Rent · Overdue', 'danger', staff_link);
    end if;
  end loop;

  for r in
    select l.*, t.name as tenant_name from public.leases l join public.tenants t on t.id = l.tenant_id
    where not l.terminated and l.renewed_to is null and l.end_date between current_date and current_date + 60
  loop
    days := r.end_date - current_date;
    bucket := case when days <= 7 then '7' when days <= 30 then '30' else '60' end;
    insert into private.reminders_sent (key) values ('lease' || bucket || ':' || r.id) on conflict do nothing;
    if found then
      perform private.notify(r.tenant_id, 'Leases', 'Your lease is ending soon.',
        'Your lease ends on ' || to_char(r.end_date, 'FMDD Mon YYYY') || '. Let us know if you plan to renew or move out.',
        'Lease', 'warning', '{"name": "myLease"}'::jsonb);
      perform private.notify('staff', 'Leases', 'Lease ending in ' || days || case when days = 1 then ' day' else ' days' end,
        r.tenant_name || ': ' || r.id || ' ends ' || to_char(r.end_date, 'FMDD Mon YYYY') || '.',
        'Leases · Renewal', 'warning', jsonb_build_object('name', 'lease', 'params', jsonb_build_object('id', r.id)));
    end if;
  end loop;
end $$;

-- A payment changing to paid (stage 6 marks it paid once Paystack confirms). Only changes count:
-- payments inserted as already paid (seed data, history) do not notify anyone.
create function private.payment_received() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    insert into private.reminders_sent (key) values ('paid:' || new.id) on conflict do nothing;
    if found then
      perform private.notify(new.tenant_id, 'Rent', 'Payment received.',
        new.label || ': ' || private.money(new.amount) || '. Thank you.', 'Rent', 'success', '{"name": "myLease"}'::jsonb);
    end if;
  end if;
  return new;
end $$;

create trigger payments_received after update of status on public.payments
  for each row execute function private.payment_received();

revoke all on private.push_sends, private.reminders_sent from public, anon, authenticated;
revoke execute on function private.send_reminders() from public, authenticated;
revoke execute on function private.prune_push_tokens() from public, authenticated;
revoke execute on function private.send_push() from public, authenticated;
revoke execute on function private.push_recipients(public.notifications) from public, authenticated;

-- 07:00 UTC is 08:00 in Lagos.
select cron.schedule('propertyhub-reminders', '0 7 * * *', 'select private.send_reminders()');
select cron.schedule('propertyhub-prune-push-tokens', '17 * * * *', 'select private.prune_push_tokens()');
