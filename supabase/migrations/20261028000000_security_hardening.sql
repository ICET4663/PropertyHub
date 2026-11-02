-- Security audit fixes (stage 10). Each block names the finding it closes; the checks are in
-- scripts/db-tests/security.mjs (npm run db:test). Run after 20261027000000_paystack_payments.sql.

-- ---------------------------------------------------------------- S1 (high): staff feed open to any account
-- Any signed-in account, including a brand-new sign-up with no tenancy, could post any text and link to
-- the staff feed, and every post is pushed to managers' and admins' phones. Now only staff and tenants
-- with a tenancy may post there; the server stamps who and when, and tenants get 20 staff posts an hour.
alter table public.notifications
  add column posted_by uuid default auth.uid() references public.profiles (id) on delete set null;
create index on public.notifications (posted_by, at);

drop policy "notifications: post to staff or to a tenant I can see" on public.notifications;
create policy "notifications: post to staff or to a tenant I can see" on public.notifications for insert to authenticated
  with check (
    (audience = 'staff' and (private.is_staff() or private.my_tenant_id() is not null))
    or audience = private.my_tenant_id()
    or (private.is_staff() and exists (select 1 from public.tenants t where t.id = audience))
  );

create function private.stamp_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;  -- seed and service scripts
  new.posted_by := auth.uid();
  new.at := now();
  if new.audience = 'staff' and not private.is_staff()
     and (select count(*) from public.notifications n
          where n.posted_by = auth.uid() and n.audience = 'staff' and n.at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many messages to the management office. Try again later.';
  end if;
  return new;
end $$;
create trigger notifications_stamp before insert on public.notifications
  for each row execute function private.stamp_notification();

-- ---------------------------------------------------------------- S2 (medium): notifications could be rewritten
-- "Mark as read" allowed changing any column, so a tenant could reword a "Payment received" notice and
-- any staff member could edit the shared staff feed.
create function private.guard_notification_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not private.only_columns_changed(to_jsonb(old), to_jsonb(new), array['read']) then
    raise exception 'You can only mark notifications as read';
  end if;
  return new;
end $$;
create trigger notifications_guard before update on public.notifications
  for each row execute function private.guard_notification_update();

-- ---------------------------------------------------------------- S3 (medium): caretakers saw ID documents and rent
-- Caretakers could open tenants' ID and KYC files, list tenant document records, and read every charge
-- and Paystack attempt in their properties. Their work needs none of it; property papers stay readable.
drop policy "payments: scoped read" on public.payments;
create policy "payments: scoped read" on public.payments for select to authenticated
  using (
    tenant_id = private.my_tenant_id()
    or private.my_role() in ('super_admin', 'accountant')
    or (private.my_role() = 'manager' and exists (select 1 from public.tenants t where t.id = tenant_id and private.can_see_property(t.property_id)))
  );

drop policy "paystack_transactions: scoped read" on public.paystack_transactions;
create policy "paystack_transactions: scoped read" on public.paystack_transactions for select to authenticated
  using (
    tenant_id = private.my_tenant_id()
    or private.my_role() in ('super_admin', 'accountant')
    or (private.my_role() = 'manager' and exists (select 1 from public.tenants t where t.id = tenant_id and private.can_see_property(t.property_id)))
  );

drop policy "documents: scoped read" on public.documents;
create policy "documents: scoped read" on public.documents for select to authenticated
  using (
    tenant_id = private.my_tenant_id()
    or private.my_role() in ('super_admin', 'accountant')
    or (tenant_id is null and private.can_see_property(property_id))
    or (private.my_role() = 'manager' and (
          private.can_see_property(property_id)
          or exists (select 1 from public.tenants t where t.id = tenant_id and private.can_see_property(t.property_id))))
  );

drop policy "documents bucket: read" on storage.objects;
create policy "documents bucket: read" on storage.objects for select to authenticated
  using (
    bucket_id = 'documents' and (
      ((storage.foldername(objects.name))[1] = 'properties' and private.can_see_property((storage.foldername(objects.name))[2]))
      or ((storage.foldername(objects.name))[1] = 'tenants' and private.my_role() is distinct from 'caretaker' and exists (
            select 1 from public.tenants t where t.id = (storage.foldername(objects.name))[2]))
    )
  );

-- ---------------------------------------------------------------- S4 (medium): every staff account read every profile
-- Any caretaker or manager could read the name, email and phone of every account, including tenants of
-- properties they have nothing to do with. Staff still see all staff; tenant accounts only when they
-- can see that tenancy. Admins and accountants see everyone, as before.
drop policy "profiles: self, staff, or my property's manager" on public.profiles;
create policy "profiles: self, staff, or my property's manager" on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or private.my_role() in ('super_admin', 'accountant')
    or (private.is_staff() and (role <> 'tenant' or exists (select 1 from public.tenants t where t.id = profiles.tenant_id)))
    or id = (select manager_id from public.properties where id = private.my_property_id())
  );

