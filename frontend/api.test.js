import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiClient} from './api.js';
test('GET network failures retry with backoff and expose a connection message',async()=>{
 const delays=[];let count=0;const api=createApiClient({fetchRequest:async()=>{count++;throw TypeError('Failed to fetch');},wait:async ms=>delays.push(ms)});
 await assert.rejects(api('/events'),error=>error.code==='UNREACHABLE'&&/Can’t reach Kairo/.test(error.message));assert.equal(count,3);assert.deepEqual(delays,[350,1000]);
});
test('only GET requests retry; server and wallet errors stay distinct',async()=>{
 for(const [options,expected] of [[{},3],[{method:'POST',body:'{}'},1]]){
  let count=0;const api=createApiClient({fetchRequest:async()=>{count++;return Response.json({error:'private detail',code:'DATABASE_ERROR'},{status:503});},wait:async()=>{}});
  await assert.rejects(api('/events',options),/Kairo had a problem/);assert.equal(count,expected);
 }
 for(const [status,code] of [[401,'AUTH_REQUIRED'],[409,'WRONG_NETWORK']]){
  const api=createApiClient({fetchRequest:async()=>Response.json({code},{status})});await assert.rejects(api('/auth/me'),/wallet or the network is wrong/);
 }
});
test('timeouts abort requests, and permanent configuration errors do not retry',async()=>{
 let aborted=false;const api=createApiClient({timeoutMs:5,retryDelays:[],fetchRequest:(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(Error('Aborted'));}))});
 await assert.rejects(api('/events'),/Can’t reach/);assert(aborted);
 let count=0;const broken=createApiClient({fetchRequest:async()=>{count++;return Response.json({code:'NOT_CONFIGURED'},{status:503});}});await assert.rejects(broken('/config'),/configuration needs attention/);assert.equal(count,1);
});
test('a temporary failure recovers without changing cookie or same-origin behavior',async()=>{
 let count=0;const api=createApiClient({wait:async()=>{},fetchRequest:async(url,options)=>{assert.equal(url,'/api/events');assert.equal(options.credentials,'same-origin');return ++count===1?new Response('',{status:502}):Response.json([]);}});assert.deepEqual(await api('/events'),[]);assert.equal(count,2);
});
