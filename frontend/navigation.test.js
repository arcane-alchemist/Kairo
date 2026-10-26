import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';import {readFileSync} from 'node:fs';import {exclusiveNavigation} from './navigation.js';
test('opening Issuer closes About, links close menus, and Escape closes all groups',()=>{
  const {document,window}=parseHTML(readFileSync(new URL('./index.html',import.meta.url),'utf8'));exclusiveNavigation(document);
  const [about,issuer]=document.querySelectorAll('.desktop-nav details');
  about.open=true;about.dispatchEvent(new window.Event('toggle'));issuer.open=true;issuer.dispatchEvent(new window.Event('toggle'));assert.equal(about.open,false);assert.equal(issuer.open,true);
  issuer.querySelector('a').dispatchEvent(new window.Event('click',{bubbles:true}));assert.equal(issuer.open,false);
  about.open=true;const escape=new window.Event('keydown');escape.key='Escape';document.dispatchEvent(escape);assert.equal(about.open,false);
  assert([...document.querySelectorAll('.nav-dropdown')].every(menu=>menu.getAttribute('name')==='main-sections'));
});
