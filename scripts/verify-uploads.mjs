// Checks file storage rules against the live project: who can upload, open and list files.
// Run: node --env-file=.env.local scripts/verify-uploads.mjs
// Creates a temporary second tenant login and a few tiny files, and removes them all afterwards.
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
const pdf=new TextEncoder().encode('%PDF-1.4\n% PropertyHub upload verification\n');
const jpg=new Uint8Array([0xff,0xd8,0xff,0xe0,0,0x10,0x4a,0x46,0x49,0x46,0,1,0xff,0xd9]);
const stamp=Date.now().toString(36);
const docPaths=[], photoPaths=[], docIds=[];
const clients=[];
let fixtureId;
try {
 const tenantA=await login('chidinma.okafor@mail.com'); clients.push(tenantA);
 const manager=await login('grace@adewaleproperties.ng'); clients.push(manager);
 const accountant=await login('accounts@adewaleproperties.ng'); clients.push(accountant);
 const userId=async(c)=>(await c.auth.getUser()).data.user.id;
 const aId=checked(await tenantA.from('profiles').select('tenant_id').eq('id',await userId(tenantA)).single()).tenant_id;
 assert(aId,'Demo tenant must be linked to a tenancy');
 const a=checked(await service.from('tenants').select('id,name,property_id').eq('id',aId).single());
 const mgrProps=checked(await manager.from('profile_properties').select('property_id').eq('profile_id',await userId(manager))).map(r=>r.property_id);

 // A second tenant, linked to a different tenancy.
 const other=checked(await service.from('tenants').select('id').neq('id',a.id).not('property_id','is',null).limit(1).single());
 const email=`propertyhub-upload-check-${randomUUID()}@example.com`, password=`Verify!${randomUUID()}`;
 const fixture=checked(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Upload verification'}}));
 fixtureId=fixture.user.id;
 checked(await service.from('profiles').update({tenant_id:other.id}).eq('id',fixtureId));
 const tenantB=await login(email,password); clients.push(tenantB);

 const idPath=`tenants/${a.id}/${stamp}-verify-id.pdf`;
 await test('tenant uploads own ID to tenants/<own id>', async()=>{
  checked(await tenantA.storage.from('documents').upload(idPath,pdf,{contentType:'application/pdf'})); docPaths.push(idPath);
 });
 await test('tenant records the upload (documents.storage_path)', async()=>{
  const selfDocs=checked(await service.from('org_settings').select('self_docs').single()).self_docs;
  assert(selfDocs,'org setting self_docs is off, so tenants cannot add documents');
  const row=checked(await tenantA.from('documents').insert({name:'Verification ID.pdf',kind:'pdf',folder:'Tenant ID and KYC',linked_to:'verification',tenant_id:a.id,property_id:a.property_id,uploaded_by:a.name,size_kb:1,storage_path:idPath}).select('id').single());
  docIds.push(row.id);
 });
 await test('tenant opens own file through a signed URL', async()=>{
  const signed=checked(await tenantA.storage.from('documents').createSignedUrl(idPath,60));
  const res=await fetch(signed.signedUrl); assert.equal(res.status,200); assert.equal((await res.arrayBuffer()).byteLength,pdf.byteLength);
 });
 await test('another tenant cannot link, download, list or overwrite tenant A’s files', async()=>{
  assert((await tenantB.storage.from('documents').createSignedUrl(idPath,60)).error,'got a signed URL');
  assert((await tenantB.storage.from('documents').download(idPath)).error,'downloaded the file');
  assert.equal(checked(await tenantB.storage.from('documents').list(`tenants/${a.id}`)).length,0,'listed file names');
  const up=await tenantB.storage.from('documents').upload(`tenants/${a.id}/${stamp}-intruder.pdf`,pdf,{contentType:'application/pdf'});
  if(!up.error) docPaths.push(`tenants/${a.id}/${stamp}-intruder.pdf`);
  assert(up.error,'uploaded into tenant A’s folder');
  assert.equal((await tenantB.from('documents').select('id').eq('storage_path',idPath)).data?.length ?? 0,0,'saw the document record');
 });
 if(mgrProps.includes(a.property_id)){
  await test('manager opens a file of a tenant in their property', async()=>{ checked(await manager.storage.from('documents').createSignedUrl(idPath,60)); });
  await test('manager uploads into a tenant folder in their property', async()=>{
   const p=`tenants/${a.id}/${stamp}-manager.pdf`;
   checked(await manager.storage.from('documents').upload(p,pdf,{contentType:'application/pdf'})); docPaths.push(p);
  });
 }
 await test('accountant reads documents but cannot upload', async()=>{
  checked(await accountant.storage.from('documents').createSignedUrl(idPath,60));
  const up=await accountant.storage.from('documents').upload(`tenants/${a.id}/${stamp}-accountant.pdf`,pdf,{contentType:'application/pdf'});
  if(!up.error) docPaths.push(`tenants/${a.id}/${stamp}-accountant.pdf`);
  assert(up.error,'accountant uploaded');
 });
 await test('documents bucket rejects file types the app does not offer', async()=>{
  const p=`tenants/${a.id}/${stamp}-script.html`;
  const up=await tenantA.storage.from('documents').upload(p,new TextEncoder().encode('<script></script>'),{contentType:'text/html'});
  if(!up.error) docPaths.push(p);
  assert(up.error,'an HTML file was accepted');
 });

 // Maintenance photos follow the request.
 const req=checked(await service.from('maintenance_requests').select('id').eq('tenant_id',a.id).limit(1).maybeSingle());
 if(req){
  const photoPath=`${req.id}/${stamp}-verify.jpg`;
  await test(`tenant uploads and lists a photo on own request ${req.id}`, async()=>{
   checked(await tenantA.storage.from('maintenance-photos').upload(photoPath,jpg,{contentType:'image/jpeg'})); photoPaths.push(photoPath);
   assert(checked(await tenantA.storage.from('maintenance-photos').list(req.id)).some(o=>photoPath.endsWith(o.name)));
  });
  await test('another tenant cannot open request photos', async()=>{ assert((await tenantB.storage.from('maintenance-photos').createSignedUrl(photoPath,60)).error); });
  await test('accountant cannot upload request photos', async()=>{
   const p=`${req.id}/${stamp}-acc.jpg`; const up=await accountant.storage.from('maintenance-photos').upload(p,jpg,{contentType:'image/jpeg'});
   if(!up.error) photoPaths.push(p); assert(up.error);
  });
  await test('photos need an existing, visible request', async()=>{
   const up=await tenantA.storage.from('maintenance-photos').upload(`MR-missing-${stamp}/x.jpg`,jpg,{contentType:'image/jpeg'});
   assert(up.error);
  });
 } else console.log('SKIP request photos: demo tenant has no maintenance request');
} finally {
 for(const c of clients) await c.auth.signOut();
 if(docIds.length) await service.from('documents').delete().in('id',docIds);
 if(docPaths.length) await service.storage.from('documents').remove(docPaths);
 if(photoPaths.length) await service.storage.from('maintenance-photos').remove(photoPaths);
 if(fixtureId) checked(await service.auth.admin.deleteUser(fixtureId));
}
console.log(failures ? `${failures} check(s) failed. Temporary files and account removed.` : 'All upload checks passed. Temporary files and account removed.');
process.exitCode = failures ? 1 : 0;
