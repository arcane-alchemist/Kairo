import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { Wallet } from 'ethers';
import { createHandler, digest } from './worker.js';
import { mintNext } from './mint.js';

function fixture() {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  sqlite.exec(readFileSync('serverless/migrations/0001_initial.sql', 'utf8'));
  sqlite.exec(readFileSync('serverless/migrations/0002_mint_history.sql', 'utf8'));
  sqlite.exec(readFileSync('serverless/migrations/0003_event_schedule.sql', 'utf8'));
  sqlite.exec(readFileSync('serverless/migrations/0004_qr_claims.sql', 'utf8'));
  sqlite.exec(readFileSync('serverless/migrations/0005_linked_qr_claims.sql', 'utf8'));
  sqlite.exec(readFileSync('serverless/migrations/0006_student_experience.sql', 'utf8'));
  sqlite.exec(readFileSync('serverless/migrations/0007_organizer_studio.sql', 'utf8'));
  sqlite.exec(readFileSync('serverless/migrations/0008_role_drops.sql', 'utf8'));
  const DB = {
    prepare(sql) {
      let values = [];
      const query = { bind(...args) { values = args; return query; },
        async first() { return sqlite.prepare(sql).get(...values) || null; },
        async run() { const result = sqlite.prepare(sql).run(...values); return { meta: { changes: result.changes } }; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; } };
      return query;
    },
    async batch(queries) {
      sqlite.exec('BEGIN');
      try { const results = []; for (const query of queries) results.push(await query.run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }
  };
  const admin = Wallet.createRandom(), staff = Wallet.createRandom(), outsider = Wallet.createRandom();
  const now = Math.floor(Date.now()/1000);
  sqlite.prepare('INSERT INTO events(id,title,description,club,category,venue,image,uri,starts_at,ends_at,rsvp_deadline,cap,organizer,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(1,'Test event','A campus event','Test Club','Technology','Hall A','https://kairo.test/media/art/test.png','ipfs://test',now-10,now+3600,now+1800,2,staff.address,now);
  const env = { SITE_ORIGIN:'https://kairo.test',ISSUER_PRIVATE_KEY:admin.privateKey,ISSUER_ADDRESS:admin.address, CHAIN_ID:'11155111',CHAIN_NAME:'Sepolia',PUBLIC_RPC_URL:'https://ethereum-sepolia-rpc.publicnode.com',EXPLORER_URL:'https://sepolia.etherscan.io', DB, STUDENT_HASH_SECRET: 'a'.repeat(32), CONTRACT_ADDRESS: admin.address,
    MEDIA: { async get() { return null; } }, ASSETS: { async fetch() { return new Response('asset'); } },
    MINT: { idFromName() { return 'issuer'; }, get() { return { async fetch() { return Response.json({ queued: true }); } }; } } };
  const chain = { async admin(wallet) { return wallet === admin.address; },
    async staff(id, wallet) { return id === 1 && [admin.address,staff.address].includes(wallet); },
    async event() { return { cap: 2n, startsAt: BigInt(now-10), endsAt: BigInt(now+3600), paused: false }; } };
  const handler = createHandler(async () => chain);
  const request = (path, data, cookie, origin = 'https://kairo.test') => handler(new Request(`https://kairo.test/api${path}`, {
    method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) })
  }), env);
  async function login(wallet) {
    const challenge = await (await request('/auth/challenge', {})).json();
    const verified = await request('/auth/verify', { id: challenge.id, signature: await wallet.signMessage(challenge.message) });
    assert.equal(verified.status, 200);
    return verified.headers.get('set-cookie').split(';')[0];
  }
  // Seed authenticated fixture sessions; SIWE signature/replay is tested separately.
  async function register(path, input, origin) {
    const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
    const wallet=input.wallet;
    sqlite.prepare('INSERT INTO sessions VALUES(?,?,?)').run(await digest(token),wallet,now+600);
    return request(path,input,`kairo_session=${token}`,origin);
  }
  return {sqlite, DB, env, request, register, login, admin, staff, outsider, chain};
}

