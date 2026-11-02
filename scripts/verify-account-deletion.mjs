// Spot-checks in-app account deletion (20261028000100_account_deletion.sql) on the real project with a
// temporary account that has no tenancy, so no seeded data or staff feed is touched. The full rules
// (tenancy records kept, staff told, last admin protected) are tested locally: `npm run db:test accounts`.
// Run: node --env-file=.env.local scripts/verify-account-deletion.mjs
// Removes its temporary account and log entry afterwards, whatever happens.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const url=process.env.EXPO_PUBLIC_SUPABASE_URL;
const publicKey=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret=process.env.SUPABASE_SECRET_KEY;
assert(url && publicKey && secret, 'Set Supabase environment variables first.');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(url,secret,options);
const session=()=>createClient(url,publicKey,options);
function checked(result) { if(result.error) throw result.error; return result.data; }
let failures=0;
async function test(name,fn){ try { await fn(); console.log(`PASS ${name}`); } catch(e) { failures++; console.log(`FAIL ${name}: ${e.message}`); } }

const name=`Deletion check ${randomUUID().slice(0,8)}`;
let userId=null;
try {
 const email=`propertyhub-delete-check-${randomUUID()}@example.com`, password=`Verify!${randomUUID()}`;
 userId=checked(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name}})).user.id;
 const me=session();
 checked(await me.auth.signInWithPassword({email,password}));

 await test('signed-out callers cannot delete accounts', async()=>{
  const r=await session().rpc('delete_my_account');
  assert(r.error,'call accepted');
 });
 await test('a signed-in account can delete itself', async()=>{
  checked(await me.rpc('delete_my_account'));
 });
 await test('the sign-in and profile are gone', async()=>{
  const r=await service.auth.admin.getUserById(userId);
  assert(r.error || !r.data?.user,'auth user still exists');
  assert.equal(checked(await service.from('profiles').select('id').eq('id',userId)).length,0,'profile still exists');
 });
 await test('the old session reads nothing and the password no longer works', async()=>{
  const r=await me.from('profiles').select('id');
  assert.equal((r.data ?? []).length,0,'old session still reads profiles');
  const again=await session().auth.signInWithPassword({email,password});
  assert(again.error,'signed in again');
 });
 await test('the deletion is in the activity log', async()=>{
  assert.equal(checked(await service.from('activity_logs').select('id').eq('action','Deleted own account').eq('record',name)).length,1);
 });
} catch(e) {
 failures++; console.log(`FAIL setup: ${e.message}`);
} finally {
 if(userId) await service.auth.admin.deleteUser(userId).then(()=>{},()=>{});
 await service.from('activity_logs').delete().eq('record',name);
}
console.log(failures ? `${failures} check(s) failed. Temporary account removed.` : 'All checks passed. Temporary account removed.');
process.exit(failures ? 1 : 0);
