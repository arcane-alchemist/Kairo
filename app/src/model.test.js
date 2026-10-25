import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCode, searchDrops, mintStatus } from './model.js';

test('QR destinations validate chain and do not open arbitrary links', () => {
  const wallet = '0x35539F1dA35751066689d144E6225804D9729329';
  assert.deepEqual(parseCode('ethereum:' + wallet + '@11155111'), { type: 'wallet', value: wallet });
  assert.throws(() => parseCode('ethereum:' + wallet + '@1'));
  assert.throws(() => parseCode('https://evil.test/#drop/1'));
  assert.equal(parseCode('drop:7').value, 7);
  assert.equal(parseCode('https://kairo-site-7fb.pages.dev/#drop/7').value, 7);
  assert.equal(parseCode('https://kairo-site-7fb.pages.dev/#ticket/12345678-abcd-abcd-abcd-123456789abc').type, 'ticket');
  assert.equal(parseCode('kairo:ticket:12345678-abcd-abcd-abcd-123456789abc').type, 'ticket');
});
test('search uses real drop fields and status distinguishes RSVP from minting', () => {
  const drops = [{ id: 8, title: 'Hack night', club: 'Coding', venue: 'Hall', description: 'Build together' }];
  assert.equal(searchDrops(drops, 'DROP #8').length, 1);
  assert.equal(searchDrops(drops, 'coding').length, 1);
  assert.equal(searchDrops(drops, 'unknown').length, 0);
  assert.match(mintStatus({ status: null }), /awaiting/);
  assert.equal(mintStatus({ checked_in_at: 1, status: 'confirmed' }), 'Collectible minted');
  assert.equal(mintStatus({ claimed_at: 1, status: 'pending' }), 'Wallet claim accepted — mint queued');
});
