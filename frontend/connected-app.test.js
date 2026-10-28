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
import {aboutContent,documentationContent,issuerContent,doodle} from './content.js';
import {eventState, matchesEvent, profileStats, filterCollection, groupCollection} from './student-model.js';

async function setup({hash = '', failure = false, events = [], ethereum, phantom, respond, Contract} = {}) {
  const {document, window} = parseHTML(readFileSync(new URL('./index.html', import.meta.url), 'utf8'));
  Object.defineProperty(window.HTMLElement.prototype, 'elements', {configurable: true, get() {return Object.fromEntries([...this.querySelectorAll('[name]')].map(node => [node.getAttribute('name'),node]));}});
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){const option=this.querySelector('option[selected]')||this.querySelector('option');return option?(option.getAttribute('value')??option.textContent):'';},set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',(option.getAttribute('value')??option.textContent)===String(value));}});
  window.HTMLElement.prototype.requestSubmit = function(){this.onsubmit?.({preventDefault(){}});};
  const location = {hash, href: 'https://kairo.test/' + hash, origin: 'https://kairo.test', protocol: 'https:', hostname: 'kairo.test'};
  for (const dialog of document.querySelectorAll('dialog')) { dialog.showModal = () => {dialog.open = true;}; dialog.close = () => {dialog.open = false;dialog.dispatchEvent(new window.Event('close'));}; }
  window.ethereum = ethereum;
  window.phantom = phantom ? {ethereum:phantom} : undefined;
  const requests = [], intervals = [], storage = new Map();
  const context = vm.createContext({document, window, location, navigator: {onLine: true}, URL, crypto, csv, console, history: {replaceState(){}},
    QRCode:{toCanvas:async()=>{}}, createApiClient:options=>realApiClient({...options,wait:async()=>{},retryDelays:[0,0]}), mountNative, downloadQR, getAddress, ZeroAddress, hexlify, toUtf8Bytes, Contract, ABI, BrowserProvider:class {constructor(provider){this.provider=provider;}async getSigner(account){return {getAddress:async()=>account,signMessage:async()=> 'test-signature'};}}, metaMaskWallet, aboutContent, documentationContent, issuerContent, doodle, eventState, matchesEvent, profileStats, filterCollection, groupCollection, claimEntry: () => null,
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
  assert.match(ui.document.querySelector('.card-link').getAttribute('href'), /drop\/7/);
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
 assert.match(ui.document.querySelector('#wallet').textContent,/0x1111/);assert.deepEqual(calls,[]);assert.equal(ui.document.querySelector('#wallet-welcome').hidden,true);
});
test('the Builders legacy build route opens developer information, never an event form',async()=>{
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

test('subpages provide top-left links back to studio or About even during an events outage',async()=>{
 const ui=await setup({hash:'#issuer/manage'});assert.equal(ui.document.querySelector('.back-link').getAttribute('href'),'#issuer/studio');
 ui.location.hash='#issuer/guide';await ui.render();assert.equal(ui.document.querySelector('.back-link').getAttribute('href'),'#issuer/studio');
 ui.location.hash='#about/case-studies';await ui.render();assert.equal(ui.document.querySelector('.back-link').getAttribute('href'),'#about/proof');
 vm.runInContext("apiError='Service down'",ui.context);ui.location.hash='#builders/documentation';await ui.render();assert(ui.document.querySelector('#doc-design'));
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
  if(path.startsWith('/api/organizer/events'))return {events:[],publications:[]};
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

test('any signed-in organizer directly publishes distinct generated roles and resumes through server progress',async()=>{
 const ui=await setup({respond:(path,options)=>{
  if(path==='/api/artwork'){const {role}=JSON.parse(options.body);return {image:`https://kairo.test/media/art/${role}.svg`,uri:`https://kairo.test/media/metadata/${role}.json`};}
  if(path==='/api/organizer/events'&&options.method==='POST')return {id:JSON.parse(options.body).id,status:'pending'};
  if(path.startsWith('/api/publications/'))return {status:'live',events:[{id:7}]};
 }});
 vm.runInContext("session={wallet:'0x1111111111111111111111111111111111111111',admin:false}; createEventPage()",ui.context);
 const form=ui.document.querySelector('#event-form');form.reportValidity=()=>true;
 for(const [key,value]of Object.entries({title:'Campus workshop',description:'A coding workshop for our campus',club:'Code club',category:'Workshop',campus:'Main campus',roles:'Attendee, Judge',venue:'Hall A',approximateAttendees:'20',starts:'2026-12-01T10:00',eventEnds:'2026-12-01T12:00',mintStarts:'2026-12-01T10:00',ends:'2026-12-02T12:00'}))Object.defineProperty(form.elements[key],'value',{configurable:true,writable:true,value});
 assert.equal(form.elements.organizer,undefined);assert.equal(ui.document.querySelector('#submit-event'),null);
 const generate=ui.document.querySelector('#generate-poap');await generate.onclick({target:generate});
 form.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 const posts=ui.requests.filter(([path,options])=>path==='/api/organizer/events'&&options.method==='POST');assert.equal(posts.length,1);
 const payload=JSON.parse(posts[0][1].body);assert.deepEqual(payload.roleArtwork.map(art=>art.role),['Attendee','Judge']);assert.equal(new Set(payload.roleArtwork.map(art=>art.uri)).size,2);
 for(const name of ['submit','draftId','rsvpDeadline','wallet','organizer'])assert.equal(name in payload,false);
 assert.equal(ui.location.hash,'issuer/manage/7');assert.equal(vm.runInContext("localStorage.getItem('kairo-publishing')",ui.context),null);
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
 assert.match(ui.document.querySelector('.service-details').textContent,/Sepolia connectionAvailable/);
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

test('a contract setup failure leaves the form retryable; an uncertain request exposes safe resume',async()=>{
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
  for(const [name,value]of Object.entries({title:'Campus workshop',description:'A coding workshop for our campus',club:'Code club',category:'Workshop',campus:'Main campus',roles:'Attendee',venue:'Hall A',approximateAttendees:'20',starts:'2026-12-01T10:00',eventEnds:'2026-12-01T12:00',mintStarts:'2026-12-01T10:00',ends:'2026-12-02T12:00'}))Object.defineProperty(form.elements[name],'value',{configurable:true,writable:true,value});
  const generate=ui.document.querySelector('#generate-poap');await generate.onclick({target:generate});
  form.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
  if(failure==='CONTRACT_MISMATCH'){
   assert.equal(vm.runInContext("localStorage.getItem('kairo-publishing')",ui.context),null);assert.match(ui.document.querySelector('#publish-status').textContent,/Update the Kairo contract/);
   form.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
  }else {
   const resume=ui.document.querySelector('#resume-event');assert(resume);await resume.onclick({target:resume});assert.equal(payloads[0].id,payloads[1].id);
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

test('super admin has a separate MetaMask login and organizer studio hides system tools',async()=>{
 const login=await setup({hash:'#admin/login'});
 assert(login.document.querySelector('#admin-sign-in'));
 assert.match(login.document.querySelector('#live-app').textContent,/No private key or password/);
 assert.equal(login.requests.some(([path])=>path.startsWith('/api/admin/')),false);
 const denied=await setup({hash:'#admin',respond:path=>path==='/api/auth/me'?{wallet:'0x1111111111111111111111111111111111111111',admin:false}:undefined});
 assert.match(denied.document.querySelector('#live-app').textContent,/not the super admin/);
 assert.equal(denied.requests.some(([path])=>path.startsWith('/api/admin/')),false);
 const studio=await setup({hash:'#issuer/studio',respond:path=>path==='/api/auth/me'?{wallet:'0x1111111111111111111111111111111111111111',admin:true}:undefined});
 assert.equal(studio.document.querySelector('#studio-system'),null);
});

test('a published organizer event exposes rotating QR and single-use links with CSV and mail controls',async()=>{
 const now=Math.floor(Date.now()/1000),event={id:7,title:'Campus workshop',description:'A coding workshop',roles:['Attendee'],listed:true,paused:false,mintStartsAt:now-60,mintEndsAt:now+3600};
 const ui=await setup({hash:'#issuer/manage/7',respond:(path,options)=>{
  if(path==='/api/auth/me')return {wallet:'0x1111111111111111111111111111111111111111',admin:false};
  if(path.startsWith('/api/organizer/events'))return {events:[event],publications:[]};
  if(path==='/api/events/7/dashboard')return {minted:0,pending:0,failed:0,linksIssued:0,linksUsed:0,qrClaims:0,capRemaining:10};
  if(path.startsWith('/api/events/7/transactions'))return {rows:[],hasMore:false};
  if(path.startsWith('/api/events/7/links'))return options?.method==='POST'?{links:[{email:'guest@example.org',role:'Attendee',link:'https://kairo.test/#redeem/single-use-token'}],merged:0}:{rows:[],hasMore:false};
  if(path==='/api/events/7/qr')return {token:'signed-rotating-token'};
 }});
 const walkIn=ui.document.querySelector('#walk-in');assert(walkIn,ui.document.querySelector('#live-app').textContent);assert.equal(walkIn.disabled,false);
 await vm.runInContext('shareDrop('+JSON.stringify(event)+')',ui.context);
 assert(ui.document.querySelector('#drop-qr'));assert.match(ui.document.querySelector('#qr-status').textContent,/Live QR/);
 assert(ui.requests.some(([path])=>path==='/api/events/7/qr'));
 const form=ui.document.querySelector('#recipients-form');form.elements.recipients.value='email,role\nguest@example.org,Attendee';form.onsubmit({preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));
 assert(ui.document.querySelector('#export-links'));assert(ui.document.querySelector('[data-copy-link]'));
 assert.match(ui.document.querySelector('#issued-links a').getAttribute('href'),/^mailto:guest%40example.org/);
 event.paused=true;await ui.render();assert.equal(ui.document.querySelector('#walk-in').disabled,true);
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
 assert.match(discovery.document.querySelector('#live-app').textContent,/Minting closed/);
 discovery.location.hash='#drop/7';await discovery.render();
 const dialog=discovery.document.querySelector('#modal');
 assert.match(dialog.textContent,/Minting has closed for this event/);
 assert.equal(dialog.querySelector('#poap-request button').disabled,true);
});

test('superadmin dashboard submits recipient mints and accepts or rejects individual POAP requests',async()=>{
 const now=Math.floor(Date.now()/1000),address='0x1111111111111111111111111111111111111111',requestId=crypto.randomUUID();
 const event={id:7,title:'Campus workshop',description:'A coding workshop',roles:['Attendee'],listed:true,paused:false,mintStartsAt:now-60,mintEndsAt:now+3600};
 const ui=await setup({hash:'#admin/events/7',respond:(path,options)=>{
  if(path==='/api/auth/me')return {wallet:address,admin:true};
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

test('clearing a saved publication resets the editor and permits a fresh publication ID',async()=>{
 const oldId=crypto.randomUUID(),payloads=[];
 const ui=await setup({respond:(path,options)=>{
  if(path==='/api/artwork')return {image:'https://kairo.test/media/art/badge.svg',uri:'https://kairo.test/media/metadata/badge.json'};
  if(path==='/api/organizer/events'&&options.method==='POST'){payloads.push(JSON.parse(options.body));return {status:'pending'};}
  if(path.startsWith('/api/publications/'))return {status:'pending',events:[]};
 }});
 vm.runInContext(`session={wallet:'0x1111111111111111111111111111111111111111',admin:false};localStorage.setItem('kairo-publishing',JSON.stringify({id:'${oldId}'}));createEventPage()`,ui.context);
 ui.document.querySelector('#event-form').elements.title.value='Old draft';
 ui.document.querySelector('#discard-publication').onclick();
 assert.equal(vm.runInContext("localStorage.getItem('kairo-publishing')",ui.context),null);assert.equal(ui.document.querySelector('#resume-event'),null);assert.equal(payloads.length,0);assert.equal(ui.document.querySelector('#request-error').hidden,true);
 const form=ui.document.querySelector('#event-form');assert.equal(form.elements.title.value,'');form.reportValidity=()=>true;
 for(const [name,value]of Object.entries({title:'New campus workshop',description:'A new coding workshop for our campus',club:'Code club',category:'Workshop',campus:'Main campus',roles:'Attendee',venue:'Hall A',approximateAttendees:'20',starts:'2026-12-01T10:00',eventEnds:'2026-12-01T12:00',mintStarts:'2026-12-01T10:00',ends:'2026-12-02T12:00'}))Object.defineProperty(form.elements[name],'value',{configurable:true,writable:true,value});
 const generate=ui.document.querySelector('#generate-poap');await generate.onclick({target:generate});
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
 const generation=ui.document.querySelector('#generate-poap').onclick({target:ui.document.querySelector('#generate-poap')});
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
  if(path==='/api/auth/me')return {wallet:address,admin:true};
  if(path.startsWith('/api/admin/events?'))return {events:[{id:7,title:'Campus event',roles:['Attendee'],startsAt:1,listed:true,pendingRequests:3}],publications:[]};
  if(path==='/api/admin/audit')return {rows:[],hasMore:false};
  if(path==='/api/admin/system')return {actions:[]};
  if(path==='/api/health')return {status:'ok',dependencies:{}};
 }});
 assert.equal(ui.document.querySelector('#admin-profile').hidden,false);assert.match(ui.document.querySelector('#admin-profile').textContent,/Superadmin profile/);
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
 assert(ui.document.querySelector('#live-app a[href="#admin/events"]'));
 const form=ui.document.querySelector('#event-form');form.reportValidity=()=>true;
 for(const [name,value]of Object.entries({title:'Campus workshop',description:'A coding workshop',club:'Code club',category:'Workshop',campus:'Campus',roles:'Attendee',venue:'Hall A',approximateAttendees:'20',starts:'2026-12-01T10:00',eventEnds:'2026-12-01T12:00',mintStarts:'2026-12-01T10:00',ends:'2026-12-02T12:00'}))Object.defineProperty(form.elements[name],'value',{configurable:true,writable:true,value});
 const generate=ui.document.querySelector('#generate-poap');await generate.onclick({target:generate});form.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
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
  const details=ui.document.querySelector('#modal-body');assert.match(details.textContent,/NFT contract address/);assert(details.textContent.includes(contractAddress));assert(details.textContent.includes('Token ID: '+tokenId));assert.equal(details.querySelector('a[href="https://dead.example/metadata.json"]'),null);assert.equal(details.textContent.includes('View metadata'),false);
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
