import test from 'node:test';
import assert from 'node:assert/strict';
import {createMobileWallet} from './mobile-wallet.js';
import {mountNative} from './native.js';
import {parseHTML} from 'linkedom';
test('mobile wallet uses Sepolia relay, explicit approval and the native MetaMask handoff',async()=>{
 const {window:dom,document}=parseHTML('<html></html>'),events=new dom.EventTarget(),messages=[];
 const win={location:{origin:'https://kairo-site-7fb.pages.dev',hash:''},history:{length:1},navigator:{userAgent:'Android KairoAndroid/1.1.0'},crypto:{randomUUID:()=> 'wallet-test'},setTimeout,clearTimeout,ReactNativeWebView:{postMessage:data=>messages.push(JSON.parse(data))},addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events)};
 mountNative(win,document);
 let options,connectOptions,disconnects=0;
 const wallet=await createMobileWallet(win,async value=>{options=value;return {getProvider:()=>({request:async args=>args.method,on(){},removeListener(){}}),connect:value=>{connectOptions=value;return new Promise(()=>{});},disconnect:async()=>{disconnects++;}};});
 assert.equal(options.dapp.nativeScheme,'kairo://wallet-return');assert.equal(options.ui.preferExtension,false);assert.equal(options.analytics.enabled,false);assert.equal(await wallet.provider.request({method:'eth_chainId'}),'eth_chainId');
 const pending=wallet.connect();await Promise.resolve();
 assert.deepEqual(connectOptions,{chainIds:['0xaa36a7'],forceRequest:true});
 options.mobile.preferredOpenLink('metamask://connect/mwp?test=1');assert.equal(messages[0].type,'open-wallet');
 win.dispatchEvent(new dom.CustomEvent('kairo-native-result',{detail:{id:'wallet-test',error:'MetaMask not installed'}}));
 await assert.rejects(pending,/not installed/);assert.equal(disconnects,1);
});
