import { CATEGORIES, eventState, matchesEvent, profileStats, filterCollection } from './student-model.js';
import { claimEntry } from './claim-route.js';
import { BrowserProvider, Contract, getAddress, ZeroAddress } from 'ethers';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { ABI } from '../serverless/chain.js';
import { badgeSvg } from './art.js';
import { mountCoin } from './scene.js';
import { mountPress } from './press.js';
import { mountNative, downloadQR } from './native.js';
import { metaMaskWallet } from './wallet.js';
import { exclusiveNavigation } from './navigation.js';
import { aboutContent, documentationContent, issuerContent, doodle } from './content.js';

const $ = (selector, parent = document) => parent.querySelector(selector);
const all = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const main = document.createElement('section');
main.id = 'live-app'; main.className = 'wrap live-app';
document.querySelector('main').append(main);
const entryDrop = claimEntry(new URL(location.href));
const modal = document.querySelector('#modal');
const modalBody = document.querySelector('#modal-body');

let connectedWallet = '', activeChain = '', collectionRequest = 0;
let events = [], config = {}, session = null, category = 'All events', search = '', renderId = 0;
let stopCamera = null, ticketTimer = null, pageTimer = null, drawEvents = null, ticketView = 0;
let apiError = '';
let walletRevision = 0, logoutRequest = Promise.resolve();
const walletClient = metaMaskWallet(window, () => {
  connectedWallet = ''; session = null; walletRevision++; collectionRequest++;
  document.querySelector('#wallet').textContent = 'Connect MetaMask ↗';
  const net = document.querySelector('#wallet-network'); if (net) net.hidden = true;
  logoutRequest = post('/auth/logout', {}).catch(() => {});
  close(); toast('Wallet changed. Connect MetaMask again to approve an account.');
});
exclusiveNavigation(document);
mountNative(window, document);

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const short = value => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '';
const date = seconds => new Date(seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const time = seconds => new Date(seconds * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const txLink = (hash, tokenId) => hash ? `https://sepolia.etherscan.io/tx/${encodeURIComponent(hash)}` : `https://sepolia.etherscan.io/token/${encodeURIComponent(config.contractAddress || '')}?a=${encodeURIComponent(tokenId || '')}`;
const safeImage = value => /^https:\/\//.test(value) || /^\/media\//.test(value) ? esc(value) : '';

let toastTimer;
function toast(message) {
  const node = document.querySelector('#toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('visible', 'show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('visible', 'show'), 3500);
}

async function api(path, options = {}) {
  if (!navigator.onLine && !(options.method === undefined && ['/events', '/config'].includes(path))) throw Error('You are offline. Reconnect to load live records or submit changes.');
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers } });
  let data;
  try { data = await response.json(); } catch { throw Error('The serverless API is unavailable. Start the app with npm run dev.'); }
  if (!response.ok) {
    if (response.status === 401 && session) {
      session = null;
      document.querySelector('#wallet').textContent = connectedWallet ? short(connectedWallet) : 'Connect wallet ↗';
      if (document.querySelector('#claim-connect')) {
        document.querySelector('#claim-connect').hidden = false;
        document.querySelector('#claim-mint').hidden = true;
        document.querySelector('#claim-consent-row').hidden = true;
      }
    }
    throw Error(data.error || 'Request failed');
  }
  return data;
}
const post = (path, data) => api(path, { method: 'POST', body: JSON.stringify(data) });

async function busy(button, action) {
  const text = button.textContent; button.disabled = true; button.textContent = 'One moment…';
  try { return await action(); } catch (error) { toast(error.code === 4001 || error.code === 'ACTION_REJECTED' ? 'Request cancelled. You can try again.' : error.code === -32002 ? 'A MetaMask request is already open. Review it in your wallet.' : error.message || 'Something went wrong'); }
  finally { button.disabled = false; button.textContent = button.id === 'wallet' && (connectedWallet || session?.wallet) ? short(connectedWallet || session.wallet) : text; }
}

function badge(kind = 'tech', title = 'BUILD TOGETHER', label = 'CAMPUS COLLECTIVE') {
  const color = kind === 'arts' ? ['#c55735', '#f5b86d', '#fae4c3'] : kind === 'community' ? ['#31594a', '#a6c3a0', '#e1edd2'] : ['#52319a', '#bd9de5', '#ede0fa'];
  const center = kind === 'arts' ? '<path d="M70 116 Q110 78 150 116 Q134 144 110 155 Q90 142 70 116" fill="' + color[1] + '"/><circle cx="88" cy="86" r="13" fill="' + color[1] + '"/><circle cx="132" cy="86" r="13" fill="' + color[1] + '"/>' : kind === 'community' ? '<path d="M110 150V76M110 114Q62 124 69 82Q106 81 110 114M110 98Q150 103 151 65Q111 66 110 98" stroke="' + color[1] + '" stroke-width="9" fill="none" stroke-linecap="round"/>' : '<path d="M91 78L65 109L91 140M129 78L155 109L129 140M120 69L101 148" fill="none" stroke="' + color[1] + '" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220" aria-label="${esc(title)} collectible" role="img"><circle cx="110" cy="110" r="108" fill="${color[0]}"/><circle cx="110" cy="110" r="97" fill="none" stroke="${color[1]}" stroke-width="1"/><circle cx="110" cy="110" r="81" fill="none" stroke="${color[1]}" stroke-dasharray="2 5"/>${center}<text x="110" y="48" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" letter-spacing="1" fill="${color[2]}">${esc(title)}</text><text x="110" y="177" text-anchor="middle" font-family="sans-serif" font-size="8" letter-spacing="1.3" fill="${color[2]}">${esc(label)}</text><text x="110" y="198" text-anchor="middle" font-family="sans-serif" font-size="9" fill="${color[1]}">✦ KAIRO ✦</text></svg>`;
}
function artwork(event) { return event.image && safeImage(event.image) ? `<img src="${safeImage(event.image)}" alt="${esc(event.title)} collectible" loading="lazy">` : badge(event.category === 'Arts' ? 'arts' : event.category === 'Community' ? 'community' : 'tech', event.badgeTitle || 'YOU WERE HERE', (event.club || 'KAIRO').toUpperCase()); }
function collectibleArtwork(item) { if (item.animationUrl && safeImage(item.animationUrl)) return `<video class="collectible-video" src="${safeImage(item.animationUrl)}" poster="${safeImage(item.image)}" controls playsinline preload="metadata" aria-label="${esc(item.title)} video collectible"></video>`; return item.image && safeImage(item.image) ? artwork(item) : '<div class="missing-art"><span aria-hidden="true">✧</span><small>Artwork unavailable</small></div>'; }

function card(event, collection = false) {
  const open = event.rsvpDeadline > Date.now() / 1000 && (event.cap === 0 || event.remaining > 0);
  return `<article class="card"><div class="card-art">${collection ? collectibleArtwork(event) : artwork(event)}<span class="card-status">${collection ? 'Ownership verified' : eventState(event)}</span></div><div class="card-body"><div class="card-club">${esc(event.club)} · ${esc(event.category)}</div><h3>${esc(event.title)}</h3><span class="pill">${esc(collection ? event.role : event.claimMode === 'qr' ? 'QR collectible' : 'Staff check-in required')}</span><div class="card-info">◷ <span>${event.startsAt ? date(event.startsAt) : 'Event date unavailable'}</span></div><div class="card-info">⌖ <span>${esc(event.campus || event.venue)}</span></div><div class="card-bottom"><span>${collection ? `Token #${esc(event.tokenId)}` : event.claimMode === 'qr' ? 'Claim window applies' : open ? event.cap === 0 ? 'RSVP open · no cap' : `${esc(event.remaining)} places left` : 'RSVP closed'}</span><a class="card-link" href="#${collection ? `badge/${event.tokenId}/${collectionWallet}` : `drop/${event.id}`}">${collection ? 'View badge' : 'View event'} ↗</a></div></div></article>`;
}
function empty(title, text) { return `<div class="empty"><span aria-hidden="true">✧</span><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`; }

function show(html) { stopCamera?.(); clearInterval(ticketTimer); modalBody.innerHTML = html; if (!modal.open) modal.showModal(); }
function close() { stopCamera?.(); clearInterval(ticketTimer); modal.close(); }
document.querySelector('.modal-close')?.addEventListener('click', close);
modal?.addEventListener('close', () => { stopCamera?.(); clearInterval(ticketTimer); });
modal?.addEventListener('click', event => { if (event.target === modal) { const r = modal.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } });

