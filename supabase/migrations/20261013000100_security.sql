-- PropertyHub row level security.
--
-- Roles (profiles.role):
--   super_admin  everything
--   accountant   reads everything, changes nothing ("All locations, read only")
--   manager      reads and changes the properties in profile_properties
--   caretaker    reads the properties in profile_properties; works maintenance requests there
--   tenant       their own tenancy only (profiles.tenant_id)
--
-- The publishable key is public, so these policies are the only thing protecting the data.

create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------- helpers
-- security definer so they can read profiles without tripping the profiles policies (no recursion).
create function private.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and status <> 'suspended'
$$;

create function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role() in ('super_admin', 'manager', 'accountant', 'caretaker'), false)
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role() = 'super_admin', false)
$$;

create function private.can_see_property(pid text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role() in ('super_admin', 'accountant'), false)
    or (private.my_role() in ('manager', 'caretaker')
        and exists (select 1 from public.profile_properties pp where pp.profile_id = auth.uid() and pp.property_id = pid))
$$;

create function private.can_manage_property(pid text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin()
    or (private.my_role() = 'manager'
        and exists (select 1 from public.profile_properties pp where pp.profile_id = auth.uid() and pp.property_id = pid))
$$;

create function private.my_tenant_id() returns text
language sql stable security definer set search_path = '' as $$
  select tenant_id from public.profiles where id = auth.uid() and role = 'tenant' and status <> 'suspended'
$$;

create function private.my_unit_id() returns text
language sql stable security definer set search_path = '' as $$
  select unit_id from public.tenants where id = private.my_tenant_id()
$$;

create function private.my_property_id() returns text
language sql stable security definer set search_path = '' as $$
  select property_id from public.tenants where id = private.my_tenant_id()
$$;

grant execute on all functions in schema private to authenticated;

-- Rejects an update that touches columns outside `allowed`, for callers who may only edit part of a row.
create function private.only_columns_changed(old_row jsonb, new_row jsonb, allowed text[]) returns boolean
language sql immutable as $$
  select (old_row - allowed) = (new_row - allowed)
$$;

-- ---------------------------------------------------------------- new sign-ups get a profile
-- Everyone starts as a tenant with no tenancy linked, so they see nothing until staff link or promote them.
-- Never trust role from sign-up metadata: anyone can set it.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, email, phone, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, ''),
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone', ''),
    'tenant',
    'active'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------- partial-update guards
create function private.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not private.is_admin()
     and not private.only_columns_changed(to_jsonb(old), to_jsonb(new), array['name', 'phone', 'two_step', 'last_active']) then
    raise exception 'You can only change your name, phone, two-step setting and activity time';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_profile_update();

create function private.guard_tenant_self_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.my_role() = 'tenant'
     and not private.only_columns_changed(to_jsonb(old), to_jsonb(new), array['phone', 'whatsapp', 'language', 'prefs', 'next_of_kin', 'employment']) then
    raise exception 'Tenants can only update their contact details and preferences';
  end if;
  return new;
end $$;
create trigger tenants_guard before update on public.tenants
  for each row execute function private.guard_tenant_self_update();

create function private.guard_lease_tenant_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.my_role() = 'tenant'
     and not private.only_columns_changed(to_jsonb(old), to_jsonb(new), array['tenant_intent']) then
    raise exception 'Tenants can only tell us whether they plan to renew';
  end if;
  return new;
end $$;
create trigger leases_guard before update on public.leases
  for each row execute function private.guard_lease_tenant_update();

create function private.guard_request_tenant_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.my_role() = 'tenant' then
    if not private.only_columns_changed(to_jsonb(old), to_jsonb(new), array['status', 'rating', 'updated_at']) then
      raise exception 'Tenants can only confirm, reopen or rate a request';
    end if;
    -- confirm a fix (resolved -> closed) or reopen it (resolved -> in_progress)
    if new.status is distinct from old.status
       and not (old.status = 'resolved' and new.status in ('closed', 'in_progress')) then
      raise exception 'Tenants can only confirm or reopen a resolved request';
    end if;
  elsif private.my_role() = 'caretaker'
     and not private.only_columns_changed(to_jsonb(old), to_jsonb(new), array['status', 'visit', 'updated_at', 'resolved_at']) then
    raise exception 'Caretakers can only update the status and visit of a request';
  end if;
  return new;
