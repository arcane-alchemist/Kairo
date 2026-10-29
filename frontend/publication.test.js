import test from 'node:test';
import assert from 'node:assert/strict';
import {submitPublication} from './publication.js';

const payload={id:'saved-publication',title:'Campus event'};
const lost=()=>Object.assign(Error('Lost response'),{status:0,code:'UNREACHABLE'});

test('a lost POST response checks the saved submission without publishing a duplicate',async()=>{
 const requests=[];
 const result=await submitPublication(async(path,options)=>{
  requests.push([path,options]);
  if(options.method==='POST')throw lost();
  return {id:payload.id,status:'live',events:[{id:7}]};
 },payload);
 assert.equal(result.status,'live');assert.equal(requests.length,2);
 assert.equal(requests[0][1].timeoutMs,45000);assert.equal(requests[1][0],'/publications/'+payload.id);
});

test('a request that never arrived retries once with exactly the same submission ID and data',async()=>{
 let posts=0;const bodies=[];
 const result=await submitPublication(async(path,options)=>{
  if(options.method==='POST'){bodies.push(options.body);if(++posts===1)throw lost();return {status:'pending'};}
  throw Object.assign(Error('Not found'),{status:404});
 },payload);
 assert.equal(result.status,'pending');assert.equal(posts,2);assert.equal(bodies[0],bodies[1]);
});

test('validation and setup failures never retry or claim publication succeeded',async()=>{
 for(const error of [Object.assign(Error('Bad dates'),{status:400}),Object.assign(Error('Fund the relayer'),{status:503,code:'RELAYER_UNFUNDED'})]){
  let calls=0;
  await assert.rejects(submitPublication(async()=>{calls++;throw error;},payload),candidate=>candidate===error);
  assert.equal(calls,1);
 }
});

test('unreachable status checks do not trigger blind repeated submissions',async()=>{
 let posts=0;
 await assert.rejects(submitPublication(async(path,options)=>{if(options.method==='POST')posts++;throw lost();},payload),/Lost response/);
 assert.equal(posts,1);
});
