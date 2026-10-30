import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./scene.js', import.meta.url), 'utf8');
function controls(width = 360) {
  const handlers = {}, captured = new Set();
  let layoutReads=0;
  const stage = {
    addEventListener: (name, handler) => { handlers[name] = handler; },
    getBoundingClientRect: () => {layoutReads++;return {left:0, top:0, width, height:420};},
    setPointerCapture: id => captured.add(id),
    hasPointerCapture: id => captured.has(id),
    releasePointerCapture: id => captured.delete(id)
  };
  const context = vm.createContext({stage, Math, run(){}});
  vm.runInContext('let dragging=false,startX=0,startYaw=0,targetYaw=0,targetPitch=.12;' + source.slice(source.indexOf("  stage.addEventListener('pointerdown'"), source.indexOf("  document.addEventListener('poap-motion'")), context);
  const fire = (name, values = {}) => handlers[name]({isPrimary:true, button:0, pointerId:1, pointerType:'touch', clientX:0, clientY:0, detail:1, preventDefault(){}, ...values});
  return {fire, yaw:() => vm.runInContext('targetYaw', context), captured, layoutReads:()=>layoutReads};
}

test('a short touch swipe rotates the coin equally on phone and tablet and keeps its position on release', () => {
  for (const width of [360, 820]) {
    const {fire, yaw, captured} = controls(width);
    fire('pointerdown', {clientX:20});
    fire('pointermove', {clientX:20 + width * .325});
    assert.ok(Math.abs(yaw() - Math.PI) < .00001);
    fire('pointerup');
    fire('pointerleave');
    fire('click', {clientX:20 + width * .325});
    assert.ok(Math.abs(yaw() - Math.PI) < .00001);
    assert.equal(captured.size, 0);
  }
});

test('a tap or keyboard activation spins; cancelled gestures and secondary touches do not drag', () => {
  const {fire, yaw} = controls();
  fire('pointerdown', {clientX:50});
  fire('pointerup', {clientX:50});
  fire('click', {clientX:50});
  assert.equal(yaw(), Math.PI * 2);
  fire('keydown', {key:'Enter'});
  fire('keydown', {key:' '});
  assert.equal(yaw(), Math.PI * 6);
  fire('pointerdown', {clientX:50});
  fire('pointercancel');
  fire('pointermove', {clientX:200});
  fire('pointerdown', {isPrimary:false});
  fire('pointermove', {clientX:250});
  assert.equal(yaw(), Math.PI * 6);
});

test('mouse dragging retains its existing sensitivity', () => {
  const {fire, yaw} = controls();
  fire('pointerdown', {pointerType:'mouse'});
  fire('pointermove', {pointerType:'mouse', clientX:100});
  assert.equal(yaw(), 1.2);
});

test('idle touch movement avoids layout reads while dragging remains responsive',()=>{
 const {fire,layoutReads}=controls();
 fire('pointermove');assert.equal(layoutReads(),0);
 fire('pointerdown');fire('pointermove',{clientX:100});assert.equal(layoutReads(),1);
 fire('pointerup');fire('pointermove');assert.equal(layoutReads(),1);
});

test('coin resizes once per size change across phone, tablet and laptop dimensions',()=>{
 const sizes=[];
 const stage={clientWidth:360,clientHeight:420};
 const camera={position:{z:0},updateProjectionMatrix(){}};
 const context=vm.createContext({stage,camera,renderer:{setSize:(...size)=>sizes.push(size)},run(){}});
 const start=source.indexOf('  let previousWidth');
 vm.runInContext(source.slice(start,source.indexOf('  new ResizeObserver',start))+';globalThis.resize=resize;',context);
 for(const [width,height] of [[360,420],[820,600],[1280,720]]){
  stage.clientWidth=width;stage.clientHeight=height;
  context.resize();context.resize();
  assert.equal(camera.aspect,width/height);
 }
 assert.deepEqual(sizes,[[360,420],[820,600],[1280,720]]);
 stage.clientWidth=0;context.resize();assert.equal(sizes.length,3);
});
