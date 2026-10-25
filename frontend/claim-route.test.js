import test from 'node:test';
import assert from 'node:assert/strict';
import { claimEntry } from './claim-route.js';
test('QR and MetaMask entries pin one valid drop; ordinary pages remain ordinary', () => {
  assert.equal(claimEntry(new URL('https://kairo-site-7fb.pages.dev/#drop/2')),2);
  assert.equal(claimEntry(new URL('https://kairo-site-7fb.pages.dev/?drop=2')),2);
  for(const suffix of ['', '#explore', '#drop/0', '?drop=bad', '?drop=2e0', '?drop=9007199254740992']) assert.equal(claimEntry(new URL('https://kairo-site-7fb.pages.dev/'+suffix)),null);
});
