import { getAddress, verifyMessage, ZeroAddress } from 'ethers';
import { z } from 'zod';
import { checkConfig, health } from './health.js';
import { errorResponse } from './errors.js';
import { PAGE_HEADERS, SVG_POLICY } from './security.js';
import { generateBadge } from './artwork.js';
import { connectChain } from './chain.js';
import { MintCoordinator } from './mint.js';
import { domainRoutes } from './events.js';
import { mediaBaseURL, metadataKey, displayMediaURL } from './media.js';
export { MintCoordinator };

const eventId = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const address = z.string().transform((value, ctx) => {
  try { const result = getAddress(value); if (result === ZeroAddress) throw Error(); return result; }
  catch { ctx.addIssue({ code: 'custom', message: 'Enter a valid Ethereum wallet address' }); return z.NEVER; }
});
const categories = ['Technology','Arts','Community','Sports','Hackathon','Workshop','Fest','Seminar','Club','Competition','Other'];
const json = (data, status = 200) => Response.json(data, { status });
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const now = () => Math.floor(Date.now() / 1000);
export async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
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
  if (!cookie) throw new HttpError(401, 'Use Connect wallet in the header to sign in');
  const session = await env.DB.prepare('SELECT wallet FROM sessions WHERE hash=? AND expires_at>?').bind(await digest(cookie), now()).first();
  if (!session) throw new HttpError(401, 'Your session expired. Sign in again');
  return session.wallet;
}
async function limit(request, env, route) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const bucket = Math.floor(now() / 60);
  const key = await digest(`${env.QR_HMAC_SECRET}:${ip}:${route}:${bucket}`);
  const row = await env.DB.prepare(`INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count`).bind(key, now() + 120).first();
  if (row.count > 20) throw new HttpError(429, 'Too many requests. Please try again in a minute');
}
function eventRecord(row) {
  return { id: row.id, groupId: row.group_id || null, title: row.title, description: row.description, club: row.club, category: row.category,
    campus: row.campus || '', roles: JSON.parse(row.roles || '["Attendee"]'),
    venue: row.venue, image: row.image, uri: row.uri, animationUrl: row.animation_url || null, startsAt: row.event_starts_at ?? row.starts_at, endsAt: row.event_ends_at ?? row.ends_at,
    mintStartsAt: row.starts_at, mintEndsAt: row.ends_at, dropId: row.id,
    approximateAttendees:row.approximate_attendees, verified:Boolean(row.verified), paused:Boolean(row.paused), listed:Boolean(row.listed), cap:row.cap, organizer:row.organizer };
}