end $$;
create trigger maintenance_requests_guard before update on public.maintenance_requests
  for each row execute function private.guard_request_tenant_update();

-- ---------------------------------------------------------------- enable RLS everywhere
alter table public.profiles enable row level security;
alter table public.profile_properties enable row level security;
alter table public.locations enable row level security;
alter table public.properties enable row level security;
alter table public.blocks enable row level security;
alter table public.units enable row level security;
alter table public.tenants enable row level security;
alter table public.leases enable row level security;
alter table public.payments enable row level security;
alter table public.onboarding_drafts enable row level security;
alter table public.vendors enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.request_events enable row level security;
alter table public.announcements enable row level security;
alter table public.documents enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;
alter table public.org_settings enable row level security;

-- ---------------------------------------------------------------- profiles
create policy "profiles: self, staff, or my property's manager" on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or private.is_staff()
    or id = (select manager_id from public.properties where id = private.my_property_id())
  );
create policy "profiles: self or admin can update" on public.profiles for update to authenticated
  using (id = auth.uid() or private.is_admin());
create policy "profiles: admin can delete" on public.profiles for delete to authenticated
  using (private.is_admin());

create policy "profile_properties: staff read" on public.profile_properties for select to authenticated
  using (private.is_staff());
create policy "profile_properties: admin write" on public.profile_properties for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- ---------------------------------------------------------------- locations
create policy "locations: staff and own tenants read" on public.locations for select to authenticated
  using (
    private.is_staff()
    or id = (select location_id from public.properties where id = private.my_property_id())
  );
create policy "locations: admin insert" on public.locations for insert to authenticated
  with check (private.is_admin());
create policy "locations: admin or its manager update" on public.locations for update to authenticated
  using (private.is_admin() or (private.my_role() = 'manager' and manager_id = auth.uid()));
create policy "locations: admin delete" on public.locations for delete to authenticated
  using (private.is_admin());

-- ---------------------------------------------------------------- properties, blocks, units
create policy "properties: scoped read" on public.properties for select to authenticated
  using (private.can_see_property(id) or id = private.my_property_id());
create policy "properties: admin insert" on public.properties for insert to authenticated
  with check (private.is_admin());
create policy "properties: managers update" on public.properties for update to authenticated
  using (private.can_manage_property(id));
create policy "properties: admin delete" on public.properties for delete to authenticated
  using (private.is_admin());

create policy "blocks: scoped read" on public.blocks for select to authenticated
  using (private.can_see_property(property_id) or property_id = private.my_property_id());
create policy "blocks: managers write" on public.blocks for all to authenticated
  using (private.can_manage_property(property_id)) with check (private.can_manage_property(property_id));

create policy "units: scoped read, tenants see their own unit" on public.units for select to authenticated
  using (private.can_see_property(property_id) or id = private.my_unit_id());
create policy "units: managers write" on public.units for all to authenticated
  using (private.can_manage_property(property_id)) with check (private.can_manage_property(property_id));

-- ---------------------------------------------------------------- tenants
create policy "tenants: scoped staff read, tenant reads self" on public.tenants for select to authenticated
  using (
    id = private.my_tenant_id()
    or private.can_see_property(property_id)
    or (property_id is null and private.my_role() in ('super_admin', 'accountant'))
  );
create policy "tenants: managers insert" on public.tenants for insert to authenticated
  with check (private.is_admin() or private.can_manage_property(property_id));
create policy "tenants: managers update, tenant updates own details" on public.tenants for update to authenticated
  using (private.is_admin() or private.can_manage_property(property_id) or id = private.my_tenant_id());
create policy "tenants: admin delete" on public.tenants for delete to authenticated
  using (private.is_admin());

-- ---------------------------------------------------------------- leases & payments
create policy "leases: scoped read" on public.leases for select to authenticated
  using (private.can_see_property(property_id) or tenant_id = private.my_tenant_id());
