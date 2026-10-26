import { badges, badgeSvg } from './art.js';
import { SEPOLIA_CHAIN_ID, sampleEvents, samplePeople, escapeHtml as esc, shortAddress, eventPoster, makeDraft, draftMetadata } from './platform-data.js';

const routes = {
  about: { label: 'About', number: '01', title: 'Good moments.', accent: 'Lasting proof.', description: 'The idea behind the little tokens that keep your biggest memories close.', tabs: [['proof', 'Proof of Protocol'], ['case-studies', 'Case Studies']] },
  issuer: { label: 'Issuer', number: '02', title: 'You make the moment.', accent: 'Give them a keepsake.', description: 'A field guide for the people bringing everyone together.', tabs: [['guide', 'How POAP works']] },
  collector: { label: 'Collector', number: '03', title: 'Your “I was there.”', accent: 'All in one place.', description: 'Find the events, the people, and the little pieces of a life well lived.', tabs: [['gallery', 'Gallery'], ['collectors', 'Collectors'], ['collection', 'Collection']] },
  builders: { label: 'Builders', number: '04', title: 'Your event.', accent: 'Your kind of POAP.', description: 'Make a soulbound keepsake that feels as individual as the moment itself.', tabs: [['build', 'Build with POAP'], ['documentation', 'Documentation']] }
};

const features = rows => `<div class="feature-list">${rows.map(([title, text], i) => `<div class="feature-row"><span>${String(i + 1).padStart(2, '0')}</span><div><h3>${title}</h3><p>${text}</p></div></div>`).join('')}</div>`;
const note = text => `<p class="info-note">${text}</p>`;
const empty = (title, text) => `<div class="no-results"><h3>${title}</h3><p>${text}</p></div>`;

