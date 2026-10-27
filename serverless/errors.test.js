import test from 'node:test';
import assert from 'node:assert/strict';
import {errorResponse} from './errors.js';
import {MintCoordinator} from './mint.js';
test('diagnostic logs retain the failure while redacting keys, secrets and RPC credentials',async t=>{
 const logs=t.mock.method(console,'error',()=>{});const secret='test-private-hashing-secret';const rpc='https://rpc.test/private-token';
 const response=errorResponse(Error(`D1_ERROR: missing table ${secret} ${rpc}`),new Request('https://kairo.test/api/events'),{STUDENT_HASH_SECRET:secret,SEPOLIA_RPC_URL:rpc});
 const data=await response.json();assert.equal(data.code,'DATABASE_ERROR');assert(data.requestId);const output=logs.mock.calls[0].arguments[0];assert(output.includes('missing table'));assert(!output.includes(secret));assert(!output.includes('private-token'));assert(!JSON.stringify(data).includes('missing table'));
});
test('Durable Object health is a read-only storage probe',async()=>{
 let alarms=0;const object=new MintCoordinator({storage:{getAlarm:async()=>null,setAlarm:async()=>alarms++}},{});
 const response=await object.fetch(new Request('https://mint.internal/health'));assert.equal(response.status,200);assert.equal(alarms,0);
 await object.fetch(new Request('https://mint.internal/wake',{method:'POST'}));assert.equal(alarms,1);
});
