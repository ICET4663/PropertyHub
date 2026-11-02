-- Maintenance requests become a server-enforced workflow.
-- Run after 20261020000100_request_statuses.sql.
--
--   new ──assign──▶ assigned ──start──▶ in_progress ──complete──▶ resolved ──tenant confirms──▶ closed
--    │                                       ▲                       │
--    └─▶ cancelled (tenant or manager)       └──manager──── disputed ◀┘ tenant disputes (reason required)
--
-- Who may do what:
--   create            tenant (own unit, if self-reporting is on), manager/admin, caretaker on their properties
--   assign            manager/admin of the property: a vendor and/or a caretaker, plus a visit window
--   start / complete  the assigned caretaker (or any of the property's caretakers if none is assigned), manager/admin;
--                     a caretaker must upload a completion photo (maintenance-photos/<id>/completion/...) first
--   confirm/dispute   the reporting tenant; a manager may close a resolved request with a written reason
--   reopen disputed   manager/admin
--   cancel            the reporting tenant or a manager, while the request is still new
-- Nothing closes on a timer.
--
-- Every change goes through the functions below. They write the request_events history with the
-- actor's id and the server time, and post the notifications. Direct inserts and status changes are rejected.

-- ---------------------------------------------------------------- columns
alter table public.maintenance_requests
  add column if not exists caretaker_id uuid references public.profiles (id) on delete set null,
  add column if not exists client_key uuid unique,          -- idempotency key from the submitting device
  add column if not exists dispute_reason text;

alter table public.request_events
  add column if not exists actor_id uuid default auth.uid() references public.profiles (id) on delete set null;

create index if not exists maintenance_requests_caretaker_idx on public.maintenance_requests (caretaker_id);

-- ---------------------------------------------------------------- guards
-- Workflow functions set this for the length of their transaction.
create function private.in_request_workflow() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.request_workflow', true), '') = 'on'
$$;

create or replace function private.guard_request_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not private.in_request_workflow() then
    raise exception 'Create requests with create_request()';
  end if;
  return new;
end $$;
drop trigger if exists maintenance_requests_insert_guard on public.maintenance_requests;
create trigger maintenance_requests_insert_guard before insert on public.maintenance_requests
  for each row execute function private.guard_request_insert();

-- Replaces the earlier per-role update guard.
--   Workflow fields (status, rating, resolved_at, dispute_reason, client_key) change only through the functions.
--   Tenants and caretakers may only touch updated_at directly (it moves when they comment).
--   Managers keep direct edits of the other fields (priority, estimate, cost, vendor, visit...).
create or replace function private.guard_request_tenant_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or private.in_request_workflow() then
    return new;
  end if;
  if not private.only_columns_changed(to_jsonb(old), to_jsonb(new),
       array['tenant_id', 'unit_id', 'property_id', 'category', 'title', 'description', 'room', 'priority', 'vendor_id', 'caretaker_id',
             'visit', 'updated_at', 'photos', 'access', 'caretaker_access', 'estimate', 'cost', 'created_at']) then
    raise exception 'Change a request’s status with request_transition()';
  end if;
  if private.my_role() in ('tenant', 'caretaker')
     and not private.only_columns_changed(to_jsonb(old), to_jsonb(new), array['updated_at']) then
    raise exception 'Use the request actions to update this request';
  end if;
  return new;
end $$;

-- History entries: the server sets who and when. Workflow entries (created, status, vendor) can't be forged.
create or replace function private.stamp_request_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new; -- seed / service scripts
  end if;
  new.actor_id := auth.uid();
  new.at := now();
  if new.kind in ('created', 'status', 'vendor') and not private.in_request_workflow() then
    raise exception 'Workflow history is written by the server';
  end if;
  return new;
end $$;
drop trigger if exists request_events_stamp on public.request_events;
create trigger request_events_stamp before insert on public.request_events
  for each row execute function private.stamp_request_event();

-- ---------------------------------------------------------------- helpers
create function private.my_name() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(name, ''), email) from public.profiles where id = auth.uid()
$$;

