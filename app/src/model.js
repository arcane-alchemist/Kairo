export const DEFAULT_API = 'https://kairo.aakritigupta7227.workers.dev';
export function parseCode(input) {
  const value = String(input).trim();
  const wallet = value.match(/^(?:ethereum:)?(0x[a-fA-F0-9]{40})(?:@11155111)?(?:\?.*)?$/);
  if (wallet) return { type: 'wallet', value: wallet[1] };
  const ticket = value.match(/^(?:kairo:ticket:)?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
  if (ticket) return { type: 'ticket', value: ticket[1] };
  const drop = value.match(/^(?:drop:|#)?([1-9]\d*)$/i);
  if (drop && Number.isSafeInteger(Number(drop[1]))) return { type: 'drop', value: Number(drop[1]) };
  try {
    const url = new URL(value);
    if (![DEFAULT_API, 'https://kairo-site-7fb.pages.dev'].includes(url.origin)) throw Error();
    const ticketLink = url.hash.match(/^#ticket\/([a-f0-9-]{36})$/i);
    if (ticketLink) return parseCode(ticketLink[1]);
    const match = url.hash.match(/^#(?:event|drop)\/(\d+)$/);
    if (match) return parseCode(match[1]);
  } catch {}
  throw Error('Scan a Kairo ticket, Ethereum wallet QR, or enter a Drop ID.');
}
export function searchDrops(drops, query) {
  const needle = query.trim().toLowerCase().replace(/^drop\s*#?/, '');
  return drops.filter(drop => [String(drop.id), drop.title, drop.club, drop.description, drop.venue].some(value => String(value).toLowerCase().includes(needle)));
}
export function mintStatus(ticket) {
  if (!ticket.checked_in_at && !ticket.claimed_at) return 'RSVP confirmed — awaiting staff check-in';
  return ({ pending: ticket.claimed_at ? 'Wallet claim accepted — mint queued' : 'Attendance verified — mint queued', submitted: 'Mint submitted — confirming on Sepolia', confirmed: 'Collectible minted', failed: 'Mint failed — contact event staff' })[ticket.status] || 'Checking mint status';
}
