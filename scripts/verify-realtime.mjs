// Checks that the live feed reaches the right people: each user hears about changes they may see
// and nothing else (Realtime applies the same RLS as reads).
// Run: node --env-file=.env.local scripts/verify-realtime.mjs
// Removes its history entries, notifications and temporary account afterwards.
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
async function login(email,password='demo1234'){ const c=session(); checked(await c.auth.signInWithPassword({email,password})); await c.realtime.setAuth(); return c; }
let failures=0;
async function test(name,fn){ try { await fn(); console.log(`PASS ${name}`); } catch(e) { failures++; console.log(`FAIL ${name}: ${e.message}`); } }
const wait=(ms)=>new Promise((r)=>setTimeout(r,ms));
const marker=`Live check ${Date.now().toString(36)}`;

/** Subscribes like the app does and records what arrives. */
function listen(c,label){
 const got=[];
 const channel=c.channel(`verify-${label}-${randomUUID()}`)
  .on('postgres_changes',{event:'INSERT',schema:'public',table:'request_events'},(p)=>got.push(p.new))
  .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications'},(p)=>got.push(p.new));
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error(`${label} could not subscribe`)),15000);
  channel.subscribe((status,err)=>{
   if(status==='SUBSCRIBED'){ clearTimeout(timer); resolve(got); }
   else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){ clearTimeout(timer); reject(err ?? new Error(`${label}: ${status}`)); }
  });
 });
}
const heard=(got,text)=>got.some((r)=>r.text===text||r.title===text);

const clients=[];
let fixtureId;
try {
 const tenantA=await login('chidinma.okafor@mail.com'); clients.push(tenantA);
 const manager=await login('grace@adewaleproperties.ng'); clients.push(manager);
 const uid=async(c)=>(await c.auth.getUser()).data.user.id;
 const aId=checked(await tenantA.from('profiles').select('tenant_id').eq('id',await uid(tenantA)).single()).tenant_id;
 assert(aId,'Demo tenant must be linked to a tenancy');
 const request=checked(await service.from('maintenance_requests').select('id,property_id').eq('tenant_id',aId).limit(1).single());
 const mgrProps=checked(await manager.from('profile_properties').select('property_id').eq('profile_id',await uid(manager))).map((r)=>r.property_id);
 assert(mgrProps.includes(request.property_id),'The demo manager must manage the demo tenant’s property');

 // A second tenant, linked to a different tenancy.
 const other=checked(await service.from('tenants').select('id').neq('id',aId).not('property_id','is',null).limit(1).single());
 const email=`propertyhub-live-check-${randomUUID()}@example.com`, password=`Verify!${randomUUID()}`;
 const fixture=checked(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Live verification'}}));
 fixtureId=fixture.user.id;
 checked(await service.from('profiles').update({tenant_id:other.id}).eq('id',fixtureId));
 const tenantB=await login(email,password); clients.push(tenantB);

 const [gotA,gotB,gotM]=await Promise.all([listen(tenantA,'tenantA'),listen(tenantB,'tenantB'),listen(manager,'manager')]);
 const shared=`${marker}: shared update`, internal=`${marker}: staff note`, ping=`${marker}: tenant notice`;
 checked(await service.from('request_events').insert([
  {request_id:request.id,kind:'comment',text:shared,by_name:'Verification',shared:true,internal:false},
  {request_id:request.id,kind:'comment',text:internal,by_name:'Verification',shared:false,internal:true},
 ]));
 checked(await service.from('notifications').insert({audience:aId,category:'Maintenance',title:ping,body:'Verification'}));
 const started=Date.now();
 while(Date.now()-started<10000 && !(heard(gotA,shared)&&heard(gotA,ping)&&heard(gotM,internal))) await wait(250);
 await wait(1500); // time for anything that should not arrive

 await test('tenant hears a shared update on their own request within seconds', async()=>assert(heard(gotA,shared),'no event'));
 await test('tenant hears their own notification', async()=>assert(heard(gotA,ping),'no notification'));
 await test('tenant does not hear staff-only notes', async()=>assert(!heard(gotA,internal),'internal note delivered to tenant'));
 await test('manager hears changes on requests in their property', async()=>assert(heard(gotM,shared)&&heard(gotM,internal),'missing events'));
 await test('manager does not get a tenant’s personal notifications', async()=>assert(!heard(gotM,ping),'tenant notification delivered to staff'));
 await test('another tenant hears nothing about it', async()=>assert(!gotB.some((r)=>String(r.text??r.title).startsWith(marker)),`received ${gotB.length} item(s)`));
} catch(e) {
 failures++; console.log(`FAIL setup: ${e.message}`);
} finally {
 for(const c of clients) await c.removeAllChannels();
 await service.from('request_events').delete().like('text',`${marker}%`);
 await service.from('notifications').delete().like('title',`${marker}%`);
 if(fixtureId) checked(await service.auth.admin.deleteUser(fixtureId));
}
console.log(failures ? `${failures} check(s) failed. Test entries and account removed.` : 'All live-update checks passed. Test entries and account removed.');
process.exit(failures ? 1 : 0);