create function private.request_event(p_request text, p_kind text, p_text text, p_shared boolean, p_internal boolean default false, p_by text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.request_events (request_id, kind, text, by_name, shared, internal, actor_id, at)
  values (p_request, p_kind, p_text, coalesce(p_by, private.my_name(), 'System'), p_shared, p_internal, auth.uid(), now());
end $$;

create function private.notify(p_audience text, p_category text, p_title text, p_body text, p_meta text, p_tone text, p_link jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (audience, category, title, body, meta, tone, link)
  values (p_audience, p_category, p_title, p_body, p_meta, p_tone, p_link);
end $$;

-- ---------------------------------------------------------------- create
-- p: { client_key, tenant_id, category, title, description, room, priority, access, caretaker_access, photos }
-- Calling again with the same client_key returns the first request's id instead of creating another.
create function public.create_request(p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  k uuid := nullif(p ->> 'client_key', '')::uuid;
  existing text;
  t public.tenants;
  u public.units;
  prop public.properties;
  v_role public.app_role := private.my_role();
  new_id text;
  n_photos int := greatest(0, least(coalesce((p ->> 'photos')::int, 0), 5));
  pr public.priority := coalesce(nullif(p ->> 'priority', ''), 'medium')::public.priority;
  ttl text := trim(coalesce(p ->> 'title', ''));
  cat text := coalesce(p ->> 'category', '');
begin
  if v_role is null then raise exception 'Sign in first'; end if;
  if k is null then raise exception 'Missing client_key'; end if;
  select id into existing from public.maintenance_requests where client_key = k;
  if existing is not null then return existing; end if;

  select * into t from public.tenants where id = p ->> 'tenant_id';
  if t.id is null or t.unit_id is null then raise exception 'This tenant has no flat to report for'; end if;
  select * into u from public.units where id = t.unit_id;
  select * into prop from public.properties where id = u.property_id;

  if v_role = 'tenant' then
    if t.id is distinct from private.my_tenant_id() then raise exception 'You can only report issues for your own home'; end if;
    if t.status <> 'active' then raise exception 'Your tenancy must be approved before you can report issues'; end if;
    if not coalesce((select self_report from public.org_settings), true) then raise exception 'Reporting from the portal is switched off. Contact your manager.'; end if;
  elsif v_role = 'caretaker' then
    if not private.can_see_property(u.property_id) then raise exception 'You can only log requests for your properties'; end if;
  elsif not private.can_manage_property(u.property_id) then
    raise exception 'You can only log requests for your properties';
  end if;

  if ttl = '' then raise exception 'Give the request a short title'; end if;
  if cat not in ('Plumbing', 'Electrical', 'Air conditioning', 'Generator', 'Water supply', 'Building repairs', 'Security', 'Cleaning', 'Pests', 'Other') then
    raise exception 'Unknown category %', cat;
  end if;

  perform set_config('app.request_workflow', 'on', true);
  new_id := 'MR-' || nextval('public.request_code_seq');
  begin
    insert into public.maintenance_requests (id, tenant_id, unit_id, property_id, category, title, description, room, priority, status, photos, access, caretaker_access, client_key)
    values (new_id, t.id, u.id, u.property_id, cat, left(ttl, 120), left(coalesce(nullif(trim(p ->> 'description'), ''), ttl), 4000),
            left(coalesce(p ->> 'room', ''), 60), pr, 'new', n_photos, left(coalesce(p ->> 'access', ''), 300), coalesce((p ->> 'caretaker_access')::boolean, false), k);
  exception when unique_violation then
    -- the same submission arrived twice at once
    perform set_config('app.request_workflow', 'off', true);
    return (select id from public.maintenance_requests where client_key = k);
  end;
  perform private.request_event(new_id, 'created', 'Request submitted by ' || t.name, true, false,
    (case when v_role = 'tenant' then 'Tenant portal' else 'Logged by ' || private.my_name() end)
      || ' · ' || n_photos || ' photo' || case when n_photos = 1 then '' else 's' end || ' attached');
  perform private.notify('staff', 'Maintenance', case when pr = 'urgent' then 'Urgent request' else 'New maintenance request' end,
    new_id || ': ' || lower(ttl) || ' at ' || prop.short || ' ' || u.code || '.', 'Maintenance · ' || cat,
    case when pr = 'urgent' then 'danger' else 'info' end, jsonb_build_object('name', 'request', 'params', jsonb_build_object('id', new_id)));
  perform set_config('app.request_workflow', 'off', true);
  return new_id;
end $$;

-- ---------------------------------------------------------------- assign
-- A vendor, a caretaker, or both, and a visit window { date: 'YYYY-MM-DD', window: '2pm – 5pm' }.
create function public.assign_request(p_id text, p_vendor_id text, p_caretaker_id uuid, p_visit jsonb, p_note text default null, p_tell_tenant boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.maintenance_requests;
  v public.vendors;
  ct public.profiles;
  who text;
  visit_text text := '';
begin
  select * into r from public.maintenance_requests where id = p_id for update;
  if r.id is null then raise exception 'Request not found'; end if;
  if not private.can_manage_property(r.property_id) then raise exception 'Only the property’s manager can assign this request'; end if;
  if r.status not in ('new', 'assigned', 'in_progress', 'disputed') then
    raise exception 'A % request can’t be reassigned', replace(r.status::text, '_', ' ');
  end if;
  if p_vendor_id is null and p_caretaker_id is null then raise exception 'Choose a vendor or a caretaker'; end if;
  if p_vendor_id is not null then
    select * into v from public.vendors where id = p_vendor_id and status = 'active';
    if v.id is null then raise exception 'That vendor isn’t active'; end if;
  end if;
  if p_caretaker_id is not null then
    select * into ct from public.profiles where id = p_caretaker_id and role = 'caretaker' and status = 'active';
    if ct.id is null or not exists (select 1 from public.profile_properties where profile_id = ct.id and property_id = r.property_id) then
      raise exception 'That caretaker doesn’t look after this property';
    end if;
  end if;
  if p_visit is not null and p_visit ->> 'date' is not null then
    visit_text := ' · visit ' || to_char((p_visit ->> 'date')::date, 'FMDD Mon YYYY') || coalesce(', ' || nullif(p_visit ->> 'window', ''), '');
  end if;
  who := concat_ws(' and ', v.name, ct.name);

  perform set_config('app.request_workflow', 'on', true);
  update public.maintenance_requests
     set vendor_id = p_vendor_id, caretaker_id = p_caretaker_id, visit = p_visit,
         status = case when status = 'new' then 'assigned'::public.request_status else status end
   where id = p_id;
  perform private.request_event(p_id, 'vendor', who || ' assigned' || visit_text, coalesce(p_tell_tenant, true));
  if nullif(trim(coalesce(p_note, '')), '') is not null then
    perform private.request_event(p_id, 'comment', trim(p_note), false, true);
  end if;
  if coalesce(p_tell_tenant, true) then
    perform private.notify(r.tenant_id, 'My requests',
      who || case when visit_text = '' then ' will handle your request.' else ' is booked for ' || substr(visit_text, 10) || '.' end,
      'They will fix: ' || lower(r.title) || '.', 'My requests', 'warning', jsonb_build_object('name', 'myRequests'));
  end if;
  if ct.id is not null then
    perform private.notify('staff', 'Maintenance', 'Job assigned to ' || ct.name, p_id || ': ' || lower(r.title) || visit_text || '.',
      'Maintenance · Caretaker', 'info', jsonb_build_object('name', 'request', 'params', jsonb_build_object('id', p_id)));
  end if;
  perform set_config('app.request_workflow', 'off', true);
end $$;

-- ---------------------------------------------------------------- status changes
create function public.request_transition(p_id text, p_to text, p_note text default null, p_rating int default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.maintenance_requests;
  t public.tenants;
  place text;
  v_role public.app_role := private.my_role();
  is_mgr boolean;
  is_ct boolean;
  is_tenant boolean;
  note text := nullif(trim(coalesce(p_note, '')), '');
  ok boolean := false;
  ev text;
  link_staff jsonb := jsonb_build_object('name', 'request', 'params', jsonb_build_object('id', p_id));
  link_tenant jsonb := jsonb_build_object('name', 'myRequests', 'params', jsonb_build_object('id', p_id));
begin
  if v_role is null then raise exception 'Sign in first'; end if;
  select * into r from public.maintenance_requests where id = p_id for update;
  if r.id is null then raise exception 'Request not found'; end if;
  select * into t from public.tenants where id = r.tenant_id;
  place := coalesce((select short from public.properties where id = r.property_id), '') || ' ' || coalesce((select code from public.units where id = r.unit_id), '');
  is_mgr := private.can_manage_property(r.property_id);
  is_ct := v_role = 'caretaker' and private.can_see_property(r.property_id) and (r.caretaker_id is null or r.caretaker_id = auth.uid());
  is_tenant := v_role = 'tenant' and r.tenant_id = private.my_tenant_id();

  ok := case
    when r.status = 'new' and p_to = 'cancelled' then is_tenant or is_mgr
    when r.status = 'assigned' and p_to = 'in_progress' then is_mgr or is_ct
    when r.status = 'in_progress' and p_to = 'resolved' then is_mgr or is_ct
    when r.status = 'resolved' and p_to = 'closed' then is_tenant or is_mgr
    when r.status = 'resolved' and p_to = 'disputed' then is_tenant
    when r.status = 'disputed' and p_to = 'in_progress' then is_mgr
    else false
  end;
  if not ok then
    raise exception 'You can’t move % from % to %', p_id, replace(r.status::text, '_', ' '), replace(p_to, '_', ' ');
  end if;

  if p_to = 'disputed' and note is null then raise exception 'Tell us what’s still wrong'; end if;
  if p_to = 'closed' and not is_tenant and note is null then raise exception 'Give a reason for closing without the tenant’s confirmation'; end if;
  if p_to = 'cancelled' and not is_tenant and note is null then raise exception 'Give a reason for cancelling'; end if;
  if p_rating is not null and (p_rating < 1 or p_rating > 5 or not (p_to = 'closed' and is_tenant)) then raise exception 'Only the tenant can rate, from 1 to 5'; end if;
  if p_to = 'resolved' and v_role = 'caretaker' and not exists (
       select 1 from storage.objects o where o.bucket_id = 'maintenance-photos' and o.name like p_id || '/completion/%') then
    raise exception 'Add a photo of the finished work first';
  end if;

  perform set_config('app.request_workflow', 'on', true);
  update public.maintenance_requests
     set status = p_to::public.request_status,
         resolved_at = case when p_to = 'resolved' then now() when p_to = 'in_progress' then null else resolved_at end,
         cost = case when p_to = 'resolved' then coalesce(cost, estimate) else cost end,
         rating = case when p_to = 'closed' and is_tenant then p_rating else rating end,
         dispute_reason = case when p_to = 'disputed' then note else dispute_reason end
   where id = p_id;

  ev := case
    when p_to = 'cancelled' then 'Request cancelled' || coalesce(': ' || note, '')
    when p_to = 'in_progress' and r.status = 'disputed' then 'Reopened after the tenant’s dispute' || coalesce(': ' || note, '')
    when p_to = 'in_progress' then 'Work started'
    when p_to = 'resolved' then 'Marked as fixed' || coalesce(': ' || note, '')
    when p_to = 'closed' and is_tenant then 'Tenant confirmed the fix' || coalesce(' · rated ' || p_rating || '/5', '') || ' — request closed'
    when p_to = 'closed' then 'Closed without tenant confirmation: ' || note
    when p_to = 'disputed' then 'Tenant says it’s still a problem: ' || note
  end;
  perform private.request_event(p_id, 'status', ev, true);

  if p_to = 'resolved' then
    perform private.notify(r.tenant_id, 'My requests', 'Your request was marked as fixed.', r.title || ' (' || p_id || '). Please confirm it’s working, or tell us if it isn’t.', 'My requests', 'success', link_tenant);
  elsif p_to = 'in_progress' and r.status = 'assigned' then
    perform private.notify(r.tenant_id, 'My requests', 'Work has started on your request.', r.title || ' (' || p_id || ').', 'My requests', 'info', link_tenant);
  elsif p_to = 'in_progress' then
    perform private.notify(r.tenant_id, 'My requests', 'We’re looking at your request again.', r.title || ' (' || p_id || ').', 'My requests', 'info', link_tenant);
  elsif p_to = 'closed' and is_tenant then
    perform private.notify('staff', 'Maintenance', 'Tenant confirmed fix', p_id || ': ' || lower(r.title) || ' at ' || place || '.', 'Maintenance', 'success', link_staff);
  elsif p_to = 'closed' then
    perform private.notify(r.tenant_id, 'My requests', 'Your request was closed.', r.title || ' (' || p_id || '): ' || note, 'My requests', 'neutral', link_tenant);
  elsif p_to = 'disputed' then
    perform private.notify('staff', 'Maintenance', 'Tenant disputed a fix', p_id || ' at ' || place || ': ' || note, 'Maintenance · Dispute', 'danger', link_staff);
  elsif p_to = 'cancelled' and is_tenant then
    perform private.notify('staff', 'Maintenance', 'Request cancelled by tenant', p_id || ': ' || lower(r.title) || ' at ' || place || '.', 'Maintenance', 'neutral', link_staff);
  elsif p_to = 'cancelled' then
    perform private.notify(r.tenant_id, 'My requests', 'Your request was cancelled.', r.title || ' (' || p_id || '): ' || note, 'My requests', 'neutral', link_tenant);
  end if;
  perform set_config('app.request_workflow', 'off', true);
end $$;

-- ---------------------------------------------------------------- access
revoke execute on function public.create_request(jsonb) from public, anon;
revoke execute on function public.assign_request(text, text, uuid, jsonb, text, boolean) from public, anon;
revoke execute on function public.request_transition(text, text, text, int) from public, anon;
grant execute on function public.create_request(jsonb) to authenticated;
grant execute on function public.assign_request(text, text, uuid, jsonb, text, boolean) to authenticated;
grant execute on function public.request_transition(text, text, text, int) to authenticated;
grant execute on all functions in schema private to authenticated;
