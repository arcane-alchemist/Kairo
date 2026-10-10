import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from './store.js';
import { createApp } from './app.js';
import { processNext } from './worker.js';

const wallet = '0x0000000000000000000000000000000000000123';
test('staff registration, consent, attendance and duplicate prevention', async (t) => {
  const store = createStore(':memory:', 'test-secret');
  const server = createApp(store, 'staff', { async assertEvent() {} }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.close(); store.db.close(); });
  const request = (path, body, token = 'staff') => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body)
  });
  const body = { eventId: 1, studentId: 'STUDENT-1', wallet };
  assert.equal((await request('/registrations', body, 'wrong')).status, 401);
  assert.equal((await request('/registrations', { ...body, wallet: 'bad' })).status, 400);
  assert.equal((await request('/registrations', { ...body, wallet: '0x0000000000000000000000000000000000000000' })).status, 400);
  const first = await (await request('/registrations', body)).json();
  const repeat = await (await request('/registrations', { ...body, studentId: ' student-1 ' })).json();
  assert.equal(first.id, repeat.id);
  assert.equal((await request('/registrations', { ...body, studentId: 'STUDENT-2' })).status, 409);
  assert.equal((await request(`/registrations/${first.id}/check-in`, {})).status, 400);
  const consent = { physicallyVerified: true, permanentCollectibleConsent: true };
  assert.equal((await request(`/registrations/${first.id}/check-in`, consent)).status, 202);
  await request(`/registrations/${first.id}/check-in`, consent);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM jobs').get().n, 1);
  assert(!JSON.stringify(store.db.prepare('SELECT * FROM registrations').all()).includes('STUDENT-1'));
});

test('signed transaction survives failed broadcast and is reused', async () => {
  const store = createStore(':memory:', 'secret');
  const row = store.register(1, 'student', wallet);
  store.checkIn(row.id);
  let signatures = 0; let broadcasts = 0; let mined = false;
  const chain = {
    async hasToken() { return false; },
    async signMint() { signatures++; return { raw: 'signed-bytes', hash: 'hash' }; },
    async receipt() { return mined ? { status: 1 } : null; },
    async broadcast(raw) { assert.equal(raw, 'signed-bytes'); if (++broadcasts === 1) throw Error('network'); mined = true; }
  };
  await processNext(store, chain);
  assert.equal(store.db.prepare('SELECT status FROM jobs').get().status, 'submitted');
  await processNext(store, chain);
  assert.equal(signatures, 1);
  assert.equal(store.db.prepare('SELECT status FROM jobs').get().status, 'confirmed');
  store.db.close();
});

test('existing on-chain token is reconciled without minting again', async () => {
  const store = createStore(':memory:', 'secret');
  store.checkIn(store.register(1, 'student', wallet).id);
  await processNext(store, { async hasToken() { return true; } });
  assert.equal(store.db.prepare('SELECT status FROM jobs').get().status, 'confirmed');
  store.db.close();
});

test('unsigned ineligible job fails after three attempts without blocking later jobs', async () => {
  const store = createStore(':memory:', 'secret');
  store.checkIn(store.register(1, 'student', wallet).id);
  const chain = { async hasToken() { return false; }, async signMint() { throw Error('expired'); } };
  for (let attempt = 0; attempt < 3; attempt++) await processNext(store, chain);
  assert.equal(store.db.prepare('SELECT status FROM jobs').get().status, 'failed');
  store.checkIn(store.register(2, 'student', wallet).id);
  await processNext(store, { async hasToken() { return true; } });
  assert.equal(store.db.prepare("SELECT count(*) AS n FROM jobs WHERE status='confirmed'").get().n, 1);
  store.db.close();
});
