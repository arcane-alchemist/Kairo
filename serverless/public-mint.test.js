import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './test-fixture.js';

test('public links require event approval and allow one sponsored claim per wallet',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());
 f.sqlite.prepare("UPDATE events SET approval='pending' WHERE id=1").run();
 const participant=await f.login(f.participant),admin=await f.login(f.admin);
 const input={permanentConsent:true,publicLink:true};
 assert.equal((await f.request('/events/1/claim',input,participant)).status,409);
 assert.equal((await f.request('/admin/events/1',{action:'verify'},participant)).status,403);
 assert.equal((await f.request('/admin/events/1',{action:'verify'},admin)).status,200);
 assert.equal((await f.request('/events/1/claim',input,participant)).status,202);
 assert.equal((await f.request('/events/1/claim',input,participant)).status,409);
});
