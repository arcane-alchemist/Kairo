import { badges, badgeSvg } from './art.js';

export const SEPOLIA_CHAIN_ID = 11155111;
export const samplePeople = [
  { name: 'Mira Chen', handle: 'mira.collects', address: '0x1111111111111111111111111111111111111111', initials: 'MC', color: 'lavender', bio: 'Here for the music. Staying for the people.', events: ['flower', 'planet', 'music'] },
  { name: 'Alex Rivera', handle: 'alex.makes', address: '0x2222222222222222222222222222222222222222', initials: 'AR', color: 'peach', bio: 'A little art, a little internet, a lot of good memories.', events: ['eye', 'heart', 'sun'] },
  { name: 'The Little Joys Club', handle: 'littlejoys', address: '0x3333333333333333333333333333333333333333', initials: 'LJ', color: 'lime', bio: 'Making little things worth showing up for.', events: ['flower', 'sun'] }
];

export const sampleEvents = badges.map((badge, index) => ({
  ...badge,
  title: badge.name,
  date: ['2026-10-12', '2026-10-18', '2026-10-20', '2026-10-24', '2026-10-25', '2026-10-26'][index],
  time: ['15:00', '20:00', '11:00', '10:00', '19:00', '14:00'][index],
  organizer: index % 2 ? samplePeople[1].address : samplePeople[2].address,
  chainId: SEPOLIA_CHAIN_ID,
  sample: true
}));

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export const shortAddress = address => address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';

export function safeImageSource(source = '') {
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z\d+/=]+$/.test(source) || /^\/(?!\/)/.test(source)) return source;
  try { return new URL(source).protocol === 'https:' ? source : ''; } catch { return ''; }
}

export function eventPoster(event, uid = event.id) {
  const image = safeImageSource(event.image);
  if (image) return `<img src="${escapeHtml(image)}" alt="${escapeHtml(event.title)} event artwork" class="event-upload-image" />`;
  const title = escapeHtml(event.title);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 390" role="img" aria-label="${title} event poster"><rect width="640" height="390" fill="var(--card-bg)"/><g fill="none" stroke="currentColor" opacity=".17"><circle cx="505" cy="180" r="150"/><circle cx="505" cy="180" r="175"/><path d="M0 90h640M0 300h640"/></g><g transform="translate(352,40) rotate(12,160,160)">${badgeSvg(event.kind, `poster-${uid}`, 'A MOMENT WORTH KEEPING').replace('viewBox="0 0 320 320"', 'width="290" height="290" viewBox="0 0 320 320"')}</g><g fill="currentColor" font-family="sans-serif"><text x="32" y="53" font-size="12" letter-spacing="3">${escapeHtml(event.event || 'YOUR NEXT GOOD MOMENT')}</text><text x="32" y="158" font-size="42" font-weight="700">${escapeHtml(event.title.split(' ').slice(0, 2).join(' '))}</text><text x="32" y="205" font-size="42" font-weight="700">${escapeHtml(event.title.split(' ').slice(2).join(' ').slice(0, 22))}</text><text x="32" y="337" font-size="12" letter-spacing="2">${escapeHtml(event.date)} · SEPOLIA EDITION</text></g><path d="m56 242 6 17 18 4-18 5-6 17-5-17-18-5 18-4Z" fill="currentColor"/></svg>`;
}

export function makeDraft(form, image = '') {
  const title = String(form.get('title') || '').trim();
  const description = String(form.get('description') || '').trim();
  const location = String(form.get('location') || '').trim();
  const date = String(form.get('date') || '');
  const kind = String(form.get('kind') || 'flower');
  if (!title || title.length > 60) throw new Error('Add an event name of 1–60 characters.');
  if (!description || description.length > 400) throw new Error('Tell the story in 1–400 characters.');
  if (!location || location.length > 100) throw new Error('Add a location of 1–100 characters.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Choose a valid event date.');
  if (!['flower', 'planet', 'sun', 'eye', 'music', 'heart'].includes(kind)) throw new Error('Choose one of the available badge designs.');
  return { id: `draft-${crypto.randomUUID()}`, title, description, location, date, kind, image, color: 'lavender', event: 'YOUR EVENT · DRAFT PREVIEW', category: 'community', chainId: SEPOLIA_CHAIN_ID, soulbound: true, draft: true };
}

export function draftMetadata(draft) {
  return {
    name: draft.title,
    description: draft.description,
    image: draft.image || `data:image/svg+xml;charset=utf-8,${encodeURIComponent(badgeSvg(draft.kind, 'export', 'A MOMENT WORTH KEEPING'))}`,
    attributes: [{ trait_type: 'Event date', value: draft.date }, { trait_type: 'Location', value: draft.location }, { trait_type: 'Network', value: 'Sepolia testnet' }, { trait_type: 'Chain ID', value: SEPOLIA_CHAIN_ID }, { trait_type: 'Soulbound', value: true }],
    properties: { status: 'frontend-draft', chainId: SEPOLIA_CHAIN_ID, soulbound: true }
  };
}
