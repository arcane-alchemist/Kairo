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