function claimForm(event, standalone = false) {
  let connectedForClaim = Boolean(session);
  const html = `<h2>${esc(event.title)}</h2><div class="notice">Use sepolia testnet only.</div><label id="claim-consent-row" class="checkbox" ${session ? '' : 'hidden'}><input id="claim-consent" type="checkbox"><span>I want this permanent collectible in my connected wallet. I understand ownership is public on Sepolia.</span></label><p id="claim-wallet" class="muted">${session ? `Connected: ${esc(session.wallet)}` : 'Connect your MetaMask wallet first.'}</p><button id="claim-connect" class="button button-light full-width" ${session ? 'hidden' : ''}>Connect MetaMask</button><button id="claim-mint" class="button full-width" ${session ? '' : 'hidden disabled'}>Mint POAP ↗</button>${!connectedWallet ? `<a class="button button-light full-width" href="https://link.metamask.io/dapp/kairo-site-7fb.pages.dev/?drop=${event.id}">Open this drop in MetaMask mobile ↗</a>` : ''}`;
  if (standalone) main.innerHTML = `<section class="panel claim-panel">${html}</section>`; else show(html);
  const container = standalone ? main : modalBody;
  const button = container.querySelector('#claim-mint');
  const connectButton = container.querySelector('#claim-connect');
  connectButton.onclick = () => busy(connectButton, async () => {
    await connect();
    await signerOnSepolia();
    const walletLabel = container.querySelector('#claim-wallet');
    if (!walletLabel) return;
    walletLabel.textContent = `Connected: ${session.wallet}`;
    connectedForClaim = true;
    button.disabled = false;
    button.hidden = false;
    container.querySelector('#claim-consent-row').hidden = false;
    connectButton.hidden = true;
  });
  button.onclick = () => busy(button, async () => {
    if (!connectedForClaim || !session) throw Error('Connect your MetaMask wallet first');
    if (!container.querySelector('#claim-consent').checked) throw Error('Confirm permanent collectible consent first');
    const authenticated = await api('/auth/me');
    if (authenticated.wallet !== session.wallet) throw Error('Wallet session changed. Connect again.');
    await signerOnSepolia();
    const result = await post(`/events/${event.id}/claim`, { permanentConsent: true });
    try {
      const tickets = JSON.parse(localStorage.getItem('kairo-tickets') || '[]');
      if (!tickets.some(ticket => ticket.ticket === result.ticket)) { tickets.push({ticket:result.ticket,eventId:event.id}); localStorage.setItem('kairo-tickets',JSON.stringify(tickets)); }
    } catch { toast('Claim saved on the server. Device storage is unavailable; use your wallet address to reopen your collection.'); }
    await showTicket(result.ticket,event);
  });
}
function rsvpForm(event) {
  show(`<div class="eyebrow">SAVE YOUR SPOT</div><h2>${esc(event.title)}</h2><p class="muted">No wallet connection or test ETH needed. Bring your college ID to check-in.</p><form id="rsvp-form"><label class="field">Participation role<select name="role">${(event.roles || ['Attendee']).map(role => `<option>${esc(role)}</option>`).join('')}</select><small>Staff verify your participation and role at check-in.</small></label><label class="field">College-issued student ID<input name="studentId" required minlength="2" maxlength="100" autocomplete="off"><small>Stored as a keyed hash. Staff verify your ID at the venue.</small></label><label class="field" style="margin-top:15px">Your Ethereum wallet address<input name="wallet" required placeholder="0x…" value="${esc(session?.wallet || '')}" autocomplete="off"><small>Double-check it. Permanent collectibles cannot be moved to another address.</small></label><button type="button" id="scan-wallet" class="button button-light button-small" style="margin-top:10px">▣ Scan wallet QR</button><label class="checkbox"><input name="consent" type="checkbox" required><span>I want this permanent collectible after attending. I understand it cannot be transferred or burned, and its event and wallet ownership are public.</span></label><button class="button full-width" type="submit">Confirm my RSVP ↗</button></form>`);
  const form = modalBody.querySelector('form');
  const connectButton = document.createElement('button'); connectButton.type = 'button'; connectButton.className = 'button button-light'; connectButton.textContent = 'Use connected MetaMask wallet';
  form.elements.wallet.parentElement.append(connectButton);
  connectButton.onclick = () => busy(connectButton, async () => { const signer = await signerOnSepolia(); form.elements.wallet.value = await signer.getAddress(); });
  modalBody.querySelector('#scan-wallet').onclick = () => scanQR(value => {
    const candidate = value.replace(/^ethereum:/i, '').split(/[?@]/)[0];
    try { const wallet = getAddress(candidate); if (wallet === ZeroAddress) throw Error(); form.elements.wallet.value = wallet; toast('Wallet address scanned'); }
    catch { toast('This QR does not contain a valid Ethereum address'); }
  }, true);
  form.onsubmit = eventSubmit => { eventSubmit.preventDefault(); busy(form.querySelector('[type=submit]'), async () => {
    const result = await post(`/events/${event.id}/rsvp`, { studentId: form.elements.studentId.value, wallet: form.elements.wallet.value.trim(), role: form.elements.role.value, permanentConsent: form.elements.consent.checked });
    const stored = savedTickets();
    stored.push({ ticket: result.ticket, eventId: event.id }); try { localStorage.setItem('kairo-tickets', JSON.stringify(stored)); } catch { toast('Device storage is unavailable. Save the ticket QR before closing.'); }
    await showTicket(result.ticket, event);
  }); };
}

async function showTicket(id, event) {
  const view = ++ticketView;
  let refreshing = false;
  const qrClaim = event?.claimMode === 'qr';
  const container = qrClaim ? main : modalBody;
  const present = html => {
    if (qrClaim) { close(); main.innerHTML = `<section class="panel claim-panel">${html}</section>`; }
    else show(html);
  };
  if (qrClaim) present(`<h2>${esc(event?.title || 'Your drop')}</h2><div id="mint-status" class="notice" role="status">Minting your POAP… Please wait for confirmation.</div>`);
  else {
  show(`<div class="eyebrow">YOU'RE ON THE LIST</div><h2>${esc(event?.title || 'Your event ticket')}</h2><div class="ticket"><canvas id="ticket-qr"></canvas><div><span class="pill" id="ticket-status">RSVP confirmed</span><p class="muted">${event?.claimMode === 'qr' ? 'Your wallet claim is saved. The relayer submits the actual Sepolia mint.' : 'Show this QR and your college ID at the venue. Staff confirm attendance before minting.'}</p><code>${esc(id)}</code></div></div><div id="mint-status" class="notice">Your collectible will be issued after check-in.</div><button id="download-ticket" class="button button-light button-small">Download ticket QR ↓</button>`);
  await QRCode.toCanvas(modalBody.querySelector('canvas'), `${location.origin}/#ticket/${id}`, { width: 170, margin: 1, color: { dark: '#52319a' } });
  modalBody.querySelector('#download-ticket').onclick = event => busy(event.target, () => downloadQR(modalBody.querySelector('canvas').toDataURL(), `kairo-ticket-${id}.png`));
  }
  const refresh = async () => {
    if (refreshing || view !== ticketView || (!qrClaim && !modal.open) || !container.querySelector('#mint-status')) return;
    refreshing = true;
    try {
      const row = await api(`/tickets/${id}`);
      if (view !== ticketView || !container.querySelector('#mint-status')) return;
      if (row.status === 'confirmed') {
        clearInterval(ticketTimer);
        present(`<section class="mint-success" role="status"><div class="success-spark" aria-hidden="true">✧</div><h2>Woo Hoo!</h2><span class="pill green">✓ POAP Minted</span>${event?.image ? `<div class="dialog-art">${artwork(event)}</div>` : ''}<h3>${esc(event?.title || 'Your POAP')}</h3><p>Your POAP is now in your wallet.</p><p><a class="button button-dark" href="#collector/collection">View my collection ↗</a></p><a class="button button-light" href="${txLink(row.tx_hash, row.token_id)}" target="_blank" rel="noopener">View on Sepolia ↗</a><p class="muted">To display it in MetaMask, select Sepolia → NFTs → Import NFT.<br>Contract: <code>${esc(config.contractAddress)}</code><br>Token ID: <strong>${esc(row.token_id)}</strong></p></section>`);
        return;
      }
      if (!qrClaim) container.querySelector('#ticket-status').textContent = row.claimed_at ? 'Wallet claim accepted' : row.checked_in_at ? 'Attendance verified' : 'RSVP confirmed';
      container.querySelector('#mint-status').innerHTML = row.status === 'failed' ? 'Mint needs organizer attention. Your check-in is saved.' : row.checked_in_at || row.claimed_at ? `Claim eligibility saved. Your collectible is ${row.status === 'submitted' ? 'awaiting blockchain confirmation' : 'queued for minting'}.` : 'Your collectible will be issued after check-in.';
    } catch (error) { const status = container.querySelector('#mint-status'); if (view === ticketView && status) status.textContent = error.message; }
    finally { refreshing = false; }
  };
  await refresh(); if (container.querySelector('#mint-status')) ticketTimer = setInterval(refresh, 15000);
}
async function connect() {
  if (!connectedWallet) await connectWallet();
  const injected = walletClient.provider;
  if (await injected.request({ method: 'eth_chainId' }) !== '0xaa36a7') {
    await injected.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] });
    // Network changes invalidate the app connection; ask for account approval again.
    if (!connectedWallet) await connectWallet();
  }
  await logoutRequest;
  const revision = walletRevision;
  const signer = await new BrowserProvider(walletClient.provider).getSigner(connectedWallet);
  const wallet = await signer.getAddress();
  const challenge = await post('/auth/challenge', { wallet });
  const signature = await signer.signMessage(challenge.message);
  const selected = await walletClient.provider.request({ method: 'eth_accounts' });
  if (revision !== walletRevision || selected[0]?.toLowerCase() !== wallet.toLowerCase()) throw Error('Wallet changed during sign-in. Connect again.');
  await post('/auth/verify', { id: challenge.id, signature });
  if (revision !== walletRevision) { await post('/auth/logout', {}); throw Error('Wallet changed during sign-in. Connect again.'); }
  const authenticated = await api('/auth/me');
  if (revision !== walletRevision || authenticated.wallet !== wallet || connectedWallet.toLowerCase() !== wallet.toLowerCase()) { session = null; throw Error('The authenticated wallet does not match the approved MetaMask account.'); }
  session = authenticated;
  document.querySelector('#wallet').textContent = short(wallet);
  toast('Signed in. No transaction or gas was required.');
  return signer;
}
document.querySelector('#wallet').onclick = () => busy(document.querySelector('#wallet'), async () => {
  if (!connectedWallet) { await connectWallet(); return; }
  show(`<p class="eyebrow">YOUR METAMASK CONNECTION</p><h2>Your account. Your choice.</h2><code class="wallet-address">${esc(connectedWallet)}</code><p>Only the account you approved in MetaMask is connected. Sign-in is a separate message; connecting never starts a mint.</p><a class="button button-dark" href="#collector/collection">My collection ↗</a><a class="button button-light" href="#issuer/studio">Organizer studio ↗</a><div class="form-actions"><button id="wallet-sign-in" class="button">${session ? 'Sign out' : 'Sign in with a message'}</button><button id="wallet-change" class="button button-light">Choose another account</button><button id="wallet-disconnect" class="button button-light">Disconnect from Kairo</button></div>`);
  modalBody.querySelector('#wallet-sign-in').onclick = event => busy(event.target, async () => {
    if (session) { await post('/auth/logout', {}); session = null; } else await connect(); close(); render();
  });
  modalBody.querySelector('#wallet-change').onclick = event => busy(event.target, async () => { await post('/auth/logout', {}); await connectWallet(); close(); render(); });
  modalBody.querySelector('#wallet-disconnect').onclick = event => busy(event.target, async () => {
    await post('/auth/logout', {}); walletClient.disconnect(); session = null; connectedWallet = ''; walletRevision++; collectionRequest++;
    document.querySelector('#wallet').textContent = 'Connect MetaMask ↗'; await updateNetwork(); close(); render();
  });
});

