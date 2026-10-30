import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8');
test('only artwork downloads scan and trim the media cache',async()=>{
 const bundle=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').match(/<script[^>]*src="(\/_astro\/[^"?]+\.js)"/)[1];
 for(const path of [bundle,'/styles.css','/api/events',`/media/art/${'a'.repeat(64)}.png`]){
  const handlers={},deleted=[];let scans=0,result,background,puts=0;
  vm.runInNewContext(source,{URL,Response,self:{location:{origin:'https://kairo.test'},addEventListener:(name,fn)=>handlers[name]=fn},
   caches:{open:async()=>({match:async()=>null,put:async()=>puts++,keys:async()=>{scans++;return Array.from({length:62},(_,i)=>({url:`https://kairo.test/media/art/${i}.png`}));},delete:async key=>deleted.push(key)})},fetch:async()=>new Response('fresh')});
  handlers.fetch({request:{url:'https://kairo.test'+path,method:'GET',mode:'cors'},respondWith:value=>result=value,waitUntil:value=>background=value});
  await result;await background;
  assert.equal(puts,1);assert.equal(scans,path.startsWith('/media/')?1:0);
  assert.equal(deleted.length,path.startsWith('/media/')?2:0);
 }
});
test('offline cache excludes wallet, session, ticket and staff data, even with query strings', () => {
  const handlers = {};
  vm.runInNewContext(source, { self: { location: { origin: 'https://kairo.test' }, addEventListener: (name, fn) => { handlers[name] = fn; } }, URL });
  for (const path of ['/api/auth/me', '/api/tickets/private-ticket', '/api/events/1/attendees', '/api/wallet-collection?wallet=0xabc', '/api/collection?wallet=0xabc', '/api/events?private=1']) {
    let intercepted = false;
    handlers.fetch({ request: { url: `https://kairo.test${path}`, method: 'GET', mode: 'cors' }, respondWith() { intercepted = true; } });
    assert.equal(intercepted, false, path);
  }
});
test('public discovery remains readable offline from the explicit safe cache', async () => {
  const handlers = {};
  const cached = new Response('[{"id":1}]', { headers: { 'Content-Type': 'application/json' } });
  vm.runInNewContext(source, { self: { location: { origin: 'https://kairo.test' }, addEventListener: (name, fn) => { handlers[name] = fn; } }, URL, Response,
    caches: { open: async () => ({ match: async () => cached }) }, fetch: async () => { throw Error('Offline'); } });
  let result;
  handlers.fetch({ request: { url: 'https://kairo.test/api/events', method: 'GET', mode: 'cors' }, respondWith(promise) { result = promise; } });
  assert.deepEqual(await (await result).json(), [{ id: 1 }]);
});
test('HTTP API errors are returned but never cached',async()=>{
 const handlers={};let puts=0,result;
 vm.runInNewContext(source,{self:{location:{origin:'https://kairo.test'},addEventListener:(name,fn)=>handlers[name]=fn},URL,Response,
  caches:{open:async()=>({put:async()=>puts++,keys:async()=>[]})},fetch:async()=>Response.json({code:'DATABASE_ERROR'},{status:503})});
 handlers.fetch({request:{url:'https://kairo.test/api/events',method:'GET',mode:'cors'},respondWith:promise=>result=promise,waitUntil(){throw Error('Errors cannot enter the cache');}});
 assert.equal((await result).status,503);assert.equal(puts,0);
});
test('successful installation activates promptly and retires older cache versions',async()=>{
 const handlers={};let skipped=0,claimed=0,deleted=[],pending;
 vm.runInNewContext(source,{Request,URL,self:{location:{origin:'https://kairo.test'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>skipped++,clients:{claim:async()=>claimed++}},
  caches:{open:async()=>({addAll:async()=>{}}),keys:async()=>['kairo-old','unrelated'],delete:async key=>deleted.push(key)}});
 handlers.install({waitUntil:promise=>pending=promise});await pending;assert.equal(skipped,1);
 handlers.activate({waitUntil:promise=>pending=promise});await pending;assert.equal(claimed,1);assert.deepEqual(deleted,['kairo-old']);
});

test('Astro hashed application bundle remains available offline from its explicit cache entry',async()=>{
 const bundle=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').match(/<script[^>]*src="(\/_astro\/[^"?]+\.js)"/)[1];
 const handlers={};let result;
 vm.runInNewContext(source,{self:{location:{origin:'https://kairo.test'},addEventListener:(name,fn)=>handlers[name]=fn},URL,Response,
  caches:{open:async()=>({match:async key=>{assert.equal(key.url,'https://kairo.test'+bundle);return new Response('valid cached bundle');}})},fetch:async()=>{throw Error('Offline');}});
 handlers.fetch({request:{url:'https://kairo.test'+bundle,method:'GET',mode:'cors'},respondWith:promise=>result=promise});
 assert.equal(await(await result).text(),'valid cached bundle');
 assert(source.includes(JSON.stringify(bundle)));
});

test('installation caches every Astro chunk, including lazy wallet imports', async () => {
 const handlers = {}; let pending, shell;
 vm.runInNewContext(source, {Request,URL,self:{location:{origin:'https://kairo.test'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{}},
  caches:{open:async()=>({addAll:async assets=>{assert(assets.every(request=>request.cache==='reload'));shell=assets.map(request=>new URL(request.url).pathname);}})}});
 handlers.install({waitUntil:promise=>pending=promise}); await pending;
 const directory = new URL('../dist/_astro/', import.meta.url);
 for (const file of readdirSync(directory, {recursive:true}).filter(file=>statSync(new URL(file,directory)).isFile())) {
  assert(shell.includes(`/_astro/${file}`), `Missing offline chunk: ${file}`);
 }
 const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
 for (const [,asset] of html.matchAll(/(?:src|href)="(\/_astro\/[^"]+)"/g)) assert(shell.includes(asset), asset);
 assert(!shell.includes('/app.js?v=28'));
});

test('HTML, CSS and public discovery revalidate online instead of returning a stale cached copy', async () => {
 for (const path of ['/', '/styles.css', '/api/events']) {
  const handlers = {}; let pending, background, fetched = false;
  vm.runInNewContext(source, {URL,Response,self:{location:{origin:'https://kairo.test'},addEventListener:(name,fn)=>handlers[name]=fn},
   caches:{open:async()=>({match:async()=>new Response('stale'),put:async()=>{},keys:async()=>[]})},
   fetch:async(request,options)=>{fetched=true;assert.equal(options.cache,'no-cache');return new Response('fresh');}});
  handlers.fetch({request:{url:'https://kairo.test'+path,method:'GET',mode:path==='/'?'navigate':'cors'},respondWith:value=>pending=value,waitUntil:value=>background=value});
  assert.equal(await(await pending).text(),'fresh');assert(fetched);await background;
 }
});

test('immutable artwork is served from cache without a network request', async () => {
 const handlers = {}; let pending;
 vm.runInNewContext(source, {URL,Response,self:{location:{origin:'https://kairo.test'},addEventListener:(name,fn)=>handlers[name]=fn},
  caches:{open:async()=>({match:async()=>new Response('<svg/>')})},fetch:async()=>assert.fail('Cached immutable artwork should not fetch again')});
 handlers.fetch({request:{url:'https://kairo.test/media/art/'+'a'.repeat(64)+'.svg',method:'GET',mode:'cors'},respondWith:value=>pending=value});
 assert.equal(await(await pending).text(),'<svg/>');
});
