import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {aboutContent,documentationContent,issuerContent} from './content.js';
test('guide and Builders retain numbered sections and the approved visitor copy',()=>{
 const {document:guide}=parseHTML(issuerContent());
 assert.deepEqual([...guide.querySelectorAll('section h2')].map(node=>node.textContent),['01 / Connect your wallet','02 / List an event','03 / Create your badge','04 / Publish and share','05 / Check in and claim','06 / Find your collection','07 / What stays permanent']);
 assert.equal(guide.querySelectorAll('section p').length,11);
 assert.equal(guide.querySelector('#guide-wallet p').textContent,'Click Connect wallet on the homepage. Kairo uses MetaMask; approve your account inside it. Kairo never picks an account for you; if you decline, you stay disconnected. Then approve the sign-in message. It is free and does not mint anything.');
 assert(guide.textContent === null || !issuerContent().includes('0x'));
 const {document:docs}=parseHTML(documentationContent());
 assert.equal(docs.querySelectorAll('section').length,7);
 assert.match(docs.querySelector('#doc-health p').textContent,/GET \/api\/health reports which dependency is failing/);
 assert.match(docs.querySelector('#doc-design p').textContent,/custom design for each/);
 assert.match(docs.querySelector('#doc-publish p').textContent,/one blockchain transaction per role/);
 for(const html of [issuerContent(),documentationContent(),aboutContent('#about/proof')])assert(!/0x[a-f0-9]{40}|11155111|this checkout|legacy/i.test(html));
 for(const doc of [guide,docs])for(const link of doc.querySelectorAll('.docs-index a'))assert(doc.querySelector(link.getAttribute('href')));
});
