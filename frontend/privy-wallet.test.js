import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

async function bridge() {
 const callbacks={},calls=[];
 const context=vm.createContext({
  sepolia:{},PrivyProvider:()=>{},
  createElement:(type,props,...children)=>typeof type==='function'?type(props):null,
  createRoot:()=>({render(){}}),useEffect:fn=>fn(),
  usePrivy:()=>({ready:true,logout:async()=>calls.push('logout')}),
  useWallets:()=>({ready:true,wallets:[]}),
  useConnectWallet:options=>{callbacks.wallet=options;return {connectWallet:options=>calls.push(['wallet',options])};},
  useConnectOrCreateWallet:options=>{callbacks.auth=options;return {connectOrCreateWallet:()=>calls.push(['auth'])};}
 });
 const source=readFileSync(new URL('./privy-wallet.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
 vm.runInContext(source+';globalThis.mount=mountPrivy;',context);
 const sdk=await context.mount({createElement:()=>({}),body:{append(){}}});
 return {sdk,callbacks,calls};
}

test('switch chooser ignores an earlier authentication cancellation and resolves the selected wallet',async()=>{
 const {sdk,callbacks,calls}=await bridge();
 const connection=sdk.connect(undefined,{switchAccount:true});
 callbacks.auth.onError('exited_auth_flow');
 const provider={request(){}};
 callbacks.wallet.onSuccess({wallet:{address:'0x1111111111111111111111111111111111111111',walletClientType:'rainbow',getEthereumProvider:async()=>provider}});
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
