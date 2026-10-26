import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { badges, badgeSvg } from './art.js';

function setup(stored = null, blocked = false) {
  const { document, window } = parseHTML(readFileSync(new URL('./index.html', import.meta.url), 'utf8'));
  const storage = new Map(stored ? [['poap-playground-favorites', stored]] : []);
  const localStorage = {
    getItem(key) { if (blocked) throw new Error('Storage blocked'); return storage.get(key) || null; },
    setItem(key, value) { if (blocked) throw new Error('Storage blocked'); storage.set(key, value); }
  };
  const timers = [];
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.showModal = () => { dialog.open = true; };
    dialog.close = () => { dialog.open = false; dialog.dispatchEvent(new window.Event('close')); };
  }
  document.querySelector('#event-name').setCustomValidity = () => {};
  document.querySelector('#event-name').reportValidity = () => {};
  document.querySelector('#collectibles').scrollIntoView = () => {};
  class Observer { observe() {} unobserve() {} }
  const source = readFileSync(new URL('./main.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  new Function('document', 'matchMedia', 'localStorage', 'IntersectionObserver', 'badges', 'badgeSvg', 'mountCoin', 'mountPress', 'setTimeout', 'clearTimeout', 'mountPlatform', 'window', source)(document, () => ({ matches: true }), localStorage, Observer, badges, badgeSvg, () => {}, () => {}, fn => { timers.push(fn); return timers.length; }, () => {}, () => {}, window);
  const click = selector => {
    const node = document.querySelector(selector);
    assert.ok(node, `Missing control: ${selector}`);
    node.dispatchEvent(new window.Event('click', { bubbles: true }));
  };
  return { document, window, click, storage };
}

test('filters show the right collection and details open with truthful demo context', () => {
  const { document, click } = setup();
  assert.equal(document.querySelectorAll('.badge-card').length, 6);
  click('[data-filter="music"]');
  assert.equal(document.querySelectorAll('.badge-card').length, 2);
  assert.equal(document.querySelector('[data-filter="music"]').getAttribute('aria-pressed'), 'true');
  click('[data-open="planet"]');
  assert.equal(document.querySelector('#badge-dialog').open, true);
  assert.equal(document.querySelector('#dialog-body h2').textContent, 'Somewhere out there');
  assert.match(document.querySelector('#dialog-body').textContent, /not an onchain POAP/);
  click('#badge-dialog .modal-close');
  assert.equal(document.body.classList.contains('modal-open'), false);
});

test('favorites persist, restore, synchronize across surfaces, and can be removed', () => {
  const { document, click, storage } = setup();
  click('.card-save[data-save="flower"]');
  assert.deepEqual(JSON.parse(storage.get('poap-playground-favorites')), ['flower']);
  assert.equal(document.querySelector('.collection-count').textContent, '1');
  click('.collection-button');
  assert.match(document.querySelector('#saved-grid').textContent, /A very good day/);
  click('#saved-grid [data-save="flower"]');
  assert.match(document.querySelector('#saved-grid').textContent, /A little empty/);
  assert.equal(document.querySelector('.card-save[data-save="flower"]').getAttribute('aria-pressed'), 'false');
  const restored = setup('["sun","unknown"]');
  restored.click('.collection-button');
  assert.equal(restored.document.querySelectorAll('.saved-item').length, 1);
  assert.match(restored.document.querySelector('#saved-grid').textContent, /Internet friends, IRL/);
});

test('storage denial and malformed storage do not break collection interactions', () => {
  for (const [stored, blocked] of [['{bad json', false], [null, true], ['{"unexpected":true}', false]]) {
    const { document, click } = setup(stored, blocked);
    click('.card-save[data-save="heart"]');
    assert.equal(document.querySelector('.collection-count').textContent, '1');
    click('[data-filter="art"]');
    assert.equal(document.querySelectorAll('.badge-card').length, 2);
    if (blocked) assert.match(document.querySelector('#toast').textContent, /this visit only/);
  }
});

test('creator previews the chosen art and treats the event name as text', () => {
  const { document, window, click } = setup();
  click('#create-button');
  document.querySelector('#event-name').value = '<img src=x onerror=alert(1)>';
  document.querySelector('#event-vibe option[value="sun"]').selected = true;
  document.querySelector('#create-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(document.querySelector('#create-preview').hidden, false);
  assert.equal(document.querySelector('#create-preview h3').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(document.querySelector('#create-preview img'), null);
  click('#edit-preview');
  assert.equal(document.querySelector('#create-form').hidden, false);
});

test('mobile navigation opens, exposes links, and closes on selection', () => {
  const { document, click } = setup();
  click('.menu-button');
  assert.equal(document.querySelector('.menu-button').getAttribute('aria-expanded'), 'true');
  assert.equal(document.querySelector('#mobile-nav').hidden, false);
  click('#mobile-nav a');
  assert.equal(document.querySelector('#mobile-nav').hidden, true);
});
