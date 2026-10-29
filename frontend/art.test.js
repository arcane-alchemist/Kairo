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
 const {document,window}=parseHTML('<div id="press-art"></div><button id="press-button"></button><span id="press-readout"></span>');
 const source=readFileSync(new URL('./press.js',import.meta.url),'utf8');
 const context=vm.createContext({document,pressGeometry,matchMedia:()=>({matches:true,addEventListener(){}})});
 vm.runInContext(source.slice(source.indexOf('export function mountPress')).replace('export function','function')+';mountPress(document.querySelector("#press-art"),document.querySelector("button"),document.querySelector("#press-readout"));',context);
 const button=document.querySelector('button');button.dispatchEvent(new window.Event('click'));
 assert.match(document.querySelector('#press-readout').textContent,/01 MEMORY PRESSED/);
 assert.equal(button.disabled,false);assert.match(document.querySelector('[role="status"]').textContent,/1 memory pressed/);
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
