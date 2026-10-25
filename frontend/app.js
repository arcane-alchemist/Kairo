import { CATEGORIES, eventState, matchesEvent, profileStats, filterCollection } from './student-model.js';
import { claimEntry } from './claim-route.js';
import { BrowserProvider, Contract, getAddress, ZeroAddress } from 'ethers';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { ABI } from '../serverless/chain.js';

const main = document.querySelector('main');
const entryDrop = claimEntry(new URL(location.href));
const modal = document.querySelector('#modal');
const modalBody = document.querySelector('#modal-body');
let connectedWallet = '', activeChain = '', collectionRequest = 0;
let events = [], config = {}, session = null, category = 'All events', search = '', renderId = 0;
let stopCamera = null, ticketTimer = null, pageTimer = null, drawEvents = null, ticketView = 0;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const short = value => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '';
const date = seconds => new Date(seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const time = seconds => new Date(seconds * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const txLink = (hash, tokenId) => hash ? `https://sepolia.etherscan.io/tx/${encodeURIComponent(hash)}` : `https://sepolia.etherscan.io/token/${encodeURIComponent(config.contractAddress)}?a=${encodeURIComponent(tokenId || '')}`;
const safeImage = value => /^https:\/\//.test(value) || /^\/media\//.test(value) ? esc(value) : '';
let toastTimer;
function toast(message) { const node = document.querySelector('#toast'); node.textContent = message; node.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 5000); }
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

function collectibleArtwork(item) { return item.image && safeImage(item.image) ? artwork(item) : '<div class="missing-art"><span aria-hidden="true">✧</span><small>Artwork unavailable</small></div>'; }

function card(event, collection = false) {
  const open = event.rsvpDeadline > Date.now() / 1000 && (event.cap === 0 || event.remaining > 0);
  return `<article class="card"><div class="card-art">${collection ? collectibleArtwork(event) : artwork(event)}<span class="card-status">${collection ? 'Ownership verified' : eventState(event)}</span></div><div class="card-body"><div class="card-club">${esc(event.club)} · ${esc(event.category)}</div><h3>${esc(event.title)}</h3><span class="pill">${esc(collection ? event.role : event.claimMode === 'qr' ? 'QR collectible' : 'Staff check-in required')}</span><div class="card-info">◷ <span>${event.startsAt ? date(event.startsAt) : 'Event date unavailable'}</span></div><div class="card-info">⌖ <span>${esc(event.campus || event.venue)}</span></div><div class="card-bottom"><span>${collection ? `Token #${esc(event.tokenId)}` : event.claimMode === 'qr' ? 'Claim window applies' : open ? event.cap === 0 ? 'RSVP open · no cap' : `${esc(event.remaining)} places left` : 'RSVP closed'}</span><a class="card-link" href="#${collection ? `badge/${event.tokenId}/${collectionWallet}` : `drop/${event.id}`}">${collection ? 'View badge' : 'View event'} ↗</a></div></div></article>`;
}
function empty(title, text) { return `<div class="empty"><span aria-hidden="true">✧</span><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`; }
function bindCards() { main.querySelectorAll('[data-event]').forEach(button => button.onclick = () => showEvent(events.find(event => event.id === Number(button.dataset.event)))); }
function explore() {
  main.innerHTML = `<section class="hero"><div class="hero-copy"><div class="eyebrow">YOUR PRESENCE HAS A STORY</div><h1>Be there.<br>Make it <em>matter.</em></h1><p>Find your next community. Collect the moments you were part of, one verifiable keepsake at a time.</p><div class="hero-buttons"><a href="#events" class="button" id="browse">Discover events <span>↗</span></a><a href="#collection" class="button button-light">My collection</a></div><div class="hero-footnote"><span class="network-dot"></span> Built on Sepolia · No attendee minting fees</div></div><div class="hero-art" aria-label="Illustrative Kairo badges, not issued collectibles"><div class="orbit"></div><div class="orbit two"></div><div class="float-badge">${badge('tech', 'BUILD TOGETHER', 'IDEAS INTO IMPACT')}</div><div class="float-badge second">${badge('arts', 'CREATE SOMETHING', 'MAKE YOUR MARK')}</div><div class="float-badge third">${badge('community', 'FIND YOUR PEOPLE', 'GROW TOGETHER')}</div><span class="art-caption">A MOMENT. A MEMORY. YOURS.</span></div></section>
  <div class="benefits"><div class="benefit">◈ <strong>Discover your community</strong></div><div class="benefit">✓ <strong>Verify your participation</strong></div><div class="benefit">✧ <strong>Keep your story</strong></div></div>
  <section id="events"><div class="section-header"><div><div class="eyebrow">GO WHERE YOU GROW</div><h2>Discover events</h2><p>Big ideas, new connections, and a reason to show up.</p></div><label class="search"><span aria-hidden="true">⌕</span><input aria-label="Search events, campus, organizer or role" id="search" placeholder="Event, campus, organizer, role…" value="${esc(search)}"></label></div>
  <div class="chips" aria-label="Event categories">${['All events', ...CATEGORIES].map(name => `<button class="chip ${category === name ? 'active' : ''}" aria-pressed="${category === name}" data-category="${name}">${name}</button>`).join('')}</div>
  <div class="filter-bar"><label class="field">Event date<input type="date" id="event-date"></label><label class="field">Participation role<select id="event-role"><option value="">All roles</option>${[...new Set(events.flatMap(e => e.roles || ['Attendee']))].map(role => `<option>${esc(role)}</option>`).join('')}</select></label><label class="field">Show<select id="event-period"><option value="active">Upcoming & ongoing</option><option value="all">All events, including past</option></select></label><span id="event-count" role="status"></span></div><div id="event-grid" class="grid"></div></section>
  <div class="bottom-banner"><div><span class="banner-star">✳</span><div><h3>Bring your community together.</h3><p>Create something worth showing up for.</p></div></div><a class="button button-outline" href="#create">Create an event ↗</a></div>`;
  main.querySelector('#browse').onclick = event => { event.preventDefault(); main.querySelector('#events').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); };
  const draw = () => {
    const visible = events.filter(event => matchesEvent(event, { search, category, date: main.querySelector('#event-date').value, role: main.querySelector('#event-role').value, period: main.querySelector('#event-period').value })).sort((a,b) => a.startsAt - b.startsAt);
    main.querySelector('#event-count').textContent = `${visible.length} event${visible.length === 1 ? '' : 's'}`;
    const grid = main.querySelector('#event-grid'); grid.innerHTML = visible.length ? visible.map(event => card(event)).join('') : empty('No events found', 'Try another filter, include past events, or come back for the next campus moment.');
  };
  main.querySelector('#search').oninput = event => { search = event.target.value; draw(); };
  for (const id of ['event-date', 'event-role', 'event-period']) main.querySelector(`#${id}`).onchange = draw;
  main.querySelectorAll('[data-category]').forEach(button => button.onclick = () => { category = button.dataset.category; main.querySelectorAll('[data-category]').forEach(node => { node.classList.toggle('active', node === button); node.setAttribute('aria-pressed', node === button); }); draw(); });
  drawEvents = draw; draw();
}