-- ---------------------------------------------------------------- S5 (medium): onboarding drafts open to every manager
-- Drafts hold an applicant's ID number, contacts and next of kin. Now: admins, the manager who started
-- the draft, and the managers of the property it allocates.
drop policy "onboarding_drafts: admins and managers" on public.onboarding_drafts;
create policy "onboarding_drafts: admins, author, property managers" on public.onboarding_drafts for all to authenticated
  using (private.is_admin() or (private.my_role() = 'manager' and (created_by = auth.uid() or private.can_manage_property(allocation ->> 'propertyId'))))
  with check (private.is_admin() or (private.my_role() = 'manager' and (created_by = auth.uid() or private.can_manage_property(allocation ->> 'propertyId'))));

-- ---------------------------------------------------------------- S6 (low): announcements of other properties
-- Any manager could post to, edit or delete announcements of properties they don't manage.
alter table public.announcements
  add column created_by uuid default auth.uid() references public.profiles (id) on delete set null;

drop policy "announcements: admins and managers write" on public.announcements;
create policy "announcements: managers post for their properties" on public.announcements for insert to authenticated
  with check (private.is_admin() or (private.my_role() = 'manager' and (property_id is null or private.can_manage_property(property_id))));
create policy "announcements: author or property manager edits" on public.announcements for update to authenticated
  using (private.is_admin() or created_by = auth.uid() or private.can_manage_property(property_id))
  with check (private.is_admin() or (private.my_role() = 'manager' and (property_id is null or private.can_manage_property(property_id))));
create policy "announcements: author or property manager deletes" on public.announcements for delete to authenticated
  using (private.is_admin() or created_by = auth.uid() or private.can_manage_property(property_id));

-- ---------------------------------------------------------------- S7 (low): activity log could be back-dated or misattributed
create function private.stamp_activity_log() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  new.actor_id := auth.uid();
  new.user_name := coalesce(private.my_name(), new.user_name);
  new.at := now();
  return new;
end $$;
create trigger activity_logs_stamp before insert on public.activity_logs
  for each row execute function private.stamp_activity_log();

-- ---------------------------------------------------------------- S8 (low): tenants could add "completion" photos
-- A caretaker can only mark a job fixed once <request>/completion/ holds a photo, but anyone who could
-- see the request could upload there. Completion photos are now staff-only.
drop policy "maintenance photos: upload to a visible request" on storage.objects;
create policy "maintenance photos: upload to a visible request" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'maintenance-photos'
    and private.my_role() is distinct from 'accountant'
    and exists (select 1 from public.maintenance_requests r where r.id = (storage.foldername(objects.name))[1])
    and ((storage.foldername(objects.name))[2] is distinct from 'completion' or private.is_staff())
  );

-- ---------------------------------------------------------------- S9 (low): tenant documents filed under any property
drop policy "documents: managers add, tenants add their own" on public.documents;
create policy "documents: managers add, tenants add their own" on public.documents for insert to authenticated
  with check (
    private.is_admin()
    or private.can_manage_property(property_id)
    or exists (select 1 from public.tenants t where t.id = tenant_id and private.can_manage_property(t.property_id))
    or (tenant_id = private.my_tenant_id()
        and (property_id is null or property_id = private.my_property_id())
        and (select self_docs from public.org_settings))
  );

-- ---------------------------------------------------------------- S10 (medium): moved-out tenants kept their access
-- Deactivating a tenant tried to suspend their login with a profile update that only admins may make, so
-- for managers it silently did nothing: the former tenant could still read their old lease, charges and
-- documents, upload files and post to the staff feed. The database now suspends the login itself when a
-- tenancy ends, and restores it if the tenant is made active again.
create or replace function private.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not private.is_admin()
     and coalesce(current_setting('app.linking_tenant', true), '') <> 'on'
     and coalesce(current_setting('app.tenancy_access', true), '') <> 'on'
     and not private.only_columns_changed(to_jsonb(old), to_jsonb(new), array['name', 'phone', 'two_step', 'last_active']) then
    raise exception 'You can only change your name, phone, two-step setting and activity time';
  end if;
  return new;
end $$;

create function private.tenancy_access() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.tenancy_access', 'on', true);
  if new.status in ('deactivated', 'former') and old.status not in ('deactivated', 'former') then
    update public.profiles set status = 'suspended' where tenant_id = new.id and role = 'tenant' and status <> 'suspended';
  elsif new.status in ('active', 'pending') and old.status in ('deactivated', 'former') then
    update public.profiles set status = 'active' where tenant_id = new.id and role = 'tenant' and status = 'suspended';
  end if;
  perform set_config('app.tenancy_access', 'off', true);
  return new;
end $$;
create trigger tenants_access after update of status on public.tenants
  for each row execute function private.tenancy_access();

-- New private functions are callable by PUBLIC by default; only signed-in users need them (in policies).
revoke execute on function private.stamp_notification(), private.guard_notification_update(), private.stamp_activity_log(), private.tenancy_access() from public, anon;
