import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { mountPlatform } from './platform.js';
import { makeDraft, draftMetadata, safeImageSource, escapeHtml } from './platform-data.js';
import { badgeSvg } from './art.js';

function setup(options = {}, hash = '#about/proof') {
  const { document, window } = parseHTML(readFileSync(new URL('./index.html', import.meta.url), 'utf8'));
  const signals = new window.EventTarget();
  let currentHash = hash;
  const location = {};
  Object.defineProperty(location, 'hash', { get: () => currentHash, set(value) { currentHash = value; signals.dispatchEvent(new window.Event('hashchange')); } });
  const win = { location, addEventListener: signals.addEventListener.bind(signals), scrollTo() {}, CustomEvent: window.CustomEvent };
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.open = false;
    dialog.showModal = () => { dialog.open = true; };
    dialog.close = () => { dialog.open = false; dialog.dispatchEvent(new window.Event('close')); };
    dialog.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 1000 });
  }
  const api = mountPlatform({ doc: document, win, ...options });
  const click = selector => {
    const element = document.querySelector(selector);
    assert.ok(element, `Missing control ${selector}`);
    element.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  };
  const input = (selector, value) => {
    const element = document.querySelector(selector);
    assert.ok(element, `Missing field ${selector}`);
    element.value = value;
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  const submit = () => document.querySelector('#sbt-builder').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  const previewSignIn = (role = 'attendee', wallet = 'MetaMask') => {
    if (!document.querySelector('#wallet-dialog').open) click(`[data-open-wallet="${role}"]`);
    const radio = document.querySelector(`[name="wallet-role"][value="${role}"]`);
    radio.checked = true;
    radio.dispatchEvent(new window.Event('change', { bubbles: true }));
    click(`[data-wallet="${wallet}"]`);
    assert.match(document.querySelector('#wallet-body').textContent, /No wallet connection, signature, or transaction/);
    click('[data-wallet-action="connect-preview"]');
    click('[data-wallet-action="sign-preview"]');
  };
  return { document, window, win, api, click, input, submit, previewSignIn, navigate: next => { location.hash = next; } };
}

