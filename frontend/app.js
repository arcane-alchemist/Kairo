import { createApiClient } from './api.js';
import { csv } from '../serverless/claims.js';
import { eventState, matchesEvent, profileStats, filterCollection, groupCollection } from './student-model.js';
import { claimEntry } from './claim-route.js';
import { BrowserProvider, getAddress } from 'ethers';
import QRCode from 'qrcode';
import { badgeSvg } from './art.js';
import { mountCoin } from './scene.js';
import { mountPress } from './press.js';
import { mountNative } from './native.js';
import { metaMaskWallet } from './wallet.js';
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
let events = [], config = {}, session = null, renderId = 0;
let ticketTimer = null, pageTimer = null, drawEvents = null, ticketView = 0;
let apiError = '';
let walletRevision = 0, logoutRequest = Promise.resolve(), signInRequest = Promise.resolve();
const walletClient = metaMaskWallet(window, async (event, value) => {
  if (event === 'accountsChanged' && typeof value?.[0] === 'string' && value[0].toLowerCase() === connectedWallet.toLowerCase()) return;
  if (event === 'chainChanged') { activeChain = value; walletHeader(); connectionState(); return; }
  const revision = ++walletRevision;
  session = null; connectedWallet = ''; collectionRequest++;
  logoutRequest = post('/auth/logout', {}).catch(() => {});
  walletHeader(); close(); await logoutRequest;
  if (revision !== walletRevision) return;
  if (event === 'accountsChanged' && value?.[0]) {
    try { connectedWallet = getAddress(value[0]); walletHeader(); await connect(true); } catch (error) { if (revision === walletRevision) { session = null; connectedWallet = ''; walletHeader(); toast(error.message); } }
  } else { await walletClient.disconnect(); activeChain = ''; }
  await render();
});
mountNative(window, document);

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const short = value => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '';
const date = seconds => new Date(seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const time = seconds => new Date(seconds * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const txLink = (hash, tokenId, contractAddress = config.contractAddress) => {
  try {
    const url = new URL(hash ? `/tx/${encodeURIComponent(hash)}` : `/token/${encodeURIComponent(contractAddress || '')}?a=${encodeURIComponent(tokenId || '')}`, config.explorerUrl);
    return url.protocol === 'https:' && !url.username && !url.password ? esc(url.href) : '';
  } catch { return ''; }
};
const safeImage = value => {
  try {
    if (typeof value !== 'string' || /[\u0000-\u0020]/.test(value) || !/^(https?:\/\/|\/media\/)/.test(value)) return '';
    const url = new URL(value, location.origin);
    const ownedMedia = url.origin === location.origin && url.pathname.startsWith('/media/');
    if (url.username || url.password || (url.protocol !== 'https:' && !ownedMedia)) return '';
    if (value.startsWith('/media/') && (url.origin !== location.origin || !url.pathname.startsWith('/media/'))) return '';
    return esc(url.href);
  } catch { return ''; }
};

let toastTimer;
function toast(message) {
  const node = document.querySelector('#toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('visible', 'show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('visible', 'show'), 3500);
}

const requestApi = createApiClient({fetchRequest:(...args) => fetch(...args)});
function retryNotice(error, retry) {
  const node = document.querySelector('#request-error');
  node.hidden = false; node.replaceChildren();
  const message = document.createElement('span'); message.textContent = error.message;
  const button = document.createElement('button'); button.className = 'button button-small'; button.textContent = 'Retry';
  button.onclick = async () => { node.hidden = true; await retry(); };
  node.append(message,button);
}
async function api(path, options = {}) {
  try { return await requestApi(path, options); }
  catch (error) {
    if (error.status === 401 && session) {
      session = null; connectedWallet = ''; activeChain = ''; walletRevision++; collectionRequest++; walletHeader();
    }
    if (!options.quiet && error.status !== 401 && (!options.method || options.method === 'GET')) retryNotice(error,init);
    throw error;
  }
}
const post = (path, data) => api(path, { method: 'POST', body: JSON.stringify(data) });

async function busy(button, action) {
  const text = button.textContent; button.disabled = true; button.textContent = 'One moment…';
  try { return await action(); } catch (error) { retryNotice(error,() => busy(button,action)); toast(error.code === 4001 || error.code === 'ACTION_REJECTED' ? 'Request cancelled. You can try again.' : error.code === -32002 ? 'A MetaMask request is already open. Review it in your wallet.' : error.message || 'Something went wrong'); }
  finally { button.disabled = false; button.textContent = button.id === 'wallet' && (connectedWallet || session?.wallet) ? short(connectedWallet || session.wallet) : text; if (button.id === 'wallet-network') walletHeader(); }
}

function artwork(event) { return event.image && safeImage(event.image) ? `<img src="${safeImage(event.image)}" alt="${esc(event.title)} collectible" loading="lazy">` : '<div class="missing-art"><span aria-hidden="true">✧</span><small>No artwork yet</small></div>'; }
function collectibleArtwork(item) { if (item.animationUrl && safeImage(item.animationUrl)) return `<video class="collectible-video" src="${safeImage(item.animationUrl)}" poster="${safeImage(item.image)}" controls playsinline preload="metadata" aria-label="${esc(item.title)} video collectible"></video>`; return item.image && safeImage(item.image) ? artwork(item) : '<div class="missing-art"><span aria-hidden="true">✧</span><small>Artwork unavailable</small></div>'; }

function card(event, collection = false) {
 return `<article class="card"><div class="card-art">${collection?collectibleArtwork(event):artwork(event)}<span class="card-status">${collection?'Ownership verified':eventState(event)}</span></div><div class="card-body"><div class="card-club">${esc(event.club)} · ${esc(event.category)}</div><h3>${esc(event.title)}</h3><span class="pill">${esc(collection?event.role:(event.roles||['Attendee']).join(' · '))}</span>${event.verified?'<span class="pill green">Verified event</span>':''}<div class="card-info">${event.startsAt?date(event.startsAt):'Date unavailable'}</div><div class="card-info">${esc(event.venue)}</div><div class="card-bottom"><span>${collection?`Token #${esc(event.tokenId)}`:event.paused?'Minting paused':'Mint window applies'}</span><a class="card-link" href="#${collection?`badge/${esc(event.tokenId)}/${esc(collectionWallet)}`:`drop/${esc(event.id)}`}">${collection?'View badge':'View event'} ↗</a></div></div></article>`;
}
function empty(title, text) { return `<div class="empty"><span aria-hidden="true">✧</span><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`; }

function show(html) { clearInterval(ticketTimer); modalBody.innerHTML = html; if (!modal.open) modal.showModal(); }
function close() { clearInterval(ticketTimer); modal.close(); }
all('.modal-close').forEach(button => button.addEventListener('click', () => { const dialog = button.closest('dialog'); if (dialog === modal) close(); else dialog?.close(); }));
modal?.addEventListener('close', () => { if (!modal.open) clearInterval(ticketTimer); });
modal?.addEventListener('click', event => { if (event.target === modal) { const r = modal.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } });

function claimForm(event, standalone = true, redeemToken = '') {
 const html=`<h2>${esc(event.title)}</h2><p>Role: <strong>${esc((event.roles||['Attendee'])[0])}</strong></p><p>${esc(event.description)}</p><p>Mint window: ${date(event.mintStartsAt)} ${time(event.mintStartsAt)} – ${date(event.mintEndsAt)} ${time(event.mintEndsAt)}</p><div class="notice">${redeemToken?'A link works for whoever opens it first.':'A QR scanned live and shared cannot be distinguished from one scanned in person.'}</div><label id="claim-consent-row" class="checkbox" ${session?'':'hidden'}><input id="claim-consent" type="checkbox"><span>I want this permanent, public POAP in my connected MetaMask wallet.</span></label><p id="claim-wallet">${session?`Connected: ${esc(session.wallet)}`:'Connect MetaMask to sign in.'}</p><button id="claim-connect" class="button" ${session?'hidden':''}>Connect wallet</button><button id="claim-mint" class="button" ${session?'':'hidden disabled'}>Mint POAP ↗</button>`;
 drawEvents=null; main.innerHTML=`<section class="panel claim-panel">${html}</section>`;
 main.querySelector('#claim-connect').onclick=headerConnect;
 const button=main.querySelector('#claim-mint');button.onclick=()=>busy(button,async()=>{
  if(!session)throw Error('Connect your wallet first');
  if(!main.querySelector('#claim-consent').checked)throw Error('Confirm permanent collectible consent first');
  const authenticated=await api('/auth/me');if(authenticated.wallet!==session.wallet)throw Error('Wallet session changed. Connect again.');
  await signerOnSepolia();
  const qr=new URL(location.href).searchParams.get('qr');
  const result=await post(redeemToken?'/redeem/claim':`/events/${event.id}/claim`,{permanentConsent:true,...(!redeemToken?{qr:qr||''}:{token:redeemToken})});
  location.hash=`claim/${result.ticket}/${event.id}`;
 });
}
async function showTicket(id,event) {
 const view=++ticketView;drawEvents=null;close();
 main.innerHTML=`<section class="panel claim-panel"><h2>${esc(event?.title||'Your POAP')}</h2><div id="mint-status" role="status">Minting your POAP… Waiting for confirmation.</div></section>`;
 const refresh=async()=>{
  try {
   const row=await api(`/claims/${id}`);
   if(view!==ticketView||!main.querySelector('#mint-status'))return;
   if(row.status==='confirmed') {
    clearInterval(ticketTimer);
    main.innerHTML=`<section class="mint-success" role="status"><h2>Woo hoo, POAP minted!</h2>${event?.image?`<div class="dialog-art">${artwork(event)}</div>`:''}<h3>${esc(event?.title||'Your POAP')}</h3><p>${esc(event?.description||'')}</p><p>Your token ID: <strong>${esc(row.token_id)}</strong></p><p>Your POAP is already in your wallet. Open it in Gallery for its MetaMask import details.</p><a class="button" href="#collector/collection">View my collection ↗</a><a class="button button-light" href="${txLink(row.tx_hash,row.token_id)}" target="_blank" rel="noopener">View on Etherscan ↗</a></section>`;
   } else main.querySelector('#mint-status').textContent=row.status==='failed'?'Mint failed. Ask the organizer to retry.':row.status==='submitted'?'Awaiting blockchain confirmation…':'Queued for sponsored minting…';
  } catch(error){if(view===ticketView&&main.querySelector('#mint-status'))main.querySelector('#mint-status').textContent=error.message;}
 };
 await refresh();if(view===ticketView&&main.querySelector('#mint-status'))ticketTimer=setInterval(refresh,15000);
}
function walletHeader() {
  const adminProfile=document.querySelector('#admin-profile');
  if(adminProfile)adminProfile.hidden=!session?.admin;
  const welcome = document.querySelector('#wallet-welcome');
  if (welcome) welcome.hidden = Boolean(session);
  document.querySelector('#wallet').textContent = session ? short(session.wallet) : 'Connect wallet';
  const node = document.querySelector('#wallet-network');
  const wrong = Boolean(activeChain && activeChain !== chainHex());
  node.hidden = !session && !connectedWallet;
  node.textContent = wrong ? `Switch to ${config.chainName}` : activeChain ? config.chainName : 'Check network';
  node.disabled = Boolean(activeChain) && !wrong;
  node.classList.toggle('wrong-network', wrong);
}
function chainHex() {
  if (!Number.isSafeInteger(config.chainId) || config.chainId <= 0) throw Error('Wallet network configuration is unavailable. Reload and try again.');
  return `0x${config.chainId.toString(16)}`;
}
async function switchNetwork() {
  const provider = walletClient.provider;
  if (await provider.request({method:'eth_chainId'}) !== chainHex()) {
    try { await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:chainHex()}]}); }
    catch (error) {
      if (error.code !== 4902 || !config.walletNetwork) throw error;
      await provider.request({method:'wallet_addEthereumChain',params:[config.walletNetwork]});
      await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:chainHex()}]});
    }
  }
  await updateNetwork();
  if (activeChain !== chainHex()) throw Error(`Switch to ${config.chainName} in your wallet to continue.`);
}
function headerConnect() {
  close();
  const button = document.querySelector('#wallet');
  if (!button.disabled) return button.onclick();
}
async function connect(accountChanged = false) {
  if (!accountChanged) await connectWallet();
  const revision = walletRevision;
  const previous = signInRequest;
  let release;
  signInRequest = new Promise(resolve => { release = resolve; });
  // Serialize verification so an older cookie cannot replace a switched account.
  try {
    await previous;
    if (revision !== walletRevision) throw Error('Wallet changed before sign-in. Try again.');
    await switchNetwork();
    await logoutRequest;
    document.querySelector('#wallet').textContent = 'Sign in your wallet…';
    const signer = await new BrowserProvider(walletClient.provider).getSigner(connectedWallet);
    const wallet = await signer.getAddress();
    const challenge = await post('/auth/challenge', {wallet});
    const signature = await signer.signMessage(challenge.message);
    const selected = await walletClient.provider.request({method:'eth_accounts'});
    if (await walletClient.provider.request({method:'eth_chainId'}) !== chainHex()) throw Error('Network changed during sign-in. Switch networks and try again.');
    if (revision !== walletRevision || selected[0]?.toLowerCase() !== wallet.toLowerCase()) throw Error('Wallet changed during sign-in. Use Connect wallet again.');
    await post('/auth/verify', {id:challenge.id, signature});
    if (revision !== walletRevision) { await post('/auth/logout', {}); throw Error('Wallet changed during sign-in.'); }
    const authenticated = await api('/auth/me');
    if (revision !== walletRevision || authenticated.wallet?.toLowerCase() !== wallet.toLowerCase() || connectedWallet.toLowerCase() !== wallet.toLowerCase()) {
      await post('/auth/logout', {}); throw Error('Sign-in does not match the approved account.');
    }
    session = authenticated; walletHeader();
    return signer;
  } catch (error) {
    if (revision === walletRevision) { session = null; connectedWallet = ''; activeChain = ''; walletHeader(); }
    throw error;
  } finally { release(); }
}
document.querySelector('#home-connect').onclick = () => headerConnect();
document.querySelector('#wallet').onclick = () => busy(document.querySelector('#wallet'), async () => {
  if (!session) {
    await connect(); await render();
    return;
  }
  show(`<h2>${session.admin?'Your superadmin profile':'Your wallet'}</h2><code class="wallet-address">${esc(session.wallet)}</code><p>${session.admin?'You are signed in as superadmin. Review POAP requests and manage all events from your dashboard.':'Your signed-in account is shared across Kairo.'}</p>${session.admin?'<a class="button button-dark" href="#admin">Events & requests ↗</a>':''}<a class="button button-light" href="#gallery">My gallery</a><div class="form-actions"><button id="wallet-change" class="button">Switch account</button><button id="wallet-copy" class="button button-light">Copy address</button><button id="wallet-disconnect" class="button button-light">Disconnect</button></div>`);
  modalBody.querySelector('#wallet-copy').onclick = event => busy(event.target, async () => { if (!navigator.clipboard?.writeText) throw Error('Copy is unavailable here. Select the address above to copy it.'); await navigator.clipboard.writeText(session.wallet); toast('Wallet address copied'); });
  modalBody.querySelector('#wallet-change').onclick = event => busy(event.target, async () => {
    await post('/auth/logout', {}); session = null; connectedWallet = ''; walletRevision++; walletHeader();
    try { await connect(); } finally { walletHeader(); await render(); }
  });
  modalBody.querySelector('#wallet-disconnect').onclick = event => busy(event.target, async () => {
    session = null; connectedWallet = ''; activeChain = ''; walletRevision++; collectionRequest++; walletHeader();
    await Promise.all([post('/auth/logout', {}), walletClient.disconnect()]); close(); await render();
  });
});
async function connectWallet() {
  chainHex();
  connectedWallet = ''; session = null; const revision = ++walletRevision;
  document.querySelector('#wallet').textContent = 'Approve in your wallet…';
  const account = await walletClient.connect('metamask');
  if (revision !== walletRevision) throw Error('Wallet changed while approving access. Try again.');
  connectedWallet = getAddress(account);
  await updateNetwork();
}
async function updateNetwork() {
  if (connectedWallet) activeChain = await walletClient.provider.request({method:'eth_chainId'});
  walletHeader(); connectionState();
}
document.querySelector('#wallet-network').onclick = event => busy(event.target, switchNetwork);
async function signerOnSepolia() {
  if (!session) throw Error('Use Connect wallet in the header to sign in first.');
  const injected = walletClient.provider;
  if (await injected.request({method:'eth_chainId'}) !== chainHex()) throw Error(`Switch to ${config.chainName} using the network button in the header.`);
  const signer = await new BrowserProvider(injected).getSigner(connectedWallet);
  if ((await signer.getAddress()).toLowerCase() !== session.wallet.toLowerCase()) throw Error('Sign in with the currently approved wallet account');
  return signer;
}

