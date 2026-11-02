// Checks Paystack payments on the real project: the database rules (20261027000000_paystack_payments.sql)
// and the deployed paystack-* Edge Functions. No money moves: it only starts a test-mode checkout and
// never pays it. A full payment needs a person and a Paystack test card; see PAYMENTS.md.
// Run: node --env-file=.env.local scripts/verify-payments.mjs
// Removes its charges, attempts and temporary accounts afterwards.
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
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
const notMigrated=(e)=>/paystack|paid_at|reference/.test(e?.message ?? '') && /schema cache|does not exist/.test(e.message);
const migrated=(r)=>{ if(notMigrated(r.error)) throw new Error('server not migrated: '+r.error.message); return r; };

const fixtures=[], charges=[];
async function tenantAccount(tenantId){
 const email=`propertyhub-pay-check-${randomUUID()}@example.com`, password=`Verify!${randomUUID()}`;
 const user=checked(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Payment verification'}})).user;
 fixtures.push(user.id);
 checked(await service.from('profiles').update({tenant_id:tenantId}).eq('id',user.id));
 return { client: await login(email,password), id: user.id };
}
async function charge(tenantId, amount=1000){
 const id=`verify-pay-${randomUUID().slice(0,8)}`;
 checked(await service.from('payments').insert({id,tenant_id:tenantId,label:'Payment verification',amount,date:new Date().toISOString().slice(0,10),method:'',status:'pending'}));
 charges.push(id);
 return id;
}
/** Calls an Edge Function directly so the HTTP status is visible. */
async function fn(name, body, { jwt, headers={} }={}){
 const res=await fetch(`${url}/functions/v1/${name}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:publicKey,...(jwt?{Authorization:`Bearer ${jwt}`}:{}),...headers},body:typeof body==='string'?body:JSON.stringify(body)});
 const text=await res.text();
 if(res.status===404 && /not.?found/i.test(text) && !text.includes('Payment not found')) throw new Error(`function ${name} is not deployed`);
 return { status: res.status, text };
}

try {
 // Two tenants in a property the demo manager runs, so the manager's rules can be checked too.
 const grace=checked(await service.from('profiles').select('id').eq('email','grace@adewaleproperties.ng').single());
 const props=checked(await service.from('profile_properties').select('property_id').eq('profile_id',grace.id)).map((p)=>p.property_id);
 const [t1,t2]=checked(await service.from('tenants').select('id').in('property_id',props).limit(2));
 const a=await tenantAccount(t1.id), b=await tenantAccount(t2.id);
 const manager=await login('grace@adewaleproperties.ng');
 const jwtA=(await a.client.auth.getSession()).data.session.access_token;
 const due=await charge(t1.id);

 await test('tenants cannot start or settle payments without the server functions', async()=>{
  const r=migrated(await a.client.rpc('paystack_begin',{p_user:a.id,p_payment_id:due,p_return_url:'propertyhub://myLease'}));
  assert(r.error,'tenant called paystack_begin directly');
  assert((await a.client.rpc('paystack_record',{p_reference:'x',p_status:'success'})).error,'tenant called paystack_record directly');
  assert((await a.client.from('paystack_transactions').insert({reference:'x',payment_id:due,tenant_id:t1.id,amount:1})).error,'tenant inserted an attempt');
 });
 await test('a confirmed payment marks the charge paid once; repeats change nothing', async()=>{
  const begun=checked(migrated(await service.rpc('paystack_begin',{p_user:a.id,p_payment_id:due,p_return_url:'propertyhub://myLease'})));
  assert.equal(Number(begun.amount),1000);
  const data={amount:100000,currency:'NGN',channel:'card',id:1,fees:1500,paid_at:new Date().toISOString()};
  for(let i=0;i<3;i++) assert.equal(checked(await service.rpc('paystack_record',{p_reference:begun.reference,p_status:'success',p_data:data})),'success');
  const c=checked(await service.from('payments').select('status,reference').eq('id',due).single());
  assert.deepEqual(c,{status:'paid',reference:begun.reference});
  const notes=checked(await service.from('notifications').select('id').eq('audience',t1.id).eq('title','Payment received.').gte('at',new Date(Date.now()-60_000).toISOString()));
  assert.equal(notes.length,1,'tenant should be told exactly once');
  checked(await service.from('notifications').delete().in('id',notes.map((n)=>n.id)));
 });
 await test('tenants see their own attempts only', async()=>{
  assert(checked(await a.client.from('paystack_transactions').select('reference').eq('payment_id',due)).length>=1);
  assert.equal(checked(await b.client.from('paystack_transactions').select('reference').eq('payment_id',due)).length,0);
 });
 await test('managers cannot fake or edit Paystack payments, but can record cash by hand', async()=>{
  const cash=await charge(t2.id);
  assert((await manager.from('payments').update({status:'paid',reference:'PH-fake'}).eq('id',cash).select()).error,'manager set a Paystack reference');
  const edit=await manager.from('payments').update({amount:1}).eq('id',due).select();
  assert(edit.error,'manager changed a charge Paystack paid');
  assert.equal(checked(await manager.from('payments').update({status:'paid',method:'Cash'}).eq('id',cash).select()).length,1,'manager could not record cash');
 });

 // ---- Edge Functions
 await test('webhook rejects a bad signature', async()=>{
  const r=await fn('paystack-webhook',{event:'charge.success',data:{reference:'x'}},{headers:{'x-paystack-signature':'0'.repeat(128)}});
  assert.equal(r.status,401,r.text);
 });
 await test('webhook rejects a body signed with the wrong key', async()=>{
  const body=JSON.stringify({event:'charge.success',data:{reference:'x'}});
  const r=await fn('paystack-webhook',body,{headers:{'x-paystack-signature':createHmac('sha512','sk_test_wrong').update(body).digest('hex')}});
  assert.equal(r.status,401,r.text);
 });
 await test('initialize needs a session, an allowed return address and the tenant’s own charge', async()=>{
  const other=await charge(t2.id);
  const due2=await charge(t1.id);
  assert.equal((await fn('paystack-initialize',{paymentId:due2,returnUrl:'propertyhub://myLease'})).status,401);
  const bad=await fn('paystack-initialize',{paymentId:due2,returnUrl:'https://evil.example.com/'},{jwt:jwtA});
  assert.equal(bad.status,400,bad.text);
  const theirs=await fn('paystack-initialize',{paymentId:other,returnUrl:'propertyhub://myLease'},{jwt:jwtA});
  assert.equal(theirs.status,400,theirs.text);
  assert.match(theirs.text,/Payment not found/);
 });
 await test('initialize opens a Paystack test checkout for the server’s amount', async()=>{
  const due3=await charge(t1.id,2500);
  const r=await fn('paystack-initialize',{paymentId:due3,returnUrl:'propertyhub://myLease'},{jwt:jwtA});
  assert.equal(r.status,200,r.text);
  const { reference, authorizationUrl }=JSON.parse(r.text);
  assert.match(authorizationUrl,/^https:\/\/checkout\.paystack\.com\//);
  const tx=checked(await service.from('paystack_transactions').select('amount,status').eq('reference',reference).single());
  assert.deepEqual({amount:Number(tx.amount),status:tx.status},{amount:2500,status:'pending'});
 });
} catch(e) {
 failures++; console.log(`FAIL setup: ${e.message}`);
} finally {
 if(charges.length){
  await service.from('paystack_transactions').delete().in('payment_id',charges);
  await service.from('payments').delete().in('id',charges);
 }
 for(const id of fixtures) await service.auth.admin.deleteUser(id);
}
console.log(failures ? `${failures} check(s) failed. Test charges and accounts removed.` : 'All payment checks passed. Test charges and accounts removed.');
process.exit(failures ? 1 : 0);