create policy "leases: managers insert" on public.leases for insert to authenticated
  with check (private.can_manage_property(property_id));
create policy "leases: managers update, tenant sets intent" on public.leases for update to authenticated
  using (private.can_manage_property(property_id) or tenant_id = private.my_tenant_id());
create policy "leases: admin delete" on public.leases for delete to authenticated
  using (private.is_admin());

create policy "payments: scoped read" on public.payments for select to authenticated
  using (
    tenant_id = private.my_tenant_id()
    or private.my_role() in ('super_admin', 'accountant')
    or exists (select 1 from public.tenants t where t.id = tenant_id and private.can_see_property(t.property_id))
  );
create policy "payments: managers write" on public.payments for all to authenticated
  using (private.is_admin() or exists (select 1 from public.tenants t where t.id = tenant_id and private.can_manage_property(t.property_id)))
  with check (private.is_admin() or exists (select 1 from public.tenants t where t.id = tenant_id and private.can_manage_property(t.property_id)));

create policy "onboarding_drafts: admins and managers" on public.onboarding_drafts for all to authenticated
  using (private.my_role() in ('super_admin', 'manager'))
  with check (private.my_role() in ('super_admin', 'manager'));

-- ---------------------------------------------------------------- maintenance
create policy "vendors: staff read, tenants see vendors on their requests" on public.vendors for select to authenticated
  using (
    private.is_staff()
    or exists (select 1 from public.maintenance_requests r where r.vendor_id = vendors.id and r.tenant_id = private.my_tenant_id())
  );
create policy "vendors: admins and managers write" on public.vendors for all to authenticated
  using (private.my_role() in ('super_admin', 'manager'))
  with check (private.my_role() in ('super_admin', 'manager'));

create policy "requests: scoped read" on public.maintenance_requests for select to authenticated
  using (private.can_see_property(property_id) or tenant_id = private.my_tenant_id());
create policy "requests: tenants report for their unit, managers log any" on public.maintenance_requests for insert to authenticated
  with check (
    private.can_manage_property(property_id)
    or (tenant_id = private.my_tenant_id() and unit_id = private.my_unit_id() and property_id = private.my_property_id() and status = 'new')
  );
create policy "requests: managers, caretakers and the reporting tenant update" on public.maintenance_requests for update to authenticated
  using (
    private.can_manage_property(property_id)
    or (private.my_role() = 'caretaker' and private.can_see_property(property_id))
    or tenant_id = private.my_tenant_id()
  );
create policy "requests: admin delete" on public.maintenance_requests for delete to authenticated
  using (private.is_admin());

-- The subquery runs under the requests policies, so "can see the request" is inherited.
create policy "request_events: visible with the request, internal notes staff-only" on public.request_events for select to authenticated
  using (
    exists (select 1 from public.maintenance_requests r where r.id = request_id)
    and (not internal or private.is_staff())
  );
create policy "request_events: add to a visible request" on public.request_events for insert to authenticated
  with check (
    exists (select 1 from public.maintenance_requests r where r.id = request_id)
    and (private.is_staff() or not internal)
    and private.my_role() is distinct from 'accountant'
  );

-- ---------------------------------------------------------------- communications & records
create policy "announcements: staff read all, tenants read sent ones for them" on public.announcements for select to authenticated
  using (
    private.is_staff()
    or (status = 'sent' and (property_id is null or property_id = private.my_property_id()))
  );
create policy "announcements: admins and managers write" on public.announcements for all to authenticated
  using (private.my_role() in ('super_admin', 'manager'))
  with check (private.my_role() in ('super_admin', 'manager'));

create policy "documents: scoped read" on public.documents for select to authenticated
  using (
    tenant_id = private.my_tenant_id()
    or private.my_role() in ('super_admin', 'accountant')
    or private.can_see_property(property_id)
    or exists (select 1 from public.tenants t where t.id = tenant_id and private.can_see_property(t.property_id))
  );
