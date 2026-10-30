import { installPrivy } from './privy.js';
import { circularArtwork } from './circular-artwork.js';
import { createApiClient } from './api.js';
import { csv } from '../serverless/claims.js';
import { eventState, isPublicPastEvent, matchesEvent, profileStats, filterCollection, groupCollection } from './student-model.js';
import { claimEntry } from './claim-route.js';
import { BrowserProvider, Contract, getAddress, hexlify, toUtf8Bytes } from 'ethers';
import { badgeSvg } from './art.js';
import { mountHomeArt } from './home-art.js';
import { mountNative } from './native.js';
import { metaMaskWallet } from './wallet.js';
import { aboutContent, issuerContent, doodle } from './content.js';
import { createPageLoader } from './page-loader.js';
import { preserveEventDraft } from './event-draft.js';
import { submitPublication, uncertainPublication } from './publication.js';

const $ = (selector, parent = document) => parent.querySelector(selector);
const all = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const main = document.createElement('section');
main.id = 'live-app'; main.className = 'wrap live-app';
document.querySelector('main').append(main);
const entryDrop = claimEntry(new URL(location.href));
const modal = document.querySelector('#modal');
const modalBody = document.querySelector('#modal-body');
installPrivy(window, document);
const pageLoader = createPageLoader(document, window);
pageLoader.begin();
let initialized = false, homeArtMounted = false;

