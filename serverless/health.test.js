import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {health} from './health.js';
import {ServiceError,errorResponse} from './errors.js';
test('a hanging dependency times out and identifies itself without blocking healthy probes',async t=>{
 t.mock.method(console,'error',()=>{});const timers=[];
 const context={ServiceError,errorResponse,checkConfig(){},Promise,Response,Request,clearTimeout:timer=>{timer.done=true;},setTimeout:(fn,ms)=>{assert.equal(ms,10000);const timer={fn};timers.push(timer);return timer;},
  request:new Request('https://kairo.test/api/health'),env:{DB:{prepare:()=>({all:async()=>[]})},MEDIA:{get:()=>new Promise(()=>{})},MINT:{idFromName:()=>'',get:()=>({fetch:async()=>Response.json({ok:true})})}},
  connectChain:async()=>({provider:{getCode:async()=> '0x1234'},contract:{nextEventId:async()=>1n}})
 };
 const pending=vm.runInNewContext(`${health.toString()}; health(request,env,connectChain)`,context);
 await new Promise(resolve=>setImmediate(resolve));const unresolved=timers.filter(timer=>!timer.done);assert.equal(unresolved.length,1);unresolved[0].fn();
 const response=await pending;assert.equal(response.status,503);const data=await response.json();assert.equal(data.dependencies.r2.code,'DEPENDENCY_TIMEOUT');assert.equal(data.dependencies.rpc.status,'ok');
});