function show(html) { stopCamera?.(); clearInterval(ticketTimer); modalBody.innerHTML = html; if (!modal.open) modal.showModal(); }
function close() { stopCamera?.(); clearInterval(ticketTimer); modal.close(); }
document.querySelector('.modal-close').onclick = close;
modal.addEventListener('close', () => { stopCamera?.(); clearInterval(ticketTimer); });
modal.addEventListener('click', event => { if (event.target === modal) { const r = modal.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } });
function showEvent(event) {
  if (!event) return;
  const current = Date.now() / 1000;
  const claimStatus = current < event.mintStartsAt ? 'Not open yet' : current > event.mintEndsAt ? 'Closed' : 'Within scheduled window · live eligibility checked on submission';
  show(`<div class="eyebrow">${esc(event.club)}</div><h2>${esc(event.title)}</h2><div class="event-cover" aria-label="Event cover artwork">${artwork(event)}</div><div class="dialog-art badge-preview" aria-label="Collectible badge preview">${artwork(event)}</div><p class="muted">${esc(event.description)}</p><p class="muted">◷ ${date(event.startsAt)} · ${time(event.startsAt)}<br>⌖ ${esc(event.venue)}<br>${event.cap === 0 ? 'Unlimited attendees' : `Limited to ${event.cap} attendees`} · RSVP closes ${date(event.rsvpDeadline)}</p><dl class="detail-grid"><div><dt>Organization</dt><dd>${esc(event.club)}<small>Organization identity not independently verified</small></dd></div><div><dt>Organizer wallet</dt><dd><code>${esc(short(event.organizer))}</code></dd></div><div><dt>Campus / venue</dt><dd>${esc(event.campus || event.venue)}</dd></div><div><dt>Eligibility</dt><dd>${esc(event.eligibility || 'See organizer instructions')}</dd></div><div><dt>Roles available</dt><dd>${esc((event.roles || ['Attendee']).join(' · '))}</dd></div><div><dt>Event ends</dt><dd>${date(event.endsAt)} · ${time(event.endsAt)}</dd></div><div><dt>Issuance / claim window</dt><dd>${esc(claimStatus)}<small>${date(event.mintStartsAt || event.startsAt)} ${time(event.mintStartsAt || event.startsAt)} – ${date(event.mintEndsAt || event.endsAt)} ${time(event.mintEndsAt || event.endsAt)}</small></dd></div></dl><ol class="journey"><li>RSVP registration</li><li>${event.claimMode === 'qr' ? 'Wallet claim (attendance not certified)' : 'Staff verifies attendance & role'}</li><li>Confirmed collectible issuance</li></ol><div id="event-rsvp-state" role="status"></div><div class="notice">${event.claimMode === 'qr' ? 'Anyone with this drop QR can claim during its mint window, one collectible per wallet. This does not certify physical attendance.' : 'Your collectible is issued after staff verify your attendance.'} It stays with its wallet permanently.</div>${session?.admin || session?.wallet === event.organizer ? '<button id="share-drop" class="button button-light full-width">Share drop QR ▦</button>' : ''}<button id="rsvp-start" class="button full-width" ${event.claimMode !== 'qr' && (event.rsvpDeadline < Date.now()/1000 || event.cap > 0 && event.remaining === 0) ? 'disabled' : ''}>${event.claimMode === 'qr' ? 'Connect wallet & mint on Sepolia ↗' : 'RSVP for this moment ↗'}</button>`);
  showRsvpStatus(event);
  const shareButton = modalBody.querySelector('#share-drop');
  if (shareButton) shareButton.onclick = () => shareDrop(event);
  modalBody.querySelector('#rsvp-start').onclick = () => event.claimMode === 'qr' ? claimForm(event) : rsvpForm(event);
}
async function shareDrop(event) {
  const url = `https://kairo-site-7fb.pages.dev/#drop/${event.id}`;
  show(`<h2>Drop #${esc(event.id)} · ${esc(event.title)}</h2><canvas id="drop-qr"></canvas><p class="muted">Scan to open this real drop. Sepolia testnet only. ${event.claimMode === 'qr' ? 'Anyone with the QR can claim during the mint window; this does not verify attendance.' : 'Staff attendance verification is required before minting.'}</p><a href="${url}" target="_blank" rel="noopener">${url}</a><button id="download-drop" class="button full-width">Download drop QR ↓</button>`);
  const canvas = modalBody.querySelector('#drop-qr');
  await QRCode.toCanvas(canvas, url, { width: 300, margin: 3, color: { dark: '#52319a' } });
  modalBody.querySelector('#download-drop').onclick = () => { const a = document.createElement('a'); a.href = canvas.toDataURL(); a.download = `kairo-drop-${event.id}.png`; a.click(); };
}
function claimForm(event, standalone = false) {
  let connectedForClaim = Boolean(session);
  const html = `<h2>${esc(event.title)}</h2><div class="notice">Use sepolia testnet only.</div><label id="claim-consent-row" class="checkbox" ${session ? '' : 'hidden'}><input id="claim-consent" type="checkbox"><span>I want this permanent collectible in my connected wallet. I understand ownership is public on Sepolia.</span></label><p id="claim-wallet" class="muted">${session ? `Connected: ${esc(session.wallet)}` : 'Connect your MetaMask wallet first.'}</p><button id="claim-connect" class="button button-light full-width" ${session ? 'hidden' : ''}>Connect MetaMask</button><button id="claim-mint" class="button full-width" ${session ? '' : 'hidden disabled'}>Mint POAP ↗</button>${!window.ethereum ? `<a class="button button-light full-width" href="https://link.metamask.io/dapp/kairo-site-7fb.pages.dev/?drop=${event.id}">Open this drop in MetaMask mobile ↗</a>` : ''}`;
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
  if (qrClaim) present(`<h2>${esc(event.title)}</h2><div id="mint-status" class="notice" role="status">Minting your POAP… Please wait for confirmation.</div>`);
  else {
  show(`<div class="eyebrow">YOU'RE ON THE LIST</div><h2>${esc(event?.title || 'Your event ticket')}</h2><div class="ticket"><canvas id="ticket-qr"></canvas><div><span class="pill" id="ticket-status">RSVP confirmed</span><p class="muted">${event?.claimMode === 'qr' ? 'Your wallet claim is saved. The relayer submits the actual Sepolia mint.' : 'Show this QR and your college ID at the venue. Staff confirm attendance before minting.'}</p><code>${esc(id)}</code></div></div><div id="mint-status" class="notice">Your collectible will be issued after check-in.</div><button id="download-ticket" class="button button-light button-small">Download ticket QR ↓</button>`);
  await QRCode.toCanvas(modalBody.querySelector('canvas'), `${location.origin}/#ticket/${id}`, { width: 170, margin: 1, color: { dark: '#52319a' } });
  modalBody.querySelector('#download-ticket').onclick = () => { const a = document.createElement('a'); a.href = modalBody.querySelector('canvas').toDataURL(); a.download = `kairo-ticket-${id}.png`; a.click(); };
  }
  const refresh = async () => {
    if (refreshing || view !== ticketView || (!qrClaim && !modal.open) || !container.querySelector('#mint-status')) return;
    refreshing = true;
    try {
      const row = await api(`/tickets/${id}`);
      if (view !== ticketView || !container.querySelector('#mint-status')) return;
      if (row.status === 'confirmed') {
        clearInterval(ticketTimer);
        present(`<section class="mint-success" role="status"><div class="success-spark" aria-hidden="true">✧</div><h2>Woo Hoo!</h2><span class="pill green">✓ POAP Minted</span>${event?.image ? `<div class="dialog-art">${artwork(event)}</div>` : ''}<h3>${esc(event?.title || 'Your POAP')}</h3><p>Your POAP is now in your wallet.</p><p><a class="button" href="${location.origin}/#collection/${encodeURIComponent(row.wallet)}" target="_blank" rel="noopener">View my collection ↗</a></p><a class="button button-light" href="${txLink(row.tx_hash, row.token_id)}" target="_blank" rel="noopener">View on Sepolia ↗</a><p class="muted">To display it in MetaMask, select Sepolia → NFTs → Import NFT.<br>Contract: <code>${esc(config.contractAddress)}</code><br>Token ID: <strong>${esc(row.token_id)}</strong></p></section>`);
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
  if (!window.ethereum) throw Error('Open in an Ethereum wallet browser or install a browser wallet to organize events. Attendees can RSVP without connecting.');
  const provider = new BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  if (await window.ethereum.request({ method: 'eth_chainId' }) !== '0xaa36a7') {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] });
  }
  const signer = await new BrowserProvider(window.ethereum).getSigner();
  const wallet = await signer.getAddress();
  const challenge = await post('/auth/challenge', { wallet });
  const signature = await signer.signMessage(challenge.message);
  const selected = await window.ethereum.request({ method: 'eth_accounts' });
  if (selected[0]?.toLowerCase() !== wallet.toLowerCase()) throw Error('Wallet changed during sign-in. Connect again.');
  await post('/auth/verify', { id: challenge.id, signature });
  session = await api('/auth/me');
  connectedWallet = session.wallet;
  document.querySelector('#wallet').textContent = short(session.wallet);
  toast('Signed in. No transaction or gas was required.');
  return signer;
}
async function connectWallet() {
  if (!window.ethereum) throw Error('Open Kairo in an EVM wallet browser or install an injected EVM wallet. Never share your seed phrase.');
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  connectedWallet = accounts[0] ? getAddress(accounts[0]) : '';
  await updateNetwork();
  document.querySelector('#wallet').textContent = short(connectedWallet) || 'Connect wallet ↗';
}
async function updateNetwork() {
  if (window.ethereum) activeChain = await window.ethereum.request({ method: 'eth_chainId' });
  const node = document.querySelector('#wallet-network');
  node.textContent = !connectedWallet ? 'Sepolia testnet' : activeChain === '0xaa36a7' ? 'Sepolia connected' : 'Wrong network · switch to Sepolia';
  node.classList.toggle('warning', Boolean(connectedWallet && activeChain !== '0xaa36a7'));
}
document.querySelector('#wallet-network').onclick = event => busy(event.target, async () => {
  if (!connectedWallet) await connectWallet();
  if (activeChain !== '0xaa36a7') await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] });
  await updateNetwork();
});
document.querySelector('#wallet').onclick = () => busy(document.querySelector('#wallet'), async () => {
  if (!connectedWallet) { await connectWallet(); await render(); return; }
  show(`<h2>Your wallet</h2><code class="wallet-address">${esc(connectedWallet)}</code><p class="muted">${activeChain === '0xaa36a7' ? 'Sepolia testnet' : 'Wrong network. Use the network button to request a safe switch.'}</p><a class="button" id="wallet-collection" href="#collection/${connectedWallet}">View my collection ↗</a><a class="button button-light" href="#profile/${connectedWallet}">Participation profile</a><p class="muted">Viewing your collection needs no signature. Sign in only to claim, cancel an RSVP, or manage events.</p><button id="wallet-sign-in" class="button button-light">${session ? 'Sign out of app' : 'Sign in with a message'}</button>`);
  modalBody.querySelector('#wallet-sign-in').onclick = event => busy(event.target, async () => {
    if (session) { await post('/auth/logout', {}); session = null; } else await connect();
    close(); render();
  });
});
if (window.ethereum) {
  window.ethereum.on?.('accountsChanged', accounts => {
    session = null; connectedWallet = accounts[0] || ''; collectionRequest++;
    document.querySelector('#wallet').textContent = short(connectedWallet) || 'Connect wallet ↗';
    close(); updateNetwork().catch(() => {}); render();
  });
  window.ethereum.on?.('chainChanged', () => { close(); updateNetwork().catch(() => {}); });
}