create policy "documents: managers add, tenants add their own" on public.documents for insert to authenticated
  with check (
    private.is_admin()
    or private.can_manage_property(property_id)
    or exists (select 1 from public.tenants t where t.id = tenant_id and private.can_manage_property(t.property_id))
    or (tenant_id = private.my_tenant_id() and (select self_docs from public.org_settings))
  );
create policy "documents: managers update and delete" on public.documents for update to authenticated
  using (private.is_admin() or private.can_manage_property(property_id)
         or exists (select 1 from public.tenants t where t.id = tenant_id and private.can_manage_property(t.property_id)));
create policy "documents: managers delete" on public.documents for delete to authenticated
  using (private.is_admin() or private.can_manage_property(property_id)
         or exists (select 1 from public.tenants t where t.id = tenant_id and private.can_manage_property(t.property_id)));

create policy "notifications: staff feed or my tenant feed" on public.notifications for select to authenticated
  using ((audience = 'staff' and private.is_staff()) or audience = private.my_tenant_id());
create policy "notifications: post to staff or to a tenant I can see" on public.notifications for insert to authenticated
  with check (
    audience = 'staff'
    or audience = private.my_tenant_id()
    or (private.is_staff() and exists (select 1 from public.tenants t where t.id = audience))
  );
create policy "notifications: mark my feed read" on public.notifications for update to authenticated
  using ((audience = 'staff' and private.is_staff()) or audience = private.my_tenant_id());

create policy "activity_logs: admin reads" on public.activity_logs for select to authenticated
  using (private.is_admin());
create policy "activity_logs: staff append as themselves" on public.activity_logs for insert to authenticated
  with check (private.is_staff() and actor_id = auth.uid());

create policy "org_settings: everyone signed in reads" on public.org_settings for select to authenticated
  using (true);
create policy "org_settings: admin updates" on public.org_settings for update to authenticated
  using (private.is_admin());

-- ---------------------------------------------------------------- file storage
-- documents bucket:         properties/<propertyId>/<file>   or   tenants/<tenantId>/<file>
-- maintenance-photos bucket: <requestId>/<file>
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 20971520),
       ('maintenance-photos', 'maintenance-photos', false, 10485760)
on conflict (id) do nothing;

create policy "documents bucket: read" on storage.objects for select to authenticated
  using (
    bucket_id = 'documents' and (
      ((storage.foldername(name))[1] = 'properties' and private.can_see_property((storage.foldername(name))[2]))
      or ((storage.foldername(name))[1] = 'tenants' and exists (select 1 from public.tenants t where t.id = (storage.foldername(name))[2]))
    )
  );
create policy "documents bucket: upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents' and (
      ((storage.foldername(name))[1] = 'properties' and private.can_manage_property((storage.foldername(name))[2]))
      or ((storage.foldername(name))[1] = 'tenants' and (
            (storage.foldername(name))[2] = private.my_tenant_id()
            or exists (select 1 from public.tenants t where t.id = (storage.foldername(name))[2] and (private.is_admin() or private.can_manage_property(t.property_id)))
         ))
    )
  );
create policy "documents bucket: managers delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents' and (
      ((storage.foldername(name))[1] = 'properties' and private.can_manage_property((storage.foldername(name))[2]))
      or ((storage.foldername(name))[1] = 'tenants' and exists (
            select 1 from public.tenants t where t.id = (storage.foldername(name))[2] and (private.is_admin() or private.can_manage_property(t.property_id))))
    )
  );

create policy "maintenance photos: read with the request" on storage.objects for select to authenticated
  using (bucket_id = 'maintenance-photos'
         and exists (select 1 from public.maintenance_requests r where r.id = (storage.foldername(name))[1]));
create policy "maintenance photos: upload to a visible request" on storage.objects for insert to authenticated
  with check (bucket_id = 'maintenance-photos'
              and private.my_role() is distinct from 'accountant'
              and exists (select 1 from public.maintenance_requests r where r.id = (storage.foldername(name))[1]));

-- ---------------------------------------------------------------- realtime feeds (respect RLS)
alter publication supabase_realtime add table public.notifications, public.maintenance_requests, public.request_events;
