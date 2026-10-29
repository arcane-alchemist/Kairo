import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {aboutContent,issuerContent} from './content.js';
test('organizer guide retains numbered sections and the approved visitor copy',()=>{
 const {document:guide}=parseHTML(issuerContent());
 assert.deepEqual([...guide.querySelectorAll('section h2')].map(node=>node.textContent),['01 / Connect your wallet','02 / List an event','03 / Create your badge','04 / Publish and share','05 / Distribute and claim','06 / Find your collection','07 / What stays permanent']);
 assert([...guide.querySelectorAll('section')].every(section=>section.querySelector('p')));
 assert.match(guide.querySelector('#guide-wallet p').textContent,/Privy/);
 assert(guide.textContent === null || !issuerContent().includes('0x'));
 assert.match(guide.querySelector('#guide-publish p').textContent,/awaits super-admin approval/);
 for(const html of [issuerContent(),aboutContent('#about/proof')])assert(!/0x[a-f0-9]{40}|11155111|this checkout|legacy/i.test(html));
 for(const link of guide.querySelectorAll('.docs-index a'))assert(guide.querySelector(link.getAttribute('href')));
});