async function signerOnSepolia() {
  if (!session) await connect();
  const provider = new BrowserProvider(window.ethereum);
  if ((await provider.getNetwork()).chainId !== 11155111n) await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] });
  const signer = await new BrowserProvider(window.ethereum).getSigner();
  if (await signer.getAddress() !== session.wallet) throw Error('Sign in with the currently connected wallet');
  return signer;
}

let collectionWallet = '', collectionItems = [];
function savedTickets() { try { return JSON.parse(localStorage.getItem('kairo-tickets') || '[]'); } catch { return []; } }
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
  const addressFromRoute = location.hash.split('/')[profile ? 1 : location.hash.startsWith('#badge/') ? 2 : 1];
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
      grid.innerHTML = rows.length ? `<div class="grid">${rows.map(row => card(row, true)).join('')}</div>` : collectionItems.length ? empty('No matching collectibles', 'Try another search or filter.') : complete && total === 0 ? `${empty('Your first moment is ahead of you', 'Discover an event, participate, and keep a collectible from the experience.')}<a class="button" href="#explore">Discover events ↗</a>` : empty('Your collection is still being checked', 'Ownership is checked on-chain. Records may take a moment to load.');
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
      content.innerHTML = `<div class="stats"><div class="stat"><small>Registered</small><strong>${rows.length}</strong></div><div class="stat"><small>Checked in</small><strong>${rows.filter(r => r.checked_in_at).length}</strong></div><div class="stat"><small>Collectibles issued</small><strong>${rows.filter(r => r.status === 'confirmed').length}</strong></div></div><div class="form-actions"><button id="scan-ticket" class="button">▣ Scan attendee ticket</button><button id="refresh-attendees" class="button button-light">Refresh ↻</button><button id="manage-staff" class="button button-light">Event permissions</button></div><div class="table-wrap"><table><thead><tr><th>Attendee wallet</th><th>Attendance</th><th>Collectible</th><th>Action</th></tr></thead><tbody>${rows.length ? rows.map(row => `<tr><td title="${esc(row.wallet)}">${short(row.wallet)}</td><td>${row.checked_in_at ? 'Verified' : 'Not checked in'}</td><td><span class="pill ${row.status === 'confirmed' ? 'green' : ''}">${esc(row.status || 'Not issued')}</span></td><td>${row.checked_in_at ? row.status === 'failed' ? `<button class="card-link" data-retry="${esc(row.id)}">Retry mint ↻</button>` : row.tx_hash ? `<a class="card-link" href="${txLink(row.tx_hash, row.token_id)}" target="_blank" rel="noopener">Transaction ↗</a>` : 'Queued' : `<button class="card-link" data-check-in="${esc(row.id)}">Check in ↗</button>`}</td></tr>`).join('') : '<tr><td colspan="4">No RSVPs yet. Share the public event page with attendees.</td></tr>'}</tbody></table></div><div class="notice">Check college ID and the attendee’s destination wallet in person. A QR alone does not prove physical attendance or identity.</div>`;
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

