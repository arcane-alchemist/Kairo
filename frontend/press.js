import * as k from './vendor/anatomy/iso-kit.mjs';

// A tiny hand press: 8 foot pieces, a bed, 4 mounting blocks, 4 columns,
// 8 collars, crosshead, motor cover, 4 lid screws, ram, stamp, 2 dies,
// 4 die screws, 2 rail strips, ruler, label, 2 controls, and 7 vent slots.
export function pressGeometry() {
  const base = { x: -95, y: -60, w: 190, d: 120, r: 9 };
  const P = k.fitProjection([...k.boxCorners(base, -17, 0), ...k.boxCorners({ x: -68, y: -35, w: 136, d: 70, r: 4 }, 0, 136)], 600, 420, { pad: 24, azimuth: 38, elevation: 28 });
  const S = (paths, tone = 'mid', lit = false) => k.solidSvg(paths, { tone, lit });
  const L = (path, tone = 'lo', free = false) => k.lineSvg(path, { tone, free });
  const dot = (x, y, z, size = .65) => k.dotsSvg([k.iso([x, y, z], P)], { size, tone: 'hi' });
  const screw = (x, y, z) => L(k.ring(x, y, 1.7, z, P, 20), 'mid') + dot(x, y, z, .5);
  const slab = (plan, z, h, tone = 'mid', lit = false) => S(k.slabOf(plan, z, h, P, 6, .7), tone, lit);
  const cyl = (x, y, r, z, h, tone = 'mid', lit = false) => S(k.cylinder(x, y, r, z, h, P, 48, .35), tone, lit);
  const bed = [];
  bed.push(`<path class="iso-halo" d="${k.haloOf(base, -17, 12, P)}"/>`);
  const feet = k.corners(base, 15).sort((a, b) => k.depthOf([...a, 0], P) - k.depthOf([...b, 0], P));
  feet.forEach(([x, y]) => bed.push(cyl(x, y, 8, -17, 2, 'lo'), cyl(x, y, 6, -15, 5, 'lo')));
  bed.push(slab(base, -10, 10, 'lo'), L(k.planOutline(k.insetPlan(base, 5), 0, P), 'faint'));
  k.corners(base, 10).forEach(([x, y]) => bed.push(screw(x, y, 0)));
  const ruler = { x: -74, y: 47, w: 126, d: 5, r: 1 };
  bed.push(slab(ruler, 0, .6, 'lo'));
  const ticks = k.topTicks(-70, 48, 4, 5, 47, .6, [2, 3.5], P);
  bed.push(L(ticks.minor), L(ticks.major, 'mid'));
  const label = { x: 57, y: 32, w: 24, d: 16, r: 1 };
  bed.push(slab(label, 0, .7), L(k.planOutline(k.insetPlan(label, 2), .7, P), 'faint'));
  [36, 39, 42].forEach((y, i) => bed.push(L(k.lineOnTop([61, y], [76 - i * 3, y], .7, P), 'mid', true)));
  const posts = [[-57, -29], [57, -29], [-57, 29], [57, 29]].sort((a, b) => k.depthOf([...a, 0], P) - k.depthOf([...b, 0], P));
  const column = ([x, y]) => {
    const out = [slab({ x: x - 10, y: y - 9, w: 20, d: 18, r: 3 }, 0, 5)];
    out.push(cyl(x, y, 7, 5, 4), cyl(x, y, 4.3, 9, 101), cyl(x, y, 6.5, 110, 5));
    out.push(L(k.sideArc(x, y, 4.3, 31, P, 24), 'faint'), L(k.sideArc(x, y, 4.3, 90, P, 24), 'faint'));
    out.push(screw(x - 7, y, 5), screw(x + 7, y, 5));
    return out.join('');
  };
  bed.push(...posts.slice(0, 2).map(column));
  for (const x of [-30, 27]) bed.push(slab({ x, y: -32, w: 3, d: 75, r: 1 }, 0, 3));
  bed.push(cyl(0, 0, 26, 0, 4), cyl(0, 0, 23, 4, 3, 'hi'));
  const badge = cyl(0, 0, 20, 7, 2, 'hi', true) + L(k.ring(0, 0, 16, 9, P, 72), 'mid') + k.faceTextSvg(k.topMatrix([0, 2], 9, P, 'x'), 'POAP', { size: 5, tone: 'hi', anchor: 'middle' });
  bed.push(`<g id="pressed-badge">${badge}</g>`);
  for (const [x, y] of [[-20,-20],[20,-20],[-20,20],[20,20]]) bed.push(screw(x, y, 4));
  const head = [cyl(0, 0, 7, 44, 81), cyl(0, 0, 14, 37, 7, 'hi'), cyl(0, 0, 21, 31, 6, 'hi'), L(k.knurl(0, 0, 21, 31, 36, 64, P, .3))].join('');
  bed.push(`<g id="press-head">${head}</g>`);
  bed.push(...posts.slice(2).map(column));
  const cross = { x: -69, y: -40, w: 138, d: 80, r: 7 };
  bed.push(cyl(0, 0, 10, 98, 17));
  bed.push(slab(cross, 115, 10), L(k.planOutline(k.insetPlan(cross, 4), 125, P), 'faint'));
  posts.forEach(([x, y]) => bed.push(screw(x, y, 125)));
  const motor = { x: -25, y: -21, w: 50, d: 42, r: 6 };
  bed.push(slab(motor, 125, 11, 'hi'), L(k.planOutline(k.insetPlan(motor, 3), 136, P), 'faint'));
  k.corners(motor, 6).forEach(([x, y]) => bed.push(screw(x, y, 136)));
  for (let x = -12; x <= 12; x += 4) bed.push(L(k.planOutline({ x, y: -11, w: 1.5, d: 21, r: .75 }, 136, P), 'mid'));
  bed.push(cyl(76, 7, 7, 0, 7), L(k.knurl(76, 7, 7, 0, 7, 32, P)), cyl(76, 7, 4.5, 7, 1.5, 'hi'));
  bed.push(cyl(76, -14, 5, 0, 2), cyl(76, -14, 3.7, 2, 2, 'hi'));
  const svg = k.figureSvg({ width: 600, height: 420, label: 'An isometric miniature memory press on four feet, with guide columns, a sliding stamp, machined dies and a POAP keepsake. Activate the press to stamp a memory.', body: bed });
  return { svg, projection: P };
}