test('public RSVP validates consent and wallet, enforces capacity and duplicate student/wallet', async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const wallet = Wallet.createRandom().address;
  const rsvp = { studentId: 'STUDENT-1', wallet, permanentConsent: true };
  assert.equal((await f.register('/events/1/rsvp', { ...rsvp, permanentConsent: false })).status, 400);
  assert.equal((await f.register('/events/1/rsvp', { ...rsvp, wallet: 'bad' })).status, 400);
  assert.equal((await f.register('/events/1/rsvp', rsvp, 'https://evil.test')).status, 403);
  const result = await f.register('/events/1/rsvp', rsvp); assert.equal(result.status, 201);
  const { ticket } = await result.json(); assert.match(ticket, /^[a-f0-9-]{36}$/);
  assert.equal((await f.register('/events/1/rsvp', { ...rsvp, studentId: ' student-1 ', wallet: Wallet.createRandom().address })).status, 409);
  assert.equal((await f.register('/events/1/rsvp', { ...rsvp, studentId: 'other' })).status, 409);
  assert.equal((await f.register('/events/1/rsvp', { ...rsvp, studentId: 'STUDENT-2', wallet: Wallet.createRandom().address })).status, 201);
  assert.equal((await f.register('/events/1/rsvp', { ...rsvp, studentId: 'STUDENT-3', wallet: Wallet.createRandom().address })).status, 409);
  const row = await (await f.request(`/tickets/${ticket}`)).json();
  assert(!('student_hash' in row)); assert(!('studentId' in row));
  assert(!JSON.stringify(f.sqlite.prepare('SELECT * FROM registrations').all()).includes('STUDENT-1'));
});

test('wallet challenge cannot replay and event staff access is isolated', async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const challenge = await (await f.request('/auth/challenge', {})).json();
  assert(!challenge.message.includes('Chain ID:'));
  assert(!challenge.message.includes('Nonce:'));
  assert(challenge.message.includes(challenge.id));
  const signed = { id: challenge.id, signature: await f.staff.signMessage(challenge.message) };
  const first = await f.request('/auth/verify', signed); assert.equal(first.status, 200);
  assert.doesNotMatch(first.headers.get('set-cookie'), /Max-Age|Expires=/i);
  const expires=f.sqlite.prepare('SELECT expires_at FROM sessions').get().expires_at;
  assert(Math.abs(expires-Math.floor(Date.now()/1000)-600)<3);
  assert.equal((await f.request('/auth/verify', signed)).status, 401);
  const cookie = first.headers.get('set-cookie').split(';')[0];
  assert.equal((await f.request('/events/1/attendees', undefined, cookie)).status, 200);
  assert.equal((await f.request('/events/2/attendees', undefined, cookie)).status, 403);
  assert.equal((await f.request('/events/1/attendees')).status, 401);
  const outsider = await f.login(f.outsider);
  assert.equal((await f.request('/events/1/attendees', undefined, outsider)).status, 403);
});

test('verified check-in records actor, remains idempotent, and queues a single mint', async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const { ticket } = await (await f.register('/events/1/rsvp', { studentId: 'STUDENT', wallet: Wallet.createRandom().address, permanentConsent: true })).json();
  const cookie = await f.login(f.staff);
  assert.equal((await f.request(`/tickets/${ticket}/check-in`, {}, cookie)).status, 400);
  assert.equal((await f.request(`/tickets/${ticket}/check-in`, { physicallyVerified: true, studentId: 'STUDENT' })).status, 401);
  const outsider = await f.login(f.outsider);
  assert.equal((await f.request(`/tickets/${ticket}/check-in`, { physicallyVerified: true, studentId: 'STUDENT' }, outsider)).status, 403);
  assert.equal((await f.request(`/tickets/${ticket}/check-in`, { physicallyVerified: true, studentId: 'OTHER-STUDENT' }, cookie)).status, 409);
  for (let i = 0; i < 2; i++) assert.equal((await f.request(`/tickets/${ticket}/check-in`, { physicallyVerified: true, studentId: ' student ' }, cookie)).status, 202);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM jobs').get().n, 1);
  assert.equal(f.sqlite.prepare('SELECT checked_in_by FROM registrations').get().checked_in_by, f.staff.address);
});

test('mint retry persists signed bytes and confirms without signing twice', async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const { ticket } = await (await f.register('/events/1/rsvp', { studentId: 'STUDENT', wallet: Wallet.createRandom().address, permanentConsent: true })).json();
  await f.request(`/tickets/${ticket}/check-in`, { physicallyVerified: true, studentId: 'STUDENT' }, await f.login(f.staff));
  let signatures = 0, mined = false, broadcasts = 0;
  const chain = { async token() { return mined ? '42' : '0'; },
    async signMint() { signatures++; return { raw: 'signed', hash: 'hash' }; },
    async receipt() { return mined ? { status: 1 } : null; },
    async broadcast(raw) { assert.equal(raw, 'signed'); if (++broadcasts === 1) throw Error('RPC outage'); mined = true; } };
  await mintNext(f.DB, chain);
  assert.equal(f.sqlite.prepare('SELECT status FROM jobs').get().status, 'submitted');
  await mintNext(f.DB, chain);
  assert.equal(signatures, 1);
  assert.equal(f.sqlite.prepare('SELECT token_id FROM jobs').get().token_id, '42');
  const collection = await (await f.request(`/collection?wallet=${f.sqlite.prepare('SELECT wallet FROM registrations').get().wallet}`)).json();
  assert.equal(collection.length, 1); assert.equal(collection[0].tokenId, '42');
});

