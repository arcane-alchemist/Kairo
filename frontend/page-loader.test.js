import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {createPageLoader} from './page-loader.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const {document, window} = parseHTML(readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8'));
  Object.defineProperty(document, 'readyState', {value: 'complete', configurable: true});
  return {document, window, loader: createPageLoader(document, window)};
}

test('initial HTML covers the homepage before routing or the bundle runs', () => {
  const {document} = setup();
  assert(document.documentElement.hasAttribute('data-page-loading'));
  assert.equal(document.querySelector('#page-loader').hidden, false);
});

test('slow-load recovery reloads the current URL instead of navigating home', () => {
  const {document, window} = setup();
  let reloaded = false;
  window.location = {href: 'https://kairo.test/#gallery', reload: () => {reloaded = true;}};
  document.querySelector('.loader-retry').click();
  assert(reloaded);
  assert.equal(window.location.href, 'https://kairo.test/#gallery');
});

test('loader waits for the document, fonts, scene textures and decoded lazy images', async () => {
  const {document, window} = setup();
  Object.defineProperty(document, 'readyState', {value: 'loading'});
  let fontsReady, sceneReady, imageDecoded;
  document.fonts = {ready: new Promise(resolve => {fontsReady = resolve;})};
  const loader = createPageLoader(document, window);
  const image = document.createElement('img');
  image.src = '/badge.svg'; image.loading = 'lazy';
  Object.defineProperties(image, {complete: {value: false}, naturalWidth: {value: 320}});
  image.decode = () => new Promise(resolve => {imageDecoded = resolve;});
  document.querySelector('#main').append(image);
  const ticket = loader.begin();
  const finished = loader.finish(ticket, [new Promise(resolve => {sceneReady = resolve;})]);
  await flush();
  assert(document.documentElement.hasAttribute('data-page-loading'));
  window.dispatchEvent(new window.Event('load')); fontsReady(); sceneReady();
  await flush();
  assert.equal(image.loading, 'eager');
  image.dispatchEvent(new window.Event('load'));
  await flush();
  assert(document.documentElement.hasAttribute('data-page-loading'));
  imageDecoded(); await finished;
  assert.equal(document.querySelector('#page-loader').hidden, true);
  assert.equal(document.querySelector('#main').getAttribute('aria-busy'), 'false');
});

test('broken images settle and inactive homepage assets do not block another page', async () => {
  const {document, window, loader} = setup();
  const home = document.querySelector('[data-home]'); home.hidden = true;
  home.innerHTML = '<img src="/unused.svg">';
  const image = document.createElement('img'); image.src = '/missing.svg';
  Object.defineProperty(image, 'complete', {value: false});
  document.querySelector('#main').append(image);
  const finished = loader.finish(loader.begin());
  await flush(); image.dispatchEvent(new window.Event('error')); await finished;
  assert.equal(document.querySelector('#page-loader').hidden, true);
});

test('a cancelled page cannot hide the newer page loader', async () => {
  const {document, loader} = setup();
  let release;
  const old = loader.finish(loader.begin(), [new Promise(resolve => {release = resolve;})]);
  const current = loader.begin();
  release(); await old;
  assert.equal(document.querySelector('#page-loader').hidden, false);
  await loader.finish(current);
  assert.equal(document.querySelector('#page-loader').hidden, true);
});

test('video collectibles wait for a playable first frame and handle errors', async () => {
  for (const event of ['loadeddata', 'error']) {
    const {document, window, loader} = setup();
    const video = document.createElement('video'); video.setAttribute('src', '/moment.mp4');
    Object.defineProperty(video, 'readyState', {value: 0});
    let requested = false; video.load = () => {requested = true;};
    document.querySelector('#main').append(video);
    const finished = loader.finish(loader.begin()); await flush();
    assert(requested); assert.equal(video.preload, 'auto');
    assert.equal(document.querySelector('#page-loader').hidden, false);
    video.dispatchEvent(new window.Event(event)); await finished;
    assert.equal(document.querySelector('#page-loader').hidden, true);
  }
});
