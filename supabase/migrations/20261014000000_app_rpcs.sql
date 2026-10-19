-- Server functions the app calls with supabase.rpc().

-- ---------------------------------------------------------------- record codes
-- Next MR- / LS- / TN- code from the shared sequences. The app shows these codes, so they have to
-- come from the server: each user only sees part of the data and could not pick a free number itself.
create function public.next_code(kind text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if private.my_role() is null then
    raise exception 'Sign in first';
  end if;
  if kind = 'request' then
    return 'MR-' || nextval('public.request_code_seq');
  end if;
  if private.my_role() not in ('super_admin', 'manager') then
    raise exception 'Only managers can create % records', kind;
  end if;
  if kind = 'lease' then
    return 'LS-' || lpad(nextval('public.lease_code_seq')::text, 4, '0');
  elsif kind = 'tenant' then
    return 'TN-' || lpad(nextval('public.tenant_code_seq')::text, 5, '0');
  end if;
  raise exception 'Unknown code kind %', kind;
end $$;

-- ---------------------------------------------------------------- tenant self sign-up
-- Lets register_tenant() link a profile to its tenancy. Everyone else still goes through the guard.
create or replace function private.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not private.is_admin()
     and coalesce(current_setting('app.linking_tenant', true), '') <> 'on'
     and not private.only_columns_changed(to_jsonb(old), to_jsonb(new), array['name', 'phone', 'two_step', 'last_active']) then
    raise exception 'You can only change your name, phone, two-step setting and activity time';
  end if;
  return new;
end $$;

-- Links a verified tenant account to a tenancy. The app calls it on every tenant sign-in until it
-- returns an id. It uses the name, phone and invite code given at sign-up (auth user metadata).
--   1. Staff already added a tenant with this (verified) email → link to that record.
--   2. Otherwise create a pending tenant, matched to a unit by invite code (PALM-A4-7Q2), and tell staff.
create function public.register_tenant() returns text
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  meta jsonb;
  hit text[];
  u public.units;
  t_id text;
  t_name text;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.role <> 'tenant' then
    return null;
  end if;
  if me.tenant_id is not null then
    return me.tenant_id;
  end if;

  select raw_user_meta_data into meta from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if meta is null then
    raise exception 'Verify your email address first';
  end if;
  t_name := coalesce(nullif(trim(meta ->> 'name'), ''), nullif(me.name, ''), me.email);

  select t.id into t_id from public.tenants t
   where lower(t.email) = lower(me.email)
     and not exists (select 1 from public.profiles p where p.tenant_id = t.id)
   order by t.joined_at desc
   limit 1;

  if t_id is null then
    hit := regexp_match(upper(coalesce(meta ->> 'invite', '')), '^([A-Z]+)-([A-Z][0-9]+)');
    if hit is not null then
      select un.* into u from public.units un join public.properties p on p.id = un.property_id
       where upper(regexp_replace(p.short, '[^A-Za-z]', '', 'g')) like hit[1] || '%' and un.code = hit[2]
       limit 1;
    end if;

    insert into public.tenants (name, email, phone, unit_id, property_id, status, onboarding, self_signup, identification)
    values (t_name, me.email, coalesce(nullif(meta ->> 'phone', ''), me.phone), u.id, u.property_id, 'pending', 'pending', true,
            '{"type": "National ID (NIN slip)", "number": "", "verified": false}')
    returning id into t_id;

    insert into public.notifications (audience, category, title, body, meta, tone, link)
    values ('staff', 'Tenants', 'New tenant sign-up',
            t_name || ' registered'
              || coalesce(' for ' || (select short from public.properties where id = u.property_id) || ' ' || u.code, '')
              || ' and is awaiting approval.',
            'Tenants · Self sign-up', 'purple',
            jsonb_build_object('name', 'tenant', 'params', jsonb_build_object('id', t_id)));
  end if;

  perform set_config('app.linking_tenant', 'on', true);
  update public.profiles set tenant_id = t_id where id = auth.uid();
  perform set_config('app.linking_tenant', 'off', true);
  return t_id;
end $$;

-- Functions in public are callable by anyone by default; only signed-in users need these.
revoke execute on function public.next_code(text) from public, anon;
revoke execute on function public.register_tenant() from public, anon;
grant execute on function public.next_code(text) to authenticated;
grant execute on function public.register_tenant() to authenticated;