test('unsigned failures leave the queue after ten attempts, signed failures retain their nonce', async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const { ticket } = await (await f.register('/events/1/rsvp', { studentId: 'STUDENT', wallet: Wallet.createRandom().address, permanentConsent: true })).json();
  await f.request(`/tickets/${ticket}/check-in`, { physicallyVerified: true, studentId: 'STUDENT' }, await f.login(f.staff));
  const chain = { async token() { return '0'; }, async signMint() { throw Error('insufficient funds'); } };
  for (let i = 0; i < 10; i++) await mintNext(f.DB, chain);
  assert.equal(f.sqlite.prepare('SELECT status FROM jobs').get().status, 'failed');
  f.sqlite.prepare("UPDATE jobs SET status='submitted',raw_tx='raw',tx_hash='hash'").run();
  await mintNext(f.DB, { async receipt() { throw Error('RPC'); } });
  assert.equal(f.sqlite.prepare('SELECT status FROM jobs').get().status, 'submitted');
});

test('signed organizers can upload artwork; publishing requires admin, matches chain metadata and resumes idempotently', async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const objects = new Map();
  f.env.MEDIA = { async put(key, value) { objects.set(key, value); },
    async get(key) { const value = objects.get(key); return value === undefined ? null : { async json() { return JSON.parse(value); } }; } };
  const art = { name: 'Campus meetup', description: 'Meet the campus community',
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXuoAAAAASUVORK5CYII=' };
  assert.equal((await f.request('/artwork', art, await f.login(f.outsider))).status, 200);
  const cookie = await f.login(f.admin);
  assert.equal((await f.request('/artwork', { ...art, image: 'data:image/svg+xml;base64,AAAA' }, cookie)).status, 400);
  const media = await (await f.request('/artwork', art, cookie)).json();
  assert.match(media.uri, /^https:\/\/kairo\.test\/media\/metadata\/[a-f0-9]{64}\.json$/);
  f.chain.event = async () => ({ uri: media.uri, cap: 100n, startsAt: BigInt(Math.floor(Date.now()/1000)), endsAt: BigInt(Math.floor(Date.now()/1000)+3600) });
  f.chain.contract = { async eventAdmin() { return f.staff.address; } };
  const details = { id: 2, title: art.name, description: art.description, club: 'Campus Club', category: 'Community', venue: 'Hall A',
    rsvpDeadline: Math.floor(Date.now()/1000)+1800, ...media };
  assert.equal((await f.request('/events', { ...details, title: 'Tampered' }, cookie)).status, 409);
  assert.equal((await f.request('/events', { ...details, eventStartsAt: Number(await f.chain.event().then(e => e.startsAt))+1, eventEndsAt: Number(await f.chain.event().then(e => e.endsAt)) }, cookie)).status, 400);
  assert.equal((await f.request('/events', details, cookie)).status, 201);
  assert.equal(JSON.parse(objects.get(media.uri.split('/media/')[1])).image, media.image);
  assert.equal((await f.request('/events', details, cookie)).status, 200);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM events WHERE id=2').get().n, 1);
});

test('failed jobs can retry but unresolved signed jobs cannot reset their nonce', async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const { ticket } = await (await f.register('/events/1/rsvp', { studentId: 'STUDENT', wallet: Wallet.createRandom().address, permanentConsent: true })).json();
  const cookie = await f.login(f.staff);
  await f.request(`/tickets/${ticket}/check-in`, { physicallyVerified: true, studentId: 'STUDENT' }, cookie);
  f.sqlite.prepare("UPDATE jobs SET status='submitted',raw_tx='signed',tx_hash='hash'").run();
  assert.equal((await f.request(`/tickets/${ticket}/retry`, {}, cookie)).status, 409);
  assert.equal(f.sqlite.prepare('SELECT raw_tx FROM jobs').get().raw_tx, 'signed');
  f.sqlite.prepare("UPDATE jobs SET status='failed'").run();
  assert.equal((await f.request(`/tickets/${ticket}/retry`, {}, await f.login(f.outsider))).status, 403);
  assert.equal((await f.request(`/tickets/${ticket}/retry`, {}, cookie)).status, 202);
  assert.equal(f.sqlite.prepare('SELECT raw_tx FROM jobs').get().raw_tx, null);
});

test('receipt from the original transaction resolves a replacement race', async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const { ticket } = await (await f.register('/events/1/rsvp', { studentId: 'STUDENT', wallet: Wallet.createRandom().address, permanentConsent: true })).json();
  await f.request(`/tickets/${ticket}/check-in`, { physicallyVerified: true, studentId: 'STUDENT' }, await f.login(f.staff));
  await mintNext(f.DB, { async token() { return '0'; }, async signMint() { return { raw: 'raw', hash: 'old' }; }, async receipt() { return null; }, async broadcast() {} });
  f.sqlite.prepare('UPDATE jobs SET updated_at=?').run(Math.floor(Date.now()/1000)-121);
  await mintNext(f.DB, { async replace() { return { raw: 'newraw', hash: 'new' }; }, async receipt() { return null; }, async broadcast() {} });
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM mint_transactions').get().n, 2);
  await mintNext(f.DB, { async receipt(hash) { return hash === 'old' ? { status: 1 } : null; }, async token() { return '5'; } });
  const job = f.sqlite.prepare('SELECT * FROM jobs').get();
  assert.equal(job.status, 'confirmed'); assert.equal(job.tx_hash, 'old'); assert.equal(job.token_id, '5');
});


