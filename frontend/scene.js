import * as THREE from 'three';
import { badgeSvg } from './art.js';

export function mountCoinFallback(stage, spinButton, pauseButton) {
  if (spinButton) spinButton.hidden = false;
  const spin = () => stage.querySelector('.coin-fallback')?.animate?.([
    {transform:'translate(-50%,-50%) rotate(-14deg) rotateY(0deg)'},
    {transform:'translate(-50%,-50%) rotate(-14deg) rotateY(360deg)'}
  ], {duration:matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 1400,easing:'ease-in-out'});
  stage.addEventListener('click', spin);
  stage.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    spin();
  });
  spinButton?.addEventListener('click', spin);
  pauseButton?.addEventListener('click', () => {
    const paused = document.documentElement.classList.toggle('motion-paused');
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.setAttribute('aria-label', paused ? 'Resume animations' : 'Pause animations');
    document.dispatchEvent(new CustomEvent('poap-motion', {detail:paused}));
  });
}

export async function mountCoin(stage, spinButton, pauseButton) {
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch {
    mountCoinFallback(stage, spinButton, pauseButton);
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0, 0);
  stage.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 50);
  camera.position.set(0, .05, 7.3);
  scene.add(new THREE.HemisphereLight(0xfff1ff, 0x75627b, 3));
  const key = new THREE.DirectionalLight(0xfff8e8, 5);
  key.position.set(-3, 5, 6);
  scene.add(key);
  const rimLight = new THREE.DirectionalLight(0xb8ccff, 4);
  rimLight.position.set(4, 1, -2);
  scene.add(rimLight);

  const medal = new THREE.Group();
  scene.add(medal);
  const material = new THREE.MeshPhysicalMaterial({ color: 0xa78ac9, metalness: .48, roughness: .27, clearcoat: 1, clearcoatRoughness: .2, iridescence: .45 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.53, 1.53, .25, 96), material);
  body.rotation.x = Math.PI / 2;
  medal.add(body);

  const edgeMat = new THREE.MeshPhysicalMaterial({ color: 0xe3cff8, metalness: .55, roughness: .24, clearcoat: 1 });
  for (const z of [-.129, .129]) {
    const edge = new THREE.Mesh(new THREE.TorusGeometry(1.493, .037, 12, 96), edgeMat);
    edge.position.z = z;
    medal.add(edge);
  }
  const ribGeometry = new THREE.BoxGeometry(.014, .19, .022);
  const ribs = new THREE.InstancedMesh(ribGeometry, edgeMat, 100);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 100; i++) {
    const angle = i / 100 * Math.PI * 2;
    dummy.position.set(Math.cos(angle) * 1.53, Math.sin(angle) * 1.53, 0);
    dummy.rotation.set(Math.PI / 2, 0, angle - Math.PI / 2);
    dummy.updateMatrix();
    ribs.setMatrixAt(i, dummy.matrix);
  }
  medal.add(ribs);

  async function face(kind, uid, label, z, back = false) {
    const svg = badgeSvg(kind, uid, label);
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1024;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, 1024, 1024);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.51, 96), new THREE.MeshStandardMaterial({ map: texture, roughness: .56, metalness: .06, transparent: true, alphaTest: .05 }));
    disc.position.z = z;
    if (back) disc.rotation.y = Math.PI;
    medal.add(disc);
  }
  try {
    await Promise.all([face('flower', 'front', 'GOOD TIMES GROW HERE', .132), face('sun', 'back', 'A MOMENT MADE FOREVER', -.132, true)]);
  } catch {
    renderer.dispose();
    renderer.domElement.remove();
    mountCoinFallback(stage, spinButton, pauseButton);
    return;
  }

  const satellite = new THREE.Mesh(new THREE.TorusGeometry(.18, .065, 16, 32), new THREE.MeshPhysicalMaterial({ color: 0xc7e970, roughness: .26, metalness: .2, clearcoat: 1 }));
  satellite.position.set(-1.74, -.93, -.25);
  satellite.rotation.set(.5, .6, .2);
  scene.add(satellite);
  const pebble = new THREE.Mesh(new THREE.SphereGeometry(.11, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0xf5aa81, roughness: .23, clearcoat: 1 }));
  pebble.position.set(1.67, .95, -.2);
  scene.add(pebble);

  let frame = 0, last = 0, time = 0, visible = true, paused = false;
  let yaw = -.36, targetYaw = -.36, pitch = .12, targetPitch = .12;
  let dragging = false, startX = 0, startYaw = 0;
  medal.rotation.set(pitch, yaw, -.17);

  function render(now) {
    frame = 0;
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    const calm = still.matches || paused;
    if (!calm) time += dt;
    const follow = calm ? 1 : 1 - Math.exp(-dt / .2);
    yaw += (targetYaw - yaw) * follow;
    pitch += (targetPitch - pitch) * follow;
    medal.rotation.set(pitch + (calm ? 0 : Math.sin(time * .55) * .055), yaw + (calm ? 0 : Math.sin(time * .38) * .13), -.17 + (calm ? 0 : Math.sin(time * .4) * .018));
    medal.position.y = calm ? 0 : Math.sin(time * 1.1) * .09;
    satellite.rotation.z = .2 + time * .3;
    satellite.position.y = -.93 + (calm ? 0 : Math.sin(time * .9 + 1) * .13);
    pebble.position.y = .95 + (calm ? 0 : Math.sin(time * .8) * .08);
    renderer.render(scene, camera);
    const moving = Math.abs(targetYaw - yaw) > .0001 || Math.abs(targetPitch - pitch) > .0001;
    if (visible && !document.hidden && (!calm || moving)) frame = requestAnimationFrame(render);
  }
  function run() { if (!frame && visible && !document.hidden) { last = 0; frame = requestAnimationFrame(render); } }
  const resize = () => {
    const width = stage.clientWidth, height = stage.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.position.z = width < 400 ? 8.05 : 7.3;
    camera.updateProjectionMatrix();
    run();
  };
  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver(entries => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); else { cancelAnimationFrame(frame); frame = 0; } }, { rootMargin: '80px' }).observe(stage);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else run(); });
  still.addEventListener('change', run);

  stage.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    dragging = true; startX = event.clientX; startYaw = targetYaw;
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', event => {
    const box = stage.getBoundingClientRect();
    if (dragging) targetYaw = startYaw + (event.clientX - startX) * (event.pointerType === 'mouse' ? .012 : Math.PI * 2 / Math.max(box.width * .65, 1));
    else if (event.pointerType === 'mouse') { targetYaw = -.36 + ((event.clientX - box.left) / box.width - .5) * .7; targetPitch = .12 + ((event.clientY - box.top) / box.height - .5) * .3; }
    run();
  });
  const release = event => { dragging = false; if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId); };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('lostpointercapture', () => { dragging = false; });
  stage.addEventListener('click', event => {
    if (event.pointerType !== 'mouse' && (!event.detail || Math.abs(event.clientX - startX) < 8)) { targetYaw += Math.PI * 2; run(); }
  });
  stage.addEventListener('pointerleave', event => { if (!dragging && event.pointerType === 'mouse') { targetYaw = -.36; targetPitch = .12; run(); } });
  stage.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Enter' || event.key === ' ') targetYaw += Math.PI * 2;
    if (event.key === 'ArrowLeft') targetYaw -= .3;
    if (event.key === 'ArrowRight') targetYaw += .3;
    if (event.key === 'ArrowUp') targetPitch -= .15;
    if (event.key === 'ArrowDown') targetPitch += .15;
    if (event.key === 'Home') { targetYaw = -.36; targetPitch = .12; }
    run();
  });
  document.addEventListener('poap-motion', event => { paused = event.detail; run(); });
  spinButton?.addEventListener('click', () => { targetYaw += Math.PI * 2; run(); });
  pauseButton?.addEventListener('click', () => {
    paused = !paused;
    document.documentElement.classList.toggle('motion-paused', paused);
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.setAttribute('aria-label', paused ? 'Resume animations' : 'Pause animations');
    pauseButton.innerHTML = paused ? '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 5 7 5-7 5Z"/></svg>' : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5v10M13 5v10"/></svg>';
    document.dispatchEvent(new CustomEvent('poap-motion', { detail: paused }));
    run();
  });
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); cancelAnimationFrame(frame); frame = 0; stage.classList.remove('ready'); });
  renderer.domElement.addEventListener('webglcontextrestored', () => { stage.classList.add('ready'); run(); });
  resize();
  stage.classList.add('ready');
  run();
}
