// Paystack payments (20261027000000): starting and settling attempts, idempotency, amount checks,
// duplicate payments, rate limit, RLS and the guard on hand-recorded charges. Run by scripts/test-db.mjs.
import assert from 'node:assert/strict';

const tenantUser = '11111111-1111-1111-1111-111111111111';
const otherUser = '22222222-2222-2222-2222-222222222222';
const managerUser = '33333333-3333-3333-3333-333333333333';

export default async function ({ db, q, as, test, expectError }) {
  // New logins get tenant profiles through the sign-up trigger.
  await db.exec(`
    insert into auth.users (id, email) values ('${tenantUser}', 'ten@x.ng'), ('${otherUser}', 'other@x.ng'), ('${managerUser}', 'mgr@x.ng');
    insert into public.locations (id, name) values ('loc-1', 'Lekki');
    insert into public.properties (id, name, short, type, location_id) values ('prop-1', 'Palm Court', 'Palm', 'Block of flats', 'loc-1'), ('prop-2', 'Other', 'Oth', 'Estate', 'loc-1');
    insert into public.blocks (id, property_id, name) values ('blk-1', 'prop-1', 'A');
    insert into public.units (id, property_id, block_id, code, type) values ('u-1', 'prop-1', 'blk-1', 'A1', 'Studio'), ('u-2', 'prop-1', 'blk-1', 'A2', 'Studio');
    insert into public.tenants (id, name, property_id, unit_id) values ('TN-1', 'Ada', 'prop-1', 'u-1'), ('TN-2', 'Bola', 'prop-1', 'u-2');
    update public.profiles set tenant_id = 'TN-1' where id = '${tenantUser}';
    update public.profiles set tenant_id = 'TN-2' where id = '${otherUser}';
    update public.profiles set role = 'manager' where id = '${managerUser}';
    insert into public.profile_properties (profile_id, property_id) values ('${managerUser}', 'prop-1');
    insert into public.payments (id, tenant_id, label, amount, date, status) values
      ('due-1', 'TN-1', 'Rent arrears', 1200000, current_date - 3, 'overdue'),
      ('due-2', 'TN-1', 'Service charge', 300000, current_date + 5, 'pending'),
      ('paid-1', 'TN-1', 'Rent', 500000, current_date - 300, 'paid'),
      ('due-3', 'TN-2', 'Rent', 900000, current_date + 1, 'pending');
  `);

  const svc = (sql, params) => as(null, 'service_role', sql, params);
  const begin = (user, pid) => svc(`select public.paystack_begin($1, $2, 'propertyhub://myLease') as r`, [user, pid]).then((r) => r.rows[0].r);
  const record = (ref, status, data = {}, event = null) => svc(`select public.paystack_record($1, $2, $3::jsonb, $4, $5::jsonb) as s`, [ref, status, JSON.stringify(data), event, event ? JSON.stringify({ event }) : null]).then((r) => r.rows[0].s);
  const charge = async (id) => (await q(`select * from public.payments where id = $1`, [id])).rows[0];
  const tx = async (ref) => (await q(`select * from public.paystack_transactions where reference = $1`, [ref])).rows[0];
  const ok = (amountNaira, extra = {}) => ({ amount: amountNaira * 100, currency: 'NGN', channel: 'card', id: 4242, fees: 150000, paid_at: '2026-10-27T09:00:00Z', gateway_response: 'Approved', ...extra });

  let ref1;
  await test('begin: amount comes from the charge; reference is unique', async () => {
    const r = await begin(tenantUser, 'due-1');
    ref1 = r.reference;
    assert.equal(Number(r.amount), 1200000);
    assert.equal(r.email, 'ten@x.ng');
    assert.match(ref1, /^PH-due-1-[0-9a-f]{10}$/);
    assert.equal((await tx(ref1)).status, 'pending');
  });
  await test('begin: another tenant’s charge, a paid charge and an unknown charge are refused', async () => {
    await expectError(begin(otherUser, 'due-1'), /Payment not found/);
    await expectError(begin(tenantUser, 'paid-1'), /already been made/);
    await expectError(begin(tenantUser, 'nope'), /Payment not found/);
    await expectError(begin(managerUser, 'due-1'), /Only a tenant/);
  });
  await test('app roles cannot call the server functions directly', async () => {
    await expectError(as(tenantUser, 'authenticated', `select public.paystack_begin($1, 'due-1', 'x')`, [tenantUser]), /permission denied/);
    await expectError(as(tenantUser, 'authenticated', `select public.paystack_record('x', 'success')`), /permission denied/);
    await expectError(as(null, 'anon', `select public.paystack_record('x', 'success')`), /permission denied/);
  });
  await test('success with the wrong amount is not paid, and staff are told', async () => {
    const r = await begin(tenantUser, 'due-2');
    assert.equal(await record(r.reference, 'success', ok(1)), 'failed');
    assert.equal((await charge('due-2')).status, 'pending');
    assert.match((await tx(r.reference)).gateway_response, /did not match/);
    const n = (await q(`select * from public.notifications where title = 'Payment needs checking'`)).rows;
    assert.equal(n.length, 1);
  });
  await test('success marks the charge paid once; repeated confirmations change nothing', async () => {
    assert.equal(await record(ref1, 'success', ok(1200000), 'charge.success'), 'success');
    const c = await charge('due-1');
    assert.equal(c.status, 'paid');
    assert.equal(c.reference, ref1);
    assert.equal(c.method, 'Paystack · Card');
    assert.ok(c.paid_at);
    const t = await tx(ref1);
    assert.equal(t.status, 'success');
    assert.equal(Number(t.fees), 1500);
    const before = (await q(`select count(*)::int n from public.notifications where audience = 'TN-1' and title = 'Payment received.'`)).rows[0].n;
    assert.equal(before, 1, 'tenant told once');
    for (let i = 0; i < 3; i++) assert.equal(await record(ref1, 'success', ok(1200000), 'charge.success'), 'success');
    assert.equal(await record(ref1, 'failed'), 'success', 'a success is never undone');
    const after = (await q(`select count(*)::int n from public.notifications where audience = 'TN-1' and title = 'Payment received.'`)).rows[0].n;
    assert.equal(after, 1);
    assert.equal((await q(`select count(*)::int n from private.paystack_events where reference = $1`, [ref1])).rows[0].n, 4, 'every delivery logged');
  });
  await test('paying a charge that is already paid is refused at the start', async () => {
    await expectError(begin(tenantUser, 'due-1'), /already been made/);
  });
  await test('abandoned and failed attempts are recorded and leave the charge due', async () => {
    const a = await begin(otherUser, 'due-3');
    assert.equal(await record(a.reference, 'abandoned'), 'abandoned');
    const f = await begin(otherUser, 'due-3');
    assert.equal(await record(f.reference, 'failed', { gateway_response: 'Declined' }), 'failed');
    assert.equal((await tx(f.reference)).gateway_response, 'Declined');
    assert.equal((await charge('due-3')).status, 'pending');
    // an abandoned checkout can still complete later
    assert.equal(await record(a.reference, 'success', ok(900000)), 'success');
    assert.equal((await charge('due-3')).status, 'paid');
  });
  await test('two attempts both succeed: the second is flagged as paid twice, not counted', async () => {
    await db.exec(`insert into public.payments (id, tenant_id, label, amount, date, status) values ('due-4', 'TN-2', 'Deposit', 100000, current_date, 'pending')`);
    const a = await begin(otherUser, 'due-4');
    const b = await begin(otherUser, 'due-4');
    await record(a.reference, 'success', ok(100000));
    await record(b.reference, 'success', ok(100000));
    assert.equal((await charge('due-4')).reference, a.reference);
    assert.equal((await q(`select count(*)::int n from public.notifications where title = 'Paid twice: refund needed'`)).rows[0].n, 1);
  });
  await test('unknown references are logged and ignored', async () => {
    assert.equal(await record('not-ours', 'success', ok(1), 'charge.success'), 'unknown');
  });
  await test('too many attempts in ten minutes are refused', async () => {
    await db.exec(`insert into public.payments (id, tenant_id, label, amount, date, status) values ('due-5', 'TN-2', 'Rent', 1000, current_date, 'pending')`);
    for (let i = 0; i < 5; i++) await begin(otherUser, 'due-5');
    await expectError(begin(otherUser, 'due-5'), /Too many/);
  });
  await test('RLS: tenants see only their own attempts; manager sees their property’s', async () => {
    const mine = await as(tenantUser, 'authenticated', `select reference from public.paystack_transactions`);
    assert.ok(mine.rows.length >= 2 && mine.rows.every((r) => r.reference.startsWith('PH-due-1') || r.reference.startsWith('PH-due-2')));
    const mgr = await as(managerUser, 'authenticated', `select count(*)::int n from public.paystack_transactions`);
    assert.equal(mgr.rows[0].n, (await q(`select count(*)::int n from public.paystack_transactions`)).rows[0].n);
    await expectError(as(tenantUser, 'authenticated', `insert into public.paystack_transactions (reference, payment_id, tenant_id, amount) values ('x', 'due-2', 'TN-1', 1)`), /row-level security|permission denied/);
    const upd = await as(managerUser, 'authenticated', `update public.paystack_transactions set status = 'success' returning reference`);
    assert.equal(upd.rows.length, 0, 'no update policy');
  });
  await test('managers can’t fake or change Paystack payments, but can still record cash by hand', async () => {
    await expectError(as(managerUser, 'authenticated', `update public.payments set reference = 'PH-fake', status = 'paid' where id = 'due-2'`), /Only Paystack/);
    await expectError(as(managerUser, 'authenticated', `update public.payments set amount = 1 where id = 'due-1'`), /can’t be changed/);
    await expectError(as(managerUser, 'authenticated', `delete from public.payments where id = 'due-1'`), /can’t be deleted/);
    const r = await as(managerUser, 'authenticated', `update public.payments set status = 'paid', method = 'Cash' where id = 'due-2' returning id`);
    assert.equal(r.rows.length, 1);
  });
  await test('a tenant still can’t write charges at all', async () => {
    const r = await as(tenantUser, 'authenticated', `update public.payments set status = 'paid' where id = 'due-1' returning id`);
    assert.equal(r.rows.length, 0);
  });
}