test('zero capacity permits unlimited RSVPs without bypassing duplicate checks', async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  f.sqlite.prepare('UPDATE events SET cap=0 WHERE id=1').run();
  for (let i=0; i<3; i++) assert.equal((await f.register('/events/1/rsvp', {studentId:'UNLIMITED-'+i, wallet:Wallet.createRandom().address, permanentConsent:true})).status, 201);
  const events = await (await f.request('/events')).json();
  assert.equal(events[0].cap, 0); assert.equal(events[0].remaining, null);
});


test('QR claims require wallet authentication and consent, honor cap/window, and do not fabricate attendance', async t => {
  const f=fixture();t.after(()=>f.sqlite.close());
  assert.equal((await f.request('/events/1/claim',{permanentConsent:true})).status,401);
  const cookie=await f.login(f.outsider);
  assert.equal((await f.request('/events/1/claim',{permanentConsent:true},cookie)).status,403);
  f.sqlite.prepare("UPDATE events SET claim_mode='qr',rsvp_deadline=1,cap=1 WHERE id=1").run();
  assert.equal((await f.request('/events/1/claim',{permanentConsent:false},cookie)).status,400);
  const first=await (await f.request('/events/1/claim',{permanentConsent:true},cookie)).json();assert(first.ticket);
  const repeated=await (await f.request('/events/1/claim',{permanentConsent:true},cookie)).json();assert.equal(repeated.ticket,first.ticket);
  const row=f.sqlite.prepare('SELECT * FROM registrations WHERE id=?').get(first.ticket);assert.equal(row.wallet,f.outsider.address);assert.equal(row.checked_in_at,null);assert(row.claimed_at);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM jobs').get().n,1);
  assert.equal((await f.request('/events/1/claim',{permanentConsent:true},await f.login(f.admin))).status,409);
  f.chain.event=async()=>({cap:1n,startsAt:0n,endsAt:1n,paused:false});
  assert.equal((await f.request('/events/1/claim',{permanentConsent:true},cookie)).status,409);
});

