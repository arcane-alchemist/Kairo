import test from 'node:test';
import assert from 'node:assert/strict';
import { badges, badgeSvg } from './art.js';
import { pressGeometry } from './press.js';

test('each category has collectibles with unique identifiers and self-contained SVG references', () => {
  assert.equal(new Set(badges.map(badge => badge.id)).size, badges.length);
  for (const category of ['music', 'community', 'art']) assert.equal(badges.filter(badge => badge.category === category).length, 2);
  for (const badge of badges) {
    const art = badgeSvg(badge.kind, `test-${badge.id}`, badge.label);
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
