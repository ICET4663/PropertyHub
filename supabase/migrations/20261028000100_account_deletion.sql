-- In-app account deletion (stage 14: both app stores require it). Run after 20261028000000_security_hardening.sql.
--
-- delete_my_account() removes the caller's sign-in for good: auth.users → profiles cascade, which also
-- removes their push tokens and property assignments; requests, events, logs, notices and Paystack
-- attempts they touched keep their history with the person set to null. Tenancy records (the tenants
-- row, leases, charges, payments, documents) belong to the management organisation and are kept, as the
-- privacy notice says; staff are told so they can follow up. The last active super admin can't delete
-- themselves, so the organisation is never left without an administrator.

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  t public.tenants;
  has_lease boolean;
  open_jobs int;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then
    raise exception 'Sign in first';
  end if;
  if me.role = 'super_admin' and not exists (
    select 1 from public.profiles p where p.role = 'super_admin' and p.status = 'active' and p.id <> me.id
  ) then
    raise exception 'You are the only administrator. Make someone else an administrator before deleting your account.';
  end if;

  if me.tenant_id is not null then
    select * into t from public.tenants where id = me.tenant_id;
  end if;

  if t.id is not null then
    has_lease := exists (select 1 from public.leases l where l.tenant_id = t.id);
    insert into public.notifications (audience, category, title, body, meta, tone, link)
    values ('staff', 'Tenants', 'Tenant deleted their account',
            t.name || ' deleted their PropertyHub account and can no longer sign in. Their tenancy records are kept.'
              || case when has_lease then '' else ' They have no lease, so you can delete the tenant record if it is no longer needed.' end,
            'Tenants · Account deleted', 'warning',
            jsonb_build_object('name', 'tenant', 'params', jsonb_build_object('id', t.id)));
  elsif me.role <> 'tenant' then
    select count(*) into open_jobs from public.maintenance_requests r
     where r.caretaker_id = me.id and r.status in ('assigned', 'in_progress');
    insert into public.notifications (audience, category, title, body, meta, tone, link)
    values ('staff', 'Users', 'Team member deleted their account',
            coalesce(nullif(me.name, ''), me.email) || ' deleted their PropertyHub account.'
              || case when open_jobs = 1 then ' 1 open job is now without a caretaker.'
                      when open_jobs > 1 then ' ' || open_jobs || ' open jobs are now without a caretaker.'
                      else '' end,
            'Users · Account deleted', 'warning',
            jsonb_build_object('name', 'users', 'params', '{}'::jsonb));
  end if;
  -- (A sign-up that never got a tenancy has nothing for staff to follow up.)

  insert into public.activity_logs (action, record, area) values ('Deleted own account', coalesce(nullif(me.name, ''), me.email), 'Users');

  -- The cascade clears this person from other rows (caretaker_id, posted_by, actor_id, …). The update
  -- guards would read that as the caller editing those rows, so the rest runs without the caller's
  -- identity, as server scripts do. Local to this transaction.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  delete from auth.users where id = me.id;
end $$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