let collectionWallet = '', collectionItems = [];
function localInput(seconds) {
 if(!seconds)return '';
 const value=new Date(seconds*1000);return new Date(value.getTime()-value.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
function showEvent(event) {
 const mintEnded=Date.now()/1000>event.mintEndsAt;
 show(`<h2>${esc(event.title)}</h2><div class="dialog-art">${artwork(event)}</div><p>${esc(event.description)}</p><p>${esc(event.venue)} · ${date(event.startsAt)}</p><p>Role: ${esc((event.roles||['Attendee'])[0])}</p><p>Minting: ${date(event.mintStartsAt)} ${time(event.mintStartsAt)} – ${date(event.mintEndsAt)} ${time(event.mintEndsAt)}</p><div class="notice">Request a POAP for super admin review, use a recipient link, or scan the organizer’s live Walk-in QR. One POAP per event, role and wallet. Published badge artwork and the mint window are permanent.</div>${event.groupId?`<nav class="chips">${events.filter(item=>item.groupId===event.groupId).map(item=>`<a class="pill" href="#drop/${esc(item.id)}">${esc(item.roles[0])}</a>`).join('')}</nav>`:''}${session?`<form id="poap-request"><label class="checkbox"><input type="checkbox" required><span>I consent to a permanent, non-transferable POAP being minted to my connected wallet.</span></label><button class="button" disabled>Request POAP</button><p id="request-status" role="status">Checking request status…</p></form><a class="text-link" href="#gallery">View my POAPs in Gallery ↗</a>`:'<p>Connect your wallet to request a POAP for super admin review.</p>'}`);
 const form=modalBody.querySelector('#poap-request');
 if(!form)return;
 const status=form.querySelector('#request-status'),button=form.querySelector('button');
 const view=renderId,wallet=session.wallet;
 const current=()=>view===renderId&&form.isConnected&&session?.wallet===wallet;
 let row;
 const display=value=>{
  row=value;button.hidden=Boolean(row);button.disabled=mintEnded||event.paused||!event.listed;
  status.textContent=row?`POAP request: ${row.status}${row.mint_status?' · '+row.mint_status:''}${row.error?' · '+row.error:''}`:mintEnded?'The mint window has ended.':event.paused?'Minting is paused.':'The super admin reviews your request before minting.';
 };
 const refresh=async()=>{
  try {const result=await api(`/events/${event.id}/requests?mine=1`);if(current())display(result.rows[0]);}
  catch(error){if(current())status.textContent=error.message;}
 };
 refresh();ticketTimer=setInterval(()=>{if(current()&&!document.hidden)refresh();},15000);
 form.onsubmit=e=>{e.preventDefault();busy(button,async()=>{
  if(!form.querySelector('input').checked)throw Error('Consent is required for a permanent POAP.');
  const result=await post(`/events/${event.id}/requests`,{permanentConsent:true});if(current())display(result);
 });};
}

async function shareDrop(event) {
 show(`<h2>Walk-in QR · ${esc(event.title)}</h2><canvas id="drop-qr"></canvas><p id="qr-status" role="status"></p><p>A QR scanned live and shared cannot be distinguished from one scanned in person. Codes rotate about every 30 seconds.</p>`);
 const canvas=modalBody.querySelector('canvas'),view=renderId;
 const refresh=async()=>{
  try {const result=await api(`/events/${event.id}/qr`);if(!modal.open||view!==renderId||!canvas.isConnected)return;
   const link=new URL(location.origin);link.searchParams.set('drop',event.id);link.searchParams.set('qr',result.token);
   await QRCode.toCanvas(canvas,link.href,{width:300,margin:3});
   if(canvas.isConnected)modalBody.querySelector('#qr-status').textContent='Live QR · scan and sign in with MetaMask';
  }catch(error){if(canvas.isConnected)modalBody.querySelector('#qr-status').textContent=error.message;}
 };
 await refresh();ticketTimer=setInterval(refresh,30000);
}
function badgeDetails(item) {
  show(`<div class="eyebrow">KAIRO / COLLECTIBLE #${esc(item.tokenId)}</div><h2>${esc(item.title)}</h2><div class="dialog-art">${collectibleArtwork(item)}</div><span class="pill green">On-chain ownership verified</span><span class="pill">${esc(item.role)}</span><p class="muted">${esc(item.description || 'Description unavailable for this collectible.')}</p><dl class="detail-grid"><div><dt>Organization</dt><dd>${esc(item.club)}</dd></div><div><dt>Organizer</dt><dd><code>${esc(short(item.organizer))}</code></dd></div><div><dt>Event date</dt><dd>${item.startsAt ? date(item.startsAt) : 'Not recorded'}</dd></div><div><dt>Issuance date</dt><dd>${item.issuedAt ? date(item.issuedAt) : 'Not indexed yet'}</dd></div><div><dt>Attendance</dt><dd>${item.claimMethod === 'verifier-check-in' && item.attendanceVerified ? 'Presence verified by organizer' : 'Presence not verified'}</dd></div><div><dt>Claim method</dt><dd>${esc(({'LINK':'Recipient link','QR':'Walk-in QR','LEGACY':'Earlier issuance','ADMIN':'Super admin mint'})[item.claimMethod] || 'Not recorded')}</dd></div><div><dt>Metadata</dt><dd>${esc(item.metadataStatus)}</dd></div><div><dt>Network</dt><dd>${esc(config.chainName)}</dd></div><div><dt>Token ID</dt><dd>${esc(item.tokenId)}</dd></div><div><dt>NFT contract address</dt><dd><code class="wallet-address">${esc(item.contractAddress||'Unavailable')}</code></dd></div></dl><section class="panel" aria-label="MetaMask import details"><h3>View this POAP in MetaMask</h3><p>This POAP is already owned by the wallet you are viewing. To display it in MetaMask, select the receiving account and ${esc(config.chainName)}, open NFTs → Import NFT, and enter this contract address and token ID. Importing does not mint again.</p><p><strong>Contract:</strong> <code class="wallet-address">${esc(item.contractAddress||'Unavailable')}</code><br><strong>Token ID:</strong> ${esc(item.tokenId)}</p><div class="form-actions"><button class="button button-light" id="copy-nft-contract" ${item.contractAddress?'':'disabled'}>Copy contract address</button><button class="button button-light" id="copy-nft-token">Copy token ID</button></div></section><a class="button button-light" href="${txLink(item.transactionHash, item.tokenId, item.contractAddress)}" target="_blank" rel="noopener">View blockchain proof ↗</a>${/^https:\/\//.test(item.uri) ? `<a class="button button-light" href="${esc(item.uri)}" target="_blank" rel="noopener">View metadata ↗</a>` : `<p class="muted">Metadata URI: ${esc(item.uri)}</p>`}<h3>Issuance transaction history</h3>${item.history.length ? `<ul class="transaction-list">${item.history.map(tx => `<li><a href="${txLink(tx.hash)}" target="_blank" rel="noopener">${esc(short(tx.hash))} ↗</a> <span>${date(tx.created_at)}</span></li>`).join('')}</ul>` : '<p class="muted">Transaction history has not been indexed by this app. Ownership is verified directly against the Kairo contract.</p>'}<div class="notice">Permanent and non-transferable. This wallet address is not a verified real-world identity.</div>`);
  for(const [id,value] of [['copy-nft-contract',item.contractAddress],['copy-nft-token',item.tokenId]])modalBody.querySelector('#'+id).onclick=event=>busy(event.target,async()=>{
   if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable. Copy the contract address and token ID shown above.');
   await navigator.clipboard.writeText(value);toast(id==='copy-nft-contract'?'NFT contract address copied.':'Token ID copied.');
  });
}
async function collection(version, profile = false) {
  const ownGallery = ['#gallery','#collector/collection'].includes(location.hash);
  if (ownGallery && !session) { main.innerHTML = empty('Your moments, together', 'Your badges appear here with your shared wallet session.') + '<a class="text-link" href="#">← Back to home</a>'; return; }
  const addressFromRoute = (location.hash.startsWith('#collector/') ? '' : location.hash.split('/')[profile ? 1 : location.hash.startsWith('#badge/') ? 2 : 1]);
  const savedWallet = addressFromRoute || connectedWallet || session?.wallet || '';
  main.innerHTML = `<div class="eyebrow">${profile ? 'YOUR PARTICIPATION, VERIFIED' : 'A RECORD OF YOUR MOMENTS'}</div><h1 class="page-title">${profile ? 'Your participation profile.' : 'Your collection.'}</h1><p class="lead">${profile ? 'A public wallet profile, built from verified participation. Your identity stays yours.' : 'The communities, ideas, and experiences you carry with you.'}</p><form id="collection-form" class="panel wallet-lookup"><label class="field">Ethereum wallet address<input id="collection-wallet" required placeholder="0x…" value="${esc(savedWallet)}" autocomplete="off" spellcheck="false"></label><button class="button">View ${profile ? 'profile' : 'collection'} ↗</button></form><div id="gallery-requests"></div><div class="form-actions"><button class="button button-light" id="refresh-collection">Refresh Gallery ↻</button></div><div id="profile-stats"></div><div id="collection-status" role="status" aria-live="polite"></div><div id="collection-tools"></div><div id="collection-grid">${empty('Your story is waiting', 'Connect a wallet or enter an address. Viewing public collectibles does not require a signature.')}</div><div id="collection-more"></div>`;
  const form = main.querySelector('#collection-form');
  main.querySelector('#refresh-collection').onclick=()=>form.requestSubmit();
  let requestsPage=0,lastRequestState=null,galleryPending=false;
  const loadRequests=async()=>{
   if(!ownGallery)return;
   const node=main.querySelector('#gallery-requests');
   try {
    const result=await api(`/my/requests?page=${requestsPage}`);if(version!==renderId)return;
    const state=JSON.stringify(result.rows.map(row=>[row.id,row.status,row.mint_status]));
    const changed=lastRequestState!==null&&lastRequestState!==state;lastRequestState=state;
    node.innerHTML=`<section class="panel"><h2>My POAP requests</h2>${result.rows.length?`<ul class="transaction-list">${result.rows.map(row=>`<li><a href="#drop/${esc(row.event_id)}">${esc(row.title)} · ${esc(row.role)}</a><span>${esc(row.status)}${row.mint_status?' · '+esc(row.mint_status):''}</span>${row.token_id?`<span>Token #${esc(row.token_id)}</span>`:''}${row.error?`<p role="status">${esc(row.error)}</p>`:''}${row.tx_hash?`<a href="${txLink(row.tx_hash)}" target="_blank" rel="noopener">Transaction ↗</a>`:''}</li>`).join('')}</ul>`:'<p>No POAP requests yet. Request a badge from an event’s details.</p>'}<div id="my-request-pages"></div></section>`;
    pageControls(node.querySelector('#my-request-pages'),requestsPage,result.hasMore,'My POAP requests',value=>{requestsPage=value;lastRequestState=null;loadRequests();});
    if(changed)form.requestSubmit();
   }catch(error){if(version===renderId)node.innerHTML=`<p role="alert">Requests unavailable: ${esc(error.message)}</p>`;}
  };
  loadRequests();
  if (ownGallery) { ticketTimer=setInterval(()=>{if(version===renderId&&!document.hidden&&!modal.open){loadRequests();if(galleryPending)form.requestSubmit();}},15000); main.querySelector('#collection-wallet').readOnly = true; form.hidden = true; }
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
      if (!ownGallery && !tools.innerHTML && collectionItems.length) {
        tools.innerHTML = `<div class="filter-bar"><label class="field">Search<input data-filter="search" placeholder="Event, role, token…"></label><label class="field">Year<select data-filter="year">${options(collectionItems.map(i => i.startsAt && new Date(i.startsAt*1000).getFullYear()), 'All years', 'year')}</select></label><label class="field">Role<select data-filter="role">${options(collectionItems.map(i => i.role), 'All roles', 'role')}</select></label><label class="field">Organization<select data-filter="organization">${options(collectionItems.map(i => i.club), 'All organizations', 'organization')}</select></label><label class="field">Sort<select data-filter="sort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Event name</option></select></label></div>`;
        tools.querySelectorAll('[data-filter]').forEach(input => input.oninput = () => { filters[input.dataset.filter] = input.value; draw(); });
      }
      for (const [key, values, label] of [['year', collectionItems.map(i => i.startsAt && new Date(i.startsAt * 1000).getFullYear()), 'All years'], ['role', collectionItems.map(i => i.role), 'All roles'], ['organization', collectionItems.map(i => i.club), 'All organizations']]) {
        const select = tools.querySelector(`[data-filter="${key}"]`);
        if (select) select.innerHTML = options(values, label, key);
      }
      const rows = filterCollection(collectionItems, filters);
      grid.innerHTML = rows.length ? `<div class="gallery-events">${groupCollection(rows).map(group => `<section class="gallery-event"><h2>${esc(group.event.title)}</h2>${ownGallery ? '' : `<p>${esc(group.event.club)}</p>`}<div class="grid">${group.badges.map(row => ownGallery ? `<a class="card gallery-badge" href="#badge/${esc(row.tokenId)}/${esc(collectionWallet)}" aria-label="View ${esc(row.title)} ${esc(row.role)} POAP"><div class="card-art">${collectibleArtwork(row)}</div><div class="gallery-badge-info"><strong>Token #${esc(row.tokenId)}</strong><span>${esc(row.role)} · Import details ↗</span></div></a>` : card(row, true)).join('')}</div></section>`).join('')}</div>` : collectionItems.length ? empty('No matching collectibles', 'Try another search or filter.') : complete && total === 0 ? `${empty('Your first moment is ahead of you', 'Discover an event, participate, and keep a collectible from the experience.')}<a class="button" href="#collector/gallery">Discover events ↗</a>` : empty('Your collection is still being checked', 'Ownership is checked on-chain. Records may take a moment to load.');
      status.innerHTML = `<div class="notice">${complete ? `${collectionItems.length} of ${esc(total)} on-chain collectibles loaded.` : `Checking the Kairo contract… ${collectionItems.length} of ${esc(total)} collectibles loaded.`}${complete && collectionItems.length < total ? ' Some records are not indexed yet. Retry shortly; this is not an empty collection.' : ''}${pending ? ` ${esc(pending)} issuance${pending > 1 ? 's' : ''} awaiting confirmation.` : ''} Only the configured Kairo contract is included. <a class="card-link" href="#${profile ? 'collection' : 'profile'}/${wallet}">${profile ? 'View collection' : 'View profile'} ↗</a></div>`;
    };
    const load = async () => {
      main.querySelector('#collection-more').innerHTML = '';
      try {
        do {
          const page = await api(`/wallet-collection?wallet=${wallet}&cursor=${cursor}`);
          if (!current()) return;
          if (!Array.isArray(page.items) || !Number.isSafeInteger(page.total) || page.total < 0 || !(page.nextCursor === null || Number.isSafeInteger(page.nextCursor) && page.nextCursor > cursor)) throw Error('Kairo returned an incomplete collection. Retry to check your wallet.');
          total = page.total; pending = page.pending; galleryPending=pending>0;
          for (const item of page.items) if (!collectionItems.some(i => i.tokenId === item.tokenId)) collectionItems.push(item);
          cursor = page.nextCursor; complete = cursor === null || collectionItems.length >= total;
          if (complete && collectionItems.length < total) throw Error('Some collection records are missing. Retry to finish checking ownership.');
          pages++; draw();
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
        status.querySelector('button').onclick = ()=>form.requestSubmit();
      }
    };
    await load();
  }); };
  if (savedWallet) form.requestSubmit();
}

function downloadCSV(filename,rows) {
 const link=document.createElement('a'),url=URL.createObjectURL(new Blob([csv(rows)],{type:'text/csv'}));
 link.href=url;link.download=filename;link.click();URL.revokeObjectURL(url);
}
let workspacePage=0;
async function organizer(version,adminView=false) {
 main.innerHTML=`<a class="back-link" href="#${adminView?'admin':'issuer/studio'}">← Back to ${adminView?'admin panel':'studio'}</a><h1>${adminView?'POAP requests & event management':'Event dashboard'}</h1>${adminView?'<p>You are signed in as superadmin. Choose an event and role, then accept or reject the requests below. Accepting queues a sponsored mint to that wallet.</p>':''}<p>Badge artwork and the mint window are frozen on chain and cannot be edited.</p>${session?'<label class="field">Event and role<select id="staff-event"><option value="">Choose an event…</option></select></label><div id="event-pages"></div><div id="staff-content"></div>':'<p>Sign in with your shared wallet session to manage your events.</p>'}`;
 if(!session)return;
 let workspace;try{workspace=await api(`/${adminView?'admin':'organizer'}/events?page=${workspacePage}`);}catch(error){if(version===renderId)main.querySelector('#staff-content').textContent=error.message;return;}if(version!==renderId)return;
 const select=main.querySelector('#staff-event');select.innerHTML+=workspace.events.map(e=>`<option value="${e.id}">${esc(e.title)} · ${esc(e.roles[0])}${adminView?` · ${e.pendingRequests||0} pending requests`:''}${e.listed?'':' · Rejected'}</option>`).join('');
 pageControls(main.querySelector('#event-pages'),workspacePage,workspace.hasMore,'Events',page=>{workspacePage=page;organizer(version,adminView);});
 if(!workspace.events.length){select.hidden=true;main.querySelector('#staff-content').innerHTML='<section class="studio-empty"><h2>No events to manage yet.</h2><p>Your published events and role badges will appear here.</p><a class="button button-dark" href="#create">Create an event</a></section>';return;}
 let page=0,linksPage=0,requestsPage=0;
 select.onchange=async changed=>{
  if(changed){page=0;linksPage=0;requestsPage=0;}
  if(!select.value)return;const id=Number(select.value),event=workspace.events.find(e=>e.id===id),content=main.querySelector('#staff-content');
  try {
   const [stats,transactions,recipientPage,requests]=await Promise.all([api(`/events/${id}/dashboard`),api(`/events/${id}/transactions?page=${page}`),api(`/events/${id}/links?page=${linksPage}`),adminView?api(`/events/${id}/requests?page=${requestsPage}`):null]);
   if(version!==renderId||Number(select.value)!==id)return;
   if(stats.event)Object.assign(event,stats.event);
   const links=recipientPage.rows;
   const mintStart=stats.mintStartsAt??event.mintStartsAt,mintEnd=stats.mintEndsAt??event.mintEndsAt;
   const qrReady=event.listed&&!event.paused&&!stats.paused&&Date.now()/1000>=mintStart&&Date.now()/1000<=mintEnd&&stats.capRemaining>0;
   const mintReason=qrReady?'Ready to mint on Sepolia.':!event.listed?'Event rejected.':event.paused||stats.paused?'Minting is paused.':Date.now()/1000<mintStart?'The mint window has not opened.':Date.now()/1000>mintEnd?'The mint window has ended.':'No supply remains.';
   content.innerHTML=`${adminView?`<section class="panel" aria-label="POAP request review"><h2>POAP requests · ${esc(event.roles[0])}</h2><div class="table-wrap"><table><thead><tr><th>Address</th><th>Status</th><th>Actions</th></tr></thead><tbody>${requests.rows.map(row=>`<tr><td>${esc(row.wallet)}</td><td>${esc(row.status)}${row.mint_status?` · ${esc(row.mint_status)}`:''}${row.error?`<small>${esc(row.error)}</small>`:''}</td><td>${row.status==='pending'?`<button class="button button-small" data-request="${esc(row.id)}" data-decision="accept" ${qrReady?'':'disabled'}>Accept & mint</button><button class="button button-danger button-small" data-request="${esc(row.id)}" data-decision="reject">Reject</button>`:''}</td></tr>`).join('')||'<tr><td colspan="3">No POAP requests yet.</td></tr>'}</tbody></table></div><div id="request-pages"></div></section>`:''}<div class="stats claim-stats">${[['Links issued',stats.linksIssued],['Links used',stats.linksUsed],['QR claims',stats.qrClaims],['Minted',stats.minted],['Pending',stats.pending],['Failed',stats.failed],['Cap remaining',stats.capRemaining??'Unlimited']].map(([name,value])=>`<div class="stat"><small>${name}</small><strong>${esc(value)}</strong></div>`).join('')}</div><div class="form-actions">${event.roles[0].toLowerCase()==='attendee'?`<button id="walk-in" class="button" ${qrReady?'':'disabled'}>Walk-in QR</button>`:''}<button id="refresh-dashboard" class="button button-light">Refresh</button><a class="button button-light" href="/api/events/${id}/export" download>Export transactions CSV</a></div><p>Walk-in QR is available for Attendees during the mint window, while minting is active and supply remains. Recipient links can be prepared now and redeemed during that window.</p><h2>Single-use recipient links</h2><p>A link works for whoever opens it first. Emails are private to you and the super admin and are deleted after ${esc(config.emailRetentionDays||30)} days, or on request. Save links when issued: only their hashes are stored.</p><form id="recipients-form"><label class="field">Paste email,role CSV (or enter one person per line)<textarea name="recipients" required placeholder="email,role&#10;person@example.org,Attendee"></textarea></label><label class="field">Or upload CSV<input id="recipient-file" type="file" accept=".csv,text/csv"></label><button class="button">Create links</button></form><div id="issued-links"></div><button class="button button-light" id="erase-emails">Delete all emails for this role</button><div class="table-wrap"><table><thead><tr><th>Email</th><th>State</th><th>Actions</th></tr></thead><tbody>${links.map(link=>`<tr><td>${esc(link.email||'Email deleted')}</td><td>${esc(link.revoked_at?'Revoked':link.state)}</td><td>${link.state==='issued'?`<button class="button button-light button-small" data-regenerate="${esc(link.id)}">Regenerate</button><button class="button button-light button-small" data-revoke="${esc(link.id)}">Revoke</button>`:''}<button class="button button-light button-small" data-delete-email="${esc(link.id)}">Delete email</button></td></tr>`).join('')||'<tr><td colspan="3" class="table-empty">No recipient links yet. Add recipients above to get started.</td></tr>'}</tbody></table></div><div id="link-pages"></div><h2>Transactions · ${esc(event.roles[0])}</h2><div class="table-wrap"><table><thead><tr><th>Wallet</th><th>Role</th><th>Claim method</th><th>Token</th><th>Status</th><th>Time</th><th>Transaction</th></tr></thead><tbody>${transactions.rows.map(row=>`<tr><td>${esc(row.wallet)}</td><td>${esc(event.roles[0])}</td><td>${esc(row.method)}</td><td>${esc(row.token_id||'—')}</td><td>${esc(row.status)}${row.error?`<small>${esc(row.error)}</small>`:''}${row.status==='failed'?` <button class="button button-light button-small" data-retry="${esc(row.id)}">Retry</button>`:''}</td><td>${date(row.created_at)} ${time(row.created_at)}</td><td>${row.tx_hash?`<a href="${txLink(row.tx_hash)}" target="_blank" rel="noopener">Etherscan ↗</a>`:'Queued'}</td></tr>`).join('')||'<tr><td colspan="7" class="table-empty">No claims yet. Transactions will appear here when participants mint.</td></tr>'}</tbody></table></div><div id="transaction-pages"></div>${adminView?`<section class="panel admin-event-tools"><h2>Mint POAP to an address</h2><p>Mint the selected role directly to a recipient. POAPs are permanent and cannot be transferred or burned. Check the address before minting.</p><form id="direct-mint"><label class="field">Recipient Ethereum address<input name="wallet" required pattern="0x[a-fA-F0-9]{40}" placeholder="0x…" autocomplete="off" spellcheck="false"></label><button class="button" ${qrReady?'':'disabled'}>Mint POAP</button></form><p role="status">${esc(mintReason)} Mint window: ${date(mintStart)} ${time(mintStart)} – ${date(mintEnd)} ${time(mintEnd)}.</p><h2>Event moderation</h2><p>Moderation applies to every role of this event. On-chain pause changes are queued through the relayer. Badge artwork and the mint window are frozen on chain and cannot be edited.</p><div class="form-actions"><button class="button button-light button-small" data-admin="verify">Accept / mark verified</button><button class="button button-light button-small" data-admin="pause">Pause minting</button><button class="button button-light button-small" data-admin="resume">Resume minting</button></div><form id="reject-event"><label class="field">Rejection reason<textarea name="reason" required maxlength="1000"></textarea></label><button class="button button-danger">Reject event</button></form><form id="edit-event"><label class="field">Title<input name="title" value="${esc(event.title)}" required maxlength="100"></label><label class="field">Description<textarea name="description" required maxlength="1000">${esc(event.description)}</textarea></label><label class="field">Venue<input name="venue" value="${esc(event.venue)}" required maxlength="300"></label><label class="field">Category<select name="category">${config.categories.map(c=>`<option ${c===event.category?'selected':''}>${esc(c)}</option>`).join('')}</select></label><label class="field">Organization<input name="club" value="${esc(event.club||'')}" required minlength="2" maxlength="80"></label><label class="field">Campus<input name="campus" value="${esc(event.campus||'')}" maxlength="100"></label><label class="field">Event starts<input name="eventStartsAt" type="datetime-local" required value="${localInput(event.startsAt)}"></label><label class="field">Event ends<input name="eventEndsAt" type="datetime-local" required value="${localInput(event.endsAt)}"></label><label class="field">Approximate attendees<input name="approximateAttendees" type="number" min="1" max="100000" required value="${esc(event.approximateAttendees||1)}"></label><p>These changes update the event listing. Published POAP artwork, badge metadata, supply and mint dates stay permanent.</p><button class="button button-dark">Save event details</button></form></section>`:''}`;
   content.dataset.editing='false';content.oninput=()=>{content.dataset.editing='true';};
   content.querySelector('#walk-in')?.addEventListener('click',()=>shareDrop(event));
   content.querySelector('#refresh-dashboard').onclick=select.onchange;
   pageControls(content.querySelector('#transaction-pages'),page,transactions.hasMore,'Transactions',value=>{page=value;select.onchange();});
   pageControls(content.querySelector('#link-pages'),linksPage,recipientPage.hasMore,'Recipient links',value=>{linksPage=value;select.onchange();});
   function issued(rows) {
    const node=content.querySelector('#issued-links');
    node.innerHTML=`<button id="export-links" class="button">Export new links CSV</button>${rows.map((row,index)=>`<p>${esc(row.email||'Email deleted')} · ${esc(row.role)} <button class="button button-light button-small" data-copy-link="${index}">Copy link</button><a href="mailto:${encodeURIComponent(row.email||'')}?subject=${encodeURIComponent(event.title)}&body=${encodeURIComponent(row.link)}">Open in my mail</a></p>`).join('')}<p>Save this export now. Links are unavailable after leaving this page; regenerate to issue a replacement.</p>`;
    node.querySelector('#export-links').onclick=()=>downloadCSV('recipient-links.csv',[['email','role','link'],...rows.map(row=>[row.email,row.role,row.link])]);
    node.querySelectorAll('[data-copy-link]').forEach(button=>button.onclick=()=>busy(button,()=>navigator.clipboard.writeText(rows[Number(button.dataset.copyLink)].link)));
   }
   const form=content.querySelector('#recipients-form');
   content.querySelector('#recipient-file').onchange=async input=>{try {const file=input.target.files[0];if(file){if(file.size>150000)throw Error('CSV exceeds 150 KB');form.elements.recipients.value=await file.text();}}catch(error){toast(error.message);}};
   form.onsubmit=e=>{e.preventDefault();busy(form.querySelector('button'),async()=>{const result=await post(`/events/${id}/links`,{csv:form.elements.recipients.value});issued(result.links);toast(`${result.links.length} links created; ${result.merged} duplicate entries merged.`);});};
   content.querySelector('#erase-emails').onclick=e=>busy(e.target,async()=>{await post(`/events/${id}/delete-emails`,{});await select.onchange();});
   content.querySelectorAll('[data-regenerate]').forEach(button=>button.onclick=()=>busy(button,async()=>{const result=await post(`/links/${button.dataset.regenerate}/regenerate`,{}),link=links.find(l=>l.id===button.dataset.regenerate);issued([{email:link.email,role:event.roles[0],link:result.link}]);}));
   for(const [attribute,action]of [['revoke','revoke'],['delete-email','delete-email']])content.querySelectorAll(`[data-${attribute}]`).forEach(button=>button.onclick=()=>busy(button,async()=>{await post(`/links/${button.getAttribute(`data-${attribute}`)}/${action}`,{});await select.onchange();}));
   content.querySelectorAll('[data-retry]').forEach(button=>button.onclick=()=>busy(button,async()=>{await post(`/claims/${button.dataset.retry}/retry`,{});await select.onchange();}));
   if(adminView) {
    pageControls(content.querySelector('#request-pages'),requestsPage,requests.hasMore,'POAP requests',value=>{requestsPage=value;select.onchange();});
    content.querySelector('#direct-mint').onsubmit=e=>{e.preventDefault();busy(e.target.querySelector('button'),async()=>{
     const wallet=getAddress(e.target.elements.wallet.value.trim());
     await post(`/admin/events/${id}/mint`,{wallet});toast('POAP mint queued for '+wallet);await select.onchange();
    });};
    content.querySelectorAll('[data-request]').forEach(button=>button.onclick=()=>busy(button,async()=>{
     await post(`/admin/events/${id}/requests/${button.dataset.request}/${button.dataset.decision}`,{});
     toast(button.dataset.decision==='accept'?'Request accepted. Mint queued.':'Request rejected.');await select.onchange();
    }));
    const change=async input=>{await post(`/admin/events/${id}`,input);await select.onchange();toast('Admin action saved. On-chain changes may still be confirming.');};
    content.querySelectorAll('[data-admin]').forEach(button=>button.onclick=()=>busy(button,()=>change({action:button.dataset.admin})));
    content.querySelector('#reject-event').onsubmit=e=>{e.preventDefault();busy(e.target.querySelector('button'),()=>change({action:'reject',reason:e.target.elements.reason.value}));};
    content.querySelector('#edit-event').onsubmit=e=>{e.preventDefault();busy(e.target.querySelector('button'),()=>change({action:'edit',...Object.fromEntries(['title','description','venue','category','club','campus'].map(name=>[name,e.target.elements[name].value])),...Object.fromEntries(['eventStartsAt','eventEndsAt'].map(name=>[name,Math.floor(new Date(e.target.elements[name].value).getTime()/1000)])),approximateAttendees:Number(e.target.elements.approximateAttendees.value)}));};
   }
  }catch(error){if(version===renderId)content.innerHTML=`<p role="alert">${esc(error.message)}</p>`;}
 };
 const requested=Number(location.hash.split('/')[2]);select.value=String(workspace.events.find(event=>event.id===requested)?.id||workspace.events[0].id);await select.onchange();
}
function pageControls(container,page,hasMore,label,onPage) {
 container.innerHTML=page||hasMore?`<nav class="page-controls" aria-label="${esc(label)} pages">${page?`<button class="button button-light button-small" data-page="${page-1}">← Previous</button>`:''}<span>Page ${page+1}</span>${hasMore?`<button class="button button-light button-small" data-page="${page+1}">Next →</button>`:''}</nav>`:'';
 container.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>onPage(Number(button.dataset.page)));
}
function activityHTML(rows,workspace) {
 const names={verify:'Event verified',reject:'Event rejected',edit:'Event details updated',pause:'Minting paused',resume:'Minting resumed','accept-request':'POAP request accepted','direct-mint':'POAP mint queued','reject-request':'POAP request rejected','retry-mint':'Mint retried','issue-links':'Recipient links created',regenerate:'Recipient link regenerated',revoke:'Recipient link revoked','delete-email':'Email deleted','delete-emails':'Event emails deleted'};
 if(!rows.length)return '<p class="panel-empty">No admin actions yet. Verifications, edits and moderation will appear here.</p>';
 return `<ol class="activity-list">${rows.map(row=>{
  let details={};try{details=JSON.parse(row.details);}catch{}
  const event=workspace.events.find(event=>event.id===row.event_id);
  return `<li><span class="activity-dot" aria-hidden="true"></span><div><strong>${esc(names[row.action]||row.action)}</strong><p>${esc(event?.title||`Event #${row.event_id}`)}${details.reason?` — ${esc(details.reason)}`:''}${details.wallet?` · ${esc(details.wallet)}`:''}</p><time datetime="${new Date(row.created_at*1000).toISOString()}">${date(row.created_at)} at ${time(row.created_at)}</time></div></li>`;
 }).join('')}</ol>`;
}
function renderSystemPanel(node,{system,health,audit,workspace,auditPage},onPage) {
 const checks=health.dependencies||{},issues=Object.values(checks).filter(check=>check.status!=='ok');
 const ready=health.status==='ok',balance=system?.balanceETH,hasBalance=balance!==undefined&&Number.isFinite(Number(balance));
 const funded=hasBalance&&Number(balance)>0,contractReady=checks.contract?.status==='ok';
 const serviceNames={config:'App configuration',d1:'Event database',r2:'Badge storage',durableObject:'Transaction queue',rpc:'Sepolia connection',contract:'Kairo contract',relayer:'Gas sponsorship',media:'Public artwork URLs'};
 const pending=(system?.actions||[]).filter(action=>action.status!=='live');
 const addressURL=address=>{
  try{const url=new URL(`/address/${encodeURIComponent(address)}`,config.explorerUrl);return url.protocol==='https:'?esc(url.href):'';}catch{return '';}
 };
 node.innerHTML=`<section class="system-panel" aria-labelledby="system-heading"><header class="panel-heading"><div><h2 id="system-heading">Gas & network</h2><p>Sponsored transactions on Sepolia</p></div><span class="service-badge ${ready?'is-ready':'needs-setup'}"><i aria-hidden="true"></i>${ready?'Ready':'Setup needed'}</span></header>${!ready?`<div class="setup-note"><strong>${!contractReady?'Connect the updated contract':!funded?'Fund the relayer wallet':'Finish publishing setup'}</strong><p>${!contractReady?'The current deployment needs the updated Kairo contract before events can publish.':!funded?'Add Sepolia test ETH to the wallet below. Organizers and participants still mint for free.':esc(issues[0]?.message||'Some services are unavailable. Check the details below.')}</p></div>`:''}<div class="relayer-balance"><span>Relayer balance</span><strong>${hasBalance?Number(balance).toLocaleString(undefined,{maximumFractionDigits:6}):'Unavailable'}</strong><small>Sepolia ETH · test funds</small></div><div class="system-wallet"><span>Gas-paying wallet</span>${system?.relayer?`<a href="${addressURL(system.relayer)}" target="_blank" rel="noopener"><code>${esc(system.relayer)}</code> ↗</a>`:'<p>Could not load the relayer. Refresh to retry.</p>'}${system?.signerAddress&&system.signerAddress.toLowerCase()!==system.relayer?.toLowerCase()?'<p class="inline-warning">The configured key belongs to a different wallet. Update the relayer key.</p>':''}</div><dl class="system-facts"><div><dt>Super admin</dt><dd>${system?.superAdminOnChain?'Verified on chain':'Awaiting verification'}</dd></div><div><dt>Contract</dt><dd>${contractReady?'Connected':'Update required'}</dd></div></dl><details class="service-details"><summary>Service details <span>${Object.values(checks).filter(check=>check.status==='ok').length}/${Object.keys(checks).length} ready</span></summary><ul>${Object.entries(checks).map(([name,check])=>`<li><span>${esc(serviceNames[name]||name)}</span><span class="check-status ${check.status==='ok'?'is-ready':'needs-setup'}">${check.status==='ok'?'Available':'Needs attention'}</span>${check.status!=='ok'?`<p>${esc(check.message||'Refresh to retry this service.')}</p>`:''}</li>`).join('')}</ul></details></section>${pending.length?`<section class="system-panel"><header class="panel-heading"><h2>Moderation in progress</h2></header><ul class="moderation-list">${pending.map(action=>`<li><span class="service-badge ${action.status==='failed'?'needs-setup':''}">${esc(({pending:'Queued',submitted:'Confirming',failed:'Needs attention'})[action.status]||action.status)}</span><p>${action.status==='failed'?'The transaction could not complete. Check the relayer and contract configuration.':'Your change is saved and waiting for Sepolia confirmation.'}</p>${action.tx_hash?`<a class="text-link" href="${txLink(action.tx_hash)}" target="_blank" rel="noopener">View transaction ↗</a>`:''}</li>`).join('')}</ul></section>`:''}<section class="system-panel activity-panel"><header class="panel-heading"><div><h2>Admin activity</h2><p>A record of changes to your events</p></div></header>${audit?activityHTML(audit.rows,workspace):'<p class="panel-empty">Activity could not load. Refresh to try again.</p>'}<div id="audit-pages"></div></section>`;
 pageControls(node.querySelector('#audit-pages'),auditPage,audit?.hasMore,'Activity',onPage);
}
async function organizerStudio(version,adminView=false) {
 main.innerHTML=`<header class="studio-heading"><div><h1>${adminView?'Super admin panel.':'Organizer studio.'}</h1><p>${adminView?'You are signed in as superadmin. Review POAP requests across all events.':'Your events. Your designs. Your people.'}</p></div>${session?'<a class="button button-dark" href="#create">Create an event ↗</a>':''}</header><nav class="section-tabs" aria-label="Organizer workspace"><a href="#${adminView?'admin':'issuer/studio'}" aria-current="page">${adminView?'All events':'Your events'}</a><a href="#${adminView?'admin/events':'issuer/manage'}">${adminView?'Review POAP requests':'Manage claims'}</a>${adminView?'<button id="refresh-admin-events" class="button button-light button-small">Refresh requests</button>':''}<a href="#issuer/guide">Organizer guide</a></nav>${session?`<div class="studio-layout ${adminView?'with-admin':''}"><section class="studio-main" aria-label="Your events"><div id="studio-events" role="status"><p class="loading">Loading your events…</p></div><div id="studio-pages"></div></section>${adminView?'<aside id="studio-system" class="studio-system" aria-label="Admin system overview"><section class="system-panel"><p class="loading">Checking Sepolia and the relayer…</p></section></aside>':''}</div>`:`<section class="studio-empty"><div class="studio-empty-art">${doodle('flower')}</div><h2>Your next event starts here.</h2><p>Sign in with MetaMask to create events, manage your badges and distribute claims from one workspace.</p><button class="button button-dark" id="studio-sign-in">Connect MetaMask</button></section>`}`;
 if(!session){main.querySelector('#studio-sign-in').onclick=headerConnect;return;}
 if(adminView)main.querySelector('#refresh-admin-events').onclick=()=>organizerStudio(version,true);
 let workspace;
 try {
  workspace=await api(`/${adminView?'admin':'organizer'}/events?page=${workspacePage}`);if(version!==renderId)return;
  const publications=workspace.publications.filter(row=>row.status!=='live');
  const groups=groupCollection(workspace.events);
  main.querySelector('#studio-events').innerHTML=`${publications.map(row=>`<article class="publication-card"><span class="service-badge ${row.status==='failed'?'needs-setup':''}">${row.status==='failed'?'Needs attention':'Publishing'}</span><h2>${esc(row.details.title)}</h2><p>${row.status==='failed'?'Your event is saved. Check the publishing setup, then retry.':'The relayer is creating your badges. You can leave this page and resume later.'}</p><button class="button button-light button-small" data-resume-publication="${esc(row.id)}">${row.status==='failed'?'Retry publishing':'Check progress'}</button></article>`).join('')}${groups.length?`<div class="studio-event-list">${groups.map(({event,badges})=>`<article class="studio-event-card"><div class="studio-event-art">${artwork(event)}</div><div class="studio-event-info"><div class="studio-event-meta"><span>${date(event.startsAt)}</span><span class="service-badge ${!event.listed||event.paused?'needs-setup':'is-ready'}">${!event.listed?'Rejected':event.paused?'Paused':'Live'}</span></div><h2>${esc(event.title)}</h2><p>${esc(event.venue)}</p><div class="studio-role-list">${adminView?`<span>${badges.reduce((sum,badge)=>sum+(badge.pendingRequests||0),0)} pending POAP requests</span>`:''}${badges.map(badge=>`<span>${esc(badge.roles[0])}</span>`).join('')}</div><div class="studio-event-actions"><a class="text-link" href="#${adminView?'admin/events':'issuer/manage'}/${esc((adminView?badges.find(badge=>badge.pendingRequests>0):null)?.id||event.id)}">${adminView?'Review requests & manage event ↗':'Manage event ↗'}</a>${event.listed?`<a class="text-link" href="#drop/${esc(event.id)}">View event</a>`:''}</div></div></article>`).join('')}</div>`:!publications.length?`<section class="studio-empty"><div class="studio-empty-art">${doodle('flower')}</div><h2>Your first event starts here.</h2><p>Add your event, make a badge for each role, and publish with sponsored gas.</p><a class="text-link" href="#create">Create your first event ↗</a></section>`:''}`;
  pageControls(main.querySelector('#studio-pages'),workspacePage,workspace.hasMore,'Events',page=>{workspacePage=page;organizerStudio(version,adminView);});
  main.querySelectorAll('[data-resume-publication]').forEach(button=>button.onclick=()=>busy(button,async()=>{
   const row=workspace.publications.find(row=>row.id===button.dataset.resumePublication);
   if(row.status==='failed'){const {organizer,...payload}=row.details;await post('/organizer/events',payload);}
   const progress=await api(`/publications/${row.id}`);
   if(progress.status==='live'){events=await api('/events');await organizerStudio(version,adminView);toast('Event published.');}
   else toast(progress.status==='failed'?'Publishing needs attention. Check the system panel.':'Your badges are still being created on Sepolia.');
  }));
 }catch(error){if(version===renderId)main.querySelector('#studio-events').innerHTML=`<section class="studio-empty"><h2>Your events could not load.</h2><p>${esc(error.message)}</p><button class="button button-light" id="retry-studio">Retry</button></section>`;main.querySelector('#retry-studio')?.addEventListener('click',()=>organizerStudio(version,adminView));return;}
 if(adminView) {
  const results=await Promise.allSettled([api('/admin/system',{quiet:true}),api('/health',{allowDegraded:true,quiet:true}),api('/admin/audit',{quiet:true})]);
  if(version!==renderId)return;
  const system=results[0].status==='fulfilled'?results[0].value:null;
  const health=results[1].status==='fulfilled'?results[1].value:{status:'unavailable',dependencies:{rpc:{status:'error',message:'The system check is unavailable. Refresh to retry.'}}};
  let audit=results[2].status==='fulfilled'?results[2].value:null,auditPage=0;
  const node=main.querySelector('#studio-system');
  const draw=()=>renderSystemPanel(node,{system,health,audit,workspace,auditPage},async page=>{
   try {const rows=await api(`/admin/audit?page=${page}`,{quiet:true});if(version!==renderId)return;auditPage=page;audit=rows;draw();}catch(error){toast(error.message);}
  });draw();
 }
}

