// Checks who can see and change push tokens (20261023000000_push_notifications.sql). Delivery itself
// needs a phone with a development build; see PROPERTYHUB_BUILD_PLAN.md, stage 9.
// Run: node --env-file=.env.local scripts/verify-push.mjs
// Removes its tokens and temporary accounts afterwards.
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
async function login(email,password){ const c=session(); checked(await c.auth.signInWithPassword({email,password})); return c; }
let failures=0;
async function test(name,fn){ try { await fn(); console.log(`PASS ${name}`); } catch(e) { failures++; console.log(`FAIL ${name}: ${e.message}`); } }
const notMigrated=(e)=>/register_push_token|push_tokens/.test(e?.message ?? '') && /schema cache|does not exist/.test(e.message);
const token=`ExponentPushToken[verify-${randomUUID()}]`;

const fixtures=[];
async function tenantAccount(tenantId){
 const email=`propertyhub-push-check-${randomUUID()}@example.com`, password=`Verify!${randomUUID()}`;
 const user=checked(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Push verification'}})).user;
 fixtures.push(user.id);
 checked(await service.from('profiles').update({tenant_id:tenantId}).eq('id',user.id));
 return { client: await login(email,password), id: user.id };
}
const owner=async()=>(await service.from('push_tokens').select('user_id').eq('token',token).maybeSingle()).data?.user_id ?? null;

try {
 const [t1,t2]=checked(await service.from('tenants').select('id').not('property_id','is',null).limit(2));
 const a=await tenantAccount(t1.id), b=await tenantAccount(t2.id);

 await test('tenant registers this phone’s token', async()=>{
  const r=await a.client.rpc('register_push_token',{p_token:token,p_platform:'android'});
  if(notMigrated(r.error)) throw new Error('server not migrated: '+r.error.message);
  checked(r);
  assert.equal(await owner(),a.id);
  const mine=checked(await a.client.from('push_tokens').select('token'));
  assert.deepEqual(mine.map((x)=>x.token),[token]);
 });
 await test('another account cannot see or delete it', async()=>{
  assert.equal(checked(await b.client.from('push_tokens').select('token').eq('token',token)).length,0);
  checked(await b.client.from('push_tokens').delete().eq('token',token));
  assert.equal(await owner(),a.id,'token was deleted by another account');
 });
 await test('tokens cannot be written directly, only through register_push_token', async()=>{
  const r=await b.client.from('push_tokens').insert({token:`ExponentPushToken[verify-${randomUUID()}]`,user_id:b.id,platform:'ios'});
  assert(r.error,'direct insert was accepted');
  const u=await b.client.from('push_tokens').update({user_id:b.id}).eq('token',token).select();
  assert(u.error || u.data.length===0,'another account took the token by update');
  assert.equal(await owner(),a.id);
 });
 await test('rejects things that are not Expo push tokens, and unknown platforms', async()=>{
  assert((await a.client.rpc('register_push_token',{p_token:'not-a-token',p_platform:'android'})).error,'bad token accepted');
  assert((await a.client.rpc('register_push_token',{p_token:token,p_platform:'web'})).error,'bad platform accepted');
 });
 await test('signed-out callers cannot register', async()=>{
  assert((await session().rpc('register_push_token',{p_token:token,p_platform:'android'})).error,'anonymous call accepted');
 });
 await test('the token moves to whoever signs in on the phone next', async()=>{
  checked(await b.client.rpc('register_push_token',{p_token:token,p_platform:'android'}));
  assert.equal(await owner(),b.id);
  assert.equal(checked(await a.client.from('push_tokens').select('token')).length,0,'previous account still sees the token');
 });
 await test('signing out removes the token', async()=>{
  checked(await b.client.from('push_tokens').delete().eq('token',token));
  assert.equal(await owner(),null);
 });
} catch(e) {
 failures++; console.log(`FAIL setup: ${e.message}`);
} finally {
 await service.from('push_tokens').delete().like('token','ExponentPushToken[verify-%');
 for(const id of fixtures) checked(await service.auth.admin.deleteUser(id));
}
console.log(failures ? `${failures} check(s) failed. Test tokens and accounts removed.` : 'All push token checks passed. Test tokens and accounts removed.');
process.exit(failures ? 1 : 0);