test('linked QR drops reject a second claim across either drop and preserve retries', async t => {
  const f=fixture();t.after(()=>f.sqlite.close());
  f.sqlite.exec("UPDATE events SET claim_mode='qr' WHERE id=1; INSERT INTO events SELECT 2,title,description,club,category,venue,image,uri,starts_at,ends_at,rsvp_deadline,cap,organizer,created_at,event_starts_at,event_ends_at,claim_mode,campus,eligibility,roles,animation_url,group_id FROM events WHERE id=1");
  const firstWallet=await f.login(f.outsider);
  assert.equal((await f.request('/events/1/claim',{permanentConsent:true},firstWallet)).status,202);
  const blocked=await f.request('/events/2/claim',{permanentConsent:true},firstWallet);
  assert.equal(blocked.status,409);assert.match((await blocked.json()).error,/already claimed/);
  assert.equal((await f.request('/events/1/claim',{permanentConsent:true},firstWallet)).status,202);
  const secondWallet=await f.login(f.admin);
  assert.equal((await f.request('/events/2/claim',{permanentConsent:true},secondWallet)).status,202);
  assert.equal((await f.request('/events/1/claim',{permanentConsent:true},secondWallet)).status,409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM jobs').get().n,2);
});

test('sign-in request and session last ten minutes with a readable replay-safe message', async t => {
  const f=fixture();t.after(()=>f.sqlite.close());
  f.env.SITE_ORIGIN='https://kairo-site-7fb.pages.dev';
  const before=Math.floor(Date.now()/1000);
  const challenge=await (await f.request('/auth/challenge',{})).json();
  assert.match(challenge.message,/https:\/\/kairo-site-7fb.pages.dev/);
  assert.match(challenge.message,/Valid for 10 minutes/);
  assert(!/Nonce:|Chain ID:|organizer/.test(challenge.message));
  assert(challenge.message.includes(challenge.id));
  const expires=f.sqlite.prepare('SELECT expires_at FROM challenges WHERE id=?').get(challenge.id).expires_at;
  assert(expires>=before+600 && expires<=Math.floor(Date.now()/1000)+600);
  const signed={id:challenge.id,signature:await f.outsider.signMessage(challenge.message)};
  const response=await f.request('/auth/verify',signed);
  assert.equal(response.status,200);assert.doesNotMatch(response.headers.get('set-cookie'),/Max-Age|Expires=/i);
  const cookie=response.headers.get('set-cookie').split(';')[0];
  assert.equal((await f.request('/auth/verify',signed)).status,401);
  f.sqlite.exec('UPDATE sessions SET expires_at=0');
  assert.equal((await f.request('/auth/me',undefined,cookie)).status,401);
});

test('SIWE binds the signature to the requested wallet, Pages domain, Sepolia and expiration', async t => {
  const f=fixture();t.after(()=>f.sqlite.close());f.env.SITE_ORIGIN='https://kairo-site-7fb.pages.dev';
  const challenge=await(await f.request('/auth/challenge',{wallet:f.outsider.address})).json();
  assert(challenge.message.startsWith(`kairo-site-7fb.pages.dev wants you to sign in with your Ethereum account:\n${f.outsider.address}\n`));
  assert.match(challenge.message,/Version: 1\nChain ID: 11155111\nNonce: [a-zA-Z0-9]{32}\nIssued At:/);
  assert(challenge.message.includes('Expiration Time:'));
  assert.equal((await f.request('/auth/verify',{id:challenge.id,signature:await f.admin.signMessage(challenge.message)})).status,401);
  const signed={id:challenge.id,signature:await f.outsider.signMessage(challenge.message)};
  assert.equal((await f.request('/auth/verify',signed)).status,200);
  assert.equal((await f.request('/auth/verify',signed)).status,401);
});

test('RSVP roles are validated and cancellation requires the owning signed-in wallet', async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const input = { studentId: 'ID-ROLE', wallet: f.outsider.address, permanentConsent: true };
  assert.equal((await f.register('/events/1/rsvp', { ...input, role: 'Speaker' })).status, 400);
  const { ticket } = await (await f.register('/events/1/rsvp', input)).json();
  assert.equal((await f.request(`/tickets/${ticket}/cancel`, {})).status, 401);
  assert.equal((await f.request(`/tickets/${ticket}/cancel`, {}, await f.login(f.staff))).status, 409);
  assert.equal((await f.request(`/tickets/${ticket}/cancel`, {}, await f.login(f.outsider))).status, 200);
  assert.equal((await f.request(`/tickets/${ticket}`)).status, 404);
  assert.equal((await f.register('/events/1/rsvp', input)).status, 201);
});
test('wallet collection includes on-chain tokens missing from the application database', async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  f.chain.collectionPage = async () => ({ items: [{ id: 99, tokenId: '100', uri: 'ipfs://external', organizer: f.staff.address }], total: 1, nextCursor: null });
  const result = await f.request(`/wallet-collection?wallet=${f.outsider.address}`);
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.items[0].tokenId, '100'); assert.equal(body.items[0].ownershipVerified, true);
  assert.equal(body.items[0].role, 'Unrecorded'); assert.equal(body.items[0].attendanceVerified, false);
  assert.equal(body.items[0].metadataStatus, 'Unavailable · ownership verified');
  assert.equal(body.total, 1); assert.equal(body.nextCursor, null);
});

test('missing artwork generates stored description-based SVG and immutable metadata', async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const objects = new Map();
  f.env.MEDIA = {
    async put(key, value, options) { objects.set(key, {value, ...options}); },
    async get(key) { const object = objects.get(key); return object && {body: object.value, httpMetadata: object.httpMetadata, async json() {return JSON.parse(object.value);} }; }
  };
  const details = {name: 'Campus Code Night', description: 'A coding hackathon with friends <script>alert(1)</script>'};
  assert.equal((await f.request('/artwork', details)).status, 401);
  assert.equal((await f.request('/artwork', details, await f.login(f.outsider))).status, 200);
  const cookie = await f.login(f.admin);
  assert.equal((await f.request('/artwork', {...details, description: ''}, cookie)).status, 400);
  const result = await f.request('/artwork', details, cookie); assert.equal(result.status, 200);
  const media = await result.json(); assert.match(media.image, /\/art\/[a-f0-9]{64}\.svg$/);
  const art = objects.get(media.image.split('/media/')[1]);
  const svg = new TextDecoder().decode(art.value);
  assert.match(svg, /TECHNOLOGY/); assert.match(svg, /Campus Code Night/);
  assert(!svg.includes('<script>')); assert.match(svg, /&lt;script&gt;/);
  assert.equal(art.httpMetadata.contentType, 'image/svg+xml');
  const metadata = JSON.parse(objects.get(media.uri.split('/media/')[1]).value);
  assert.deepEqual(metadata, {...details, name: details.name, image: media.image});
  const served = await createHandler()(new Request(media.image), f.env);
  assert.equal(served.status, 200); assert.equal(await served.text(), svg);
  assert.match(served.headers.get('cache-control'), /immutable/);
  assert.deepEqual(await (await f.request('/artwork', details, cookie)).json(), media);
});

