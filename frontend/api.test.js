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

test('admin health may display a degraded dependency without forwarding internal options to fetch',async()=>{
 let options;const request=createApiClient({fetchRequest:async(path,input)=>{options=input;return Response.json({status:'degraded',dependencies:{rpc:{status:'error',code:'CONTRACT_MISMATCH'}}},{status:503});}});
 const health=await request('/health',{allowDegraded:true});assert.equal(health.dependencies.rpc.code,'CONTRACT_MISMATCH');assert.equal(options.allowDegraded,undefined);
});

test('publishing setup errors retain their actionable message and quiet is never sent to fetch',async()=>{
 let sent;const request=createApiClient({fetchRequest:async(path,options)=>{sent=options;return Response.json({code:'RELAYER_MISMATCH',error:'Use the key matching the configured relayer.'},{status:503});},retryDelays:[]});
 await assert.rejects(request('/organizer/events',{method:'POST',quiet:true}),error=>error.message==='Use the key matching the configured relayer.');
 assert.equal(sent.quiet,undefined);
});

test('missing configuration reports the safe server diagnostic instead of an opaque generic error',async()=>{
 const api=createApiClient({fetchRequest:async()=>Response.json({code:'NOT_CONFIGURED',error:'Kairo configuration is missing: SUPER_ADMIN_ADDRESS.'},{status:503})});
 await assert.rejects(api('/config'),error=>error.code==='NOT_CONFIGURED'&&error.message.includes('SUPER_ADMIN_ADDRESS'));
});

test('publication may extend its timeout without forwarding timeout configuration to fetch',async()=>{
 const request=createApiClient({timeoutMs:1,fetchRequest:async(path,options)=>{
  assert.equal(options.timeoutMs,undefined);
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(options.signal.aborted,false);
  return Response.json({status:'pending'});
 }});
 assert.equal((await request('/organizer/events',{method:'POST',timeoutMs:50})).status,'pending');
});