async function connectWallet() {
  connectedWallet = ''; session = null; const revision = ++walletRevision;
  document.querySelector('#wallet').textContent = 'Connect MetaMask ↗';
  const account = await walletClient.connect();
  if (revision !== walletRevision) { walletClient.disconnect(); throw Error('Wallet changed while approving access. Connect again.'); }
  connectedWallet = getAddress(account);
  await updateNetwork();
  if (revision !== walletRevision) throw Error('Wallet changed while connecting. Connect again.');
  document.querySelector('#wallet').textContent = short(connectedWallet);
}
async function updateNetwork() {
  if (connectedWallet) activeChain = await walletClient.provider.request({ method: 'eth_chainId' });
  const node = document.querySelector('#wallet-network');
  if (node) {
    const wrongChain = Boolean(connectedWallet && activeChain && activeChain !== '0xaa36a7');
    node.hidden = !wrongChain;
    node.textContent = 'Switch to Sepolia';
  }
}
document.querySelector('#wallet-network').onclick = event => busy(event.target, async () => {
  await walletClient.provider.request({method: 'wallet_switchEthereumChain',params:[{chainId:'0xaa36a7'}]});
  await updateNetwork();
});
async function signerOnSepolia() {
  if (!session) await connect();
  const injected = walletClient.provider;
  if (await injected.request({method:'eth_chainId'}) !== '0xaa36a7') throw Error('Switch MetaMask to Sepolia, then reconnect and sign in.');
  const signer = await new BrowserProvider(injected).getSigner(connectedWallet);
  if (await signer.getAddress() !== session.wallet) throw Error('Sign in with the currently approved MetaMask account');
  return signer;
}

let collectionWallet = '', collectionItems = [];
function savedTickets() { try { return JSON.parse(localStorage.getItem('kairo-tickets') || '[]'); } catch { return []; } }

function showEvent(event) {
  if (!event) return;
  const current = Date.now() / 1000;
  const claimStatus = current < event.mintStartsAt ? 'Not open yet' : current > event.mintEndsAt ? 'Closed' : 'Within scheduled window · live eligibility checked on submission';
  show(`<div class="eyebrow">${esc(event.club || 'KAIRO')}</div><h2>${esc(event.title)}</h2><div class="event-cover" aria-label="Event cover artwork">${collectibleArtwork(event)}</div><p class="muted">${esc(event.description)}</p><p class="muted">◷ ${event.startsAt ? date(event.startsAt) : ''} · ${event.startsAt ? time(event.startsAt) : ''}<br>⌖ ${esc(event.venue || event.location || 'Venue')}<br>${event.cap === 0 ? 'Unlimited attendees' : `Limited to ${event.cap} attendees`}</p><dl class="detail-grid"><div><dt>Organization</dt><dd>${esc(event.club || 'KAIRO')}</dd></div><div><dt>Organizer wallet</dt><dd><code>${esc(short(event.organizer))}</code></dd></div><div><dt>Campus / venue</dt><dd>${esc(event.campus || event.venue || event.location)}</dd></div><div><dt>Issuance / claim window</dt><dd>${esc(claimStatus)}</dd></div></dl><div id="event-rsvp-state"></div><ol class="journey"><li>RSVP registration</li><li>${event.claimMode === 'qr' ? 'Wallet claim' : 'Staff verifies attendance'}</li><li>Confirmed collectible issuance</li></ol><div class="notice">${event.claimMode === 'qr' ? 'Anyone with this drop QR can claim during its mint window, one collectible per wallet.' : 'Your collectible is issued after staff verify your attendance.'}</div>${session?.admin || session?.wallet === event.organizer ? '<button id="share-drop" class="button button-light full-width">Share drop QR ▦</button>' : ''}<button id="rsvp-start" class="button button-dark full-width">${event.claimMode === 'qr' ? 'Connect wallet & mint on Sepolia ↗' : 'RSVP for this moment ↗'}</button>`);
  showRsvpStatus(event);
  const shareButton = modalBody.querySelector('#share-drop');
  if (shareButton) shareButton.onclick = () => shareDrop(event);
  modalBody.querySelector('#rsvp-start').onclick = () => event.claimMode === 'qr' ? claimForm(event) : rsvpForm(event);
}

async function shareDrop(event) {
  const url = `${location.origin}/#drop/${event.id}`;
  show(`<h2>Drop #${esc(event.id)} · ${esc(event.title)}</h2><canvas id="drop-qr"></canvas><p class="muted">Scan to open this drop. Sepolia testnet only.</p><button id="download-drop" class="button full-width">Download drop QR ↓</button>`);
  const canvas = modalBody.querySelector('#drop-qr');
  await QRCode.toCanvas(canvas, url, { width: 300, margin: 3, color: { dark: '#52319a' } });
  modalBody.querySelector('#download-drop').onclick = event => busy(event.target, () => downloadQR(canvas.toDataURL(), `kairo-drop-${event.id}.png`));
}

