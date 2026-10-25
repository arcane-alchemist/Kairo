import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesEvent, eventState, profileStats, filterCollection } from './student-model.js';
const event = { id: 1, title: 'Build Night', campus: 'North Campus', club: 'Code Club', organizer: '0xabc', category: 'Hackathon', roles: ['Attendee', 'Mentor'], startsAt: 100, endsAt: 200 };
test('discovery searches campus, organizer and roles and distinguishes active from past events', () => {
  for (const search of ['north', '0xabc', 'mentor']) assert(matchesEvent(event, { search }, 150));
  assert(!matchesEvent(event, { role: 'Speaker' }, 150));
  assert(!matchesEvent(event, {}, 201));
  assert(matchesEvent(event, { period: 'all' }, 201));
  assert.equal(eventState(event, 150), 'Happening now');
});
test('profiles never count QR claims or unknown roles as verified attendance', () => {
  const items = [{ ...event, tokenId: '1', role: 'Mentor', attendanceVerified: true }, { ...event, tokenId: '2', role: 'Collector', attendanceVerified: false }];
  assert.deepEqual(profileStats(items), { participations: 1, events: 1, roles: ['Mentor'], organizations: ['Code Club'] });
  assert.equal(filterCollection(items, { role: 'Collector' }).length, 1);
  assert.equal(filterCollection(items, { search: 'absent' }).length, 0);
});
