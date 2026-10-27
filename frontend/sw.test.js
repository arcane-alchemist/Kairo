import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
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
 vm.runInNewContext(source,{self:{addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>skipped++,clients:{claim:async()=>claimed++}},
  caches:{open:async()=>({addAll:async()=>{}}),keys:async()=>['kairo-old','unrelated'],delete:async key=>deleted.push(key)}});
 handlers.install({waitUntil:promise=>pending=promise});await pending;assert.equal(skipped,1);
 handlers.activate({waitUntil:promise=>pending=promise});await pending;assert.equal(claimed,1);assert.deepEqual(deleted,['kairo-old']);
});