async function scanQR(onRead, preserveForm = false) {
  const previous = document.createDocumentFragment(); while (modalBody.firstChild) previous.appendChild(modalBody.firstChild);
  const container = document.createElement('div');
  container.innerHTML = '<h2>Scan a QR code</h2><video class="camera" autoplay playsinline muted></video><p class="muted">Point the camera at the QR or paste its contents below.</p><label class="field">QR contents<input id="qr-value" autocomplete="off"></label><div class="form-actions"><button id="qr-use" class="button">Use this code</button><button id="qr-cancel" class="button button-light">Cancel</button></div><p id="camera-status" class="muted"></p>';
  modalBody.append(container); if (!modal.open) modal.showModal();
  let active = true, stream, frame;
  const restore = value => {
    active = false; stopCamera?.(); container.remove(); modalBody.append(previous);
    if (!preserveForm) modal.close();
    if (value) onRead(value);
  };
  stopCamera = () => { active = false; stream?.getTracks().forEach(track => track.stop()); cancelAnimationFrame(frame); stopCamera = null; };
  container.querySelector('#qr-cancel').onclick = () => restore();
  container.querySelector('#qr-use').onclick = () => restore(container.querySelector('#qr-value').value.trim());
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    if (!active) { stream.getTracks().forEach(track => track.stop()); return; }
    const video = container.querySelector('video'); video.srcObject = stream; await video.play();
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let last = 0;
    const loop = timestamp => {
      if (!active) return;
      if (video.readyState >= 2 && timestamp - last > 180) {
        last = timestamp; canvas.width = 480; canvas.height = Math.round(480 * video.videoHeight / video.videoWidth);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height); const code = jsQR(pixels.data, pixels.width, pixels.height);
        if (code) { restore(code.data); return; }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
  } catch { container.querySelector('#camera-status').textContent = 'Camera unavailable. Allow camera access on HTTPS, or paste QR contents.'; }
}

async function showRsvpStatus(event) {
  const node = modalBody.querySelector('#event-rsvp-state');
  const ticket = savedTickets().find(item => item.eventId === event.id);
  if (!ticket || !node) return;
  node.textContent = 'Checking your saved RSVP…';
  try {
    const row = await api(`/tickets/${ticket.ticket}`);
    if (!node.isConnected) return;
    node.innerHTML = `<div class="notice">${row.status === 'confirmed' ? 'Collectible issued' : row.checked_in_at ? 'Attendance verified · issuance ' + esc(row.status || 'not started') : row.claimed_at ? 'Wallet claim saved · attendance not certified' : 'RSVP registered · attendance not yet verified'} <button class="card-link" id="view-rsvp">View status ↗</button>${!row.checked_in_at && !row.claimed_at ? '<button class="card-link" id="cancel-rsvp">Cancel RSVP</button>' : ''}</div>`;
    node.querySelector('#view-rsvp').onclick = () => showTicket(ticket.ticket, event);
    const cancel = node.querySelector('#cancel-rsvp');
    if (cancel) cancel.onclick = () => busy(cancel, async () => {
      if (!session) { await connect(); return; }
      await post(`/tickets/${ticket.ticket}/cancel`, {});
      try { localStorage.setItem('kairo-tickets', JSON.stringify(savedTickets().filter(item => item.ticket !== ticket.ticket))); } catch { /* Server cancellation remains authoritative. */ }
      node.textContent = 'RSVP cancelled. No collectible was issued.';
      events = await api('/events'); toast('RSVP cancelled');
    });
  } catch (error) { if (node.isConnected) node.textContent = `Saved RSVP unavailable: ${error.message}`; }
}
function badgeDetails(item) {
  show(`<div class="eyebrow">KAIRO / COLLECTIBLE #${esc(item.tokenId)}</div><h2>${esc(item.title)}</h2><div class="dialog-art">${collectibleArtwork(item)}</div><span class="pill green">On-chain ownership verified</span><span class="pill">${esc(item.role)}</span><p class="muted">${esc(item.description || 'Description unavailable for this collectible.')}</p><dl class="detail-grid"><div><dt>Organization</dt><dd>${esc(item.club)}</dd></div><div><dt>Organizer</dt><dd><code>${esc(short(item.organizer))}</code></dd></div><div><dt>Event date</dt><dd>${item.startsAt ? date(item.startsAt) : 'Not recorded'}</dd></div><div><dt>Issuance date</dt><dd>${item.issuedAt ? date(item.issuedAt) : 'Not indexed yet'}</dd></div><div><dt>Attendance</dt><dd>${item.attendanceVerified ? 'Verified by event staff' : 'Not certified by app records'}</dd></div><div><dt>Metadata</dt><dd>${esc(item.metadataStatus)}</dd></div><div><dt>Network</dt><dd>Sepolia · 11155111</dd></div><div><dt>Token ID</dt><dd>${esc(item.tokenId)}</dd></div></dl><a class="button button-light" href="${txLink(item.transactionHash, item.tokenId)}" target="_blank" rel="noopener">View blockchain proof ↗</a>${/^https:\/\//.test(item.uri) ? `<a class="button button-light" href="${esc(item.uri)}" target="_blank" rel="noopener">View metadata ↗</a>` : `<p class="muted">Metadata URI: ${esc(item.uri)}</p>`}<h3>Issuance transaction history</h3>${item.history.length ? `<ul class="transaction-list">${item.history.map(tx => `<li><a href="${txLink(tx.hash)}" target="_blank" rel="noopener">${esc(short(tx.hash))} ↗</a> <span>${date(tx.created_at)}</span></li>`).join('')}</ul>` : '<p class="muted">Transaction history has not been indexed by this app. Ownership is verified directly against the Kairo contract.</p>'}<div class="notice">Permanent and non-transferable. This wallet address is not a verified real-world identity.</div>`);
}
async function collection(version, profile = false) {
  const addressFromRoute = (location.hash.startsWith('#collector/') ? '' : location.hash.split('/')[profile ? 1 : location.hash.startsWith('#badge/') ? 2 : 1]);
  const savedWallet = addressFromRoute || connectedWallet || session?.wallet || '';
  main.innerHTML = `<div class="eyebrow">${profile ? 'YOUR PARTICIPATION, VERIFIED' : 'A RECORD OF YOUR MOMENTS'}</div><h1 class="page-title">${profile ? 'Your participation profile.' : 'Your collection.'}</h1><p class="lead">${profile ? 'A public wallet profile, built from verified participation. Your identity stays yours.' : 'The communities, ideas, and experiences you carry with you.'}</p><form id="collection-form" class="panel wallet-lookup"><label class="field">Ethereum wallet address<input id="collection-wallet" required placeholder="0x…" value="${esc(savedWallet)}" autocomplete="off" spellcheck="false"></label><button class="button">View ${profile ? 'profile' : 'collection'} ↗</button></form><div id="profile-stats"></div><div id="collection-status" role="status" aria-live="polite"></div><div id="collection-tools"></div><div id="collection-grid">${empty('Your story is waiting', 'Connect a wallet or enter an address. Viewing public collectibles does not require a signature.')}</div><div id="collection-more"></div>`;
  const form = main.querySelector('#collection-form');
  form.onsubmit = event => { event.preventDefault(); busy(form.querySelector('button'), async () => {
    const wallet = getAddress(main.querySelector('#collection-wallet').value.trim());
    const requestId = ++collectionRequest; collectionWallet = wallet; collectionItems = [];
    const status = main.querySelector('#collection-status'); const grid = main.querySelector('#collection-grid');
    grid.innerHTML = '<div class="loading" role="status">Checking on-chain ownership…</div>';
    main.querySelector('#collection-tools').innerHTML = ''; main.querySelector('#profile-stats').innerHTML = ''; main.querySelector('#collection-more').innerHTML = '';
    let cursor = 1, total = 0, pending = 0, complete = false, pages = 0;
    const current = () => version === renderId && requestId === collectionRequest;
    const filters = { search: '', year: '', role: '', organization: '', sort: 'newest' };
    const draw = () => {
      if (!current()) return;
      const stats = profileStats(collectionItems);
      const options = (values, label, key) => `<option value="">${label}</option>${[...new Set(values)].filter(Boolean).sort().map(v => `<option ${filters[key] === String(v) ? 'selected' : ''}>${esc(v)}</option>`).join('')}`;
      if (profile) main.querySelector('#profile-stats').innerHTML = `<div class="stats"><div class="stat"><small>Verified participations</small><strong>${stats.participations}</strong></div><div class="stat"><small>Events attended</small><strong>${stats.events}</strong></div><div class="stat"><small>Roles fulfilled</small><strong>${stats.roles.length}</strong></div><div class="stat"><small>Organizations</small><strong>${stats.organizations.length}</strong></div></div><div class="panel"><h3>Milestones</h3><div class="chips">${[1, 5, 10, 25].map(n => `<span class="pill ${stats.participations >= n ? 'green' : ''}">${stats.participations >= n ? '✓' : '○'} ${n} verified participation${n > 1 ? 's' : ''}</span>`).join('')}</div><p class="muted">${esc(stats.roles.join(' · ') || 'No verified roles yet')} · ${esc(stats.organizations.join(' · ') || 'No organizations represented yet')}</p><small>Counts reflect loaded, staff-verified records. QR claims do not certify attendance.</small></div>`;
      const tools = main.querySelector('#collection-tools');
      if (!tools.innerHTML && collectionItems.length) {
        tools.innerHTML = `<div class="filter-bar"><label class="field">Search<input data-filter="search" placeholder="Event, role, token…"></label><label class="field">Year<select data-filter="year">${options(collectionItems.map(i => i.startsAt && new Date(i.startsAt*1000).getFullYear()), 'All years', 'year')}</select></label><label class="field">Role<select data-filter="role">${options(collectionItems.map(i => i.role), 'All roles', 'role')}</select></label><label class="field">Organization<select data-filter="organization">${options(collectionItems.map(i => i.club), 'All organizations', 'organization')}</select></label><label class="field">Sort<select data-filter="sort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Event name</option></select></label></div>`;
        tools.querySelectorAll('[data-filter]').forEach(input => input.oninput = () => { filters[input.dataset.filter] = input.value; draw(); });
      }
      for (const [key, values, label] of [['year', collectionItems.map(i => i.startsAt && new Date(i.startsAt * 1000).getFullYear()), 'All years'], ['role', collectionItems.map(i => i.role), 'All roles'], ['organization', collectionItems.map(i => i.club), 'All organizations']]) {
        const select = tools.querySelector(`[data-filter="${key}"]`);
        if (select) select.innerHTML = options(values, label, key);
      }
      const rows = filterCollection(collectionItems, filters);
      grid.innerHTML = rows.length ? `<div class="grid">${rows.map(row => card(row, true)).join('')}</div>` : collectionItems.length ? empty('No matching collectibles', 'Try another search or filter.') : complete && total === 0 ? `${empty('Your first moment is ahead of you', 'Discover an event, participate, and keep a collectible from the experience.')}<a class="button" href="#collector/gallery">Discover events ↗</a>` : empty('Your collection is still being checked', 'Ownership is checked on-chain. Records may take a moment to load.');
      status.innerHTML = `<div class="notice">${complete ? `${collectionItems.length} of ${total} on-chain collectibles loaded.` : `Checking the Kairo contract… ${collectionItems.length} of ${total} collectibles loaded.`}${complete && collectionItems.length < total ? ' Some records are not indexed yet. Retry shortly; this is not an empty collection.' : ''}${pending ? ` ${pending} issuance${pending > 1 ? 's' : ''} awaiting confirmation.` : ''} Only this Sepolia Kairo contract is included. <a class="card-link" href="#${profile ? 'collection' : 'profile'}/${wallet}">${profile ? 'View collection' : 'View profile'} ↗</a></div>`;
    };
    const load = async () => {
      main.querySelector('#collection-more').innerHTML = '';
      try {
        do {
          const page = await api(`/wallet-collection?wallet=${wallet}&cursor=${cursor}`);
          if (!current()) return;
          total = page.total; pending = page.pending;
          for (const item of page.items) if (!collectionItems.some(i => i.tokenId === item.tokenId)) collectionItems.push(item);
          cursor = page.nextCursor; complete = cursor === null || collectionItems.length >= total; pages++; draw();
        } while (!complete && pages % 5 !== 0);
        if (!current()) return;
        const more = main.querySelector('#collection-more');
        if (!complete) { more.innerHTML = '<button class="button button-light" id="load-more-badges">Continue checking collection ↻</button>'; more.querySelector('button').onclick = event => busy(event.target, load); }
        const badgeId = location.hash.startsWith('#badge/') && location.hash.split('/')[1];
        const selected = collectionItems.find(i => i.tokenId === badgeId);
        if (selected) badgeDetails(selected);
      } catch (error) {
        if (!current()) return;
        if (!collectionItems.length) grid.innerHTML = '';
        status.innerHTML = `<div class="notice warning">Collection unavailable: ${esc(error.message)} Your wallet may still own collectibles. <button class="card-link" id="retry-collection">Retry ↻</button></div>`;
        status.querySelector('button').onclick = event => busy(event.target, load);
      }
    };
    await load();
  }); };
  if (savedWallet) form.requestSubmit();
}