export function createHandler(chainFactory = connectChain) {
  return async function handle(request, env) {
    const url = new URL(request.url); const path = url.pathname;
    const publicEvent=row=>({...eventRecord(row),image:displayMediaURL(row.image,env,url),animationUrl:displayMediaURL(row.animation_url,env,url)||null});
    try {
      if (path === '/favicon.ico') return Response.redirect(new URL('/favicon.svg',url),302);
      if (path.startsWith('/media/')) {
        const key = path.slice(7);
        if (!/^(art|video|metadata)\/[a-f0-9]{64}\.(png|jpg|svg|mp4|webm|json)$/.test(key)) throw new HttpError(404, 'Not found');
        const object = await env.MEDIA.get(key);
        if (!object) throw new HttpError(404, 'Not found');
        return new Response(object.body, { headers: { 'content-type': object.httpMetadata.contentType,
          'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', ...(key.endsWith('.svg') ? {'content-security-policy':SVG_POLICY} : {}) } });
      }
      if (!path.startsWith('/api/')) return await env.ASSETS.fetch(request);
      if (request.method !== 'GET') {
        if (request.headers.get('origin') !== url.origin) throw new HttpError(403, 'Request origin is not allowed');
        if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, 'JSON required');
        await limit(request, env, path);
      }
      if (path === '/api/health' && request.method === 'GET') return await health(request,env,chainFactory);
      if (path === '/api/config' && request.method === 'GET') {
        checkConfig(env);
        const chainId = Number(env.CHAIN_ID);
        return json({chainId, chainName:env.CHAIN_NAME, contractAddress:env.CONTRACT_ADDRESS,
          superAdminAddress:env.SUPER_ADMIN_ADDRESS, issuerAddress:env.ISSUER_ADDRESS || null, publicRpcUrl:env.PUBLIC_RPC_URL, explorerUrl:env.EXPLORER_URL,
          mediaBaseUrl:mediaBaseURL(env,url),categories, emailRetentionDays:Number(env.EMAIL_RETENTION_DAYS || 30), eventsPerDay:Number(env.EVENTS_PER_WALLET_PER_DAY || 5),
          walletNetwork:{chainId:`0x${chainId.toString(16)}`,chainName:env.CHAIN_NAME,
            nativeCurrency:{name:'Sepolia Ether',symbol:'ETH',decimals:18},rpcUrls:[env.PUBLIC_RPC_URL],blockExplorerUrls:[env.EXPLORER_URL]}});
      }
      if (path === '/api/events' && request.method === 'GET') {
        const {results} = await env.DB.prepare("SELECT e.*,e.cap-COALESCE(SUM(j.status!='failed'),0) AS remaining FROM events e LEFT JOIN claims c ON c.event_id=e.id LEFT JOIN jobs j ON j.id=c.id WHERE e.listed=1 GROUP BY e.id ORDER BY e.starts_at DESC LIMIT 200").all();
        return json(results.map(row=>({...publicEvent(row),remaining:Math.max(0,row.remaining)})));
      }
      if (path === '/api/auth/challenge' && request.method === 'POST') {
        const id = crypto.randomUUID();
        const site = ['localhost','127.0.0.1','[::1]'].includes(url.hostname) ? url.origin : env.SITE_ORIGIN || url.origin;
        const input = z.object({ wallet: address }).parse(await body(request));
        const message = `${new URL(site).host} wants you to sign in with your Ethereum account:\n${input.wallet}\n\nSign in to Kairo. No gas payment or token approval.\n\nURI: ${site}\nVersion: 1\nChain ID: 11155111\nNonce: ${id.replaceAll('-', '')}\nIssued At: ${new Date().toISOString()}\nExpiration Time: ${new Date((now()+600)*1000).toISOString()}`;
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
          'set-cookie': `kairo_session=${token}; HttpOnly; SameSite=Strict; Path=/${url.protocol === 'https:' ? '; Secure' : ''}` } });
      }
      if (path === '/api/auth/me') {
        const wallet = await user(request, env);
        return json({ wallet, admin: Boolean(env.SUPER_ADMIN_ADDRESS && wallet.toLowerCase() === env.SUPER_ADMIN_ADDRESS.toLowerCase()) });
      }
      if (path === '/api/auth/logout' && request.method === 'POST') {
        const cookie = request.headers.get('cookie')?.match(/kairo_session=([a-f0-9]{64})/)?.[1];
        if (cookie) await env.DB.prepare('DELETE FROM sessions WHERE hash=?').bind(await digest(cookie)).run();
        return new Response('{}', { headers: { 'content-type': 'application/json', 'set-cookie': 'kairo_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' } });
      }
      if (path === '/api/artwork' && request.method === 'POST') {
        await user(request, env);
        const artworkBase=mediaBaseURL(env,url);
        const input = z.object({ name: z.string().trim().min(3).max(100), description: z.string().trim().min(3).max(1000),
          role:z.string().trim().min(1).max(40).optional(), image: z.string().max(2800000).optional(), video: z.string().max(14000000).optional() }).parse(await body(request, 17000000));
        let bytes, extension, contentType;
        if (!input.image) {
          const generated = await generateBadge(input.role ? `${input.name} · ${input.role}` : input.name, input.role ? `${input.description} Participation role: ${input.role}` : input.description);
          bytes = new TextEncoder().encode(generated.svg); extension = 'svg'; contentType = 'image/svg+xml';
        } else {
          const match = input.image.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
          if (!match) throw new HttpError(400, 'Upload a PNG or JPEG');
          try { bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0)); } catch { throw new HttpError(400, 'Invalid image encoding'); }
          if (bytes.length > 2 * 1024 * 1024 || bytes.length < 8 ||
            (match[1] === 'png' ? ![137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v) : !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255))) {
            throw new HttpError(400, 'Invalid image or image exceeds 2 MB');
          }
          extension = match[1] === 'png' ? 'png' : 'jpg'; contentType = `image/${match[1]}`;
        }
        const hash = await digest(input.image || new TextDecoder().decode(bytes));
        const imageKey=`art/${hash}.${extension}`;
        const image = `${artworkBase}${imageKey}`;
        await env.MEDIA.put(imageKey, bytes, { httpMetadata: { contentType,cacheControl:'public, max-age=31536000, immutable' } });
        let animationUrl;
        if (input.video) {
          const match = input.video.match(/^data:video\/(mp4|webm);base64,([A-Za-z0-9+/=]+)$/);
          if (!match) throw new HttpError(400, 'Upload an MP4 or WebM video');
          let videoBytes;
          try { videoBytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0)); } catch { throw new HttpError(400, 'Invalid video encoding'); }
          const valid = match[1] === 'mp4' ? [102,116,121,112].every((v,i) => videoBytes[i+4] === v) : [26,69,223,163].every((v,i) => videoBytes[i] === v);
          if (videoBytes.length < 16 || videoBytes.length > 10 * 1024 * 1024 || !valid) throw new HttpError(400, 'Invalid video or video exceeds 10 MB');
          const videoKey = `video/${await digest(input.video)}.${match[1]}`;
          await env.MEDIA.put(videoKey, videoBytes, { httpMetadata: {contentType: `video/${match[1]}`,cacheControl:'public, max-age=31536000, immutable'} });
          animationUrl = `${artworkBase}${videoKey}`;
        }
        const metadata = JSON.stringify({ name: input.name, description: input.description, image, ...(input.role ? {attributes:[{trait_type:'Role',value:input.role}]} : {}), ...(animationUrl ? {animation_url: animationUrl} : {}) });
        const key = `metadata/${await digest(metadata)}.json`;
        await env.MEDIA.put(key, metadata, { httpMetadata: { contentType: 'application/json',cacheControl:'public, max-age=31536000, immutable' } });
        return json({ image, uri: `${artworkBase}${key}`, ...(animationUrl ? {animationUrl} : {}) });
      }
      const response = await domainRoutes(request,env,chainFactory,{user,body,HttpError,digest,publicEvent,categories});
      if (response) return response;
      if (path === '/api/wallet-collection' && request.method === 'GET') {
        const wallet = address.parse(url.searchParams.get('wallet'));
        const cursor = eventId.parse(url.searchParams.get('cursor') || '1');
        const chain = await chainFactory(env);
        const page = await chain.collectionPage(wallet, cursor);
        const items = await Promise.all(page.items.map(async token => {
          const listing = await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(token.id).first();
          const record = await env.DB.prepare(`SELECT r.method,j.tx_hash,j.updated_at
            FROM claims r LEFT JOIN jobs j ON j.id=r.id WHERE r.event_id=? AND r.wallet=?`).bind(token.id, wallet).first();
          // Only read metadata from the bound bucket; arbitrary token URLs must never become server-side fetches.
          const key = metadataKey(token.uri,env,url);
          let metadata = null;
          try {
            const object = key ? await env.MEDIA.get(key) : null;
            if (object) {
              const parsed = z.object({ name: z.string().max(100), description: z.string().max(1000), image: z.string().max(300), animation_url: z.string().url().max(300).optional() }).safeParse(await object.json());
              if (parsed.success) metadata = parsed.data;
            }
          } catch { /* Ownership remains useful when the metadata bucket is temporarily unavailable. */ }
          const matches = listing?.uri === token.uri;
          const recorded = matches ? record : null;
          const history = recorded ? (await env.DB.prepare(`SELECT t.hash,t.created_at FROM mint_transactions t
            JOIN claims r ON r.id=t.job_id WHERE r.event_id=? AND r.wallet=? ORDER BY t.created_at`).bind(token.id, wallet).all()).results : [];
          return { ...(matches ? publicEvent(listing) : { id: token.id, startsAt: null, endsAt: null, club: 'Unlisted organization', category: 'Other', venue: 'Not listed' }),
            ...token, title: metadata?.name || (matches ? listing.title : `Kairo collectible #${token.tokenId}`),
            description: metadata?.description || (matches ? listing.description : ''), image: displayMediaURL(metadata?.image || (matches ? listing.image : ''),env,url),
            animationUrl: displayMediaURL(metadata?.animation_url,env,url) || null,
            role:matches ? JSON.parse(listing.roles)[0] : 'Unrecorded',
            claimMethod:recorded?.method || null,
            attendanceVerified:false, issuedAt:recorded?.tx_hash ? recorded.updated_at : null,
            transactionHash: recorded?.tx_hash || null, history, ownershipVerified: true,
            metadataStatus: metadata ? 'Available · contract URI verified' : 'Unavailable · ownership verified' };
        }));
        const pending = await env.DB.prepare(`SELECT COUNT(*) AS count FROM jobs j JOIN claims r ON r.id=j.id
          WHERE r.wallet=? AND j.status IN ('pending','submitted')`).bind(wallet).first();
        return json({ ...page, items, pending: pending.count, chainId: 11155111 });
      }
      if (path === '/api/collection' && request.method === 'GET') {
        const wallet = address.parse(url.searchParams.get('wallet'));
        const { results } = await env.DB.prepare(`SELECT e.*,j.token_id,j.tx_hash FROM claims r
          JOIN jobs j ON j.id=r.id JOIN events e ON e.id=r.event_id WHERE r.wallet=? AND j.status='confirmed' ORDER BY e.starts_at DESC`).bind(wallet).all();
        return json(results.map(row => ({ ...publicEvent(row), tokenId: row.token_id, transactionHash: row.tx_hash })));
      }
      throw new HttpError(404, 'Not found');
    } catch (error) {
      if (error instanceof z.ZodError) return json({error:error.issues[0]?.message || 'Invalid input',code:'INVALID_INPUT'},400);
      if (error instanceof HttpError) return json({error:error.message,code:({400:'INVALID_INPUT',401:'AUTH_REQUIRED',403:'FORBIDDEN',404:'NOT_FOUND',409:'CONFLICT',413:'INVALID_INPUT',415:'INVALID_INPUT',429:'RATE_LIMITED',503:'NOT_CONFIGURED'})[error.status] || 'REQUEST_FAILED'},error.status);
      if (error.message?.includes('UNIQUE constraint')) return json({error:'Record already exists. Refresh and retry',code:'CONFLICT'}, 409);
      return errorResponse(error, request, env);
    }
  };
}

