// Chats (20261030000000_messaging.sql). Property P1 (manager M1, caretaker C1, tenants A and B) and P2
// (manager M2, tenant Z), plus an accountant and a super admin. Run by scripts/test-db.mjs.
import assert from 'node:assert/strict';

const U = {
  admin: 'c0000000-0000-4000-8000-000000000001',
  m1: 'c0000000-0000-4000-8000-000000000002',
  m2: 'c0000000-0000-4000-8000-000000000003',
  c1: 'c0000000-0000-4000-8000-000000000004',
  acct: 'c0000000-0000-4000-8000-000000000005',
  ta: 'c0000000-0000-4000-8000-000000000006',
  tb: 'c0000000-0000-4000-8000-000000000007',
  tz: 'c0000000-0000-4000-8000-000000000008',
};

export default async function ({ db, q, as, test, expectError }) {
  const users = Object.entries(U).map(([k, id]) => `('${id}', '${k}@chat.test')`).join(', ');
  await q(`insert into auth.users (id, email) values ${users}`);
  await db.exec(`
    select set_config('request.jwt.claims', '', false);
    update public.profiles set role = 'super_admin', name = 'Admin' where id = '${U.admin}';
    update public.profiles set role = 'manager', name = 'Manager One' where id = '${U.m1}';
    update public.profiles set role = 'manager', name = 'Manager Two' where id = '${U.m2}';
    update public.profiles set role = 'caretaker', name = 'Caretaker' where id = '${U.c1}';
    update public.profiles set role = 'accountant', name = 'Accountant' where id = '${U.acct}';
    insert into public.locations (id, name) values ('cL', 'Lekki');
    insert into public.properties (id, name, short, type, location_id) values
      ('cP1', 'Chat One', 'ChA', 'Block of flats', 'cL'), ('cP2', 'Chat Two', 'ChB', 'Estate', 'cL');
    insert into public.profile_properties (profile_id, property_id) values ('${U.m1}', 'cP1'), ('${U.c1}', 'cP1'), ('${U.m2}', 'cP2');
    insert into public.blocks (id, property_id, name) values ('cB1', 'cP1', 'A'), ('cB2', 'cP2', 'A');
    insert into public.units (id, property_id, block_id, code, type) values
      ('cU1', 'cP1', 'cB1', 'A1', 'Studio'), ('cU2', 'cP1', 'cB1', 'A2', 'Studio'), ('cU3', 'cP2', 'cB2', 'A1', 'Studio');
    insert into public.tenants (id, name, property_id, unit_id) values
      ('cTA', 'Tenant A', 'cP1', 'cU1'), ('cTB', 'Tenant B', 'cP1', 'cU2'), ('cTZ', 'Tenant Z', 'cP2', 'cU3');
    update public.profiles set tenant_id = 'cTA', name = 'Tenant A' where id = '${U.ta}';
    update public.profiles set tenant_id = 'cTB', name = 'Tenant B' where id = '${U.tb}';
    update public.profiles set tenant_id = 'cTZ', name = 'Tenant Z' where id = '${U.tz}';
  `);

  const contacts = async (who) => (await as(U[who], 'authenticated', 'select id from public.chat_contacts()')).rows.map((r) => r.id);
  const start = async (who, other) => (await as(U[who], 'authenticated', 'select public.start_direct_chat($1) as id', [U[other]])).rows[0].id;
  const send = (who, conv, body) => as(U[who], 'authenticated', 'insert into public.messages (conversation_id, sender_id, body) values ($1, $2, $3)', [conv, U[who], body]);

  await test('a tenant can message the staff of their property, never other tenants or other managers', async () => {
    const seen = await contacts('ta');
    for (const k of ['admin', 'm1', 'c1', 'acct']) assert(seen.includes(U[k]), `${k} missing`);
    for (const k of ['tb', 'tz', 'm2', 'ta']) assert(!seen.includes(U[k]), `${k} listed`);
    await expectError(start('ta', 'tb'), /can’t message/);
    await expectError(start('ta', 'm2'), /can’t message/);
  });

  await test('managers and caretakers can message staff and only tenants of their properties', async () => {
    const seen = await contacts('m1');
    for (const k of ['admin', 'm2', 'c1', 'acct', 'ta', 'tb']) assert(seen.includes(U[k]), `${k} missing`);
    assert(!seen.includes(U.tz), 'tenant of another property listed');
    assert((await contacts('c1')).includes(U.ta));
    await expectError(start('m1', 'tz'), /can’t message/);
    assert((await contacts('admin')).includes(U.tz), 'admin cannot reach every tenant');
  });

  let direct;
  await test('two people share one direct chat and both can read it', async () => {
    direct = await start('ta', 'm1');
    assert.equal(await start('m1', 'ta'), direct);
    await send('ta', direct, '  The gate is broken  ');
    await send('m1', direct, 'On it');
    const rows = (await as(U.m1, 'authenticated', 'select body from public.messages where conversation_id = $1 order by created_at', [direct])).rows;
    assert.deepEqual(rows.map((r) => r.body), ['The gate is broken', 'On it']);
  });

  await test('outsiders cannot read or post in a chat', async () => {
    assert.equal((await as(U.tb, 'authenticated', 'select id from public.messages where conversation_id = $1', [direct])).rows.length, 0);
    assert.equal((await as(U.m2, 'authenticated', 'select id from public.conversations where id = $1', [direct])).rows.length, 0);
    await expectError(send('tb', direct, 'hi'), /row-level security/);
  });

  await test('nobody can send as someone else', async () => {
    await expectError(as(U.ta, 'authenticated', 'insert into public.messages (conversation_id, sender_id, body) values ($1, $2, $3)', [direct, U.m1, 'fake']), /row-level security/);
  });

  await test('unread counts follow read receipts', async () => {
    const unread = async (who) => (await as(U[who], 'authenticated', 'select unread from public.my_conversations() where id = $1', [direct])).rows[0].unread;
    await send('m1', direct, 'Fixed now');
    assert(await unread('ta') >= 1);
    await as(U.ta, 'authenticated', 'select public.mark_conversation_read($1)', [direct]);
    assert.equal(await unread('ta'), 0);
    assert.equal(await unread('m1'), 0, 'sending marks your own chat read');
  });

  await test('only the sender can delete a message', async () => {
    const [{ id }] = (await as(U.ta, 'authenticated', 'select id from public.messages where conversation_id = $1 and sender_id = $2', [direct, U.ta])).rows;
    await expectError(as(U.m1, 'authenticated', 'select public.delete_message($1)', [id]), /only delete your own/);
    await as(U.ta, 'authenticated', 'select public.delete_message($1)', [id]);
    const [row] = (await q('select body, deleted_at from public.messages where id = $1', [id])).rows;
    assert.equal(row.body, '');
    assert(row.deleted_at);
  });

  await test('staff create groups with people they may message; tenants cannot', async () => {
    const g = (await as(U.m1, 'authenticated', 'select public.create_group_chat($1, $2::uuid[]) as id', ['Block A residents', [U.ta, U.tb, U.c1]])).rows[0].id;
    assert.equal((await as(U.tb, 'authenticated', 'select id from public.my_conversations() where id = $1', [g])).rows.length, 1);
    await send('tb', g, 'Hello neighbours');
    await expectError(as(U.m1, 'authenticated', 'select public.create_group_chat($1, $2::uuid[])', ['Mixed', [U.tz]]), /can’t add/);
    await expectError(as(U.ta, 'authenticated', 'select public.create_group_chat($1, $2::uuid[])', ['Tenants only', [U.m1]]), /Only staff/);
    await as(U.tb, 'authenticated', 'select public.leave_group_chat($1)', [g]);
    await expectError(send('tb', g, 'still here?'), /row-level security/);
  });

  await test('suspended accounts lose access to their chats', async () => {
    await q(`update public.profiles set status = 'suspended' where id = '${U.ta}'`);
    try {
      assert.equal((await as(U.ta, 'authenticated', 'select id from public.messages where conversation_id = $1', [direct])).rows.length, 0);
      await expectError(send('ta', direct, 'hello?'), /row-level security/);
    } finally {
      await q(`update public.profiles set status = 'active' where id = '${U.ta}'`);
    }
  });
}