function adminLogin() {
 main.innerHTML=`<header class="studio-heading"><div><h1>Super admin sign-in.</h1><p>Event moderation, system health and the audit log.</p></div></header><section class="studio-empty"><h2>Connect the admin wallet</h2><p>Only the configured super admin can access this panel.</p><code class="wallet-address">${esc(config.superAdminAddress||'')}</code><p>Use MetaMask and sign the login message. No private key or password is needed.</p>${session&&!session.admin?'<p class="inline-warning">Your current wallet is not the super admin. Select the admin account in MetaMask before signing in.</p>':''}<button id="admin-sign-in" class="button button-dark">${session?.admin?'Open admin panel':'Sign in with MetaMask'}</button></section>`;
 main.querySelector('#admin-sign-in').onclick=event=>busy(event.target,async()=>{
  if(!session?.admin)await connect();
  if(!session?.admin)throw Error('This wallet is not the configured super admin. Switch accounts in MetaMask.');
  location.hash='#admin';await render();
 });
}

function createEventPage() {
  main.innerHTML = `<a class="back-link" href="#${session?.admin?'admin':'issuer/studio'}">← Back to ${session?.admin?'admin dashboard':'studio'}</a><div class="eyebrow">ORGANIZER STUDIO / EVENT EDITOR</div><h1 class="page-title">Give your event a little forever.</h1><p class="lead">Your artwork. Your community. A collectible for everyone who shows up.</p><div class="notice"><a href="#${session?.admin?'admin':'issuer/studio'}">${session?.admin?'Superadmin dashboard':'Back to my studio'} ↗</a> · <a href="#${session?.admin?'admin/events':'issuer/manage'}">${session?.admin?'Review POAP requests':'Manage attendance'} ↗</a><br>Publish immediately with sponsored gas. Badge artwork and the mint window are frozen on chain and cannot be edited.</div><form id="event-form" class="panel"><div class="form-grid"><label class="field">Event title<input name="title" required minlength="3" maxlength="100" placeholder="Your event name"></label><label class="field">Club or community<input name="club" required minlength="2" maxlength="80" placeholder="The Coding Club"></label><label class="field field-full">Description<textarea name="description" required minlength="3" maxlength="1000" placeholder="What makes this moment special?"></textarea></label><label class="field">Category<select name="category">${(config.categories || []).map(name => `<option>${esc(name)}</option>`).join('')}</select></label><label class="field">Campus<input name="campus" maxlength="100" placeholder="Campus name"></label><label class="field">Participation roles<input name="roles" value="Attendee" maxlength="320"><small>Comma-separated, up to 8 roles. Each has its own badge and cap.</small></label><label class="field">Venue<input name="venue" required minlength="2" maxlength="300" placeholder="Innovation Lab, Block A"></label><label class="field">Event starts<input name="starts" type="datetime-local" required></label><label class="field">Event ends<input name="eventEnds" type="datetime-local" required></label><label class="field">Minting opens<input name="mintStarts" type="datetime-local" required></label><label class="field">Minting closes<input name="ends" type="datetime-local" required><small>Allow time after the event for queued mints to confirm.</small></label><label class="field">Approximate attendees<input name="approximateAttendees" type="number" min="1" max="100000" required value="50"></label><label class="field field-full">Collectible artwork<small>Choose a design for each role below, or explicitly generate POAPs from your event description.</small></label><div id="role-designs" class="field-full role-designs"></div></div><label class="checkbox"><input type="checkbox" required><span>I have permission to use this artwork. I checked the details and understand that the collectible metadata cannot be edited after publishing.</span></label><div class="form-actions"><button class="button" id="publish-button" type="submit">Publish event ↗</button><button type="button" class="button button-light" id="generate-poap">Generate POAPs from description ✧</button><button type="button" class="text-link" id="clear-artwork">Clear design & upload</button></div><div id="publish-status" class="publication-progress" role="status"></div></form>`;
  const form = main.querySelector('form');
  const designs = new Map();
  const roles = () => {
    const values = [...new Set(form.elements.roles.value.split(',').map(role => role.trim()).filter(Boolean))];
    if (!values.length || values.length > 8 || values.some(role => role.length > 40)) throw Error('Choose 1–8 roles, each up to 40 characters.');
    return values;
  };
  async function authenticate() {
    if (!session) throw Error('Use Connect wallet in the header to sign in first.');
  }
  const story = () => ({name:form.elements.title.value.trim(),description:form.elements.description.value.trim()});
  async function designFor(role, generate = false) {
    const state = designs.get(role), input = {...story(),role};
    if (state.reading) throw Error('Wait for your upload to finish reading.');
    if (input.name.length < 3 || input.description.length < 3) throw Error('Add an event title and description of at least three characters first.');
    if (!generate && state.generated?.name === input.name && state.generated?.description === input.description) return {role,...state.generated};
    if (!generate && !state.image && !state.video) throw Error(`Upload a custom design or click Generate POAP for ${role} first.`);
    if (generate && (state.image || state.video)) throw Error(`Clear the custom upload for ${role} before generating.`);
    const version = ++state.version;
    const result = await post('/artwork',{...input,...(state.image ? {image:state.image} : {}),...(state.video ? {video:state.video} : {})});
    if (version !== state.version || JSON.stringify(input) !== JSON.stringify({...story(),role}) || !roles().includes(role)) throw Error('The design or event story changed. Try again.');
    state.generated = {...result,...input}; drawDesigns(); return {role,...state.generated};
  }
  function drawDesigns() {
    let values;
    try { values = roles(); } catch (error) { toast(error.message); return; }
    const container = main.querySelector('#role-designs');
    container.innerHTML = values.map((role,index) => `<section class="role-design"><h3>${esc(role)} POAP</h3><label class="field">Approximate number of drops<input name="drops-${index}" type="number" min="1" max="10000" step="1" required value="${esc(designs.get(role)?.cap ?? 50)}"><small>This sets the maximum POAP supply for ${esc(role)}.</small></label><label class="field">Custom design<input name="${index === 0 ? 'artwork' : `artwork-${index}`}" type="file" accept="image/png,image/jpeg,video/mp4,video/webm"></label><img ${index === 0 ? 'id="art-preview"' : ''} alt="${esc(role)} POAP preview"><video ${index === 0 ? 'id="video-preview"' : ''} controls playsinline preload="metadata" hidden aria-label="${esc(role)} video preview"></video><div class="form-actions"><button type="button" class="button button-light" data-generate-role="${index}">Generate POAP ✧</button><button type="button" class="text-link" data-clear-role="${index}">Clear design</button></div></section>`).join('');
    values.forEach((role,index) => {
      if (!designs.has(role)) designs.set(role,{version:0,cap:50});
      const state = designs.get(role), node = container.children[index], image = node.querySelector('img'), video = node.querySelector('video');
      if (state.image || state.generated?.image) image.src = state.image || state.generated.image;
      if (state.video || state.generated?.animationUrl) { video.src = state.video || state.generated.animationUrl; video.hidden = false; }
      node.querySelector('[data-generate-role]').onclick = event => busy(event.target,async () => { await authenticate(); await designFor(role,true); toast(`${role} POAP is ready.`); });
      node.querySelector('[data-clear-role]').onclick = () => { state.version++; state.generated = state.image = state.video = null; state.reading = false; video.pause?.(); drawDesigns(); };
      node.querySelector(`[name="drops-${index}"]`).oninput = event => {state.cap = event.target.value;};
      node.querySelector('input[type="file"]').onchange = event => {
        const file = event.target.files[0]; if (!file) return;
        const isVideo = ['video/mp4','video/webm'].includes(file.type);
        if ((!isVideo && !['image/png','image/jpeg'].includes(file.type)) || file.size > (isVideo ? 10 : 2)*1024*1024) { toast('Use PNG/JPEG up to 2 MB or MP4/WebM up to 10 MB.'); event.target.value = ''; return; }
        const version = ++state.version; state.generated = state.image = state.video = null; state.reading = true;
        image.removeAttribute('src'); video.removeAttribute('src'); video.hidden = true;
        const reader = new FileReader();
        reader.onload = () => { if (version !== state.version) return; state.reading = false; if (isVideo) state.video = reader.result; else state.image = reader.result; drawDesigns(); };
        reader.onerror = () => { if (version === state.version) {state.reading = false; toast('The upload could not be read. Choose the file again.');} };
        reader.readAsDataURL(file);
      };
    });
  }
  form.elements.roles.oninput = form.elements.roles.onchange = drawDesigns;
  drawDesigns();
  async function media() {
    drawDesigns();
    const values = roles(), roleArtwork = [];
    for (const role of values) {
      const {image,uri,animationUrl} = await designFor(role);
      const cap = Number(designs.get(role).cap);
      if (!Number.isInteger(cap) || cap < 1 || cap > 10000) throw Error(`Enter 1–10,000 drops for ${role}.`);
      roleArtwork.push({role,image,uri,cap,...(animationUrl ? {animationUrl} : {})});
    }
    if (JSON.stringify(values) !== JSON.stringify(roles())) throw Error('Roles changed. Review the designs and save again.');
    return {...roleArtwork[0],roleArtwork};
  }
  main.querySelector('#clear-artwork').onclick = () => { for (const state of designs.values()) {state.version++; state.image = state.video = state.generated = null; state.reading = false;} drawDesigns(); };
  main.querySelector('#generate-poap').onclick = event => busy(event.target,async () => {
    await authenticate(); drawDesigns();
    for (const role of roles()) { const state = designs.get(role); if (state.image || state.video) await designFor(role); else await designFor(role,true); }
    toast('Your role POAPs are ready.');
  });
  const pendingKey='kairo-publishing';
  async function followPublication(id) {
   const node=main.querySelector('#publish-status');if(!node)return;
   const result=await api(`/publications/${id}`);if(!node.isConnected)return;
   node.textContent=result.status==='live'?'Event published and live.':result.status==='failed'?'Publication failed. Check your organizer dashboard.':result.status==='submitted'?'Transaction sent. Waiting for blockchain confirmation…':'Publishing queued. The relayer sponsors gas. You can leave and resume from your studio.';
   if(result.status==='live'){localStorage.removeItem(pendingKey);events=await api('/events');location.hash=`${session?.admin?'admin/events':'issuer/manage'}/${result.events[0].id}`;toast(session?.admin?'Event published. POAP requests will appear here for your review.':'Event published. Share the Walk-in QR or create single-use recipient links from your dashboard.');}
   else if(result.status!=='failed')ticketTimer=setTimeout(()=>followPublication(id).catch(error=>{if(node.isConnected)node.textContent=error.message;}),10000);
  }
  let pending;try{pending=JSON.parse(localStorage.getItem(pendingKey)||'null');}catch{localStorage.removeItem(pendingKey);}
  function resumePublication(payload) {
   main.querySelector('#publish-status').innerHTML='<p>Your publication is saved. Resume it or clear the saved draft to create a new event. Clearing the draft does not cancel a publication already queued; you can still track it in your studio.</p><div class="form-actions"><button type="button" id="resume-event" class="button button-light">Resume publication</button><button type="button" id="discard-publication" class="button button-light">Clear draft & start new</button></div>';
   const discard=main.querySelector('#discard-publication');
   discard.onclick=()=>{
    clearTimeout(ticketTimer);localStorage.removeItem(pendingKey);
    const notice=document.querySelector('#request-error');notice.hidden=true;notice.replaceChildren();
    createEventPage();toast('Saved draft cleared. You can create a new event.');
   };
   main.querySelector('#resume-event').onclick=event=>busy(event.target,async()=>{
    discard.disabled=true;
    try {await post('/organizer/events',payload);await followPublication(payload.id);}
    finally {if(discard.isConnected)discard.disabled=false;}
   });
  }
  if(pending)resumePublication(pending);
  form.onsubmit=event=>{event.preventDefault();busy(main.querySelector('#publish-button'),async()=>{
   if(!form.reportValidity())return;await authenticate();
   if(localStorage.getItem(pendingKey))throw Error('Resume the saved publication or choose Clear draft & start new.');
   const f=form.elements,seconds=name=>Math.floor(new Date(f[name].value).getTime()/1000);
   const artwork=await media();
   const id=crypto.randomUUID();
   const payload={id,title:f.title.value.trim(),description:f.description.value.trim(),club:f.club.value.trim(),category:f.category.value,campus:f.campus.value.trim(),venue:f.venue.value.trim(),approximateAttendees:Number(f.approximateAttendees.value),eventStartsAt:seconds('starts'),eventEndsAt:seconds('eventEnds'),mintStartsAt:seconds('mintStarts'),mintEndsAt:seconds('ends'),roleArtwork:artwork.roleArtwork};
   if(payload.eventStartsAt>=payload.eventEndsAt||payload.mintStartsAt>=payload.mintEndsAt)throw Error('Check your event dates and minting window.');
   // Save the id before sending, so an interrupted response can be resumed safely.
   localStorage.setItem(pendingKey,JSON.stringify(payload));
   main.querySelector('#publish-status').textContent='Uploading and freezing badge metadata; publishing event…';
   try {await post('/organizer/events',payload);}catch(error){
    if(error.status&&error.status<500||['CONTRACT_MISMATCH','RELAYER_MISMATCH','RELAYER_UNFUNDED','RELAYER_NOT_CONFIGURED','MEDIA_NOT_CONFIGURED','MEDIA_UNREACHABLE','MEDIA_MISMATCH','NOT_CONFIGURED'].includes(error.code)) {
     localStorage.removeItem(pendingKey);main.querySelector('#publish-status').textContent=error.message;
    } else resumePublication(payload);
    throw error;
   }
   await followPublication(id);
  });};
}