function tickets() {
  const stored = savedTickets();
  main.innerHTML = `<div class="eyebrow">A FEW GOOD PLANS</div><h1 class="page-title">Your upcoming moments.</h1><p class="lead">Tickets saved on this device. Keep your QR private and bring your college ID.</p>${stored.length ? stored.map(item => { const event = events.find(e => e.id === item.eventId); return `<div class="panel"><h3>${esc(event?.title || `Event #${item.eventId}`)}</h3><p class="muted">${event ? date(event.startsAt) : ''}</p><button class="button button-light" data-ticket="${esc(item.ticket)}">Show check-in QR ↗</button></div>`; }).join('') : empty('Nothing on your calendar yet', 'Explore campus events and RSVP to something that feels like you.')}`;
  main.querySelectorAll('[data-ticket]').forEach(button => button.onclick = () => busy(button, () => showTicket(button.dataset.ticket, events.find(e => e.id === stored.find(i => i.ticket === button.dataset.ticket)?.eventId))));
}
async function organizer(version) {
  main.innerHTML = `<div class="eyebrow">MAKE IT HAPPEN</div><h1 class="page-title">Your organizer space.</h1><p class="lead">A smoother door. A memorable event. Verify attendance and give people something to keep.</p>${!session ? '<div class="panel"><h3>Start with your organizer wallet</h3><p class="muted">Sign a message to log in. Access is checked against each event’s on-chain permissions.</p><button id="organizer-connect" class="button">Sign in to organize ↗</button></div>' : '<div class="panel"><label class="field">Choose an event<select id="staff-event"><option value="">Select an event…</option></select></label><div id="staff-content"></div></div>'}`;
  if (!session) { main.querySelector('#organizer-connect').onclick = () => busy(main.querySelector('#organizer-connect'), async () => { await connect(); render(); }); return; }
  const select = main.querySelector('#staff-event');
  select.innerHTML += events.map(event => `<option value="${event.id}">${esc(event.title)}</option>`).join('');
  select.onchange = async () => {
    const content = main.querySelector('#staff-content'); if (!select.value) { content.innerHTML = ''; return; }
    content.innerHTML = '<p class="loading">Loading event attendance…</p>';
    const id = Number(select.value);
    try {
      const rows = await api(`/events/${id}/attendees`);
      if (version !== renderId || Number(select.value) !== id) return;
      content.innerHTML = `<div class="stats"><div class="stat"><small>Registered</small><strong>${rows.length}</strong></div><div class="stat"><small>Checked in</small><strong>${rows.filter(r => r.checked_in_at).length}</strong></div><div class="stat"><small>Collectibles issued</small><strong>${rows.filter(r => r.status === 'confirmed').length}</strong></div></div><div class="form-actions"><button id="scan-ticket" class="button">▣ Scan attendee ticket</button><button id="refresh-attendees" class="button button-light">Refresh ↻</button><button id="manage-staff" class="button button-light">Event permissions</button></div><div class="table-wrap"><table><thead><tr><th>Attendee wallet</th><th>Attendance</th><th>Collectible</th><th>Action</th></tr></thead><tbody>${rows.length ? rows.map(row => `<tr><td title="${esc(row.wallet)}">${short(row.wallet)}</td><td>${row.checked_in_at ? 'Verified' : row.claimed_at ? 'Wallet claim · attendance not certified' : 'Not checked in'}</td><td><span class="pill ${row.status === 'confirmed' ? 'green' : ''}">${esc(row.status || 'Not issued')}</span></td><td>${row.checked_in_at || row.claimed_at ? row.status === 'failed' ? `<button class="card-link" data-retry="${esc(row.id)}">Retry mint ↻</button>` : row.tx_hash ? `<a class="card-link" href="${txLink(row.tx_hash, row.token_id)}" target="_blank" rel="noopener">Transaction ↗</a>` : 'Queued' : `<button class="card-link" data-check-in="${esc(row.id)}">Check in ↗</button>`}</td></tr>`).join('') : '<tr><td colspan="4">No RSVPs yet. Share the public event page with attendees.</td></tr>'}</tbody></table></div><div class="notice">Check college ID and the attendee’s destination wallet in person. A QR alone does not prove physical attendance or identity.</div>`;
      content.querySelectorAll('[data-retry]').forEach(button => button.onclick = () => busy(button, async () => { await post(`/tickets/${button.dataset.retry}/retry`, {}); toast('Mint queued for retry'); await select.onchange(); }));
      content.querySelector('#manage-staff').onclick = () => permissionDialog(id);
      content.querySelector('#refresh-attendees').onclick = select.onchange;
      content.querySelector('#scan-ticket').onclick = () => scanQR(value => {
        const match = value.match(/(?:ticket\/)?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/);
        const row = match && rows.find(row => row.id === match[1]);
        if (!row) { toast('This ticket is not registered for the selected event'); return; }
        checkInDialog(row, select.onchange);
      });
      content.querySelectorAll('[data-check-in]').forEach(button => button.onclick = () => checkInDialog(rows.find(row => row.id === button.dataset.checkIn), select.onchange));
    } catch (error) { if (version === renderId) content.innerHTML = `<div class="notice warning">${esc(error.message)}</div>`; }
  };
}
function checkInDialog(row, refresh) {
  show(`<div class="eyebrow">VERIFY IN PERSON</div><h2>Welcome them in.</h2><p class="muted">Receiving wallet</p><code style="overflow-wrap:anywhere">${esc(row.wallet)}</code><p class="muted">Requested role: <strong>${esc(row.participation_role || 'Attendee')}</strong>. Verify this role as well as attendance. Permanent collectible consent was recorded at RSVP.</p><form id="verify-form"><label class="field">Student ID shown on their college card<input name="studentId" required minlength="2" maxlength="100" autocomplete="off"><small>This must match the RSVP. The raw ID is not stored.</small></label><label class="checkbox"><input type="checkbox" required><span>I checked this attendee’s college ID, confirmed their participation role and physical presence, and confirmed the wallet destination with them.</span></label><button class="button full-width">Verify attendance & queue collectible ↗</button></form>`);
  modalBody.querySelector('form').onsubmit = event => { event.preventDefault(); busy(modalBody.querySelector('form button'), async () => {
    await post(`/tickets/${row.id}/check-in`, { physicallyVerified: true, studentId: modalBody.querySelector('form').elements.studentId.value }); close(); toast('Attendance saved. Collectible queued.'); await refresh();
  }); };
}

