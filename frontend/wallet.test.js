import test from 'node:test';
import assert from 'node:assert/strict';
import {metaMaskWallet} from './wallet.js';
const address = '0x1111111111111111111111111111111111111111';
function provider(extra = {}) {
  const methods = [], listeners = new Map();
  return {isMetaMask:true, methods, listeners, async request({method}) {methods.push(method); return method === 'eth_requestAccounts' ? [address] : [];}, on(event,fn){listeners.set(event,fn);},removeListener(event){listeners.delete(event);},...extra};
}
function win(ethereum) {const target = new EventTarget(); return {ethereum,Event,addEventListener:target.addEventListener.bind(target),dispatchEvent:target.dispatchEvent.bind(target)};}
test('startup never reads an account and explicit connect requests MetaMask permission first', async () => {
  const mm=provider(), other=provider({isMetaMask:false, isPhantom:true}); const wallet=metaMaskWallet(win({providers:[other,mm]}));
  assert.equal(mm.methods.length,0); assert.equal(other.methods.length,0); assert.throws(()=>wallet.provider,/approve/);
  assert.equal(await wallet.connect('metamask'),address); assert.equal(wallet.provider,mm);
  assert.deepEqual(mm.methods,['wallet_requestPermissions','eth_requestAccounts']);
  await wallet.connect('metamask'); assert.equal(mm.methods.filter(m=>m==='wallet_requestPermissions').length,2);
});
test('rejected permission never reads accounts or leaves an app connection', async () => {
  const mm=provider({async request({method}) {this.methods.push(method);throw Object.assign(Error('Declined'),{code:4001});}}); const wallet=metaMaskWallet(win(mm));
  await assert.rejects(wallet.connect('metamask'),{code:4001}); assert.deepEqual(mm.methods,['wallet_requestPermissions']); assert.throws(()=>wallet.provider,/Connect/);
});
test('EIP-6963 selects MetaMask even when another extension owns window.ethereum', async () => {
  const mm=provider(), other=provider({isMetaMask:false});const window=win(other); const wallet=metaMaskWallet(window);
  const event=new Event('eip6963:announceProvider');event.detail={info:{rdns:'io.metamask'},provider:mm};window.dispatchEvent(event);
  await wallet.connect('metamask');assert.equal(wallet.provider,mm);assert.equal(other.methods.length,0);
});
test('account and chain events are reconciled by the shared controller without requesting accounts', async () => {
  for (const event of ['accountsChanged','chainChanged','disconnect']) {
    const mm=provider();let observed;const wallet=metaMaskWallet(win(mm),(type,value)=>observed=[type,value]);await wallet.connect('metamask');
    const before=[...mm.methods];mm.listeners.get(event)(['new-account']);
    assert.deepEqual(observed,[event,['new-account']]);assert.equal(wallet.provider,mm);assert.deepEqual(mm.methods,before);
  }
});
test('only one permission prompt can run and absent MetaMask never selects another wallet', async () => {
  let resolve;const mm=provider({request:({method})=>method==='wallet_requestPermissions'?new Promise(r=>resolve=r):Promise.resolve([address])});
  const wallet=metaMaskWallet(win(mm));const first=wallet.connect('metamask');await assert.rejects(wallet.connect('metamask'),/already open/);resolve([]);await first;
  await assert.rejects(metaMaskWallet(win(provider({isMetaMask:false}))).connect('metamask'),/not detected/);
});

test('Android requests a real mobile-client connection instead of inventing an injected account',async()=>{
 const mobileProvider=provider();let connects=0,loads=0;const window=win();window.navigator={userAgent:'Android KairoAndroid/1.1.0'};window.ReactNativeWebView={postMessage(){}};
 const wallet=metaMaskWallet(window,()=>{},async()=>{loads++;return {provider:mobileProvider,async connect(){connects++;return {accounts:[address],chainId:'0xaa36a7'};},async disconnect(){}};});
 assert.equal(loads,0);assert.throws(()=>wallet.provider,/Connect/);assert.equal(await wallet.connect('metamask'),address);assert.equal(loads,1);assert.equal(connects,1);assert.equal(wallet.provider,mobileProvider);
});

test('MetaMask-only connections reject other providers and never restore them',async()=>{
 const mm=provider(),other=provider({isMetaMask:true,isPhantom:true}),window=win(other);window.phantom={ethereum:other};
 window.ethereum.providers=[other,mm];window.localStorage={getItem:()=> 'phantom'};
 const wallet=metaMaskWallet(window);
 for(const id of ['phantom','rabby','coinbase'])await assert.rejects(wallet.connect(id),/MetaMask only/);
 assert.deepEqual(other.methods,[]);await wallet.connect();assert.equal(wallet.provider,mm);
 wallet.restore();assert.equal(wallet.provider,mm);assert.deepEqual(other.methods,[]);
});
test('unsupported permission API falls back to an explicit account request; rejection never falls back',async()=>{
 const p=provider({async request({method}) {this.methods.push(method);if(method==='wallet_requestPermissions')throw Object.assign(Error('Unsupported'),{code:4200});return [address];}});
 assert.equal(await metaMaskWallet(win(p)).connect(),address);assert.deepEqual(p.methods,['wallet_requestPermissions','eth_requestAccounts']);
});

test('automatic connection chooses MetaMask instead of the browser default wallet',async()=>{
 const other=provider({isMetaMask:false,isCoinbaseWallet:true}),mm=provider(),window=win(other),wallet=metaMaskWallet(window);
 const event=new Event('eip6963:announceProvider');event.detail={info:{rdns:'io.metamask',name:'MetaMask'},provider:mm};window.dispatchEvent(event);
 assert.equal(await wallet.connect(),address);assert.equal(wallet.provider,mm);assert.deepEqual(other.methods,[]);
});

test('missing or rejected MetaMask never falls back to another wallet',async()=>{
 const other=provider({isPhantom:true}),window=win(other);window.phantom={ethereum:other};
 await assert.rejects(metaMaskWallet(window).connect(),/MetaMask was not detected/);assert.deepEqual(other.methods,[]);
 const mm=provider({request:async()=>{throw Object.assign(Error('Declined'),{code:4001});}});window.ethereum={providers:[other,mm]};
 await assert.rejects(metaMaskWallet(window).connect(),{code:4001});assert.deepEqual(other.methods,[]);
});

test('a stalled MetaMask prompt times out and late approval cannot silently connect or read accounts',async()=>{
 let expire,approve;const mm=provider({request({method}){this.methods.push(method);return new Promise(resolve=>{approve=resolve;});}}),window=win(mm);
 window.setTimeout=fn=>{expire=fn;return 1;};window.clearTimeout=()=>{};
 const wallet=metaMaskWallet(window),connection=wallet.connect();expire();
 await assert.rejects(connection,{code:'WALLET_TIMEOUT'});assert.throws(()=>wallet.provider,/Connect/);
 approve([]);await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(mm.methods,['wallet_requestPermissions']);assert.throws(()=>wallet.provider,/Connect/);
});
