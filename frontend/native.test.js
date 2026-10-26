import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {mountNative,nativeRequest,downloadQR,isNativeApp} from './native.js';
function setup(){const {window:dom,document}=parseHTML('<html><body><dialog></dialog></body></html>');const signals=new dom.EventTarget(),messages=[];const window={navigator:{userAgent:'Android KairoAndroid/1.1.0'},crypto:{randomUUID:()=> 'request-1'},ReactNativeWebView:{postMessage:message=>messages.push(JSON.parse(message))},history:{length:1,back(){}},location:{hash:''},setTimeout:()=>1,clearTimeout(){},CustomEvent:dom.CustomEvent,Event:dom.Event,addEventListener:signals.addEventListener.bind(signals),dispatchEvent:signals.dispatchEvent.bind(signals)};mountNative(window,document);return {window,document,messages};}
test('Android QR export waits for native file completion and handles errors',async()=>{
 const f=setup();assert(isNativeApp(f.window));const result=downloadQR('data:image/png;base64,test','kairo-drop-2.png',f.window,f.document);assert.equal(f.messages[0].type,'save-file');
 f.window.dispatchEvent(new f.window.CustomEvent('kairo-native-result',{detail:{id:'request-1',result:{completed:true}}}));assert.deepEqual(await result,{completed:true});
 const failed=nativeRequest('open-wallet',{url:'metamask://connect'},f.window);f.window.dispatchEvent(new f.window.CustomEvent('kairo-native-result',{detail:{id:'request-1',error:'MetaMask not installed'}}));await assert.rejects(failed,/not installed/);
});
test('Android back closes a dialog before navigating or exiting',()=>{
 const f=setup(),dialog=f.document.querySelector('dialog');dialog.open=true;dialog.close=()=>{dialog.open=false;};
 f.window.dispatchEvent(new f.window.Event('kairo-android-back'));assert.equal(dialog.open,false);assert.equal(f.messages.length,0);
 f.window.dispatchEvent(new f.window.Event('kairo-android-back'));assert.equal(f.messages[0].type,'back-root');
});
