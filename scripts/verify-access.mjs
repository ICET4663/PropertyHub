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
const emails=['femi@adewaleproperties.ng','grace@adewaleproperties.ng','accounts@adewaleproperties.ng','john.eze@adewaleproperties.ng','chidinma.okafor@mail.com'];
const clients=[];
let fixtureId;
try {
 for(const email of emails){
  const c=session();clients.push(c);
  const login=checked(await c.auth.signInWithPassword({email,password:'demo1234'}));
  const p=checked(await c.from('profiles').select('role,two_step').eq('id',login.user.id).single());
  assert.equal(p.two_step,false);
  for(const table of ['profiles','profile_properties','locations','properties','blocks','units','tenants','leases','payments','onboarding_drafts','vendors','maintenance_requests','request_events','announcements','documents','notifications','activity_logs','org_settings']) checked(await c.from(table).select('*').limit(1));
  console.log(`PASS ${p.role}: login and all app tables readable`);
 }
 const email=`propertyhub-verification-${randomUUID()}@example.com`;
 const password=`Verify!${randomUUID()}`;
 const fixture=checked(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Access verification',role:'super_admin'}}));
 fixtureId=fixture.user.id;
 const c=session();clients.push(c);checked(await c.auth.signInWithPassword({email,password}));
 assert.equal(checked(await c.from('profiles').select('role').eq('id',fixtureId).single()).role,'tenant','Signup metadata must not grant admin privileges');
 const escalation=await c.from('profiles').update({role:'super_admin'}).eq('id',fixtureId);
 assert(escalation.error,'Tenant must not promote themselves');
 console.log('PASS signup trigger creates tenant; self-promotion rejected');
 const admin=clients[0];
 const properties=checked(await admin.from('properties').select('id'));
 const propertyId=properties[0].id;
 checked(await admin.from('profiles').update({role:'manager',access:'Verification property'}).eq('id',fixtureId).select('id').single());
 checked(await admin.from('profile_properties').insert({profile_id:fixtureId,property_id:propertyId}));
 const scoped=checked(await c.from('properties').select('id'));assert.deepEqual(scoped.map(p=>p.id),[propertyId]);
 console.log('PASS admin assigns manager role and property; access limited to that property');
 checked(await admin.from('profiles').update({role:'accountant',access:'All locations, read only'}).eq('id',fixtureId).select('id').single());
 assert.equal(checked(await c.from('properties').select('id')).length,properties.length);
 const write=await c.from('properties').update({description:'Forbidden write'}).eq('id',propertyId).select('id');
 assert(write.error || write.data.length===0,'Accountant must not write properties');
 console.log('PASS role changes persist; accountant reads all properties and cannot edit them');
} finally {
 for(const c of clients) await c.auth.signOut();
 if(fixtureId) checked(await service.auth.admin.deleteUser(fixtureId));
}
console.log('Verification complete; temporary account removed.');
