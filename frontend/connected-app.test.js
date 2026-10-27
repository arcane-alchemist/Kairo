import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {mountNative,downloadQR} from './native.js';
import {getAddress,ZeroAddress} from 'ethers';
import {createApiClient as realApiClient} from './api.js';
import {ABI} from '../serverless/chain.js';
import {metaMaskWallet} from './wallet.js';
import {aboutContent,documentationContent,issuerContent,doodle} from './content.js';
import {eventState, matchesEvent, profileStats, filterCollection, groupCollection} from './student-model.js';

async function setup({hash = '', failure = false, events = [], ethereum, phantom, respond, Contract} = {}) {
  const {document, window} = parseHTML(readFileSync(new URL('./index.html', import.meta.url), 'utf8'));
  Object.defineProperty(window.HTMLElement.prototype, 'elements', {configurable: true, get() {return Object.fromEntries([...this.querySelectorAll('[name]')].map(node => [node.getAttribute('name'),node]));}});
  window.HTMLElement.prototype.requestSubmit = function(){this.onsubmit?.({preventDefault(){}});};
  const location = {hash, href: 'https://kairo.test/' + hash, origin: 'https://kairo.test', protocol: 'https:', hostname: 'kairo.test'};
  for (const dialog of document.querySelectorAll('dialog')) { dialog.showModal = () => {dialog.open = true;}; dialog.close = () => {dialog.open = false;dialog.dispatchEvent(new window.Event('close'));}; }
  window.ethereum = ethereum;
  window.phantom = phantom ? {ethereum:phantom} : undefined;
  const requests = [], intervals = [], storage = new Map();
  const context = vm.createContext({document, window, location, navigator: {onLine: true}, URL, console, history: {replaceState(){}},
    createApiClient:options=>realApiClient({...options,wait:async()=>{},retryDelays:[0,0]}), mountNative, downloadQR, getAddress, ZeroAddress, Contract, ABI, BrowserProvider:class {constructor(provider){this.provider=provider;}async getSigner(account){return {getAddress:async()=>account,signMessage:async()=> 'test-signature'};}}, metaMaskWallet, aboutContent, documentationContent, issuerContent, doodle, eventState, matchesEvent, profileStats, filterCollection, groupCollection, claimEntry: () => null,
    setTimeout: () => 1, clearTimeout(){}, setInterval: fn => {intervals.push(fn);return intervals.length;}, clearInterval(){}, matchMedia: () => ({matches:true}),
    localStorage: {getItem: key => storage.get(key) || null, setItem:(key,value)=>storage.set(key,value), removeItem:key=>storage.delete(key)}, badgeSvg: () => '<svg/>', mountCoin(){}, mountPress(){},
    fetch: async (path, options) => { requests.push([path, options]); if (failure) throw Error('API offline'); if (respond) { const result = await respond(path,options); if (result !== undefined) return result instanceof Response ? result : Response.json(result); } return Response.json(path === '/api/events' ? events : path === '/api/config' ? {contractAddress:'0xcontract',chainId:11155111,chainName:'Sepolia',explorerUrl:'https://sepolia.etherscan.io',categories:['Technology','Workshop']} : {}); }
  });
  const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return {document, context, location, requests, intervals, render: () => vm.runInContext('render()',context)};
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
  const ui = await setup({hash:'#create'});
  assert.ok(ui.document.querySelector('#event-form'));
  assert.equal(ui.document.querySelector('[name="artwork"]').hasAttribute('required'),false);
  assert.equal(ui.document.querySelector('#live-app').hidden,false);
  ui.location.hash = '#issuer/manage'; await ui.render();
  assert.equal(ui.document.querySelector('#organizer-connect'),null);
  assert.match(ui.document.querySelector('#live-app').textContent,/shared wallet session/);
  ui.location.hash = '#collector/collection'; await ui.render();
  assert.equal(ui.document.querySelector('#gallery-connect'),null);
  assert.match(ui.document.querySelector('#live-app').textContent,/shared wallet session/);
  assert.equal(ui.document.querySelector('#collection-wallet'),null);
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


test('page load checks the session cookie without requesting wallet accounts',async()=>{
  const methods=[];const ui=await setup({ethereum:{isMetaMask:true,request:async({method})=>{methods.push(method);return ['0x1111111111111111111111111111111111111111'];}}});
  assert.deepEqual(methods,[]);assert.match(ui.document.querySelector('#wallet').textContent,/Connect wallet/);assert(ui.requests.some(([path])=>path==='/api/auth/me'));
});
test('organizer studio uses the shared session and documentation chapter links keep the docs visible',async()=>{
  const ui=await setup({hash:'#issuer/studio'});assert.equal(ui.document.querySelector('#studio-connect'),null);assert.match(ui.document.querySelector('#live-app').textContent,/Organizer studio/);
  ui.location.hash='#builders/documentation';await ui.render();assert.equal(ui.document.querySelectorAll('.docs-copy section').length,7);
  assert.match(ui.document.querySelector('#live-app').textContent,/GET \/api\/health/);
});


test('organizer editor saves real API details and submits the same persisted draft',async()=>{
  const media={image:'https://kairo.test/media/art/'+'a'.repeat(64)+'.svg',uri:'https://kairo.test/media/metadata/'+'b'.repeat(64)+'.json'};
  const id='33333333-3333-4333-8333-333333333333';
  const ui=await setup({respond:(path,options)=>path==='/api/artwork'?media:path==='/api/organizer/events'&&options.method==='POST'?{id,status:'submitted'}:undefined});
  vm.runInContext("session={wallet:'0x1111111111111111111111111111111111111111',admin:false}; createEventPage()",ui.context);
  const form=ui.document.querySelector('#event-form');form.reportValidity=()=>true;
  assert.equal(form.elements.organizer.hasAttribute('readonly'),false);
  const values={organizer:'0x2222222222222222222222222222222222222222',title:'Campus workshop',description:'A coding workshop for our campus',club:'Code club',category:'Workshop',campus:'Main campus',roles:'Attendee',venue:'Hall A',claimMode:'attendance',starts:'2026-12-01T10:00',eventEnds:'2026-12-01T12:00',mintStarts:'2026-12-01T10:00',ends:'2026-12-02T12:00',deadline:'2026-11-30T12:00'};
  for(const [key,value] of Object.entries(values))Object.defineProperty(form.elements[key],'value',{configurable:true,writable:true,value});
  const generate=ui.document.querySelector('#generate-poap'); await generate.onclick({target:generate});
  form.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
  assert.match(ui.document.querySelector('#publish-status').textContent,/draft saved/);
  const submit=ui.document.querySelector('#submit-event');await submit.onclick({target:submit});
  const saves=ui.requests.filter(([path])=>path==='/api/organizer/events').map(([,options])=>JSON.parse(options.body));
  assert.equal(saves.length,2);assert.equal(saves[0].title,'Campus workshop');assert.equal(saves[0].submit,false);assert.equal(saves[1].id,id);assert.equal(saves[1].submit,true);assert.equal(saves[1].uri,media.uri);assert.equal(saves[1].organizer,'0x2222222222222222222222222222222222222222');
});

test('default-wallet rejection stays disconnected without showing a Kairo chooser',async()=>{
 const ui=await setup({ethereum:{isMetaMask:true,request:async()=>{throw Object.assign(Error('Declined'),{code:4001});}}});
 for(let attempt=0;attempt<2;attempt++) {
  await ui.document.querySelector('#wallet').onclick();
  assert.equal(ui.document.querySelector('#modal').open,false);
  assert.equal(ui.document.querySelectorAll('[data-connect-wallet]').length,0);
 }
 assert(!ui.requests.some(([path])=>path==='/api/auth/challenge'||path==='/api/auth/verify'));
});
test('header connection completes SIWE once, and page navigation shares the account',async()=>{
 const calls=[],address='0x1111111111111111111111111111111111111111';let authenticated=false;
 const ui=await setup({ethereum:{isMetaMask:true,request:async({method})=>{calls.push(method);return ['eth_requestAccounts','eth_accounts'].includes(method)?[address]:'0xaa36a7';}},respond:(path)=>{
  if(path==='/api/auth/verify'){authenticated=true;return {wallet:address};}
  if(path==='/api/auth/me')return authenticated?{wallet:address,admin:false}:new Response('{}',{status:401});
  if(path==='/api/auth/challenge')return {id:'challenge',message:'Sign in'};
  if(path==='/api/organizer/events')return [];
 }});
 const pending=ui.document.querySelector('#wallet').onclick();await pending;
 assert.equal(ui.document.querySelector('#modal').open,false);assert.match(ui.document.querySelector('#wallet').textContent,/0x1111/);
 assert.equal(ui.requests.filter(([path])=>path==='/api/auth/verify').length,1);
 ui.location.hash='#organize';await ui.render();assert.equal(ui.document.querySelector('#studio-connect'),null);assert.match(ui.document.querySelector('.studio-toolbar').textContent,/0x1111/);
 assert.equal(calls.filter(method=>method==='eth_requestAccounts').length,1);
});
test('a reload restores the signed session UI without calling a wallet extension',async()=>{
 const calls=[],address='0x1111111111111111111111111111111111111111';
 const ui=await setup({ethereum:{isMetaMask:true,request:async({method})=>calls.push(method)},respond:path=>path==='/api/auth/me'?{wallet:address,admin:false}:undefined});
 assert.match(ui.document.querySelector('#wallet').textContent,/0x1111/);assert.deepEqual(calls,[]);assert.equal(ui.document.querySelector('#wallet-welcome').hidden,true);
});
test('the Builders legacy build route opens developer information, never an event form',async()=>{
 const ui=await setup({hash:'#builders/build'});assert(ui.document.querySelector('.docs-copy'));assert.equal(ui.document.querySelector('#event-form'),null);
});
test('untrusted event text, IDs, artwork URLs and collection routes cannot inject active HTML',async()=>{
 const payload='"><img src=x onerror="alert(1)"><script>alert(1)</script>';
 const ui=await setup({events:[{id:payload,title:payload,description:payload,club:payload,category:'Technology',image:'javascript:alert(1)',startsAt:1,endsAt:2,cap:0,remaining:0,rsvpDeadline:2}]});
 const grid=ui.document.querySelector('#badge-grid');assert.equal(grid.querySelector('script,[onerror],[onclick],[onmouseover]'),null);assert(grid.textContent.includes(payload));assert(!grid.querySelector('img[src^="javascript:"]'));
 for(const value of ['javascript:alert(1)','data:image/svg+xml,<svg onload=alert(1)>','https://user:pass@example.test/a.png','/media/../../api/auth/me','https://example.test/a.png\nonerror=alert(1)'])assert.equal(vm.runInContext(`safeImage(${JSON.stringify(value)})`,ui.context),'');
 ui.location.hash='#collection/'+payload;await ui.render();assert.equal(ui.document.querySelector('#live-app script,#live-app [onerror]'),null);
});

test('a QR claim page clears the gallery refresh callback after replacing its search fields',async()=>{
 const ui=await setup({hash:'#drop/2',events:[{id:2,title:'QR drop',claimMode:'qr',startsAt:1,endsAt:2,rsvpDeadline:2,cap:0,remaining:0}]});
 assert(ui.document.querySelector('#claim-connect'));assert.equal(ui.document.querySelector('#live-search'),null);assert.equal(vm.runInContext('drawEvents',ui.context),null);
});

test('local artwork permits the same-origin HTTP media path without allowing remote HTTP or other local endpoints',async()=>{
 const ui=await setup();vm.runInContext("location.origin='http://127.0.0.1:8891'",ui.context);
 assert.equal(vm.runInContext("safeImage('http://127.0.0.1:8891/media/art/test.svg')",ui.context),'http://127.0.0.1:8891/media/art/test.svg');
 for(const value of ['http://evil.test/media/art/test.svg','http://127.0.0.1:8891/api/auth/me'])assert.equal(vm.runInContext(`safeImage(${JSON.stringify(value)})`,ui.context),'');
});

test('a successful refresh clears the earlier connection error banner',async()=>{
 const ui=await setup({hash:'#collector/gallery'}),banner=ui.document.querySelector('#connection-state');banner.hidden=false;banner.textContent='Live refresh unavailable';
 await ui.intervals.at(-1)();assert.equal(banner.hidden,true);assert(!banner.textContent.includes('unavailable'));
});
test('an unreadable API response shows a user-facing retry error instead of development commands',async()=>{
 const ui=await setup({respond:()=>new Response('<html>Temporary gateway failure</html>',{status:502})});
 assert.match(ui.document.querySelector('#live-app').textContent,/unreadable response/);assert(!ui.document.querySelector('#live-app').textContent.includes('npm run dev'));
});

test('Gallery uses the shared address and groups multiple role badges under one event',async()=>{
 const address='0x1111111111111111111111111111111111111111';
 const ui=await setup({hash:'#gallery',respond:path=>path==='/api/auth/me'?{wallet:address}:path.startsWith('/api/wallet-collection')?{total:2,pending:0,nextCursor:null,items:[{id:7,tokenId:'1',title:'Campus event',club:'Campus',role:'Attendee'},{id:7,tokenId:'2',title:'Campus event',club:'Campus',role:'Winner'}]}:undefined});
 assert.equal(ui.document.querySelectorAll('.gallery-event').length,1);assert.equal(ui.document.querySelectorAll('.gallery-event .card').length,2);
 assert(ui.document.querySelector('#collection-form').hidden);assert.equal(ui.document.querySelector('#collection-wallet').value,address);
 assert(ui.requests.some(([path])=>path.includes('wallet='+address)));
});

test('extension account changes require a fresh SIWE while chain changes show a shared switch banner',async()=>{
 const first='0x1111111111111111111111111111111111111111',second='0x2222222222222222222222222222222222222222';
 let account=first,chain='0xaa36a7',authenticated='',challengeWallet='';const listeners=new Map(),calls=[];
 const provider={isMetaMask:true,on:(event,handler)=>listeners.set(event,handler),removeListener:event=>listeners.delete(event),request:async({method})=>{
  calls.push(method);if(['eth_requestAccounts','eth_accounts'].includes(method))return [account];
  if(method==='wallet_switchEthereumChain')chain='0xaa36a7';return method==='eth_chainId'?chain:[];
 }};
 const ui=await setup({ethereum:provider,respond:(path,options)=>{
  if(path==='/api/auth/challenge'){challengeWallet=JSON.parse(options.body).wallet;return {id:'challenge',message:'Sign in'};}
  if(path==='/api/auth/verify'){authenticated=challengeWallet;return {wallet:authenticated};}
  if(path==='/api/auth/logout'){authenticated='';return {};}
  if(path==='/api/auth/me')return authenticated?{wallet:authenticated}:new Response('{}',{status:401});
 }});
 const pending=ui.document.querySelector('#wallet').onclick();await pending;
 account=second;await listeners.get('accountsChanged')([second]);assert.match(ui.document.querySelector('#wallet').textContent,/0x2222/);
 assert.equal(ui.requests.filter(([path])=>path==='/api/auth/verify').length,2);assert.equal(calls.filter(method=>method==='eth_requestAccounts').length,1);
 chain='0x1';await listeners.get('chainChanged')(chain);assert.equal(ui.document.querySelector('#connection-state').hidden,false);assert.match(ui.document.querySelector('#wallet-network').textContent,/Switch to Sepolia/);
 const network=ui.document.querySelector('#wallet-network');await network.onclick({target:network});assert.equal(network.textContent,'Sepolia');assert.equal(ui.document.querySelector('#connection-state').hidden,true);
});

test('an account change during verification serializes sign-in and cannot erase the newer session',async()=>{
 const first='0x1111111111111111111111111111111111111111',second='0x2222222222222222222222222222222222222222';
 let account=first,authenticated='',challengeWallet='',release;let verifies=0;const listeners=new Map();
 const provider={isMetaMask:true,on:(event,handler)=>listeners.set(event,handler),removeListener:event=>listeners.delete(event),request:async({method})=>['eth_requestAccounts','eth_accounts'].includes(method)?[account]:'0xaa36a7'};
 const ui=await setup({ethereum:provider,respond:(path,options)=>{
  if(path==='/api/auth/challenge'){challengeWallet=JSON.parse(options.body).wallet;return {id:'challenge',message:'Sign in'};}
  if(path==='/api/auth/verify'){
   const wallet=challengeWallet;
   if(++verifies===1)return new Promise(resolve=>{release=()=>{authenticated=wallet;resolve({wallet});};});
   authenticated=wallet;return {wallet};
  }
  if(path==='/api/auth/logout'){authenticated='';return {};}
  if(path==='/api/auth/me')return authenticated?{wallet:authenticated}:new Response('{}',{status:401});
 }});
 const pending=ui.document.querySelector('#wallet').onclick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(typeof release,'function');account=second;const changed=listeners.get('accountsChanged')([second]);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(verifies,1);release();await Promise.all([pending,changed]);
 assert.equal(authenticated,second);assert.match(ui.document.querySelector('#wallet').textContent,/0x2222/);assert.equal(verifies,2);
});

test('failed, malformed and partial wallet responses never render an empty collection',async()=>{
 const wallet='0x1111111111111111111111111111111111111111';
 for(const response of [{items:[],total:2,pending:0,nextCursor:null},{items:null,total:0,nextCursor:null},new Response(JSON.stringify({code:'RPC_UNREACHABLE'}),{status:503,headers:{'content-type':'application/json'}})]){
  const ui=await setup({hash:'#gallery',respond:path=>path==='/api/auth/me'?{wallet}:path.startsWith('/api/wallet-collection')?response instanceof Response?response.clone():response:undefined});
  assert.match(ui.document.querySelector('#collection-status').textContent,/Collection unavailable/);assert(ui.document.querySelector('#retry-collection'));
  assert(!ui.document.querySelector('#collection-grid').textContent.includes('Your first moment is ahead of you'));
 }
});

test('discovery lists live, upcoming and past events below searchable category controls',async()=>{
 const now=Date.now()/1000;
 const ui=await setup({hash:'#events',events:[{id:1,title:'Live workshop',startsAt:now-100,endsAt:now+100,category:'Workshop'},{id:2,title:'Future workshop',startsAt:now+200,endsAt:now+400,category:'Workshop'},{id:3,title:'Old art show',startsAt:now-400,endsAt:now-200,category:'Arts'}]});
 const sections=ui.document.querySelectorAll('.event-period');assert.equal(sections.length,3);
 assert.match(sections[0].textContent,/Live events.*Live workshop/s);assert.match(sections[1].textContent,/Upcoming events.*Future workshop/s);assert.match(sections[2].textContent,/Past events.*Old art show/s);
 assert(ui.document.querySelector('.event-search svg'));
 const search=ui.document.querySelector('#live-search');search.value='workshop';search.oninput();assert(!ui.document.querySelector('#live-events').textContent.includes('Old art show'));
});

test('Gallery displays badges without search, year, role, organization or sort controls',async()=>{
 const wallet='0x1111111111111111111111111111111111111111';
 const ui=await setup({hash:'#gallery',respond:path=>path==='/api/auth/me'?{wallet}:path.startsWith('/api/wallet-collection')?{total:1,pending:0,nextCursor:null,items:[{id:1,tokenId:'1',role:'Attendee',title:'My POAP'}]}:undefined});
 assert(ui.document.querySelector('.gallery-event .card'));assert.equal(ui.document.querySelectorAll('#live-app [data-filter]').length,0);
 assert.equal(ui.document.querySelector('#collection-tools').children.length,0);
});

test('editor requires explicit designs, generates one per role and persists each role URI',async()=>{
 const wallet='0x1111111111111111111111111111111111111111';let index=0;
 const ui=await setup({hash:'#create',respond:(path,options)=>path==='/api/auth/me'?{wallet}:path==='/api/artwork'?{image:`https://kairo.test/media/art/${++index}.svg`,uri:`https://kairo.test/media/metadata/${index}.json`}:path==='/api/organizer/events'&&options.method==='POST'?{id:'33333333-3333-4333-8333-333333333333',status:'draft'}:undefined});
 const form=ui.document.querySelector('#event-form');form.reportValidity=()=>true;
 const values={organizer:wallet,title:'Campus workshop',description:'Make something with friends',club:'Code club',category:'Workshop',campus:'Campus',roles:'Attendee, Volunteer, Speaker',venue:'Hall A',claimMode:'attendance',starts:'2026-12-01T10:00',eventEnds:'2026-12-01T12:00',mintStarts:'2026-12-01T10:00',ends:'2026-12-02T12:00',deadline:'2026-11-30T12:00'};
 for(const [key,value] of Object.entries(values))Object.defineProperty(form.elements[key],'value',{configurable:true,writable:true,value});
 form.elements.roles.onchange();assert.equal(ui.document.querySelectorAll('.role-design').length,3);assert.equal(ui.document.querySelectorAll('.role-design img[src]').length,0);
 form.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));assert(!ui.requests.some(([path])=>path==='/api/artwork'));assert.match(ui.document.querySelector('#toast').textContent,/Upload a custom design/);
 const generate=ui.document.querySelector('#generate-poap');await generate.onclick({target:generate});assert.equal(index,3);assert.equal(ui.document.querySelectorAll('.role-design img[src]').length,3);
 const requests=ui.requests.filter(([path])=>path==='/api/artwork').map(([,options])=>JSON.parse(options.body));assert.deepEqual(requests.map(input=>input.role),['Attendee','Volunteer','Speaker']);
 form.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 const payload=JSON.parse(ui.requests.find(([path])=>path==='/api/organizer/events')[1].body);assert.equal(payload.roleArtwork.length,3);assert.equal(new Set(payload.roleArtwork.map(art=>art.uri)).size,3);
 form.elements.description.value='A changed story';form.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));assert.equal(index,3);assert.match(ui.document.querySelector('#toast').textContent,/Upload a custom design/);
});