test('organizer drafts persist privately, submit to admin review and publish atomically', async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const objects = new Map();
  f.env.MEDIA = { async put(key,value,options) {objects.set(key,{value,...options});}, async get(key) {const object=objects.get(key);return object && {body:object.value,httpMetadata:object.httpMetadata,async json(){return JSON.parse(object.value);}};} };
  const owner = await f.login(f.staff), outsider = await f.login(f.outsider), admin = await f.login(f.admin);
  const media = await (await f.request('/artwork',{name:'A real campus workshop',description:'Learn coding with our campus community'},owner)).json();
  const start=Math.floor(Date.now()/1000)+7200;
  const details={organizer:f.outsider.address,title:'A real campus workshop',description:'Learn coding with our campus community',club:'Campus builders',category:'Workshop',venue:'Hall A',cap:50,eventStartsAt:start,eventEndsAt:start+3600,mintStartsAt:start,mintEndsAt:start+7200,rsvpDeadline:start-60,...media};
  assert.equal((await f.request('/organizer/events',details)).status,401);
  assert.equal((await f.request('/organizer/events',{...details,organizer:'javascript:alert(1)'},owner)).status,400);
  assert.equal((await f.request('/organizer/events',{...details,organizer:'0x'+'0'.repeat(40)},owner)).status,400);
  const save=await f.request('/organizer/events',{...details,organizer:f.outsider.address},owner);assert.equal(save.status,201);
  const draft=await save.json();assert.equal(draft.status,'draft');
  const mine=await (await f.request('/organizer/events',undefined,owner)).json();assert.equal(mine.length,1);assert.equal(mine[0].details.organizer,f.outsider.address);
  assert.deepEqual(await (await f.request('/organizer/events',undefined,outsider)).json(),[]);
  assert.equal((await f.request('/organizer/events',{...details,id:draft.id},outsider)).status,403);
  assert.equal((await f.request('/organizer/events',{...details,title:'Changed without new metadata',id:draft.id},owner)).status,409);
  assert.equal((await f.request('/organizer/events',{...details,id:draft.id,submit:true},owner)).status,200);
  assert.equal((await f.request('/organizer/review',undefined,owner)).status,403);
  assert.equal((await (await f.request('/organizer/review',undefined,admin)).json()).length,1);
  assert.equal((await f.request('/events',{...details,id:2,draftId:draft.id},owner)).status,403);
  f.chain.event=async()=>({uri:media.uri,cap:50n,startsAt:BigInt(start),endsAt:BigInt(start+7200)});
  f.chain.contract={async eventAdmin(){return f.staff.address;}};
  assert.equal((await f.request('/events',{...details,id:2,draftId:draft.id},admin)).status,409);
  f.chain.contract={async eventAdmin(){return f.outsider.address;}};
  const published=await f.request('/events',{...details,id:2,draftId:draft.id},admin);assert.equal(published.status,201);
  assert.equal(f.sqlite.prepare('SELECT status,event_id FROM organizer_drafts WHERE id=?').get(draft.id).status,'published');
  assert.equal((await f.request('/organizer/events',{...details,id:draft.id},owner)).status,409);
  assert.equal((await f.request('/events',{...details,id:2,draftId:draft.id},admin)).status,200);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM events WHERE id=2').get().count,1);
});

test('video collectibles store validated animation metadata and retain a generated poster', async t => {
  const f=fixture();t.after(()=>f.sqlite.close());const objects=new Map();
  f.env.MEDIA={async put(key,value,options){objects.set(key,{value,...options});},async get(key){const object=objects.get(key);return object && {body:object.value,httpMetadata:object.httpMetadata,async json(){return JSON.parse(object.value);}};}};
  const cookie=await f.login(f.staff),input={name:'Campus film night',description:'Art and music from our students'};
  assert.equal((await f.request('/artwork',{...input,video:'data:video/mp4;base64,AAAA'},cookie)).status,400);
  assert.equal((await f.request('/artwork',{...input,video:'data:text/html;base64,AAAA'},cookie)).status,400);
  const bytes=Uint8Array.from([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0]);
  const video='data:video/mp4;base64,'+Buffer.from(bytes).toString('base64');
  const result=await f.request('/artwork',{...input,video},cookie);assert.equal(result.status,200);const media=await result.json();
  assert.match(media.image,/\.svg$/);assert.match(media.animationUrl,/\/video\/[a-f0-9]{64}\.mp4$/);
  const metadata=JSON.parse(objects.get(media.uri.split('/media/')[1]).value);assert.equal(metadata.animation_url,media.animationUrl);assert.equal(metadata.image,media.image);
  const start=Math.floor(Date.now()/1000)+3600;
  f.chain.event=async()=>({uri:media.uri,cap:5n,startsAt:BigInt(start),endsAt:BigInt(start+7200)});
  f.chain.contract={async eventAdmin(){return f.staff.address;}};
  const details={id:2,title:input.name,description:input.description,club:'Film club',category:'Arts',venue:'Hall A',rsvpDeadline:start-60,eventStartsAt:start,eventEndsAt:start+3600,...media};
  assert.equal((await f.request('/events',details,await f.login(f.admin))).status,201);
  const listing=(await (await f.request('/events')).json()).find(event=>event.id===2);assert.equal(listing.animationUrl,media.animationUrl);
  f.chain.collectionPage=async()=>({total:1,items:[{id:2,tokenId:'2',uri:media.uri,organizer:f.staff.address}],nextCursor:null});
  const collection=await (await f.request('/wallet-collection?wallet='+f.outsider.address)).json();assert.equal(collection.items[0].animationUrl,media.animationUrl);
  const served=await createHandler()(new Request(media.animationUrl),f.env);assert.equal(served.headers.get('content-type'),'video/mp4');assert.deepEqual(new Uint8Array(await served.arrayBuffer()),bytes);
});

