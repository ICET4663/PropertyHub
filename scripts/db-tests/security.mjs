// Row level security across roles (stage 10). Two properties: P1 (manager M1, caretakers C1 and C2,
// tenants A and B) and P2 (manager M2, tenant Z). Also an accountant, a super admin and a fresh sign-up
// with no tenancy. Every check is written as what must hold; run by scripts/test-db.mjs.
import assert from 'node:assert/strict';

const U = {
  admin: 'a0000000-0000-4000-8000-000000000001',
  m1: 'a0000000-0000-4000-8000-000000000002',
  m2: 'a0000000-0000-4000-8000-000000000003',
  c1: 'a0000000-0000-4000-8000-000000000004',
  c2: 'a0000000-0000-4000-8000-000000000005',
  acct: 'a0000000-0000-4000-8000-000000000006',
  ta: 'a0000000-0000-4000-8000-000000000007',
  tb: 'a0000000-0000-4000-8000-000000000008',
  tz: 'a0000000-0000-4000-8000-000000000009',
  signup: 'a0000000-0000-4000-8000-00000000000a',
};

export default async function ({ db, q, as, test, expectError }) {
  const users = Object.entries(U).map(([k, id]) => `('${id}', '${k}@sec.test')`).join(', ');
  await q(`insert into auth.users (id, email) values ${users}`);
  await db.exec(`
    select set_config('request.jwt.claims', '', false);
    update public.profiles set role = 'super_admin' where id = '${U.admin}';
    update public.profiles set role = 'manager' where id in ('${U.m1}', '${U.m2}');
    update public.profiles set role = 'caretaker' where id in ('${U.c1}', '${U.c2}');
    update public.profiles set role = 'accountant' where id = '${U.acct}';
    insert into public.locations (id, name) values ('sL', 'Ikoyi');
    insert into public.properties (id, name, short, type, location_id) values
      ('sP1', 'Sec One', 'SecA', 'Block of flats', 'sL'), ('sP2', 'Sec Two', 'SecB', 'Estate', 'sL');
    insert into public.profile_properties (profile_id, property_id) values
      ('${U.m1}', 'sP1'), ('${U.c1}', 'sP1'), ('${U.c2}', 'sP1'), ('${U.m2}', 'sP2');
    insert into public.blocks (id, property_id, name) values ('sB1', 'sP1', 'A'), ('sB2', 'sP2', 'A');
    insert into public.units (id, property_id, block_id, code, type) values
      ('sU1', 'sP1', 'sB1', 'A1', 'Studio'), ('sU2', 'sP1', 'sB1', 'A2', 'Studio'), ('sU3', 'sP2', 'sB2', 'A1', 'Studio');
    insert into public.tenants (id, name, property_id, unit_id) values
      ('sTA', 'Tenant A', 'sP1', 'sU1'), ('sTB', 'Tenant B', 'sP1', 'sU2'), ('sTZ', 'Tenant Z', 'sP2', 'sU3');
    update public.profiles set tenant_id = 'sTA' where id = '${U.ta}';
    update public.profiles set tenant_id = 'sTB' where id = '${U.tb}';
    update public.profiles set tenant_id = 'sTZ' where id = '${U.tz}';
    insert into public.leases (id, tenant_id, unit_id, property_id, start_date, end_date, rent) values
      ('sLA', 'sTA', 'sU1', 'sP1', current_date - 30, current_date + 300, 1000000),
      ('sLB', 'sTB', 'sU2', 'sP1', current_date - 30, current_date + 300, 1000000),
      ('sLZ', 'sTZ', 'sU3', 'sP2', current_date - 30, current_date + 300, 1000000);
    insert into public.payments (id, tenant_id, lease_id, label, amount, date, status) values
      ('sPA', 'sTA', 'sLA', 'Rent', 1000000, current_date, 'pending'),
      ('sPB', 'sTB', 'sLB', 'Rent', 1000000, current_date, 'pending'),
      ('sPZ', 'sTZ', 'sLZ', 'Rent', 1000000, current_date, 'pending');
    insert into public.maintenance_requests (id, tenant_id, unit_id, property_id, category, title, status, caretaker_id) values
      ('sR1', 'sTA', 'sU1', 'sP1', 'Plumbing', 'Leak', 'assigned', '${U.c2}'),
      ('sR2', 'sTA', 'sU1', 'sP1', 'Electrical', 'Socket', 'new', null),
      ('sR3', 'sTZ', 'sU3', 'sP2', 'Plumbing', 'Tap', 'new', null);
    insert into public.documents (id, name, kind, folder, tenant_id, property_id, storage_path) values
      ('sDA', 'A id.jpg', 'jpg', 'Tenant ID and KYC', 'sTA', null, 'tenants/sTA/id.jpg'),
      ('sDB', 'B id.jpg', 'jpg', 'Tenant ID and KYC', 'sTB', null, 'tenants/sTB/id.jpg'),
      ('sDP', 'Plan.pdf', 'pdf', 'Property papers', null, 'sP1', 'properties/sP1/plan.pdf');
    insert into storage.objects (bucket_id, name) values
      ('documents', 'tenants/sTA/id.jpg'), ('documents', 'tenants/sTB/id.jpg'), ('documents', 'tenants/sTZ/id.jpg'),
      ('documents', 'properties/sP1/plan.pdf'), ('maintenance-photos', 'sR1/leak.jpg');
    insert into public.onboarding_drafts (id, started_by, allocation, personal, created_by) values
      ('sD1', 'M1', '{"propertyId": "sP1"}', '{"name": "Applicant", "phone": "+234"}', '${U.m1}');
    insert into public.announcements (id, subject, message, audience, property_id, status) values ('sN1', 'Water off', 'Tuesday', 'Sec One', 'sP1', 'sent');
    insert into public.notifications (id, audience, category, title) values ('sNA', 'sTA', 'Rent', 'Payment received.'), ('sNS', 'staff', 'Maintenance', 'Leak reported');
  `);

  const ids = async (who, role, sql) => (await as(U[who] ?? who, role, sql)).rows.map((r) => Object.values(r)[0]);
  const app = (who, sql) => ids(who, 'authenticated', sql);
  const count = async (who, sql) => (await as(U[who], 'authenticated', sql)).rows.length;

  // ---------------------------------------------------------------- tenant A vs tenant B
  await test('tenant A sees only their own tenancy, lease, charges, requests, documents and feed', async () => {
    assert.deepEqual(await app('ta', `select id from public.tenants where id like 's%'`), ['sTA']);
    assert.deepEqual(await app('ta', `select id from public.leases where id like 's%'`), ['sLA']);
    assert.deepEqual(await app('ta', `select id from public.payments where id like 's%'`), ['sPA']);
    assert.deepEqual((await app('ta', `select id from public.maintenance_requests where id like 's%'`)).sort(), ['sR1', 'sR2']);
    assert.deepEqual(await app('ta', `select id from public.documents where id like 's%'`), ['sDA']);
    assert.deepEqual(await app('ta', `select id from public.notifications where id like 's%'`), ['sNA']);
  });
  await test('tenant A cannot open or upload into tenant B’s files', async () => {
    assert.deepEqual(await app('ta', `select name from storage.objects where name like 'tenants/%'`), ['tenants/sTA/id.jpg']);
    await expectError(as(U.ta, 'authenticated', `insert into storage.objects (bucket_id, name) values ('documents', 'tenants/sTB/x.jpg')`), /row-level security/);
  });
  await test('tenant A cannot change tenant B, or their own unit, status, rent or charges', async () => {
    assert.equal(await count('ta', `update public.tenants set phone = '1' where id = 'sTB' returning id`), 0);
    await expectError(as(U.ta, 'authenticated', `update public.tenants set unit_id = 'sU2' where id = 'sTA'`), /only update their contact/);
    await expectError(as(U.ta, 'authenticated', `update public.leases set rent = 1 where id = 'sLA'`), /only tell us/);
    assert.equal(await count('ta', `update public.leases set tenant_intent = 'renew' where id = 'sLA' returning id`), 1);
    assert.equal(await count('ta', `update public.payments set status = 'paid' where id = 'sPA' returning id`), 0);
    await expectError(as(U.ta, 'authenticated', `insert into public.payments (tenant_id, label, amount, date, status) values ('sTA', 'x', 1, current_date, 'paid')`), /row-level security/);
  });

  // ---------------------------------------------------------------- manager outside their properties
  await test('manager M1 sees nothing of property P2', async () => {
    for (const [table, id] of [['tenants', 'sTZ'], ['leases', 'sLZ'], ['payments', 'sPZ'], ['maintenance_requests', 'sR3'], ['units', 'sU3'], ['properties', 'sP2']]) {
      assert.equal(await count('m1', `select 1 from public.${table} where id = '${id}'`), 0, `${table} ${id} visible`);
    }
    assert.equal(await count('m1', `select 1 from storage.objects where name = 'tenants/sTZ/id.jpg'`), 0);
  });
  await test('manager M1 cannot change property P2 or act on its requests', async () => {
    assert.equal(await count('m1', `update public.properties set name = 'x' where id = 'sP2' returning id`), 0);
    assert.equal(await count('m1', `update public.units set rent = 1 where id = 'sU3' returning id`), 0);
    await expectError(as(U.m1, 'authenticated', `insert into public.leases (tenant_id, unit_id, property_id, start_date, end_date, rent) values ('sTZ', 'sU3', 'sP2', current_date, current_date + 1, 1)`), /row-level security/);
    await expectError(as(U.m1, 'authenticated', `insert into public.tenants (name, property_id, unit_id) values ('x', 'sP2', 'sU3')`), /row-level security/);
    await expectError(as(U.m1, 'authenticated', `select public.assign_request('sR3', null, '${U.c1}', null)`), /.+/);
    await expectError(as(U.m1, 'authenticated', `insert into storage.objects (bucket_id, name) values ('documents', 'tenants/sTZ/x.jpg')`), /row-level security/);
  });

  // ---------------------------------------------------------------- caretaker
  await test('caretaker C1 sees only property P1 requests', async () => {
    assert.deepEqual((await app('c1', `select id from public.maintenance_requests where id like 's%'`)).sort(), ['sR1', 'sR2']);
  });
  await test('caretaker C1 cannot work a job assigned to C2, assign jobs, or edit leases, tenants or charges', async () => {
    await expectError(as(U.c1, 'authenticated', `select public.request_transition('sR1', 'in_progress')`), /can’t move/);
    await expectError(as(U.c1, 'authenticated', `select public.assign_request('sR2', null, '${U.c1}', null)`), /.+/);
    assert.equal(await count('c1', `update public.leases set rent = 1 where id = 'sLA' returning id`), 0);
    assert.equal(await count('c1', `update public.tenants set phone = '1' where id = 'sTA' returning id`), 0);
    assert.equal(await count('c1', `update public.payments set status = 'paid' where id = 'sPA' returning id`), 0);
  });
  await test('caretakers can’t read tenants’ ID documents, document records or charges', async () => {
    assert.deepEqual(await app('c1', `select name from storage.objects where name like 'tenants/%'`), []);
    assert.deepEqual(await app('c1', `select id from public.documents where tenant_id is not null and id like 's%'`), []);
    assert.deepEqual(await app('c1', `select id from public.payments where id like 's%'`), []);
    assert.deepEqual(await app('c1', `select name from storage.objects where name = 'properties/sP1/plan.pdf'`), ['properties/sP1/plan.pdf'], 'property papers stay readable');
  });

  // ---------------------------------------------------------------- accountant
  await test('accountant reads every lease and charge but cannot write them', async () => {
    assert.equal(await count('acct', `select 1 from public.leases where id in ('sLA', 'sLZ')`), 2);
    assert.equal(await count('acct', `select 1 from public.payments where id in ('sPA', 'sPZ')`), 2);
    await expectError(as(U.acct, 'authenticated', `insert into public.leases (tenant_id, unit_id, property_id, start_date, end_date, rent) values ('sTA', 'sU1', 'sP1', current_date, current_date + 1, 1)`), /row-level security/);
    assert.equal(await count('acct', `update public.leases set rent = 1 where id = 'sLA' returning id`), 0);
    assert.equal(await count('acct', `delete from public.leases where id = 'sLA' returning id`), 0);
    assert.equal(await count('acct', `update public.payments set status = 'paid' where id = 'sPA' returning id`), 0);
    assert.equal(await count('acct', `update public.tenants set name = 'x' where id = 'sTA' returning id`), 0);
  });

  // ---------------------------------------------------------------- sign-ups and the public key
  await test('a new sign-up with no tenancy sees nothing but their own profile', async () => {
    for (const table of ['tenants', 'leases', 'payments', 'maintenance_requests', 'documents', 'notifications', 'units', 'properties', 'onboarding_drafts', 'paystack_transactions']) {
      assert.equal(await count('signup', `select 1 from public.${table}`), 0, `${table} visible`);
    }
    assert.deepEqual(await app('signup', `select id from public.profiles`), [U.signup]);
  });
  await test('signed-out callers (public key) read nothing', async () => {
    for (const table of ['profiles', 'tenants', 'leases', 'payments', 'maintenance_requests', 'documents', 'notifications', 'org_settings']) {
      const r = await as(null, 'anon', `select 1 from public.${table}`).then((x) => x.rows.length, () => 0);
      assert.equal(r, 0, `${table} readable without signing in`);
    }
  });
  await test('every table in public has row level security on', async () => {
    const off = (await q(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                          where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)).rows.map((r) => r.relname);
    assert.deepEqual(off, []);
  });

  // ---------------------------------------------------------------- notifications
  await test('a sign-up with no tenancy cannot post to the staff feed (each post is pushed to staff phones)', async () => {
    await expectError(as(U.signup, 'authenticated', `insert into public.notifications (audience, category, title) values ('staff', 'Rent', 'Pay here: evil.example')`), /row-level security/);
  });
  await test('tenants’ posts to the staff feed are stamped by the server and limited', async () => {
    await as(U.ta, 'authenticated', `insert into public.notifications (id, audience, category, title, at) values ('sNT', 'staff', 'Leases', 'Tenant plans to renew', now() + interval '30 days')`);
    const row = (await q(`select at, posted_by from public.notifications where id = 'sNT'`)).rows[0];
    assert.ok(Math.abs(new Date(row.at).getTime() - Date.now()) < 60_000, 'time not set by the server');
    assert.equal(row.posted_by, U.ta);
    let refused = false;
    for (let i = 0; i < 25 && !refused; i++) {
      try { await as(U.ta, 'authenticated', `insert into public.notifications (audience, category, title) values ('staff', 'Leases', 'x')`); } catch (e) { refused = /Too many/.test(e.message); if (!refused) throw e; }
    }
    assert.ok(refused, 'no limit on staff posts');
  });
  await test('people can mark notifications read but not rewrite them', async () => {
    assert.equal(await count('ta', `update public.notifications set read = true where id = 'sNA' returning id`), 1);
    await expectError(as(U.ta, 'authenticated', `update public.notifications set title = 'Paid in full' where id = 'sNA'`), /only mark/);
    await expectError(as(U.c1, 'authenticated', `update public.notifications set body = 'changed' where id = 'sNS'`), /only mark/);
  });

  // ---------------------------------------------------------------- profiles, drafts, announcements, logs
  await test('staff see staff profiles, and tenant profiles only for tenants they can see', async () => {
    assert.ok((await app('c1', `select id from public.profiles`)).includes(U.m2), 'staff directory hidden');
    assert.ok(!(await app('c1', `select id from public.profiles`)).includes(U.tz), 'caretaker sees a P2 tenant’s email and phone');
    assert.ok(!(await app('m1', `select id from public.profiles`)).includes(U.tz), 'manager sees a P2 tenant’s email and phone');
    assert.ok((await app('m1', `select id from public.profiles`)).includes(U.ta));
    assert.ok((await app('acct', `select id from public.profiles`)).includes(U.tz));
  });
  await test('onboarding drafts are visible only to admins, their author and the property’s managers', async () => {
    assert.equal(await count('m1', `select 1 from public.onboarding_drafts where id = 'sD1'`), 1);
    assert.equal(await count('m2', `select 1 from public.onboarding_drafts where id = 'sD1'`), 0, 'another property’s manager reads the applicant’s details');
    assert.equal(await count('m2', `update public.onboarding_drafts set step = 3 where id = 'sD1' returning id`), 0);
    assert.equal(await count('admin', `select 1 from public.onboarding_drafts where id = 'sD1'`), 1);
  });
  await test('managers cannot edit or delete another property’s announcements', async () => {
    assert.equal(await count('m2', `update public.announcements set message = 'x' where id = 'sN1' returning id`), 0);
    assert.equal(await count('m2', `delete from public.announcements where id = 'sN1' returning id`), 0);
    assert.equal(await count('m1', `update public.announcements set message = 'Wednesday' where id = 'sN1' returning id`), 1);
  });
  await test('activity log entries are stamped with the real name and time', async () => {
    await as(U.m1, 'authenticated', `insert into public.activity_logs (id, user_name, action, area, at, actor_id) values ('sLog', 'Super Admin', 'Deleted everything', 'Security', now() - interval '90 days', '${U.m1}')`);
    const row = (await q(`select user_name, at from public.activity_logs where id = 'sLog'`)).rows[0];
    assert.equal(row.user_name, 'm1@sec.test');
    assert.ok(Math.abs(new Date(row.at).getTime() - Date.now()) < 60_000);
  });

  // ---------------------------------------------------------------- files
  await test('only staff can add completion photos (they count as proof the work is done)', async () => {
    await expectError(as(U.ta, 'authenticated', `insert into storage.objects (bucket_id, name) values ('maintenance-photos', 'sR1/completion/fake.jpg')`), /row-level security/);
    await as(U.ta, 'authenticated', `insert into storage.objects (bucket_id, name) values ('maintenance-photos', 'sR1/more.jpg')`);
    await as(U.c2, 'authenticated', `insert into storage.objects (bucket_id, name) values ('maintenance-photos', 'sR1/completion/done.jpg')`);
  });
  await test('tenants can only file documents under their own home', async () => {
    await expectError(as(U.ta, 'authenticated', `insert into public.documents (name, kind, folder, tenant_id, property_id) values ('x.pdf', 'pdf', 'Receipts', 'sTA', 'sP2')`), /row-level security/);
    await as(U.ta, 'authenticated', `insert into public.documents (name, kind, folder, tenant_id, property_id) values ('x.pdf', 'pdf', 'Receipts', 'sTA', null)`);
  });

  // ---------------------------------------------------------------- ending a tenancy (last: it changes tenant B)
  await test('when a manager deactivates a tenant, their login loses access; reactivating restores it', async () => {
    assert.equal(await count('m1', `update public.tenants set status = 'deactivated', unit_id = null where id = 'sTB' returning id`), 1);
    assert.equal((await q(`select status from public.profiles where id = '${U.tb}'`)).rows[0].status, 'suspended');
    assert.equal(await count('tb', `select 1 from public.tenants where id = 'sTB'`), 0, 'tenant record still visible');
    for (const table of ['leases', 'payments', 'documents']) {
      assert.equal(await count('tb', `select 1 from public.${table} where tenant_id = 'sTB'`), 0, `${table} still visible`);
    }
    await expectError(as(U.tb, 'authenticated', `insert into public.notifications (audience, category, title) values ('staff', 'Leases', 'x')`), /row-level security/);
    assert.equal(await count('m1', `update public.tenants set status = 'active', unit_id = 'sU2' where id = 'sTB' returning id`), 1);
    assert.equal((await q(`select status from public.profiles where id = '${U.tb}'`)).rows[0].status, 'active');
    assert.equal(await count('tb', `select 1 from public.tenants where id = 'sTB'`), 1);
  });
}
