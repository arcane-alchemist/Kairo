import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {installPrivy} from './privy.js';

async function bridge({ready=true,authenticated=false,logoutError,loginError,resetSession=true,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
 const callbacks={},calls=[];
 let state=null,render,activeWallets=[];
 const effects=[];
 const context=vm.createContext({
  sepolia:{id:11155111},PrivyProvider:()=>{},
  setTimeout:setTimer,clearTimeout:clearTimer,
  createElement:(type,props,...children)=>({type,props,children}),
  createRoot:()=>({render(element){render=()=>{element.children[0].type();while(effects.length)effects.shift()();};render();},unmount(){}}),
  useEffect:fn=>effects.push(fn),
  useState:()=>[state,value=>{state=value;queueMicrotask(render);} ],
  usePrivy:()=>({ready,authenticated,logout:async()=>{
   calls.push('logout');
   if(logoutError)throw logoutError;
   if(resetSession){authenticated=false;queueMicrotask(render);}
  }}),
  useWallets:()=>({ready:true,wallets:activeWallets}),
  useConnectWallet:options=>{callbacks.wallet=options;return {connectWallet:options=>calls.push(['wallet',options])};},
  useLogin:options=>{callbacks.auth=options;return {login:()=>{
   if(authenticated)throw Error('Cannot call login for an authenticated Privy session');
   calls.push(['auth']);if(loginError)return Promise.reject(loginError);
  }};}
 });
 const source=readFileSync(new URL('./privy-wallet.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
 vm.runInContext(source+';globalThis.mount=mountPrivy;',context);
 const sdk=await context.mount({createElement:()=>({remove(){}}),body:{append(){}}});
 return {sdk,callbacks,calls,setWallets:wallets=>{activeWallets=wallets;render();}};
}

test('mounting Privy does not open authentication or the wallet chooser',async()=>{
 const {calls}=await bridge();
 assert.deepEqual(calls,[]);
});

test('a restored Privy session stays quiet until Connect, then opens authentication with a fresh session',async()=>{
 const {sdk,calls,callbacks,setWallets}=await bridge({authenticated:true});
 assert.deepEqual(calls,[]);
 const connection=sdk.connect();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls,['logout',['auth']]);
 const address='0x2222222222222222222222222222222222222222',provider={request(){}};
 setWallets([{address,switchChain:async()=>{},walletClientType:'privy',getEthereumProvider:async()=>provider}]);
 callbacks.auth.onComplete({loginAccount:{type:'email',address:'person@example.test'},user:{wallet:{address}}});
 assert.equal((await connection).provider,provider);
});

test('failed login or session reset releases the pending connection so Connect can retry',async()=>{
 for(const options of [{loginError:Error('Login failed')},{authenticated:true,logoutError:Error('Logout failed')}]){
  const {sdk}=await bridge(options);
  await assert.rejects(sdk.connect(),/could not be completed/);
  await assert.rejects(sdk.connect(),/could not be completed/);
 }
});

test('a restored session that never clears cannot leave Connect stuck',async()=>{
 const timers=[];
 const {sdk}=await bridge({authenticated:true,resetSession:false,setTimer:fn=>{timers.push(fn);return timers.length;},clearTimer(){}});
 const connection=sdk.connect(),failed=assert.rejects(connection,/could not be completed/);
 timers.at(-1)();await failed;
 const retry=sdk.connect(),retried=assert.rejects(retry,/could not be completed/);
 timers.at(-1)();await retried;
});

test('page-load warmup and the authentication bridge share one mount and open login only on Connect wallet',async()=>{
 const win=new EventTarget();let mounted,loads=0;
 installPrivy(win,{readyState:'loading'},async()=>({mountPrivy:async()=>{
  loads++;mounted=await bridge();return mounted.sdk;
 }}));
 assert.equal(loads,0);
 win.dispatchEvent(new Event('load'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(loads,1);assert.deepEqual(mounted.calls,[]);
 const connection=win.kairoPrivy.connect();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(mounted.calls,[['auth']]);assert.equal(loads,1);
 const address='0x1111111111111111111111111111111111111111',provider={request(){}};
 mounted.setWallets([{address,switchChain:async()=>{},walletClientType:'metamask',getEthereumProvider:async()=>provider}]);
 mounted.callbacks.auth.onComplete({loginAccount:{type:'wallet',address},user:{wallet:{address}}});
 const wallet=await connection;
 assert.equal(wallet.address,address);assert.equal(wallet.provider,provider);
 assert.equal((await win.kairoPrivy.restore(address)).address,address);
 await win.kairoPrivy.disconnect();assert(mounted.calls.includes('logout'));
});

test('switch chooser ignores an earlier authentication cancellation and resolves the selected wallet',async()=>{
 const {sdk,callbacks,calls}=await bridge();
 const connection=sdk.connect(undefined,{switchAccount:true});
 callbacks.auth.onError('exited_auth_flow');
 const provider={request(){}};
 callbacks.wallet.onSuccess({wallet:{address:'0x1111111111111111111111111111111111111111',switchChain:async()=>{},walletClientType:'rainbow',getEthereumProvider:async()=>provider}});
 assert.equal((await connection).provider,provider);
 assert.equal(calls[0][0],'wallet');assert.equal(calls[0][1],undefined);
 assert(!calls.includes('logout'));
});

test('closing the active Privy flow produces a friendly cancellation and allows retry',async()=>{
 const {sdk,callbacks}=await bridge();
 const connection=sdk.connect();const rejected=assert.rejects(connection,error=>error.code===4001&&!error.message.includes('exited_auth_flow'));
 callbacks.auth.onError('exited_auth_flow');await rejected;
 const retry=sdk.connect(undefined,{switchAccount:true});const cancelled=assert.rejects(retry,{code:4001});
 callbacks.wallet.onError('exited_auth_flow');await cancelled;
});


test('Connect wallet opens Privy authentication and waits for the selected Ethereum provider',async()=>{
 const {sdk,callbacks,calls,setWallets}=await bridge();
 const address='0x1111111111111111111111111111111111111111',provider={request(){}};
 const connection=sdk.connect();
 assert.equal(calls[0][0],'auth');
 callbacks.auth.onComplete({loginAccount:{type:'wallet',address},user:{wallet:{address}}});
 await new Promise(resolve=>setImmediate(resolve));
 setWallets([{address,switchChain:async()=>{},walletClientType:'metamask',getEthereumProvider:async()=>provider}]);
 const result=await connection;
 assert.equal(result.address,address);assert.equal(result.provider,provider);
});

test('email authentication uses the embedded wallet rather than the email address',async()=>{
 const {sdk,callbacks,setWallets}=await bridge();
 const address='0x2222222222222222222222222222222222222222',provider={request(){}};
 const connection=sdk.connect();
 setWallets([{address,switchChain:async()=>{},walletClientType:'privy',getEthereumProvider:async()=>provider}]);
 callbacks.auth.onComplete({loginAccount:{type:'email',address:'person@example.test'},user:{wallet:{address}}});
 const result=await connection;
 assert.equal(result.address,address);assert.equal(result.provider,provider);
});


test('a stalled Privy initialization fails with a retry message instead of leaving Connect wallet busy',async()=>{
 await assert.rejects(bridge({ready:false,setTimer:fn=>{queueMicrotask(fn);return 1;},clearTimer(){}}),/Privy could not load.*try Connect wallet again/);
});

 test('Privy switches the selected mobile wallet to Sepolia before returning its provider',async()=>{
  for(const name of ['metamask','rainbow','coinbase_wallet','wallet_connect','privy']) {
   const {sdk,callbacks}=await bridge();const steps=[],provider={request(){}};
   const connection=sdk.connect(['metamask']);
   callbacks.wallet.onSuccess({wallet:{address:'0x1111111111111111111111111111111111111111',walletClientType:name,
    switchChain:async chain=>{assert.equal(chain,11155111);steps.push('switch');},getEthereumProvider:async()=>{steps.push('provider');return provider;}}});
   assert.equal((await connection).provider,provider);assert.deepEqual(steps,['switch','provider']);
  }
 });
 test('rejecting Sepolia switching rejects the connection and permits retry',async()=>{
  const {sdk,callbacks}=await bridge();let providers=0;
  const wallet={address:'0x1111111111111111111111111111111111111111',walletClientType:'metamask',switchChain:async()=>{throw Object.assign(Error('Cancelled'),{code:4001});},getEthereumProvider:async()=>{providers++;}};
  const connection=sdk.connect(['metamask']);const failed=assert.rejects(connection,{code:4001});callbacks.wallet.onSuccess({wallet});await failed;assert.equal(providers,0);
  wallet.switchChain=async()=>{};const retry=sdk.connect(['metamask']);callbacks.wallet.onSuccess({wallet});await retry;assert.equal(providers,1);
 });