test('RSVP binds issuance to the SIWE wallet and rejects self-granted elevated roles',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const input={studentId:'SECURE-ID',permanentConsent:true};
 assert.equal((await f.request('/events/1/rsvp',input)).status,401);
 const cookie=await f.login(f.outsider);
 assert.equal((await f.request('/events/1/rsvp',{...input,wallet:f.admin.address},cookie)).status,403);
 assert.equal((await f.request('/events/1/rsvp',{...input,role:'Winner'},cookie)).status,400);
 const response=await f.request('/events/1/rsvp',input,cookie);assert.equal(response.status,201);
 assert.equal((await response.json()).wallet,f.outsider.address);
 assert.equal(f.sqlite.prepare('SELECT wallet FROM registrations').get().wallet,f.outsider.address);
});
test('runtime network and event categories are exposed without private RPC credentials',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());f.env.SEPOLIA_RPC_URL='https://private.test/secret';
 const response=await f.request('/config'),config=await response.json();assert.equal(response.status,200);
 assert.equal(config.chainId,11155111);assert(config.categories.includes('Workshop'));assert.equal(config.walletNetwork.chainId,'0xaa36a7');
 assert(!JSON.stringify(config).includes('private.test'));
 delete f.env.CHAIN_ID;assert.equal((await f.request('/config')).status,503);
});

test('proof provenance requires a verifier actor and never infers presence from QR consent',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());
 const {ticket}=await (await f.register('/events/1/rsvp',{studentId:'PROOF-ID',wallet:f.outsider.address,permanentConsent:true})).json();
 f.chain.collectionPage=async()=>({total:1,nextCursor:null,items:[{id:1,tokenId:'1',uri:'ipfs://test',organizer:f.staff.address}]});
 const proof=async()=> (await (await f.request('/wallet-collection?wallet='+f.outsider.address)).json()).items[0];
 f.sqlite.prepare('UPDATE registrations SET checked_in_at=?,checked_in_by=? WHERE id=?').run(1,f.staff.address,ticket);
 assert.equal((await proof()).claimMethod,'verifier-check-in');assert.equal((await proof()).attendanceVerified,true);
 f.sqlite.prepare('UPDATE registrations SET checked_in_by=NULL WHERE id=?').run(ticket);assert.equal((await proof()).attendanceVerified,false);
 f.sqlite.prepare('UPDATE registrations SET checked_in_at=NULL,claimed_at=? WHERE id=?').run(1,ticket);
 const qr=await proof();assert.equal(qr.claimMethod,'static-qr');assert.equal(qr.attendanceVerified,false);assert.equal(qr.role,'Attendee');
});

test('health probes every dependency without waking the mint queue',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());
 f.env.MINT.get=()=>({fetch:async request=>{assert.equal(new URL(request.url).pathname,'/health');return Response.json({ok:true});}});
 f.chain.provider={getCode:async()=> '0x1234'};f.chain.contract={nextEventId:async()=>1n};
 const response=await f.request('/health');assert.equal(response.status,200);const data=await response.json();assert.equal(data.status,'ok');assert.equal(Object.keys(data.dependencies).length,5);
 const logs=t.mock.method(console,'error',()=>{});
 f.env.DB.prepare=()=>{throw Error('D1_ERROR: no such table: events');};
 const failed=await f.request('/health');assert.equal(failed.status,503);assert.equal((await failed.json()).dependencies.d1.code,'DATABASE_ERROR');assert(logs.mock.calls.length);
});
test('unexpected handler errors are JSON, log safe details, and preserve shipped collection endpoints',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const logs=t.mock.method(console,'error',()=>{});
 f.env.ASSETS.fetch=async()=>{throw Error('Unexpected asset failure');};
 const response=await createHandler()(new Request('https://kairo.test/'),f.env);assert.equal(response.status,503);assert.equal((await response.json()).code,'INTERNAL_ERROR');assert(logs.mock.calls.length);
 const old=await f.request('/collection?wallet='+f.outsider.address);assert.equal(old.status,200);assert.deepEqual(await old.json(),[]);
});

