import test from 'node:test';
import assert from 'node:assert/strict';
import {circularArtwork} from './circular-artwork.js';

test('landscape, portrait and square uploads become transparent circular PNGs without stretching',async()=>{
 for(const [width,height] of [[1200,600],[600,1200],[512,512]]){
  const calls=[],image={naturalWidth:width,naturalHeight:height,decode:async()=>{}};
  const context=Object.fromEntries(['beginPath','arc','clip','drawImage'].map(name=>[name,(...args)=>calls.push([name,...args])]));
  const canvas={getContext:type=>{assert.equal(type,'2d');return context;},toDataURL:type=>{assert.equal(type,'image/png');return 'data:image/png;base64,circular';}};
  const document={createElement:tag=>tag==='img'?image:canvas};
  assert.equal(await circularArtwork('data:image/jpeg;base64,original',document),'data:image/png;base64,circular');
  assert.equal(canvas.width,512);assert.equal(canvas.height,512);
  assert.equal(image.src,'data:image/jpeg;base64,original');
  assert.deepEqual(calls.slice(0,3),[['beginPath'],['arc',256,256,256,0,Math.PI*2],['clip']]);
  const side=Math.min(width,height);
  assert.deepEqual(calls[3],['drawImage',image,(width-side)/2,(height-side)/2,side,side,0,0,512,512]);
 }
});

test('unreadable artwork and unavailable canvas fail before publication',async()=>{
 await assert.rejects(circularArtwork('broken',{createElement:()=>({decode:async()=>{throw Error('bad image');}})}),/could not be read/);
 await assert.rejects(circularArtwork('empty',{createElement:()=>({decode:async()=>{},naturalWidth:0,naturalHeight:0})}),/dimensions/);
 await assert.rejects(circularArtwork('valid',{createElement:tag=>tag==='img'?{decode:async()=>{},naturalWidth:512,naturalHeight:512}:{getContext:()=>null}}),/could not be prepared/);
});
