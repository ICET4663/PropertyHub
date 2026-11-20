-- Remove an ended tenant's login while retaining the organisation's tenancy records.
create function public.delete_tenant_account(p_tenant_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.tenants;
  account_id uuid;
begin
  select * into t from public.tenants where id = p_tenant_id for update;
  if t.id is null or not coalesce(private.can_manage_property(t.property_id), false) then
    raise exception 'Only a Super Admin or the assigned property manager can delete this tenant account';
  end if;
  -- Include future renewals: an expired older lease alone is not enough.
  if exists (select 1 from public.leases where tenant_id = t.id and not terminated and end_date >= current_date)
     or (not exists (select 1 from public.leases where tenant_id = t.id)
         and t.status not in ('former', 'deactivated')) then
    raise exception 'The tenancy must have ended before deleting the account';
  end if;
  select id into account_id from public.profiles where tenant_id = t.id and role = 'tenant' for update;
  if account_id is null then raise exception 'This tenant has no login account'; end if;

  insert into public.activity_logs (action, record, area)
    values ('Deleted tenant account', t.name, 'Tenants');
  -- Clear identity for cascade update guards, as in delete_my_account().
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  delete from auth.users where id = account_id;
end $$;

revoke execute on function public.delete_tenant_account(text) from public, anon;
grant execute on function public.delete_tenant_account(text) to authenticated;
