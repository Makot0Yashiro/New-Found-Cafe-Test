import test from 'node:test';
import assert from 'node:assert/strict';
import { orderInput, profileInput, publicOrder, InputError } from '../server/validation.js';
import { createHandler } from '../server/handler.js';
const profile={address:'Pedro Guevara Avenue',lat:14.2781,lng:121.4161};
const body=()=>({items:[{id:'c-latte',qty:2,price:1}],order_type:'takeaway',payment:'cash',coupon:'WELCOME10',table_no:'',note:'',request_id:'4bdc7a2f-0ddd-4e39-aeb9-931c5a7aca83'});
test('server prices and coupon determine totals regardless of submitted price',()=>{
  const order=orderInput(body(),profile);
  assert.equal(order.subtotal_cents,24000);assert.equal(order.discount_cents,2400);assert.equal(order.total_cents,21600);assert.equal(order.items[0].price,120);
});
test('reject empty carts, unknown items, fractional quantities and duplicate lines',()=>{
  for(const items of [[],[{id:'unknown',qty:1}],[{id:'c-latte',qty:1.5}],[{id:'c-latte',qty:51}],[{id:'c-latte',qty:1},{id:'c-latte',qty:1}]])
    assert.throws(()=>orderInput({...body(),items},profile),InputError);
});
test('reject invalid order type, payment, coupon, table and retry key',()=>{
  for(const extra of [{order_type:'unknown'},{payment:'unknown'},{coupon:'FREE'},{order_type:'dine-in',table_no:''},{request_id:'bad'}])
    assert.throws(()=>orderInput({...body(),...extra},profile),InputError);
});
test('delivery requires a real saved address and valid complete coordinates',()=>{
  assert.throws(()=>orderInput({...body(),order_type:'delivery'},{address:'',lat:null,lng:null}),InputError);
  assert.throws(()=>orderInput({...body(),order_type:'delivery',dest_lat:Infinity},profile),InputError);
  const order=orderInput({...body(),order_type:'delivery'},profile);
  assert.equal(order.dest_lat,profile.lat);assert.equal(order.address,profile.address);
});
test('profile rejects missing names, oversized input and partial coordinates',()=>{
  const p={name:'Isana',phone:'',address:'',pay_method:'cash',pay_account:'',lat:null,lng:null};
  assert.equal(profileInput(p).name,'Isana');
  for(const extra of [{name:''},{phone:'x'.repeat(26)},{lat:14,lng:null},{lat:'not a number',lng:120},{pay_method:'bad'}])
    assert.throws(()=>profileInput({...p,...extra}),InputError);
});
test('public responses omit ownership and retry keys and convert money',()=>{
  const order=publicOrder({id:1,user_id:'private',request_id:'private',total_cents:21600,subtotal_cents:24000,discount_cents:2400,order_type:'takeaway',dest_lat:null,status:'Received'});
  assert.equal(order.total,216);assert.ok(!('user_id' in order));assert.ok(!('request_id' in order));assert.deepEqual(order.steps,['Received','Preparing','Ready','Completed']);
});
const noDatabase=()=>{throw new Error('Database must not be called');};
test('unauthenticated users cannot read orders or profiles',async()=>{
  const handler=createHandler(async()=>null,noDatabase);
  for(const path of ['/api/orders','/api/account','/api/orders/1/track']){
    const response=await handler(new Request('https://cafe.test'+path));assert.equal(response.status,401);
  }
});
test('cross-origin and non-JSON mutations are rejected before authentication or storage',async()=>{
  const handler=createHandler(async()=>{throw new Error('Auth must not be called');},noDatabase);
  const response=await handler(new Request('https://cafe.test/api/orders',{method:'POST',headers:{Origin:'https://attacker.test','Content-Type':'application/json'},body:'{}'}));assert.equal(response.status,403);
  const form=await handler(new Request('https://cafe.test/api/orders',{method:'POST',headers:{Origin:'https://cafe.test','Content-Type':'application/x-www-form-urlencoded'},body:'x=y'}));assert.equal(form.status,415);
});
test('customer metadata cannot grant staff privileges',async()=>{
  const handler=createHandler(async()=>({id:'customer',roles:['member'],userMetadata:{roles:['admin']}}),noDatabase);
  assert.equal((await handler(new Request('https://cafe.test/api/admin/orders'))).status,403);
});
test('session identifies staff only from trusted roles and does not touch database',async()=>{
  const handler=createHandler(async()=>({id:'staff',email:'staff@example.test',roles:['admin']}),noDatabase);
  const response=await handler(new Request('https://cafe.test/api/session'));
  assert.equal(response.status,200);assert.equal((await response.json()).is_admin,true);assert.equal(response.headers.get('Cache-Control'),'no-store');
});

import { PgDialect } from 'drizzle-orm/pg-core';
import type { database } from '../db/index.js';
import { profiles, orders } from '../db/schema.js';
function fakeDatabase(selected:unknown[], inserted:unknown[]=[]) {
  const queries:{sql:string;params:unknown[]}[]=[];
  const writes:Record<string,unknown>[]=[];
  const fake={
    insert(table:unknown){return {values(value:Record<string,unknown>){
      if(table===profiles)return {onConflictDoUpdate:()=>({returning:async()=>[{id:'owner',name:'Cafe customer',...profile}]})};
      assert.equal(table,orders);writes.push(value);
      return {onConflictDoNothing:()=>({returning:async()=>inserted})};
    }};},
    select(){return {from(){return {where(condition:any){queries.push(new PgDialect().sqlToQuery(condition));return Promise.resolve(selected);}};}};},
  };
  return {connect:()=>fake as unknown as ReturnType<typeof database>,queries,writes};
}
test('customer tracking filters by both order ID and authenticated owner',async()=>{
  const db=fakeDatabase([]);
  const handler=createHandler(async()=>({id:'owner',roles:[]}),db.connect);
  const response=await handler(new Request('https://cafe.test/api/orders/42/track'));
  assert.equal(response.status,404);
  assert.deepEqual(db.queries[0].params,[42,'owner']);
  assert.match(db.queries[0].sql,/user_id/);
});
test('successful checkout saves server totals and authenticated ownership',async()=>{
  const db=fakeDatabase([],[{id:73}]);
  const handler=createHandler(async()=>({id:'owner',roles:[]}),db.connect);
  const response=await handler(new Request('https://cafe.test/api/orders',{method:'POST',headers:{Origin:'https://cafe.test','Content-Type':'application/json'},body:JSON.stringify({...body(),user_id:'attacker',total:1})}));
  assert.equal(response.status,201);assert.equal((await response.json()).id,73);
  assert.equal(db.writes[0].user_id,'owner');assert.equal(db.writes[0].total_cents,21600);
});
test('a repeated checkout returns the existing order after the unique-key conflict',async()=>{
  const db=fakeDatabase([{id:73}]);
  const handler=createHandler(async()=>({id:'owner',roles:[]}),db.connect);
  const response=await handler(new Request('https://cafe.test/api/orders',{method:'POST',headers:{Origin:'https://cafe.test','Content-Type':'application/json'},body:JSON.stringify(body())}));
  assert.equal(response.status,200);assert.equal((await response.json()).id,73);
  assert.deepEqual(db.queries[0].params,['owner',body().request_id]);
});
