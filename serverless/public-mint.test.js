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

test('approval, signed-in participant minting and confirmation work without any QR signing secret',async t=>{
 const {mintNext}=await import('./mint.js');
 const f=fixture();t.after(()=>f.sqlite.close());delete f.env.QR_HMAC_SECRET;
 f.sqlite.prepare("UPDATE events SET approval='pending' WHERE id=1").run();
 assert.equal((await(await f.request('/events')).json()).length,0);
 const challenge=await(await f.request('/auth/challenge',{wallet:f.participant.address})).json();
 const verified=await f.request('/auth/verify',{id:challenge.id,signature:await f.participant.signMessage(challenge.message)});
 assert.equal(verified.status,200);const cookie=verified.headers.get('set-cookie').split(';')[0];
 const input={permanentConsent:true,publicLink:true};
 assert.equal((await f.request('/events/1/claim',input,cookie)).status,409);
 const admin=await f.login(f.admin);assert.equal((await f.request('/admin/events/1',{action:'verify'},admin)).status,200);
 assert.equal((await(await f.request('/events')).json()).length,1);
 const claimed=await f.request('/events/1/claim',input,cookie);assert.equal(claimed.status,202);const {ticket}=await claimed.json();
 let minted=false;f.chain.token=async()=>minted?'17':'0';f.chain.signMint=async()=>{minted=true;return {raw:'signed',hash:'0xmint'};};f.chain.receipt=async()=>({status:1});
 await mintNext(f.DB,f.chain);
 const receipt=await(await f.request('/claims/'+ticket,undefined,cookie)).json();
 assert.equal(receipt.status,'confirmed');assert.equal(receipt.token_id,'17');assert.equal(receipt.wallet,f.participant.address);
 assert.equal((await f.request('/events/1/claim',input,cookie)).status,409);
});
