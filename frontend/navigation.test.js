import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
test('desktop and phone navigation share four destinations and one header wallet control',()=>{
 const {document}=parseHTML(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));
 for(const selector of ['.desktop-nav','#mobile-nav']) {
  const links=[...document.querySelectorAll(`${selector} a`)];
  assert.deepEqual(links.map(a=>a.textContent),['Events','Gallery','Create','About']);
  assert.deepEqual(links.map(a=>a.getAttribute('href')),['#events','#gallery','#organize','#about/proof']);
 }
 assert.equal(document.querySelectorAll('.wallet-button').length,1);
 assert.equal(document.querySelectorAll('dialog').length,1);
});