test('all four areas and requested subsections render and return home correctly', () => {
  const ui = setup();
  for (const [hash, text] of [
    ['#about/proof', 'Proof of Protocol'], ['#about/case-studies', 'Illustrative case studies'],
    ['#issuer/guide', 'So, how does POAP work?'], ['#collector/gallery', 'Gallery'],
    ['#collector/collectors', 'Mira Chen'], ['#collector/collection', 'Your story starts here.'],
    ['#builders/build', 'Make it your kind of moment.'], ['#builders/documentation', 'This project is only for Sepolia testnet.']
  ]) {
    ui.navigate(hash);
    assert.equal(ui.document.querySelector('#platform').hidden, false);
    assert.match(ui.document.querySelector('#platform').textContent, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok([...ui.document.querySelectorAll('[data-home]')].every(element => element.hidden));
  }
  ui.navigate('#');
  assert.equal(ui.document.querySelector('#platform').hidden, true);
  assert.ok([...ui.document.querySelectorAll('[data-home]')].every(element => !element.hidden));
});

test('gallery search, empty results, and event details include artwork and event history', () => {
  const ui = setup({}, '#collector/gallery');
  assert.equal(ui.document.querySelectorAll('.event-card').length, 6);
  ui.input('#event-search', 'Somewhere');
  assert.equal(ui.document.querySelectorAll('.event-card').length, 1);
  ui.click('[data-event="planet"]');
  assert.equal(ui.document.querySelector('#event-dialog').open, true);
  assert.match(ui.document.querySelector('#event-body').textContent, /THE MOMENT, IN PICTURES/);
  assert.match(ui.document.querySelector('#event-body').textContent, /not an issued token/);
  ui.click('#event-dialog .modal-close');
  ui.input('#event-search', 'not an actual event');
  assert.equal(ui.document.querySelectorAll('.event-card').length, 0);
  assert.match(ui.document.querySelector('#event-results').textContent, /No moments found/);
});

test('preview requires both connection and signature steps and supports sign-out', async () => {
  const ui = setup({}, '#collector/collection');
  ui.previewSignIn('attendee', 'Phantom');
  assert.equal(ui.document.querySelector('#wallet-dialog').open, false);
  assert.match(ui.document.querySelector('.wallet-button').textContent, /Preview/);
  assert.match(ui.document.querySelector('#platform').textContent, /Mira Chen/);
  assert.equal(ui.document.querySelectorAll('.event-card').length, 3);
  ui.click('[data-collection-view="organized"]');
  assert.equal(ui.document.querySelectorAll('.event-card').length, 0);
  ui.click('.wallet-button');
  ui.click('[data-wallet-action="disconnect"]');
  await new Promise(resolve => setImmediate(resolve));
  assert.match(ui.document.querySelector('#platform').textContent, /Your story starts here/);
});

test('collector lookup filters profiles by wallet address', () => {
  const ui = setup({}, '#collector/collectors');
  ui.input('#people-search', '0x2222222222222222222222222222222222222222');
  assert.equal(ui.document.querySelectorAll('.person-card').length, 1);
  assert.match(ui.document.querySelector('#people-results').textContent, /Alex Rivera/);
});

test('organizer sign-in preserves the form and creates only a local, Sepolia SBT draft', () => {
  const ui = setup({}, '#builders/build');
  ui.input('#sbt-title', 'Our good Tuesday');
  ui.input('#sbt-description', 'Friends, art, and a little proof of a good day.');
  ui.input('#sbt-date', '2026-11-03');
  ui.input('#sbt-location', 'The little studio');
  ui.submit();
  assert.equal(ui.document.querySelector('#wallet-dialog').open, true);
  ui.previewSignIn('organizer');
  assert.equal(ui.document.querySelector('#sbt-title').value, 'Our good Tuesday');
  let received;
  ui.document.addEventListener('poap:draft-created', event => { received = event.detail; });
  ui.submit();
  assert.ok(ui.document.querySelector('.draft-success'));
  assert.equal(received.chainId, 11155111);
  assert.equal(received.draft, true);
  assert.equal(received.soulbound, true);
  assert.equal(received.title, 'Our good Tuesday');
  ui.click('[data-view-draft]');
  assert.match(ui.document.querySelector('#event-body').textContent, /not published or minted/);
  ui.click('#event-dialog .modal-close');
  ui.navigate('#collector/collection');
  ui.click('[data-collection-view="organized"]');
  assert.match(ui.document.querySelector('#platform').textContent, /Our good Tuesday/);
});

test('integration callback rejects other chains and unsigned wallets', async () => {
  for (const [result, message] of [
    [{ address: '0x1111111111111111111111111111111111111111', chainId: 1, signed: true }, /only for Sepolia/],
    [{ address: '0x1111111111111111111111111111111111111111', chainId: 11155111, signed: false }, /Please sign in/],
    [{ address: 'invalid', chainId: 11155111, signed: true }, /valid Ethereum address/]
  ]) {
    const ui = setup({ connectWallet: async () => result }, '#collector/collection');
    ui.click('[data-open-wallet="attendee"]');
    ui.click('[data-wallet="MetaMask"]');
    await new Promise(resolve => setImmediate(resolve));
    assert.match(ui.document.querySelector('#wallet-error').textContent, message);
    assert.match(ui.document.querySelector('#platform').textContent, /Your story starts here/);
  }
});

test('integration callback is injectable and clearSession locks the private UI', async () => {
  let request;
  const ui = setup({ connectWallet: async value => { request = value; return { address: '0x1111111111111111111111111111111111111111', chainId: 11155111, signed: true }; } }, '#collector/collection');
  ui.click('[data-open-wallet="attendee"]');
  ui.click('[data-wallet="MetaMask"]');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(request, { wallet: 'MetaMask', role: 'attendee', chainId: 11155111 });
  assert.equal(ui.document.querySelector('#wallet-dialog').open, false);
  assert.equal(ui.document.querySelector('.wallet-button').dataset.preview, 'false');
  ui.api.clearSession();
  assert.match(ui.document.querySelector('#platform').textContent, /Your story starts here/);
});

test('draft validation, metadata network and image safety enforce frontend boundaries', () => {
  const values = new Map(Object.entries({ title: '<script>hi</script>', description: 'A good day.', location: 'The studio', date: '2026-11-03', kind: 'sun' }));
  const draft = makeDraft(values);
  assert.equal(draftMetadata(draft).properties.chainId, 11155111);
  assert.equal(draftMetadata(draft).properties.status, 'frontend-draft');
  values.set('date', '2026-02-31');
  assert.throws(() => makeDraft(values), /valid event date/);
  values.set('date', '2026-11-03'); values.set('kind', 'something unknown');
  assert.throws(() => makeDraft(values), /available badge/);
  assert.equal(safeImageSource('javascript:alert(1)'), '');
  assert.equal(safeImageSource('data:image/svg+xml,<svg onload=alert(1)>'), '');
  assert.equal(safeImageSource('https://example.org/event.jpg'), 'https://example.org/event.jpg');
  assert.equal(escapeHtml('<img onerror="bad">'), '&lt;img onerror=&quot;bad&quot;&gt;');
  const markup = badgeSvg('bad" onload="alert(1)', 'bad" id="injected', '<script>alert(1)</script>');
  const { document } = parseHTML(markup);
  assert.equal(document.querySelector('[onload]'), null);
  assert.equal(document.querySelector('script'), null);
  assert.ok(markup.includes('&lt;script&gt;'));
});

test('session invalidation cancels a pending integration sign-in', async () => {
  let complete;
  const ui = setup({ connectWallet: () => new Promise(resolve => { complete = resolve; }) }, '#collector/collection');
  ui.click('[data-open-wallet="attendee"]');
  ui.click('[data-wallet="MetaMask"]');
  ui.api.clearSession();
  complete({ address: '0x1111111111111111111111111111111111111111', chainId: 11155111, signed: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(ui.document.querySelector('#platform').textContent, /Your story starts here/);
  assert.equal(ui.document.querySelector('#wallet-dialog').open, false);
});
