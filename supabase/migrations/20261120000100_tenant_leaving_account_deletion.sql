-- Let a Super Admin or the assigned property manager delete a tenant's login either when the
-- tenancy has ended or when the tenant asks to leave early. Leaving early must be confirmed with
-- p_end_tenancy = true: the open leases are terminated, the unit is vacated and the tenant becomes
-- a former tenant before the login is removed. Tenancy records are always kept.
drop function if exists public.delete_tenant_account(text);

create function public.delete_tenant_account(p_tenant_id text, p_end_tenancy boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.tenants;
  account_id uuid;
  still_active boolean;
begin
  select * into t from public.tenants where id = p_tenant_id for update;
  if t.id is null or not coalesce(private.can_manage_property(t.property_id), false) then
    raise exception 'Only a Super Admin or the assigned property manager can delete this tenant account';
  end if;
  select id into account_id from public.profiles where tenant_id = t.id and role = 'tenant' for update;
  if account_id is null then raise exception 'This tenant has no login account'; end if;

  -- Include future renewals: an expired older lease alone is not enough.
  still_active := exists (select 1 from public.leases where tenant_id = t.id and not terminated and end_date >= current_date)
    or (not exists (select 1 from public.leases where tenant_id = t.id)
        and t.status not in ('former', 'deactivated'));

  if still_active then
    if not coalesce(p_end_tenancy, false) then
      raise exception 'The tenancy must have ended before deleting the account. If the tenant is leaving early, confirm ending the tenancy';
    end if;
    update public.leases set terminated = true where tenant_id = t.id and not terminated;
    if t.unit_id is not null then
      update public.units set status = 'vacant', vacant_since = current_date, vacant_note = 'Listed'
        where id = t.unit_id;
    end if;
    update public.tenants set status = 'former', unit_id = null where id = t.id;
    insert into public.activity_logs (action, record, area)
      values ('Ended tenancy (tenant leaving)', t.name, 'Tenants');
  end if;

  insert into public.activity_logs (action, record, area)
    values ('Deleted tenant account', t.name, 'Tenants');
  -- Clear identity for cascade update guards, as in delete_my_account().
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  delete from auth.users where id = account_id;
end $$;

revoke execute on function public.delete_tenant_account(text, boolean) from public, anon;
grant execute on function public.delete_tenant_account(text, boolean) to authenticated;