test('subpages provide top-left links back to studio or About even during an events outage',async()=>{
 const ui=await setup({hash:'#issuer/manage'});assert.equal(ui.document.querySelector('.back-link').getAttribute('href'),'#issuer/studio');
 ui.location.hash='#issuer/guide';await ui.render();assert.equal(ui.document.querySelector('.back-link').getAttribute('href'),'#issuer/studio');
 ui.location.hash='#about/case-studies';await ui.render();assert.equal(ui.document.querySelector('.back-link').getAttribute('href'),'#about/proof');
 vm.runInContext("apiError='Service down'",ui.context);ui.location.hash='#builders/documentation';await ui.render();assert(ui.document.querySelector('#doc-design'));
});

test('publishing confirms each role separately and retries only remaining role drops',async()=>{
 const wallet='0x1111111111111111111111111111111111111111',draftId='33333333-3333-4333-8333-333333333333';
 const published=[],transactions=[],supplies=[];let artwork=0,fail=true;
 class Contract {
  constructor(){this.interface={parseLog:log=>({name:'EventCreated',args:{eventId:log.id}})};}
  async createEvent(uri,cap){supplies.push(cap);transactions.push(uri);if(transactions.length===2&&fail){fail=false;throw Error('Wallet request cancelled');}return {hash:String(transactions.length+1)};}
 }
 const ui=await setup({hash:'#create',Contract,respond:(path,options)=>{
  if(path==='/api/auth/me')return {wallet,admin:true};
  if(path==='/api/config')return {chainId:11155111,chainName:'Sepolia',contractAddress:wallet,issuerAddress:wallet,categories:['Workshop']};
  if(path==='/api/artwork')return {image:`https://kairo.test/media/art/${++artwork}.svg`,uri:`https://kairo.test/media/metadata/${artwork}.json`};
  if(path==='/api/organizer/events')return {id:draftId,status:'submitted'};
  if(path==='/api/events'&&options.method==='POST'){const body=JSON.parse(options.body);published.push({...body,groupId:body.draftId});return {id:body.id};}
  if(path==='/api/events')return published;
 }});
 vm.runInContext("signerOnSepolia=async()=>({provider:{waitForTransaction:async hash=>({status:1,logs:[{id:Number(hash)}]})}})",ui.context);
 const form=ui.document.querySelector('#event-form');form.reportValidity=()=>true;
 const values={organizer:wallet,title:'Campus workshop',description:'A coding workshop',club:'Code club',category:'Workshop',campus:'Campus',roles:'Attendee, Volunteer',venue:'Hall A',claimMode:'attendance',starts:'2026-12-01T10:00',eventEnds:'2026-12-01T12:00',mintStarts:'2026-12-01T10:00',ends:'2026-12-02T12:00',deadline:'2026-11-30T12:00'};
 for(const [key,value] of Object.entries(values))Object.defineProperty(form.elements[key],'value',{configurable:true,writable:true,value});
 const generate=ui.document.querySelector('#generate-poap');await generate.onclick({target:generate});
 const countInputs=ui.document.querySelectorAll('.role-design input[type="number"]');
 for (const [index,value] of ['40','12'].entries()) { countInputs[index].value=value; countInputs[index].oninput({target:countInputs[index]}); }
 const publish=ui.document.querySelector('#publish-button');await publish.onclick({target:publish});assert.equal(published.length,1,ui.document.querySelector('#toast').textContent);assert.deepEqual(published[0].roles,['Attendee']);
 await publish.onclick({target:publish});assert.equal(published.length,2);assert.deepEqual(published[1].roles,['Volunteer']);assert.notEqual(published[0].uri,published[1].uri);assert.equal(published[0].cap,40);assert.equal(published[1].cap,12);assert.deepEqual(supplies,[40n,12n,12n]);
 assert.equal(transactions.filter(uri=>uri===published[0].uri).length,1);assert(ui.location.hash.startsWith('drop/'));
});