export default {
  async scheduled(controller, env) {
    // Recover queued transactions after interrupted requests.
    const queued = await env.DB.prepare("SELECT id FROM jobs WHERE status IN ('pending','submitted') UNION ALL SELECT id FROM chain_actions WHERE status IN ('pending','submitted') LIMIT 1").first();
    if (queued) await env.MINT.get(env.MINT.idFromName('sepolia-issuer')).fetch(new Request('https://mint.internal/wake', { method: 'POST' }));
    await env.DB.batch([
      env.DB.prepare('UPDATE links SET email=NULL WHERE email IS NOT NULL AND created_at<?').bind(now()-Number(env.EMAIL_RETENTION_DAYS || 30)*86400),
      env.DB.prepare('DELETE FROM challenges WHERE expires_at<?').bind(now()),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now()),
      env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(now())
    ]);
  },
  async fetch(request, env) {
    try {
    const url = new URL(request.url);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      url.protocol = 'https:';
      return Response.redirect(url.href, 308);
    }
    const response = await createHandler()(request, env);
    const headers = new Headers(response.headers);
    for (const [name,value] of Object.entries(PAGE_HEADERS)) if (!headers.has(name)) headers.set(name,value);
    if (new URL(request.url).pathname.startsWith('/api/')) headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers });
    } catch (error) { return errorResponse(error,request,env); }
  }
};
