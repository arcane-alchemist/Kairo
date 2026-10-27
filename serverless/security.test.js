import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';
import {PAGE_HEADERS,SVG_POLICY} from './security.js';
test('served pages block injected scripts, event attributes, framing and base URL replacement',async()=>{
 const response=await worker.fetch(new Request('https://kairo.test/'),{ASSETS:{fetch:async()=>new Response('<html></html>',{headers:{'Content-Type':'text/html'}})}});
 for(const [name,value] of Object.entries(PAGE_HEADERS))assert.equal(response.headers.get(name),value);
 const policy=response.headers.get('Content-Security-Policy');assert.match(policy,/script-src 'self';/);assert.match(policy,/script-src-attr 'none'/);assert.match(policy,/base-uri 'none'/);assert(!/script-src[^;]*unsafe/.test(policy));
});
test('SVG media stays sandboxed while preserving declarative animation styles',async()=>{
 const response=await worker.fetch(new Request('https://kairo.test/media/art/'+'a'.repeat(64)+'.svg'),{MEDIA:{get:async()=>({body:'<svg/>',httpMetadata:{contentType:'image/svg+xml'}})}});
 assert.equal(response.headers.get('Content-Security-Policy'),SVG_POLICY);assert.match(SVG_POLICY,/sandbox/);assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
});
