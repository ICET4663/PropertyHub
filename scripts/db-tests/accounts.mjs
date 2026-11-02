// In-app account deletion (stage 14): delete_my_account() removes the caller's sign-in, keeps the
// organisation's tenancy records and request history, tells staff, and never removes the last super admin.
// Run by scripts/test-db.mjs.
import assert from 'node:assert/strict';

const U = {
  admin: 'b0000000-0000-4000-8000-000000000001',
  admin2: 'b0000000-0000-4000-8000-000000000002',
  m1: 'b0000000-0000-4000-8000-000000000003',
  c1: 'b0000000-0000-4000-8000-000000000004',
  ta: 'b0000000-0000-4000-8000-000000000005', // tenant with a lease
  tp: 'b0000000-0000-4000-8000-000000000006', // pending self sign-up, no lease
  fresh: 'b0000000-0000-4000-8000-000000000007', // sign-up with no tenancy yet
};

export default async function ({ db, q, as, test, expectError }) {
  const users = Object.entries(U).map(([k, id]) => `('${id}', '${k}@acct.test')`).join(', ');
  await q(`insert into auth.users (id, email) values ${users}`);
  await db.exec(`
    select set_config('request.jwt.claims', '', false);
    update public.profiles set role = 'super_admin' where id = '${U.admin}';
    update public.profiles set role = 'manager' where id = '${U.m1}';
    update public.profiles set role = 'caretaker', name = 'Kunle Caretaker' where id = '${U.c1}';
    insert into public.locations (id, name) values ('xL', 'Lekki');
    insert into public.properties (id, name, short, type, location_id) values ('xP1', 'Acct One', 'AcctA', 'Block of flats', 'xL');
    insert into public.profile_properties (profile_id, property_id) values ('${U.m1}', 'xP1'), ('${U.c1}', 'xP1');
    insert into public.blocks (id, property_id, name) values ('xB1', 'xP1', 'A');
    insert into public.units (id, property_id, block_id, code, type) values ('xU1', 'xP1', 'xB1', 'A1', 'Studio'), ('xU2', 'xP1', 'xB1', 'A2', 'Studio');
    insert into public.tenants (id, name, property_id, unit_id, status, self_signup) values
      ('xTA', 'Ada Lease', 'xP1', 'xU1', 'active', false), ('xTP', 'Pat Pending', 'xP1', 'xU2', 'pending', true);
    update public.profiles set tenant_id = 'xTA' where id = '${U.ta}';
    update public.profiles set tenant_id = 'xTP' where id = '${U.tp}';
    insert into public.leases (id, tenant_id, unit_id, property_id, start_date, end_date, rent) values
      ('xLA', 'xTA', 'xU1', 'xP1', current_date - 30, current_date + 300, 1000000);
    insert into public.payments (id, tenant_id, lease_id, label, amount, date, status) values
      ('xPA', 'xTA', 'xLA', 'Rent', 1000000, current_date, 'paid');
    insert into public.maintenance_requests (id, tenant_id, unit_id, property_id, category, title, status, caretaker_id) values
      ('xR1', 'xTA', 'xU1', 'xP1', 'Plumbing', 'Leak', 'assigned', '${U.c1}');
    insert into public.push_tokens (token, user_id, platform) values
      ('ExponentPushToken[xta]', '${U.ta}', 'android'), ('ExponentPushToken[xc1]', '${U.c1}', 'ios');
  `);
  // History written by the people who will delete their accounts.
  await as(U.ta, 'authenticated', `insert into public.notifications (id, audience, category, title) values ('xNS', 'staff', 'Maintenance', 'Water is still leaking')`);
  await as(U.c1, 'authenticated', `insert into public.request_events (request_id, kind, text) values ('xR1', 'comment', 'On my way')`);

  const del = (who) => as(U[who], 'authenticated', `select public.delete_my_account()`);
  const exists = async (sql) => (await q(sql)).rows.length > 0;
  const staffNotice = async (title) => (await q(`select body, link from public.notifications where audience = 'staff' and title = $1 order by at desc limit 1`, [title])).rows[0];

  await test('signed-out callers cannot delete accounts', async () => {
    await expectError(as(null, 'anon', `select public.delete_my_account()`), /permission denied/);
  });

  await test('the last active super admin cannot delete their account', async () => {
    await expectError(del('admin'), /only administrator/);
    assert.ok(await exists(`select 1 from auth.users where id = '${U.admin}'`));
  });

  await test('a super admin can delete their account once another admin exists', async () => {
    await q(`update public.profiles set role = 'super_admin' where id = '${U.admin2}'`);
    await del('admin');
    assert.ok(!(await exists(`select 1 from auth.users where id = '${U.admin}'`)));
    assert.ok(!(await exists(`select 1 from public.profiles where id = '${U.admin}'`)));
  });

  await test('a tenant deleting their account loses the sign-in but the tenancy records stay', async () => {
    await del('ta');
    assert.ok(!(await exists(`select 1 from auth.users where id = '${U.ta}'`)));
    assert.ok(!(await exists(`select 1 from public.profiles where id = '${U.ta}'`)));
    assert.ok(!(await exists(`select 1 from public.push_tokens where user_id = '${U.ta}'`)), 'push token removed');
    for (const [table, id] of [['tenants', 'xTA'], ['leases', 'xLA'], ['payments', 'xPA'], ['maintenance_requests', 'xR1']]) {
      assert.ok(await exists(`select 1 from public.${table} where id = '${id}'`), `${table} kept`);
    }
    // Their post stays, without the link to the deleted account.
    assert.deepEqual((await q(`select posted_by from public.notifications where id = 'xNS'`)).rows, [{ posted_by: null }]);
    const n = await staffNotice('Tenant deleted their account');
    assert.match(n.body, /^Ada Lease deleted their PropertyHub account/);
    assert.doesNotMatch(n.body, /no lease/);
    assert.deepEqual(n.link, { name: 'tenant', params: { id: 'xTA' } });
  });

  await test('a deleted account’s old session reads nothing', async () => {
    const r = await as(U.ta, 'authenticated', `select id from public.tenants where id like 'x%' union all select id from public.leases where id like 'x%' union all select id from public.payments where id like 'x%'`);
    assert.equal(r.rows.length, 0);
  });

  await test('staff are told a pending sign-up with no lease can be removed', async () => {
    await del('tp');
    assert.ok(await exists(`select 1 from public.tenants where id = 'xTP'`));
    assert.match((await staffNotice('Tenant deleted their account')).body, /^Pat Pending .*no lease, so you can delete the tenant record/);
  });

  await test('a caretaker deleting their account leaves their jobs and history for the managers', async () => {
    await del('c1');
    assert.ok(!(await exists(`select 1 from public.profile_properties where profile_id = '${U.c1}'`)));
    assert.ok(!(await exists(`select 1 from public.push_tokens where user_id = '${U.c1}'`)));
    assert.deepEqual((await q(`select status, caretaker_id from public.maintenance_requests where id = 'xR1'`)).rows, [{ status: 'assigned', caretaker_id: null }]);
    assert.deepEqual((await q(`select actor_id, by_name from public.request_events where request_id = 'xR1' and text = 'On my way'`)).rows.map((r) => r.actor_id), [null]);
    const n = await staffNotice('Team member deleted their account');
    assert.equal(n.body, 'Kunle Caretaker deleted their PropertyHub account. 1 open job is now without a caretaker.');
  });

  await test('a sign-up with no tenancy can delete their account without notifying staff', async () => {
    const before = Number((await q(`select count(*) as n from public.notifications`)).rows[0].n);
    await del('fresh');
    assert.ok(!(await exists(`select 1 from auth.users where id = '${U.fresh}'`)));
    assert.equal(Number((await q(`select count(*) as n from public.notifications`)).rows[0].n), before);
  });

  await test('each deletion is in the activity log', async () => {
    const r = await q(`select record from public.activity_logs where action = 'Deleted own account' and area = 'Users'`);
    assert.equal(r.rows.length, 5);
  });
}