function permissionDialog(id) {
  show(`<h2>Event permissions</h2><p class="muted">Only the event organizer or college admin can change these settings. Changes require a wallet transaction and Sepolia gas.</p><form><label class="field">Staff wallet address<input name="staff" required placeholder="0x…"></label><label class="field" style="margin-top:15px">Permission<select name="allowed"><option value="true">Grant event issuer / check-in access</option><option value="false">Revoke event issuer / check-in access</option></select></label><div class="notice warning">An issuer can mint directly for this event. Grant this only to trusted event staff.</div><button class="button">Update permission ↗</button></form><div class="form-actions"><button id="pause-event" class="button button-light">Pause issuance</button><button id="unpause-event" class="button button-light">Resume issuance</button></div>`);
  async function change(action) {
    const signer = await signerOnSepolia(); const contract = new Contract(config.contractAddress, ABI, signer);
    if (!session.admin && await contract.eventAdmin(id) !== session.wallet) throw Error('Only the event organizer or college admin may change permissions');
    const tx = await action(contract); toast('Transaction submitted. Waiting for confirmation…'); await tx.wait(2); toast('Event permission updated'); close();
  }
  const form = modalBody.querySelector('form');
  form.onsubmit = event => { event.preventDefault(); busy(form.querySelector('button'), () => change(contract => contract.setEventIssuer(id, getAddress(form.elements.staff.value.trim()), form.elements.allowed.value === 'true'))); };
  for (const [selector, paused] of [['#pause-event', true], ['#unpause-event', false]]) modalBody.querySelector(selector).onclick = event => busy(event.target, () => change(contract => contract.setEventPaused(id, paused)));
}

async function organizerStudio(version) {
  main.innerHTML = `<header class="story-heading"><div><p class="eyebrow">A SPACE FOR YOUR NEXT BIG LITTLE THING</p><h1>Organizer studio.</h1><p class="lead">Your events. Your designs. Your people.</p></div>${doodle('flower')}</header><nav class="section-tabs"><a href="#issuer/studio" aria-current="page">My events</a><a href="#issuer/manage">Attendance desk</a><a href="#issuer/guide">Organizer guide</a></nav>${!session ? '<div class="studio-welcome"><h2>Start with your own account.</h2><p>Choose an account in MetaMask, then sign a message to open your private workspace. Create events, bring an image or video, or turn your event story into a collectible.</p><button id="studio-connect" class="button button-dark">Connect & sign in with MetaMask ↗</button></div>' : '<div class="studio-toolbar"><p>Your signed-in wallet: <code>' + esc(short(session.wallet)) + '</code></p><button id="new-event" class="button button-dark">Create an event ↗</button></div><div id="studio-events" role="status">Loading your saved events…</div><div id="studio-review"></div>'}`;
  if (!session) { main.querySelector('#studio-connect').onclick = event => busy(event.target, async () => { await connect(); await organizerStudio(renderId); }); return; }
  main.querySelector('#new-event').onclick = () => createEventPage();
  try {
    const drafts = await api('/organizer/events');
    const review = session.admin ? await api('/organizer/review') : [];
    if (version !== renderId) return;
    const cards = rows => rows.map(row => `<article class="studio-event"><div class="studio-art">${artwork(row.details)}</div><div><span class="pill">${row.status === 'submitted' ? 'Awaiting admin publication' : row.status === 'published' ? 'Published' : 'Private draft'}</span><h2>${esc(row.details.title)}</h2><p>${esc(row.details.club)} · ${esc(row.details.venue)}</p><p>${date(row.details.eventStartsAt)}</p>${row.status === 'published' ? `<a class="text-link" href="#drop/${row.event_id}">Open public event ↗</a>` : `<button class="text-link" data-edit-draft="${esc(row.id)}">${review.includes(row) ? 'Review & publish' : 'Edit event & artwork'} ↗</button>`}</div></article>`).join('');
    const existing = events.filter(event => event.organizer.toLowerCase() === session.wallet.toLowerCase() && !drafts.some(draft => draft.event_id === event.id));
    main.querySelector('#studio-events').innerHTML = (drafts.length ? cards(drafts) : '') + (existing.length ? `<h2>Your published events</h2><div class="grid">${existing.map(event => card(event)).join('')}</div>` : '') || empty('Your next event starts here.', 'Create a draft, make its collectible, and send it for publication.');
    if (session.admin) main.querySelector('#studio-review').innerHTML = `<h2>Ready for your review</h2>${review.length ? cards(review) : '<p>No organiser submissions are awaiting publication.</p>'}`;
    main.querySelectorAll('[data-edit-draft]').forEach(button => button.onclick = () => createEventPage([...drafts,...review].find(row => row.id === button.dataset.editDraft)));
  } catch (error) { if (version === renderId) main.querySelector('#studio-events').textContent = error.message; }
}