test('role designs stay frozen, publish as linked drops and resume without completing the draft early', async t => {
  const f=fixture();t.after(()=>f.sqlite.close());const objects=new Map();
  f.env.MEDIA={async put(key,value,options){objects.set(key,{value,...options});},async get(key){const object=objects.get(key);return object&&{body:object.value,httpMetadata:object.httpMetadata,async json(){return JSON.parse(object.value);}};}};
  const owner=await f.login(f.staff),admin=await f.login(f.admin);
  const title='Campus makers',description='A day of coding and building together',roles=['Attendee','Volunteer'];
  const roleArtwork=[];
  for(const role of roles) {
    const response=await f.request('/artwork',{name:title,description,role},owner);assert.equal(response.status,200);
    const art=await response.json();roleArtwork.push({role,...art,cap:role==='Attendee'?40:12});
    const metadata=JSON.parse(objects.get(art.uri.split('/media/')[1]).value);assert.deepEqual(metadata.attributes,[{trait_type:'Role',value:role}]);
  }
  assert.notEqual(roleArtwork[0].image,roleArtwork[1].image);assert.notEqual(roleArtwork[0].uri,roleArtwork[1].uri);
  const start=Math.floor(Date.now()/1000)+7200;
  const details={title,description,organizer:f.staff.address,club:'Campus',category:'Workshop',campus:'Main',eligibility:'Students',claimMode:'attendance',roles,venue:'Hall A',cap:50,eventStartsAt:start,eventEndsAt:start+3600,mintStartsAt:start,mintEndsAt:start+7200,rsvpDeadline:start-60,...roleArtwork[0],roleArtwork,submit:true};
  assert.equal((await f.request('/organizer/events',{...details,roleArtwork:[roleArtwork[0],roleArtwork[0]]},owner)).status,400);
  assert.equal((await f.request('/organizer/events',{...details,roleArtwork:[roleArtwork[0],{...roleArtwork[0],role:'Volunteer'}]},owner)).status,409);
  assert.equal((await f.request('/organizer/events',{...details,roleArtwork:[roleArtwork[0],{...roleArtwork[1],cap:1.5}]},owner)).status,400);
  assert.equal((await f.request('/organizer/events',{...details,roleArtwork:[roleArtwork[0],{...roleArtwork[1],cap:10001}]},owner)).status,400);
  const result=await f.request('/organizer/events',details,owner);assert.equal(result.status,201);const draft=await result.json();
  f.chain.contract={async eventAdmin(){return f.staff.address;}};
  for(let index=0;index<roleArtwork.length;index++) {
    const art=roleArtwork[index];f.chain.event=async()=>({uri:art.uri,cap:BigInt(art.cap),startsAt:BigInt(start),endsAt:BigInt(start+7200)});
    const drop={...details,...art,id:index+2,draftId:draft.id,roles:[art.role]};
    const bad=await f.request('/events',{...drop,title:'Changed title'},admin);assert.equal(bad.status,409);
    const correctEvent=f.chain.event;f.chain.event=async()=>({...await correctEvent(),cap:99n});
    assert.equal((await f.request('/events',drop,admin)).status,409);f.chain.event=correctEvent;
    const response=await f.request('/events',drop,admin);assert.equal(response.status,201,await response.text());
    assert.equal((await f.request('/events',drop,admin)).status,200);
    const row=f.sqlite.prepare('SELECT * FROM organizer_drafts WHERE id=?').get(draft.id);assert.equal(row.status,index===0?'submitted':'published');
    const saved=await (await f.request('/organizer/events',undefined,owner)).json();assert.deepEqual(saved[0].publishedRoles,roles.slice(0,index+1));
    assert.equal((await f.request('/organizer/events',{...details,id:draft.id},owner)).status,409);
  }
  const published=await (await f.request('/events')).json();const linked=published.filter(event=>event.groupId===draft.id);assert.equal(linked.length,2);assert.deepEqual(linked.map(event=>event.cap).sort((a,b)=>a-b),[12,40]);
  assert.deepEqual(linked.map(event=>event.uri).sort(),roleArtwork.map(art=>art.uri).sort());
  const rsvp=await f.request('/events/3/rsvp',{studentId:'VOL-001',permanentConsent:true},await f.login(f.outsider));assert.equal(rsvp.status,201);
  const {ticket}=await rsvp.json();assert.equal(f.sqlite.prepare('SELECT participation_role FROM registrations WHERE id=?').get(ticket).participation_role,'Volunteer');
});