async function scanQR(onRead, preserveForm = false) {
  const saved = preserveForm ? modalBody.querySelector('form') : null;
  const container = document.createElement('div'); container.innerHTML = '<h2>Scan a QR code</h2><video class="camera" autoplay playsinline muted></video><p class="muted">Point the camera at the QR. You can also paste its contents below.</p><label class="field">QR contents<input id="qr-value" autocomplete="off"></label><div class="form-actions"><button id="qr-use" class="button">Use this code</button><button id="qr-cancel" class="button button-light">Cancel</button></div><p id="camera-status" class="muted"></p>';
  const previous = document.createDocumentFragment(); while (modalBody.firstChild) previous.appendChild(modalBody.firstChild);
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

function createEventPage() {
  main.innerHTML = `<div class="eyebrow">CREATE A LITTLE CAMPUS HISTORY</div><h1 class="page-title">Make a moment worth keeping.</h1><p class="lead">Your artwork. Your community. A collectible for everyone who shows up.</p><div class="notice">The college admin publishes events. Your organizer and minting permissions are scoped to each event. Artwork and metadata freeze when the event is created.</div><form id="event-form" class="panel"><div class="form-grid"><label class="field">Event title<input name="title" required minlength="3" maxlength="100" placeholder="Your event name"></label><label class="field">Club or community<input name="club" required minlength="2" maxlength="80" placeholder="The Coding Club"></label><label class="field field-full">Description<textarea name="description" required minlength="3" maxlength="1000" placeholder="What makes this moment special?"></textarea></label><label class="field">Category<select name="category">${CATEGORIES.map(name => `<option>${name}</option>`).join('')}</select></label><label class="field">Campus<input name="campus" maxlength="100" placeholder="Campus name"></label><label class="field">Participation roles<input name="roles" value="Attendee" maxlength="320"><small>Comma-separated. Staff must verify each requested role.</small></label><label class="field field-full">Eligibility<textarea name="eligibility" maxlength="500">Open to campus participants with a college ID</textarea></label><label class="field">Venue<input name="venue" required minlength="2" maxlength="150" placeholder="Innovation Lab, Block A"></label><label class="field">Event starts<input name="starts" type="datetime-local" required></label><label class="field">Event ends<input name="eventEnds" type="datetime-local" required></label><label class="field">Minting opens<input name="mintStarts" type="datetime-local" required></label><label class="field">Minting closes<input name="ends" type="datetime-local" required><small>Allow time after the event for queued mints to confirm.</small></label><label class="field">RSVP deadline<input name="deadline" type="datetime-local" required></label><label class="field">Distribution<select name="claimMode"><option value="attendance">Staff verifies attendance</option><option value="qr">Anyone with the QR can claim</option></select><small>QR claims do not certify physical attendance.</small></label><label class="field">Attendee capacity<input name="cap" type="number" min="0" max="10000" required value="50"><small>0 means unlimited attendees.</small></label><label class="field">Organizer wallet<input name="organizer" required placeholder="0x…" value="${esc(session?.wallet || '')}"><small>Can manage event staff and pause issuance.</small></label><label class="field field-full">Collectible artwork<input name="artwork" required type="file" accept="image/png,image/jpeg"><small>PNG or JPEG · up to 2 MB. Your uploaded image becomes the collectible. No logo or text is added.</small></label><div class="field-full art-preview"><img id="art-preview" alt="Collectible artwork preview"></div></div><label class="checkbox"><input type="checkbox" required><span>I have permission to use this artwork. I checked the details and understand that the collectible metadata cannot be edited after publishing.</span></label><div class="form-actions"><button class="button" id="publish-button">Publish event ↗</button><button type="button" class="button button-light" id="generate-poap">Generate POAP ✧</button></div><div id="publish-status" class="submission-progress" role="status"></div></form>`;
  const form = main.querySelector('form'); let image;
  main.querySelector('#generate-poap').onclick = () => {
    if (!image) { toast('Upload your POAP artwork first'); return; }
    main.querySelector('#art-preview').src = image;
    toast('POAP preview ready. Publish the event to create its Drop ID.');
  };
  form.elements.artwork.onchange = async () => {
    const file = form.elements.artwork.files[0]; if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) { toast('Choose a PNG or JPEG smaller than 2 MB'); return; }
    image = null; const reader = new FileReader(); reader.onload = () => { image = reader.result; main.querySelector('#art-preview').src = image; }; reader.readAsDataURL(file);
  };
  const pendingKey = 'kairo-pending-event';
  const pending = JSON.parse(localStorage.getItem(pendingKey) || 'null');
  if (pending) {
    main.querySelector('#publish-status').innerHTML = `A previous event transaction needs to finish publication. <button type="button" id="resume-event" class="card-link">Resume publishing ↗</button>`;
    main.querySelector('#resume-event').onclick = event => busy(event.target, () => finishPublication(pending));
  }
  async function finishPublication(draft) {
    const signer = await signerOnSepolia(); const contract = new Contract(config.contractAddress, ABI, signer);
    const receipt = await signer.provider.waitForTransaction(draft.hash, 2, 120000);
    if (!receipt || receipt.status !== 1) throw Error('Transaction is pending or failed. Check your wallet and retry.');
    const log = receipt.logs.map(log => { try { return contract.interface.parseLog(log); } catch { return null; } }).find(log => log?.name === 'EventCreated');
    if (!log) throw Error('EventCreated log missing');
    await post('/events', { ...draft.details, id: Number(log.args.eventId) });
    localStorage.removeItem(pendingKey); events = await api('/events'); toast(`POAP published · Drop #${Number(log.args.eventId)}`); location.hash = `drop/${Number(log.args.eventId)}`;
  }
  form.onsubmit = event => { event.preventDefault(); busy(main.querySelector('#publish-button'), async () => {
    if (localStorage.getItem(pendingKey)) throw Error('Resume the previous event before publishing another');
    if (location.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname)) { show('<h2>Publish your POAP on the live app</h2><p>Artwork must have a public URL because collectible metadata is frozen on Sepolia.</p><a class="button" href="https://kairo-site-7fb.pages.dev/#create" target="_blank" rel="noopener">Open live event creator ↗</a>'); return; }
    const signer = await signerOnSepolia();
    if (!session.admin) throw Error('This wallet is not the college admin. Ask the admin to publish your event.');
    const fields = form.elements; const starts = Math.floor(new Date(fields.starts.value).getTime()/1000);
    const ends = Math.floor(new Date(fields.ends.value).getTime()/1000); const deadline = Math.floor(new Date(fields.deadline.value).getTime()/1000);
    const eventEnds = Math.floor(new Date(fields.eventEnds.value).getTime()/1000);
    const mintStarts = Math.floor(new Date(fields.mintStarts.value).getTime()/1000);
    if (!image) throw Error('Upload your POAP artwork first');
    if (starts >= eventEnds || mintStarts < starts || mintStarts >= ends || ends < eventEnds || deadline > starts) throw Error('Event end must follow its start; minting must open at or after event start and close after event end; RSVP must close before event start');
    const roles = [...new Set(fields.roles.value.split(',').map(role => role.trim()).filter(Boolean))];
    if (roles.length < 1 || roles.length > 8 || roles.some(role => role.length > 40)) throw Error('Enter 1–8 participation roles, up to 40 characters each, before publishing');
    const organizer = getAddress(fields.organizer.value.trim()), issuer = getAddress(config.issuerAddress);
    if (!config.issuerAddress || issuer !== getAddress(config.issuerAddress)) throw Error('Use the configured sponsored minting wallet');
    const status = main.querySelector('#publish-status'); status.textContent = '1 / 3 · Saving your artwork and frozen metadata…';
    const media = await post('/artwork', { name: fields.title.value.trim(), description: fields.description.value.trim(), image });
    const details = { title: fields.title.value.trim(), description: fields.description.value.trim(), club: fields.club.value.trim(), category: fields.category.value,
      campus: fields.campus.value.trim(), eligibility: fields.eligibility.value.trim(), roles,
      claimMode: fields.claimMode.value, venue: fields.venue.value.trim(), eventStartsAt: starts, eventEndsAt: eventEnds, rsvpDeadline: deadline, ...media };
    status.textContent = '2 / 3 · Confirm event creation in your wallet. This transaction uses Sepolia test ETH.';
    const contract = new Contract(config.contractAddress, ABI, signer);
    const tx = await contract.createEvent(media.uri, fields.cap.value === '0' ? 18446744073709551615n : BigInt(fields.cap.value), mintStarts, ends, organizer, issuer);
    const draft = { hash: tx.hash, details }; localStorage.setItem(pendingKey, JSON.stringify(draft));
    status.textContent = '3 / 3 · Waiting for two confirmations. You can resume if you close this page.';
    await finishPublication(draft);
  }); };
}
function about() {
  main.innerHTML = `<div class="eyebrow">A LITTLE PROOF YOU WERE THERE</div><h1 class="page-title">Show up. Take the memory with you.</h1><p class="lead">Kairo turns college events into a personal collection of moments. A collectible is a keepsake, not a ticket for resale.</p><div class="about-steps"><section class="panel"><span class="step-number">01</span><h3>Find your people</h3><p>Discover an event and RSVP with your student ID and Ethereum wallet address. No wallet connection required.</p></section><section class="panel"><span class="step-number">02</span><h3>Be there for it</h3><p>Bring your college ID and ticket QR. Event staff verify you in person and confirm your wallet destination.</p></section><section class="panel"><span class="step-number">03</span><h3>Keep the moment</h3><p>Your collectible is minted after check-in. The organizer sponsors minting gas, and the NFT stays with its wallet.</p></section></div><div class="panel"><h3>Yours forever means a few things.</h3><p class="muted">Collectibles cannot be transferred or burned, including by the admin. Check your wallet address carefully. A lost wallet cannot be repaired by moving the token. Event names and ownership are public on Sepolia; your student ID stays off-chain.</p><p class="muted">This is a testnet project. Sepolia collectibles are development assets, not permanent academic credentials. Serverless hosting reduces idle infrastructure; it does not remove blockchain gas fees.</p>${config.contractAddress ? `<a class="contract-link" href="https://sepolia.etherscan.io/address/${esc(config.contractAddress)}" target="_blank" rel="noopener">View Kairo contract ↗</a>` : ''}</div>`;
}
async function render() {
  clearInterval(pageTimer); drawEvents = null;
  const version = ++renderId; const route = location.hash.slice(1).split('/')[0] || 'explore';
  document.querySelectorAll('[data-nav]').forEach(link => { const active = link.dataset.nav === route || route === 'badge' && link.dataset.nav === 'collection' || route === 'drop' && link.dataset.nav === 'explore'; link.classList.toggle('active', active); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  if (entryDrop) {
    document.body.classList.add('claim-only');
    const event = events.find(event => event.id === entryDrop);
    if (event?.claimMode === 'qr') claimForm(event, true);
    else main.innerHTML = empty('Claim unavailable', 'This collectible is not available for QR minting.');
    return;
  }
  if (route === 'drop') {
    explore();
    const id = Number(location.hash.split('/')[1]); const event = events.find(e => e.id === id);
    if (event) showEvent(event); else toast('This drop was not found');
    return;
  }
  if (route === 'ticket') {
    const id = location.hash.split('/')[1];
    if (!/^[a-f0-9-]{36}$/.test(id || '')) { toast('Invalid ticket link'); location.hash = 'tickets'; return; }
    tickets();
    try { const row = await api(`/tickets/${id}`); await showTicket(id, events.find(e => e.id === row.event_id)); } catch (error) { toast(error.message); }
    return;
  }
  if (route === 'collection' || route === 'badge' || route === 'profile') await collection(version, route === 'profile');
  else if (route === 'tickets') tickets();
  else if (route === 'organizer') await organizer(version);
  else if (route === 'create') createEventPage();
  else if (route === 'about') about();
  else explore();
  pageTimer = setInterval(async () => {
    if (document.hidden || modal.open || version !== renderId) return;
    try {
      events = await api('/events');
      if (version !== renderId) return;
      if (route === 'explore') drawEvents?.();
      if (route === 'organizer') {
        const select = main.querySelector('#staff-event');
        if (select?.value) await select.onchange();
      }
    } catch { document.querySelector('#connection-state').textContent = 'Live refresh unavailable · showing last loaded events'; }
  }, 15000);
}

document.addEventListener('error', event => {
  const image = event.target;
  if (image.tagName !== 'IMG' || !image.closest('.card-art, .dialog-art, .event-cover')) return;
  const fallback = document.createElement('span'); fallback.className = 'artwork-fallback';
  fallback.innerHTML = badge('tech', 'KAIRO COLLECTIBLE', 'ARTWORK UNAVAILABLE');
  image.replaceWith(fallback);
}, true);
window.addEventListener('hashchange', () => { close(); render(); });
async function init() {
  main.innerHTML = '<div class="loading">Finding your campus moments…</div>';
  {
    try {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' }); connectedWallet = accounts[0] || '';
        document.querySelector('#wallet').textContent = short(connectedWallet) || 'Connect wallet ↗'; await updateNetwork();
      }
      [events, config] = await Promise.all([api('/events'), api('/config')]);
      try {
        const saved = await api('/auth/me');
        const accounts = window.ethereum ? await window.ethereum.request({ method: 'eth_accounts' }) : [];
        if (accounts[0]?.toLowerCase() === saved.wallet.toLowerCase()) {
          session = saved; document.querySelector('#wallet').textContent = short(session.wallet);
        }
      } catch { session = null; }
    } catch (error) {
      main.innerHTML = `${empty('Let’s get your campus connected', error.message)}<div class="form-actions"><button class="button button-light" id="retry-api">Try again</button></div>`;
      main.querySelector('#retry-api').onclick = init; return;
    }
  }
  const requestedDrop = new URL(location.href).searchParams.get('drop');
  if (!location.hash && /^[1-9]\d*$/.test(requestedDrop || '')) history.replaceState(null, '', '#drop/' + requestedDrop);
  await render();

}
function connectionState() {
  const offline = !navigator.onLine;
  document.querySelector('#connection-state').textContent = offline ? 'Offline · live records, attendance verification and blockchain writes require connectivity.' : 'Sepolia development network · collectibles are testnet assets';
  document.body.classList.toggle('offline', offline);
}
window.addEventListener('offline', connectionState);
window.addEventListener('online', () => { connectionState(); init(); });
connectionState();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; document.querySelector('#install-app').hidden = false; });
document.querySelector('#install-app').onclick = async () => { await installPrompt?.prompt(); document.querySelector('#install-app').hidden = true; installPrompt = null; };
document.querySelector('#copyright-year').textContent = new Date().getFullYear();
init();