test('each role accepts an independent custom upload and clearing it removes only that preview',async()=>{
 const ui=await setup({hash:'#create'});
 vm.runInContext("FileReader=class {readAsDataURL(file){this.result=file.data;this.onload();}}",ui.context);
 const form=ui.document.querySelector('#event-form');form.elements.roles.value='Attendee, Volunteer';form.elements.roles.onchange();
 for(let index=0;index<2;index++) {
  const input=ui.document.querySelectorAll('.role-design input[type="file"]')[index];
  Object.defineProperty(input,'files',{value:[{type:'image/png',size:30,data:`data:image/png;base64,custom${index}`} ]});input.onchange({target:input});
 }
 const images=ui.document.querySelectorAll('.role-design img');assert.notEqual(images[0].getAttribute('src'),images[1].getAttribute('src'));
 ui.document.querySelector('[data-clear-role="0"]').onclick();assert.equal(ui.document.querySelectorAll('.role-design img[src]').length,1);
 assert(!ui.requests.some(([path])=>path==='/api/artwork'));
});

test('homepage connection is shared by Gallery and Organize without repeat prompts',async()=>{
 const wallet='0x1111111111111111111111111111111111111111';let signedIn=false,signatures=0;
 const ui=await setup({ethereum:{isMetaMask:true,request:async({method})=>['eth_requestAccounts','eth_accounts'].includes(method)?[wallet]:'0xaa36a7'},respond:(path)=>{
  if(path==='/api/auth/me')return signedIn?{wallet,admin:false}:new Response('{}',{status:401});
  if(path==='/api/auth/challenge'){signatures++;return {id:'challenge',message:'Sign in'};}
  if(path==='/api/auth/verify'){signedIn=true;return {wallet};}
  if(path==='/api/wallet-collection?wallet='+wallet+'&cursor=1')return {total:0,pending:0,nextCursor:null,items:[]};
  if(path==='/api/organizer/events')return [];
 }});
 assert.equal(ui.document.querySelector('#wallet-welcome').hidden,false);
 const pending=ui.document.querySelector('#home-connect').onclick();await pending;
 assert.equal(ui.document.querySelector('#wallet-welcome').hidden,true);assert.equal(signatures,1);
 for(const hash of ['#gallery','#organize','#issuer/manage']) {
  ui.location.hash=hash;await ui.render();
  assert.equal(ui.document.querySelector('#gallery-connect,#studio-connect,#organizer-connect'),null);
  assert(!ui.document.querySelector('#live-app').textContent.includes('Use Connect wallet above'));
  assert.equal(ui.document.querySelector('#modal').open,false);
 }
 assert.equal(signatures,1);assert(ui.document.querySelector('#staff-event'));
});

test('editor requires the organizer address and offers individual drop counts without eligibility',async()=>{
 const wallet='0x1111111111111111111111111111111111111111';
 const ui=await setup({hash:'#create',respond:path=>path==='/api/auth/me'?{wallet,admin:true}:undefined});
 const form=ui.document.querySelector('#event-form');
 assert.equal(form.elements.organizer.value,'');assert.equal(form.elements.organizer.hasAttribute('required'),true);
 assert.equal(form.elements.eligibility,undefined);assert.equal(form.elements.cap,undefined);
 form.elements.roles.value='Speaker, Volunteer';form.elements.roles.oninput();
 assert.equal(ui.document.querySelectorAll('.role-design input[type="number"]').length,2);
 const publish=ui.document.querySelector('#publish-button');assert.equal(publish.textContent,'Publish event ↗');assert(!publish.textContent.includes('${'));
 vm.runInContext("location.protocol='http:';location.hostname='localhost';createEventPage()",ui.context);
 assert.equal(ui.document.querySelector('#publish-button').disabled,true);
 assert.match(ui.document.querySelector('#publish-status').textContent,/Save and submit your event here/);
});
