import { getAddress, verifyMessage, ZeroAddress } from 'ethers';
import { z } from 'zod';
import { connectChain } from './chain.js';
import { MintCoordinator } from './mint.js';
export { MintCoordinator };

const eventId = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const address = z.string().transform((value, ctx) => {
  try { const result = getAddress(value); if (result === ZeroAddress) throw Error(); return result; }
  catch { ctx.addIssue({ code: 'custom', message: 'Enter a valid Ethereum wallet address' }); return z.NEVER; }
});
const eventDetails = z.object({ claimMode: z.enum(['attendance','qr']).default('attendance'), id: eventId, title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(3).max(1000), club: z.string().trim().min(2).max(80),
  category: z.enum(['Technology', 'Arts', 'Community', 'Sports', 'Hackathon', 'Workshop', 'Fest', 'Seminar', 'Club', 'Competition', 'Other']),
  campus: z.string().trim().max(100).default(''), eligibility: z.string().trim().max(500).default('Open to campus participants with a college ID'),
  roles: z.array(z.string().trim().min(1).max(40)).min(1).max(8).default(['Attendee']), venue: z.string().trim().min(2).max(150),
  eventStartsAt: z.number().int().positive().optional(), eventEndsAt: z.number().int().positive().optional(),
  image: z.string().max(300), uri: z.string().max(300), rsvpDeadline: z.number().int().positive() });
const json = (data, status = 200) => Response.json(data, { status });
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const now = () => Math.floor(Date.now() / 1000);
export async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
async function studentHash(secret, value) {
  if (!secret || secret.length < 32) throw new HttpError(503, 'Registration is not configured');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value.trim().toLowerCase()));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
async function body(request, max = 16384) {
  if (Number(request.headers.get('content-length') || 0) > max) throw new HttpError(413, 'Request is too large');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Missing request body');
  let size = 0; const chunks = [];
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length; if (size > max) { await reader.cancel(); throw new HttpError(413, 'Request is too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(400, 'Invalid JSON'); }
}
async function user(request, env) {
  const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)kairo_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!cookie) throw new HttpError(401, 'Connect and sign in with your organizer wallet');
  const session = await env.DB.prepare('SELECT wallet FROM sessions WHERE hash=? AND expires_at>?').bind(await digest(cookie), now()).first();
  if (!session) throw new HttpError(401, 'Your session expired. Sign in again');
  return session.wallet;
}
async function limit(request, env, route) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const bucket = Math.floor(now() / 60);
  const key = await digest(`${env.STUDENT_HASH_SECRET}:${ip}:${route}:${bucket}`);
  const row = await env.DB.prepare(`INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count`).bind(key, now() + 120).first();
  if (row.count > 20) throw new HttpError(429, 'Too many requests. Please try again in a minute');
}
function publicEvent(row) {
  return { id: row.id, title: row.title, description: row.description, club: row.club, category: row.category,
    campus: row.campus || '', eligibility: row.eligibility, roles: JSON.parse(row.roles || '["Attendee"]'),
    venue: row.venue, image: row.image, uri: row.uri, startsAt: row.event_starts_at ?? row.starts_at, endsAt: row.event_ends_at ?? row.ends_at,
    mintStartsAt: row.starts_at, mintEndsAt: row.ends_at, dropId: row.id,
    claimMode: row.claim_mode || 'attendance', rsvpDeadline: row.rsvp_deadline, cap: row.cap, organizer: row.organizer };
}

