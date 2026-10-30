import test from 'node:test';
import assert from 'node:assert/strict';
import { badgeSvg } from './art.js';
import { pressGeometry } from './press.js';

test('decorative badge SVGs have self-contained references', () => {
  for (const kind of ['flower','planet','sun','eye','music','heart']) {
    const art = badgeSvg(kind, `test-${kind}`, 'DECORATIVE ART');
    assert.ok(art.startsWith('<svg'));
    for (const [, ref] of art.matchAll(/(?:href="#|url\(#)([\w-]+)/g)) assert.ok(art.includes(`id="${ref}"`), `missing SVG reference ${ref}`);
    assert.ok(!art.includes('undefined'));
  }
});

test('memory press contains a detailed mechanism with a distinct moving head', () => {
  const { svg, projection } = pressGeometry();
  assert.ok((svg.match(/class="iso-solid"/g) || []).length >= 40);
  assert.equal((svg.match(/id="press-head"/g) || []).length, 1);
  assert.ok(svg.includes('role="img"'));
  assert.ok(projection.scale > 0);
  assert.ok(!svg.includes('NaN'));
});

test('the memory press remains usable in reduced motion and announces each completed memory',async()=>{
 const {parseHTML}=await import('linkedom');const vm=await import('node:vm');const {readFileSync}=await import('node:fs');
 const {document,window}=parseHTML(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));
 const head=document.querySelector('#press-head');
 const source=readFileSync(new URL('./press-controls.js',import.meta.url),'utf8');
 const context=vm.createContext({document,matchMedia:()=>({matches:true,addEventListener(){}})});
 vm.runInContext(source.replace('export function','function')+';mountPress(document.querySelector("#press-art"),document.querySelector("#press-button"),document.querySelector("#press-readout"));',context);
 assert.equal(document.querySelector('#press-head'),head);
 const button=document.querySelector('#press-button');button.dispatchEvent(new window.Event('click'));
 assert.match(document.querySelector('#press-readout').textContent,/01 MEMORY PRESSED/);
 assert.equal(button.disabled,false);assert.match(document.querySelector('#press-art [role="status"]').textContent,/1 memory pressed/);
});

test('press animation uses its build-time travel and preserves existing artwork',async()=>{
 const {parseHTML}=await import('linkedom');const vm=await import('node:vm');const {readFileSync}=await import('node:fs');
 const {iso}=await import('./vendor/anatomy/iso-kit.mjs');
 const {document,window}=parseHTML(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));
 const container=document.querySelector('#press-art'),head=container.querySelector('#press-head');
 const travel=JSON.parse(container.dataset.pressTravel);
 assert.deepEqual(travel,iso([0,0,-22],{...pressGeometry().projection,origin:[0,0]}));
 let frames,finish;
 head.animate=value=>{frames=value;return {finished:new Promise(resolve=>{finish=resolve;})};};
 const source=readFileSync(new URL('./press-controls.js',import.meta.url),'utf8');
 vm.runInNewContext(source.replace('export function','function')+';mountPress(document.querySelector("#press-art"),document.querySelector("#press-button"),document.querySelector("#press-readout"));',{document,matchMedia:()=>({matches:false,addEventListener(){}})});
 const button=document.querySelector('#press-button');button.dispatchEvent(new window.Event('click'));
 assert.equal(button.disabled,true);
 assert.equal(frames[1].transform,`translate(${travel[0]}px,${travel[1]}px)`);
 finish();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(button.disabled,false);assert.equal(container.querySelector('#press-head'),head);
 assert.match(document.querySelector('#press-readout').textContent,/01 MEMORY PRESSED/);
});

test('a coin without WebGL retains a working spin control and motion pause toggle',async()=>{
 const {parseHTML}=await import('linkedom');const vm=await import('node:vm');const {readFileSync}=await import('node:fs');
 const {document,window}=parseHTML('<div id="coin-stage"><div class="coin-fallback"></div></div><button id="spin-coin"></button><button id="pause-motion"></button>');
 let spins=0;document.querySelector('.coin-fallback').animate=()=>{spins++;};
 const source=readFileSync(new URL('./scene.js',import.meta.url),'utf8');
 vm.runInNewContext(source.slice(source.indexOf('export function mountCoinFallback'),source.indexOf('export async function mountCoin')).replace('export function','function')+';mountCoinFallback(document.querySelector("#coin-stage"),document.querySelector("#spin-coin"),document.querySelector("#pause-motion"));mountCoinFallback(document.querySelector("#coin-stage"),null,null);', {document,CustomEvent:window.CustomEvent,matchMedia:()=>({matches:false})});
 document.querySelector('#spin-coin').click();assert.equal(spins,1);
 const pause=document.querySelector('#pause-motion');pause.click();assert(document.documentElement.classList.contains('motion-paused'));assert.equal(pause.getAttribute('aria-pressed'),'true');
 pause.click();assert.equal(pause.getAttribute('aria-pressed'),'false');
});
