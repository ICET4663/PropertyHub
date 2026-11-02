// Walks maintenance requests through the server-enforced workflow as each role and checks
// that every allowed step works and every other step is refused.
// Run: node --env-file=.env.local scripts/verify-workflow.mjs
// Needs migrations 20261020000100 and 20261020000200. Removes its requests, photos,
// notifications and temporary account afterwards.
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
const ok=async(p)=>checked(await p);
// A refusal must come from the rules, not from the server missing the workflow migration.
const refused=async(p,why)=>{
 const r=await p;
 if(r.error && /could not find the function|does not exist|schema cache/i.test(r.error.message)) throw new Error(`server not migrated: ${r.error.message}`);
 assert(r.error || (Array.isArray(r.data) && r.data.length===0), why);
};
const move=(c,id,to,note=null,rating=null)=>c.rpc('request_transition',{p_id:id,p_to:to,p_note:note,p_rating:rating});
const status=async(id)=>checked(await service.from('maintenance_requests').select('status').eq('id',id).single()).status;
const jpg=new Uint8Array([0xff,0xd8,0xff,0xe0,0,0x10,0x4a,0x46,0x49,0x46,0,1,0xff,0xd9]);
const ids=[], photoPaths=[], clients=[];
let fixtureId;
try {
 const tenant=await login('chidinma.okafor@mail.com'); clients.push(tenant);
 const manager=await login('grace@adewaleproperties.ng'); clients.push(manager);
 const caretaker=await login('john.eze@adewaleproperties.ng'); clients.push(caretaker);
 const accountant=await login('accounts@adewaleproperties.ng'); clients.push(accountant);
 const uid=async(c)=>(await c.auth.getUser()).data.user.id;
 const tId=checked(await tenant.from('profiles').select('tenant_id').eq('id',await uid(tenant)).single()).tenant_id;
 const t=checked(await service.from('tenants').select('id,property_id,unit_id').eq('id',tId).single());
 const ctId=await uid(caretaker);
 const ctLinked=(await service.from('profile_properties').select('property_id').eq('profile_id',ctId).eq('property_id',t.property_id)).data?.length>0;
 const mgrLinked=(await service.from('profile_properties').select('property_id').eq('profile_id',await uid(manager)).eq('property_id',t.property_id)).data?.length>0;
 assert(mgrLinked,'The demo manager must manage the demo tenant’s property');
 const vendor=checked(await service.from('vendors').select('id').eq('status','active').limit(1).single());

 const other=checked(await service.from('tenants').select('id').neq('id',t.id).not('property_id','is',null).limit(1).single());
 const email=`propertyhub-workflow-check-${randomUUID()}@example.com`, password=`Verify!${randomUUID()}`;
 fixtureId=checked(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Workflow verification'}})).user.id;
 checked(await service.from('profiles').update({tenant_id:other.id}).eq('id',fixtureId));
 const otherTenant=await login(email,password); clients.push(otherTenant);

 const payload=(key,title)=>({p:{client_key:key,tenant_id:t.id,category:'Plumbing',title,description:'Workflow verification — safe to ignore',room:'Kitchen',priority:'low',access:'Any time',caretaker_access:false,photos:0}});
 const key=randomUUID();
 let id;
 await test('tenant creates a request through create_request()', async()=>{ id=await ok(tenant.rpc('create_request',payload(key,'Verification leak'))); ids.push(id); assert.equal(await status(id),'new'); });
 await test('same client_key returns the same request (no double submit)', async()=>{
  const [a,b]=await Promise.all([tenant.rpc('create_request',payload(key,'Verification leak')),tenant.rpc('create_request',payload(key,'Verification leak'))]);
  assert.equal(checked(a),id); assert.equal(checked(b),id);
  assert.equal(checked(await service.from('maintenance_requests').select('id').eq('client_key',key)).length,1);
 });
 await test('direct inserts are refused', async()=>{
  const x=`MR-x${Date.now()}`, y=`MR-y${Date.now()}`; ids.push(x,y); // removed afterwards if the guard let them through
  await refused(tenant.from('maintenance_requests').insert({id:x,tenant_id:t.id,unit_id:t.unit_id,property_id:t.property_id,category:'Plumbing',title:'Verification direct insert',status:'new'}).select('id'),'tenant inserted directly');
  await refused(manager.from('maintenance_requests').insert({id:y,tenant_id:t.id,unit_id:t.unit_id,property_id:t.property_id,category:'Plumbing',title:'Verification direct insert',status:'closed'}).select('id'),'manager inserted a closed request directly');
 });
 await test('another tenant cannot report for this tenant', async()=>{ await refused(otherTenant.rpc('create_request',payload(randomUUID(),'Not mine')),'created for another tenancy'); });
 await test('direct status changes are refused for every role', async()=>{
  for(const c of [tenant,manager,caretaker]) await refused(c.from('maintenance_requests').update({status:'closed'}).eq('id',id).select('id'),'status changed directly');
  assert.equal(await status(id),'new');
 });
 await test('workflow history cannot be forged', async()=>{
  const own=checked(await service.from('maintenance_requests').select('id').eq('tenant_id',t.id).limit(1).single()).id;
  const r=await tenant.from('request_events').insert({request_id:own,kind:'status',text:'Verification forged close'}).select('id');
  if(!r.error) await service.from('request_events').delete().eq('text','Verification forged close');
  await refused(Promise.resolve(r),'inserted a status event');
 });
 await test('nobody can skip assignment (new → in progress / resolved)', async()=>{
  await refused(move(caretaker,id,'in_progress'),'caretaker started a new request');
  await refused(move(manager,id,'resolved'),'manager resolved a new request');
 });
 await test('tenant and caretaker cannot assign', async()=>{
  await refused(tenant.rpc('assign_request',{p_id:id,p_vendor_id:vendor.id,p_caretaker_id:null,p_visit:null}),'tenant assigned');
  await refused(caretaker.rpc('assign_request',{p_id:id,p_vendor_id:vendor.id,p_caretaker_id:null,p_visit:null}),'caretaker assigned');
 });
 await test(`manager assigns vendor${ctLinked?' and caretaker':''} → assigned`, async()=>{
  await ok(manager.rpc('assign_request',{p_id:id,p_vendor_id:vendor.id,p_caretaker_id:ctLinked?ctId:null,p_visit:{date:new Date().toISOString().slice(0,10),window:'2pm – 5pm'},p_note:'Verification',p_tell_tenant:true}));
  assert.equal(await status(id),'assigned');
 });
 await test('tenant and accountant cannot start work', async()=>{
  await refused(move(tenant,id,'in_progress'),'tenant started'); await refused(move(accountant,id,'in_progress'),'accountant started');
 });
 const worker=ctLinked?caretaker:manager;
 await test(`${ctLinked?'assigned caretaker':'manager'} starts work → in progress`, async()=>{ await ok(move(worker,id,'in_progress')); assert.equal(await status(id),'in_progress'); });
 if(ctLinked){
  await test('caretaker cannot mark fixed without a completion photo', async()=>{ await refused(move(caretaker,id,'resolved'),'resolved without proof'); });
  await test('caretaker uploads a completion photo and marks fixed → resolved', async()=>{
   const p=`${id}/completion/${Date.now()}-done.jpg`;
   checked(await caretaker.storage.from('maintenance-photos').upload(p,jpg,{contentType:'image/jpeg'})); photoPaths.push(p);
   await ok(move(caretaker,id,'resolved','Replaced the washer')); assert.equal(await status(id),'resolved');
  });
 } else {
  await test('manager marks fixed → resolved', async()=>{ await ok(move(manager,id,'resolved')); assert.equal(await status(id),'resolved'); });
 }
 await test('tenant must give a reason to dispute; other tenant cannot dispute', async()=>{
  await refused(move(tenant,id,'disputed'),'disputed without a reason');
  await refused(move(otherTenant,id,'disputed','not mine'),'another tenant disputed');
 });
 await test('tenant disputes with a reason → disputed', async()=>{
  await ok(move(tenant,id,'disputed','Still dripping under the sink'));
  const r=checked(await service.from('maintenance_requests').select('status,dispute_reason').eq('id',id).single());
  assert.equal(r.status,'disputed'); assert.equal(r.dispute_reason,'Still dripping under the sink');
 });
 await test('only a manager returns a dispute to the repairer', async()=>{
  await refused(move(tenant,id,'in_progress'),'tenant reopened'); await refused(move(caretaker,id,'in_progress'),'caretaker reopened');
  await ok(move(manager,id,'in_progress','Please check the trap')); assert.equal(await status(id),'in_progress');
 });
 await test('fixed again; accountant cannot close; rating must be 1–5', async()=>{
  await ok(move(manager,id,'resolved'));
  await refused(move(accountant,id,'closed','x'),'accountant closed');
  await refused(move(tenant,id,'closed',null,9),'rating 9 accepted');
 });
 await test('tenant confirms with a rating → closed', async()=>{
  await ok(move(tenant,id,'closed',null,5));
  const r=checked(await service.from('maintenance_requests').select('status,rating').eq('id',id).single());
  assert.equal(r.status,'closed'); assert.equal(r.rating,5);
 });
 await test('closed is final', async()=>{ for(const to of ['in_progress','disputed','resolved','cancelled']) await refused(move(manager,id,to,'x'),`closed → ${to}`); });
 await test('history records actor and server time for every step', async()=>{
  const ev=checked(await service.from('request_events').select('kind,text,actor_id,at').eq('request_id',id).order('at'));
  const kinds=ev.map(e=>e.kind);
  assert(kinds.includes('created') && kinds.includes('vendor') && kinds.filter(k=>k==='status').length>=6, `unexpected history: ${kinds.join(',')}`);
  assert(ev.filter(e=>e.kind!=='comment').every(e=>e.actor_id), 'a workflow entry has no actor');
 });

 // Cancellation
 let id2, id3;
 await test('tenant cancels their own new request', async()=>{
  id2=await ok(tenant.rpc('create_request',payload(randomUUID(),'Verification cancel'))); ids.push(id2);
  await refused(move(otherTenant,id2,'cancelled'),'another tenant cancelled');
  await ok(move(tenant,id2,'cancelled')); assert.equal(await status(id2),'cancelled');
 });
 await test('manager must give a reason to cancel; cannot cancel once assigned', async()=>{
  id3=await ok(manager.rpc('create_request',payload(randomUUID(),'Verification staff cancel'))); ids.push(id3);
  await refused(move(manager,id3,'cancelled'),'cancelled without a reason');
  await ok(manager.rpc('assign_request',{p_id:id3,p_vendor_id:vendor.id,p_caretaker_id:null,p_visit:null}));
  await refused(move(manager,id3,'cancelled','duplicate'),'cancelled after assignment');
 });
} finally {
 for(const c of clients) await c.auth.signOut();
 if(photoPaths.length) await service.storage.from('maintenance-photos').remove(photoPaths);
 for(const id of ids){
  await service.from('notifications').delete().like('body',`%${id}%`);
  await service.from('notifications').delete().contains('link',{params:{id}});
 }
 if(ids.length) await service.from('maintenance_requests').delete().in('id',ids);
 if(fixtureId) checked(await service.auth.admin.deleteUser(fixtureId));
}
console.log(failures ? `${failures} check(s) failed. Test requests and account removed.` : 'All workflow checks passed. Test requests and account removed.');
process.exitCode = failures ? 1 : 0;