function createEventPage(saved = null) {
  main.innerHTML = `<div class="eyebrow">ORGANIZER STUDIO / EVENT EDITOR</div><h1 class="page-title">Give your event a little forever.</h1><p class="lead">Your artwork. Your community. A collectible for everyone who shows up.</p><div class="notice"><a href="#issuer/studio">Back to my studio ↗</a> · <a href="#issuer/manage">Manage attendance ↗</a> · <a href="#tickets">My tickets ↗</a><br>Save your event to your wallet’s workspace, then submit it for publication. The college admin confirms the on-chain event. Your artwork freezes at publication.</div><form id="event-form" class="panel"><div class="form-grid"><label class="field">Event title<input name="title" required minlength="3" maxlength="100" placeholder="Your event name"></label><label class="field">Club or community<input name="club" required minlength="2" maxlength="80" placeholder="The Coding Club"></label><label class="field field-full">Description<textarea name="description" required minlength="3" maxlength="1000" placeholder="What makes this moment special?"></textarea></label><label class="field">Category<select name="category">${CATEGORIES.map(name => `<option>${name}</option>`).join('')}</select></label><label class="field">Campus<input name="campus" maxlength="100" placeholder="Campus name"></label><label class="field">Participation roles<input name="roles" value="Attendee" maxlength="320"><small>Comma-separated. Staff must verify each requested role.</small></label><label class="field field-full">Eligibility<textarea name="eligibility" maxlength="500">Open to campus participants with a college ID</textarea></label><label class="field">Venue<input name="venue" required minlength="2" maxlength="150" placeholder="Innovation Lab, Block A"></label><label class="field">Event starts<input name="starts" type="datetime-local" required></label><label class="field">Event ends<input name="eventEnds" type="datetime-local" required></label><label class="field">Minting opens<input name="mintStarts" type="datetime-local" required></label><label class="field">Minting closes<input name="ends" type="datetime-local" required><small>Allow time after the event for queued mints to confirm.</small></label><label class="field">RSVP deadline<input name="deadline" type="datetime-local" required></label><label class="field">Distribution<select name="claimMode"><option value="attendance">Staff verifies attendance</option><option value="qr">Anyone with the QR can claim</option></select><small>QR claims do not certify physical attendance.</small></label><label class="field">Attendee capacity<input name="cap" type="number" min="0" max="10000" required value="50"><small>0 means unlimited attendees.</small></label><label class="field">Organizer wallet<input name="organizer" readonly placeholder="0x…" value="${esc(session?.wallet || '')}"><small>Can manage event staff and pause issuance.</small></label><label class="field field-full">Collectible artwork<input name="artwork" type="file" accept="image/png,image/jpeg,video/mp4,video/webm"><small>PNG/JPEG up to 2 MB or MP4/WebM up to 10 MB. Leave empty to generate a badge from the event description.</small></label><div class="field-full art-preview"><img id="art-preview" alt="Collectible artwork preview"><video id="video-preview" controls playsinline preload="metadata" hidden aria-label="Video collectible preview"></video></div></div><label class="checkbox"><input type="checkbox" required><span>I have permission to use this artwork. I checked the details and understand that the collectible metadata cannot be edited after publishing.</span></label><div class="form-actions"><button class="button" id="save-event" type="submit">Save event draft ↗</button><button type="button" class="button button-light" id="submit-event">Submit for publication ↗</button><button type="button" class="button button-light" id="generate-poap">Generate from description ✧</button><button type="button" class="text-link" id="clear-artwork">Clear design & upload</button>${session?.admin ? '<button type="button" class="button button-dark" id="publish-button">Publish on Sepolia ↗</button>' : ''}</div><div id="publish-status" class="submission-progress" role="status"></div></form>`;
  const form = main.querySelector('form');
  let image, video, generated = saved ? {...saved.details, name:saved.details.title} : null, draftId = saved?.id;
  let uploadRequest = 0, reading = false;
  const preview = media => {
    main.querySelector('#art-preview').src = media.image;
    const player = main.querySelector('#video-preview'); player.hidden = !media.animationUrl;
    if (media.animationUrl) player.src = media.animationUrl; else player.removeAttribute('src');
  };
  if (saved) {
    const details = saved.details;
    for (const name of ['title','description','club','category','campus','eligibility','venue','cap','organizer','claimMode']) if (details[name] !== undefined) form.elements[name].value = details[name];
    form.elements.roles.value = details.roles.join(', ');
    const localDate = seconds => { const d = new Date(seconds*1000); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); };
    for (const [name,key] of [['starts','eventStartsAt'],['eventEnds','eventEndsAt'],['mintStarts','mintStartsAt'],['ends','mintEndsAt'],['deadline','rsvpDeadline']]) form.elements[name].value = localDate(details[key]);
    preview(details);
  }
  async function authenticate() {
    if (!session) await connect();
    if (!saved) form.elements.organizer.value = session.wallet;
  }
  async function media() {
    if (reading) throw Error('Wait for your upload to finish reading.');
    const input = {name:form.elements.title.value.trim(), description:form.elements.description.value.trim()};
    if (input.name.length < 3 || input.description.length < 3) throw Error('Add an event title and description of at least three characters first.');
    if (generated && generated.name === input.name && generated.description === input.description) return {image:generated.image,uri:generated.uri,...(generated.animationUrl ? {animationUrl:generated.animationUrl} : {})};
    // Uploaded video remains attached when the event story or poster changes.
    if (generated && !image && !video) throw Error('Your event story changed. Generate from description again, or upload your custom artwork again.');
    const result = await post('/artwork',{...input,...(image ? {image} : {}),...(video ? {video} : {})});
    generated = {...result,...input}; preview(result); return result;
  }
  main.querySelector('#clear-artwork').onclick = () => { uploadRequest++; reading = false; image = video = generated = null; form.elements.artwork.value = ''; main.querySelector('#art-preview').removeAttribute('src'); const player = main.querySelector('#video-preview'); player.pause(); player.removeAttribute('src'); player.hidden = true; };
  main.querySelector('#generate-poap').onclick = event => busy(event.target, async () => {
    if (image || video || generated?.animationUrl) { toast('Clear the upload to generate a description-only collectible.'); return; }
    if (form.elements.title.value.trim().length < 3 || form.elements.description.value.trim().length < 3) throw Error('Add your event title and description before generating a badge.');
    await authenticate(); generated = null; await media(); toast('Your description-based badge is ready.');
  });
  form.elements.artwork.onchange = () => {
    const request = ++uploadRequest; reading = false; image = video = generated = null;
    main.querySelector('#art-preview').removeAttribute('src');
    const player = main.querySelector('#video-preview'); player.hidden = true; player.removeAttribute('src');
    const file = form.elements.artwork.files[0]; if (!file) return;
    const isVideo = ['video/mp4','video/webm'].includes(file.type);
    if ((!isVideo && !['image/png','image/jpeg'].includes(file.type)) || file.size > (isVideo ? 10 : 2)*1024*1024) { toast('Use PNG/JPEG up to 2 MB or MP4/WebM up to 10 MB.'); form.elements.artwork.value = ''; return; }
    reading = true;
    const reader = new FileReader();
    reader.onload = () => { if (request !== uploadRequest) return; reading = false; if (isVideo) { video = reader.result; player.src = video; player.hidden = false; } else { image = reader.result; main.querySelector('#art-preview').src = image; } };
    reader.onerror = () => { if (request === uploadRequest) { reading = false; toast('The upload could not be read. Choose the file again.'); } };
    reader.readAsDataURL(file);
  };
  function details(media) {
    const f = form.elements, seconds = name => Math.floor(new Date(f[name].value).getTime()/1000);
    const roles = [...new Set(f.roles.value.split(',').map(role => role.trim()).filter(Boolean))];
    if (!roles.length || roles.length > 8 || roles.some(role => role.length > 40)) throw Error('Choose 1–8 roles, each up to 40 characters.');
    const result = {title:f.title.value.trim(),description:f.description.value.trim(),club:f.club.value.trim(),category:f.category.value,campus:f.campus.value.trim(),eligibility:f.eligibility.value.trim(),roles,venue:f.venue.value.trim(),claimMode:f.claimMode.value,cap:Number(f.cap.value),organizer:getAddress(f.organizer.value),eventStartsAt:seconds('starts'),eventEndsAt:seconds('eventEnds'),mintStartsAt:seconds('mintStarts'),mintEndsAt:seconds('ends'),rsvpDeadline:seconds('deadline'),...media};
    if (result.eventStartsAt >= result.eventEndsAt || result.mintStartsAt < result.eventStartsAt || result.mintStartsAt >= result.mintEndsAt || result.mintEndsAt < result.eventEndsAt || result.rsvpDeadline > result.eventStartsAt) throw Error('Check your event, RSVP and minting dates. Minting must open at or after the event starts and close after it ends.');
    return result;
  }
  async function save(submit) {
    if (!form.reportValidity()) return;
    await authenticate();
    if (saved && saved.wallet !== session.wallet) throw Error('Only the original organizer can edit this submission. Use Publish on Sepolia to approve it.');
    const payload = details(await media());
    const result = await post('/organizer/events',{...payload,...(draftId ? {id:draftId} : {}),submit}); draftId = result.id;
    main.querySelector('#publish-status').textContent = submit ? 'Submitted for college-admin publication. Your event is saved in your studio.' : 'Event draft saved to your organiser workspace.';
    toast(submit ? 'Event submitted for publication.' : 'Event saved.');
  }
  form.onsubmit = event => { event.preventDefault(); busy(main.querySelector('#save-event'), () => save(false)); };
  main.querySelector('#submit-event').onclick = event => busy(event.target, () => save(true));
  const pendingKey = 'kairo-pending-event';
  async function finishPublication(draft) {
    const signer = await signerOnSepolia(), contract = new Contract(config.contractAddress, ABI, signer);
    const receipt = await signer.provider.waitForTransaction(draft.hash,2,120000);
    if (!receipt || receipt.status !== 1) throw Error('Transaction pending or failed. Check MetaMask and resume when confirmed.');
    const log = receipt.logs.map(item => { try { return contract.interface.parseLog(item); } catch { return null; } }).find(item => item?.name === 'EventCreated');
    if (!log) throw Error('Confirmed event creation was not found in the transaction.');
    await post('/events',{...draft.details,id:Number(log.args.eventId)});
    localStorage.removeItem(pendingKey); events = await api('/events'); location.hash = `drop/${Number(log.args.eventId)}`;
  }
  let pending;
  try { pending = JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch { toast('Saved publication could not be read. Check your last transaction before publishing again.'); }
  if (pending) {
    main.querySelector('#publish-status').innerHTML = 'A previous publication needs finishing. <button type="button" id="resume-event" class="text-link">Resume publication ↗</button>';
    main.querySelector('#resume-event').onclick = event => busy(event.target, () => finishPublication(pending));
  }
  const publish = main.querySelector('#publish-button');
  if (publish) publish.onclick = event => busy(event.target, async () => {
    if (!form.reportValidity()) return;
    if (location.protocol !== 'https:' || ['localhost','127.0.0.1'].includes(location.hostname)) throw Error('Publish from the live HTTPS app so wallets can read your frozen collectible artwork.');
    if (localStorage.getItem(pendingKey)) throw Error('Resume the pending publication first.');
    const signer = await signerOnSepolia(); if (!session.admin) throw Error('College-admin approval is required.');
    const payload = details(await media());
    if (draftId && (!saved || saved.status !== 'submitted')) { await save(true); }
    if (saved && (payload.title !== saved.details.title || payload.description !== saved.details.description || payload.uri !== saved.details.uri)) throw Error('Publish the submitted design unchanged, or ask its organizer to edit and resubmit.');
    // Check local recovery storage before sending an irreversible transaction.
    localStorage.setItem(pendingKey, 'null'); localStorage.removeItem(pendingKey);
    const contract = new Contract(config.contractAddress, ABI, signer);
    main.querySelector('#publish-status').textContent = 'Confirm event creation in MetaMask. Sepolia test gas is required.';
    const tx = await contract.createEvent(payload.uri,payload.cap === 0 ? 18446744073709551615n : BigInt(payload.cap),payload.mintStartsAt,payload.mintEndsAt,payload.organizer,getAddress(config.issuerAddress));
    const draft = {hash:tx.hash,details:{...payload,...(draftId ? {draftId} : {})}};
    localStorage.setItem(pendingKey,JSON.stringify(draft)); await finishPublication(draft);
  });
}
function about() { main.innerHTML = aboutContent(location.hash, config.contractAddress); }
async function render() {
  clearInterval(pageTimer); drawEvents = null; close();
  all('details.nav-dropdown').forEach(menu => { menu.open = false; });
  const version = ++renderId;
  const hash = location.hash.slice(1);
  const routes = { 'collector/gallery': 'explore', 'collector/collection': 'collection', 'collector/collectors': 'profile', 'builders/build': 'create', 'builders/documentation': 'documentation', 'issuer/guide': 'issuer-guide', 'issuer/studio': 'studio', 'issuer/manage': 'organizer' };
  const route = hash.startsWith('doc-') ? 'documentation' : routes[hash] || hash.split('/')[0];
  const home = !hash || ['main','collectibles','how-it-works'].includes(hash);
  document.querySelectorAll('[data-home]').forEach(node => { node.hidden = !home; });
  document.querySelector('#platform').hidden = true;
  main.hidden = home;
  if (apiError && !['about','documentation','issuer-guide','create','studio'].includes(route)) { main.hidden = false; main.innerHTML = `${empty('Live service unavailable', apiError)}<button class="button" id="retry-api">Retry connection</button>`; main.querySelector('button').onclick = init; return; }
  if (home) { renderCards(); pageTimer = setInterval(async () => { if (document.hidden || modal.open || version !== renderId) return; try { events = await api('/events'); apiError = ''; if (version === renderId) renderCards(); } catch (error) { apiError = error.message; renderCards(); } }, 15000); return; }
  if (route === 'collection' || route === 'badge' || route === 'profile') await collection(version, route === 'profile');
  else if (route === 'tickets') tickets();
  else if (route === 'organizer') await organizer(version);
  else if (route === 'create') createEventPage();
  else if (route === 'about') about();
  else if (route === 'issuer-guide') main.innerHTML = issuerContent();
  else if (route === 'studio') await organizerStudio(version);
  else if (route === 'documentation') { documentation(); if (hash.startsWith('doc-')) document.getElementById(hash)?.scrollIntoView({behavior:reduced.matches ? 'instant' : 'smooth'}); }
  else if (route === 'ticket') {
    tickets();
    try { const row = await api(`/tickets/${hash.split('/')[1]}`); await showTicket(row.id, events.find(e => e.id === row.event_id)); } catch (error) { toast(error.message); }
  } else {
    explore();
    const id = entryDrop || (route === 'drop' ? Number(hash.split('/')[1]) : null);
    if (id) { const event = events.find(e => e.id === id); if (event?.claimMode === 'qr') claimForm(event, true); else if (event) showEvent(event); else toast('This drop was not found'); }
  }
  pageTimer = setInterval(async () => {
    if (document.hidden || modal.open || version !== renderId) return;
    try { events = await api('/events'); if (version !== renderId) return; drawEvents?.(); const staff = main.querySelector('#staff-event'); if (staff?.value) await staff.onchange(); }
    catch (error) { const node = document.querySelector('#connection-state'); node.hidden = false; node.textContent = `Live refresh unavailable: ${error.message}`; }
  }, 15000);
}

