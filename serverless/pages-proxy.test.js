import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';
test('Pages proxy rejects cross-origin mutations and forwards same-origin cookies', async t => {
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original});
  let calls=0;
  globalThis.fetch=async request=>{calls++;assert.equal(new URL(request.url).origin,'https://kairo.aakritigupta7227.workers.dev');assert.equal(request.headers.get('origin'),'https://kairo.aakritigupta7227.workers.dev');assert.equal(request.headers.get('cookie'),'kairo_session=test');return new Response('{}',{headers:{'set-cookie':'kairo_session=new; Secure; HttpOnly; Path=/'}})};
  const url='https://kairo-site.pages.dev/api/auth/verify';
  assert.equal((await onRequest({request:new Request(url,{method:'POST',headers:{origin:'https://evil.test'}})})).status,403);
  assert.equal(calls,0);
  const response=await onRequest({request:new Request(url,{method:'POST',headers:{origin:'https://kairo-site.pages.dev',cookie:'kairo_session=test'},body:'{}'})});
  assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/HttpOnly/);
});

test('Pages returns retryable JSON when the backend cannot be reached', async t => {
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original});
  globalThis.fetch=async()=>{throw TypeError('fetch failed');};
  const response=await onRequest({request:new Request('https://kairo-site.pages.dev/api/events')});
  assert.equal(response.status,503);assert.equal((await response.json()).code,'UPSTREAM_UNREACHABLE');
  assert.equal(response.headers.get('cache-control'),'no-store');
});

test('Pages media route forwards the content-addressed artwork to the Worker', async t => {
  const {onRequest:mediaRequest}=await import('../functions/media/[[path]].js');
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original});
  globalThis.fetch=async request=>{
    assert.equal(new URL(request.url).pathname,'/media/art/'+'a'.repeat(64)+'.svg');
    assert(request.signal);return new Response('<svg/>',{headers:{'content-type':'image/svg+xml'}});
  };
  const response=await mediaRequest({request:new Request('https://kairo-site.pages.dev/media/art/'+'a'.repeat(64)+'.svg')});
  assert.equal(response.status,200);assert.equal(await response.text(),'<svg/>');assert.equal(response.headers.get('content-type'),'image/svg+xml');
});

test('an upstream HTML outage becomes a structured API error', async t => {
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original});
  globalThis.fetch=async()=>new Response('error code: 1042',{status:404,headers:{'content-type':'text/plain'}});
  const response=await onRequest({request:new Request('https://kairo-site.pages.dev/api/events')});
  assert.equal(response.status,503);assert.equal((await response.json()).code,'UPSTREAM_UNAVAILABLE');
});
