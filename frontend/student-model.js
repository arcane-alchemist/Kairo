export function eventState(event, now = Date.now() / 1000) {
  if (event.endsAt < now) return 'Past event';
  if (event.startsAt <= now) return 'Happening now';
  return 'Upcoming';
}
export function isPublicPastEvent(event, now = Date.now()/1000) {
  return event.listed!==false && event.approval!=='pending' && event.approval!=='rejected' && eventState(event,now)==='Past event';
}
export function matchesEvent(event, { search = '', category = 'All events', date = '', role = '', period = 'active' } = {}, now = Date.now() / 1000) {
  return (period === 'all' || event.endsAt >= now) && (category === 'All events' || event.category === category)
    && (!role || (event.roles || ['Attendee']).includes(role))
    && (!date || new Date(event.startsAt * 1000).toLocaleDateString('en-CA') === date)
    && `${event.title} ${event.campus || ''} ${event.club} ${event.organizer} ${event.category} ${(event.roles || ['Attendee']).join(' ')} ${new Date(event.startsAt * 1000).toLocaleDateString()}`.toLowerCase().includes(search.toLowerCase());
}
export function profileStats(items) {
  const verified = items.filter(item => item.attendanceVerified);
  return { participations: verified.length, events: new Set(verified.map(item => item.groupId || item.id)).size,
    roles: [...new Set(verified.map(item => item.role))], organizations: [...new Set(verified.map(item => item.club))] };
}
export function filterCollection(items, { search = '', year = '', role = '', organization = '', sort = 'newest' } = {}) {
  return items.filter(item => `${item.title} ${item.club} ${item.role} ${item.tokenId}`.toLowerCase().includes(search.toLowerCase())
    && (!year || (item.startsAt && String(new Date(item.startsAt * 1000).getFullYear()) === year))
    && (!role || item.role === role) && (!organization || item.club === organization))
    .sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title) : (sort === 'oldest' ? 1 : -1) * ((a.issuedAt || a.startsAt || 0) - (b.issuedAt || b.startsAt || 0)));
}

export function groupCollection(items) {
  const events = new Map();
  for (const item of items) {
    const key = String(item.groupId || item.id);
    if (!events.has(key)) events.set(key, {event:item, badges:[]});
    events.get(key).badges.push(item);
  }
  return [...events.values()];
}