function renderCards() {
  const grid = document.querySelector('#badge-grid');
  const visible = events.filter(event => filter === 'all' || (filter === 'art' ? event.category === 'Arts' : filter === 'community' ? event.category === 'Community' : event.category !== 'Arts' && event.category !== 'Community'));
  grid.innerHTML = apiError ? empty('Live events unavailable', apiError) : visible.length ? visible.map(event => card(event)).join('') : empty('No events yet', 'Published events will appear here.');
  const count = document.querySelector('[data-filter="all"] span'); if (count) count.textContent = events.length;
}
let filter = 'all';
function explore() {
  main.innerHTML = `<h1>Discover events</h1><label class="field">Search events<input id="live-search" placeholder="Event, campus, organizer…"></label><label class="field">Category<select id="live-category"><option>All events</option>${CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('')}</select></label><div class="grid" id="live-events"></div>`;
  drawEvents = () => { const visible = events.filter(e => matchesEvent(e, {search: main.querySelector('#live-search').value, category: main.querySelector('#live-category').value, period: 'all'})); main.querySelector('#live-events').innerHTML = visible.length ? visible.map(e => card(e)).join('') : empty('No events found', 'Try another search or category.'); };
  main.querySelector('#live-search').oninput = drawEvents; main.querySelector('#live-category').onchange = drawEvents; drawEvents();
}
function documentation() { main.innerHTML = documentationContent(config.contractAddress); }
async function init() {
  apiError = '';
  try {
    [events, config] = await Promise.all([api('/events'), api('/config')]);

  } catch (error) { apiError = error.message; }
  if (entryDrop && !location.hash) history.replaceState(null, '', `#drop/${entryDrop}`);
  await render();
}

document.addEventListener('click', event => {
  const collectionButton = event.target.closest('.collection-button:not(.wallet-button)');
  if (collectionButton) location.hash = 'collector/collection';
  if (event.target.closest('.wallet-button:not(#wallet)')) document.querySelector('#wallet').click();
});
all('.filter-tab').forEach(button => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  all('.filter-tab').forEach(tab => { tab.classList.toggle('active', tab === button); tab.setAttribute('aria-pressed', String(tab === button)); }); renderCards();
}));
$('#surprise-me')?.addEventListener('click', () => { if (events.length) showEvent(events[Math.floor(Math.random() * events.length)]); else toast('No published events available'); });
const menu = $('.menu-button');
menu?.addEventListener('click', () => {
  const opening = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(opening));
  menu.setAttribute('aria-label', opening ? 'Close navigation' : 'Open navigation');
  const mNav = $('#mobile-nav');
  if (mNav) mNav.hidden = !opening;
});
all('#mobile-nav a, #mobile-nav button').forEach(link => link.addEventListener('click', () => {
  menu?.setAttribute('aria-expanded', 'false');
  menu?.setAttribute('aria-label', 'Open navigation');
  const mNav = $('#mobile-nav');
  if (mNav) mNav.hidden = true;
}));

$('#create-button')?.addEventListener('click', () => { location.hash = 'issuer/studio'; });

window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#doc-')) window.scrollTo({top:0,behavior:'instant'}); render(); });

function connectionState() {
  const offline = !navigator.onLine;
  const stateNode = document.querySelector('#connection-state');
  if (stateNode) {
    stateNode.textContent = offline ? 'Offline · live records, attendance verification and blockchain writes require connectivity.' : 'Sepolia development network · collectibles are testnet assets';
    stateNode.hidden = !offline;
  }
  document.body.classList.toggle('offline', offline);
}
window.addEventListener('offline', connectionState);
window.addEventListener('online', () => { connectionState(); init(); });
connectionState();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; document.querySelector('#install-app').hidden = false; });
document.querySelector('#install-app')?.addEventListener('click', async () => { await installPrompt?.prompt(); document.querySelector('#install-app').hidden = true; installPrompt = null; });

init();

$('.coin-fallback').innerHTML = badgeSvg('flower', 'fallback', 'GOOD TIMES GROW HERE');
mountCoin($('#coin-stage'), $('#spin-coin'), $('#pause-motion'));
mountPress($('#press-art'), $('#press-button'), $('#press-readout'));
document.addEventListener('poap-motion', event => { $('#pause-motion').setAttribute('aria-pressed', String(event.detail)); $('#pause-motion').setAttribute('aria-label', event.detail ? 'Resume animations' : 'Pause animations'); });