function about() { main.innerHTML = aboutContent(location.hash); }
async function render() {
  clearInterval(pageTimer); clearTimeout(ticketTimer); ticketView++; drawEvents = null; close();
  const version = ++renderId;
  const hash = location.hash.slice(1);
  const routes = { events:'explore', gallery:'collection', organize:'studio', 'collector/gallery': 'explore', 'collector/collection': 'collection', 'collector/collectors': 'profile', 'builders/build': 'documentation', 'builders/documentation': 'documentation', 'issuer/guide': 'issuer-guide', 'issuer/studio': 'studio', 'issuer/manage': 'organizer' };
  const route = hash.startsWith('issuer/manage/') ? 'organizer' : hash.startsWith('guide-') ? 'issuer-guide' : hash.startsWith('doc-') ? 'documentation' : routes[hash] || hash.split('/')[0];
  all('.desktop-nav a, #mobile-nav a').forEach(link => { const active = link.hash === location.hash || link.getAttribute('href') === location.hash; if (active) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current'); });
  const home = !hash || ['main','collectibles','how-it-works'].includes(hash);
  document.querySelectorAll('[data-home]').forEach(node => { node.hidden = !home; });
  main.hidden = home;
  if (apiError && (home || ['explore','drop'].includes(route))) { main.hidden = false; main.innerHTML = `${empty('Live service unavailable', apiError)}<button class="button" id="retry-api">Retry connection</button>`; main.querySelector('button').onclick = init; return; }
  if (home) { renderCards(); pageTimer = setInterval(async () => { if (document.hidden || modal.open || version !== renderId) return; try { events = await api('/events'); apiError = ''; if (version === renderId) { connectionState(); renderCards(); } } catch (error) { apiError = error.message; renderCards(); } }, 15000); return; }
  if (route === 'collection' || route === 'badge' || route === 'profile') await collection(version, route === 'profile');
  else if (route === 'admin') {
    if(!session?.admin||hash==='admin/login') adminLogin();
    else if(hash.startsWith('admin/events')) await organizer(version,true);
    else await organizerStudio(version,true);
  }
  else if (route === 'organizer') await organizer(version,Boolean(session?.admin));
  else if (route === 'create') createEventPage();
  else if (route === 'about') about();
  else if (route === 'issuer-guide') { main.innerHTML = issuerContent(); if (hash.startsWith('guide-')) document.getElementById(hash)?.scrollIntoView({behavior:reduced.matches ? 'instant' : 'smooth'}); }
  else if (route === 'studio') await organizerStudio(version,Boolean(session?.admin)&&hash==='organize');
  else if (route === 'documentation') { documentation(); if (hash.startsWith('doc-')) document.getElementById(hash)?.scrollIntoView({behavior:reduced.matches ? 'instant' : 'smooth'}); }
  else if(route==='redeem') {
   const token=hash.split('/')[1];
   try {const result=await post('/redeem',{token});if(version===renderId)claimForm(result.event,true,token);}
   catch(error){if(version===renderId)main.innerHTML=empty('Link unavailable',error.message);}
  } else if(route==='claim') {
   const [,id,eventId]=hash.split('/');await showTicket(id,events.find(event=>event.id===Number(eventId)));
  } else {
    explore();
    const id=entryDrop||(route==='drop'?Number(hash.split('/')[1]):null);
    if(id){
     try {const event=events.find(e=>e.id===id)||await api(`/events/${id}`);if(version!==renderId)return;
      if(new URL(location.href).searchParams.has('qr'))claimForm(event,true);else showEvent(event);
     }catch(error){if(version===renderId)toast(error.message);}
    }
  }
  pageTimer = setInterval(async () => {
    if (document.hidden || modal.open || version !== renderId) return;
    try { events = await api('/events'); if (version !== renderId) return; apiError = ''; connectionState(); drawEvents?.(); const staff = main.querySelector('#staff-event'); if (staff?.value&&main.querySelector('#staff-content')?.dataset.editing!=='true') await staff.onchange(); }
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
  main.innerHTML = `<h1>Discover events</h1><label class="field">Search events<span class="event-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="live-search" type="search" placeholder="Event, campus, organizer…"></span></label><label class="field">Category<select id="live-category"><option>All events</option>${(config.categories || []).map(c => `<option>${esc(c)}</option>`).join('')}</select></label><div id="live-events"></div>`;
  drawEvents = () => {
    const visible = events.filter(e => matchesEvent(e, {search: main.querySelector('#live-search').value, category: main.querySelector('#live-category').value, period: 'all'}));
    main.querySelector('#live-events').innerHTML = [['Happening now','Live events'],['Upcoming','Upcoming events'],['Past event','Past events']].map(([state,label]) => {
      const rows = visible.filter(e => eventState(e) === state);
      return `<section class="event-period"><h2>${label}</h2>${rows.length ? `<div class="grid">${rows.map(e => card(e)).join('')}</div>` : empty(`No ${label.toLowerCase()}`, 'Try another search or category, or check back soon.')}</section>`;
    }).join('');
  };
  main.querySelector('#live-search').oninput = drawEvents; main.querySelector('#live-category').onchange = drawEvents; drawEvents();
}
function documentation() { main.innerHTML = documentationContent(); }
async function init() {
  apiError = ''; document.querySelector('#request-error').hidden = true;
  try {
    const results = await Promise.allSettled([api('/events'), api('/config')]);
    if (results[0].status === 'fulfilled') events = results[0].value;
    if (results[1].status === 'fulfilled') config = results[1].value;
    apiError = results.filter(result => result.status === 'rejected').map(result => result.reason.message).join(' ');
    const restored = await api('/auth/me').catch(() => null);
    if (restored?.wallet) { session = restored; connectedWallet = getAddress(restored.wallet); walletClient.restore(); }
    walletHeader();
    all('[data-network-name]').forEach(node => { node.textContent = config.chainName; });

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

window.addEventListener('hashchange', () => { if (!/^#(?:doc|guide)-/.test(location.hash)) window.scrollTo({top:0,behavior:'instant'}); render(); });

function connectionState() {
  const offline = !navigator.onLine;
  const stateNode = document.querySelector('#connection-state');
  if (stateNode) {
    const wrong = Boolean(activeChain && activeChain !== chainHex());
    stateNode.textContent = wrong ? `Your wallet is on another network. Use the header network button to switch to ${config.chainName}.` : offline ? 'Offline · live records and blockchain writes require connectivity.' : `${config.chainName || 'Configured'} development network · collectibles are testnet assets`;
    stateNode.hidden = !offline && !wrong;
  }
  document.body.classList.toggle('offline', offline);
}
window.addEventListener('offline', connectionState);
window.addEventListener('online', () => { connectionState(); init(); });
connectionState();

if ('serviceWorker' in navigator) {
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) {
      const node = document.querySelector('#app-update'); node.hidden = false;
      node.querySelector('button').onclick = () => location.reload();
    }
    hadController = true;
  });
  navigator.serviceWorker.register('/sw.js', {updateViaCache:'none'}).then(registration => registration.update()).catch(() => {});
}
let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; document.querySelector('#install-app').hidden = false; });
document.querySelector('#install-app')?.addEventListener('click', async () => { await installPrompt?.prompt(); document.querySelector('#install-app').hidden = true; installPrompt = null; });

init();

$('.coin-fallback').innerHTML = badgeSvg('flower', 'fallback', 'GOOD TIMES GROW HERE');
mountCoin($('#coin-stage'), $('#spin-coin'), $('#pause-motion'));
mountPress($('#press-art'), $('#press-button'), $('#press-readout'));
document.addEventListener('poap-motion', event => { $('#pause-motion').setAttribute('aria-pressed', String(event.detail)); $('#pause-motion').setAttribute('aria-label', event.detail ? 'Resume animations' : 'Pause animations'); });
