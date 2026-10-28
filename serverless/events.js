import {z} from 'zod';
import {formatEther,Wallet,getAddress,ZeroAddress} from 'ethers';
import {mediaBaseURL,verifyPublicMetadata} from './media.js';
import {qrToken,validQR,randomToken,csv,parseRecipients} from './claims.js';
const now=()=>Math.floor(Date.now()/1000);
const json=(value,status=200)=>Response.json(value,{status});
const idSchema=z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export async function domainRoutes(request,env,chainFactory,helpers) {
 const {user,body,HttpError,digest,publicEvent,categories}=helpers;
 const url=new URL(request.url),path=url.pathname,post=request.method==='POST';
 let adminChain;
 const admin=async wallet=>{const chain=await (adminChain??=chainFactory(env));await chain.assertContract();return chain.admin(wallet);};
 const wake=()=>env.MINT.get(env.MINT.idFromName('sepolia-issuer')).fetch(new Request('https://mint.internal/wake',{method:'POST'}));
 async function owner(id,wallet) {
  const event=await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(id).first();
  if(!event)throw new HttpError(404,'Event not found');
  if(!await admin(wallet)&&event.organizer.toLowerCase()!==wallet.toLowerCase())throw new HttpError(403,'This event belongs to another organizer');
  return event;
 }
 async function eligibility(event,chain) {
  if(!event?.listed||event.paused)throw new HttpError(409,'Event is unlisted or paused');
  const onchain=await chain.event(event.id);
  if(!onchain.cap||onchain.paused||now()<Number(onchain.startsAt)||now()>Number(onchain.endsAt)||Number(onchain.minted)>=Number(onchain.cap))throw new HttpError(409,'Minting window closed, paused, or cap reached');
  await chain.assertMintReady(event.id);
  return onchain;
 }
 const audit=(wallet,id,action,details)=>env.DB.prepare('INSERT INTO admin_audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),wallet,id,action,JSON.stringify(details),now());
 if(['/api/organizer/events','/api/admin/events'].includes(path)&&request.method==='GET') {
  const wallet=await user(request,env),page=z.coerce.number().int().min(0).parse(url.searchParams.get('page')||0);
  const allEvents=path==='/api/admin/events';
  if(allEvents&&!await admin(wallet))throw new HttpError(403,'Super admin only');
  const {results}=await env.DB.prepare(allEvents?"SELECT e.*,(SELECT COUNT(*) FROM poap_requests r WHERE r.event_id=e.id AND r.status='pending') AS pending_requests FROM events e ORDER BY e.created_at DESC,e.id DESC LIMIT 201 OFFSET ?":'SELECT * FROM events WHERE organizer=? COLLATE NOCASE AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 201 OFFSET ?').bind(...(allEvents?[]:[wallet]),page*200).all();
  const actions=await env.DB.prepare("SELECT id,status,payload,tx_hash,error FROM chain_actions WHERE kind='publish' AND wallet=? COLLATE NOCASE ORDER BY created_at DESC LIMIT 100").bind(wallet).all();
  return json({events:results.slice(0,200).map(row=>allEvents?{...publicEvent(row),pendingRequests:row.pending_requests}:publicEvent(row)),hasMore:results.length>200,publications:actions.results.map(row=>({...row,details:JSON.parse(row.payload)}))});
 }
 if(path==='/api/organizer/events'&&post) {
  const wallet=await user(request,env);
  const art=z.object({role:z.string().trim().min(1).max(40),cap:z.number().int().min(1).max(10000),image:z.string().url().max(300),uri:z.string().url().max(300),animationUrl:z.string().url().max(300).optional()}).strict();
  const artworkBase=mediaBaseURL(env,url,{publishing:true});
  const input=z.object({id:z.string().uuid(),title:z.string().trim().min(3).max(100),description:z.string().trim().min(3).max(1000),
   club:z.string().trim().min(2).max(80),category:z.enum(categories),venue:z.string().trim().min(2).max(300),campus:z.string().trim().max(100).default(''),
   approximateAttendees:z.number().int().min(1).max(100000),eventStartsAt:z.number().int().positive(),eventEndsAt:z.number().int().positive(),
   mintStartsAt:z.number().int().positive(),mintEndsAt:z.number().int().positive(),roleArtwork:z.array(art).min(1).max(8)}).strict().parse(await body(request));
  const existing=await env.DB.prepare('SELECT wallet,status,payload FROM chain_actions WHERE id=?').bind(input.id).first();
  if(existing) {
   if(existing.wallet.toLowerCase()!==wallet.toLowerCase()||JSON.stringify({...input,organizer:wallet})!==existing.payload)throw new HttpError(409,'Publication already exists with different details');
   if(existing.status==='failed')await env.DB.prepare("UPDATE chain_actions SET status='pending',error=NULL,attempts=0 WHERE id=? AND raw_tx IS NULL").bind(input.id).run();
   await wake();return json({id:input.id,status:existing.status},202);
  }
  if(input.eventStartsAt>=input.eventEndsAt||input.mintStartsAt>=input.mintEndsAt||input.mintEndsAt<=now())throw new HttpError(400,'Check event dates and minting window');
  if(new Set(input.roleArtwork.map(art=>art.role.toLowerCase())).size!==input.roleArtwork.length)throw new HttpError(400,'Each role must be unique');
  for(const art of input.roleArtwork) {
   const key=art.uri.startsWith(`${artworkBase}metadata/`)?art.uri.slice(artworkBase.length):'';
   if(!/^metadata\/[a-f0-9]{64}\.json$/.test(key))throw new HttpError(400,'Upload or generate each badge first');
   const object=await env.MEDIA.get(key),metadata=object&&await object.json();
   if(!metadata||metadata.name!==input.title||metadata.description!==input.description||metadata.image!==art.image||metadata.animation_url!==art.animationUrl||!metadata.attributes?.some(t=>t.trait_type==='Role'&&t.value===art.role))throw new HttpError(409,'Badge differs from its frozen metadata');
   if(new URL(artworkBase).origin!==url.origin)await verifyPublicMetadata(art.uri,metadata,body);
  }
  const chain=await chainFactory(env);await chain.assertReady();
  // The conditional insert makes the daily limit atomic across requests.
  const result=await env.DB.prepare(`INSERT INTO chain_actions(id,wallet,kind,payload,created_at)
   SELECT ?,?,'publish',?,? WHERE (SELECT COUNT(*) FROM chain_actions WHERE wallet=? COLLATE NOCASE AND kind='publish' AND created_at>=?)<?`)
   .bind(input.id,wallet,JSON.stringify({...input,organizer:wallet}),now(),wallet,Math.floor(now()/86400)*86400,Number(env.EVENTS_PER_WALLET_PER_DAY||5)).run();
  if(!result.meta.changes)throw new HttpError(429,'Daily event limit reached');
  await wake();return json({id:input.id,status:'pending'},202);
 }
 const detail=path.match(/^\/api\/events\/(\d+)$/);
 if(detail&&request.method==='GET') {
  const event=await env.DB.prepare('SELECT * FROM events WHERE id=? AND listed=1').bind(idSchema.parse(detail[1])).first();
  if(!event)throw new HttpError(404,'Event unavailable');
  return json(publicEvent(event));
 }
 const publication=path.match(/^\/api\/publications\/([a-f0-9-]{36})$/);
 if(publication&&request.method==='GET') {
  const wallet=await user(request,env),row=await env.DB.prepare('SELECT * FROM chain_actions WHERE id=?').bind(publication[1]).first();
  if(!row||(!await admin(wallet)&&row.wallet.toLowerCase()!==wallet.toLowerCase()))throw new HttpError(404,'Publication not found');
  const events=await env.DB.prepare('SELECT id,roles FROM events WHERE group_id=? ORDER BY id').bind(row.id).all();
  return json({id:row.id,status:row.status,txHash:row.tx_hash,error:row.error,events:events.results});
 }
 if(path==='/api/admin/audit'&&request.method==='GET') {
  const wallet=await user(request,env);if(!await admin(wallet))throw new HttpError(403,'Super admin only');
  const page=z.coerce.number().int().min(0).parse(url.searchParams.get('page')||0);
  const {results}=await env.DB.prepare('SELECT * FROM admin_audit ORDER BY created_at DESC,id LIMIT 51 OFFSET ?').bind(page*50).all();
  return json({rows:results.slice(0,50),hasMore:results.length>50});
 }
 if(path==='/api/admin/system'&&request.method==='GET') {
  const wallet=await user(request,env);if(!await admin(wallet))throw new HttpError(403,'Super admin only');
  const chain=await chainFactory(env);
  const actions=await env.DB.prepare("SELECT id,status,tx_hash,error,payload,created_at FROM chain_actions WHERE kind='pause' ORDER BY created_at DESC LIMIT 50").all();
  let signerAddress=null;try{signerAddress=new Wallet(env.ISSUER_PRIVATE_KEY).address;}catch{}
  return json({actions:actions.results,contractAddress:env.CONTRACT_ADDRESS,superAdminAddress:env.SUPER_ADMIN_ADDRESS,panelAdmins:await chain.panelAdmins(),signerAddress,relayer:env.ISSUER_ADDRESS,balanceETH:formatEther(await chain.provider.getBalance(env.ISSUER_ADDRESS)),superAdminOnChain:await chain.admin(wallet)});
 }
 const moderate=path.match(/^\/api\/(admin|organizer)\/events\/(\d+)$/);
 if(moderate&&post) {
  const wallet=await user(request,env),namespace=moderate[1];
  if(namespace==='admin'&&!await admin(wallet))throw new HttpError(403,'Super admin only');
  const id=idSchema.parse(moderate[2]),listing=await owner(id,wallet);
  if(namespace==='organizer'&&listing.organizer.toLowerCase()!==wallet.toLowerCase())throw new HttpError(403,'Only the event creator can edit or delete this event');
  if(listing.deleted_at)throw new HttpError(409,'This event has been deleted');
  const input=z.discriminatedUnion('action',[
   z.object({action:z.literal('delete')}).strict(),
   z.object({action:z.literal('verify')}).strict(),
   z.object({action:z.literal('reject'),reason:z.string().trim().min(1).max(1000)}).strict(),
   z.object({action:z.enum(['pause','resume'])}).strict(),
   z.object({action:z.literal('edit'),title:z.string().trim().min(3).max(100),description:z.string().trim().min(3).max(1000),venue:z.string().trim().min(2).max(300),category:z.enum(categories),club:z.string().trim().min(2).max(80).optional(),campus:z.string().trim().max(100).optional(),eventStartsAt:z.number().int().positive().optional(),eventEndsAt:z.number().int().positive().optional(),approximateAttendees:z.number().int().min(1).max(100000).optional()}).strict()
  ]).parse(await body(request));
  if(namespace==='organizer'&&!['edit','delete'].includes(input.action))throw new HttpError(403,'Creators can edit or delete their own listings; mint moderation is superadmin-only');
  if(input.action==='delete'&&namespace!=='organizer')throw new HttpError(400,'Delete events through the creator endpoint');
  const event=await env.DB.prepare('SELECT group_id FROM events WHERE id=?').bind(id).first();
  const affected=await env.DB.prepare('SELECT id,listed FROM events WHERE id=? OR (group_id IS NOT NULL AND group_id=?)').bind(id,event.group_id).all();
  const ids=affected.results.map(row=>row.id),writes=[];
  const deletion=input.action==='delete',chainAction=['pause','resume','reject'].includes(input.action)||(deletion&&listing.ends_at>=now());
  if(deletion) {
   const timestamp=now();
   for(const target of ids)writes.push(
    env.DB.prepare('UPDATE events SET listed=0,paused=1,deleted_at=? WHERE id=?').bind(timestamp,target),
    env.DB.prepare("UPDATE jobs SET status='failed',error='Event deleted by its creator',updated_at=? WHERE id IN (SELECT id FROM claims WHERE event_id=?) AND status='pending' AND raw_tx IS NULL").bind(timestamp,target),
    env.DB.prepare("UPDATE links SET revoked_at=COALESCE(revoked_at,?) WHERE event_id=? AND state!='minted'").bind(timestamp,target),
    env.DB.prepare("UPDATE poap_requests SET status='rejected' WHERE event_id=? AND status='pending'").bind(target)
   );
   if(chainAction)writes.push(env.DB.prepare("INSERT INTO chain_actions(id,wallet,kind,payload,created_at) VALUES(?,?,'pause',?,?)").bind(crypto.randomUUID(),wallet,JSON.stringify({ids,paused:true}),timestamp));
  }
  else if(input.action==='edit') {
   const start=input.eventStartsAt??listing.event_starts_at??listing.starts_at,end=input.eventEndsAt??listing.event_ends_at??listing.ends_at;
   if(start>=end)throw new HttpError(400,'Event start must be before its end');
   for(const target of ids)writes.push(env.DB.prepare('UPDATE events SET title=?,description=?,venue=?,category=?,club=?,campus=?,event_starts_at=?,event_ends_at=?,approximate_attendees=? WHERE id=?').bind(input.title,input.description,input.venue,input.category,input.club??listing.club,input.campus??listing.campus,start,end,input.approximateAttendees??listing.approximate_attendees,target));
  }
  else if(input.action==='verify')for(const target of ids)writes.push(env.DB.prepare('UPDATE events SET verified=1 WHERE id=?').bind(target));
  else {
   const paused=input.action!=='resume';
   if(!paused&&affected.results.some(row=>!row.listed))throw new HttpError(409,'Rejected events cannot resume');
   for(const target of ids)writes.push(input.action==='reject'?env.DB.prepare('UPDATE events SET listed=0,paused=1,rejection_reason=? WHERE id=?').bind(input.reason,target):env.DB.prepare('UPDATE events SET paused=? WHERE id=?').bind(Number(paused),target));
   writes.push(env.DB.prepare("INSERT INTO chain_actions(id,wallet,kind,payload,created_at) VALUES(?,?,'pause',?,?)").bind(crypto.randomUUID(),wallet,JSON.stringify({ids,paused}),now()));
  }
  writes.push(audit(wallet,id,input.action,{...input,affectedIds:ids}));
  await env.DB.batch(writes);
  if(chainAction)await wake();
  return json(deletion?{status:'deleted',pauseStatus:chainAction?'pending':null}:{status:chainAction?'pending':'saved'},chainAction?202:200);
 }
 const qr=path.match(/^\/api\/events\/(\d+)\/qr$/);
 if(qr&&request.method==='GET') {
  const id=idSchema.parse(qr[1]),wallet=await user(request,env),event=await owner(id,wallet);
  if(JSON.parse(event.roles)[0].toLowerCase()!=='attendee')throw new HttpError(409,'Walk-in QR is for the Attendee role');
  await eligibility(event,await chainFactory(env));
  return json({token:await qrToken(env.QR_HMAC_SECRET,id),expiresAt:(Math.floor(now()/30)+2)*30});
 }
 const linkList=path.match(/^\/api\/events\/(\d+)\/links$/);
 if(linkList) {
  const id=idSchema.parse(linkList[1]),wallet=await user(request,env),event=await owner(id,wallet);
  if(request.method==='GET') {
   const page=z.coerce.number().int().min(0).parse(url.searchParams.get('page')||0);
   const {results}=await env.DB.prepare('SELECT id,email,state,revoked_at,created_at FROM links WHERE event_id=? ORDER BY created_at,id LIMIT 101 OFFSET ?').bind(id,page*100).all();
   return json({rows:results.slice(0,100),hasMore:results.length>100});
  }
  if(post) {
   if(event.deleted_at)throw new HttpError(409,'This event has been deleted');
   const input=z.object({recipients:z.array(z.object({email:z.string().trim().toLowerCase().pipe(z.email().max(254)),role:z.string().trim().min(1).max(40)})).max(500).optional(),csv:z.string().max(150000).optional()}).strict().parse(await body(request,160000));
   let rows=input.recipients;
   if(!rows) {try {rows=parseRecipients(input.csv||'');}catch(error){throw new HttpError(400,error.message);}}
   rows=z.array(z.object({email:z.string().trim().toLowerCase().pipe(z.email().max(254)),role:z.string().trim().min(1).max(40)})).min(1).max(500).parse(rows.map(row=>({...row,email:row.email.trim().toLowerCase()})));
   const roles=await env.DB.prepare('SELECT id,roles FROM events WHERE id=? OR (group_id IS NOT NULL AND group_id=?)').bind(id,event.group_id).all();
   const unique=new Map();for(const row of rows)unique.set(`${row.email}\n${row.role}`,row);
   const candidates=[];
   for(const row of unique.values()) {
    const target=roles.results.find(e=>JSON.parse(e.roles)[0]===row.role);
    if(!target)throw new HttpError(400,`Unknown role: ${row.role}`);
    const token=randomToken();candidates.push({...row,id:crypto.randomUUID(),eventId:target.id,hash:await digest(token),link:`${url.origin}/#redeem/${token}`});
   }
   // At most 100 bound parameters per statement and 25 writes per 500-row import.
   const writes=[];
   for(let offset=0;offset<candidates.length;offset+=20) {
    const chunk=candidates.slice(offset,offset+20);
    writes.push(env.DB.prepare(`INSERT OR IGNORE INTO links(id,event_id,email,token_hash,created_at) VALUES ${chunk.map(()=>'(?,?,?,?,?)').join(',')} RETURNING id`).bind(...chunk.flatMap(row=>[row.id,row.eventId,row.email,row.hash,now()])));
   }
   if(await admin(wallet))writes.push(audit(wallet,id,'issue-links',{requested:candidates.length}));
   const saved=await env.DB.batch(writes),inserted=new Set(saved.flatMap(result=>result.results||[]).map(row=>row.id));
   const result=candidates.filter(row=>inserted.has(row.id)).map(({hash,eventId,...row})=>row);
   return json({links:result,merged:rows.length-result.length},201);
  }
 }
 const linkAction=path.match(/^\/api\/links\/([a-f0-9-]{36})\/(revoke|regenerate|delete-email)$/);
 if(linkAction&&post) {
  const wallet=await user(request,env),link=await env.DB.prepare('SELECT * FROM links WHERE id=?').bind(linkAction[1]).first();
  if(!link)throw new HttpError(404,'Link not found');const event=await owner(link.event_id,wallet);
  if(event.deleted_at&&linkAction[2]==='regenerate')throw new HttpError(409,'This event has been deleted');
  if(linkAction[2]==='delete-email') {await env.DB.batch([env.DB.prepare('UPDATE links SET email=NULL WHERE id=?').bind(link.id),...((await admin(wallet))?[audit(wallet,link.event_id,'delete-email',{linkId:link.id})]:[])]);return json({deleted:true});}
  if(link.state!=='issued')throw new HttpError(409,'A claiming or minted link cannot be changed');
  const token=randomToken();
  const result=await env.DB.batch([env.DB.prepare(linkAction[2]==='revoke'?"UPDATE links SET revoked_at=? WHERE id=? AND state='issued'":"UPDATE links SET token_hash=?,revoked_at=NULL,claim_id=NULL WHERE id=? AND state='issued'").bind(linkAction[2]==='revoke'?now():await digest(token),link.id),...((await admin(wallet))?[audit(wallet,link.event_id,linkAction[2],{linkId:link.id})]:[])]);
  if(!result[0].meta.changes)throw new HttpError(409,'Link is already being claimed');
  return json(linkAction[2]==='regenerate'?{link:`${url.origin}/#redeem/${token}`}:{revoked:true});
 }
 const erase=path.match(/^\/api\/events\/(\d+)\/delete-emails$/);
 if(erase&&post) {const wallet=await user(request,env),id=idSchema.parse(erase[1]);await owner(id,wallet);await env.DB.batch([env.DB.prepare('UPDATE links SET email=NULL WHERE event_id=?').bind(id),...((await admin(wallet))?[audit(wallet,id,'delete-emails',{})]:[])]);return json({deleted:true});}
 const redemption=path==='/api/redeem/claim';
 if(path==='/api/redeem'&&post) {
  const input=z.object({token:z.string().regex(/^[a-f0-9]{32}$/)}).strict().parse(await body(request));
  const link=await env.DB.prepare('SELECT event_id,state,revoked_at FROM links WHERE token_hash=?').bind(await digest(input.token)).first();
  if(!link||link.revoked_at)throw new HttpError(404,'Link unavailable');
  const event=await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(link.event_id).first();
  if(!event?.listed)throw new HttpError(404,'Event unavailable');
  return json({event:publicEvent(event),state:link.state});
 }
 if(path==='/api/my/requests'&&request.method==='GET') {
  const wallet=await user(request,env),page=z.coerce.number().int().min(0).parse(url.searchParams.get('page')||0);
  const {results}=await env.DB.prepare(`SELECT r.*,e.title,e.roles,j.status AS mint_status,j.token_id,j.tx_hash,COALESCE(j.error,CASE WHEN e.deleted_at IS NOT NULL THEN 'Event listing deleted by its creator' END) AS error FROM poap_requests r JOIN events e ON e.id=r.event_id LEFT JOIN jobs j ON j.id=r.claim_id WHERE r.wallet=? COLLATE NOCASE ORDER BY r.created_at DESC,r.id LIMIT 51 OFFSET ?`).bind(wallet,page*50).all();
  return json({rows:results.slice(0,50).map(row=>({...row,role:JSON.parse(row.roles)[0],roles:undefined})),hasMore:results.length>50});
 }
 const requests=path.match(/^\/api\/events\/(\d+)\/requests$/);
 if(requests) {
  const wallet=await user(request,env),id=idSchema.parse(requests[1]);
  if(request.method==='GET') {
   const page=z.coerce.number().int().min(0).parse(url.searchParams.get('page')||0);
   const reviewing=await admin(wallet)&&url.searchParams.get('mine')!=='1';
   const {results}=await env.DB.prepare(`SELECT r.*,j.status AS mint_status,j.tx_hash,j.error FROM poap_requests r LEFT JOIN jobs j ON j.id=r.claim_id WHERE r.event_id=? ${reviewing?'':'AND r.wallet=? COLLATE NOCASE'} ORDER BY r.created_at DESC,r.id LIMIT 51 OFFSET ?`).bind(id,...(reviewing?[]:[wallet]),page*50).all();
   return json({rows:results.slice(0,50),hasMore:results.length>50});
  }
  if(post) {
   z.object({permanentConsent:z.literal(true)}).strict().parse(await body(request));
   const event=await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(id).first();
   if(!event?.listed||event.paused)throw new HttpError(409,'Event unavailable or paused');
   const chain=await chainFactory(env),onchain=await chain.event(id);
   if(!onchain.cap||onchain.paused||now()>Number(onchain.endsAt)||Number(onchain.minted)>=Number(onchain.cap))throw new HttpError(409,'Minting has ended, is paused, or supply is exhausted');
   if(await chain.token(id,wallet)!=='0'||await env.DB.prepare("SELECT c.id FROM claims c JOIN jobs j ON j.id=c.id WHERE event_id=? AND wallet=? COLLATE NOCASE AND j.status!='failed'").bind(id,wallet).first())throw new HttpError(409,'This wallet already claimed this role');
   await env.DB.prepare('INSERT OR IGNORE INTO poap_requests(id,event_id,wallet,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),id,wallet,now()).run();
   return json(await env.DB.prepare('SELECT * FROM poap_requests WHERE event_id=? AND wallet=? COLLATE NOCASE').bind(id,wallet).first(),201);
  }
 }
 const decision=path.match(/^\/api\/admin\/events\/(\d+)\/requests\/([a-f0-9-]{36})\/(accept|reject)$/);
 const direct=path.match(/^\/api\/admin\/events\/(\d+)\/mint$/);
 let poapRequest,actor;
 if((decision||direct)&&post) {
  actor=await user(request,env);if(!await admin(actor))throw new HttpError(403,'Super admin only');
  if(decision) {
   z.object({}).strict().parse(await body(request));
   poapRequest=await env.DB.prepare('SELECT * FROM poap_requests WHERE id=? AND event_id=?').bind(decision[2],idSchema.parse(decision[1])).first();
   if(!poapRequest)throw new HttpError(404,'POAP request not found');
   if(poapRequest.status!=='pending')throw new HttpError(409,'POAP request already reviewed');
   if(decision[3]==='reject') {
    const saved=await env.DB.batch([
     env.DB.prepare("UPDATE poap_requests SET status='rejected' WHERE id=? AND status='pending'").bind(poapRequest.id),
     env.DB.prepare("INSERT INTO admin_audit SELECT ?,?,?,'reject-request',?,? WHERE changes()>0").bind(crypto.randomUUID(),actor,poapRequest.event_id,JSON.stringify({requestId:poapRequest.id,wallet:poapRequest.wallet}),now())
    ]);
    if(!saved[0].meta.changes)throw new HttpError(409,'POAP request already reviewed');
    return json({status:'rejected'});
   }
  }
 }
 const claim=path.match(/^\/api\/events\/(\d+)\/claim$/);
 if((claim||redemption||direct||decision)&&post) {
  let wallet,input;
  if(actor) {
   input=direct?z.object({wallet:z.string().trim().refine(value=>{try{return getAddress(value)!==ZeroAddress;}catch{return false;}},'Enter a valid nonzero Ethereum address')}).strict().parse(await body(request)):{};
   wallet=poapRequest?.wallet||getAddress(input.wallet);
  } else {
   wallet=await user(request,env);input=z.object({permanentConsent:z.literal(true),qr:z.string().max(150).optional(),token:z.string().regex(/^[a-f0-9]{32}$/).optional()}).strict().parse(await body(request));
  }
  let link;
  if(redemption) {
   link=await env.DB.prepare('SELECT * FROM links WHERE token_hash=?').bind(await digest(input.token||'')).first();
   if(!link||link.revoked_at||link.state!=='issued')throw new HttpError(409,'Link revoked or already used');
  }
  const id=link?.event_id||idSchema.parse((direct||decision||claim)[1]),event=await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(id).first();
  const chain=await chainFactory(env),onchain=await eligibility(event,chain);
  if(!actor&&!link&&(JSON.parse(event.roles)[0].toLowerCase()!=='attendee'||!await validQR(env.QR_HMAC_SECRET,id,input.qr)))throw new HttpError(403,'Walk-in QR expired or invalid. Scan the live screen again');
  if(await chain.token(id,wallet)!=='0')throw new HttpError(409,'This wallet already minted this role');
  const previous=await env.DB.prepare('SELECT id FROM claims WHERE event_id=? AND wallet=? COLLATE NOCASE').bind(id,wallet).first();
  const ticket=previous?.id||crypto.randomUUID(),attempt=crypto.randomUUID(),timestamp=now();
  const insert=env.DB.prepare(`INSERT INTO claims(id,event_id,wallet,method,created_at,attempt_id)
   SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM claims c JOIN jobs j ON c.id=j.id WHERE c.event_id=? AND j.status IN ('pending','submitted'))<?
   AND EXISTS(SELECT 1 FROM events WHERE id=? AND listed=1 AND paused=0)
   ${poapRequest?"AND EXISTS(SELECT 1 FROM poap_requests WHERE id=? AND status='pending')":''}
   ${link?"AND EXISTS(SELECT 1 FROM links WHERE id=? AND state='issued' AND revoked_at IS NULL)":''}
   ON CONFLICT(event_id,wallet) DO UPDATE SET attempt_id=excluded.attempt_id,method=excluded.method WHERE EXISTS(SELECT 1 FROM jobs WHERE id=claims.id AND status='failed')`)
   .bind(ticket,id,wallet,actor?'ADMIN':link?'LINK':'QR',timestamp,attempt,id,Number(onchain.cap)-Number(onchain.minted),id,...(poapRequest?[poapRequest.id]:[]),...(link?[link.id]:[]));
  await env.DB.batch([insert,
   env.DB.prepare(`INSERT INTO jobs(id,created_at) SELECT id,? FROM claims WHERE id=? AND attempt_id=? ON CONFLICT(id) DO UPDATE SET status='pending',raw_tx=NULL,tx_hash=NULL,error=NULL,attempts=0 WHERE jobs.status='failed'`).bind(timestamp,ticket,attempt),
   ...(actor?[env.DB.prepare("INSERT INTO admin_audit SELECT ?,?,?,?, ?,? WHERE EXISTS(SELECT 1 FROM claims WHERE id=? AND attempt_id=?)").bind(crypto.randomUUID(),actor,id,poapRequest?'accept-request':'direct-mint',JSON.stringify({wallet,requestId:poapRequest?.id}),timestamp,ticket,attempt)]:[]),
   ...(actor?[env.DB.prepare("UPDATE poap_requests SET status='accepted',claim_id=? WHERE event_id=? AND wallet=? COLLATE NOCASE AND status='pending' AND EXISTS(SELECT 1 FROM claims WHERE id=? AND attempt_id=?)").bind(ticket,id,wallet,ticket,attempt)]:[]),
   ...(link?[env.DB.prepare("UPDATE links SET state='claiming',claim_id=? WHERE id=? AND state='issued' AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM claims WHERE id=? AND attempt_id=?)").bind(ticket,link.id,ticket,attempt)]:[])]);
  const accepted=await env.DB.prepare('SELECT id FROM claims WHERE id=? AND attempt_id=?').bind(ticket,attempt).first();
  if(!accepted)throw new HttpError(409,'Role already claimed, link used, or cap reached');
  await wake();return json({ticket,wallet,status:'pending'},202);
 }
 const ticket=path.match(/^\/api\/claims\/([a-f0-9-]{36})(\/retry)?$/);
 if(ticket) {
  const wallet=await user(request,env),row=await env.DB.prepare('SELECT c.*,j.status,j.tx_hash,j.token_id,j.error FROM claims c JOIN jobs j ON j.id=c.id WHERE c.id=?').bind(ticket[1]).first();
  if(!row)throw new HttpError(404,'Claim not found');
  if(ticket[2]&&post) {
   if(row.method==='ADMIN'&&!await admin(wallet))throw new HttpError(403,'Super admin only');
   const event=await owner(row.event_id,wallet),onchain=await eligibility(event,await chainFactory(env));
   const updated=await env.DB.batch([
    env.DB.prepare(`UPDATE jobs SET status='pending',raw_tx=NULL,tx_hash=NULL,error=NULL,attempts=0 WHERE id=? AND status='failed'
     AND EXISTS(SELECT 1 FROM events e WHERE e.id=? AND e.listed=1 AND e.paused=0 AND ?>(SELECT COUNT(*) FROM claims c JOIN jobs j ON j.id=c.id WHERE c.event_id=e.id AND j.status IN ('pending','submitted')))
     AND (? IN ('QR','LEGACY','ADMIN') OR EXISTS(SELECT 1 FROM links WHERE claim_id=? AND state='issued' AND revoked_at IS NULL))`).bind(row.id,row.event_id,Number(onchain.cap)-Number(onchain.minted),row.method,row.id),
    env.DB.prepare("UPDATE links SET state='claiming' WHERE claim_id=? AND state='issued' AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM jobs WHERE id=? AND status='pending')").bind(row.id,row.id),
    ...((await admin(wallet))?[audit(wallet,row.event_id,'retry-mint',{claimId:row.id})]:[])
   ]);
   if(!updated[0].meta.changes)throw new HttpError(409,'Claim cannot retry: check cap and whether its recipient link was regenerated or used');
   await wake();return json({status:'pending'},202);
  }
  if(row.wallet.toLowerCase()!==wallet.toLowerCase())await owner(row.event_id,wallet);
  return json(row);
 }
 const stats=path.match(/^\/api\/events\/(\d+)\/(dashboard|transactions|export)$/);
 if(stats&&request.method==='GET') {
  const wallet=await user(request,env),id=idSchema.parse(stats[1]),event=await owner(id,wallet);
  if(stats[2]==='dashboard') {
   const counts=await env.DB.prepare(`SELECT COUNT(*) AS claims,COALESCE(SUM(c.method='QR'),0) AS qrClaims,COALESCE(SUM(j.status='confirmed'),0) AS minted,
    COALESCE(SUM(j.status IN ('pending','submitted')),0) AS pending,COALESCE(SUM(j.status='failed'),0) AS failed FROM claims c JOIN jobs j ON j.id=c.id WHERE c.event_id=?`).bind(id).first();
   const links=await env.DB.prepare("SELECT COUNT(*) AS linksIssued,COALESCE(SUM(state IN ('claiming','minted')),0) AS linksUsed FROM links WHERE event_id=?").bind(id).first();
   const onchain=await (await chainFactory(env)).event(id),minted=Math.max(counts.minted,Number(onchain.minted));
   return json({...counts,...links,minted,event:publicEvent(event),mintStartsAt:Number(onchain.startsAt),mintEndsAt:Number(onchain.endsAt),paused:Boolean(onchain.paused),capRemaining:Math.max(0,Number(onchain.cap)-minted-counts.pending)});
  }
  const page=z.coerce.number().int().min(0).parse(url.searchParams.get('page')||0);
  const {results}=await env.DB.prepare(`SELECT c.id,c.wallet,c.method,c.created_at,j.token_id,j.status,j.tx_hash,j.error FROM claims c JOIN jobs j ON j.id=c.id WHERE c.event_id=? ORDER BY c.created_at DESC,c.id LIMIT ? OFFSET ?`).bind(id,stats[2]==='export'?10001:51,stats[2]==='export'?0:page*50).all();
  if(stats[2]==='export') {
   if(results.length>10000)throw new HttpError(409,'Export limit exceeded');
   return new Response(csv([['wallet','role','claim method','token id','status','time','transaction'],...results.map(r=>[r.wallet,JSON.parse(event.roles)[0],r.method,r.token_id,r.status,new Date(r.created_at*1000).toISOString(),r.tx_hash?`${env.EXPLORER_URL}/tx/${r.tx_hash}`:''])]),{headers:{'content-type':'text/csv','content-disposition':'attachment; filename="transactions.csv"'}});
  }
  return json({rows:results.slice(0,50),hasMore:results.length>50});
 }
 return null;
}
