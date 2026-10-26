import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {mountNative,downloadQR} from './native.js';
import {getAddress} from 'ethers';
import {metaMaskWallet} from './wallet.js';
import {exclusiveNavigation} from './navigation.js';
import {aboutContent,documentationContent,issuerContent,doodle} from './content.js';
import {CATEGORIES, eventState, matchesEvent, profileStats, filterCollection} from './student-model.js';

async function setup({hash = '', failure = false, events = [], ethereum, respond} = {}) {
  const {document, window} = parseHTML(readFileSync(new URL('./index.html', import.meta.url), 'utf8'));
  Object.defineProperty(window.HTMLElement.prototype, 'elements', {configurable: true, get() {return Object.fromEntries([...this.querySelectorAll('[name]')].map(node => [node.getAttribute('name'),node]));}});
  const location = {hash, href: 'https://kairo.test/' + hash, origin: 'https://kairo.test', protocol: 'https:', hostname: 'kairo.test'};
  for (const dialog of document.querySelectorAll('dialog')) { dialog.showModal = () => {dialog.open = true;}; dialog.close = () => {dialog.open = false;}; }
  if (ethereum) window.ethereum = ethereum;
  const requests = [];
  const context = vm.createContext({document, window, location, navigator: {onLine: true}, URL, console, history: {replaceState(){}},
    mountNative, downloadQR, getAddress, metaMaskWallet, exclusiveNavigation, aboutContent, documentationContent, issuerContent, doodle, CATEGORIES, eventState, matchesEvent, profileStats, filterCollection, claimEntry: () => null,
    setTimeout: () => 1, clearTimeout(){}, setInterval: () => 1, clearInterval(){}, matchMedia: () => ({matches:true}),
    localStorage: {getItem: () => null, setItem(){}, removeItem(){}}, badgeSvg: () => '<svg/>', mountCoin(){}, mountPress(){},
    fetch: async (path, options) => { requests.push([path, options]); if (failure) throw Error('API offline'); if (respond) { const result = respond(path,options); if (result !== undefined) return Response.json(result); } return Response.json(path === '/api/events' ? events : path === '/api/config' ? {contractAddress:'0xcontract'} : {}); }
  });
  const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return {document, context, location, requests, render: () => vm.runInContext('render()',context)};
}

test('connected home uses real API records and never falls back to sample badges', async () => {
  const empty = await setup();
  assert.match(empty.document.querySelector('#badge-grid').textContent, /No events yet/);
  assert.equal(empty.document.querySelectorAll('.card').length, 0);
  const ui = await setup({events:[{id:7,title:'Published event', description:'Live event', club:'Campus',category:'Technology',startsAt:1,endsAt:2,cap:5,remaining:5,rsvpDeadline:2}]});
  assert.match(ui.document.querySelector('#badge-grid').textContent, /Published event/);
  assert.match(ui.document.querySelector('.card-link').getAttribute('href'), /drop\/7/);
});

test('production navigation reaches real publishing, staff, collections and tickets', async () => {
  const ui = await setup({hash:'#builders/build'});
  assert.ok(ui.document.querySelector('#event-form'));
  assert.equal(ui.document.querySelector('[name="artwork"]').hasAttribute('required'),false);
  assert.equal(ui.document.querySelector('#live-app').hidden,false);
  ui.location.hash = '#issuer/manage'; await ui.render();
  assert.ok(ui.document.querySelector('#organizer-connect'));
  ui.location.hash = '#collector/collection'; await ui.render();
  assert.ok(ui.document.querySelector('#collection-wallet'));
  assert.equal(ui.document.querySelector('#collection-wallet').value,'');
  ui.location.hash = '#tickets'; await ui.render();
  assert.match(ui.document.querySelector('#live-app').textContent,/Nothing on your calendar/);
  ui.location.hash = '#'; await ui.render();
  assert.equal(ui.document.querySelector('#live-app').hidden,true);
});

test('API failure renders retry and never silently supplies fixtures', async () => {
  const ui = await setup({failure:true});
  assert.match(ui.document.querySelector('#live-app').textContent,/Live service unavailable/);
  assert.ok(ui.document.querySelector('#retry-api'));
  assert.equal(ui.document.querySelectorAll('.card').length,0);
});


test('page load never restores a wallet or requests its account without a user action',async()=>{
  const methods=[];const ui=await setup({ethereum:{isMetaMask:true,request:async({method})=>{methods.push(method);return ['0x1111111111111111111111111111111111111111'];}}});
  assert.deepEqual(methods,[]);assert.match(ui.document.querySelector('#wallet').textContent,/Connect MetaMask/);assert(!ui.requests.some(([path])=>path==='/api/auth/me'));
});
test('organizer studio has its own sign-in entry and documentation chapter links keep the docs visible',async()=>{
  const ui=await setup({hash:'#issuer/studio'});assert.ok(ui.document.querySelector('#studio-connect'));assert.match(ui.document.querySelector('#live-app').textContent,/Organizer studio/);
  ui.location.hash='#builders/documentation';await ui.render();assert.equal(ui.document.querySelectorAll('.docs-copy section').length,7);
  assert.match(ui.document.querySelector('#live-app').textContent,/MP4 or WebM/);
});


test('organizer editor saves real API details and submits the same persisted draft',async()=>{
  const media={image:'https://kairo.test/media/art/'+'a'.repeat(64)+'.svg',uri:'https://kairo.test/media/metadata/'+'b'.repeat(64)+'.json'};
  const id='33333333-3333-4333-8333-333333333333';
  const ui=await setup({respond:(path,options)=>path==='/api/artwork'?media:path==='/api/organizer/events'&&options.method==='POST'?{id,status:'submitted'}:undefined});
  vm.runInContext("session={wallet:'0x1111111111111111111111111111111111111111',admin:false}; createEventPage()",ui.context);
  const form=ui.document.querySelector('#event-form');form.reportValidity=()=>true;
  const values={title:'Campus workshop',description:'A coding workshop for our campus',club:'Code club',category:'Workshop',campus:'Main campus',eligibility:'Students',roles:'Attendee',venue:'Hall A',cap:'50',claimMode:'attendance',starts:'2026-12-01T10:00',eventEnds:'2026-12-01T12:00',mintStarts:'2026-12-01T10:00',ends:'2026-12-02T12:00',deadline:'2026-11-30T12:00'};
  for(const [key,value] of Object.entries(values))Object.defineProperty(form.elements[key],'value',{configurable:true,writable:true,value});
  form.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
  assert.match(ui.document.querySelector('#publish-status').textContent,/draft saved/);
  const submit=ui.document.querySelector('#submit-event');await submit.onclick({target:submit});
  const saves=ui.requests.filter(([path])=>path==='/api/organizer/events').map(([,options])=>JSON.parse(options.body));
  assert.equal(saves.length,2);assert.equal(saves[0].title,'Campus workshop');assert.equal(saves[0].submit,false);assert.equal(saves[1].id,id);assert.equal(saves[1].submit,true);assert.equal(saves[1].uri,media.uri);assert.equal(saves[1].organizer,'0x1111111111111111111111111111111111111111');
});
