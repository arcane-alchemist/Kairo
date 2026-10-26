import './styles.css';
import { badges, badgeSvg } from './art.js';
import { mountCoin } from './scene.js';
import { mountPress } from './press.js';
import { mountPlatform } from './platform.js';

const $ = (selector, parent = document) => parent.querySelector(selector);
const all = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let storageAvailable = true;
let saved = new Set();
try {
  const data = JSON.parse(localStorage.getItem('poap-playground-favorites') || '[]');
  if (Array.isArray(data)) saved = new Set(data.filter(id => badges.some(badge => badge.id === id)));
} catch { storageAvailable = false; }
let filter = 'all';
let toastTimer;

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3200);
}

function updateCounts() {
  all('.collection-count').forEach(count => { count.textContent = saved.size; count.hidden = !saved.size; });
}

function toggleSave(id) {
  const badge = badges.find(item => item.id === id);
  if (!badge) return;
  const adding = !saved.has(id);
  adding ? saved.add(id) : saved.delete(id);
  try { localStorage.setItem('poap-playground-favorites', JSON.stringify([...saved])); }
  catch { storageAvailable = false; }
  updateCounts();
  all(`[data-save="${id}"]`).forEach(button => {
    button.setAttribute('aria-pressed', String(saved.has(id)));
    if (button.classList.contains('card-save')) {
      button.textContent = saved.has(id) ? '♥' : '♡';
      button.setAttribute('aria-label', `${saved.has(id) ? 'Unsave' : 'Save'} ${badge.name}`);
    } else button.innerHTML = `${saved.has(id) ? 'Saved to your little scrapbook' : 'Save to my collection'} <span aria-hidden="true">${saved.has(id) ? '♥' : '♡'}</span>`;
  });
  if ($('#collection-dialog').open) renderSaved();
  toast(`${adding ? 'A little memory, saved. ♡' : 'Removed from your scrapbook.'}${storageAvailable ? '' : ' Saved for this visit only.'}`);
}

function renderCards() {
  const visible = badges.filter(badge => filter === 'all' || badge.category === filter);
  $('#badge-grid').innerHTML = visible.map((badge, index) => `<article class="badge-card" style="--card-bg:var(--${badge.color});--rotation:${[-10, 9, -6, 7, -9, 6][index]}deg">
    <div class="badge-art"><button class="art-open" data-open="${badge.id}" aria-label="Explore ${badge.name}" style="position:absolute;inset:0;background:transparent;z-index:1"></button><span class="card-number">NO. ${String(badges.indexOf(badge) + 1).padStart(3, '0')}</span><button class="card-save" data-save="${badge.id}" aria-label="${saved.has(badge.id) ? 'Unsave' : 'Save'} ${badge.name}" aria-pressed="${saved.has(badge.id)}">${saved.has(badge.id) ? '♥' : '♡'}</button>${badgeSvg(badge.kind, `card-${badge.id}`, badge.label)}<span class="card-bottom-label">A LITTLE PROOF OF LIFE</span><span class="card-arrow" aria-hidden="true">↗</span></div>
    <div class="badge-text"><p class="badge-event">${badge.event}</p><h3><button data-open="${badge.id}">${badge.name}</button></h3><div class="badge-meta"><span>${badge.location}</span><span>${badge.date}</span></div></div></article>`).join('');
}

function openDialog(dialog) { dialog.showModal(); document.body.classList.add('modal-open'); }
function closeDialog(dialog) { dialog.close(); }

function openBadge(id) {
  const badge = badges.find(item => item.id === id);
  if (!badge) return;
  $('#dialog-body').innerHTML = `<div class="dialog-art" style="--card-bg:var(--${badge.color})">${badgeSvg(badge.kind, 'detail', badge.label)}</div><p class="eyebrow">${badge.event}</p><h2 id="badge-dialog-title">${badge.name}</h2><p class="dialog-meta">${badge.date} &nbsp;·&nbsp; ${badge.location}</p><p class="dialog-description">${badge.description}</p><button class="button button-dark dialog-save" data-save="${badge.id}" aria-pressed="${saved.has(badge.id)}">${saved.has(badge.id) ? 'Saved to your little scrapbook' : 'Save to my collection'} <span aria-hidden="true">${saved.has(badge.id) ? '♥' : '♡'}</span></button><p class="demo-note">Concept collectible · saving adds a favorite, not an onchain POAP.</p>`;
  openDialog($('#badge-dialog'));
}