export function mountPress(container, button, readout) {
  const { svg, projection } = pressGeometry();
  container.innerHTML = svg;
  const head = container.querySelector('#press-head');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let count = 0;
  let currentAnimation = null;
  document.addEventListener('poap-motion', event => { if (event.detail) currentAnimation?.finish(); });
  still.addEventListener('change', () => { if (still.matches) currentAnimation?.finish(); });
  const announce = document.createElement('span');
  announce.setAttribute('role', 'status');
  announce.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)';
  container.append(announce);
  button.addEventListener('click', async () => {
    if (currentAnimation) return;
    button.disabled = true;
    readout.textContent = 'MAKING A LITTLE MEMORY…';
    if (!still.matches && !document.documentElement.classList.contains('motion-paused')) {
      const down = k.iso([0, 0, -22], { ...projection, origin: [0, 0] });
      currentAnimation = head.animate([{ transform: 'translate(0px,0px)', offset: 0 }, { transform: `translate(${down[0]}px,${down[1]}px)`, offset: .42 }, { transform: `translate(${down[0]}px,${down[1]}px)`, offset: .62 }, { transform: 'translate(0px,0px)', offset: 1 }], { duration: 1400, easing: 'cubic-bezier(.45,0,.25,1)' });
      try { await currentAnimation.finished; } catch { /* The original geometry remains intact if an animation is interrupted. */ }
    }
    count++;
    readout.textContent = `${String(count).padStart(2, '0')} ${count === 1 ? 'MEMORY' : 'MEMORIES'} PRESSED ♡`;
    announce.textContent = `${count} ${count === 1 ? 'memory' : 'memories'} pressed.`;
    button.disabled = false;
    currentAnimation = null;
  });
}
