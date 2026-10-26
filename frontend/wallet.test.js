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
  assert.equal(await wallet.connect(),address); assert.equal(wallet.provider,mm);
  assert.deepEqual(mm.methods,['wallet_requestPermissions','eth_requestAccounts']);
  await wallet.connect(); assert.equal(mm.methods.filter(m=>m==='wallet_requestPermissions').length,2);
});
test('rejected permission never reads accounts or leaves an app connection', async () => {
  const mm=provider({async request({method}) {this.methods.push(method);throw Object.assign(Error('Declined'),{code:4001});}}); const wallet=metaMaskWallet(win(mm));
  await assert.rejects(wallet.connect(),{code:4001}); assert.deepEqual(mm.methods,['wallet_requestPermissions']); assert.throws(()=>wallet.provider,/Connect/);
});
test('EIP-6963 selects MetaMask even when another extension owns window.ethereum', async () => {
  const mm=provider(), other=provider({isMetaMask:false});const window=win(other); const wallet=metaMaskWallet(window);
  const event=new Event('eip6963:announceProvider');event.detail={info:{rdns:'io.metamask'},provider:mm};window.dispatchEvent(event);
  await wallet.connect();assert.equal(wallet.provider,mm);assert.equal(other.methods.length,0);
});
test('account or chain changes disconnect instead of silently adopting a wallet', async () => {
  for(const event of ['accountsChanged','chainChanged','disconnect']) {
    const mm=provider();let invalidated=0;const wallet=metaMaskWallet(win(mm),()=>invalidated++);await wallet.connect();
    mm.listeners.get(event)(['0x2222222222222222222222222222222222222222']);assert.equal(invalidated,1);assert.throws(()=>wallet.provider,/Connect/);
  }
});
test('only one permission prompt can run and absent MetaMask never selects another wallet', async () => {
  let resolve;const mm=provider({request:({method})=>method==='wallet_requestPermissions'?new Promise(r=>resolve=r):Promise.resolve([address])});
  const wallet=metaMaskWallet(win(mm));const first=wallet.connect();await assert.rejects(wallet.connect(),/already open/);resolve([]);await first;
  await assert.rejects(metaMaskWallet(win(provider({isMetaMask:false}))).connect(),/not detected/);
});

test('Android requests a real mobile-client connection instead of inventing an injected account',async()=>{
 const mobileProvider=provider();let connects=0,loads=0;const window=win();window.navigator={userAgent:'Android KairoAndroid/1.1.0'};window.ReactNativeWebView={postMessage(){}};
 const wallet=metaMaskWallet(window,()=>{},async()=>{loads++;return {provider:mobileProvider,async connect(){connects++;return {accounts:[address],chainId:'0xaa36a7'};},async disconnect(){}};});
 assert.equal(loads,0);assert.throws(()=>wallet.provider,/Connect/);assert.equal(await wallet.connect(),address);assert.equal(loads,1);assert.equal(connects,1);assert.equal(wallet.provider,mobileProvider);
});