function renderSaved() {
  const favorites = badges.filter(badge => saved.has(badge.id));
  $('#saved-grid').innerHTML = favorites.length ? favorites.map(badge => `<div class="saved-item">${badgeSvg(badge.kind, `saved-${badge.id}`, badge.label)}<div><h3>${badge.name}</h3><p>${badge.event}</p></div><button data-save="${badge.id}" aria-label="Remove ${badge.name} from favorites">×</button></div>`).join('') : `<div class="empty-state"><span aria-hidden="true">☺</span><p>A little empty. A lot of possibility.<br />Tap a heart on any collectible to start.</p><button class="button button-dark" id="browse-collection">Find a little memory ↗</button></div>`;
}

document.addEventListener('click', event => {
  const save = event.target.closest('[data-save]');
  if (save) toggleSave(save.dataset.save);
  const open = event.target.closest('[data-open]');
  if (open) openBadge(open.dataset.open);
  if (event.target.closest('.collection-button')) { renderSaved(); openDialog($('#collection-dialog')); }
  if (event.target.closest('#browse-collection')) { closeDialog($('#collection-dialog')); $('#collectibles').scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth' }); }
});

all('.filter-tab').forEach(button => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  all('.filter-tab').forEach(tab => { const active = tab === button; tab.classList.toggle('active', active); tab.setAttribute('aria-pressed', String(active)); });
  renderCards();
}));

all('dialog:not([data-platform-dialog])').forEach(dialog => {
  $('.modal-close', dialog).addEventListener('click', () => closeDialog(dialog));
  dialog.addEventListener('close', () => { if (!all('dialog').some(item => item.open)) document.body.classList.remove('modal-open'); });
  dialog.addEventListener('click', event => {
    const box = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) closeDialog(dialog);
  });
});

$('#surprise-me').addEventListener('click', () => openBadge(badges[Math.floor(Math.random() * badges.length)].id));
const menu = $('.menu-button');
menu.addEventListener('click', () => {
  const opening = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(opening));
  menu.setAttribute('aria-label', opening ? 'Close navigation' : 'Open navigation');
  $('#mobile-nav').hidden = !opening;
});
all('#mobile-nav a, #mobile-nav button').forEach(link => link.addEventListener('click', () => { menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Open navigation'); $('#mobile-nav').hidden = true; }));

$('#create-button').addEventListener('click', () => { $('#create-form').hidden = false; $('#create-preview').hidden = true; openDialog($('#create-dialog')); });
$('#create-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#event-name').value.trim();
  if (!name) { $('#event-name').setCustomValidity('Give your moment a name first.'); $('#event-name').reportValidity(); return; }
  $('#event-name').setCustomValidity('');
  const kind = $('#event-vibe').value;
  $('#create-form').hidden = true;
  const preview = $('#create-preview');
  preview.hidden = false;
  preview.innerHTML = `${badgeSvg(kind, 'created', 'A MOMENT WORTH KEEPING')}<h3></h3><p>Your people. Your moment. Your little collectible.</p><button class="text-link" id="edit-preview">Try another little idea ↗</button>`;
  $('h3', preview).textContent = name;
  $('#edit-preview').addEventListener('click', () => { preview.hidden = true; $('#create-form').hidden = false; $('#event-name').focus(); });
});
$('#event-name').addEventListener('input', () => $('#event-name').setCustomValidity(''));

$('.coin-fallback').innerHTML = badgeSvg('flower', 'fallback', 'GOOD TIMES GROW HERE');
renderCards();
updateCounts();
mountCoin($('#coin-stage'), $('#spin-coin'), $('#pause-motion'));
mountPress($('#press-art'), $('#press-button'), $('#press-readout'));
mountPlatform(window.poapFrontendConfig || {});

const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('in-view'); revealObserver.unobserve(entry.target); } }), { threshold: .08 });
all('.section-heading, .how-copy, .press-figure, .create-section > h2, .create-section > .button').forEach(element => { element.classList.add('reveal'); revealObserver.observe(element); });