let connectedWallet = '', activeChain = '', collectionRequest = 0;
let events = [], config = {}, session = null, renderId = 0;
let ticketTimer = null, pageTimer = null, drawEvents = null, ticketView = 0;
let apiError = '', configError = '';
let configRequest;
let walletRevision = 0, logoutRequest = Promise.resolve(), signInRequest = Promise.resolve();
const walletClient = metaMaskWallet(window, async (event, value) => {
  if (event === 'accountsChanged' && value?.length===1 && typeof value?.[0] === 'string' && value[0].toLowerCase() === connectedWallet.toLowerCase()) return;
  if (event === 'chainChanged') { activeChain = value; walletHeader(); connectionState(); return; }
  const revision = ++walletRevision;
  session = null; connectedWallet = ''; collectionRequest++;
  logoutRequest = post('/auth/logout', {}).catch(() => {});
  walletHeader(); close(); await logoutRequest;
  if (revision !== walletRevision) return;
  if (event === 'accountsChanged' && value?.length===1 && value?.[0]) {
    try { connectedWallet = getAddress(value[0]); walletHeader(); await connect(true); } catch (error) { if (revision === walletRevision) { session = null; connectedWallet = ''; walletHeader(); toast(error.message); } }
  } else { await walletClient.disconnect(); activeChain = ''; if(event==='accountsChanged'&&value?.length>1)toast('Select exactly one account in MetaMask, then connect again.'); }
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
  if (button.disabled) return;
  const content = [...button.childNodes]; button.disabled = true; button.setAttribute('aria-disabled', 'true'); button.setAttribute('aria-busy', 'true'); button.textContent = 'One moment…';
  try { return await action(); } catch (error) { if(button.id==='publish-button'){const status=document.querySelector('#publish-status');if(status?.querySelector('.inline-loading'))status.textContent=error.message;}retryNotice(error,() => button.isConnected ? busy(button,action) : render()); toast(error.code === 4001 || error.code === 'ACTION_REJECTED' ? 'Request cancelled. You can try again.' : error.code === -32002 ? 'A wallet request is already open. Review it in your wallet.' : error.message || 'Something went wrong'); }
  finally { button.disabled = false; button.removeAttribute('aria-disabled'); button.removeAttribute('aria-busy'); button.replaceChildren(...content); if (button.id === 'wallet' || button.id === 'wallet-network') walletHeader(); }
}

function artwork(event) { return event.image && safeImage(event.image) ? `<img width="512" height="512" decoding="async" src="${safeImage(event.image)}" alt="${esc(event.title)} collectible" loading="lazy">` : '<div class="missing-art"><span aria-hidden="true">✧</span><small>No artwork yet</small></div>'; }
function collectibleArtwork(item) { if (item.animationUrl && safeImage(item.animationUrl)) return `<video width="512" height="512" class="collectible-video" src="${safeImage(item.animationUrl)}" poster="${safeImage(item.image)}" controls playsinline preload="metadata" aria-label="${esc(item.title)} video collectible"></video>`; return item.image && safeImage(item.image) ? artwork(item) : '<div class="missing-art"><span aria-hidden="true">✧</span><small>Artwork unavailable</small></div>'; }

function card(event, collection = false) {
 if(!collection&&eventState(event)==='Past event')return `<article class="card past-event-card"><div class="card-art">${artwork(event)}</div><div class="card-body"><h3>${esc(event.title)}</h3><div class="card-info">${esc(event.venue)}</div><div class="card-info">${event.startsAt?date(event.startsAt):'Date unavailable'}</div></div></article>`;
 return `<article class="card"><div class="card-art">${collection?collectibleArtwork(event):artwork(event)}<span class="card-status">${collection?'Ownership verified':eventState(event)}</span></div><div class="card-body"><div class="card-club">${esc(event.club)} · ${esc(event.category)}</div><h3>${esc(event.title)}</h3><span class="pill">${esc(collection?event.role:(event.roles||['Attendee']).join(' · '))}</span>${event.verified?'<span class="pill green">Verified event</span>':''}<div class="card-info">${event.startsAt?date(event.startsAt):'Date unavailable'}</div><div class="card-info">${esc(event.venue)}</div>${!collection&&eventState(event)==='Past event'?`<div class="card-info">Drop #${esc(event.dropId ?? event.id)}${event.tokenId!=null?` · Token #${esc(event.tokenId)}`:''}</div>`:''}<div class="card-bottom"><span>${collection?`Token #${esc(event.tokenId)}`:event.paused?'Minting paused':event.mintEndsAt&&Date.now()/1000>event.mintEndsAt?'Minting closed':'Mint window applies'}</span><a class="card-link" href="#${collection?`badge/${esc(event.tokenId)}/${esc(collectionWallet)}`:`drop/${esc(event.id)}`}">${collection?'View badge':'View event'} ↗</a></div></div></article>`;
}
function loadingMarkup(label) { return `<div class="inline-loading" role="status" aria-label="${esc(label)}">${document.querySelector('#page-loader svg').outerHTML}<div class="skeleton-lines" aria-hidden="true"><span></span><span></span><span></span></div><span>${esc(label)}</span></div>`; }
function empty(title, text) { return `<div class="empty"><span aria-hidden="true">✧</span><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`; }

function show(html) { clearInterval(ticketTimer); modalBody.innerHTML = html; if (!modal.open) modal.showModal(); }
function close() { clearInterval(ticketTimer); modal.close(); }
all('.modal-close').forEach(button => button.addEventListener('click', () => { const dialog = button.closest('dialog'); if (dialog === modal) close(); else dialog?.close(); }));
modal?.addEventListener('close', () => { if (!modal.open) clearInterval(ticketTimer); });
modal?.addEventListener('click', event => { if (event.target === modal) { const r = modal.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } });

function claimForm(event, standalone = true, redeemToken = '') {
 if(event.mintEndsAt&&Date.now()/1000>event.mintEndsAt){
  drawEvents=null;
  main.innerHTML=`<section class="panel claim-panel"><h2>${esc(event.title)}</h2>${event.image?`<div class="dialog-art">${artwork(event)}</div>`:''}<p>${esc(event.description)}</p><p role="status">Minting has closed for this event. Existing POAPs remain in their owners’ galleries.</p><a class="button" href="#gallery">View my gallery</a></section>`;
  return;
 }
 const html=`<h2>${esc(event.title)}</h2><p>Role: <strong>${esc((event.roles||['Attendee'])[0])}</strong></p><p>${esc(event.description)}</p>${event.image?`<div class="dialog-art">${artwork(event)}</div>`:''}<p>Mint window: ${date(event.mintStartsAt)} ${time(event.mintStartsAt)} – ${date(event.mintEndsAt)} ${time(event.mintEndsAt)}</p><div class="notice">${redeemToken?'A link works for whoever opens it first.':'One POAP per wallet and role. Minting requires event approval and an open mint window.'}</div><label id="claim-consent-row" class="checkbox" ${session?'':'hidden'}><input id="claim-consent" type="checkbox"><span>I want this permanent, public POAP in my connected wallet.</span></label><p id="claim-wallet">${session?`Connected: ${esc(session.wallet)}`:'Connect your wallet through Privy to mint this POAP.'}</p><button id="claim-connect" class="button" ${session?'hidden':''}>Connect wallet</button><button id="claim-mint" class="button" ${session?'':'hidden disabled'}>Mint POAP ↗</button>`;
 drawEvents=null; main.innerHTML=`<section class="panel claim-panel">${html}</section>`;
 main.querySelector('#claim-connect').onclick=headerConnect;
 const button=main.querySelector('#claim-mint');
 button.disabled=event.approval==='pending';
 if(event.approval==='pending'){button.textContent='Awaiting event approval';return;}
 button.onclick=()=>busy(button,async()=>{
  if(!session)throw Error('Connect your wallet first');
  if(!main.querySelector('#claim-consent').checked)throw Error('Confirm permanent collectible consent first');
  const authenticated=await api('/auth/me');if(authenticated.wallet!==session.wallet)throw Error('Wallet session changed. Connect again.');
  await signerOnSepolia();
  const qr=new URL(location.href).searchParams.get('qr');
  const result=await post(redeemToken?'/redeem/claim':`/events/${event.id}/claim`,{permanentConsent:true,...(!redeemToken?{qr:qr||'',publicLink:!qr}:{token:redeemToken})});
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
    main.innerHTML=`<section class="mint-success" role="status"><h2>Woo hoo, POAP minted!</h2>${event?.image?`<div class="dialog-art">${artwork(event)}</div>`:''}<h3>${esc(event?.title||'Your POAP')}</h3><p>This POAP signifies your attendance.</p><p>${esc(event?.description||'')}</p><p>Your token ID: <strong>${esc(row.token_id)}</strong></p><p>Your POAP is already in your connected wallet.</p><p>Select the same receiving wallet in MetaMask to import it on Sepolia.</p><button id="mint-add-metamask" class="button button-dark">Add to MetaMask</button><a class="button" href="#collector/collection">View my collection ↗</a><a class="button button-light" href="${txLink(row.tx_hash,row.token_id)}" target="_blank" rel="noopener">View on Etherscan ↗</a></section>`;
    const importButton=main.querySelector('#mint-add-metamask');
    importButton.onclick=()=>busy(importButton,()=>addNFTToMetaMask({ownershipVerified:true,contractAddress:config.contractAddress,tokenId:String(row.token_id)},row.wallet));
   } else main.querySelector('#mint-status').textContent=row.status==='failed'?'Mint failed. Ask the organizer to retry.':row.status==='submitted'?'Awaiting blockchain confirmation…':'Queued for sponsored minting…';
  } catch(error){if(view===ticketView&&main.querySelector('#mint-status'))main.querySelector('#mint-status').textContent=error.message;}
 };
 await refresh();if(view===ticketView&&main.querySelector('#mint-status'))ticketTimer=setInterval(refresh,15000);
}
function walletHeader() {
  const adminProfile=document.querySelector('#admin-profile');
  if(adminProfile){
    adminProfile.hidden=!session?.admin&&!session?.adminUnavailable;
    const message=adminProfile.querySelector?.('span');
    if(message)message.innerHTML=session?.adminUnavailable?'<strong>Admin panel</strong> · Your wallet is configured as super admin. Network verification is unavailable; retry to open your panel.':'<strong>Admin panel</strong> · You can review events and POAP requests.';
  }
  document.querySelector('#wallet').textContent = session ? short(session.wallet) : 'Connect wallet';
  const node = document.querySelector('#wallet-network');
  const wrong = Boolean(activeChain && Number.isSafeInteger(config.chainId) && activeChain !== chainHex());
  node.hidden = !session && !connectedWallet;
  node.textContent = !Number.isSafeInteger(config.chainId) ? 'Retry network' : wrong ? `Switch to ${config.chainName}` : activeChain ? config.chainName : 'Check network';
  node.disabled = Boolean(activeChain) && Number.isSafeInteger(config.chainId) && !wrong;
  node.classList.toggle('wrong-network', wrong);
}
async function ensureConfig() {
  if (Number.isSafeInteger(config.chainId) && config.chainId > 0) return config;
  if (!configRequest) configRequest = api('/config').then(value => {
    if (!Number.isSafeInteger(value.chainId) || value.chainId <= 0 || !value.chainName) throw Error('Kairo returned incomplete wallet network settings. Retry the connection.');
    config=value;if(configError)document.querySelector('#request-error').hidden=true;configError='';return config;
  }).finally(()=>{configRequest=null;});
  return configRequest;
}
function chainHex() {
  if (!Number.isSafeInteger(config.chainId) || config.chainId <= 0) throw Error('Wallet network configuration is unavailable. Reload and try again.');
  return `0x${config.chainId.toString(16)}`;
}
async function switchNetwork(provider = walletClient.provider, updateHeader = true) {
  await ensureConfig();
  if (await provider.request({method:'eth_chainId'}) !== chainHex()) {
    try { await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:chainHex()}]}); }
    catch (error) {
      if (error.code !== 4902 || !config.walletNetwork) throw error;
      await provider.request({method:'wallet_addEthereumChain',params:[config.walletNetwork]});
      await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:chainHex()}]});
    }
  }
  if(updateHeader)await updateNetwork();
  const chain=updateHeader?activeChain:await provider.request({method:'eth_chainId'});
  if (chain !== chainHex()) throw Error(`Switch to ${config.chainName} in your wallet to continue.`);
}
function headerConnect() {
  close();
  const button = document.querySelector('#wallet');
  if (!button.disabled) return button.onclick();
}
async function connect(accountChanged = false, switchAccount = false) {
  await ensureConfig();
  if (!accountChanged&&!connectedWallet) await connectWallet(switchAccount);
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
    let signature;
    try { signature = await walletClient.provider.request({method:'personal_sign',params:[hexlify(toUtf8Bytes(challenge.message)),wallet]}); }
    catch(error) {
      const walletError=error?.error?.code===4100?error.error:error;
      if(walletError?.code===4100&&/spam filter/i.test(walletError.message||''))throw Object.assign(Error('MetaMask blocked the sign-in request as spam. Check that you opened the intended Kairo URL and selected one account, then try again. If it persists, report the false positive to MetaMask.'),{code:'WALLET_SPAM_BLOCK'});
      throw error;
    }
    const selected = await walletClient.provider.request({method:'eth_accounts'});
    if (await walletClient.provider.request({method:'eth_chainId'}) !== chainHex()) throw Error('Network changed during sign-in. Switch networks and try again.');
    if (revision !== walletRevision || selected.length!==1 || selected[0]?.toLowerCase() !== wallet.toLowerCase()) throw Error('Wallet changed during sign-in. Use Connect wallet again.');
    await post('/auth/verify', {id:challenge.id, signature});
    if (revision !== walletRevision) { await post('/auth/logout', {}); throw Error('Wallet changed during sign-in.'); }
    const authenticated = await api('/auth/me');
    if (revision !== walletRevision || authenticated.wallet?.toLowerCase() !== wallet.toLowerCase() || connectedWallet.toLowerCase() !== wallet.toLowerCase()) {
      await post('/auth/logout', {}); throw Error('Sign-in does not match the approved account.');
    }
    session = authenticated; walletHeader();
    return signer;
  } catch (error) {
    if (revision === walletRevision) { session = null; if(error.code!=='WALLET_SPAM_BLOCK'){connectedWallet = ''; activeChain = '';} walletHeader(); }
    throw error;
  } finally { release(); }
}
document.querySelector('#wallet').onclick = () => busy(document.querySelector('#wallet'), async () => {
  if (!session) {
    await connect(); await render();
    return;
  }
  show(`<h2>${session.superAdmin?'Your superadmin profile':session.admin?'Your admin profile':'Your wallet'}</h2><code class="wallet-address">${esc(session.wallet)}</code><p>${session.admin?'You are signed in to the admin panel. Review POAP requests and manage events from your dashboard.':'One connected wallet is used per Kairo session. Use Privy to choose a different wallet.'}</p>${session.admin?'<a class="button button-dark" href="#admin">Events & requests ↗</a>':''}<a class="button button-light" href="#gallery">My gallery</a><div class="form-actions"><button id="wallet-change" class="button">Switch account</button><button id="wallet-copy" class="button button-light">Copy address</button><button id="wallet-disconnect" class="button button-light">Disconnect</button></div>`);
  modalBody.querySelector('#wallet-copy').onclick = event => busy(event.target, async () => { if (!navigator.clipboard?.writeText) throw Error('Copy is unavailable here. Select the address above to copy it.'); await navigator.clipboard.writeText(session.wallet); toast('Wallet address copied'); });
  modalBody.querySelector('#wallet-change').onclick = event => busy(event.target, async () => {
    session=null;connectedWallet='';activeChain='';walletRevision++;collectionRequest++;walletHeader();close();
    logoutRequest=post('/auth/logout',{});
    await Promise.all([logoutRequest,walletClient.disconnect({switchAccount:true})]);
    try { await connect(false,true); } finally { walletHeader(); await render(); }
  });
  modalBody.querySelector('#wallet-disconnect').onclick = event => busy(event.target, async () => {
    session = null; connectedWallet = ''; activeChain = ''; walletRevision++; collectionRequest++; walletHeader();
    await Promise.all([post('/auth/logout', {}), walletClient.disconnect()]); close(); await render();
  });
});
async function connectWallet(switchAccount = false) {
  chainHex();
  connectedWallet = ''; session = null; const revision = ++walletRevision;
  document.querySelector('#wallet').textContent = 'Opening Privy…';
  const account = await walletClient.connect('metamask',{switchAccount});
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
 show(`<h2>${esc(event.title)}</h2><div class="dialog-art">${artwork(event)}</div><p>${esc(event.description)}</p><p>${esc(event.venue)} · ${date(event.startsAt)}</p><p>Role: ${esc((event.roles||['Attendee'])[0])}</p><p>Minting: ${date(event.mintStartsAt)} ${time(event.mintStartsAt)} – ${date(event.mintEndsAt)} ${time(event.mintEndsAt)}</p><div class="notice">${mintEnded?'Minting has closed for this event. Existing POAPs remain in their owners’ galleries.':'Request a POAP for super admin review, use a recipient link, or scan the organizer’s live Walk-in QR. One POAP per event, role and wallet. Published badge artwork and the mint window are permanent.'}</div>${event.groupId?`<nav class="chips">${events.filter(item=>item.groupId===event.groupId).map(item=>`<a class="pill" href="#drop/${esc(item.id)}">${esc(item.roles[0])}</a>`).join('')}</nav>`:''}${session?`<form id="poap-request"><label class="checkbox"><input type="checkbox" required><span>I consent to a permanent, non-transferable POAP being minted to my connected wallet.</span></label><button class="button" disabled>Request POAP</button><p id="request-status" role="status">Checking request status…</p></form><a class="text-link" href="#gallery">View my POAPs in Gallery ↗</a>`:`<p>${mintEnded?'Minting is closed. Connect your wallet to view your POAPs in Gallery.':'Connect your wallet to request a POAP for super admin review.'}</p>`}`);
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

async function addNFTToMetaMask(item,owner) {
 if(!item?.ownershipVerified||!session||session.wallet.toLowerCase()!==owner.toLowerCase())throw Error('Sign in with the wallet that owns this POAP.');
 const address=getAddress(item.contractAddress);
 if(address==='0x0000000000000000000000000000000000000000'||!/^\d+$/.test(item.tokenId))throw Error('This POAP’s import details are unavailable.');
 const provider=await walletClient.metaMaskProvider();
 let accounts=await provider.request({method:'eth_accounts'});
 if(!accounts.length)accounts=await provider.request({method:'eth_requestAccounts'});
 if(accounts.length!==1||accounts[0].toLowerCase()!==owner.toLowerCase())throw Error('Select the same receiving wallet in MetaMask to import this POAP.');
 await switchNetwork(provider,false);
 accounts=await provider.request({method:'eth_accounts'});
 if(!session||session.wallet.toLowerCase()!==owner.toLowerCase()||accounts.length!==1||accounts[0].toLowerCase()!==owner.toLowerCase())throw Error('Wallet changed. Select the receiving wallet and try again.');
 try {
  const added=await provider.request({method:'wallet_watchAsset',params:{type:'ERC721',options:{address,tokenId:item.tokenId}}});
  toast(added?'POAP added to MetaMask.':'POAP import was cancelled. Your NFT is still in your wallet.');
 }catch(error) {
  if([4200,-32601,-32602].includes(error.code))throw Error('This MetaMask version does not support one-click NFT import. Open the POAP’s import details and use the copy buttons.');
  throw error;
 }
}
function badgeDetails(item) {
  const owner=collectionWallet;
  const back=session?.wallet?.toLowerCase()===owner.toLowerCase()?'#gallery':`#collection/${owner}`;
  close();
  main.innerHTML=`<a class="back-link" href="${esc(back)}">← Back to gallery</a><section class="panel badge-details"><div class="eyebrow">KAIRO / COLLECTIBLE #${esc(item.tokenId)}</div><h1 class="page-title">${esc(item.title)}</h1><div class="dialog-art">${collectibleArtwork(item)}</div><span class="pill green">On-chain ownership verified</span><span class="pill">${esc(item.role)}</span><p class="muted">${esc(item.description || 'Description unavailable for this collectible.')}</p><dl class="detail-grid"><div><dt>Organization</dt><dd>${esc(item.club)}</dd></div><div><dt>Organizer</dt><dd><code>${esc(short(item.organizer))}</code></dd></div><div><dt>Event date</dt><dd>${item.startsAt ? date(item.startsAt) : 'Not recorded'}</dd></div><div><dt>Issuance date</dt><dd>${item.issuedAt ? date(item.issuedAt) : 'Not indexed yet'}</dd></div><div><dt>Attendance</dt><dd>${item.claimMethod === 'verifier-check-in' && item.attendanceVerified ? 'Presence verified by organizer' : 'Presence not verified'}</dd></div><div><dt>Claim method</dt><dd>${esc(({'LINK':'Recipient link','QR':'Walk-in QR','LEGACY':'Earlier issuance','ADMIN':'Super admin mint'})[item.claimMethod] || 'Not recorded')}</dd></div><div><dt>Metadata</dt><dd>${esc(item.metadataStatus)}</dd></div><div><dt>Network</dt><dd>${esc(config.chainName)}</dd></div><div><dt>Token ID</dt><dd>${esc(item.tokenId)}</dd></div><div><dt>NFT contract address</dt><dd><code class="wallet-address">${esc(item.contractAddress||'Unavailable')}</code></dd></div></dl><section class="panel" aria-label="MetaMask import details"><h3>View this POAP in MetaMask</h3>${session?.wallet?.toLowerCase()===owner.toLowerCase()&&item.ownershipVerified&&item.contractAddress?'<button class="button button-dark" id="add-nft-metamask">Add to MetaMask</button>':''}<p>One-click import prompts a supported MetaMask extension with the details already filled in. If your wallet does not support it, use the copy buttons below.</p><p>This POAP is already owned by the wallet you are viewing. To display it in MetaMask, select the receiving account and ${esc(config.chainName)}, open NFTs → Import NFT, and enter this contract address and token ID. Importing does not mint again.</p><p><strong>Contract:</strong> <code class="wallet-address">${esc(item.contractAddress||'Unavailable')}</code><br><strong>Token ID:</strong> ${esc(item.tokenId)}</p><div class="form-actions"><button class="button button-light" id="copy-nft-contract" ${item.contractAddress?'':'disabled'}>Copy contract address</button><button class="button button-light" id="copy-nft-token">Copy token ID</button></div></section><a class="button button-light" href="${txLink(item.transactionHash, item.tokenId, item.contractAddress)}" target="_blank" rel="noopener">View blockchain proof ↗</a><div class="notice">Permanent and non-transferable. This wallet address is not a verified real-world identity.</div></section>`;
  main.querySelector('.notice')?.append(' MetaMask may offer Hide or Remove; that only changes its display. This POAP cannot be burned or transferred.');
  const addButton=main.querySelector('#add-nft-metamask');
  if(addButton)addButton.onclick=()=>busy(addButton,()=>addNFTToMetaMask(item,owner));
  for(const [id,value] of [['copy-nft-contract',item.contractAddress],['copy-nft-token',item.tokenId]])main.querySelector('#'+id).onclick=event=>busy(event.target,async()=>{
   if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable. Copy the contract address and token ID shown above.');
   await navigator.clipboard.writeText(value);toast(id==='copy-nft-contract'?'NFT contract address copied.':'Token ID copied.');
  });
}
async function collection(version, profile = false) {
  const ownGallery = ['#gallery','#collector/collection'].includes(location.hash);
  if (ownGallery && !session) { main.innerHTML = empty('Your moments, together', 'Connect your wallet to see the POAPs you have collected.') + '<div class="form-actions"><a class="text-link" href="#">← Back to home</a></div>'; return; }
  const addressFromRoute = (location.hash.startsWith('#collector/') ? '' : location.hash.split('/')[profile ? 1 : location.hash.startsWith('#badge/') ? 2 : 1]);
  const savedWallet = addressFromRoute || connectedWallet || session?.wallet || '';
  main.innerHTML = `<div class="eyebrow">${profile ? 'YOUR PARTICIPATION, VERIFIED' : 'A RECORD OF YOUR MOMENTS'}</div><h1 class="page-title">${profile ? 'Your participation profile.' : 'Your collection.'}</h1><p class="lead">${profile ? 'A public wallet profile, built from verified participation. Your identity stays yours.' : 'The communities, ideas, and experiences you carry with you.'}</p><form id="collection-form" class="panel wallet-lookup"><label class="field">Ethereum wallet address<input id="collection-wallet" required placeholder="0x…" value="${esc(savedWallet)}" autocomplete="off" spellcheck="false"></label><button class="button">View ${profile ? 'profile' : 'collection'} ↗</button></form><div class="form-actions"><button class="button button-light" id="refresh-collection">Refresh Gallery ↻</button></div><div id="profile-stats"></div><div id="collection-status" role="status" aria-live="polite"></div><div id="collection-tools"></div><div id="collection-grid">${empty('Your story is waiting', 'Connect a wallet or enter an address. Viewing public collectibles does not require a signature.')}</div><div id="collection-more"></div>`;
  const form = main.querySelector('#collection-form');
  main.querySelector('#refresh-collection').onclick=()=>form.requestSubmit();
  if (ownGallery) { ticketTimer=setInterval(()=>{if(version===renderId&&!document.hidden&&!modal.open)form.requestSubmit();},15000); main.querySelector('#collection-wallet').readOnly = true; form.hidden = true; }
  form.onsubmit = event => { event.preventDefault(); if(!form.isConnected||version!==renderId)return;return busy(form.querySelector('button'), async () => {
    const wallet = getAddress(main.querySelector('#collection-wallet').value.trim());
    const requestId = ++collectionRequest; collectionWallet = wallet; collectionItems = [];
    const status = main.querySelector('#collection-status'); const grid = main.querySelector('#collection-grid');
    grid.innerHTML = loadingMarkup('Loading your POAPs');status.replaceChildren();
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
      grid.innerHTML = rows.length ? `<div class="gallery-events">${groupCollection(rows).map(group => `<section class="gallery-event"><h2>${esc(group.event.title)}</h2>${ownGallery ? '' : `<p>${esc(group.event.club)}</p>`}<div class="grid">${group.badges.map(row => ownGallery ? `<article class="gallery-badge-entry"><div class="card gallery-badge"><div class="card-art">${collectibleArtwork(row)}</div><a class="gallery-badge-info" href="#badge/${esc(row.tokenId)}/${esc(collectionWallet)}" aria-label="View ${esc(row.title)} ${esc(row.role)} POAP"><strong>Token #${esc(row.tokenId)}</strong><span>${esc(row.role)} · Import details ↗</span><span>Permanent · Soulbound</span></a></div><button class="button button-light" data-add-nft data-contract="${esc(row.contractAddress)}" data-token="${esc(row.tokenId)}" ${row.ownershipVerified&&row.contractAddress?'':'disabled'}>Add to MetaMask</button></article>` : card(row, true)).join('')}</div></section>`).join('')}</div>` : collectionItems.length ? empty('No matching collectibles', 'Try another search or filter.') : complete && total === 0 ? `${empty('Your first moment is ahead of you', 'Discover an event, participate, and keep a collectible from the experience.')}<a class="button" href="#collector/gallery">Discover events ↗</a>` : empty('Your collection is still being checked', 'Ownership is checked on-chain. Records may take a moment to load.');
      grid.querySelectorAll('[data-add-nft]').forEach(button=>button.onclick=()=>busy(button,()=>addNFTToMetaMask(collectionItems.find(item=>item.contractAddress===button.dataset.contract&&item.tokenId===button.dataset.token),wallet)));
      status.innerHTML = ownGallery ? '' : `<div class="notice">${complete ? `${collectionItems.length} of ${esc(total)} on-chain collectibles loaded.` : `Checking the Kairo contract… ${collectionItems.length} of ${esc(total)} collectibles loaded.`}${complete && collectionItems.length < total ? ' Some records are not indexed yet. Retry shortly; this is not an empty collection.' : ''}${pending&&!ownGallery ? ` ${esc(pending)} issuance${pending > 1 ? 's' : ''} awaiting confirmation.` : ''} Only the configured Kairo contract is included. <a class="card-link" href="#${profile ? 'collection' : 'profile'}/${wallet}">${profile ? 'View collection' : 'View profile'} ↗</a></div>`;
    };
    const load = async () => {
      if(!current())return;
      main.querySelector('#collection-more').innerHTML = '';
      try {
        do {
          const page = await api(`/wallet-collection?wallet=${wallet}&cursor=${cursor}`);
          if (!current()) return;
          if (!Array.isArray(page.items) || !Number.isSafeInteger(page.total) || page.total < 0 || !(page.nextCursor === null || Number.isSafeInteger(page.nextCursor) && page.nextCursor > cursor)) throw Error('Kairo returned an incomplete collection. Retry to check your wallet.');
          total = page.total; pending = page.pending;
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
  if (savedWallet) await form.onsubmit({preventDefault(){}});
}

function downloadCSV(filename,rows) {
 const link=document.createElement('a'),url=URL.createObjectURL(new Blob([csv(rows)],{type:'text/csv'}));
 link.href=url;link.download=filename;link.click();URL.revokeObjectURL(url);
}
let workspacePage=0;
async function organizer(version,adminView=false) {
 main.innerHTML=`<a class="back-link" href="#${adminView?'admin':'issuer/studio'}">← Back to ${adminView?'admin panel':'studio'}</a><h1>${adminView?'POAP requests & event management':'Event dashboard'}</h1>${adminView?'<p>You are signed in as superadmin. Choose an event and role, then accept or reject the requests below. Accepting queues a sponsored mint to that wallet.</p>':''}<p>Badge artwork and the mint window are frozen on chain and cannot be edited.</p>${session?'<label class="field">Event and role<select id="staff-event"><option value="">Choose an event…</option></select></label><div id="event-pages"></div><div id="staff-content"></div>':'<p>Sign in with your shared wallet session to manage your events.</p>'}`;
 if(!session)return;
 let workspace;try{workspace=await api(`/${adminView?'admin':'organizer'}/events?page=${workspacePage}`);}catch(error){const content=main.querySelector('#staff-content');if(version===renderId&&content)content.textContent=error.message;return;}if(version!==renderId)return;
 const select=main.querySelector('#staff-event');select.innerHTML+=workspace.events.map(e=>`<option value="${e.id}">${esc(e.title)} · ${esc(e.roles[0])}${adminView?` · ${e.pendingRequests||0} pending requests`:''}${e.deleted?' · Deleted':e.listed?'':' · Rejected'}</option>`).join('');
 pageControls(main.querySelector('#event-pages'),workspacePage,workspace.hasMore,'Events',page=>{workspacePage=page;organizer(version,adminView);});
 if(!workspace.events.length){select.hidden=true;main.querySelector('#staff-content').innerHTML='<section class="studio-empty"><h2>No events to manage yet.</h2><p>Your published events and role badges will appear here.</p><a class="button button-dark" href="#create">Create an event</a></section>';return;}
 let page=0,linksPage=0,requestsPage=0;
 select.onchange=async changed=>{
  if(changed && !changed.background){page=0;linksPage=0;requestsPage=0;}
  if(!select.value)return;const id=Number(select.value),event=workspace.events.find(e=>e.id===id),content=main.querySelector('#staff-content');
  if(changed?.target===select || !content.children.length)content.innerHTML=loadingMarkup('Loading event dashboard');
  try {
   const [stats,transactions,recipientPage,requests]=await Promise.all([api(`/events/${id}/dashboard`),api(`/events/${id}/transactions?page=${page}`),api(`/events/${id}/links?page=${linksPage}`),adminView?api(`/events/${id}/requests?page=${requestsPage}`):null]);
   if(version!==renderId||Number(select.value)!==id||changed?.background&&content.dataset.editing==='true')return;
   if(stats.event)Object.assign(event,stats.event);
   const creator=event.organizer?.toLowerCase()===session.wallet.toLowerCase();
   const links=recipientPage.rows;
   const mintStart=stats.mintStartsAt??event.mintStartsAt,mintEnd=stats.mintEndsAt??event.mintEndsAt;
   const mintReady=event.approval!=='pending'&&event.listed&&!event.paused&&!stats.paused&&Date.now()/1000>=mintStart&&Date.now()/1000<=mintEnd&&stats.capRemaining>0;
   const mintReason=mintReady?'Ready to mint on Sepolia.':event.approval==='pending'?'Awaiting super-admin approval.':!event.listed?'Event rejected.':event.paused||stats.paused?'Minting is paused.':Date.now()/1000<mintStart?'The mint window has not opened.':Date.now()/1000>mintEnd?'The mint window has ended.':'No supply remains.';
   content.innerHTML=`${event.approval==='pending'?'<div class="notice" role="status">Awaiting super-admin approval. Participants can mint after this event is approved.</div>':''}${adminView&&!event.deleted?`<section class="panel event-approval" aria-labelledby="event-approval-title"><h2 id="event-approval-title">Event approval</h2><p>${esc(event.title)} · ${esc(event.venue)}</p><p>${event.approval==='approved'?'This event is approved.':event.approval==='rejected'?'This event was rejected.':'Review this organizer’s event before participants can mint POAPs.'}</p><button class="button button-dark" data-admin="verify" ${event.approval==='approved'?'disabled':''}>${event.approval==='approved'?'Event approved':'Accept event'}</button><form id="reject-event"><label class="field">Rejection reason<textarea name="reason" required maxlength="1000"></textarea></label><button class="button button-danger">Reject event</button></form></section>`:''}${adminView?`<section class="panel" aria-label="POAP request review"><h2>POAP requests · ${esc(event.roles[0])}</h2><div class="table-wrap" role="region" aria-label="Scrollable data table" tabindex="0"><table><thead><tr><th>Address</th><th>Status</th><th>Actions</th></tr></thead><tbody>${requests.rows.map(row=>`<tr><td>${esc(row.wallet)}</td><td>${esc(row.status)}${row.mint_status?` · ${esc(row.mint_status)}`:''}${row.error?`<small>${esc(row.error)}</small>`:''}</td><td>${row.status==='pending'?`<button class="button button-small" data-request="${esc(row.id)}" data-decision="accept" ${mintReady?'':'disabled'}>Accept & mint</button><button class="button button-danger button-small" data-request="${esc(row.id)}" data-decision="reject">Reject</button>`:''}</td></tr>`).join('')||'<tr><td colspan="3">No POAP requests yet.</td></tr>'}</tbody></table></div><div id="request-pages"></div></section>`:''}<div class="stats claim-stats">${[['Links issued',stats.linksIssued],['Links used',stats.linksUsed],['Minted',stats.minted],['Pending',stats.pending],['Failed',stats.failed],['Cap remaining',stats.capRemaining??'Unlimited']].map(([name,value])=>`<div class="stat"><small>${name}</small><strong>${esc(value)}</strong></div>`).join('')}</div><div class="form-actions"><button id="refresh-dashboard" class="button button-light">Refresh</button><a class="button button-light" href="/api/events/${id}/export" download>Export transactions CSV</a></div><p>Approved events can be shared using their public mint link. Participants connect through Privy and mint during the configured window.</p>${event.approval==='pending'?'<section class="notice"><h2>Public mint link</h2><p>Your event is awaiting super-admin approval. The participant mint link will appear here after approval.</p></section>':event.listed?`<section class="panel"><h2>Public mint link</h2><p>Share this link with participants. They can connect through Privy and mint their POAP during the minting window.</p><input id="public-mint-link" aria-label="Public mint link" readonly value="${esc(location.origin)}/#drop/${esc(id)}"><button id="copy-public-mint-link" class="button button-light" type="button">Copy mint link</button></section>`:''}<h2>Single-use recipient links</h2><p>A link works for whoever opens it first. Emails are private to you and the super admin and are deleted after ${esc(config.emailRetentionDays||30)} days, or on request. Save links when issued: only their hashes are stored.</p><form id="recipients-form"><label class="field">Paste email,role CSV (or enter one person per line)<textarea name="recipients" required placeholder="email,role&#10;person@example.org,Attendee"></textarea></label><label class="field">Or upload CSV<input id="recipient-file" type="file" accept=".csv,text/csv"></label><button class="button">Create links</button></form><div id="issued-links"></div><button class="button button-light" id="erase-emails">Delete all emails for this role</button><div class="table-wrap" role="region" aria-label="Scrollable data table" tabindex="0"><table><thead><tr><th>Email</th><th>State</th><th>Actions</th></tr></thead><tbody>${links.map(link=>`<tr><td>${esc(link.email||'Email deleted')}</td><td>${esc(link.revoked_at?'Revoked':link.state)}</td><td>${link.state==='issued'?`<button class="button button-light button-small" data-regenerate="${esc(link.id)}">Regenerate</button><button class="button button-light button-small" data-revoke="${esc(link.id)}">Revoke</button>`:''}<button class="button button-light button-small" data-delete-email="${esc(link.id)}">Delete email</button></td></tr>`).join('')||'<tr><td colspan="3" class="table-empty">No recipient links yet. Add recipients above to get started.</td></tr>'}</tbody></table></div><div id="link-pages"></div><h2>Transactions · ${esc(event.roles[0])}</h2><div class="table-wrap" role="region" aria-label="Scrollable data table" tabindex="0"><table><thead><tr><th>Wallet</th><th>Role</th><th>Claim method</th><th>Token</th><th>Status</th><th>Time</th><th>Transaction</th></tr></thead><tbody>${transactions.rows.map(row=>`<tr><td>${esc(row.wallet)}</td><td>${esc(event.roles[0])}</td><td>${esc(row.method)}</td><td>${esc(row.token_id||'—')}</td><td>${esc(row.status)}${row.error?`<small>${esc(row.error)}</small>`:''}${row.status==='failed'?` <button class="button button-light button-small" data-retry="${esc(row.id)}">Retry</button>`:''}</td><td>${date(row.created_at)} ${time(row.created_at)}</td><td>${row.tx_hash?`<a href="${txLink(row.tx_hash)}" target="_blank" rel="noopener">Etherscan ↗</a>`:'Queued'}</td></tr>`).join('')||'<tr><td colspan="7" class="table-empty">No claims yet. Transactions will appear here when participants mint.</td></tr>'}</tbody></table></div><div id="transaction-pages"></div>${adminView&&!event.deleted?`<section class="panel admin-event-tools"><h2>Mint POAP to an address</h2><p>Mint the selected role directly to a recipient. POAPs are permanent and cannot be transferred or burned. Check the address before minting.</p><form id="direct-mint"><label class="field">Recipient Ethereum address<input name="wallet" required pattern="0x[a-fA-F0-9]{40}" placeholder="0x…" autocomplete="off" spellcheck="false"></label><button class="button" ${mintReady?'':'disabled'}>Mint POAP</button></form><p role="status">${esc(mintReason)} Mint window: ${date(mintStart)} ${time(mintStart)} – ${date(mintEnd)} ${time(mintEnd)}.</p><h2>Minting controls</h2><p>Pause or resume minting for every role of this event.</p><div class="form-actions"><button class="button button-light button-small" data-admin="pause">Pause minting</button><button class="button button-light button-small" data-admin="resume">Resume minting</button></div></section>`:''}${(adminView||creator)&&!event.deleted?`<section class="panel"><h2>Edit event details</h2><form id="edit-event"><label class="field">Title<input name="title" value="${esc(event.title)}" required maxlength="100"></label><label class="field">Description<textarea name="description" required maxlength="1000">${esc(event.description)}</textarea></label><label class="field">Venue<input name="venue" value="${esc(event.venue)}" required maxlength="300"></label><label class="field">Category<select name="category">${config.categories.map(c=>`<option ${c===event.category?'selected':''}>${esc(c)}</option>`).join('')}</select></label><label class="field">Organization<input name="club" value="${esc(event.club||'')}" required minlength="2" maxlength="80"></label><label class="field">Campus<input name="campus" value="${esc(event.campus||'')}" maxlength="100"></label><label class="field">Event starts<input name="eventStartsAt" type="datetime-local" required value="${localInput(event.startsAt)}"></label><label class="field">Event ends<input name="eventEndsAt" type="datetime-local" required value="${localInput(event.endsAt)}"></label><label class="field">Approximate attendees<input name="approximateAttendees" type="number" min="1" max="100000" required value="${esc(event.approximateAttendees||1)}"></label><p>These changes update the event listing. Published POAP artwork, badge metadata, supply and mint dates stay permanent.</p><button class="button button-dark">Save event details</button></form></section>`:''}${creator&&!event.deleted?`<section class="panel"><h2>Delete event listing</h2><p>Removes every role of this event from discovery and blocks new claims. Existing POAPs, artwork and transaction history stay permanent. A mint already submitted may confirm before the pause.</p><form id="delete-event"><label class="checkbox"><input type="checkbox" required><span>I want to remove this event listing and stop new mint requests.</span></label><button class="button button-danger">Delete event</button></form></section>`:''}`;
   content.dataset.editing='false';content.oninput=()=>{content.dataset.editing='true';};
   content.querySelector('#refresh-dashboard').onclick=select.onchange;
   const copyLink=content.querySelector('#copy-public-mint-link');
   if(copyLink)copyLink.onclick=()=>busy(copyLink,async()=>{
    if(!navigator.clipboard?.writeText)throw Error('Select and copy the public mint link above.');
    await navigator.clipboard.writeText(content.querySelector('#public-mint-link').value);toast('Public mint link copied.');
   });
   pageControls(content.querySelector('#transaction-pages'),page,transactions.hasMore,'Transactions',value=>{page=value;select.onchange();});
   pageControls(content.querySelector('#link-pages'),linksPage,recipientPage.hasMore,'Recipient links',value=>{linksPage=value;select.onchange();});
   function issued(rows) {
    content.dataset.editing='true';
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
   const editForm=content.querySelector('#edit-event');
   if(editForm)editForm.onsubmit=e=>{e.preventDefault();busy(editForm.querySelector('button'),async()=>{
    const fields=editForm.elements;
    await post(`/${adminView?'admin':'organizer'}/events/${id}`,{action:'edit',...Object.fromEntries(['title','description','venue','category','club','campus'].map(name=>[name,fields[name].value])),...Object.fromEntries(['eventStartsAt','eventEndsAt'].map(name=>[name,Math.floor(new Date(fields[name].value).getTime()/1000)])),approximateAttendees:Number(fields.approximateAttendees.value)});
    events=await api('/events');await select.onchange();toast('Event details updated. Published POAPs and mint dates stay permanent.');
   });};
   const deleteForm=content.querySelector('#delete-event');
   if(deleteForm)deleteForm.onsubmit=e=>{e.preventDefault();busy(deleteForm.querySelector('button'),async()=>{
    if(!deleteForm.querySelector('input').checked)throw Error('Confirm that you want to delete this event listing.');
    await post(`/organizer/events/${id}`,{action:'delete'});events=await api('/events');workspacePage=0;
    location.hash=adminView?'#admin':'#issuer/studio';await render();toast('Event listing deleted. Existing POAPs remain in their owners’ galleries.');
   });};
   if(adminView)pageControls(content.querySelector('#request-pages'),requestsPage,requests.hasMore,'POAP requests',value=>{requestsPage=value;select.onchange();});
   if(adminView&&!event.deleted) {
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

   }
  }catch(error){
   if(version===renderId && Number(select.value)===id){
    let notice=content.querySelector('#dashboard-error');
    if(!notice){notice=document.createElement('div');notice.id='dashboard-error';notice.className='notice';content.prepend(notice);}
    notice.innerHTML=`<p role="alert">Dashboard refresh failed. ${esc(error.message)}</p><button class="button button-small" id="retry-dashboard">Retry</button>`;
    notice.querySelector('button').onclick=()=>select.onchange();
   }
  }
 };
 const requested=Number(location.hash.split('/')[2]);select.value=String(workspace.events.find(event=>event.id===requested)?.id||workspace.events[0].id);await select.onchange();
}
function pageControls(container,page,hasMore,label,onPage) {
 container.innerHTML=page||hasMore?`<nav class="page-controls" aria-label="${esc(label)} pages">${page?`<button class="button button-light button-small" data-page="${page-1}">← Previous</button>`:''}<span>Page ${page+1}</span>${hasMore?`<button class="button button-light button-small" data-page="${page+1}">Next →</button>`:''}</nav>`:'';
 container.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>onPage(Number(button.dataset.page)));
}
function activityHTML(rows,workspace) {
 const names={verify:'Event verified',reject:'Event rejected',edit:'Event details updated',pause:'Minting paused',resume:'Minting resumed',delete:'Event listing deleted','accept-request':'POAP request accepted','direct-mint':'POAP mint queued','reject-request':'POAP request rejected','retry-mint':'Mint retried','issue-links':'Recipient links created',regenerate:'Recipient link regenerated',revoke:'Recipient link revoked','delete-email':'Email deleted','delete-emails':'Event emails deleted'};
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
 const pending=(system?.actions||[]).filter(action=>action.status!=='live');
 const addressURL=address=>{
  try{const url=new URL(`/address/${encodeURIComponent(address)}`,config.explorerUrl);return url.protocol==='https:'?esc(url.href):'';}catch{return '';}
 };
 node.innerHTML=`<section class="system-panel" aria-labelledby="system-heading"><header class="panel-heading"><div><h2 id="system-heading">Gas & network</h2><p>Sponsored transactions on Sepolia</p></div><span class="service-badge ${ready?'is-ready':'needs-setup'}"><i aria-hidden="true"></i>${ready?'Ready':'Setup needed'}</span></header>${!ready?`<div class="setup-note"><strong>${!contractReady?'Connect the updated contract':!funded?'Fund the relayer wallet':'Finish publishing setup'}</strong><p>${!contractReady?'The current deployment needs the updated Kairo contract before events can publish.':!funded?'Add Sepolia test ETH to the wallet below. Organizers and participants still mint for free.':esc(issues[0]?.message||'Some services are unavailable. Check the details below.')}</p></div>`:''}<div class="relayer-balance"><span>Relayer balance</span><strong>${hasBalance?Number(balance).toLocaleString(undefined,{maximumFractionDigits:6}):'Unavailable'}</strong><small>Sepolia ETH · test funds</small></div><div class="system-wallet"><span>Gas-paying wallet</span>${system?.relayer?`<a href="${addressURL(system.relayer)}" target="_blank" rel="noopener"><code>${esc(system.relayer)}</code> ↗</a>`:'<p>Could not load the relayer. Refresh to retry.</p>'}${system?.signerAddress&&system.signerAddress.toLowerCase()!==system.relayer?.toLowerCase()?'<p class="inline-warning">The configured key belongs to a different wallet. Update the relayer key.</p>':''}</div><dl class="system-facts"><div><dt>Super admin</dt><dd>${system?.superAdminOnChain?'Verified on chain':'Awaiting verification'}</dd></div><div><dt>Contract</dt><dd>${contractReady?'Connected':'Update required'}</dd></div></dl></section>${pending.length?`<section class="system-panel"><header class="panel-heading"><h2>Moderation in progress</h2></header><ul class="moderation-list">${pending.map(action=>`<li><span class="service-badge ${action.status==='failed'?'needs-setup':''}">${esc(({pending:'Queued',submitted:'Confirming',failed:'Needs attention'})[action.status]||action.status)}</span><p>${action.status==='failed'?'The transaction could not complete. Check the relayer and contract configuration.':'Your change is saved and waiting for Sepolia confirmation.'}</p>${action.tx_hash?`<a class="text-link" href="${txLink(action.tx_hash)}" target="_blank" rel="noopener">View transaction ↗</a>`:''}</li>`).join('')}</ul></section>`:''}<section class="system-panel activity-panel"><header class="panel-heading"><div><h2>Admin activity</h2><p>A record of changes to your events</p></div></header>${audit?activityHTML(audit.rows,workspace):'<p class="panel-empty">Activity could not load. Refresh to try again.</p>'}<div id="audit-pages"></div></section>`;
 pageControls(node.querySelector('#audit-pages'),auditPage,audit?.hasMore,'Activity',onPage);
}
async function organizerStudio(version,adminView=false) {
 main.innerHTML=`<header class="studio-heading"><div><h1>${adminView?'Super admin panel.':'Organizer studio.'}</h1><p>${adminView?'You are signed in as superadmin. Review POAP requests across all events.':'Your events. Your designs. Your people.'}</p></div>${session?'<a class="button button-dark" href="#create">Create an event ↗</a>':''}</header><nav class="section-tabs" aria-label="Organizer workspace"><a href="#${adminView?'admin':'issuer/studio'}" aria-current="page">${adminView?'All events':'Your events'}</a><a href="#${adminView?'admin/events':'issuer/manage'}">${adminView?'Review POAP requests':'Manage claims'}</a>${adminView?'<button id="refresh-admin-events" class="button button-light button-small">Refresh requests</button>':''}<a href="#issuer/guide">Organizer guide</a></nav>${session?`<div class="studio-layout ${adminView?'with-admin':''}"><section class="studio-main" aria-label="Your events"><div id="studio-events">${loadingMarkup('Loading your events')}</div><div id="studio-pages"></div></section>${adminView?'<aside id="studio-system" class="studio-system" aria-label="Admin system overview"><section class="system-panel"><p class="loading">Checking Sepolia and the relayer…</p></section></aside>':''}</div>`:`<section class="studio-empty"><div class="studio-empty-art">${doodle('flower')}</div><h2>Your next event starts here.</h2><p>Connect with Privy to create events, manage your badges and share mint links from one workspace.</p><button class="button button-dark" id="studio-sign-in">Connect with Privy</button></section>`}`;
 if(adminView){
  main.querySelector('.section-tabs').innerHTML='<a href="#admin" aria-current="page">Review requests & events</a><a href="#admin/activity">Activity</a><button id="refresh-admin-events" class="button button-light button-small">Refresh requests</button>';
  main.querySelector('#studio-system').remove();main.querySelector('.studio-layout').classList.remove('with-admin');
  main.querySelector('.studio-main').setAttribute('aria-label','Review requests and events');
 }
 if(!session){main.querySelector('#studio-sign-in').onclick=headerConnect;return;}
 if(adminView)main.querySelector('#refresh-admin-events').onclick=()=>organizerStudio(version,true);
 let workspace;
 try {
  workspace=await api(`/${adminView?'admin':'organizer'}/events?page=${workspacePage}`);if(version!==renderId)return;
  const publications=workspace.publications.filter(row=>row.status!=='live');
  const groups=groupCollection(workspace.events);
  main.querySelector('#studio-events').innerHTML=`${publications.map(row=>`<article class="publication-card"><span class="service-badge ${row.status==='failed'?'needs-setup':''}">${row.status==='failed'?'Needs attention':'Publishing'}</span><h2>${esc(row.details.title)}</h2><p>${row.status==='failed'?'Your event is saved. Check the publishing setup, then retry.':'The relayer is creating your badges. You can leave this page and resume later.'}</p><button class="button button-light button-small" data-resume-publication="${esc(row.id)}">${row.status==='failed'?'Retry publishing':'Check progress'}</button></article>`).join('')}${groups.length?`<div class="studio-event-list">${groups.map(({event,badges})=>`<article class="studio-event-card"><div class="studio-event-art">${artwork(event)}</div><div class="studio-event-info"><div class="studio-event-meta"><span>${date(event.startsAt)}</span><span class="service-badge ${!event.listed||event.paused?'needs-setup':'is-ready'}">${event.deleted?'Deleted':event.approval==='pending'?'Awaiting approval':!event.listed?'Rejected':event.paused?'Paused':eventState(event)==='Happening now'?'Live':eventState(event)}</span></div><h2>${esc(event.title)}</h2><p>${esc(event.venue)}</p><p>${Date.now()/1000>event.mintEndsAt?'Minting closed':Date.now()/1000<event.mintStartsAt?'Minting opens '+date(event.mintStartsAt)+' '+time(event.mintStartsAt):'Mint window open'}</p><div class="studio-role-list">${adminView?`<span>${badges.reduce((sum,badge)=>sum+(badge.pendingRequests||0),0)} pending POAP requests</span>`:''}${badges.map(badge=>`<span>${esc(badge.roles[0])}</span>`).join('')}</div><div class="studio-event-actions"><a class="text-link" href="#${adminView?'admin/events':'issuer/manage'}/${esc((adminView?badges.find(badge=>badge.pendingRequests>0):null)?.id||event.id)}">${adminView?(event.approval==='pending'?'Review event approval ↗':'Review requests & manage event ↗'):'Manage event ↗'}</a>${event.listed?`<a class="text-link" href="#drop/${esc(event.id)}">View event</a>`:''}</div></div></article>`).join('')}</div>`:!publications.length?`<section class="studio-empty"><div class="studio-empty-art">${doodle('flower')}</div><h2>Your first event starts here.</h2><p>Add your event, make a badge for each role, and publish with sponsored gas.</p><a class="text-link" href="#create">Create your first event ↗</a></section>`:''}`;
  pageControls(main.querySelector('#studio-pages'),workspacePage,workspace.hasMore,'Events',page=>{workspacePage=page;organizerStudio(version,adminView);});
  main.querySelectorAll('[data-resume-publication]').forEach(button=>button.onclick=()=>busy(button,async()=>{
   const row=workspace.publications.find(row=>row.id===button.dataset.resumePublication);
   if(row.status==='failed'){const {organizer,...payload}=row.details;await post('/organizer/events',payload);}
   const progress=await api(`/publications/${row.id}`);
   if(progress.status==='live'){events=await api('/events');await organizerStudio(version,adminView);toast('Event published.');}
   else toast(progress.status==='failed'?'Publishing needs attention. Check the system panel.':'Your badges are still being created on Sepolia.');
  }));
 }catch(error){const content=main.querySelector('#studio-events');if(version===renderId&&content){content.innerHTML=`<section class="studio-empty"><h2>Your events could not load.</h2><p>${esc(error.message)}</p><button class="button button-light" id="retry-studio">Retry</button></section>`;content.querySelector('#retry-studio').onclick=()=>organizerStudio(version,adminView);}return;}
}

async function adminActivity(version) {
 main.innerHTML='<header class="studio-heading"><div><h1>Super admin activity.</h1><p>Admin actions, gas sponsorship and Sepolia network health.</p></div></header><nav class="section-tabs" aria-label="Super admin workspace"><a href="#admin">Review requests & events</a><a href="#admin/activity" aria-current="page">Activity</a><button id="refresh-admin-activity" class="button button-light button-small">Refresh activity</button></nav><div id="studio-system" class="studio-system" aria-label="Admin activity and system overview"><section class="system-panel"><p class="loading">Checking Sepolia and the relayer…</p></section></div>';
 main.querySelector('#refresh-admin-activity').onclick=()=>adminActivity(version);
 const results=await Promise.allSettled([api('/admin/system',{quiet:true}),api('/health',{allowDegraded:true,quiet:true}),api('/admin/audit',{quiet:true}),api('/admin/events?page=0',{quiet:true})]);
 if(version!==renderId)return;
 const system=results[0].status==='fulfilled'?results[0].value:null;
 const health=results[1].status==='fulfilled'?results[1].value:{status:'unavailable',dependencies:{rpc:{status:'error',message:'The system check is unavailable. Refresh to retry.'}}};
 let audit=results[2].status==='fulfilled'?results[2].value:null,auditPage=0;
 const workspace=results[3].status==='fulfilled'?results[3].value:{events:[]};
 const node=main.querySelector('#studio-system');
 const draw=()=>{renderSystemPanel(node,{system,health,audit,workspace,auditPage},async page=>{
  try {const rows=await api(`/admin/audit?page=${page}`,{quiet:true});if(version!==renderId)return;auditPage=page;audit=rows;draw();}catch(error){toast(error.message);}
 });
 if(session?.superAdmin&&system?.panelAdmins){
  node.insertAdjacentHTML('beforeend',`<section class="system-panel"><h2>Panel access</h2><p>Grant or revoke admin panel access with your superadmin wallet. Delegates can review requests and manage events; they cannot grant access to others or transfer the superadmin role. This action requires a Sepolia transaction from your wallet.</p><form id="panel-admin-form"><label class="field">Wallet address<input name="wallet" required placeholder="0x…" autocomplete="off" spellcheck="false"></label><button class="button">Grant panel access</button></form><div class="table-wrap" role="region" aria-label="Scrollable data table" tabindex="0"><table><thead><tr><th>Admin wallet</th><th>Action</th></tr></thead><tbody>${system.panelAdmins.map(wallet=>`<tr><td>${esc(wallet)}</td><td><button class="button button-light button-small" data-revoke-panel="${esc(wallet)}">Revoke</button></td></tr>`).join('')||'<tr><td colspan="2">No delegated admins yet.</td></tr>'}</tbody></table></div></section>`);
  const change=async(wallet,allowed)=>{
   wallet=getAddress(wallet.trim());
   if(wallet.toLowerCase()===session.wallet.toLowerCase())throw Error('The superadmin already has panel access.');
   const provider=walletClient.provider,accounts=await provider.request({method:'eth_accounts'});
   if(accounts.length!==1||accounts[0].toLowerCase()!==session.wallet.toLowerCase())throw Error('Select only the signed-in superadmin wallet in MetaMask.');
   await switchNetwork();
   const signer=await new BrowserProvider(provider).getSigner(session.wallet);
   const tx=await new Contract(config.contractAddress,['function setPanelAdmin(address,bool)'],signer).setPanelAdmin(wallet,allowed);
   await tx.wait(1);
   toast(allowed?'Panel access granted.':'Panel access revoked.');
   if(version===renderId)await adminActivity(version);
  };
  const form=node.querySelector('#panel-admin-form');
  form.onsubmit=event=>{event.preventDefault();busy(form.querySelector('button'),()=>change(form.elements.wallet.value,true));};
  node.querySelectorAll('[data-revoke-panel]').forEach(button=>button.onclick=()=>busy(button,()=>change(button.dataset.revokePanel,false)));
 }
 };draw();
}

function adminLogin() {
 main.innerHTML=`<header class="studio-heading"><div><h1>Connect your wallet.</h1><p>One Privy connection for your events and POAPs.</p></div></header><section class="studio-empty"><h2>Connect your wallet</h2><p>Use Privy to connect your wallet. Your signed-in wallet determines whether you see your organizer studio or event review.</p><p role="status">${session?.adminUnavailable?'Your signed-in wallet matches the configured super admin. Reconnect to Sepolia to verify panel access.':''}</p><button id="admin-sign-in" class="button button-dark">${session?.admin?'Open admin panel':session?.adminUnavailable?'Retry admin verification':'Connect with Privy'}</button></section>`;
 main.querySelector('#admin-sign-in').onclick=event=>busy(event.target,async()=>{
  if(session?.adminUnavailable){session=await api('/auth/me');walletHeader();}
  else if(!session?.admin)await connect();
  if(session?.adminUnavailable)throw Error('Admin verification failed. Check Sepolia connectivity and the configured contract/admin addresses, then retry.');
  location.hash=session?.admin?'#admin':'#issuer/studio';await render();
 });
}

function createEventPage() {
  main.innerHTML = `<a class="back-link" href="#${session?.admin?'admin':'issuer/studio'}">← Back to ${session?.admin?'admin dashboard':'studio'}</a><div class="eyebrow">ORGANIZER STUDIO / EVENT EDITOR</div><h1 class="page-title">Give your event a little forever.</h1><p class="lead">Your artwork. Your community. A collectible for everyone who shows up.</p><form id="event-form" class="panel"><div class="draft-toolbar"><p id="draft-status" class="sr-only" role="status"></p><button type="button" class="text-link" id="discard-event-draft">Clear form</button></div><div class="form-grid"><label class="field">Event title<input name="title" required minlength="3" maxlength="100" placeholder="Your event name"></label><label class="field">Club or community<input name="club" required minlength="2" maxlength="80" placeholder="The Coding Club"></label><label class="field field-full">Description<textarea name="description" required minlength="3" maxlength="1000" placeholder="What makes this moment special?"></textarea></label><label class="field">Category<select name="category">${(config.categories || []).map(name => `<option>${esc(name)}</option>`).join('')}</select></label><label class="field">Campus<input name="campus" maxlength="100" placeholder="Campus name"></label><label class="field">Participation roles<input name="roles" value="Attendee" maxlength="320"><small>Comma-separated, up to 8 roles. Each has its own badge and cap.</small></label><label class="field">Venue<input name="venue" required minlength="2" maxlength="300" placeholder="Innovation Lab, Block A"></label><label class="field">Event starts<input name="starts" type="datetime-local" required></label><label class="field">Event ends<input name="eventEnds" type="datetime-local" required></label><label class="field">Minting opens<input name="mintStarts" type="datetime-local" required></label><label class="field">Minting closes<input name="ends" type="datetime-local" required><small>Allow time after the event for queued mints to confirm.</small></label><label class="field field-full">Collectible artwork<small>Choose a design for each role below, or explicitly generate POAPs from your event description.</small></label><div id="role-designs" class="field-full role-designs"></div></div><div class="form-actions"><button class="button" id="publish-button" type="submit">Publish event ↗</button></div><div id="publish-status" class="publication-progress" role="status"></div></form>`;
  const form = main.querySelector('form');
  let draftStorage;
  try { draftStorage = window.sessionStorage; } catch { /* Storage can be disabled in private browsers. */ }
  const draft = preserveEventDraft(form, draftStorage, form.querySelector('#draft-status'));
  form.querySelector('#discard-event-draft').onclick = () => {
    if (!window.confirm('Clear your event details and artwork?')) return;
    draft.clear(); createEventPage();
  };
  const designs = new Map();
  const draftCaps = new Map([...new Set(String(draft.values.roles || '').split(',').map(role=>role.trim()).filter(Boolean))].map((role,index)=>[role,draft.values[`drops-${index}`]]));
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

    const version = ++state.version;
    const image = !generate && state.image ? await circularArtwork(state.image,document) : undefined;
    if (version !== state.version) throw Error('The artwork changed. Try again.');
    const result = await post('/artwork',{...input,...(image ? {image} : {}),...(!generate && state.video ? {video:state.video} : {})});
    if (version !== state.version || JSON.stringify(input) !== JSON.stringify({...story(),role}) || !roles().includes(role)) throw Error('The design or event story changed. Try again.');
    if(generate)state.image=state.video=null;
    state.generated = {...result,...input}; drawDesigns(); return {role,...state.generated};
  }
  function drawDesigns() {
    let values;
    try { values = roles(); } catch (error) { toast(error.message); return; }
    const container = form.querySelector('#role-designs');
    if(!container?.isConnected)return;
    container.innerHTML = values.map((role,index) => `<section class="role-design"><h3>${esc(role)} POAP</h3><label class="field">Approximate number of drops<input name="drops-${index}" type="text" inputmode="numeric" pattern="[0-9]+" maxlength="5" required value="${esc(designs.get(role)?.cap ?? draftCaps.get(role) ?? 50)}"><small>This sets the maximum POAP supply for ${esc(role)}.</small></label><label class="field">Custom design<input name="${index === 0 ? 'artwork' : `artwork-${index}`}" type="file" accept="image/png,image/jpeg,video/mp4,video/webm"></label><img width="512" height="512" ${index === 0 ? 'id="art-preview"' : ''} alt="${esc(role)} POAP preview"><video width="512" height="512" ${index === 0 ? 'id="video-preview"' : ''} controls playsinline preload="metadata" hidden aria-label="${esc(role)} video preview"></video><div class="form-actions"><button type="button" class="button button-light" data-generate-role="${index}">Generate POAP ✧</button><button type="button" class="text-link" data-clear-role="${index}">Clear design</button></div></section>`).join('');
    values.forEach((role,index) => {
      if (!designs.has(role)) designs.set(role,{version:0,cap:draftCaps.get(role) ?? 50});
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
      if(!form.isConnected)return null;
      const {image,uri,animationUrl} = await designFor(role);
      const cap = Number(designs.get(role).cap);
      if (!Number.isInteger(cap) || cap < 1 || cap > 10000) throw Error(`Enter 1–10,000 drops for ${role}.`);
      roleArtwork.push({role,image,uri,cap,...(animationUrl ? {animationUrl} : {})});
    }
    if (JSON.stringify(values) !== JSON.stringify(roles())) throw Error('Roles changed. Review the designs and save again.');
    return {...roleArtwork[0],roleArtwork};
  }
  const pendingKey='kairo-publishing';
  let pending;
  try { pending=JSON.parse(localStorage.getItem(pendingKey)||'null'); } catch { pending=null; }
  let progressFailures=0;
  async function followPublication(id) {
   const node=form.querySelector('#publish-status');if(!node?.isConnected||pending?.id!==id)return;
   let result;
   try {result=await api(`/publications/${id}`,{quiet:true});progressFailures=0;}
   catch(error){
    if(!node.isConnected||pending?.id!==id)return;
    if(!uncertainPublication(error))throw error;
    node.textContent='Your submission is saved. Checking publication progress…';
    if(++progressFailures<3)ticketTimer=setTimeout(()=>followPublication(id).catch(error=>{if(node.isConnected)node.textContent=error.message;}),10000);
    else node.innerHTML='<p>Your submission is saved, but its status is unavailable. Check again to continue tracking it.</p><button type="button" class="button" id="check-publication">Check status</button>';
    node.querySelector('#check-publication')?.addEventListener('click',()=>{progressFailures=0;followPublication(id).catch(error=>{if(node.isConnected)node.textContent=error.message;});});
    return;
   }
   if(!node.isConnected||pending?.id!==id)return;
   if(result.status==='failed')throw Error(result.error || 'Publication failed. Click Publish event to try again.');
   node.innerHTML=result.status==='live'?'Event published. Awaiting super-admin approval.':loadingMarkup('Publishing your event');
   if(result.status==='live'){
    draft.clear();try { localStorage.removeItem(pendingKey); } catch { /* Publication is already complete. */ }pending=null;
    const eventId=result.events[0]?.id;
    if(eventId)location.hash=`${session?.admin?'admin/events':'issuer/manage'}/${eventId}`;
    toast('Event published. Awaiting super-admin approval.');
   } else ticketTimer=setTimeout(()=>followPublication(id).catch(error=>{if(node.isConnected)node.textContent=error.message;}),10000);
  }
  form.onsubmit=event=>{event.preventDefault();if(!form.isConnected)return;busy(form.querySelector('#publish-button'),async()=>{
   if(!form.reportValidity())return;await authenticate();
   clearTimeout(ticketTimer);
   if(!form.isConnected)return;
   const f=form.elements,seconds=name=>Math.floor(new Date(f[name].value).getTime()/1000);
   if (![seconds('starts'),seconds('eventEnds'),seconds('mintStarts'),seconds('ends')].every(Number.isFinite) || seconds('starts') >= seconds('eventEnds') || seconds('mintStarts') >= seconds('ends')) {
     const message = 'Set an end time after the start for both the event and minting window.';
     form.querySelector('#publish-status').textContent = message;
     throw Error(message);
   }
   const publishStatus=form.querySelector('#publish-status');publishStatus.innerHTML=loadingMarkup('Publishing your event');
   let artwork;try {artwork=await media();}catch(error){publishStatus.textContent=error.message;throw error;}
   if(!form.isConnected)return;
   const id=crypto.randomUUID();
   const payload={id,title:f.title.value.trim(),description:f.description.value.trim(),club:f.club.value.trim(),category:f.category.value,campus:f.campus.value.trim(),venue:f.venue.value.trim(),approximateAttendees:Math.max(...artwork.roleArtwork.map(art=>art.cap)),eventStartsAt:seconds('starts'),eventEndsAt:seconds('eventEnds'),mintStartsAt:seconds('mintStarts'),mintEndsAt:seconds('ends'),roleArtwork:artwork.roleArtwork};
   if(payload.eventStartsAt>=payload.eventEndsAt||payload.mintStartsAt>=payload.mintEndsAt)throw Error('Check your event dates and minting window.');
   // Reuse the same request only for an unchanged event; unrelated drafts never block publication.
   if(pending && typeof pending.id==='string' && JSON.stringify({...pending,id:null})===JSON.stringify({...payload,id:null}))payload.id=pending.id;
   pending=payload;
   try { localStorage.setItem(pendingKey,JSON.stringify(payload)); } catch { /* Retries in this tab still reuse the submission ID. */ }
   const status=form.querySelector('#publish-status');status.innerHTML=loadingMarkup('Publishing your event');
   try {await submitPublication(api,payload);}catch(error){
    if(!uncertainPublication(error)) {
     try { localStorage.removeItem(pendingKey); } catch { /* Keep the form retryable without browser storage. */ }
     if(status.isConnected)status.textContent=error.message;
     throw error;
    }
    if(status.isConnected)status.textContent='We could not confirm your submission yet. Your event details are preserved; check your connection and click Publish event again.';
    throw error;
   }
   await followPublication(payload.id);
  });};
}

function about() { main.innerHTML = aboutContent(location.hash); }
function homeVisible() { return !location.hash || ['#main','#collectibles','#how-it-works'].includes(location.hash); }
async function render(focusPage = false) {
  const requestedHash = location.hash;
  if (!initialized) return;
  const ticket = pageLoader.begin();
  try { await renderPage(); }
  catch (error) { retryNotice(error, render); }
  finally {
    await pageLoader.finish(ticket);
    if (requestedHash === location.hash) {
      const heading = document.querySelector(homeVisible() ? '#hero-title' : '#live-app h1, #live-app h2, #live-app h3');
      const title = homeVisible() ? 'Keep your moments' : heading?.textContent.replace(/\s+/g, ' ').trim() || 'Kairo';
      document.title = `${title} — Kairo`;
      document.querySelector('#route-status').textContent = title;
      if (focusPage && !modal.open) document.querySelector('#main').focus?.({preventScroll:true});
    }
  }
}
async function renderPage() {
  clearInterval(pageTimer); clearTimeout(ticketTimer); ticketView++; drawEvents = null; close();
  const version = ++renderId;
  const hash = location.hash.slice(1);
  const routes = { events:'explore', gallery:'collection', organize:'studio', 'collector/gallery': 'explore', 'collector/collection': 'collection', 'collector/collectors': 'profile', 'builders/build': 'issuer-guide', 'builders/documentation': 'issuer-guide', 'issuer/guide': 'issuer-guide', 'issuer/studio': 'studio', 'issuer/manage': 'organizer' };
  const route = hash.startsWith('issuer/manage/') ? 'organizer' : hash.startsWith('guide-') ? 'issuer-guide' : hash.startsWith('doc-') ? 'issuer-guide' : routes[hash] || hash.split('/')[0];
  const section = ['badge','profile'].includes(route) ? 'collection' : ['organizer','create','admin','issuer-guide'].includes(route) ? 'studio' : route;
  all('.desktop-nav a, #mobile-nav a').forEach(link => {
    const target = link.getAttribute('href').slice(1);
    const active = (routes[target] || target.split('/')[0]) === section;
    if (active) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
  });
  const home = !hash || ['main','collectibles','how-it-works'].includes(hash);
  document.querySelectorAll('[data-home]').forEach(node => { node.hidden = !home; });
  main.hidden = home;
  if (home && !homeArtMounted) { homeArtMounted = true; mountHomeArt(document, window); }
  if (apiError && (home || ['explore','drop'].includes(route))) { main.hidden = false; main.innerHTML = `${empty('Live service unavailable', apiError)}<button class="button" id="retry-api">Retry connection</button>`; main.querySelector('button').onclick = init; return; }
  if (home) { renderCards(); pageTimer = setInterval(async () => { if (document.hidden || modal.open || version !== renderId) return; try { events = await api('/events'); apiError = ''; if (version === renderId) { connectionState(); renderCards(); } } catch (error) { apiError = error.message; renderCards(); } }, 15000); return; }
  if (route === 'collection' || route === 'badge' || route === 'profile') await collection(version, route === 'profile');
  else if (route === 'admin') {
    if(!session?.admin||hash==='admin/login') adminLogin();
    else if(hash==='admin/activity') await adminActivity(version);
    else if(hash.startsWith('admin/events')) await organizer(version,true);
    else await organizerStudio(version,true);
  }
  else if (route === 'organizer') await organizer(version,Boolean(session?.admin));
  else if (route === 'create') createEventPage();
  else if (route === 'about') about();
  else if (route === 'issuer-guide') { main.innerHTML = issuerContent(); if (hash.startsWith('guide-')) document.getElementById(hash)?.scrollIntoView({behavior:reduced.matches ? 'instant' : 'smooth'}); }
  else if (route === 'studio') await organizerStudio(version,Boolean(session?.admin)&&hash==='organize');
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
      if(Date.now()/1000>event.mintEndsAt)showEvent(event);else claimForm(event,true);
     }catch(error){if(version===renderId){
      main.innerHTML=`${empty('Event unavailable',error.message)}<button class="button" id="retry-event">Retry</button>`;
      main.querySelector('#retry-event').onclick=()=>render();
     }}
    }
  }
  pageTimer = setInterval(async () => {
    if (document.hidden || modal.open || version !== renderId) return;
    try { events = await api('/events'); if (version !== renderId) return; apiError = ''; connectionState(); drawEvents?.(); const staff = main.querySelector('#staff-event'); if (staff?.value&&main.querySelector('#staff-content')?.dataset.editing!=='true') await staff.onchange({background:true}); }
    catch (error) { const node = document.querySelector('#connection-state'); node.hidden = false; node.textContent = `Live refresh unavailable: ${error.message}`; }
  }, 15000);
}

function renderCards() {
  const grid = document.querySelector('#badge-grid');
  const visible = events.filter(event => isPublicPastEvent(event) && (filter === 'all' || (filter === 'art' ? event.category === 'Arts' : filter === 'community' ? event.category === 'Community' : event.category !== 'Arts' && event.category !== 'Community')));
  grid.innerHTML = apiError ? empty('Live events unavailable', apiError) : visible.length ? visible.map(event => card(event)).join('') : empty(filter === 'all' ? 'No events yet' : 'No moments in this category yet', filter === 'all' ? 'Published events will appear here.' : 'Choose another category to explore more memories.');
  const count = document.querySelector('[data-filter="all"] span'); if (count) count.textContent = events.filter(event=>isPublicPastEvent(event)).length;
}
let filter = 'all';
function explore() {
  main.innerHTML = `<h1 class="page-title">Discover events</h1><p class="lead">Find a moment worth keeping. Search by event, campus or organizer.</p><div class="discovery-filters"><label class="field">Search events<span class="event-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="live-search" type="search" placeholder="Event, campus, organizer…"></span></label><label class="field">Category<select id="live-category"><option>All events</option>${(config.categories || []).map(c => `<option>${esc(c)}</option>`).join('')}</select></label></div><p id="event-results" class="muted" role="status" aria-live="polite"></p><div id="live-events"></div>`;
  drawEvents = () => {
    const visible = events.filter(e => isPublicPastEvent(e)&&matchesEvent(e, {search: main.querySelector('#live-search').value, category: main.querySelector('#live-category').value, period: 'all'}));
    main.querySelector('#event-results').textContent = `${visible.filter(event => eventState(event) === 'Past event').length} past events found`;
    main.querySelector('#live-events').innerHTML = [['Past event','Past events']].map(([state,label]) => {
      const rows = visible.filter(e => eventState(e) === state);
      return `<section class="event-period"><h2>${label}</h2>${rows.length ? `<div class="grid">${rows.map(e => card(e)).join('')}</div>` : empty(`No ${label.toLowerCase()}`, 'Try another search or category, or check back soon.')}</section>`;
    }).join('');
  };
  main.querySelector('#live-search').oninput = drawEvents; main.querySelector('#live-category').onchange = drawEvents; drawEvents();
}
async function init() {
  apiError = ''; document.querySelector('#request-error').hidden = true;
  try {
    const results = await Promise.allSettled([api('/events'), api('/config')]);
    if (results[0].status === 'fulfilled') events = results[0].value;
    if (results[1].status === 'fulfilled') config = results[1].value;
    apiError = results[0].status === 'rejected' ? results[0].reason.message : '';
    configError = results[1].status === 'rejected' ? results[1].reason.message : '';
    if (configError) retryNotice(results[1].reason, init);
    const restored = await api('/auth/me').catch(() => null);
    if (restored?.wallet) { session = restored; connectedWallet = getAddress(restored.wallet); await walletClient.restore(restored.wallet); }
    walletHeader();
    all('[data-network-name]').forEach(node => { node.textContent = config.chainName; });

  } catch (error) { apiError = error.message; }
  if (entryDrop && !location.hash) history.replaceState(null, '', `#drop/${entryDrop}`);
  initialized = true;
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
$('#surprise-me')?.addEventListener('click', () => { const past = events.filter(event=>isPublicPastEvent(event)); if (past.length) showEvent(past[Math.floor(Math.random() * past.length)]); else toast('No past events available'); });
const menu = $('.menu-button');
function closeMenu(restoreFocus = false) {
  const wasOpen = menu?.getAttribute('aria-expanded') === 'true';
  menu?.setAttribute('aria-expanded', 'false');
  menu?.setAttribute('aria-label', 'Open navigation');
  const nav = $('#mobile-nav');
  if (nav) nav.hidden = true;
  if (restoreFocus && wasOpen) menu.focus();
}
menu?.addEventListener('click', () => {
  const opening = menu.getAttribute('aria-expanded') !== 'true';
  if (!opening) { closeMenu(); return; }
  menu.setAttribute('aria-expanded', 'true');
  menu.setAttribute('aria-label', 'Close navigation');
  $('#mobile-nav').hidden = false;
});
all('#mobile-nav a, #mobile-nav button').forEach(link => link.addEventListener('click', () => closeMenu()));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(true); });
document.addEventListener('click', event => {
  if (!event.target.closest('#mobile-nav, .menu-button')) closeMenu();
});
document.addEventListener('focusin', event => {
  if (!event.target.closest('#mobile-nav, .menu-button')) closeMenu();
});
window.addEventListener('resize', () => { if (window.innerWidth > 1000) closeMenu(); });

$('#create-button')?.addEventListener('click', () => { location.hash = 'issuer/studio'; });

window.addEventListener('hashchange', () => { if (!/^#(?:doc|guide)-/.test(location.hash)) window.scrollTo({top:0,behavior:'instant'}); closeMenu(); render(true); });

function connectionState() {
  const offline = !navigator.onLine;
  const stateNode = document.querySelector('#connection-state');
  if (stateNode) {
    const wrong = Boolean(activeChain && Number.isSafeInteger(config.chainId) && activeChain !== chainHex());
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

$('.coin-fallback').innerHTML = badgeSvg('flower', 'fallback', 'GOOD TIMES GROW HERE');
if (homeVisible()) { homeArtMounted = true; mountHomeArt(document, window); }
init();
