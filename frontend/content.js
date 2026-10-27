const esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function doodle(kind = 'spark', extra = '') {
  const paths = {
    spark: '<path d="m45 5 8 27 27 8-27 9-8 28-9-28-28-9 28-8Z"/>',
    heart: '<path d="M45 72C8 48 8 18 28 18c10 0 17 11 17 11s7-11 17-11c20 0 20 30-17 54Z"/>',
    planet: '<circle cx="45" cy="43" r="24"/><ellipse cx="45" cy="43" rx="41" ry="11" transform="rotate(-25 45 43)"/>',
    flower: '<path d="M45 24C22 0 3 33 29 43 0 63 35 87 45 59c10 28 45 4 16-16C87 33 68 0 45 24Z"/><circle cx="45" cy="43" r="8"/>',
    arrow: '<path d="M9 65C21 25 43 17 73 31M52 12l23 18-24 16"/>'
  };
  return `<svg class="moving-doodle doodle-${kind} ${extra}" viewBox="0 0 90 90" aria-hidden="true" focusable="false">${paths[kind] || paths.spark}</svg>`;
}
const tabs = (group, active, rows) => `<nav class="section-tabs" aria-label="${group} subsections">${rows.map(([id,label]) => `<a href="#${id}" ${active === id ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
const title = (eyebrow, heading, text, kind = 'flower') => `<header class="story-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${heading}</h1><p class="lead">${text}</p></div>${doodle(kind)}</header>`;

export function aboutContent(hash) {
  const cases = hash === '#about/case-studies';
  const active = cases ? 'about/case-studies' : 'about/proof';
  return (cases ? '<a class="back-link" href="#about/proof">← Back to About</a>' : '') + title('ABOUT KAIRO', cases ? 'Good reasons<br>to show up.' : 'A moment passes.<br><em>Your proof stays.</em>', cases ? 'One idea. A whole campus of possibilities.' : 'Kairo helps communities turn shared experiences into personal, verifiable keepsakes.') + tabs('About',active,[['about/proof','About'],['about/case-studies','What you can make']]) + (cases ? `<div class="story-cards">${[
    ['spark','For the builders','A hackathon worth remembering.','Celebrate a weekend of learning and building. Organisers verify attendance before each participant receives their event’s collectible.'],
    ['flower','For the creative ones','An exhibition beyond its closing night.','Bring your own artwork or video. Give visitors a keepsake that carries the event’s visual identity into their collection.'],
    ['heart','For the people people','Your community’s first hello.','Mark a club meetup, workshop, or shared milestone. Use staff check-in for verified attendance, or clearly labelled QR distribution for an open collectible.']
  ].map(([kind,kicker,heading,text])=>`<article class="story-card">${doodle(kind)}<p class="eyebrow">${kicker}</p><h2>${heading}</h2><p>${text}</p></article>`).join('')}</div><p class="quiet-note">These are ways to use Kairo, rather than endorsements or claims about past events.</p>` : `<div class="story-layout"><article><h2>Give an experience a place in your story.</h2><p>A concert ends. A workshop closes. A community moves on to its next idea. A collectible gives you a small, personal way to remember that you were part of it.</p><p>POAP introduced a way to connect digital collectibles with shared experiences. Kairo brings that idea to campus communities, using its own contract and attendance rules on the configured test network.</p><h2>A keepsake with a verifiable record.</h2><p>Each event brings together a story, a design, and the wallets that receive its collectible. A growing collection can reflect the people you met, the things you learned, and the communities you helped build.</p><h2>Designed to stay with you.</h2><p>Kairo collectibles are soulbound. Once issued, they stay in the receiving wallet: transfers, approvals, and burns are disabled. Staff-verified attendance and open QR claims remain clearly distinguished.</p><p>Curious about the original protocol? <a class="text-link" href="https://poap.xyz/about-the-protocol" target="_blank" rel="noopener">Read about POAP ↗</a></p></article><aside class="story-note">${doodle('planet')}<p class="eyebrow">YOUR WALLET. YOUR CHOICE.</p><h2>You decide<br>what connects.</h2><p>Kairo uses MetaMask. Approve your account inside MetaMask. Connecting shares an address; signing in proves you control it. A mint is a separate, explicit action.</p><a class="text-link" href="#collector/gallery">Find your next moment ↗</a></aside></div><div class="story-cards"><article class="story-card"><span>01</span><h3>Make the moment.</h3><p>List an event, upload your design, or turn the event description into a badge in the organiser studio.</p></article><article class="story-card"><span>02</span><h3>Be part of it.</h3><p>RSVP and bring your ticket. Staff verify physical attendance; public QR claims are labelled separately.</p></article><article class="story-card"><span>03</span><h3>Keep your story.</h3><p>The organiser sponsors attendee minting. Confirmed collectibles appear in your on-chain collection.</p></article></div><p class="quiet-note">Kairo is an independent, POAP-inspired project on a test network. Testnet collectibles are not official academic credentials. Student IDs stay off-chain; wallet ownership and event metadata are public. Keep your wallet secure: a lost address cannot be replaced by transferring its tokens.</p>`);
}

const guide = [
  ['wallet','Connect your wallet',[
    "Click Connect wallet on the homepage. Kairo uses MetaMask; approve your account inside it. Kairo never picks an account for you; if you decline, you stay disconnected. Then approve the sign-in message. It is free and does not mint anything.",
    "The same account is used on every page. Reloading keeps you signed in; closing the browser signs you out. Use the header menu to switch account, copy your address, or disconnect. If your wallet is on the wrong network, a Switch to Sepolia button appears. On Phantom, turn on Testnet Mode in Developer Settings to use Sepolia. On a phone, open Kairo in your wallet app's built-in browser."
  ]],
  ['organizers','List an event',[
    "Open Create with your shared wallet session. Add the title, description, organization, venue, dates and roles. Enter your organizer wallet address and the approximate number of drops for each role. Save a draft, which stays private to your wallet and survives a refresh, or submit it for college admin review. A submitted event becomes public once the admin publishes it, and you can edit and resubmit before then."
  ]],
  ['design','Create your badge',[
    "Upload an image (PNG or JPEG, up to 2 MB) or a video (MP4 or WebM, up to 10 MB; it plays with controls and never starts with sound). Or choose Generate POAPs from description: Kairo designs an original badge from your event's keywords, colours and patterns, without any external AI service. Change the description and regenerate to try another design. Add one design for each participation role. Badges are shown as circles.",
    "Saving a design does not issue any token. Review it carefully: once the event is published, the badge and its details cannot be edited."
  ]],
  ['publish','Publish and share',[
    "Submit the finished event. The college admin reviews it and confirms it on the blockchain with test gas. Each role gets its own linked Drop ID and shareable QR code, with one admin transaction per role. If you close the page during publishing, resume from the creation form."
  ]],
  ['attendance','Check in and claim',[
    "Attendance events: RSVP with your student ID and consent to a permanent badge. The badge goes only to the wallet you signed in with. At the venue, staff scan your ticket and check your ID, and only authorized event staff can record check-in.",
    "QR events: with your wallet signed in, consent and claim once during the minting window. A QR claim does not prove you were physically there.",
    'Minting is free for you. "Queued" and "processing" mean it is on its way; "confirmed" means it is done. Staff can retry a failed mint from the attendance desk.'
  ]],
  ['collect','Find your collection',[
    "Gallery shows the badges of the wallet you signed in with. Click a badge to see its event, date, venue and details. Badge and wallet proof links can be opened by anyone without signing in. Load more pages when prompted. If Kairo cannot be reached, you see an error, never an empty collection. Your participation profile counts staff-verified attendance separately from QR claims and is not a verified real-world identity."
  ]],
  ['limits','What stays permanent',[
    "Kairo runs on the Sepolia test network, so badges are test assets, not official credentials. Badges are permanently locked to the wallet that received them: no transfers, approvals or burns. Check the receiving wallet carefully and protect its recovery phrase; Kairo never asks for it. Event details and wallet ownership are public. Student IDs are stored off-chain only as keyed hashes. Artwork is hosted by Kairo."
  ]]
];
const reference = [
  ['start','Build a reason to show up', ["Bring a workshop, hackathon, exhibition or community meetup to life. Kairo connects your event listing, attendance and a collectible people can keep. Start with the experience you want to create."]],
  ['story','Give your event a story', ["Tell people what they will do, who can join, and where and when to arrive. Add your community name, event category, participation roles and registration deadline in the organizer studio."]],
  ['design','Design for every contribution', ["A participant, volunteer and speaker can each have a different POAP. Add your roles, then upload a custom design for each or choose Generate POAPs from description. Review each preview before submitting. Nothing is generated until you ask for it."]],
  ['publish','From draft to live event', ["Save your designs privately, then submit them for college-admin review. Each role is published as a linked drop with its own frozen artwork. The admin confirms one blockchain transaction per role. Publication can resume if it is interrupted."]],
  ['welcome','Welcome your community', ["Share the event page and its role drops. Participants RSVP with their wallet, student ID and consent. At the attendance desk, staff verify the person’s ID, participation role and presence before issuing their POAP. The number of drops you enter sets the maximum supply separately for each role."]],
  ['keep','Let the moments add up', ["Confirmed POAPs appear in Gallery, grouped by event. Each badge opens its artwork and blockchain proof. These soulbound collectibles stay with their receiving wallet and cannot be transferred or burned."]],
  ['health','Build with clear expectations', ["Kairo runs on the Sepolia test network. Admin publication needs test gas; attendee issuance is sponsored. Open QR claims do not certify attendance. Artwork needs continued hosting, and a lost wallet cannot be replaced by moving its badges. GET /api/health reports which dependency is failing."]]
];
function numberedSections(rows, prefix) {
  return `<div class="docs-layout"><nav class="docs-index" aria-label="${prefix === 'guide' ? 'User guide' : 'Builders'} chapters">${rows.map(([id,heading],i)=>`<a href="#${prefix}-${id}"><span>${String(i+1).padStart(2,'0')}</span>${esc(heading)}</a>`).join('')}</nav><article class="docs-copy">${rows.map(([id,heading,paragraphs],i)=>`<section id="${prefix}-${id}"><h2><span class="eyebrow">${String(i+1).padStart(2,'0')} / </span>${esc(heading)}</h2>${paragraphs.map(text=>`<p>${esc(text)}</p>`).join('')}</section>`).join('')}</article></div>`;
}
export function issuerContent() {
  return '<a class="back-link" href="#issuer/studio">← Back to studio</a><header class="story-heading"><h1>Organizer guide</h1></header>' + numberedSections(guide,'guide');
}
export function documentationContent() {
  return title('FOR CAMPUS BUILDERS','Make something<br><em>worth remembering.</em>','A place for your community, a design for every contribution, and a keepsake for every moment.','spark') + '<p><a class="button button-dark" href="#issuer/studio">Open organizer studio ↗</a></p>' + numberedSections(reference,'doc');
}
