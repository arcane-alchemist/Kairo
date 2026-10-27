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
