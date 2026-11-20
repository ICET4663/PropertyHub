import assert from 'node:assert/strict';

export default async function ({ q, as, test, expectError }) {
  const ids = Array.from({ length: 5 }, (_, i) => `d0000000-0000-4000-8000-00000000000${i + 1}`);
  const [admin, manager, outsider, tenant, otherTenant] = ids;
  await q(`insert into auth.users (id, email) values ${ids.map((id, i) => `('${id}', 'delete${i}@test.example')`).join(',')}`);
  await q(`update public.profiles set role = 'super_admin' where id = $1`, [admin]);
  await q(`update public.profiles set role = 'manager' where id in ($1, $2)`, [manager, outsider]);
  await q(`insert into public.locations (id, name) values ('delL', 'Deletion')`);
  await q(`insert into public.properties (id, name, short, type, location_id) values ('delP', 'Deletion', 'DEL', 'Block of flats', 'delL')`);
  await q(`insert into public.tenants (id, name, property_id, status) values ('delT', 'Ended tenant', 'delP', 'former'), ('delT2', 'Other ended tenant', 'delP', 'former')`);
  await q(`insert into public.profile_properties (profile_id, property_id) values ($1, 'delP')`, [manager]);
  await q(`update public.profiles set tenant_id = 'delT' where id = $1`, [tenant]);
  await q(`update public.profiles set tenant_id = 'delT2' where id = $1`, [otherTenant]);
  const del = (who, target = 'delT') => as(who, 'authenticated', `select public.delete_tenant_account($1)`, [target]);
  await test('tenant deletion refuses anonymous callers', async () => {
    await expectError(as(null, 'anon', `select public.delete_tenant_account('delT')`), /permission denied/);
  });
  await test('tenant deletion refuses tenants and managers of other properties', async () => {
    for (const who of [tenant, outsider]) await expectError(del(who), /assigned property manager/);
  });
  await test('tenant deletion refuses an active tenancy without an ended lease', async () => {
    await q(`update public.tenants set status = 'active' where id = 'delT'`);
    await expectError(del(manager), /tenancy must have ended/);
    await q(`update public.tenants set status = 'former' where id = 'delT'`);
  });
  await test('assigned manager deletes ended tenant login and keeps tenant history', async () => {
    await del(manager);
    assert.equal((await q(`select id from auth.users where id = $1`, [tenant])).rows.length, 0);
    assert.equal((await q(`select id from public.tenants where id = 'delT'`)).rows.length, 1);
    assert.equal((await as(tenant, 'authenticated', `select id from public.tenants`)).rows.length, 0);
    await expectError(del(manager), /no login account/);
  });
  await test('expired history cannot bypass a current or future renewal', async () => {
    await q(`insert into public.blocks (id, property_id, name) values ('delB', 'delP', 'A')`);
    await q(`insert into public.units (id, property_id, block_id, code, type) values ('delU', 'delP', 'delB', 'A1', 'Studio')`);
    await q(`insert into public.leases (id, tenant_id, unit_id, property_id, start_date, end_date, rent) values
      ('delOld', 'delT2', 'delU', 'delP', current_date - 30, current_date - 1, 100),
      ('delNew', 'delT2', 'delU', 'delP', current_date, current_date + 30, 100)`);
    await expectError(del(admin, 'delT2'), /tenancy must have ended/);
    await q(`update public.leases set start_date = current_date + 1 where id = 'delNew'`);
    await expectError(del(manager, 'delT2'), /tenancy must have ended/);
    await q(`update public.leases set terminated = true where id = 'delNew'`);
  });
  await test('super admin deletes ended tenant login across properties', async () => {
    await del(admin, 'delT2');
    assert.equal((await q(`select id from auth.users where id = $1`, [otherTenant])).rows.length, 0);
    assert.equal((await q(`select id from public.leases where tenant_id = 'delT2'`)).rows.length, 2);
  });
}
