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
    ['spark','For the builders','A hackathon worth remembering.','Celebrate a weekend of learning and building. Organizers distribute role-specific recipient links and a live Walk-in QR.'],
    ['flower','For the creative ones','An exhibition beyond its closing night.','Bring your own artwork or video. Give visitors a keepsake that carries the event’s visual identity into their collection.'],
    ['heart','For the people people','Your community’s first hello.','Mark a club meetup, workshop, or shared milestone. Use recipient links for invited roles and a live Walk-in QR for attendees.']
  ].map(([kind,kicker,heading,text])=>`<article class="story-card">${doodle(kind)}<p class="eyebrow">${kicker}</p><h2>${heading}</h2><p>${text}</p></article>`).join('')}</div><p class="quiet-note">These are ways to use Kairo, rather than endorsements or claims about past events.</p>` : `<div class="story-layout"><article><h2>Give an experience a place in your story.</h2><p>A concert ends. A workshop closes. A community moves on to its next idea. A collectible gives you a small, personal way to remember that you were part of it.</p><p>POAP introduced a way to connect digital collectibles with shared experiences. Kairo brings that idea to campus communities, using its own contract and attendance rules on the configured test network.</p><h2>A keepsake with a verifiable record.</h2><p>Each event brings together a story, a design, and the wallets that receive its collectible. A growing collection can reflect the people you met, the things you learned, and the communities you helped build.</p><h2>Designed to stay with you.</h2><p>Kairo collectibles are soulbound. Once issued, they stay in the receiving wallet: transfers, approvals, and burns are disabled. Recipient-link and QR claims remain clearly distinguished.</p><p>Curious about the original protocol? <a class="text-link" href="https://poap.xyz/about-the-protocol" target="_blank" rel="noopener">Read about POAP ↗</a></p></article><aside class="story-note">${doodle('planet')}<p class="eyebrow">YOUR WALLET. YOUR CHOICE.</p><h2>You decide<br>what connects.</h2><p>Kairo uses MetaMask. Approve your account inside MetaMask. Connecting shares an address; signing in proves you control it. A mint is a separate, explicit action.</p><a class="text-link" href="#collector/gallery">Find your next moment ↗</a></aside></div><div class="story-cards"><article class="story-card"><span>01</span><h3>Make the moment.</h3><p>List an event, upload your design, or turn the event description into a badge in the organiser studio.</p></article><article class="story-card"><span>02</span><h3>Be part of it.</h3><p>Scan a live Walk-in QR or open your recipient link, then sign in with MetaMask and claim.</p></article><article class="story-card"><span>03</span><h3>Keep your story.</h3><p>The organiser sponsors attendee minting. Confirmed collectibles appear in your on-chain collection.</p></article></div><p class="quiet-note">Kairo is an independent, POAP-inspired project on a test network. Testnet collectibles are not official academic credentials. Emails stay private and off-chain; wallet ownership and event metadata are public. Keep your wallet secure: a lost address cannot be replaced by transferring its tokens.</p>`);
}

const guide = [
 ['wallet','Connect your wallet',["Click Connect wallet and choose your account in MetaMask, then sign the free sign-in message. Minting always uses this connected wallet. On a phone, use MetaMask’s browser or approve the MetaMask handoff."]],
 ['organizers','List an event',["Any signed-in MetaMask wallet can publish. Add the title, description, category, venue or online link, event dates, approximate attendees, minting window and up to eight roles. The daily event limit helps prevent spam."]],
 ['design','Create your badge',["Upload a PNG or JPEG up to 2 MB, or generate a badge from your description. Each role has its own design and cap. Optional videos can be MP4 or WebM up to 10 MB. Review every design before publishing."]],
 ['publish','Publish and share',["Publish event uploads and freezes metadata, then the relayer creates all roles in one blockchain transaction. No gas payment or review step is required. Interrupted publication can resume from your studio."]],
 ['attendance','Distribute and claim',["Walk-ins scan the organizer’s live Walk-in QR to claim the Attendee role. Codes rotate about every 30 seconds. A QR scanned live and shared cannot be distinguished from one scanned in person.","For pre-registered people, winners, volunteers and judges, paste or upload email,role CSV. Duplicate emails are merged per event and role. Export new links for mail merge, copy a link, or open it in your own mail app. A link works for whoever opens it first. Only hashes are stored, so save the export before leaving; regenerate a link if necessary.","Participants see the event and role before signing in with MetaMask and choosing Mint. One badge per event, role and wallet. A failed mint can be retried by the organizer; a permanently failed recipient link returns to issued."]],
 ['collect','Find your collection',["Gallery shows your minted badges grouped by event. Click one for its details and Etherscan proof. After confirmation, the success screen shows your badge and transaction link."]],
 ['limits','What stays permanent',["Badge artwork and the mint window are frozen on chain and cannot be edited. The super admin can moderate listings, edit off-chain text, and pause minting. Badges cannot be transferred or burned. Emails are private to the organizer and super admin, and are deleted on request or after the configured retention period (30 days by default)."]]
];
const reference = [
 ['start','Build a reason to show up',["Create workshops, hackathons, exhibitions and community events with a POAP for each contribution."]],
 ['story','Give your event a story',["Add your event text, category, venue or online link, dates, approximate attendees and up to eight roles."]],
 ['design','Design for every contribution',["Upload a custom design for each role or explicitly generate POAPs from description. Each role has its own supply cap and immutable metadata."]],
 ['publish','Publish a live event',["Publish immediately with sponsored gas. All roles are created in one blockchain transaction. Saved transaction bytes and receipts allow interrupted publication to resume."]],
 ['welcome','Welcome your community',["Use rotating Walk-in QR codes for Attendees and single-use recipient links for other roles. A link works for whoever opens it first. A QR scanned live and shared cannot be distinguished from one scanned in person."]],
 ['keep','Let the moments add up',["Confirmed POAPs appear in Gallery. Click a badge to see its details and blockchain proof. They stay with the receiving MetaMask wallet."]],
 ['health','Build with clear expectations',["The relayer sponsors gas on the configured Sepolia test network. GET /api/health reports which dependency is failing. The super admin dashboard shows relayer balance, event moderation and the audit log. Artwork and minting windows are frozen on chain."]]
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
