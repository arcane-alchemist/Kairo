import test from 'node:test';import assert from 'node:assert/strict';import {aboutContent,documentationContent} from './content.js';
test('About subsections have separate content and documentation covers the real workflow',()=>{
  const proof=aboutContent('#about/proof','0xcontract'),cases=aboutContent('#about/case-studies','0xcontract');assert.notEqual(proof,cases);assert.match(proof,/Your proof stays/);assert.match(cases,/hackathon worth remembering/);
  const docs=documentationContent('<script>');for(const word of ['MetaMask','private workspace','MP4','WebM','10 MB','college admin','procedural','Sepolia'])assert(docs.includes(word),word);assert(!docs.includes('<script>'));
});
