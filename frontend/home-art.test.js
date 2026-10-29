import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountHomeArt} from './home-art.js';

test('optional scenes load once on approach, with the press independent of the medal', async () => {
  const {document,window}=parseHTML('<section data-home><div id="coin-stage"></div><button id="spin-coin"></button><button id="pause-motion"></button><div id="press-art"></div><button id="press-button"></button><span id="press-readout"></span></section>');
  const observers=[],loaded=[],mounted=[];
  window.IntersectionObserver=class {
    constructor(callback){this.callback=callback;observers.push(this);}
    observe(node){this.node=node;} disconnect(){this.disconnected=true;}
  };
  mountHomeArt(document,window,{
    coin:async()=>{loaded.push('coin');return {mountCoin:()=>mounted.push('coin')};},
    press:async()=>{loaded.push('press');return {mountPress:()=>mounted.push('press')};}
  });
  assert.deepEqual(loaded,[]);
  observers[0].callback([{isIntersecting:false}]); assert.deepEqual(loaded,[]);
  observers[0].callback([{isIntersecting:true}]); observers[0].callback([{isIntersecting:true}]);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(loaded,['coin']); assert.deepEqual(mounted,['coin']); assert(observers[0].disconnected);
  observers[1].callback([{isIntersecting:true}]); await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(mounted,['coin','press']);
});

test('failed optional imports leave the product usable and explain unavailable art', async () => {
  const {document,window}=parseHTML('<section><div id="press-art"></div><button id="press-button"></button><span id="press-readout"></span></section>');
  window.IntersectionObserver=undefined;
  mountHomeArt(document,window,{press:async()=>{throw Error('Offline');}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(document.querySelector('#press-readout').textContent,/unavailable/);
  assert(document.querySelector('#press-button').hidden);
});
