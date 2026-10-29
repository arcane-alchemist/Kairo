import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {health} from './health.js';
import {mediaBaseURL} from './media.js';
import {ServiceError,errorResponse} from './errors.js';
test('a hanging dependency times out and identifies itself without blocking healthy probes',async t=>{
 t.mock.method(console,'error',()=>{});const timers=[];
 const context={ServiceError,errorResponse,mediaBaseURL,checkConfig(){},Promise,Response,Request,clearTimeout:timer=>{timer.done=true;},setTimeout:(fn,ms)=>{assert.equal(ms,10000);const timer={fn};timers.push(timer);return timer;},
  request:new Request('https://kairo.test/api/health'),env:{SUPER_ADMIN_ADDRESS:'admin',ISSUER_ADDRESS:'issuer',DB:{prepare:()=>({all:async()=>[]})},MEDIA:{get:()=>new Promise(()=>{})},MINT:{idFromName:()=>'',get:()=>({fetch:async()=>Response.json({ok:true})})}},
  connectChain:async()=>({assertContract:async()=>{},provider:{getCode:async()=> '0x1234',getBalance:async()=>1n}})
 };
 const pending=vm.runInNewContext(`${health.toString()}; health(request,env,connectChain)`,context);
 await new Promise(resolve=>setImmediate(resolve));const unresolved=timers.filter(timer=>!timer.done);assert.equal(unresolved.length,1);unresolved[0].fn();
 const response=await pending;assert.equal(response.status,503);const data=await response.json();assert.equal(data.dependencies.r2.code,'DEPENDENCY_TIMEOUT');assert.equal(data.dependencies.rpc.status,'ok');
});

test('an old contract reports CONTRACT_MISMATCH rather than an RPC outage',async t=>{
 t.mock.method(console,'error',()=>{});
 const context={ServiceError,errorResponse,mediaBaseURL,checkConfig(){},Promise,Response,Request,setTimeout,clearTimeout,
  request:new Request('https://kairo.test/api/health'),env:{SUPER_ADMIN_ADDRESS:'admin',ISSUER_ADDRESS:'issuer',DB:{prepare:()=>({all:async()=>[]})},MEDIA:{get:async()=>null},MINT:{idFromName:()=>'',get:()=>({fetch:async()=>Response.json({ok:true})})}},
  connectChain:async()=>({assertContract:async()=>{throw new ServiceError('CONTRACT_MISMATCH','Deploy the updated contract.','contract');},provider:{getCode:async()=> '0x1234',getBalance:async()=>1n}})
 };
 const response=await vm.runInNewContext(`${health.toString()}; health(request,env,connectChain)`,context);assert.equal(response.status,503);const data=await response.json();assert.equal(data.dependencies.rpc.status,'ok');assert.equal(data.dependencies.contract.code,'CONTRACT_MISMATCH');
});

test('healthy deployment reports ready and shares one Sepolia connection across probes',async()=>{
 let connects=0;
 const context={ServiceError,errorResponse,mediaBaseURL,checkConfig(){},Promise,Response,Request,setTimeout,clearTimeout,
  request:new Request('https://kairo.test/api/health'),env:{CONTRACT_ADDRESS:'contract',SUPER_ADMIN_ADDRESS:'admin',ISSUER_ADDRESS:'issuer',DB:{prepare:()=>({all:async()=>[]})},MEDIA:{get:async()=>null},MINT:{idFromName:()=>'',get:()=>({fetch:async()=>Response.json({ok:true})})}},
  connectChain:async()=>{connects++;return {assertContract:async()=>{},provider:{getCode:async()=> '0x1234',getBalance:async()=>1n}};}
 };
 const response=await vm.runInNewContext(`${health.toString()}; health(request,env,connectChain)`,context);assert.equal(response.status,200);assert.equal((await response.json()).status,'ok');assert.equal(connects,1);
});

test('missing POAP request migration makes readiness fail even when chain and relayer are healthy',async t=>{
 t.mock.method(console,'error',()=>{});
 const context={ServiceError,errorResponse,mediaBaseURL,checkConfig(){},Promise,Response,Request,setTimeout,clearTimeout,
  request:new Request('https://kairo.test/api/health'),env:{CONTRACT_ADDRESS:'contract',DB:{prepare:sql=>({all:async()=>{if(sql.includes('poap_requests'))throw Error('no such table: poap_requests');return [];}})},MEDIA:{get:async()=>null},MINT:{idFromName:()=>'',get:()=>({fetch:async()=>Response.json({ok:true})})}},
  connectChain:async()=>({assertContract:async()=>{},provider:{getCode:async()=> '0x1234',getBalance:async()=>1n}})
 };
 const response=await vm.runInNewContext(`${health.toString()}; health(request,env,connectChain)`,context);assert.equal(response.status,503);const result=await response.json();assert.equal(result.dependencies.d1.status,'error');assert.equal(result.dependencies.contract.status,'ok');
});

test('public wallet settings remain available without admin credentials while readiness still fails closed',async t=>{
 t.mock.method(console,'error',()=>{});
 const {fixture}=await import('./test-fixture.js');
 const {checkConfig}=await import('./health.js');
 const f=fixture();t.after(()=>f.sqlite.close());delete f.env.SUPER_ADMIN_ADDRESS;
 assert.doesNotThrow(()=>checkConfig(f.env,{publicOnly:true}));
 assert.throws(()=>checkConfig(f.env),{code:'NOT_CONFIGURED'});
 const response=await f.request('/config');assert.equal(response.status,200);
 const config=await response.json();assert.equal(config.chainId,11155111);assert.equal(config.walletNetwork.chainId,'0xaa36a7');
 assert(config.walletNetwork.rpcUrls.length);assert.equal(config.superAdminAddress,undefined);
});

test('invalid public network settings are rejected instead of guessing a network',async()=>{
 const {checkConfig}=await import('./health.js');
 const {fixture}=await import('./test-fixture.js');const f=fixture();
 try {
  for(const values of [{CHAIN_ID:'1'},{PUBLIC_RPC_URL:'javascript:alert(1)'},{CONTRACT_ADDRESS:'invalid'}])assert.throws(()=>checkConfig({...f.env,...values},{publicOnly:true}),{code:'NOT_CONFIGURED'});
 }finally{f.sqlite.close();}
});

test('checked-in Worker configuration provides the supreme admin without local secret files',async()=>{
 const {readFileSync}=await import('node:fs');const {checkConfig}=await import('./health.js');
 const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
 assert.equal(config.vars.SUPER_ADMIN_ADDRESS,'0x4CB1E99035D2812472B2d50DBB590E9C593188bE');
 assert.doesNotThrow(()=>checkConfig(config.vars));
});

test('sponsored publishing readiness requires the relayer key and no QR signing secret',async t=>{
 const {fixture}=await import('./test-fixture.js');const {checkConfig}=await import('./health.js');
 const f=fixture();t.after(()=>f.sqlite.close());delete f.env.QR_HMAC_SECRET;
 assert.doesNotThrow(()=>checkConfig(f.env,{writes:true}));
});
