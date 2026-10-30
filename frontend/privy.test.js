import test from 'node:test';
import assert from 'node:assert/strict';
import {installPrivy} from './privy.js';

test('a failed Privy initialization can be retried by the next Connect wallet tap',async()=>{
 let attempts=0,connections=0;
 const win=new EventTarget();
 installPrivy(win,{},async()=>({mountPrivy:async()=>{
  attempts++;
  if(attempts===1)throw Error('Privy could not load');
  return {connect:async()=>{connections++;return {address:'0x1111111111111111111111111111111111111111'};}};
 }}));
 await assert.rejects(win.kairoPrivy.connect(),/could not load/);
 await win.kairoPrivy.connect();await win.kairoPrivy.connect();
 assert.equal(attempts,2);assert.equal(connections,2);
});

test('simultaneous buttons share one Privy mount and preserve connection options',async()=>{
 let mounts=0;
 const win=new EventTarget(),options={switchAccount:true},calls=[];
 installPrivy(win,{},async()=>({mountPrivy:async()=>{
  mounts++;
  return {connect:async(...args)=>calls.push(args),restore:async address=>({address})};
 }}));
 await Promise.all([win.kairoPrivy.connect(undefined,options),win.kairoPrivy.restore('0xwallet')]);
 assert.equal(mounts,1);assert.equal(calls[0][1],options);
});

test('page load initializes Privy quietly and Connect wallet reuses the ready SDK',async()=>{
 let imports=0,mounts=0,connections=0;
 const win=new EventTarget();
 installPrivy(win,{readyState:'loading'},async()=>{
  imports++;
  return {mountPrivy:async()=>{mounts++;return {connect:async()=>{connections++;}};}};
 });
 assert.equal(imports,0);
 win.dispatchEvent(new Event('load'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(imports,1);assert.equal(mounts,1);assert.equal(connections,0);
 win.dispatchEvent(new Event('load'));
 await win.kairoPrivy.connect();
 assert.equal(imports,1);assert.equal(mounts,1);assert.equal(connections,1);
});

test('Privy warms up when installed after the page has already loaded',async()=>{
 let mounts=0;
 installPrivy(new EventTarget(),{readyState:'complete'},async()=>({mountPrivy:async()=>{mounts++;return {};}}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(mounts,1);
});

test('an early Connect wallet click shares initialization with page load',async()=>{
 let imports=0,mounts=0,finishImport;
 const win=new EventTarget();
 installPrivy(win,{readyState:'interactive'},()=>{
  imports++;
  return new Promise(resolve=>{finishImport=resolve;});
 });
 const connection=win.kairoPrivy.connect();
 win.dispatchEvent(new Event('load'));
 finishImport({mountPrivy:async()=>{mounts++;return {connect:async()=> 'connected'};}});
 assert.equal(await connection,'connected');
 assert.equal(imports,1);assert.equal(mounts,1);
});

test('a failed background initialization is quiet and retries on Connect wallet',async()=>{
 let attempts=0;
 const win=new EventTarget();
 installPrivy(win,{readyState:'complete'},async()=>({mountPrivy:async()=>{
  if(++attempts===1)throw Error('Offline');
  return {connect:async()=> 'connected'};
 }}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(attempts,1);
 assert.equal(await win.kairoPrivy.connect(),'connected');
 assert.equal(attempts,2);
});

test('a stalled SDK download times out, ignores late modules and allows another Connect attempt',async()=>{
 let timeout,finishDownload,attempts=0,mounts=0;
 const win=new EventTarget();win.setTimeout=fn=>{timeout=fn;return 1;};win.clearTimeout=()=>{};
 const module={mountPrivy:async()=>{mounts++;return {connect:async()=> 'connected'};}};
 installPrivy(win,{readyState:'loading'},()=>++attempts===1?new Promise(resolve=>{finishDownload=resolve;}):Promise.resolve(module));
 const connection=win.kairoPrivy.connect();
 const failed=assert.rejects(connection,/could not download/);
 timeout();await failed;
 finishDownload(module);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(mounts,0);
 assert.equal(await win.kairoPrivy.connect(),'connected');
 assert.equal(attempts,2);assert.equal(mounts,1);
});
