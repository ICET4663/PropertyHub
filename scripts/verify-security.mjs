// Spot-checks the security fixes (20261028000000_security_hardening.sql) on the real project. The full
// rule set is tested locally with `npm run db:test` (scripts/db-tests/security.mjs).
// Run: node --env-file=.env.local scripts/verify-security.mjs
// Removes its temporary account and rows afterwards.
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
async function login(email,password='demo1234'){ const c=session(); checked(await c.auth.signInWithPassword({email,password})); return c; }
let failures=0;
async function test(name,fn){ try { await fn(); console.log(`PASS ${name}`); } catch(e) { failures++; console.log(`FAIL ${name}: ${e.message}`); } }

const fixtures=[];
let touched=null; // a real notification the reword check tries to change; put back afterwards
try {
 const email=`propertyhub-sec-check-${randomUUID()}@example.com`, password=`Verify!${randomUUID()}`;
 const user=checked(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Security check'}})).user;
 fixtures.push(user.id);
 const stranger=await login(email,password);
 const caretaker=await login('john.eze@adewaleproperties.ng');
 const tenant=await login('chidinma.okafor@mail.com');

 await test('a sign-up with no tenancy cannot post to the staff feed', async()=>{
  const r=await stranger.from('notifications').insert({audience:'staff',category:'Rent',title:'Security check: should be refused'});
  assert(r.error,'post accepted');
 });
 await test('caretakers cannot read charges, tenant documents or tenant ID files', async()=>{
  assert.equal(checked(await caretaker.from('payments').select('id')).length,0,'charges visible');
  assert.equal(checked(await caretaker.from('documents').select('id').not('tenant_id','is',null)).length,0,'tenant documents visible');
  const files=await caretaker.storage.from('documents').list('tenants');
  assert.equal((files.data ?? []).length,0,'tenant folders listed');
 });
 await test('caretakers cannot see tenant accounts outside their properties', async()=>{
  const props=checked(await service.from('profile_properties').select('property_id,profiles!inner(email)').eq('profiles.email','john.eze@adewaleproperties.ng')).map((p)=>p.property_id);
  const outside=checked(await service.from('profiles').select('id,tenants!profiles_tenant_id_fkey!inner(property_id)').eq('role','tenant')).filter((p)=>!props.includes(p.tenants.property_id)).map((p)=>p.id);
  const seen=checked(await caretaker.from('profiles').select('id').eq('role','tenant')).map((p)=>p.id);
  assert.deepEqual(seen.filter((id)=>outside.includes(id)),[]);
 });
 await test('a tenant can mark a notification read but not reword it', async()=>{
  const [n]=checked(await tenant.from('notifications').select('id,title,read').order('id').limit(1));
  assert(n,'the demo tenant has no notifications to try');
  touched=n;
  const r=await tenant.from('notifications').update({title:'Paid in full'}).eq('id',n.id);
  assert(r.error,'reworded');
  checked(await tenant.from('notifications').update({read:true}).eq('id',n.id));
 });
} catch(e) {
 failures++; console.log(`FAIL setup: ${e.message}`);
} finally {
 if(touched) await service.from('notifications').update({title:touched.title,read:touched.read}).eq('id',touched.id);
 await service.from('notifications').delete().eq('title','Security check: should be refused');
 for(const id of fixtures) await service.auth.admin.deleteUser(id);
}
console.log(failures ? `${failures} check(s) failed. Temporary account removed.` : 'All security checks passed. Temporary account removed.');
process.exit(failures ? 1 : 0);
