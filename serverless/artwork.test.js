import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { generateBadge } from './artwork.js';

test('badge descriptions select distinct motifs and safely encode event details', async () => {
  const images = new Set();
  for (const [description, theme] of [['A coding hackathon', 'Technology'], ['A music concert', 'Music'], ['An art exhibition', 'Arts'], ['A cricket competition', 'Sports'], ['A campus gathering', 'Community']]) {
    const badge = await generateBadge('Friends <&> "together"', description);
    assert.equal(badge.theme, theme); assert.match(badge.svg,/class="badge-motion"/); assert.match(badge.svg,/@keyframes keepsake-turn/); assert.match(badge.svg,/prefers-reduced-motion/); images.add(badge.svg);
    const {document} = parseHTML(badge.svg);
    assert.equal(document.querySelector('title').textContent, 'Friends <&> "together"');
    assert.equal(document.querySelector('script, [onload], foreignObject'), null);
    assert.deepEqual(await generateBadge('Friends <&> "together"', description), badge);
  }
  assert.equal(images.size, 5);
});