/** Supply your existing project's wallet callbacks and event data here; defaults are UI previews only. */
export function mountPlatform({ connectWallet, disconnectWallet, events: initialEvents = sampleEvents, people = samplePeople, doc = document, win = window } = {}) {
  const $ = (selector, parent = doc) => parent.querySelector(selector);
  const $$ = (selector, parent = doc) => [...parent.querySelectorAll(selector)];
  const root = $('#platform');
  if (!root) return;
  const events = [...initialEvents];
  const walletDialog = $('#wallet-dialog');
  const eventDialog = $('#event-dialog');
  const walletBody = $('#wallet-body');
  let session = null, selectedWallet = '', selectedRole = 'attendee', profileAddress = '', collectionView = 'attended';
  let walletStep = 'choose', walletBusy = false, walletRequest = 0, draft = null, image = '';
  const builderValues = { title: '', description: '', location: '', date: '', kind: 'flower' };
  let page = 'about', sub = 'proof';
  let search = '', category = 'all';

  const open = dialog => { if (!dialog.open) dialog.showModal(); doc.body.classList.add('modal-open'); };
  const close = dialog => dialog.close();
  for (const dialog of [walletDialog, eventDialog]) {
    $('.modal-close', dialog).addEventListener('click', () => close(dialog));
    dialog.addEventListener('close', () => {
      if (dialog === walletDialog) { walletRequest++; walletBusy = false; }
      if (!$$('dialog').some(item => item.open)) doc.body.classList.remove('modal-open');
    });
    dialog.addEventListener('click', event => {
      const bounds = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) close(dialog);
    });
  }

  function go(nextPage, nextSub) {
    const hash = `#${nextPage}/${nextSub}`;
    if (win.location.hash === hash) renderRoute();
    else win.location.hash = hash;
  }

  function eventCard(event, index) {
    return `<article class="event-card" style="--card-bg:var(--${esc(event.color || 'lavender')})"><button class="event-cover" data-event="${esc(event.id)}" aria-label="View ${esc(event.title)}">${eventPoster(event, `gallery-${index}`)}</button><div class="event-details"><p class="overline">${esc(event.event || 'YOUR EVENT')}</p><h3><button data-event="${esc(event.id)}">${esc(event.title)}</button></h3><p>${esc(event.location)}<br />${esc(event.date)}</p><div class="event-card-bottom"><span>${event.draft ? 'DRAFT · NOT PUBLISHED' : 'SAMPLE EVENT'}</span><span class="sbt-pill">↗ SEPOLIA · SBT</span></div></div></article>`;
  }

  function about() {
    if (sub === 'case-studies') return `<p class="preview-disclaimer"><span aria-hidden="true">✳</span>Illustrative case studies. These are example use cases, not claims about real customers.</p><div class="use-case-grid">${[
      ['Music & good times', 'A night you can keep.', 'A listening room gives guests a keepsake of the set that brought them together. Their badge opens a scrapbook of the event artwork and its story.', 'planet', 'peach', 'music'],
      ['Communities, together', 'From online to offline.', 'An organizer marks a community’s first real-world meetup with a non-transferable attendance badge, tied to each attendee’s wallet.', 'sun', 'lime', 'community'],
      ['Art & internet things', 'Made by being there.', 'An open-studio host creates custom artwork for visitors. Collectors revisit the exhibition and the people they met through their event collection.', 'eye', 'pink', 'art']
    ].map(([label, title, text, kind, color, filter]) => `<article class="use-case" style="--card-bg:var(--${color})"><div><small>${label.toUpperCase()}</small>${badgeSvg(kind, `case-${kind}`, 'A LITTLE PROOF OF LIFE')}</div><div class="use-case-copy"><h2>${title}</h2><p>${text}</p><a class="text-link" href="#collector/gallery" data-gallery-category="${filter}">Explore the gallery <span>↗</span></a></div></article>`).join('')}</div>`;
    return `<div class="area-split"><div class="area-copy"><p class="overline">PROOF OF PROTOCOL</p><h2>A little proof.<br />A very real feeling.</h2><p>POAP means Proof of Attendance Protocol: a digital keepsake that says you were part of a moment. This independent concept explores that idea with customized soulbound badges on Sepolia.</p>${features([
      ['A memory with an identity.', 'Every event has its own artwork, story, date, and organizer. A badge brings those details into a collector’s scrapbook.'],
      ['Belonging, not trading.', 'The intended SBT is non-transferable: it represents attendance, rather than something to buy, sell, or pass to another wallet. Your existing contract will enforce that rule.'],
      ['Your wallet. Your little archive.', 'Attendees and organizers connect an Ethereum wallet, sign in, and revisit their collections. This frontend previews that journey.']
    ])}${note('<strong>Sepolia testnet only.</strong> This project is not an official POAP product. The frontend does not mint tokens, prove attendance, or connect to a blockchain by itself.')}</div><div class="statement-card"><div class="statement-meta"><span>FIG. 02</span><span>A LITTLE PROOF OF LIFE</span></div>${badgeSvg('flower', 'about-proof', 'GOOD TIMES GROW HERE')}<h3>“Yep. I was there.”</h3><p>Not another ticket in your inbox.<br />A little piece of the moment, made to stay.</p><div class="statement-meta" style="margin-top:25px"><span>SOULBOUND BY DESIGN</span><span>SEPOLIA EDITION ↗</span></div></div></div>`;
  }

  function issuer() {
    return `<div class="guide-layout"><aside class="guide-sidebar"><h3>THE ISSUER FIELD GUIDE</h3><a href="#issuer-start">01 · Create the moment</a><a href="#issuer-wallet">02 · Connect & sign</a><a href="#issuer-design">03 · Make your POAP</a><a href="#issuer-attendance">04 · Issue & revisit</a><div class="guide-network"><b>Sepolia testnet only</b><span>Chain ID 11155111<br />Ethereum wallet account</span></div></aside><article class="guide-article"><div class="guide-download"><div><b>Good events deserve a keepsake.</b><p style="font-size:10px;margin:7px 0 0">The organizer’s guide, from first idea to collected memory.</p></div><a class="text-link" href="#builders/documentation">Technical docs ↗</a></div><section class="guide-block" id="issuer-start"><p class="overline">01 / THE BIG LITTLE IDEA</p><h2>So, how does POAP work?</h2><p>An organizer creates an event and a unique badge. After attendance is verified, an attendee receives that event’s POAP in their wallet. The Collector section brings the event, images, and keepsake together again.</p><p>Our SBT concept binds that badge to the receiving wallet. The frontend shows the experience; your existing project handles event storage, eligibility, and Sepolia issuance.</p></section><section class="guide-block" id="issuer-wallet"><p class="overline">02 / YOUR WALLET IS YOUR HELLO</p><h2>Connect. Sign. You’re in.</h2><ol><li>Choose <strong>Organizer</strong> or <strong>Attendee</strong> and select MetaMask or Phantom.</li><li>Use the wallet’s <strong>Ethereum account</strong> and switch to <strong>Sepolia</strong>. Phantom’s Solana account is not an Ethereum Sepolia account.</li><li>Sign the sign-in message to prove address control. Connecting alone is not signing in.</li></ol>${note('<strong>In this frontend:</strong> those steps are labeled previews. No wallet request, signature, approval, or transaction is sent. In your integrated project, never request a seed phrase or private key.')}</section><section class="guide-block" id="issuer-design"><p class="overline">03 / GIVE THE MOMENT A FACE</p><h2>Make it unmistakably yours.</h2><p>Open Build with POAP. Add the event name, date, location, and story, choose badge artwork, and optionally upload an event image. Preview the design and download a metadata draft.</p><p>The preview listing is temporary and local to the page. Your backend should validate the draft, upload images and metadata, and register the event before it is actually listed.</p><a class="text-link" href="#builders/build">Make your first little keepsake ↗</a></section><section class="guide-block" id="issuer-attendance"><p class="overline">04 / THE MOMENT BECOMES A MEMORY</p><h2>Issue thoughtfully. Keep forever.</h2><p>Verify who attended using your project’s check-in or eligibility flow. Only an authorized organizer should be able to issue that event’s badge. The Sepolia contract should prevent transfers and duplicate claims according to your event rules.</p><p>Attendees find the event under their Collection. Organizers can switch to Organized events to revisit their own gatherings, event images, and badge designs.</p>${note('<strong>Testnet, through and through.</strong> All network-specific UI and exported metadata target Sepolia (11155111). No mainnet or Solana minting flow is included.')}</section></article></div>`;
  }

  function previewNote() { return `<div class="preview-disclaimer"><span aria-hidden="true">✳</span>Frontend preview · Example events and profiles. Nothing here represents a verified attendance record or minted token.</div>`; }

  function gallery() {
    return `${previewNote()}<div class="explore-toolbar"><label class="search-field"><span aria-hidden="true">⌕</span><input id="event-search" type="search" aria-label="Search events" placeholder="Find a moment, a place, a story…" value="${esc(search)}" /></label><select id="event-category" aria-label="Filter events by category">${[['all', 'All kinds of memories'], ['music', 'Music & good times'], ['community', 'IRL connections'], ['art', 'Art & internet things']].map(([value, label]) => `<option value="${value}" ${category === value ? 'selected' : ''}>${label}</option>`).join('')}</select><span id="event-result-count" class="toolbar-note"></span></div><div class="event-grid" id="event-results"></div>`;
  }

  function renderGalleryResults() {
    const target = $('#event-results');
    if (!target) return;
    const query = search.toLowerCase().trim();
    const visible = events.filter(event => (category === 'all' || event.category === category) && `${event.title} ${event.location} ${event.description}`.toLowerCase().includes(query));
    target.innerHTML = visible.map(eventCard).join('') || empty('No moments found. Yet.', 'Try another name, location, or category.');
    $('#event-result-count').textContent = `${visible.length} ${visible.length === 1 ? 'moment' : 'moments'} to explore`;
  }

  function collectors() {
    return `${previewNote()}<div class="explore-toolbar"><label class="search-field"><span aria-hidden="true">⌕</span><input id="people-search" type="search" aria-label="Search collectors by name or wallet" placeholder="Find a collector or wallet address…" /></label><span class="toolbar-note">Good people. Great little scrapbooks.</span></div><div class="people-grid" id="people-results">${people.map(personCard).join('')}</div>`;
  }

  function personCard(person) {
    return `<article class="person-card" style="--card-bg:var(--${esc(person.color)})"><div class="person-top"><span class="person-avatar">${esc(person.initials)}</span><span>SAMPLE PROFILE</span></div><h2>${esc(person.name)}</h2><span class="person-handle">@${esc(person.handle)} · ${shortAddress(person.address)}</span><p>${esc(person.bio)}</p><div class="person-badges">${person.events.slice(0, 3).map((id, i) => { const event = events.find(item => item.id === id); return event ? badgeSvg(event.kind, `person-${person.initials}-${i}`, 'A LITTLE PROOF OF LIFE') : ''; }).join('')}</div><button class="text-link" data-profile="${esc(person.address)}">Open the scrapbook <span>↗</span></button></article>`;
  }

  function lockedPanel(organizer = false) {
    return `<div class="locked-panel"><div><p class="overline">YOUR WALLET, YOUR LITTLE WORLD</p><h2>${organizer ? 'A little organizer energy.' : 'Your story starts here.'}</h2><p>${organizer ? 'Choose Organizer in the sign-in preview to see your event drafts and organized events.' : 'Connect an Ethereum wallet and sign in to see past events, event artwork, and your collection.'}</p><button class="button button-dark" data-open-wallet="${organizer ? 'organizer' : 'attendee'}">${connectWallet ? 'Connect & sign in' : 'Preview wallet sign-in'} <span>↗</span></button><p class="sample-label-inline">${connectWallet ? 'SEPOLIA TESTNET ONLY' : 'DEMO FLOW · NO WALLET REQUESTS'}</p></div><div class="locked-art" aria-hidden="true">${badgeSvg('flower', 'locked-one', 'GOOD TIMES GROW HERE')}${badgeSvg('planet', 'locked-two', 'A MOMENT MADE FOREVER')}</div></div>`;
  }

  function collection() {
    if (!session) return lockedPanel();
    const address = profileAddress || session.address;
    const person = people.find(item => item.address.toLowerCase() === address.toLowerCase());
    const attended = events.filter(event => person?.events.includes(event.id));
    const organized = events.filter(event => event.organizer?.toLowerCase() === address.toLowerCase());
    const visible = collectionView === 'organized' ? organized : attended;
    return `${previewNote()}<div class="profile-banner" style="--card-bg:var(--${person?.color || 'lavender'})"><span class="person-avatar">${esc(person?.initials || 'YOU')}</span><div><p class="overline" style="margin:0 0 9px">${profileAddress ? 'COLLECTOR SCRAPBOOK' : 'YOUR LITTLE SCRAPBOOK'}</p><h2>${esc(person?.name || 'Your collection')}</h2><p>${esc(address)} · Sepolia</p></div><div class="profile-stat">${visible.length}<span>${collectionView === 'organized' ? 'ORGANIZED EVENTS' : 'SAMPLE MEMORIES'}</span></div></div><div class="view-switch" role="group" aria-label="Collection view"><button data-collection-view="attended" aria-pressed="${collectionView === 'attended'}">Attended events <span>(${attended.length})</span></button><button data-collection-view="organized" aria-pressed="${collectionView === 'organized'}">Organized events <span>(${organized.length})</span></button>${profileAddress ? '<button data-my-scrapbook>Back to my scrapbook ↗</button>' : ''}</div><div class="event-grid">${visible.map(eventCard).join('') || empty(collectionView === 'organized' ? 'Something good is in the making.' : 'A little empty. A lot of possibility.', collectionView === 'organized' ? 'Create an event draft in Build with POAP. Your existing project will provide published event data after integration.' : 'Your existing project can supply this view with the connected wallet’s attendance records. No real onchain collection is loaded by this frontend.')}</div>`;
  }

  function builderPreview() {
    return `<p class="overline"><span>YOUR LITTLE KEEPSAKE</span><span>LIVE DESIGN PREVIEW ↗</span></p><div class="builder-badge">${badgeSvg(builderValues.kind, 'builder-live', 'A MOMENT WORTH KEEPING')}</div><h3>${esc(builderValues.title || 'Your next good moment')}</h3><p>${esc(builderValues.description || 'A little story goes a long way. Tell us what makes your event worth remembering.')}</p><div class="builder-preview-tags"><span>SEPOLIA</span><span>SOULBOUND · SBT</span><span>${esc(builderValues.date || 'YOUR EVENT DATE')}</span></div><p class="builder-preview-foot">${esc(builderValues.location || 'Somewhere good, together.')}<br />Design preview only. No token has been minted.</p>`;
  }

  function builder() {
    const success = draft ? `<div class="draft-success" role="status"><b>A little memory, designed. ♡</b><p>Your event draft is ready. It is not published, stored on a server, or minted on Sepolia.</p><div class="draft-actions"><button class="text-link" data-download-draft>Download metadata ↗</button><button class="text-link" data-view-draft>Preview event listing ↗</button></div></div>` : '';
    return `${success}<div class="builder-layout"><form id="sbt-builder" class="builder-form"><div><p class="overline">01 / START WITH THE STORY</p><h2>Make it your kind of moment.</h2></div><div class="builder-field"><label for="sbt-title">What’s your event called?</label><input id="sbt-title" name="title" maxlength="60" required placeholder="The best Tuesday ever" value="${esc(builderValues.title)}" /></div><div class="builder-field"><label for="sbt-description">A little about the moment</label><textarea id="sbt-description" name="description" maxlength="400" required placeholder="The people, the place, the reason to show up…">${esc(builderValues.description)}</textarea><small>Keep it short and memorable. Up to 400 characters.</small></div><div class="builder-fields-row"><div class="builder-field"><label for="sbt-date">When is it happening?</label><input type="date" id="sbt-date" name="date" value="${esc(builderValues.date)}" required /></div><div class="builder-field"><label for="sbt-location">Where are we meeting?</label><input id="sbt-location" name="location" required maxlength="100" placeholder="A place, a city, or a URL" value="${esc(builderValues.location)}" /></div></div><fieldset style="padding:0;border:0;margin:0"><legend style="font-size:11px;font-weight:600;margin-bottom:12px">02 / PICK A LITTLE PERSONALITY</legend><div class="builder-designs">${[['flower', 'Flower'], ['planet', 'Cosmic'], ['sun', 'Sunshine'], ['eye', 'Vision'], ['music', 'Music'], ['heart', 'Love']].map(([kind, name]) => `<label class="design-option"><input type="radio" name="kind" value="${kind}" ${builderValues.kind === kind ? 'checked' : ''} />${badgeSvg(kind, `design-${kind}`, 'MADE FOR YOUR MOMENT')}<span>${name}</span></label>`).join('')}</div></fieldset><div class="builder-field"><label for="sbt-image">Add an event image <span style="font-weight:400">(optional)</span></label><input type="file" id="sbt-image" accept="image/png,image/jpeg,image/webp" /><small>${image ? 'An event image is loaded. It stays on this page until you leave or refresh.' : 'PNG, JPEG, or WebP · up to 3 MB · kept in this page’s memory only.'}</small></div><div class="builder-policy"><span>Network: <b>Sepolia testnet only</b></span><span>Badge: non-transferable SBT</span></div><p class="form-error" id="builder-error" role="alert"></p><button class="button button-dark" type="submit">${session?.role === 'organizer' ? 'Create my event draft' : 'Sign in & preview my draft'} <span>↗</span></button>${note('This form prepares a <strong>frontend draft</strong>. Connect your existing event API and SBT contract to publish or issue. Refreshing clears drafts and uploaded images.')}</form><aside class="builder-preview" id="builder-live-preview" aria-label="Live badge design preview">${builderPreview()}</aside></div>`;
  }

  function documentation() {
    return `<div class="guide-layout"><aside class="guide-sidebar"><h3>BUILDERS DOCUMENTATION</h3><a href="#docs-network">Network & scope</a><a href="#docs-organizers">Organizer quickstart</a><a href="#docs-wallet">Wallet sign-in</a><a href="#docs-listing">Listing your SBT POAP</a><a href="#docs-collectors">Collectors & event history</a><a href="#docs-integrate">Frontend integration</a><div class="guide-network"><b>Sepolia testnet only</b><span>11155111 · 0xaa36a7<br />No mainnet or Solana support</span></div></aside><article class="guide-article"><section class="guide-block" id="docs-network"><p class="overline">START HERE</p><h2>A little context before you build.</h2>${note('<strong>This project is only for Sepolia testnet.</strong> Ethereum chain ID: <strong>11155111</strong> (hex <strong>0xaa36a7</strong>). It is an independent POAP-inspired SBT frontend, not the official POAP service.')}<p>These screens are frontend-only. Sample events, collector profiles, wallet flow, and SBT listings illustrate the intended experience. No blockchain connection, real authentication, attendance verification, deployment, or minting is included.</p><p>Use MetaMask or Phantom’s Ethereum account in your existing project. Mainnet, other EVM networks, and Phantom’s Solana account are outside this project’s scope.</p></section><section class="guide-block" id="docs-organizers"><p class="overline">FOR ORGANIZERS</p><h2>From your event to their collection.</h2><ol><li>Connect a supported Ethereum wallet, switch to Sepolia, and sign in as an organizer.</li><li>Open <a href="#builders/build">Build with POAP</a>. Fill in the event name, story, date, location, artwork, and optional event image.</li><li>Create a draft and preview its gallery listing. Download its metadata if you need it for your integration.</li><li>In your existing project, upload the artwork and metadata to durable storage, validate the event, and register it through your backend and Sepolia SBT contract.</li><li>Verify attendees, issue or enable eligible claims, then display the confirmed event and badge records in Collector.</li></ol></section><section class="guide-block" id="docs-wallet"><p class="overline">WALLET SIGN-IN</p><h2>One wallet. A proper hello.</h2><p>The UI has two roles, MetaMask and Phantom choices, a connection step, a signature step, cancellation, and sign-out. The default mode is explicitly a preview and sends no requests to a wallet.</p><p>During integration, your wallet callback should request an Ethereum account, require Sepolia, and verify a sign-in message before returning <code>{ address, chainId: 11155111, signed: true }</code>. The UI rejects an unsupported chain or an unsigned result.</p><p>Role selection is a UI preference, not authorization. Your server and contract must validate organizer permissions, use one-time sign-in challenges, and invalidate sessions on account changes, chain changes, expiry, and sign-out. Never ask for HD-wallet seed phrases or private keys.</p></section><section class="guide-block" id="docs-listing"><p class="overline">LISTING YOUR CUSTOMIZED SBT POAP</p><h2>Make the listing tell the story.</h2><table class="guide-table"><thead><tr><th>Field</th><th>Purpose</th></tr></thead><tbody><tr><td>Event name & description</td><td>The moment attendees will recognize.</td></tr><tr><td>Date & location</td><td>The event details used in history and discovery.</td></tr><tr><td>Event image & badge artwork</td><td>The event’s gallery cover and collectible design.</td></tr><tr><td>Organizer address</td><td>Supplied by your verified wallet session, not a typed claim.</td></tr><tr><td>Network</td><td>Sepolia only: 11155111.</td></tr><tr><td>SBT policy</td><td>Non-transferability, eligibility, and duplicate protection enforced by your contract.</td></tr><tr><td>Contract, token ID & transaction</td><td>Populate only after a successful onchain issuance.</td></tr></tbody></table><p style="margin-top:17px">The downloaded JSON is a metadata draft. It is not a deployed contract, an issued SBT, or a published event. Preview listings are temporary and disappear when the page refreshes.</p></section><section class="guide-block" id="docs-collectors"><p class="overline">COLLECTOR EXPERIENCE</p><h2>Everything worth looking back on.</h2><p><strong>Gallery</strong> provides searchable event covers, stories, dates, locations, and POAP artwork. <strong>Collectors</strong> lets people look up sample profiles or wallet addresses. <strong>Collection</strong> separates attended events from organized events.</p><p>During integration, load these views from your existing event and attendance records. Only label a badge “collected” after the wallet actually owns it. A saved favorite is not proof of attendance. Private attendee data should never be exposed just because someone connects a wallet.</p></section><section class="guide-block" id="docs-integrate"><p class="overline">FOR YOUR EXISTING VS CODE PROJECT</p><h2>Keep your logic. Bring the frontend.</h2><p>The original hero, animated 3D medal, doodles, and centered NTL footer stay intact. The four areas live in <code>src/platform.js</code>, their styles in <code>src/platform.css</code>, and example data in <code>src/platform-data.js</code>.</p><p>Supply <code>connectWallet</code>, <code>disconnectWallet</code>, <code>events</code>, and <code>people</code> when calling <code>mountPlatform</code>. Listen for <code>poap:draft-created</code> to receive a validated frontend event draft. The README includes an integration example and data shape.</p><p>Run <code>npm run dev</code> while integrating. The standalone HTML is useful for design review; it is not a production authentication or blockchain client.</p><a class="text-link" href="#issuer/guide">Read the organizer field guide ↗</a></section></article></div>`;
  }

  function renderRoute() {
    const hash = win.location.hash.slice(1).split('/');
    if (!routes[hash[0]]) {
      root.hidden = true;
      $$('[data-home]').forEach(element => { element.hidden = false; });
      return;
    }
    page = hash[0];
    const config = routes[page];
    sub = config.tabs.some(([key]) => key === hash[1]) ? hash[1] : config.tabs[0][0];
    $$('[data-home]').forEach(element => { element.hidden = true; });
    root.hidden = false;
    const content = page === 'about' ? about() : page === 'issuer' ? issuer() : page === 'collector' ? (sub === 'gallery' ? gallery() : sub === 'collectors' ? collectors() : collection()) : sub === 'build' ? builder() : documentation();
    root.innerHTML = `<div class="area-breadcrumb"><a href="#">Home</a><span>/</span><span>${config.label}</span><span>SEPOLIA TESTNET ONLY</span></div><div class="area-header"><div><p class="eyebrow">${config.number} / ${config.label.toUpperCase()} · A LITTLE PROOF OF LIFE</p><h1 id="area-title">${config.title}<span>${config.accent}</span></h1></div><p>${config.description}</p></div><nav class="area-navigation" aria-label="${config.label} subsections">${config.tabs.map(([key, title], i) => `<a href="#${page}/${key}" ${key === sub ? 'aria-current="page"' : ''}><span>${String(i + 1).padStart(2, '0')}</span>${title}</a>`).join('')}</nav>${content}`;
    if (page === 'collector' && sub === 'gallery') renderGalleryResults();
    $$('details.nav-dropdown').forEach(details => { details.open = false; });
  }

  function refreshWalletButtons() {
    $$('.wallet-button').forEach(button => {
      button.dataset.preview = String(Boolean(session?.preview));
      button.innerHTML = session ? `<span class="wallet-button-label">${session.preview ? 'Preview · ' : ''}${shortAddress(session.address)}</span><span aria-hidden="true">↗</span>` : '<span class="wallet-button-label">Connect wallet</span><span aria-hidden="true">↗</span>';
    });
  }

  function walletContent() {
    const preview = !connectWallet;
    const warning = preview ? '<div class="preview-disclaimer"><span aria-hidden="true">✳</span>Frontend preview. No wallet connection, signature, or transaction is requested.</div>' : '<div class="preview-disclaimer">Sepolia testnet only · Chain ID 11155111</div>';
    let content;
    if (session) content = `<p class="eyebrow">YOUR WALLET, YOUR LITTLE WORLD</p><h2>A good place<br />to belong.</h2><div class="session-badge"><span aria-hidden="true">☺</span><div><b>${shortAddress(session.address)}</b><small>${esc(session.wallet)} · ${esc(session.role)} · Sepolia${session.preview ? ' · PREVIEW SESSION' : ''}</small></div></div>${warning}<button class="button button-dark" data-wallet-action="collection">Open my collection <span>↗</span></button><button class="wallet-back" data-wallet-action="disconnect">${session.preview ? 'End preview / change role' : 'Sign out / change role'}</button>`;
    else if (walletStep === 'choose') content = `<p class="eyebrow">A LITTLE HELLO FROM YOUR WALLET</p><h2>Good to<br />have you here.</h2><p>Choose your side of the moment. Your Ethereum wallet takes care of the introduction.</p><div class="role-choices">${[['attendee', 'I was there.', 'Explore & collect your memories.'], ['organizer', 'I made it happen.', 'Create & manage your events.']].map(([role, label, text]) => `<label class="role-choice"><input type="radio" name="wallet-role" value="${role}" ${selectedRole === role ? 'checked' : ''} /><b>${label}</b><span>${text}</span></label>`).join('')}</div>${['MetaMask', 'Phantom'].map(wallet => `<button class="wallet-option" data-wallet="${wallet}"><span class="wallet-symbol" aria-hidden="true">${wallet === 'MetaMask' ? 'M' : 'P'}</span><span><b>${wallet}</b><small>Ethereum account · Sepolia</small></span><span aria-hidden="true">↗</span></button>`).join('')}${warning}<p class="form-error" id="wallet-error" role="alert"></p>`;
    else content = `<p class="eyebrow">${esc(selectedWallet.toUpperCase())} · SEPOLIA TESTNET</p><h2>${walletStep === 'connect' ? 'First, a little<br />connection.' : 'Now, make<br />it yours.'}</h2><div class="wallet-steps"><span class="${walletStep === 'connect' ? 'active' : ''}">01 CONNECT</span><i></i><span class="${walletStep === 'sign' ? 'active' : ''}">02 SIGN</span><i></i><span>03 EXPLORE</span></div><p>${walletStep === 'connect' ? 'In the integrated project, your wallet will ask to share its Ethereum address and use Sepolia. This preview doesn’t access your wallet.' : 'In the integrated project, sign a readable message to prove you control the connected address. This does not mint a badge or approve spending.'}</p>${walletStep === 'sign' ? `<div class="signature-message">NTL POAP · Sign-in preview\n\nRole: ${esc(selectedRole)}\nNetwork: Sepolia (11155111)\nPurpose: access your event scrapbook.\n\nNo transaction. No token approvals.\nNo seed phrase or private key.</div>` : ''}${warning}<button class="button button-dark" data-wallet-action="${walletStep === 'connect' ? 'connect-preview' : 'sign-preview'}">${walletStep === 'connect' ? 'Preview connection' : 'Preview signature & continue'} <span>↗</span></button><button class="wallet-back" data-wallet-action="back">← Choose another wallet</button><p class="form-error" id="wallet-error" role="alert"></p>`;
    walletBody.innerHTML = content;
  }

  function showWallet(role) {
    if (role) selectedRole = role;
    walletStep = 'choose';
    walletContent();
    open(walletDialog);
  }

  function finishSession(value) {
    session = value;
    refreshWalletButtons();
    close(walletDialog);
    renderRoute();
    if (page !== 'builders') { profileAddress = ''; go('collector', 'collection'); }
  }

  async function connectExistingProject(wallet) {
    if (walletBusy) return;
    walletBusy = true;
    const request = ++walletRequest;
    const role = selectedRole;
    $$('[data-wallet]', walletBody).forEach(button => { button.disabled = true; });
    $('#wallet-error', walletBody).textContent = 'Complete the connection and sign-in in your wallet…';
    try {
      const value = await connectWallet({ wallet, role, chainId: SEPOLIA_CHAIN_ID });
      if (request !== walletRequest || !walletDialog.open) return;
      if (!/^0x[\da-fA-F]{40}$/.test(value?.address || '')) throw new Error('The wallet integration did not return a valid Ethereum address.');
      if (Number(value.chainId) !== SEPOLIA_CHAIN_ID) throw new Error('This project is only for Sepolia testnet. Switch networks and try again.');
      if (value.signed !== true) throw new Error('Please sign in with your wallet before continuing.');
      finishSession({ address: value.address, role, wallet, preview: false });
    } catch (error) {
      if (request === walletRequest && walletDialog.open) $('#wallet-error', walletBody).textContent = error.code === 4001 ? 'Request declined. Nothing was changed.' : error.message || 'Wallet sign-in could not be completed.';
    } finally { walletBusy = false; $$('[data-wallet]', walletBody).forEach(button => { button.disabled = false; }); }
  }

  walletBody.addEventListener('change', event => { if (event.target.name === 'wallet-role') selectedRole = event.target.value; });
  walletBody.addEventListener('click', async event => {
    const wallet = event.target.closest('[data-wallet]')?.dataset.wallet;
    const action = event.target.closest('[data-wallet-action]')?.dataset.walletAction;
    if (wallet) { selectedWallet = wallet; if (connectWallet) await connectExistingProject(wallet); else { walletStep = 'connect'; walletContent(); } }
    if (action === 'back') { walletStep = 'choose'; walletContent(); }
    if (action === 'connect-preview') { walletStep = 'sign'; walletContent(); }
    if (action === 'sign-preview') finishSession({ address: selectedRole === 'organizer' ? samplePeople[2].address : samplePeople[0].address, wallet: selectedWallet, role: selectedRole, preview: true });
    if (action === 'collection') { close(walletDialog); profileAddress = ''; go('collector', 'collection'); }
    if (action === 'disconnect') {
      try { await disconnectWallet?.(); }
      catch (error) { walletBody.insertAdjacentHTML('beforeend', `<p class="form-error" role="alert">${esc(error.message || 'Sign-out could not be completed. Try again.')}</p>`); return; }
      session = null; walletStep = 'choose'; refreshWalletButtons(); walletContent(); renderRoute();
    }
  });

  function showEvent(id) {
    const event = events.find(item => item.id === id);
    if (!event) return;
    const organizer = people.find(person => person.address.toLowerCase() === event.organizer?.toLowerCase());
    $('#event-body').innerHTML = `<p class="eyebrow">${event.draft ? 'YOUR EVENT · DRAFT PREVIEW' : 'A LITTLE LOOK BACK · SAMPLE EVENT'}</p><h2 id="event-dialog-title">${esc(event.title)}</h2><p>${esc(event.date)} · ${esc(event.location)}</p><div class="event-detail-cover" style="--card-bg:var(--${esc(event.color || 'lavender')})">${eventPoster(event, 'detail-poster')}</div><p>${esc(event.description)}</p><div class="event-badge-detail">${badgeSvg(event.kind, 'detail-collectible', 'A MOMENT WORTH KEEPING')}<div><h3>Your little “I was there.”</h3><p>Customized SBT POAP · Sepolia<br />Non-transferable by design<br />${event.draft ? 'Draft · not published or minted' : 'Example artwork · not an issued token'}</p></div></div><p class="overline">THE MOMENT, IN PICTURES</p><div class="event-detail-photos"><div style="--card-bg:var(--${esc(event.color || 'lavender')})">${eventPoster(event, 'detail-memory')}<p>${event.image ? 'Your uploaded event image' : 'Illustrated event poster'}</p></div><div style="--card-bg:var(--bg)">${badgeSvg(event.kind, 'detail-artwork', 'MADE FOR THE MOMENT')}<p>The event’s POAP artwork</p></div></div>${organizer ? `<p style="margin-top:22px"><button class="text-link" data-profile="${esc(organizer.address)}">Organized by ${esc(organizer.name)} ↗</button></p>` : ''}<p class="demo-note">${event.draft ? 'This draft exists only in the current page. Download metadata before refreshing.' : 'Frontend example. Connect your existing project to show real event photos and verified attendance.'}</p>`;
    open(eventDialog);
  }

  function openProfile(address) {
    profileAddress = address; collectionView = 'attended';
    if (eventDialog.open) close(eventDialog);
    go('collector', 'collection');
  }
  eventDialog.addEventListener('click', event => { const address = event.target.closest('[data-profile]')?.dataset.profile; if (address) openProfile(address); });

  doc.addEventListener('click', event => {
    const wallet = event.target.closest('.wallet-button');
    if (wallet) { event.preventDefault(); event.stopImmediatePropagation(); showWallet(); }
    const create = event.target.closest('#create-button');
    if (create) { event.preventDefault(); event.stopImmediatePropagation(); go('builders', 'build'); }
    const galleryCategory = event.target.closest('[data-gallery-category]')?.dataset.galleryCategory;
    if (galleryCategory) category = galleryCategory;
    const link = event.target.closest('a[href]');
    if (link && link.closest('details.nav-dropdown')) link.closest('details').open = false;
  }, true);

  root.addEventListener('click', event => {
    const target = event.target.closest('button, a');
    if (!target) return;
    const href = target.getAttribute('href');
    const localId = href?.startsWith('#') ? href.slice(1) : '';
    const localSection = localId ? $$('#platform [id]').find(element => element.id === localId) : null;
    if (localSection) { event.preventDefault(); localSection.scrollIntoView({ behavior: 'smooth' }); }
    if (target.dataset.openWallet) showWallet(target.dataset.openWallet);
    if (target.dataset.event) showEvent(target.dataset.event);
    if (target.dataset.profile) openProfile(target.dataset.profile);
    if (target.dataset.collectionView) { collectionView = target.dataset.collectionView; renderRoute(); }
    if (target.hasAttribute('data-my-scrapbook')) { profileAddress = ''; renderRoute(); }
    if (target.hasAttribute('data-view-draft') && draft) showEvent(draft.id);
    if (target.hasAttribute('data-download-draft') && draft) {
      const url = win.URL.createObjectURL(new Blob([JSON.stringify(draftMetadata(draft), null, 2)], { type: 'application/json' }));
      const link = doc.createElement('a'); link.href = url; link.download = 'sepolia-poap-draft.json'; doc.body.append(link); link.click(); link.remove(); win.URL.revokeObjectURL(url);
    }
  });

  root.addEventListener('input', event => {
    if (event.target.id === 'event-search') { search = event.target.value; renderGalleryResults(); }
    if (event.target.id === 'people-search') {
      const query = event.target.value.trim().toLowerCase();
      const visible = people.filter(person => `${person.name} ${person.handle} ${person.address}`.toLowerCase().includes(query));
      $('#people-results').innerHTML = visible.map(personCard).join('') || empty('No collector found.', 'Try a sample name, handle, or wallet address.');
    }
    if (event.target.closest('#sbt-builder') && event.target.name in builderValues) { builderValues[event.target.name] = event.target.value; $('#builder-live-preview').innerHTML = builderPreview(); }
  });

  root.addEventListener('change', async event => {
    if (event.target.id === 'event-category') { category = event.target.value; renderGalleryResults(); }
    if (event.target.name === 'kind') { builderValues.kind = event.target.value; $('#builder-live-preview').innerHTML = builderPreview(); }
    if (event.target.id === 'sbt-image') {
      const file = event.target.files?.[0];
      if (!file) { image = ''; return; }
      const error = $('#builder-error'); error.textContent = '';
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) { error.textContent = 'Choose a PNG, JPEG, or WebP image under 3 MB.'; event.target.value = ''; return; }
      try {
        image = await new Promise((resolve, reject) => { const reader = new win.FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('The image could not be read. Try another file.')); reader.readAsDataURL(file); });
        error.textContent = 'Event image loaded. It will appear in your draft listing.';
      } catch (cause) { error.textContent = cause.message; }
    }
  });

  root.addEventListener('submit', event => {
    if (event.target.id !== 'sbt-builder') return;
    event.preventDefault();
    try {
      const next = makeDraft(new Map(Object.entries(builderValues)), image);
      if (!session || session.role !== 'organizer') { showWallet('organizer'); return; }
      next.organizer = session.address;
      draft = next; events.unshift(next);
      renderRoute();
      doc.dispatchEvent(new win.CustomEvent('poap:draft-created', { detail: { ...draft } }));
    } catch (error) { $('#builder-error').textContent = error.message; }
  });

  $$('details.nav-dropdown').forEach(dropdown => dropdown.addEventListener('toggle', () => { if (dropdown.open) $$('details.nav-dropdown').filter(other => other !== dropdown).forEach(other => { other.open = false; }); }));
  win.addEventListener('hashchange', () => {
    renderRoute();
    if (routes[win.location.hash.slice(1).split('/')[0]]) win.scrollTo?.({ top: 0, behavior: 'instant' });
  });
  refreshWalletButtons();
  renderRoute();

  return { clearSession() { walletRequest++; walletBusy = false; session = null; if (walletDialog.open) close(walletDialog); refreshWalletButtons(); renderRoute(); }, refresh: renderRoute };
}
