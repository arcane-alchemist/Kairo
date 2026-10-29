import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {mountHomeArt} from './home-art.js';

function scenePage() {
 return parseHTML('<section data-home><div id="coin-stage"></div><button id="spin-coin">Give it a spin</button><button id="pause-motion"></button><div id="press-art"><svg id="static-press"/></div><button id="press-button">Press a little memory</button><span id="press-readout"></span></section>');
}
test('coin and press initialize immediately without waiting for a viewport callback',async()=>{
 const {document,window}=scenePage(),loaded=[],mounted=[];
 window.IntersectionObserver=class {constructor(){throw Error('Must not gate scene initialization');}};
 await mountHomeArt(document,window,{
  coin:async()=>{loaded.push('coin');return {mountCoin:()=>mounted.push('coin')};},
  press:async()=>{loaded.push('press');return {mountPress:()=>mounted.push('press')};}
 });
 assert.deepEqual(loaded,['coin','press']);assert.deepEqual(mounted,['coin','press']);
});

test('a failed scene retains static artwork and can be retried without blocking the other scene',async()=>{
 const {document,window}=scenePage();let failed=true,coins=0,presses=0;
 await mountHomeArt(document,window,{
  coin:async()=>({mountCoin:()=>{coins++;}}),
  press:async()=>{if(failed)throw Error('Offline');return {mountPress:()=>{presses++;}};}
 });
 assert.equal(coins,1);assert.equal(presses,0);assert(document.querySelector('#static-press'));
 const button=document.querySelector('#press-button');assert.equal(button.hidden,false);assert.match(button.textContent,/Retry/);
 failed=false;await button.onclick();assert.equal(presses,1);assert.equal(button.textContent,'Press a little memory');assert.equal(button.onclick,null);
});

test('the built homepage includes the entire memory press before JavaScript or API requests',()=>{
 const {document}=parseHTML(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));
 assert(document.querySelector('#press-art svg'));assert(document.querySelector('#press-head'));assert(document.querySelector('#pressed-badge'));
});

test('the real homepage mounts both scenes after coin and wallet controls are removed',async()=>{
 const {document,window}=parseHTML(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));
 let coinMounted=false,pressMounted=false;
 await mountHomeArt(document,window,{
  coin:async()=>({mountCoin:(stage,spin,pause)=>{assert(stage);assert.equal(spin,null);assert.equal(pause,null);coinMounted=true;}}),
  press:async()=>({mountPress:(stage,button,readout)=>{assert(stage.querySelector('#press-head'));assert(button);assert(readout);pressMounted=true;}})
 });
 assert(coinMounted&&pressMounted);
 assert.equal(document.querySelector('#home-connect,#wallet-welcome,.hero-actions,.date-label,.press-card'),null);
 assert(document.querySelector('#wallet'));
});