export function createHandler(chainFactory = connectChain) {
  return async function handle(request, env) {
    const url = new URL(request.url); const path = url.pathname;
    try {
      if (path.startsWith('/media/')) {
        const key = path.slice(7);
        if (!/^(art|metadata)\/[a-f0-9]{64}\.(png|jpg|json)$/.test(key)) throw new HttpError(404, 'Not found');
        const object = await env.MEDIA.get(key);
        if (!object) throw new HttpError(404, 'Not found');
        return new Response(object.body, { headers: { 'content-type': object.httpMetadata.contentType,
          'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
      }
      if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
      if (request.method !== 'GET') {
        if (request.headers.get('origin') !== url.origin) throw new HttpError(403, 'Request origin is not allowed');
        if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, 'JSON required');
        await limit(request, env, path);
      }
      if (path === '/api/config') return json({ chainId: 11155111, contractAddress: env.CONTRACT_ADDRESS,
        issuerAddress: env.ISSUER_ADDRESS || null });
      if (path === '/api/events' && request.method === 'GET') {
        const { results } = await env.DB.prepare(`SELECT e.*,COUNT(r.id) AS rsvp_count FROM events e
          LEFT JOIN registrations r ON r.event_id=e.id GROUP BY e.id ORDER BY e.starts_at DESC LIMIT 200`).all();
        return json(results.map(row => ({ ...publicEvent(row), remaining: row.cap === 0 ? null : row.cap - row.rsvp_count })));
      }
      if (path === '/api/auth/challenge' && request.method === 'POST') {
        const id = crypto.randomUUID();
        const site = env.SITE_ORIGIN || url.origin;
        const input = z.object({ wallet: address.optional() }).parse(await body(request));
        // shortcut: accept cached clients without a wallet field until all clients use SIWE.
        const message = input.wallet
          ? `${new URL(site).host} wants you to sign in with your Ethereum account:\n${input.wallet}\n\nSign in to Kairo to collect POAPs on Sepolia. No transaction, gas payment, or token approval.\n\nURI: ${site}\nVersion: 1\nChain ID: 11155111\nNonce: ${id.replaceAll('-', '')}\nIssued At: ${new Date().toISOString()}\nExpiration Time: ${new Date((now() + 600) * 1000).toISOString()}`
          : `Sign in to Kairo at ${site}.\n\nConnect your wallet to collect POAPs on Sepolia.\nThis signature does not send a transaction or cost gas.\nValid for 10 minutes.\n\nRequest reference: ${id}`;
        await env.DB.prepare('INSERT INTO challenges VALUES(?,?,?)').bind(id, message, now() + 600).run();
        return json({ id, message });
      }
      if (path === '/api/auth/verify' && request.method === 'POST') {
        const input = z.object({ id: z.string().uuid(), signature: z.string().max(200) }).parse(await body(request));
        const challenge = await env.DB.prepare('SELECT * FROM challenges WHERE id=? AND expires_at>?').bind(input.id, now()).first();
        if (!challenge) throw new HttpError(401, 'Sign-in request expired');
        let wallet;
        try { wallet = verifyMessage(challenge.message, input.signature); } catch { throw new HttpError(401, 'Invalid signature'); }
        if (challenge.message.includes(' wants you to sign in with your Ethereum account:') &&
            wallet !== challenge.message.split('\n')[1]) throw new HttpError(401, 'Sign with the wallet that requested this session');
        const consumed = await env.DB.prepare('DELETE FROM challenges WHERE id=? RETURNING id').bind(input.id).first();
        if (!consumed) throw new HttpError(401, 'Sign-in request already used');
        const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
        await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await digest(token), wallet, now() + 600).run();
        return new Response(JSON.stringify({ wallet }), { headers: { 'content-type': 'application/json',
          'set-cookie': `kairo_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=600${url.protocol === 'https:' ? '; Secure' : ''}` } });
      }
      if (path === '/api/auth/me') {
        const wallet = await user(request, env); const chain = await chainFactory(env);
        return json({ wallet, admin: await chain.admin(wallet) });
      }
      if (path === '/api/auth/logout' && request.method === 'POST') {
        const cookie = request.headers.get('cookie')?.match(/kairo_session=([a-f0-9]{64})/)?.[1];
        if (cookie) await env.DB.prepare('DELETE FROM sessions WHERE hash=?').bind(await digest(cookie)).run();
        return new Response('{}', { headers: { 'content-type': 'application/json', 'set-cookie': 'kairo_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' } });
      }
      if (path === '/api/artwork' && request.method === 'POST') {
        const wallet = await user(request, env); const chain = await chainFactory(env);
        if (!await chain.admin(wallet)) throw new HttpError(403, 'College admin approval is required to create an event');
        const input = z.object({ name: z.string().trim().min(3).max(100), description: z.string().max(1000),
          image: z.string().max(2800000) }).parse(await body(request, 3000000));
        const match = input.image.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
        if (!match) throw new HttpError(400, 'Upload a PNG or JPEG');
        const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
        if (bytes.length > 2 * 1024 * 1024 || bytes.length < 8 ||
          (match[1] === 'png' ? ![137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v) : !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255))) {
          throw new HttpError(400, 'Invalid image or image exceeds 2 MB');
        }
        const hash = await digest(input.image);
        const image = `${url.origin}/media/art/${hash}.${match[1] === 'png' ? 'png' : 'jpg'}`;
        await env.MEDIA.put(image.split('/media/')[1], bytes, { httpMetadata: { contentType: `image/${match[1]}` } });
        const metadata = JSON.stringify({ name: input.name, description: input.description, image });
        const key = `metadata/${await digest(metadata)}.json`;
        await env.MEDIA.put(key, metadata, { httpMetadata: { contentType: 'application/json' } });
        return json({ image, uri: `${url.origin}/media/${key}` });
      }
      if (path === '/api/events' && request.method === 'POST') {
        const wallet = await user(request, env); const chain = await chainFactory(env);
        if (!await chain.admin(wallet)) throw new HttpError(403, 'Only the college admin may publish events');
        const input = eventDetails.parse(await body(request)); const event = await chain.event(input.id);
        const metadataKey = input.uri.startsWith(`${url.origin}/media/metadata/`) ? input.uri.split('/media/')[1] : '';
        if (!event.cap || event.uri !== input.uri || !/^metadata\/[a-f0-9]{64}\.json$/.test(metadataKey)) throw new HttpError(409, 'Event does not match its on-chain metadata');
        const stored = await env.MEDIA.get(metadataKey);
        if (!stored) throw new HttpError(409, 'Metadata is missing');
        const metadata = await stored.json();
        if (metadata.name !== input.title || metadata.description !== input.description || metadata.image !== input.image) throw new HttpError(409, 'Artwork differs from the frozen collectible');
        const published = await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(input.id).first();
        if (published) {
          if (published.uri !== input.uri || published.title !== input.title || published.description !== input.description || published.club !== input.club || published.category !== input.category || published.venue !== input.venue || published.rsvp_deadline !== input.rsvpDeadline || published.claim_mode !== input.claimMode || published.campus !== input.campus || published.eligibility !== input.eligibility || published.roles !== JSON.stringify(input.roles)) throw new HttpError(409, 'This event is already published with different details');
          return json({ id: input.id });
        }
        if (input.rsvpDeadline > Number(event.endsAt) || input.rsvpDeadline <= 0) throw new HttpError(400, 'Invalid RSVP deadline');
        const eventStart = input.eventStartsAt ?? Number(event.startsAt);
        const eventEnd = input.eventEndsAt ?? Number(event.endsAt);
        if (eventStart >= eventEnd || eventStart > Number(event.startsAt) || eventEnd > Number(event.endsAt) || (input.eventStartsAt && input.rsvpDeadline > eventStart)) throw new HttpError(400, 'Invalid event and minting schedule');
        const organizer = await chain.contract.eventAdmin(input.id);
        await env.DB.prepare(`INSERT INTO events(id,title,description,club,category,venue,image,uri,starts_at,ends_at,rsvp_deadline,cap,organizer,created_at,event_starts_at,event_ends_at,claim_mode,campus,eligibility,roles) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(input.id, input.title,
          input.description, input.club, input.category, input.venue, input.image, input.uri, Number(event.startsAt),
          Number(event.endsAt), input.rsvpDeadline, event.cap === 18446744073709551615n ? 0 : Number(event.cap), organizer, now(), eventStart, eventEnd, input.claimMode, input.campus, input.eligibility, JSON.stringify(input.roles)).run();
        return json({ id: input.id }, 201);
      }
      const claim = path.match(/^\/api\/events\/(\d+)\/claim$/);
      if (claim && request.method === 'POST') {
        const id = eventId.parse(claim[1]);
        const wallet = await user(request, env);
        z.object({ permanentConsent: z.literal(true) }).parse(await body(request));
        const listing = await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(id).first();
        if (listing?.claim_mode !== 'qr') throw new HttpError(403, 'This drop requires staff attendance verification');
        const chain = await chainFactory(env); const event = await chain.event(id);
        if (!event.cap || event.paused || now() < Number(event.startsAt) || now() > Number(event.endsAt)) throw new HttpError(409, 'Minting is closed or paused');
        const ticket = crypto.randomUUID();
        const hash = await studentHash(env.STUDENT_HASH_SECRET, 'qr-wallet:' + wallet.toLowerCase());
        await env.DB.batch([
          env.DB.prepare(`INSERT OR IGNORE INTO registrations(id,event_id,student_hash,wallet,consent_at,claimed_at)
            SELECT ?,?,?,?,?,? WHERE (?=0 OR (SELECT COUNT(*) FROM registrations WHERE event_id=?) < ?)`)
            .bind(ticket,id,hash,wallet,now(),now(),listing.cap,id,listing.cap),
          env.DB.prepare('UPDATE registrations SET claimed_at=COALESCE(claimed_at,?) WHERE event_id=? AND wallet=?').bind(now(),id,wallet),
          env.DB.prepare(`INSERT OR IGNORE INTO jobs(id,created_at) SELECT id,? FROM registrations WHERE event_id=? AND wallet=? AND claimed_at IS NOT NULL`).bind(now(),id,wallet)
        ]);
        const row = await env.DB.prepare(`SELECT r.id,r.wallet,j.status,j.tx_hash,j.token_id FROM registrations r JOIN jobs j ON j.id=r.id WHERE r.event_id=? AND r.wallet=?`).bind(id,wallet).first();
        if (!row) throw new HttpError(409, 'All claims for this drop are taken');
        await env.MINT.get(env.MINT.idFromName('sepolia-issuer')).fetch(new Request('https://mint.internal/wake',{method:'POST'}));
        return json({ticket:row.id,wallet:row.wallet,status:row.status,txHash:row.tx_hash,tokenId:row.token_id},202);
      }
      const rsvp = path.match(/^\/api\/events\/(\d+)\/rsvp$/);
      if (rsvp && request.method === 'POST') {
        const id = eventId.parse(rsvp[1]);
        const input = z.object({ studentId: z.string().trim().min(2).max(100), wallet: address,
          permanentConsent: z.literal(true), role: z.string().max(40).default('Attendee') }).parse(await body(request));
        const event = await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(id).first();
        if (!event || event.rsvp_deadline < now()) throw new HttpError(409, 'Registration is closed');
        if (!JSON.parse(event.roles).includes(input.role)) throw new HttpError(400, 'Choose an available participation role');
        const hash = await studentHash(env.STUDENT_HASH_SECRET, input.studentId);
        const ticket = crypto.randomUUID();
        const inserted = await env.DB.prepare(`INSERT INTO registrations(id,event_id,student_hash,wallet,consent_at,participation_role)
          SELECT ?,?,?,?,?,? WHERE (? = 0 OR (SELECT COUNT(*) FROM registrations WHERE event_id=?) < ?) RETURNING id`)
          .bind(ticket, id, hash, input.wallet, now(), input.role, event.cap, id, event.cap).first();
        if (!inserted) throw new HttpError(409, 'This event is full');
        return json({ ticket, wallet: input.wallet, eventId: id }, 201);
      }
      const ticket = path.match(/^\/api\/tickets\/([a-f0-9-]{36})$/);
      if (ticket && request.method === 'GET') {
        const row = await env.DB.prepare(`SELECT r.id,r.event_id,r.wallet,r.participation_role,r.checked_in_at,r.claimed_at,j.status,j.tx_hash,j.token_id,j.error
          FROM registrations r LEFT JOIN jobs j ON j.id=r.id WHERE r.id=?`).bind(ticket[1]).first();
        if (!row) throw new HttpError(404, 'Ticket not found');
        return json(row);
      }
      const attendees = path.match(/^\/api\/events\/(\d+)\/attendees$/);
      if (attendees && request.method === 'GET') {
        const id = eventId.parse(attendees[1]); const wallet = await user(request, env); const chain = await chainFactory(env);
        if (!await chain.staff(id, wallet)) throw new HttpError(403, 'You are not staff for this event');
        const { results } = await env.DB.prepare(`SELECT r.id,r.wallet,r.participation_role,r.consent_at,r.checked_in_at,r.checked_in_by,j.status,j.tx_hash,j.error
          FROM registrations r LEFT JOIN jobs j ON j.id=r.id WHERE r.event_id=? ORDER BY r.consent_at DESC LIMIT 1000`).bind(id).all();
        return json(results);
      }
      const retry = path.match(/^\/api\/tickets\/([a-f0-9-]{36})\/retry$/);
      if (retry && request.method === 'POST') {
        const wallet = await user(request, env);
        const row = await env.DB.prepare('SELECT * FROM registrations WHERE id=?').bind(retry[1]).first();
        if (!row?.checked_in_at && !row?.claimed_at) throw new HttpError(409, 'Attendance must already be verified');
        const chain = await chainFactory(env);
        if (!await chain.staff(row.event_id, wallet)) throw new HttpError(403, 'You are not staff for this event');
        const result = await env.DB.prepare("UPDATE jobs SET status='pending',raw_tx=NULL,tx_hash=NULL,error=NULL,attempts=0 WHERE id=? AND status='failed' RETURNING id").bind(row.id).first();
        if (!result) throw new HttpError(409, 'Only failed mint jobs can be retried');
        await env.MINT.get(env.MINT.idFromName('sepolia-issuer')).fetch(new Request('https://mint.internal/wake', { method: 'POST' }));
        return json({ status: 'pending' }, 202);
      }
      const checkIn = path.match(/^\/api\/tickets\/([a-f0-9-]{36})\/check-in$/);
      if (checkIn && request.method === 'POST') {
        const wallet = await user(request, env);
        const input = z.object({ physicallyVerified: z.literal(true), studentId: z.string().trim().min(2).max(100) }).parse(await body(request));
        const row = await env.DB.prepare('SELECT * FROM registrations WHERE id=?').bind(checkIn[1]).first();
        if (!row) throw new HttpError(404, 'Registration not found');
        const chain = await chainFactory(env);
        if (!await chain.staff(row.event_id, wallet)) throw new HttpError(403, 'You are not staff for this event');
        if (await studentHash(env.STUDENT_HASH_SECRET, input.studentId) !== row.student_hash) throw new HttpError(409, 'College ID does not match this registration');
        const event = await chain.event(row.event_id);
        if (!event.cap || event.paused || now() < Number(event.startsAt) || now() > Number(event.endsAt)) throw new HttpError(409, 'Check-in is outside the event mint window');
        await env.DB.batch([
          env.DB.prepare('UPDATE registrations SET checked_in_at=COALESCE(checked_in_at,?),checked_in_by=COALESCE(checked_in_by,?) WHERE id=?').bind(now(), wallet, row.id),
          env.DB.prepare('INSERT OR IGNORE INTO jobs(id,created_at) VALUES(?,?)').bind(row.id, now())
        ]);
        const stub = env.MINT.get(env.MINT.idFromName('sepolia-issuer'));
        await stub.fetch(new Request('https://mint.internal/wake', { method: 'POST' }));
        const job = await env.DB.prepare('SELECT status,tx_hash,token_id,error FROM jobs WHERE id=?').bind(row.id).first();
        return json({ ...job, ticket: row.id }, 202);
      }
      const cancel = path.match(/^\/api\/tickets\/([a-f0-9-]{36})\/cancel$/);
      if (cancel && request.method === 'POST') {
        const wallet = await user(request, env);
        const result = await env.DB.prepare(`DELETE FROM registrations WHERE id=? AND wallet=?
          AND checked_in_at IS NULL AND claimed_at IS NULL AND NOT EXISTS (SELECT 1 FROM jobs WHERE jobs.id=registrations.id) RETURNING id`).bind(cancel[1], wallet).first();
        if (!result) throw new HttpError(409, 'Only your unverified RSVP can be cancelled; issued collectibles are permanent');
        return json({ cancelled: true });
      }
      if (path === '/api/wallet-collection' && request.method === 'GET') {
        const wallet = address.parse(url.searchParams.get('wallet'));
        const cursor = eventId.parse(url.searchParams.get('cursor') || '1');
        const chain = await chainFactory(env);
        const page = await chain.collectionPage(wallet, cursor);
        const items = await Promise.all(page.items.map(async token => {
          const listing = await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(token.id).first();
          const record = await env.DB.prepare(`SELECT r.checked_in_at,r.claimed_at,r.participation_role,j.tx_hash,j.updated_at
            FROM registrations r LEFT JOIN jobs j ON j.id=r.id WHERE r.event_id=? AND r.wallet=?`).bind(token.id, wallet).first();
          // Only read metadata from the bound bucket; arbitrary token URLs must never become server-side fetches.
          const key = token.uri.match(/\/media\/(metadata\/[a-f0-9]{64}\.json)$/)?.[1];
          let metadata = null;
          try {
            const object = key ? await env.MEDIA.get(key) : null;
            if (object) {
              const parsed = z.object({ name: z.string().max(100), description: z.string().max(1000), image: z.string().max(300) }).safeParse(await object.json());
              if (parsed.success) metadata = parsed.data;
            }
          } catch { /* Ownership remains useful when the metadata bucket is temporarily unavailable. */ }
          const matches = listing?.uri === token.uri;
          const recorded = matches ? record : null;
          const history = recorded ? (await env.DB.prepare(`SELECT t.hash,t.created_at FROM mint_transactions t
            JOIN registrations r ON r.id=t.job_id WHERE r.event_id=? AND r.wallet=? ORDER BY t.created_at`).bind(token.id, wallet).all()).results : [];
          return { ...(matches ? publicEvent(listing) : { id: token.id, startsAt: null, endsAt: null, club: 'Unlisted organization', category: 'Other', venue: 'Not listed' }),
            ...token, title: metadata?.name || (matches ? listing.title : `Kairo collectible #${token.tokenId}`),
            description: metadata?.description || (matches ? listing.description : ''), image: metadata?.image || (matches ? listing.image : ''),
            role: recorded?.checked_in_at ? recorded.participation_role : recorded?.claimed_at ? 'Collector' : 'Unrecorded',
            attendanceVerified: Boolean(recorded?.checked_in_at), issuedAt: recorded?.tx_hash ? recorded.updated_at : null,
            transactionHash: recorded?.tx_hash || null, history, ownershipVerified: true,
            metadataStatus: metadata ? 'Available · contract URI verified' : 'Unavailable · ownership verified' };
        }));
        const pending = await env.DB.prepare(`SELECT COUNT(*) AS count FROM jobs j JOIN registrations r ON r.id=j.id
          WHERE r.wallet=? AND j.status IN ('pending','submitted')`).bind(wallet).first();
        return json({ ...page, items, pending: pending.count, chainId: 11155111 });
      }
      if (path === '/api/collection' && request.method === 'GET') {
        const wallet = address.parse(url.searchParams.get('wallet'));
        const { results } = await env.DB.prepare(`SELECT e.*,j.token_id,j.tx_hash FROM registrations r
          JOIN jobs j ON j.id=r.id JOIN events e ON e.id=r.event_id WHERE r.wallet=? AND j.status='confirmed' ORDER BY e.starts_at DESC`).bind(wallet).all();
        return json(results.map(row => ({ ...publicEvent(row), tokenId: row.token_id, transactionHash: row.tx_hash })));
      }
      throw new HttpError(404, 'Not found');
    } catch (error) {
      if (error instanceof z.ZodError) return json({ error: error.issues[0]?.message || 'Invalid input' }, 400);
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if (error.message?.includes('Collectible already claimed by this wallet')) return json({ error: 'You have already claimed this POAP with this wallet' }, 409);
      if (error.message?.includes('UNIQUE constraint')) return json({ error: 'This student or wallet is already registered, or the event is already published' }, 409);
      return json({ error: 'Service unavailable. Please try again shortly' }, 503);
    }
  };
}

export default {
  async scheduled(controller, env) {
    // Recover a saved check-in if waking the coordinator failed after the D1 commit.
    const queued = await env.DB.prepare("SELECT id FROM jobs WHERE status IN ('pending','submitted') LIMIT 1").first();
    if (queued) await env.MINT.get(env.MINT.idFromName('sepolia-issuer')).fetch(new Request('https://mint.internal/wake', { method: 'POST' }));
    await env.DB.batch([
      env.DB.prepare('DELETE FROM challenges WHERE expires_at<?').bind(now()),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now()),
      env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(now())
    ]);
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      url.protocol = 'https:';
      return Response.redirect(url.href, 308);
    }
    const response = await createHandler()(request, env);
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'same-origin');
    headers.set('Permissions-Policy', 'camera=(self)');
    if (new URL(request.url).pathname.startsWith('/api/')) headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers });
  }
};
