import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {mountNative,downloadQR} from './native.js';
import {getAddress,ZeroAddress,hexlify,toUtf8Bytes} from 'ethers';
import {createApiClient as realApiClient} from './api.js';
import {csv} from '../serverless/claims.js';
import {ABI} from '../serverless/chain.js';
import {metaMaskWallet} from './wallet.js';
import {aboutContent,issuerContent,doodle} from './content.js';
import {eventState, isPublicPastEvent, matchesEvent, profileStats, filterCollection, groupCollection} from './student-model.js';
import {createPageLoader} from './page-loader.js';
import {preserveEventDraft} from './event-draft.js';
import {submitPublication,uncertainPublication} from './publication.js';
import {circularArtwork} from './circular-artwork.js';

async function setup({hash = '', failure = false, events = [], ethereum, phantom, privy, respond, Contract} = {}) {
  const {document, window} = parseHTML(readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8'));
  Object.defineProperty(document, 'readyState', {value: 'complete'});
  Object.defineProperty(window.HTMLImageElement.prototype, 'complete', {configurable: true, get: () => true});
  Object.defineProperty(window.HTMLElement.prototype, 'elements', {configurable: true, get() {return Object.fromEntries([...this.querySelectorAll('[name]')].map(node => [node.getAttribute('name'),node]));}});
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){const option=this.querySelector('option[selected]')||this.querySelector('option');return option?(option.getAttribute('value')??option.textContent):'';},set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',(option.getAttribute('value')??option.textContent)===String(value));}});
  window.HTMLElement.prototype.requestSubmit = function(){this.onsubmit?.({preventDefault(){}});};
  const location = {hash, href: 'https://kairo.test/' + hash, origin: 'https://kairo.test', protocol: 'https:', hostname: 'kairo.test'};
  for (const dialog of document.querySelectorAll('dialog')) { dialog.showModal = () => {dialog.open = true;}; dialog.close = () => {dialog.open = false;dialog.dispatchEvent(new window.Event('close'));}; }
  window.ethereum = ethereum;
  window.kairoPrivy = privy;
  window.phantom = phantom ? {ethereum:phantom} : undefined;
  const requests = [], intervals = [], storage = new Map();
  const context = vm.createContext({document, window, location, navigator: {onLine: true}, URL, crypto, csv, console, history: {replaceState(){}},
    installPrivy(){}, circularArtwork, preserveEventDraft, submitPublication, uncertainPublication, homeArtCalls:0, mountHomeArt(){context.homeArtCalls++;}, QRCode:{toCanvas:async()=>{}}, createPageLoader, createApiClient:options=>realApiClient({...options,wait:async()=>{},retryDelays:[0,0]}), mountNative, downloadQR, getAddress, ZeroAddress, hexlify, toUtf8Bytes, Contract, ABI, BrowserProvider:class {constructor(provider){this.provider=provider;}async getSigner(account){return {getAddress:async()=>account,signMessage:async()=> 'test-signature'};}}, metaMaskWallet, aboutContent, issuerContent, doodle, eventState, isPublicPastEvent, matchesEvent, profileStats, filterCollection, groupCollection, claimEntry: () => null,
    setTimeout: () => 1, clearTimeout(){}, setInterval: fn => {intervals.push(fn);return intervals.length;}, clearInterval(){}, matchMedia: () => ({matches:true}),
    localStorage: {getItem: key => storage.get(key) || null, setItem:(key,value)=>storage.set(key,value), removeItem:key=>storage.delete(key)}, badgeSvg: () => '<svg/>', mountCoin(){}, mountPress(){},
    fetch: async (path, options) => { requests.push([path, options]); if (failure) throw Error('API offline'); if (respond) { const result = await respond(path,options); if (result !== undefined) return result instanceof Response ? result : Response.json(result); } return Response.json(path.startsWith('/api/my/requests') ? {rows:[],hasMore:false} : path === '/api/events' ? events : (path.startsWith('/api/organizer/events')||path.startsWith('/api/admin/events')) ? {events:[],publications:[]} : path === '/api/config' ? {contractAddress:'0xcontract',chainId:11155111,chainName:'Sepolia',explorerUrl:'https://sepolia.etherscan.io',categories:['Technology','Workshop']} : {}); }
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
  const ui = await setup({events:[{id:7,title:'Published event', description:'Live event', club:'Campus',category:'Technology',startsAt:1,endsAt:2,cap:5,remaining:5,mintStartsAt:1,mintEndsAt:2}]});
  assert.match(ui.document.querySelector('#badge-grid').textContent, /Published event/);
  assert.equal(ui.document.querySelector('#badge-grid .card-link'),null);
  assert.equal(ui.document.querySelector('#badge-grid .card-status, #badge-grid .pill, #badge-grid .card-club, #badge-grid .card-bottom'),null);
});

test('API failure renders retry and never silently supplies fixtures', async () => {
  const ui = await setup({failure:true});
  assert.match(ui.document.querySelector('#live-app').textContent,/Live service unavailable/);
  assert.ok(ui.document.querySelector('#retry-api'));
  assert.equal(ui.document.querySelectorAll('.card').length,0);
});

test('refresh opens each URL directly and keeps the homepage hidden on subpages', async () => {
  for (const hash of ['#events','#gallery','#organize','#about/proof','#builders/documentation','#admin/login']) {
    const ui = await setup({hash});
    assert.equal(ui.location.hash, hash);
    assert([...ui.document.querySelectorAll('[data-home]')].every(node => node.hidden), hash);
    assert.equal(ui.document.querySelector('#live-app').hidden, false, hash);
    assert.equal(ui.document.querySelector('#page-loader').hidden, true, hash);
  }
});

test('a slow session restore keeps the loader visible and renders the latest URL once ready', async () => {
  let restore;
  const ui = await setup({hash:'#events',respond:path=>path==='/api/auth/me'?new Promise(resolve=>{restore=resolve;}):undefined});
  assert.equal(ui.document.querySelector('#page-loader').hidden,false);
  assert(ui.document.documentElement.hasAttribute('data-page-loading'));
  ui.location.hash='#builders/documentation'; await ui.render();
  assert.equal(ui.document.querySelector('#page-loader').hidden,false);
  restore({}); await new Promise(resolve=>setImmediate(resolve));
  assert.match(ui.document.querySelector('#live-app').textContent,/Organizer guide/);
  assert([...ui.document.querySelectorAll('[data-home]')].every(node=>node.hidden));
  assert.equal(ui.document.querySelector('#page-loader').hidden,true);
});


test('page load checks the session cookie without requesting wallet accounts',async()=>{
  const methods=[];const ui=await setup({ethereum:{isMetaMask:true,request:async({method})=>{methods.push(method);return ['0x1111111111111111111111111111111111111111'];}}});
  assert.deepEqual(methods,[]);assert.match(ui.document.querySelector('#wallet').textContent,/Connect wallet/);assert(ui.requests.some(([path])=>path==='/api/auth/me'));
});
test('organizer studio uses the shared session and documentation chapter links keep the docs visible',async()=>{
  const ui=await setup({hash:'#issuer/studio'});assert.equal(ui.document.querySelector('#studio-connect'),null);assert.match(ui.document.querySelector('#live-app').textContent,/Organizer studio/);
  ui.location.hash='#builders/documentation';await ui.render();assert.equal(ui.document.querySelectorAll('.docs-copy section').length,7);
  assert.match(ui.document.querySelector('#live-app').textContent,/Organizer guide/);
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
  if(path.startsWith('/api/organizer/events'))return {events:[],publications:[]};
 }});
 const pending=ui.document.querySelector('#wallet').onclick();await pending;
 assert.equal(ui.document.querySelector('#modal').open,false);assert.match(ui.document.querySelector('#wallet').textContent,/0x1111/);
 assert.equal(ui.requests.filter(([path])=>path==='/api/auth/verify').length,1);
 ui.location.hash='#organize';await ui.render();assert.equal(ui.document.querySelector('#studio-connect'),null);assert.match(ui.document.querySelector('#live-app').textContent,/publish with sponsored gas/);
 assert.equal(calls.filter(method=>method==='eth_requestAccounts').length,0);
});
test('MetaMask spam block shows a safe sign-in error and a manual retry reuses approved account access',async()=>{
 const address='0x1111111111111111111111111111111111111111',methods=[];let blocked=true,authenticated=false;
 const ui=await setup({ethereum:{isMetaMask:true,request:async({method})=>{
  methods.push(method);
  if(method==='personal_sign'){if(blocked)throw {code:'UNKNOWN_ERROR',error:{code:4100,message:'Request blocked due to spam filter.'}};return '0xsigned';}
  return ['eth_accounts','eth_requestAccounts'].includes(method)?[address]:'0xaa36a7';
 }},respond:path=>{
  if(path==='/api/auth/challenge')return {id:'challenge',message:'Sign in to Kairo'};
  if(path==='/api/auth/verify'){authenticated=true;return {wallet:address};}
  if(path==='/api/auth/me')return authenticated?{wallet:address,admin:false}:new Response('{}',{status:401});
 }});
 await ui.document.querySelector('#wallet').onclick();
 assert.match(ui.document.querySelector('#request-error').textContent,/MetaMask blocked the sign-in request as spam/);
 assert.doesNotMatch(ui.document.querySelector('#request-error').textContent,/could not coalesce|personal_sign|payload/);
 assert.equal(ui.requests.some(([path])=>path==='/api/auth/verify'),false);
 assert.equal(ui.document.querySelector('#wallet').textContent,'Connect wallet');
 blocked=false;await ui.document.querySelector('#wallet').onclick();
 assert.equal(authenticated,true);assert.equal(methods.filter(method=>method==='wallet_requestPermissions').length,1);
 assert.equal(methods.filter(method=>method==='personal_sign').length,2);
});
test('a reload restores the signed session UI without calling a wallet extension',async()=>{
 const calls=[],address='0x1111111111111111111111111111111111111111';
 const ui=await setup({ethereum:{isMetaMask:true,request:async({method})=>calls.push(method)},respond:path=>path==='/api/auth/me'?{wallet:address,admin:false}:undefined});
 assert.match(ui.document.querySelector('#wallet').textContent,/0x1111/);assert.deepEqual(calls,[]);assert.equal(ui.document.querySelector('#wallet-welcome'),null);
});
test('the Builders legacy build route opens the organizer guide, never an event form',async()=>{
 const ui=await setup({hash:'#builders/build'});assert(ui.document.querySelector('.docs-copy'));assert.equal(ui.document.querySelector('#event-form'),null);
});
test('untrusted event text, IDs, artwork URLs and collection routes cannot inject active HTML',async()=>{
 const payload='"><img src=x onerror="alert(1)"><script>alert(1)</script>';
 const ui=await setup({events:[{id:payload,title:payload,description:payload,club:payload,category:'Technology',image:'javascript:alert(1)',startsAt:1,endsAt:2,cap:0,remaining:0,mintStartsAt:1,mintEndsAt:2}]});
 const grid=ui.document.querySelector('#badge-grid');assert.equal(grid.querySelector('script,[onerror],[onclick],[onmouseover]'),null);assert(grid.textContent.includes(payload));assert(!grid.querySelector('img[src^="javascript:"]'));
 for(const value of ['javascript:alert(1)','data:image/svg+xml,<svg onload=alert(1)>','https://user:pass@example.test/a.png','/media/../../api/auth/me','https://example.test/a.png\nonerror=alert(1)'])assert.equal(vm.runInContext(`safeImage(${JSON.stringify(value)})`,ui.context),'');
 ui.location.hash='#collection/'+payload;await ui.render();assert.equal(ui.document.querySelector('#live-app script,#live-app [onerror]'),null);
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
 assert.equal(ui.requests.filter(([path])=>path==='/api/auth/verify').length,2);assert.equal(calls.filter(method=>method==='eth_requestAccounts').length,0);
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

test('discovery only lists past events below searchable category controls',async()=>{
 const now=Date.now()/1000;
 const ui=await setup({hash:'#events',events:[{id:1,title:'Live workshop',startsAt:now-100,endsAt:now+100,category:'Workshop'},{id:2,title:'Future workshop',startsAt:now+200,endsAt:now+400,category:'Workshop'},{id:3,title:'Old art show',startsAt:now-400,endsAt:now-200,category:'Arts'}]});
 const sections=ui.document.querySelectorAll('.event-period');assert.equal(sections.length,1);
 assert.match(sections[0].textContent,/Past events.*Old art show/s);assert(!ui.document.querySelector('#live-events').textContent.includes('Live workshop'));assert(!ui.document.querySelector('#live-events').textContent.includes('Future workshop'));
 assert(ui.document.querySelector('.event-search svg'));
 const search=ui.document.querySelector('#live-search');search.value='workshop';search.oninput();assert(!ui.document.querySelector('#live-events').textContent.includes('Old art show'));
});

test('Gallery displays badges without search, year, role, organization or sort controls',async()=>{
 const wallet='0x1111111111111111111111111111111111111111';
 const ui=await setup({hash:'#gallery',respond:path=>path==='/api/auth/me'?{wallet}:path.startsWith('/api/wallet-collection')?{total:1,pending:0,nextCursor:null,items:[{id:1,tokenId:'1',role:'Attendee',title:'My POAP'}]}:undefined});
 assert(ui.document.querySelector('.gallery-event .card'));assert.equal(ui.document.querySelectorAll('#live-app [data-filter]').length,0);
 assert.equal(ui.document.querySelector('#collection-tools').children.length,0);
});

test('subpages provide top-left links back to studio or About even during an events outage',async()=>{
 const ui=await setup({hash:'#issuer/manage'});assert.equal(ui.document.querySelector('.back-link').getAttribute('href'),'#issuer/studio');
 ui.location.hash='#issuer/guide';await ui.render();assert.equal(ui.document.querySelector('.back-link').getAttribute('href'),'#issuer/studio');
 ui.location.hash='#about/case-studies';await ui.render();assert.equal(ui.document.querySelector('.back-link').getAttribute('href'),'#about/proof');
 vm.runInContext("apiError='Service down'",ui.context);ui.location.hash='#builders/documentation';await ui.render();assert(ui.document.querySelector('#guide-design'));
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

test('header connection is shared by Gallery and Organize without repeat prompts',async()=>{
 const wallet='0x1111111111111111111111111111111111111111';let signedIn=false,signatures=0;
 const ui=await setup({ethereum:{isMetaMask:true,request:async({method})=>['eth_requestAccounts','eth_accounts'].includes(method)?[wallet]:'0xaa36a7'},respond:(path)=>{
  if(path==='/api/auth/me')return signedIn?{wallet,admin:false}:new Response('{}',{status:401});
  if(path==='/api/auth/challenge'){signatures++;return {id:'challenge',message:'Sign in'};}
  if(path==='/api/auth/verify'){signedIn=true;return {wallet};}
  if(path==='/api/wallet-collection?wallet='+wallet+'&cursor=1')return {total:0,pending:0,nextCursor:null,items:[]};
  if(path.startsWith('/api/organizer/events'))return {events:[],publications:[]};
 }});
 assert.equal(ui.document.querySelector('#home-connect'),null);
 const pending=ui.document.querySelector('#wallet').onclick();await pending;
 assert.equal(ui.document.querySelector('#wallet-welcome'),null);assert.equal(signatures,1);
 for(const hash of ['#gallery','#organize','#issuer/manage']) {
  ui.location.hash=hash;await ui.render();
  assert.equal(ui.document.querySelector('#gallery-connect,#studio-connect,#organizer-connect'),null);
  assert(!ui.document.querySelector('#live-app').textContent.includes('Use Connect wallet above'));
  assert.equal(ui.document.querySelector('#modal').open,false);
 }
 assert.equal(signatures,1);assert(ui.document.querySelector('#staff-event'));
});

test('any signed-in organizer directly publishes distinct generated roles and resumes through server progress',async()=>{
 const ui=await setup({respond:(path,options)=>{
  if(path==='/api/artwork'){const {role}=JSON.parse(options.body);return {image:`https://kairo.test/media/art/${role}.svg`,uri:`https://kairo.test/media/metadata/${role}.json`};}
  if(path==='/api/organizer/events'&&options.method==='POST')return {id:JSON.parse(options.body).id,status:'pending'};
  if(path.startsWith('/api/publications/'))return {status:'live',events:[{id:7}]};
 }});
 vm.runInContext("session={wallet:'0x1111111111111111111111111111111111111111',admin:false}; createEventPage()",ui.context);
 const form=ui.document.querySelector('#event-form');form.reportValidity=()=>true;
 for(const [key,value]of Object.entries({title:'Campus workshop',description:'A coding workshop for our campus',club:'Code club',category:'Workshop',campus:'Main campus',roles:'Attendee, Judge',venue:'Hall A',starts:'2026-12-01T10:00',eventEnds:'2026-12-01T12:00',mintStarts:'2026-12-01T10:00',ends:'2026-12-02T12:00'}))Object.defineProperty(form.elements[key],'value',{configurable:true,writable:true,value});
 assert.equal(form.elements.organizer,undefined);assert.equal(ui.document.querySelector('#submit-event'),null);
 form.elements.roles.oninput();
 for(let i=0;i<2;i++){const generate=ui.document.querySelector(`[data-generate-role="${i}"]`);await generate.onclick({target:generate});}
 form.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 const posts=ui.requests.filter(([path,options])=>path==='/api/organizer/events'&&options.method==='POST');assert.equal(posts.length,1);
 const payload=JSON.parse(posts[0][1].body);assert.deepEqual(payload.roleArtwork.map(art=>art.role),['Attendee','Judge']);assert.equal(new Set(payload.roleArtwork.map(art=>art.uri)).size,2);
 for(const name of ['submit','draftId','rsvpDeadline','wallet','organizer'])assert.equal(name in payload,false);
 assert.equal(ui.location.hash,'issuer/manage/7');assert.equal(vm.runInContext("localStorage.getItem('kairo-publishing')",ui.context),null);
 assert.match(ui.document.querySelector('#toast').textContent,/Awaiting super-admin approval/);
 assert.equal(payload.approximateAttendees,50);
 for(const selector of ['[name="approximateAttendees"]','#clear-artwork','#resume-event','#discard-publication'])assert.equal(form.querySelector(selector),null);
 assert.doesNotMatch(form.textContent,/Use artwork you have permission|Your publication is saved|Publish immediately with sponsored gas/);
});

test('superadmin Activity is separate from request review and shows gas, network and audit',async()=>{
 const wallet='0x1111111111111111111111111111111111111111';
 const ui=await setup({hash:'#admin/activity',respond:path=>{
  if(path==='/api/auth/me')return {wallet,admin:true};
  if(path==='/api/admin/system')return {relayer:wallet,signerAddress:wallet,balanceETH:'0.599993',superAdminOnChain:true,actions:[]};
  if(path==='/api/health')return {status:'ok',dependencies:{config:{status:'ok'},rpc:{status:'ok'},contract:{status:'ok'},relayer:{status:'ok'}}};
  if(path==='/api/admin/audit')return {rows:[],hasMore:false};
 }});
 assert(ui.document.querySelector('#studio-system'));
 assert.equal(ui.document.querySelector('#studio-events'),null);
 assert(ui.document.querySelector('a[href="#admin"]'));
 assert.equal(ui.document.querySelectorAll('.page-controls').length,0);
 assert.match(ui.document.querySelector('.relayer-balance').textContent,/0\.599993/);
 assert.match(ui.document.querySelector('.activity-panel').textContent,/No admin actions yet/);
 assert.doesNotMatch(ui.document.querySelector('#live-app').textContent,/Previous eventsNext events|config: ok|d1: ok|Previous actionsNext actions/);
 assert.match(ui.document.querySelector('.service-badge.is-ready').textContent,/Ready/);
});
test('only the superadmin can grant and revoke panel wallets from Activity',async()=>{
 const wallet='0x1111111111111111111111111111111111111111',delegate='0x2222222222222222222222222222222222222222',calls=[];
 const ethereum={isMetaMask:true,request:async({method})=>method==='eth_accounts'?[wallet]:'0xaa36a7',on(){},removeListener(){}};
 class ContractMock {setPanelAdmin=async(address,allowed)=>{calls.push([address,allowed]);return {wait:async()=>({status:1})};}}
 const respond=path=>{
  if(path==='/api/auth/me')return {wallet,admin:true,superAdmin:true};
  if(path==='/api/admin/system')return {relayer:wallet,signerAddress:wallet,balanceETH:'0.6',superAdminOnChain:true,panelAdmins:[delegate],actions:[]};
  if(path==='/api/health')return {status:'ok',dependencies:{}};
  if(path==='/api/admin/audit')return {rows:[],hasMore:false};
 };
 const ui=await setup({hash:'#admin/activity',ethereum,Contract:ContractMock,respond});
 const form=ui.document.querySelector('#panel-admin-form');assert(form);
 form.elements.wallet.value=delegate;form.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls[0],[delegate,true]);
 const button=ui.document.querySelector('[data-revoke-panel]');button.onclick();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls[1],[delegate,false]);
 const delegated=await setup({hash:'#admin/activity',respond:path=>path==='/api/auth/me'?{wallet:delegate,admin:true,superAdmin:false}:respond(path)});
 assert.equal(delegated.document.querySelector('#panel-admin-form'),null);
});
test('superadmin Review requests panel lists event requests without loading Activity',async()=>{
 const wallet='0x1111111111111111111111111111111111111111',now=Math.floor(Date.now()/1000);
 const ui=await setup({hash:'#admin',respond:path=>{
  if(path==='/api/auth/me')return {wallet,admin:true};
  if(path==='/api/admin/events?page=0')return {events:[{id:7,title:'Campus workshop',organizer:wallet,roles:['Attendee'],listed:true,startsAt:now-60,endsAt:now+3600,mintStartsAt:now-60,mintEndsAt:now+3600,pendingRequests:2}],publications:[]};
 }});
 assert(ui.document.querySelector('#studio-events'));assert.equal(ui.document.querySelector('#studio-system'),null);
 assert.match(ui.document.querySelector('#studio-events').textContent,/2 pending POAP requests/);
 assert.equal(ui.document.querySelector('.studio-event-actions a').getAttribute('href'),'#admin/events/7');
 assert(ui.document.querySelector('a[href="#admin/activity"]'));
 assert.equal(ui.requests.some(([path])=>path==='/api/admin/system'||path==='/api/admin/audit'),false);
});
test('contract setup problems remain visible while network connectivity is shown separately',async()=>{
 const wallet='0x1111111111111111111111111111111111111111';
 const ui=await setup({hash:'#admin/activity',respond:path=>{
  if(path==='/api/auth/me')return {wallet,admin:true};
  if(path==='/api/admin/system')return {relayer:wallet,signerAddress:wallet,balanceETH:'0.6',superAdminOnChain:true,actions:[]};
  if(path==='/api/health')return {status:'degraded',dependencies:{rpc:{status:'ok'},contract:{status:'error',code:'CONTRACT_MISMATCH',message:'Deploy the updated Kairo contract.'},relayer:{status:'ok'}}};
  if(path==='/api/admin/audit')return {rows:[],hasMore:false};
 }});
 assert.match(ui.document.querySelector('.setup-note').textContent,/Connect the updated contract/);
 assert.equal(ui.document.querySelector('.service-details'),null);
 assert.equal(ui.document.querySelector('#request-error').hidden,true);
 assert.equal(ui.document.querySelector('#studio-events'),null);
});
test('studio pagination appears only when another events page exists',async()=>{
 const ui=await setup({hash:'#issuer/studio',respond:path=>{
  if(path==='/api/auth/me')return {wallet:'0x1111111111111111111111111111111111111111',admin:false};
  if(path==='/api/organizer/events?page=0')return {events:[],publications:[],hasMore:true};
  if(path==='/api/organizer/events?page=1')return {events:[],publications:[],hasMore:false};
 }});
 assert.equal(ui.document.querySelectorAll('.page-controls button').length,1);
 assert.match(ui.document.querySelector('.page-controls button').textContent,/Next/);
 ui.document.querySelector('.page-controls button').onclick();await new Promise(resolve=>setImmediate(resolve));
 assert(ui.requests.some(([path])=>path==='/api/organizer/events?page=1'));
 assert.match(ui.document.querySelector('.page-controls button').textContent,/Previous/);
});

test('Publish event retries setup failures and uncertain submissions without separate resume controls',async()=>{
 for(const failure of ['CONTRACT_MISMATCH','UNREACHABLE']) {
  let fail=true;const payloads=[];
  const ui=await setup({respond:(path,options)=>{
   if(path==='/api/artwork')return {image:'https://kairo.test/media/art/badge.svg',uri:'https://kairo.test/media/metadata/badge.json'};
   if(path==='/api/organizer/events'&&options.method==='POST'){
    payloads.push(JSON.parse(options.body));
    if(fail){fail=false;if(failure==='UNREACHABLE')throw Error('Connection lost');return Response.json({code:failure,error:'Update the Kairo contract to publish.'},{status:503});}
    return {id:JSON.parse(options.body).id,status:'pending'};
   }
   if(path.startsWith('/api/publications/'))return {status:'live',events:[{id:7}]};
  }});
  vm.runInContext("session={wallet:'0x1111111111111111111111111111111111111111',admin:false}; createEventPage()",ui.context);
  const form=ui.document.querySelector('#event-form');form.reportValidity=()=>true;
  for(const [name,value]of Object.entries({title:'Campus workshop',description:'A coding workshop for our campus',club:'Code club',category:'Workshop',campus:'Main campus',roles:'Attendee',venue:'Hall A',starts:'2026-12-01T10:00',eventEnds:'2026-12-01T12:00',mintStarts:'2026-12-01T10:00',ends:'2026-12-02T12:00'}))Object.defineProperty(form.elements[name],'value',{configurable:true,writable:true,value});
  const generate=ui.document.querySelector('[data-generate-role]');await generate.onclick({target:generate});
  form.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
  if(failure==='CONTRACT_MISMATCH'){
   assert.equal(vm.runInContext("localStorage.getItem('kairo-publishing')",ui.context),null);assert.match(ui.document.querySelector('#publish-status').textContent,/Update the Kairo contract/);
   form.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
  }else {
   assert.equal(ui.document.querySelector('#resume-event'),null);
   assert.equal(payloads.length,1);assert.equal(ui.location.hash,'issuer/manage/7');
   assert.doesNotMatch(ui.document.querySelector('#publish-status').textContent,/Connection interrupted/);
  }
  assert.equal(ui.location.hash,'issuer/manage/7');assert.equal(vm.runInContext("localStorage.getItem('kairo-publishing')",ui.context),null);
 }
});

test('studio event IDs, role names and titles cannot inject active attributes',async()=>{
 const ui=await setup({hash:'#issuer/studio',respond:path=>{
  if(path==='/api/auth/me')return {wallet:'0x1111111111111111111111111111111111111111',admin:false};
  if(path.startsWith('/api/organizer/events'))return {publications:[],hasMore:false,events:[{id:'2" onclick="alert(1)',title:'<img src=x onerror=alert(1)>',venue:'Hall',roles:['<script>bad()</script>'],startsAt:1,listed:true,image:'javascript:alert(1)'}]};
 }});
 assert.equal(ui.document.querySelector('#live-app [onclick],#live-app [onerror],#live-app script'),null);
});

test('wallet connection uses Privy for everyone and organizer studio hides system tools',async()=>{
 const login=await setup({hash:'#admin/login'});
 assert(login.document.querySelector('#admin-sign-in'));
 assert.match(login.document.querySelector('#live-app').textContent,/Use Privy to connect your wallet/);
 assert.equal(login.requests.some(([path])=>path.startsWith('/api/admin/')),false);
 const denied=await setup({hash:'#admin',respond:path=>path==='/api/auth/me'?{wallet:'0x1111111111111111111111111111111111111111',admin:false}:undefined});
 assert.match(denied.document.querySelector('#live-app').textContent,/Use Privy to connect your wallet/);
 assert.doesNotMatch(denied.document.querySelector('#live-app').textContent,/superadmin and wallets granted panel access/);
 assert.equal(denied.requests.some(([path])=>path.startsWith('/api/admin/')),false);
 const studio=await setup({hash:'#issuer/studio',respond:path=>path==='/api/auth/me'?{wallet:'0x1111111111111111111111111111111111111111',admin:true}:undefined});
 assert.equal(studio.document.querySelector('#studio-system'),null);
});

test('an approved organizer event exposes a public mint link and preserves recipient export controls',async()=>{
 const now=Math.floor(Date.now()/1000),event={id:7,title:'Campus workshop',description:'A coding workshop',roles:['Attendee'],listed:true,paused:false,mintStartsAt:now-60,mintEndsAt:now+3600};
 const ui=await setup({hash:'#issuer/manage/7',respond:(path,options)=>{
  if(path==='/api/auth/me')return {wallet:'0x1111111111111111111111111111111111111111',admin:false};
  if(path.startsWith('/api/organizer/events'))return {events:[event],publications:[]};
  if(path==='/api/events/7/dashboard')return {minted:0,pending:0,failed:0,linksIssued:0,linksUsed:0,qrClaims:0,capRemaining:10};
  if(path.startsWith('/api/events/7/transactions'))return {rows:[],hasMore:false};
  if(path.startsWith('/api/events/7/links'))return options?.method==='POST'?{links:[{email:'guest@example.org',role:'Attendee',link:'https://kairo.test/#redeem/single-use-token'}],merged:0}:{rows:[],hasMore:false};
  if(path==='/api/events/7/qr')return {token:'signed-rotating-token'};
 }});
 assert(ui.document.querySelector('#public-mint-link'));assert.equal(ui.document.querySelector('#walk-in'),null);
 const form=ui.document.querySelector('#recipients-form');form.elements.recipients.value='email,role\nguest@example.org,Attendee';form.onsubmit({preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));
 assert(ui.document.querySelector('#export-links'));assert(ui.document.querySelector('[data-copy-link]'));
 assert.match(ui.document.querySelector('#issued-links a').getAttribute('href'),/^mailto:guest%40example.org/);
 event.paused=true;await ui.render();assert.equal(ui.document.querySelector('#walk-in'),null);
});

test('event creator can edit and delete a published event from their workspace',async()=>{
 const now=Math.floor(Date.now()/1000),address='0x1111111111111111111111111111111111111111';
 const event={id:7,title:'Campus workshop',description:'A coding workshop',club:'Code club',campus:'Main',category:'Technology',venue:'Hall A',organizer:address,roles:['Attendee'],listed:true,paused:false,startsAt:now-60,endsAt:now+3600,mintStartsAt:now-60,mintEndsAt:now+3600,approximateAttendees:10};
 const ui=await setup({hash:'#issuer/manage/7',respond:(path,options)=>{
  if(path==='/api/auth/me')return {wallet:address,admin:false};
  if(path==='/api/organizer/events?page=0')return {events:[event],publications:[]};
  if(path==='/api/events')return event.deleted?[]:[event];
  if(path==='/api/events/7/dashboard')return {event,capRemaining:10};
  if(path.startsWith('/api/events/7/transactions')||path.startsWith('/api/events/7/links'))return {rows:[],hasMore:false};
  if(path==='/api/organizer/events/7'&&options?.method==='POST'){
   const body=JSON.parse(options.body);if(body.action==='delete')event.deleted=true;else Object.assign(event,body);return {status:body.action==='delete'?'deleted':'saved'};
  }
 }});
 const edit=ui.document.querySelector('#edit-event'),del=ui.document.querySelector('#delete-event');
 assert(edit);assert(del);assert.equal(ui.document.querySelector('#direct-mint'),null);
 edit.elements.title.value='Creator revised event';edit.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 const editCall=ui.requests.find(([path,options])=>path==='/api/organizer/events/7'&&JSON.parse(options.body).action==='edit');
 assert.equal(JSON.parse(editCall[1].body).title,'Creator revised event');assert.equal(JSON.parse(editCall[1].body).mintEndsAt,undefined);
 del.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(ui.requests.filter(([path,options])=>path==='/api/organizer/events/7'&&JSON.parse(options.body).action==='delete').length,0);
 del.querySelector('input').checked=true;del.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(event.deleted,true);assert.equal(ui.location.hash,'#issuer/studio');
});

test('ended events appear as Past in the organizer studio and remain in public discovery',async()=>{
 const now=Math.floor(Date.now()/1000),address='0x1111111111111111111111111111111111111111';
 const event={id:7,title:'Past workshop',description:'A coding workshop',club:'Code club',category:'Technology',venue:'Hall A',organizer:address,roles:['Attendee'],listed:true,paused:false,startsAt:now-7200,endsAt:now-3600,mintStartsAt:now-7200,mintEndsAt:now-3600};
 const respond=path=>path==='/api/auth/me'?{wallet:address,admin:false}:path==='/api/organizer/events?page=0'?{events:[event],publications:[]}:undefined;
 const studio=await setup({hash:'#issuer/studio',events:[event],respond});
 assert.match(studio.document.querySelector('#studio-events').textContent,/Past event/);
 assert.match(studio.document.querySelector('#studio-events').textContent,/Minting closed/);
 const discovery=await setup({hash:'#events',events:[event],respond});
 assert.match(discovery.document.querySelector('#live-app').textContent,/Past workshop/);
 assert.equal(discovery.document.querySelector('#live-app .card-bottom, #live-app .card-status, #live-app .pill'),null);
 assert.match(discovery.document.querySelector('.past-event-card').textContent,/Past workshopHall A/);
 discovery.location.hash='#drop/7';await discovery.render();
 const dialog=discovery.document.querySelector('#modal');
 assert.match(dialog.textContent,/Minting has closed for this event/);
 assert.equal(dialog.querySelector('#poap-request button').disabled,true);
});

test('superadmin dashboard submits recipient mints and accepts or rejects individual POAP requests',async()=>{
 const now=Math.floor(Date.now()/1000),address='0x1111111111111111111111111111111111111111',requestId=crypto.randomUUID();
 const event={id:7,title:'Campus workshop',description:'A coding workshop',roles:['Attendee'],listed:true,paused:false,mintStartsAt:now-60,mintEndsAt:now+3600};
 const ui=await setup({hash:'#admin/events/7',respond:(path,options)=>{
  if(path==='/api/auth/me')return {wallet:address,admin:true,superAdmin:true};
  if(path.startsWith('/api/admin/events?'))return {events:[event],publications:[]};
  if(path==='/api/events/7/dashboard')return {capRemaining:10};
  if(path.startsWith('/api/events/7/requests'))return {rows:[{id:requestId,wallet:address,status:'pending'}],hasMore:false};
  if(path.startsWith('/api/events/7/transactions')||path.startsWith('/api/events/7/links'))return {rows:[],hasMore:false};
  if(path.startsWith('/api/admin/events/7/')&&options?.method==='POST')return {status:'pending'};
 }});
 const form=ui.document.querySelector('#direct-mint');assert(form,ui.document.querySelector('#live-app').textContent);
 form.elements.wallet.value=address;form.onsubmit({preventDefault(){},target:form});await new Promise(resolve=>setImmediate(resolve));
 const mint=ui.requests.find(([path])=>path==='/api/admin/events/7/mint');assert.deepEqual(JSON.parse(mint[1].body),{wallet:address});
 for(const action of ['accept','reject']) {
  await ui.document.querySelector(`[data-decision="${action}"]`).onclick();
  assert(ui.requests.some(([path,options])=>path===`/api/admin/events/7/requests/${requestId}/${action}`&&options.method==='POST'));
 }
});

test('event details submit a consented request for the signed wallet and show its review status',async()=>{
 const address='0x1111111111111111111111111111111111111111',event={id:7,title:'Campus workshop',description:'Workshop',roles:['Attendee'],listed:true,mintStartsAt:1,mintEndsAt:Math.floor(Date.now()/1000)+3600};
 let saved;
 const ui=await setup({respond:(path,options)=>{
  if(path==='/api/auth/me')return {wallet:address,admin:false};
  if(path.startsWith('/api/events/7/requests')) {
   if(options?.method==='POST'){saved={id:'request',wallet:address,status:'pending'};return saved;}
   return {rows:saved?[saved]:[],hasMore:false};
  }
 }});
 vm.runInContext('showEvent('+JSON.stringify(event)+')',ui.context);await new Promise(resolve=>setImmediate(resolve));
 let form=ui.document.querySelector('#poap-request');assert(form);form.querySelector('input').checked=true;
 form.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 const submitted=ui.requests.find(([path,options])=>path==='/api/events/7/requests'&&options?.method==='POST');assert.deepEqual(JSON.parse(submitted[1].body),{permanentConsent:true});
 assert.match(form.textContent,/POAP request: pending/);assert.equal(form.querySelector('button').hidden,true);
 saved.status='rejected';vm.runInContext('showEvent('+JSON.stringify(event)+')',ui.context);await new Promise(resolve=>setImmediate(resolve));
 form=ui.document.querySelector('#poap-request');assert.match(form.textContent,/POAP request: rejected/);assert.equal(form.querySelector('button').hidden,true);
});

test('Gallery contains only minted owned POAPs and refreshes after confirmation',async()=>{
 const address='0x1111111111111111111111111111111111111111';let minted=false;
 const ui=await setup({hash:'#gallery',respond:path=>{
  if(path==='/api/auth/me')return {wallet:address,admin:false};
  if(path.startsWith('/api/my/requests'))return {rows:[{id:'request',event_id:7,title:'Campus workshop',role:'Attendee',status:minted?'accepted':'pending',mint_status:minted?'confirmed':null}],hasMore:false};
  if(path.startsWith('/api/wallet-collection'))return {items:minted?[{id:7,tokenId:'9',title:'Campus workshop',role:'Attendee',image:'https://kairo.test/media/art/badge.png',history:[],ownershipVerified:true}]:[],total:minted?1:0,nextCursor:null,pending:0};
 }});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(ui.document.querySelector('#gallery-requests'),null);assert.equal(ui.document.querySelectorAll('.gallery-badge').length,0);
 assert.equal(ui.requests.some(([path])=>path.startsWith('/api/my/requests')),false);
 minted=true;await ui.intervals[0]();await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(ui.document.querySelectorAll('.gallery-badge').length,1);assert.equal(ui.document.querySelector('.gallery-badge img').getAttribute('src'),'https://kairo.test/media/art/badge.png');
});

test('admin background refresh preserves an address being typed and manual refresh reads fresh event state',async()=>{
 const now=Math.floor(Date.now()/1000),event={id:7,title:'Campus workshop',description:'Workshop',roles:['Attendee'],listed:true,paused:false,mintStartsAt:now-60,mintEndsAt:now+3600};let paused=false;
 const ui=await setup({hash:'#admin/events/7',respond:path=>{
  if(path==='/api/auth/me')return {wallet:'0x1111111111111111111111111111111111111111',admin:true};
  if(path.startsWith('/api/admin/events?'))return {events:[event],publications:[]};
  if(path==='/api/events/7/dashboard')return {capRemaining:10,event:{...event,paused},paused,mintStartsAt:event.mintStartsAt,mintEndsAt:event.mintEndsAt};
  if(path.startsWith('/api/events/7/requests')||path.startsWith('/api/events/7/transactions')||path.startsWith('/api/events/7/links'))return {rows:[],hasMore:false};
 }});
 const content=ui.document.querySelector('#staff-content'),field=content.querySelector('#direct-mint input');field.value='0x123';content.oninput();
 await ui.intervals.at(-1)();assert.equal(content.querySelector('#direct-mint input').value,'0x123');
 paused=true;await content.querySelector('#refresh-dashboard').onclick();assert.equal(content.querySelector('#direct-mint button').disabled,true);assert.match(content.textContent,/Minting is paused/);
});

test('an unrelated saved publication never blocks publishing a new event',async()=>{
 const oldId=crypto.randomUUID(),payloads=[];
 const ui=await setup({respond:(path,options)=>{
  if(path==='/api/artwork')return {image:'https://kairo.test/media/art/badge.svg',uri:'https://kairo.test/media/metadata/badge.json'};
  if(path==='/api/organizer/events'&&options.method==='POST'){payloads.push(JSON.parse(options.body));return {status:'pending'};}
  if(path.startsWith('/api/publications/'))return {status:'pending',events:[]};
 }});
 vm.runInContext(`session={wallet:'0x1111111111111111111111111111111111111111',admin:false};localStorage.setItem('kairo-publishing',JSON.stringify({id:'${oldId}'}));createEventPage()`,ui.context);
 const form=ui.document.querySelector('#event-form');form.reportValidity=()=>true;
 assert.equal(ui.document.querySelector('#discard-publication, #resume-event'),null);
 for(const [name,value]of Object.entries({title:'New campus workshop',description:'A new coding workshop for our campus',club:'Code club',category:'Workshop',campus:'Main campus',roles:'Attendee',venue:'Hall A',starts:'2026-12-01T10:00',eventEnds:'2026-12-01T12:00',mintStarts:'2026-12-01T10:00',ends:'2026-12-02T12:00'}))Object.defineProperty(form.elements[name],'value',{configurable:true,writable:true,value});
 const generate=ui.document.querySelector('[data-generate-role]');await generate.onclick({target:generate});
 form.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(payloads.length,1);assert.notEqual(payloads[0].id,oldId);assert.equal(payloads[0].title,'New campus workshop');
});

test('artwork finishing after navigation cannot write into the next page or publish an event',async()=>{
 const wallet='0x1111111111111111111111111111111111111111';let finishArtwork;
 const ui=await setup({hash:'#create',respond:path=>{
  if(path==='/api/auth/me')return {wallet,admin:false};
  if(path==='/api/artwork')return new Promise(resolve=>{finishArtwork=()=>resolve({image:'https://kairo.test/media/art/badge.svg',uri:'https://kairo.test/media/metadata/badge.json'});});
 }});
 const form=ui.document.querySelector('#event-form');form.elements.title.value='Campus workshop';form.elements.description.value='A coding workshop';
 const generation=ui.document.querySelector('[data-generate-role]').onclick({target:ui.document.querySelector('[data-generate-role]')});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(typeof finishArtwork,'function');
 ui.location.hash='#events';await ui.render();finishArtwork();await generation;
 assert(ui.document.querySelector('#live-events'));assert.equal(ui.document.querySelector('#role-designs'),null);
 assert.equal(ui.requests.some(([path])=>path==='/api/organizer/events'),false);
 assert.equal(ui.document.querySelector('#request-error').hidden,true);
});

test('a detached Gallery refresh cannot write into another page',async()=>{
 const wallet='0x1111111111111111111111111111111111111111';
 const ui=await setup({hash:'#gallery',respond:path=>path==='/api/auth/me'?{wallet,admin:false}:path.startsWith('/api/wallet-collection')?{items:[],total:0,pending:0,nextCursor:null}:undefined});
 const form=ui.document.querySelector('#collection-form');const before=ui.requests.filter(([path])=>path.startsWith('/api/wallet-collection')).length;
 ui.location.hash='#events';await ui.render();form.onsubmit({preventDefault(){}});
 assert(ui.document.querySelector('#live-events'));assert.equal(ui.requests.filter(([path])=>path.startsWith('/api/wallet-collection')).length,before);
});

test('a restored superadmin session exposes its profile and the Create destination opens request management',async()=>{
 const address='0x1111111111111111111111111111111111111111';
 const ui=await setup({hash:'#organize',respond:path=>{
  if(path==='/api/auth/me')return {wallet:address,admin:true,superAdmin:true};
  if(path.startsWith('/api/admin/events?'))return {events:[{id:7,title:'Campus event',roles:['Attendee'],startsAt:1,listed:true,pendingRequests:3}],publications:[]};
  if(path==='/api/admin/audit')return {rows:[],hasMore:false};
  if(path==='/api/admin/system')return {actions:[]};
  if(path==='/api/health')return {status:'ok',dependencies:{}};
 }});
 assert.equal(ui.document.querySelector('#admin-profile').hidden,false);assert.match(ui.document.querySelector('#admin-profile').textContent,/Admin panel/);
 assert.equal(ui.document.querySelector('#admin-profile a').getAttribute('href'),'#admin');
 assert.match(ui.document.querySelector('#studio-events').textContent,/3 pending POAP requests/);
 assert.equal(ui.document.querySelector('.studio-event-actions a').getAttribute('href'),'#admin/events/7');
 assert(ui.document.querySelector('#refresh-admin-events'));
 await ui.document.querySelector('#wallet').onclick();assert.match(ui.document.querySelector('#modal-body').textContent,/Your superadmin profile/);assert(ui.document.querySelector('#modal-body a[href="#admin"]'));
 vm.runInContext('session=null;walletHeader()',ui.context);assert.equal(ui.document.querySelector('#admin-profile').hidden,true);
});

test('ordinary signed-in wallets never receive a superadmin profile shortcut',async()=>{
 const ui=await setup({respond:path=>path==='/api/auth/me'?{wallet:'0x1111111111111111111111111111111111111111',admin:false}:undefined});
 assert.equal(ui.document.querySelector('#admin-profile').hidden,true);
 await ui.document.querySelector('#wallet').onclick();assert.equal(ui.document.querySelector('#modal-body a[href="#admin"]'),null);
});

test('superadmin publication completion opens its event request dashboard automatically',async()=>{
 const ui=await setup({respond:(path,options)=>{
  if(path==='/api/artwork')return {image:'https://kairo.test/media/art/badge.svg',uri:'https://kairo.test/media/metadata/badge.json'};
  if(path==='/api/organizer/events'&&options.method==='POST')return {status:'pending'};
  if(path.startsWith('/api/publications/'))return {status:'live',events:[{id:7}]};
 }});
 vm.runInContext("session={wallet:'0x1111111111111111111111111111111111111111',admin:true};createEventPage()",ui.context);
 assert.equal(ui.document.querySelector('#event-form .notice'),null);
 const form=ui.document.querySelector('#event-form');form.reportValidity=()=>true;
 for(const [name,value]of Object.entries({title:'Campus workshop',description:'A coding workshop',club:'Code club',category:'Workshop',campus:'Campus',roles:'Attendee',venue:'Hall A',starts:'2026-12-01T10:00',eventEnds:'2026-12-01T12:00',mintStarts:'2026-12-01T10:00',ends:'2026-12-02T12:00'}))Object.defineProperty(form.elements[name],'value',{configurable:true,writable:true,value});
 const generate=ui.document.querySelector('[data-generate-role]');await generate.onclick({target:generate});form.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(ui.location.hash,'admin/events/7');assert.equal(vm.runInContext("localStorage.getItem('kairo-publishing')",ui.context),null);
});

test('each participant sees their own token ID and can copy the actual NFT contract for MetaMask import',async()=>{
 for(const [wallet,tokenId,contractAddress] of [['0x1111111111111111111111111111111111111111','17','0x999524Cb77Db83864DA6FAC42614387921933922'],['0x2222222222222222222222222222222222222222','18','0x90a2920272dd3852193A79DA621B1Ccc9D093714']]) {
  const item={id:7,tokenId,contractAddress,uri:'https://dead.example/metadata.json',title:'Campus workshop',role:'Attendee',image:'https://kairo.test/media/art/badge.png',history:[],ownershipVerified:true};
  const ui=await setup({hash:'#gallery',respond:path=>{
   if(path==='/api/auth/me')return {wallet,admin:false};
   if(path.startsWith('/api/wallet-collection'))return {total:1,items:[item],pending:0,nextCursor:null};
  }});
  await new Promise(resolve=>setImmediate(resolve));assert.match(ui.document.querySelector('.gallery-badge-info').textContent,new RegExp('Token #'+tokenId));
  vm.runInContext('badgeDetails(collectionItems[0])',ui.context);
  const details=ui.document.querySelector('#live-app .badge-details');assert(details);assert.equal(ui.document.querySelector('#modal').open,false);assert.match(details.textContent,/NFT contract address/);assert.doesNotMatch(details.textContent,/Issuance transaction history|Transaction history has not been indexed/);assert(details.textContent.includes(contractAddress));assert(details.textContent.includes('Token ID: '+tokenId));assert.equal(details.querySelector('a[href="https://dead.example/metadata.json"]'),null);assert.equal(details.textContent.includes('View metadata'),false);
  let copied;ui.context.navigator.clipboard={writeText:async value=>{copied=value;}};
  const contractButton=details.querySelector('#copy-nft-contract');await contractButton.onclick({target:contractButton});assert.equal(copied,contractAddress);
  const tokenButton=details.querySelector('#copy-nft-token');await tokenButton.onclick({target:tokenButton});assert.equal(copied,tokenId);
  assert.equal(ui.requests.some(([path])=>path.startsWith('/api/admin/')),false);
 }
});

test('switching accounts revokes old wallet access before selecting and signing one replacement',async()=>{
 const first='0x1111111111111111111111111111111111111111',second='0x2222222222222222222222222222222222222222';
 let authenticated=first,challengeWallet,revoked=false;const methods=[],listeners=new Map();
 const provider={isMetaMask:true,on:(event,handler)=>listeners.set(event,handler),removeListener:event=>listeners.delete(event),request:async({method})=>{
  methods.push(method);
  if(method==='wallet_revokePermissions'){revoked=true;return null;}
  if(method==='wallet_requestPermissions'){assert(revoked,'old account access must be revoked before requesting another account');return [];}
  return ['eth_requestAccounts','eth_accounts'].includes(method)?[second]:method==='eth_chainId'?'0xaa36a7':[];
 }};
 const ui=await setup({ethereum:provider,respond:(path,options)=>{
  if(path==='/api/auth/me')return authenticated?{wallet:authenticated,admin:authenticated===first}:new Response('{}',{status:401});
  if(path==='/api/auth/logout'){authenticated='';return {};}
  if(path==='/api/auth/challenge'){challengeWallet=JSON.parse(options.body).wallet;return {id:'challenge',message:'Sign in'};}
  if(path==='/api/auth/verify'){authenticated=challengeWallet;return {wallet:authenticated};}
 }});
 await ui.document.querySelector('#wallet').onclick();const change=ui.document.querySelector('#wallet-change');await change.onclick({target:change});
 assert.equal(authenticated,second);assert.equal(challengeWallet,second);assert.match(ui.document.querySelector('#wallet').textContent,/0x2222/);assert.equal(ui.document.querySelector('#admin-profile').hidden,true);
 assert(methods.indexOf('wallet_revokePermissions')<methods.indexOf('wallet_requestPermissions'));
});

test('authorizing an additional account ends the existing session instead of keeping the first account active',async()=>{
 const first='0x1111111111111111111111111111111111111111',second='0x2222222222222222222222222222222222222222',listeners=new Map();let authenticated=true;
 const provider={isMetaMask:true,on:(event,handler)=>listeners.set(event,handler),removeListener:event=>listeners.delete(event),request:async()=>[]};
 const ui=await setup({ethereum:provider,respond:path=>{
  if(path==='/api/auth/me')return authenticated?{wallet:first,admin:true}:new Response('{}',{status:401});
  if(path==='/api/auth/logout'){authenticated=false;return {};}
 }});
 await listeners.get('accountsChanged')([first,second]);
 assert.equal(authenticated,false);assert.equal(ui.document.querySelector('#admin-profile').hidden,true);assert.match(ui.document.querySelector('#wallet').textContent,/Connect wallet/);
 assert.equal(ui.requests.some(([path])=>path==='/api/auth/challenge'||path==='/api/auth/verify'),false);
});

test('My Gallery adds the existing NFT to MetaMask with its original contract and token, without minting',async()=>{
 const wallet='0x1111111111111111111111111111111111111111',contractAddress='0x999524Cb77Db83864DA6FAC42614387921933922';
 const item={id:7,tokenId:'17',contractAddress,title:'Soulbound POAP',role:'Attendee',history:[],ownershipVerified:true};let chain='0x1',watch;const methods=[];
 const ui=await setup({hash:'#gallery',ethereum:{isMetaMask:true,request:async input=>{
  methods.push(input.method);if(input.method==='eth_accounts')return [wallet];if(input.method==='eth_chainId')return chain;
  if(input.method==='wallet_switchEthereumChain'){chain='0xaa36a7';return null;}
  if(input.method==='web3_clientVersion')return 'MetaMask/v13.53.0';
  if(input.method==='wallet_watchAsset'){watch=input;return true;}return [];
 }},respond:path=>path==='/api/auth/me'?{wallet,admin:false}:path.startsWith('/api/wallet-collection')?{total:1,pending:0,nextCursor:null,items:[item]}:undefined});
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(methods,[]);
 const button=ui.document.querySelector('[data-add-nft]');assert(button);await button.onclick();
 assert.deepEqual(JSON.parse(JSON.stringify(watch)),{method:'wallet_watchAsset',params:{type:'ERC721',options:{address:contractAddress,tokenId:'17'}}});
 assert(methods.indexOf('wallet_switchEthereumChain')<methods.indexOf('wallet_watchAsset'));assert.match(ui.document.querySelector('#toast').textContent,/POAP added to MetaMask/);
 assert.equal(methods.some(method=>['eth_sendTransaction','eth_sendRawTransaction','personal_sign'].includes(method)),false);
 assert.equal(ui.requests.some(([,options])=>options?.method==='POST'),false);
 vm.runInContext('badgeDetails(collectionItems[0])',ui.context);assert(ui.document.querySelector('#add-nft-metamask'));
});

test('MetaMask import validates the receiving account and handles unsupported wallets and cancellation',async()=>{
 const wallet='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222';
 for(const scenario of ['wrong-account','multiple-accounts','changed-account','unsupported','cancelled']) {
  let reads=0,watches=0;
  const ui=await setup({hash:'#gallery',ethereum:{isMetaMask:true,request:async({method})=>{
   if(method==='eth_chainId')return '0xaa36a7';
   if(method==='eth_accounts'){reads++;return scenario==='wrong-account'?[other]:scenario==='multiple-accounts'?[wallet,other]:scenario==='changed-account'&&reads>1?[other]:[wallet];}
   if(method==='web3_clientVersion')return 'MetaMask/v13.53.0';
   if(method==='wallet_watchAsset'){watches++;if(scenario==='unsupported')throw Object.assign(Error('Unsupported'),{code:4200});return false;}
   return [];
  }},respond:path=>path==='/api/auth/me'?{wallet,admin:false}:path.startsWith('/api/wallet-collection')?{total:1,pending:0,nextCursor:null,items:[{id:7,tokenId:'18',contractAddress:'0x90a2920272dd3852193A79DA621B1Ccc9D093714',title:'POAP',role:'Attendee',history:[],ownershipVerified:true}]}:undefined});
  await new Promise(resolve=>setImmediate(resolve));await ui.document.querySelector('[data-add-nft]').onclick();
  assert.equal(watches,['unsupported','cancelled'].includes(scenario)?1:0,scenario);
  assert.doesNotMatch(ui.document.querySelector('#toast').textContent,/POAP added to MetaMask/);
  if(scenario==='unsupported')assert.match(ui.document.querySelector('#toast').textContent,/does not support one-click/);
  if(scenario==='cancelled')assert.match(ui.document.querySelector('#toast').textContent,/cancelled/);
  assert.equal(ui.document.querySelectorAll('.gallery-badge').length,1);
 }
});

test('Generate POAP replaces a custom upload after successful generation',async()=>{
 const ui=await setup({hash:'#create',respond:path=>path==='/api/auth/me'?{wallet:'0x1111111111111111111111111111111111111111'}:path==='/api/artwork'?{image:'https://kairo.test/media/art/generated.svg',uri:'https://kairo.test/media/metadata/generated.json'}:undefined});
 vm.runInContext("FileReader=class {readAsDataURL(file){this.result=file.data;this.onload();}}",ui.context);
 const form=ui.document.querySelector('#event-form');form.elements.title.value='Campus workshop';form.elements.description.value='A coding workshop';
 assert.equal(form.querySelector('#generate-poap'),null);assert.equal(form.querySelector('input[type="checkbox"][required]'),null);
 const input=form.querySelector('input[type="file"]');Object.defineProperty(input,'files',{value:[{type:'image/png',size:20,data:'data:image/png;base64,custom'}]});input.onchange({target:input});
 const generate=form.querySelector('[data-generate-role]');await generate.onclick({target:generate});
 const artworkRequest=ui.requests.find(([path])=>path==='/api/artwork');assert(artworkRequest);assert.equal('image' in JSON.parse(artworkRequest[1].body),false);
 assert.equal(form.querySelector('#art-preview').getAttribute('src'),'https://kairo.test/media/art/generated.svg');
});

test('Gallery keeps the page loader visible until the minted POAP has been fetched',async()=>{
 const wallet='0x1111111111111111111111111111111111111111';let finish;
 const ui=await setup({hash:'#gallery',respond:path=>path==='/api/auth/me'?{wallet}:path.startsWith('/api/wallet-collection')?new Promise(resolve=>{finish=resolve;}):undefined});
 assert.equal(typeof finish,'function');assert.equal(ui.document.querySelector('#page-loader').hidden,false);
 finish({total:1,pending:0,nextCursor:null,items:[{id:7,tokenId:'42',title:'Campus workshop',role:'Attendee',ownershipVerified:true,contractAddress:'0x1111111111111111111111111111111111111111'}]});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(ui.document.querySelector('#collection-grid').textContent,/Token #42/);
 assert.equal(ui.document.querySelector('#page-loader').hidden,true);
});

test('an expired shared recipient link shows artwork and a closed notice without mint controls',async()=>{
 const expired={id:7,title:'Past workshop',description:'A day together',roles:['Attendee'],image:'https://kairo.test/media/art/badge.svg',mintStartsAt:1,mintEndsAt:2};
 const ui=await setup({hash:'#redeem/'+'a'.repeat(32),respond:path=>path==='/api/redeem'?{event:expired,state:'issued'}:undefined});
 assert.match(ui.document.querySelector('#live-app').textContent,/Minting has closed/);
 assert(ui.document.querySelector('#live-app img'));
 assert.equal(ui.document.querySelector('#claim-mint'),null);
 assert.equal(ui.requests.some(([path])=>path==='/api/redeem/claim'),false);
});

test('mobile navigation closes on Escape and outside interaction and maintains its accessible state', async()=>{
 const ui=await setup();const menu=ui.document.querySelector('.menu-button'),nav=ui.document.querySelector('#mobile-nav');
 let restored=false;menu.focus=()=>{restored=true;};
 menu.click(); assert.equal(nav.hidden,false); assert.equal(menu.getAttribute('aria-expanded'),'true');
 const escape=new ui.context.window.Event('keydown');escape.key='Escape';ui.document.dispatchEvent(escape);
 assert.equal(nav.hidden,true);assert.equal(menu.getAttribute('aria-label'),'Open navigation');assert(restored);
 menu.click();ui.document.querySelector('#hero-title').click();assert.equal(nav.hidden,true);
 menu.click();nav.querySelector('a').click();assert.equal(nav.hidden,true);
});

test('busy actions prevent duplicate submissions, expose progress and restore nested button content', async()=>{
 const ui=await setup();
 vm.runInContext(`
  globalThis.testButton=document.createElement('button');testButton.innerHTML='<span>Keep this label</span><span aria-hidden="true">↗</span>';
  globalThis.count=0;
  globalThis.pendingAction=busy(testButton,()=>new Promise(resolve=>{globalThis.releaseAction=resolve;count++;}));
 `,ui.context);
 const button=ui.context.testButton;
 assert.equal(button.disabled,true);assert.equal(button.getAttribute('aria-busy'),'true');
 await vm.runInContext('busy(testButton,()=>{count++;})',ui.context);assert.equal(ui.context.count,1);
 ui.context.releaseAction();await ui.context.pendingAction;
 assert.equal(button.disabled,false);assert.equal(button.getAttribute('aria-busy'),null);
 assert.equal(button.querySelectorAll('span').length,2);assert.match(button.textContent,/Keep this label/);
});

test('event text survives navigating away and invalid dates fail before artwork is uploaded', async()=>{
 const ui=await setup({hash:'#create',respond:path=>path==='/api/auth/me'?{wallet:'0x1111111111111111111111111111111111111111'}:undefined});
 const store=new Map();ui.context.window.sessionStorage={getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
 vm.runInContext('createEventPage()',ui.context);
 let form=ui.document.querySelector('#event-form');form.elements.title.value='Saved campus workshop';
 form.querySelector('[name="drops-0"]').value='75';form.querySelector('[name="drops-0"]').oninput({target:form.querySelector('[name="drops-0"]')});
 form.dispatchEvent(new ui.context.window.Event('input'));
 ui.location.hash='#events';await ui.render();ui.location.hash='#create';await ui.render();
 form=ui.document.querySelector('#event-form');assert.equal(form.elements.title.value,'Saved campus workshop');
 assert.equal(form.querySelector('[name="drops-0"]').value,'75');
 assert.match(form.querySelector('#draft-status').textContent,/Draft restored/);
 form.reportValidity=()=>true;
 form.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 assert.match(form.querySelector('#publish-status').textContent,/end time after the start/);
 assert.equal(ui.requests.some(([path])=>path==='/api/artwork'),false);
 assert.equal(form.elements.title.value,'Saved campus workshop');
});

test('video collectibles reserve media space and keep video controls outside navigation links',async()=>{
 const wallet='0x1111111111111111111111111111111111111111';
 const ui=await setup({hash:'#gallery',respond:path=>path==='/api/auth/me'?{wallet}:path.startsWith('/api/wallet-collection')?{total:1,pending:0,nextCursor:null,items:[{id:7,tokenId:'42',title:'Workshop',role:'Attendee',animationUrl:'https://kairo.test/media/art/clip.mp4',image:'https://kairo.test/media/art/badge.png',ownershipVerified:true,contractAddress:wallet}]}:undefined});
 const video=ui.document.querySelector('#collection-grid video');assert(video);
 assert.equal(video.getAttribute('width'),'512');assert.equal(video.getAttribute('height'),'512');assert.equal(video.closest('a'),null);
 assert(ui.document.querySelector('a.gallery-badge-info[href="#badge/42/'+wallet+'"]'));
});

test('dashboard refresh errors preserve entered recipients and provide a local retry',async()=>{
 const address='0x1111111111111111111111111111111111111111';let failed=false;
 const event={id:7,title:'Workshop',description:'Together',roles:['Attendee'],organizer:address,startsAt:1,endsAt:2,mintStartsAt:1,mintEndsAt:2,listed:true};
 const ui=await setup({hash:'#issuer/manage/7',respond:(path)=>{
  if(path==='/api/auth/me')return {wallet:address};
  if(path.startsWith('/api/organizer/events'))return {events:[event],publications:[],hasMore:false};
  if(path==='/api/events/7/dashboard'){if(failed)throw Error('Temporary outage');return {event,capRemaining:10};}
  if(path.startsWith('/api/events/7/transactions')||path.startsWith('/api/events/7/links'))return {rows:[],hasMore:false};
 }});
 const content=ui.document.querySelector('#staff-content'),recipients=content.querySelector('[name="recipients"]');
 recipients.value='guest@example.org,Attendee';failed=true;
 await content.querySelector('#refresh-dashboard').onclick();
 assert.equal(content.querySelector('[name="recipients"]'),recipients);assert.equal(recipients.value,'guest@example.org,Attendee');
 assert.match(content.querySelector('#dashboard-error').textContent,/Dashboard refresh failed/);assert(content.querySelector('#retry-dashboard'));
 failed=false;await content.querySelector('#retry-dashboard').onclick();assert.equal(content.querySelector('#dashboard-error'),null);
});

test('an in-flight background dashboard refresh cannot overwrite newly entered form text',async()=>{
 const address='0x1111111111111111111111111111111111111111';let release,delay=false;
 const event={id:7,title:'Workshop',roles:['Attendee'],organizer:address,startsAt:1,endsAt:2,mintStartsAt:1,mintEndsAt:2,listed:true};
 const ui=await setup({hash:'#issuer/manage/7',respond:path=>{
  if(path==='/api/auth/me')return {wallet:address};
  if(path.startsWith('/api/organizer/events'))return {events:[event],publications:[],hasMore:false};
  if(path==='/api/events/7/dashboard')return delay?new Promise(resolve=>{release=resolve;}):{event,capRemaining:10};
  if(path.startsWith('/api/events/7/transactions')||path.startsWith('/api/events/7/links'))return {rows:[],hasMore:false};
 }});
 const content=ui.document.querySelector('#staff-content'),field=content.querySelector('[name="recipients"]');delay=true;
 const refresh=ui.document.querySelector('#staff-event').onchange({background:true});
 await new Promise(resolve=>setImmediate(resolve));
 field.value='New unsaved recipients';content.oninput();release({event,capRemaining:10});await refresh;
 assert.equal(content.querySelector('[name="recipients"]'),field);assert.equal(field.value,'New unsaved recipients');
});

test('navigation identifies the current section across gallery aliases and documentation chapters',async()=>{
 for(const [hash,destination] of [['#collector/collection','#gallery'],['#doc-api','#organize'],['#create','#organize']]){
  const ui=await setup({hash});
  for(const selector of ['.desktop-nav','#mobile-nav'])assert.equal(ui.document.querySelector(`${selector} a[aria-current="page"]`).getAttribute('href'),destination);
  assert.match(ui.document.title,/Kairo/);
 }
});

test('published events show pending approval and keep mint controls disabled until super-admin approval',async()=>{
 const address='0x1111111111111111111111111111111111111111',now=Math.floor(Date.now()/1000);
 const event={id:7,title:'Workshop',roles:['Attendee'],organizer:address,listed:true,approval:'pending',startsAt:now-10,endsAt:now+3600,mintStartsAt:now-10,mintEndsAt:now+3600};
 const ui=await setup({hash:'#issuer/manage/7',respond:path=>{
  if(path==='/api/auth/me')return {wallet:address};
  if(path.startsWith('/api/organizer/events'))return {events:[event],publications:[],hasMore:false};
  if(path==='/api/events/7/dashboard')return {event,capRemaining:50};
  if(path.startsWith('/api/events/7/transactions')||path.startsWith('/api/events/7/links'))return {rows:[],hasMore:false};
 }});
 const content=ui.document.querySelector('#staff-content');
 assert.match(content.querySelector('[role="status"]').textContent,/Awaiting super-admin approval/);
 assert.equal(content.querySelector('#public-mint-link'),null);
 event.approval='approved';await content.querySelector('#refresh-dashboard').onclick();
 assert(content.querySelector('#public-mint-link'));
 let copied;ui.context.navigator.clipboard={writeText:async value=>{copied=value;}};
 await content.querySelector('#copy-public-mint-link').onclick();assert.equal(copied,'https://kairo.test/#drop/7');
 assert.doesNotMatch(content.textContent,/Awaiting super-admin approval/);
});

test('homepage artwork initializes once even when every API request fails',async()=>{
 const ui=await setup({failure:true});
 assert.equal(ui.context.homeArtCalls,1);
 assert(ui.document.querySelector('#press-art #press-head'));
 assert.match(ui.document.querySelector('#live-app').textContent,/Live service unavailable/);
 ui.location.hash='#about/proof';await ui.render();ui.location.hash='';await ui.render();
 assert.equal(ui.context.homeArtCalls,1);
});

test('configuration outages do not hide successfully loaded discovery records',async()=>{
 const ui=await setup({events:[{id:7,title:'Available past workshop',roles:['Attendee'],startsAt:1,endsAt:2}],respond:path=>path==='/api/config'?Response.json({code:'NOT_CONFIGURED',error:'Missing configuration.'},{status:503}):undefined});
 assert.match(ui.document.querySelector('#badge-grid').textContent,/Available past workshop/);
 assert.equal(ui.document.querySelector('#live-app').hidden,true);
 assert.equal(ui.document.querySelector('#request-error').hidden,false);
 assert.equal(ui.context.homeArtCalls,1);
});

test('Connect wallet recovers network settings before requesting account access after a config outage',async()=>{
 const wallet='0x1111111111111111111111111111111111111111',steps=[];let configs=0,signedIn=false;
 const ui=await setup({ethereum:{isMetaMask:true,request:async({method})=>{
  steps.push(method);if(method==='eth_requestAccounts'||method==='eth_accounts')return [wallet];if(method==='eth_chainId')return '0xaa36a7';return [];
 }},respond:(path,options)=>{
  if(path==='/api/config'){steps.push('config');return ++configs===1?Response.json({code:'NOT_CONFIGURED'},{status:503}):{chainId:11155111,chainName:'Sepolia',categories:[]};}
  if(path==='/api/auth/challenge')return {id:'challenge',message:'Sign in'};
  if(path==='/api/auth/verify'){signedIn=true;return {};}
  if(path==='/api/auth/me')return signedIn?{wallet}:{};
 }});
 assert.equal(steps.includes('eth_requestAccounts'),false);
 await ui.document.querySelector('#wallet').onclick();
 assert.equal(configs,2);assert(steps.lastIndexOf('config')<steps.findIndex(step=>step!=='config'));
 assert.match(ui.document.querySelector('#wallet').textContent,/0x1111/);
 assert.doesNotMatch(ui.document.querySelector('#toast').textContent,/network configuration is unavailable/);
 assert.equal(ui.document.querySelector('#request-error').hidden,true);
});

test('an accepted event survives a temporary status outage and finishes awaiting super-admin approval',async()=>{
 const wallet='0x1111111111111111111111111111111111111111';let unavailable=true,posts=0;
 const ui=await setup({hash:'#create',respond:(path,options)=>{
  if(path==='/api/auth/me')return {wallet};
  if(path==='/api/artwork')return {image:'https://kairo.test/media/art/badge.svg',uri:'https://kairo.test/media/metadata/badge.json'};
  if(path==='/api/organizer/events'&&options.method==='POST'){posts++;return {status:'pending'};}
  if(path.startsWith('/api/publications/'))return unavailable?Response.json({code:'RPC_UNREACHABLE'},{status:503}):{status:'live',events:[{id:7}]};
 }});
 const timers=[];ui.context.setTimeout=(fn,ms)=>{if(ms===10000)timers.push(fn);return 1;};
 const form=ui.document.querySelector('#event-form');form.reportValidity=()=>true;
 for(const [name,value]of Object.entries({title:'Campus workshop',description:'A day of learning',club:'Code club',category:'Workshop',campus:'Main campus',venue:'Hall A',starts:'2026-12-01T10:00',eventEnds:'2026-12-01T12:00',mintStarts:'2026-12-01T10:00',ends:'2026-12-02T12:00'}))Object.defineProperty(form.elements[name],'value',{configurable:true,writable:true,value});
 const generate=form.querySelector('[data-generate-role]');await generate.onclick({target:generate});
 form.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(posts,1);assert.match(form.querySelector('#publish-status').textContent,/Checking publication progress/);
 assert.equal(ui.document.querySelector('#request-error').hidden,true);assert.equal(timers.length,1);
 unavailable=false;await timers[0]();
 assert.equal(posts,1);assert.equal(ui.location.hash,'issuer/manage/7');
 assert.match(ui.document.querySelector('#toast').textContent,/Awaiting super-admin approval/);
});

test('a configured admin can find the panel and retry verification without signing in again',async()=>{
 const wallet='0x4CB1E99035D2812472B2d50DBB590E9C593188bE';let verified=false;
 const ui=await setup({hash:'#admin/login',respond:path=>{
  if(path==='/api/auth/me')return {wallet,admin:verified,superAdmin:verified,adminUnavailable:!verified};
  if(path==='/api/config')return {chainId:11155111,chainName:'Sepolia',superAdminAddress:wallet,categories:[]};
 }});
 assert.equal(ui.document.querySelector('#admin-profile').hidden,false);
 assert.match(ui.document.querySelector('#admin-profile').textContent,/verification is unavailable/);
 assert.match(ui.document.querySelector('#admin-sign-in').textContent,/Retry admin verification/);
 verified=true;const button=ui.document.querySelector('#admin-sign-in');await button.onclick({target:button});
 assert.equal(ui.location.hash,'#admin');assert.equal(ui.requests.some(([path])=>path==='/api/auth/challenge'),false);
 assert.match(ui.document.querySelector('#studio-events').textContent,/first event/);
});

test('admin event approval controls are visible above participant minting and submit accept/reject actions',async()=>{
 const wallet='0x1111111111111111111111111111111111111111',actions=[],now=Math.floor(Date.now()/1000);
 const event={id:7,title:'Pending workshop',description:'A day together',organizer:wallet,roles:['Attendee'],listed:true,approval:'pending',venue:'Hall A',startsAt:now-10,endsAt:now+3600,mintStartsAt:now-10,mintEndsAt:now+3600};
 const ui=await setup({hash:'#admin/events/7',respond:(path,options)=>{
  if(path==='/api/auth/me')return {wallet,admin:true,superAdmin:true};
  if(path.startsWith('/api/admin/events?page'))return {events:[event],publications:[],hasMore:false};
  if(path==='/api/events/7/dashboard')return {event,capRemaining:20};
  if(path.startsWith('/api/events/7/transactions')||path.startsWith('/api/events/7/links')||path.startsWith('/api/events/7/requests'))return {rows:[],hasMore:false};
  if(path==='/api/admin/events/7'&&options.method==='POST'){actions.push(JSON.parse(options.body));return {status:'saved'};}
 }});
 let panel=ui.document.querySelector('#staff-content .event-approval');assert(panel);assert.match(panel.textContent,/Accept event/);
 await panel.querySelector('[data-admin="verify"]').onclick();assert.equal(actions[0].action,'verify');
 panel=ui.document.querySelector('.event-approval');const form=panel.querySelector('#reject-event');form.elements.reason.value='Please correct the event details.';
 form.onsubmit({preventDefault(){},target:form});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(actions[1].action,'reject');assert.equal(actions[1].reason,'Please correct the event details.');
});

test('a participant connects through Privy, mints from the shared link and imports the confirmed POAP into MetaMask on Sepolia',async()=>{
 const wallet='0x1111111111111111111111111111111111111111',contract='0x999524Cb77Db83864DA6FAC42614387921933922',now=Math.floor(Date.now()/1000);
 let signedIn=false,mints=0,watch,chain='0x1',privyConnections=0;
 const rainbow={request:async({method})=>method==='eth_accounts'?[wallet]:method==='eth_chainId'?'0xaa36a7':method==='personal_sign'?'signed':[]};
 const metamask={isMetaMask:true,request:async input=>{
  if(input.method==='eth_accounts')return [wallet];if(input.method==='eth_chainId')return chain;
  if(input.method==='wallet_switchEthereumChain'){chain='0xaa36a7';return null;}
  if(input.method==='web3_clientVersion')return 'MetaMask/v13.53.0';
  if(input.method==='wallet_watchAsset'){watch=input;return true;}throw Error('Unexpected MetaMask request: '+input.method);
 }};
 const event={id:7,title:'Approved workshop',description:'A day together',roles:['Attendee'],listed:true,approval:'approved',startsAt:now-10,endsAt:now+3600,mintStartsAt:now-10,mintEndsAt:now+3600};
 const ui=await setup({hash:'#drop/7',events:[event],ethereum:metamask,privy:{connect:async()=>{privyConnections++;return {address:wallet,provider:rainbow,name:'rainbow'};},restore:async()=>null},respond:(path,options)=>{
  if(path==='/api/config')return {chainId:11155111,chainName:'Sepolia',contractAddress:contract,categories:[],explorerUrl:'https://sepolia.etherscan.io'};
  if(path==='/api/auth/me')return signedIn?{wallet,admin:false}:{};
  if(path==='/api/auth/challenge')return {id:'challenge',message:'Sign in'};
  if(path==='/api/auth/verify'){signedIn=true;return {wallet};}
  if(path==='/api/events/7/claim'){mints++;const input=JSON.parse(options.body);assert.equal(input.publicLink,true);assert.equal(input.permanentConsent,true);return {ticket:'ticket'};}
  if(path==='/api/claims/ticket')return {status:'confirmed',wallet,token_id:'17',tx_hash:'0xmint'};
 }});
 await ui.document.querySelector('#claim-connect').onclick();
 const mint=ui.document.querySelector('#claim-mint');assert.equal(mint.hidden,false);assert.equal(mint.disabled,false);
 ui.document.querySelector('#claim-consent').checked=true;await mint.onclick();assert.equal(mints,1);assert.equal(ui.location.hash,'claim/ticket/7');
 ui.location.hash='#claim/ticket/7';await ui.render();assert.match(ui.document.querySelector('#live-app').textContent,/POAP minted/);
 await ui.document.querySelector('#mint-add-metamask').onclick();
 assert.equal(chain,'0xaa36a7');assert.equal(watch.params.type,'ERC721');assert.equal(watch.params.options.address,contract);assert.equal(watch.params.options.tokenId,'17');
 assert.equal(privyConnections,1);assert.equal(mints,1);assert.equal(vm.runInContext('walletClient.provider',ui.context),rainbow);
});

test('publishing a custom JPEG uploads a circular PNG and uses its metadata for the minted role',async()=>{
 const ui=await setup({respond:(path,options)=>{
  if(path==='/api/artwork')return {image:'https://kairo.test/media/art/circular.png',uri:'https://kairo.test/media/metadata/circular.json'};
  if(path==='/api/organizer/events'&&options.method==='POST')return {id:JSON.parse(options.body).id,status:'pending'};
  if(path.startsWith('/api/publications/'))return {status:'live',events:[{id:7}]};
 }});
 vm.runInContext("session={wallet:'0x1111111111111111111111111111111111111111',admin:false}; createEventPage(); FileReader=class {readAsDataURL(file){this.result=file.data;this.onload();}}",ui.context);
 const form=ui.document.querySelector('#event-form');form.reportValidity=()=>true;
 for(const [key,value]of Object.entries({title:'Campus workshop',description:'A coding workshop for our campus',club:'Code club',category:'Workshop',campus:'Main campus',roles:'Attendee',venue:'Hall A',starts:'2026-12-01T10:00',eventEnds:'2026-12-01T12:00',mintStarts:'2026-12-01T10:00',ends:'2026-12-02T12:00'}))Object.defineProperty(form.elements[key],'value',{configurable:true,writable:true,value});
 const originalCreate=ui.document.createElement.bind(ui.document);
 let clipped=false,drawn=false;
 ui.document.createElement=tag=>{
  if(tag==='img')return {naturalWidth:1200,naturalHeight:600,decode:async()=>{}};
  if(tag==='canvas')return {getContext:()=>({beginPath(){},arc(){},clip(){clipped=true;},drawImage(){assert(clipped);drawn=true;}}),toDataURL:()=>{assert(drawn);return 'data:image/png;base64,circular';}};
  return originalCreate(tag);
 };
 const input=form.querySelector('input[type="file"]');
 Object.defineProperty(input,'files',{value:[{type:'image/jpeg',size:20,data:'data:image/jpeg;base64,original'}]});input.onchange({target:input});
 form.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 const artwork=ui.requests.find(([path])=>path==='/api/artwork');assert(artwork);
 assert.equal(JSON.parse(artwork[1].body).image,'data:image/png;base64,circular');
 const publication=ui.requests.find(([path,options])=>path==='/api/organizer/events'&&options.method==='POST');assert(publication);
 const role=JSON.parse(publication[1].body).roleArtwork[0];
 assert.equal(role.image,'https://kairo.test/media/art/circular.png');
 assert.equal(role.uri,'https://kairo.test/media/metadata/circular.json');
});

test('a minted POAP detail URL opens a full page and returns to Gallery without a popup',async()=>{
 const wallet='0x1111111111111111111111111111111111111111';
 const item={id:7,tokenId:'42',contractAddress:'0x90a2920272dd3852193A79DA621B1Ccc9D093714',title:'Campus memory',description:'A day together.',role:'Attendee',image:'https://kairo.test/media/art/badge.png',ownershipVerified:true,history:[{hash:'0xhistory',created_at:1}]};
 const ui=await setup({hash:'#badge/42/'+wallet,respond:path=>path==='/api/auth/me'?{wallet,admin:false}:path.startsWith('/api/wallet-collection')?{total:1,pending:0,nextCursor:null,items:[item]}:undefined});
 await new Promise(resolve=>setImmediate(resolve));
 const main=ui.document.querySelector('#live-app');
 assert.equal(main.hidden,false);assert.equal(main.querySelector('h1').textContent,'Campus memory');
 assert(main.querySelector('.badge-details img'));assert(main.querySelector('#add-nft-metamask'));
 assert.equal(ui.document.querySelector('#modal').open,false);
 assert.doesNotMatch(main.textContent,/Issuance transaction history|Transaction history has not been indexed/);
 assert.equal(main.querySelector('.back-link').getAttribute('href'),'#gallery');
 ui.location.hash='#gallery';await ui.render();
 assert(main.querySelector('.gallery-badge-info'));assert.equal(main.querySelector('.badge-details'),null);
});
