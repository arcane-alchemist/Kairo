import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from './worker.js';
import {fixture} from './test-fixture.js';
import {qrToken,validQR,parseRecipients,csv} from './claims.js';
import {mintNext,settleLinks} from './mint.js';
import {actionNext} from './publish.js';
async function issue(f,cookie,email='person@example.org') {
 const response=await f.request('/events/1/links',{recipients:[{email,role:'Attendee'}]},cookie);assert.equal(response.status,201,await response.clone().text());
 return (await response.json()).links[0];
}
const tokenOf=link=>link.link.split('/').at(-1);

test('only configured SIWE wallet is admin even when the chain grants another wallet rights',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());
 for(const wallet of [f.admin,f.organizer,f.outsider]) {
  const cookie=await f.login(wallet),me=await(await f.request('/auth/me',undefined,cookie)).json();assert.equal(me.admin,wallet===f.admin);
  assert.equal((await f.request('/admin/events/1',{action:'verify'},cookie)).status,wallet===f.admin?200:403);
 }
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM admin_audit').get().n,1);
});
test('SIWE verifies the requested wallet, consumes challenges once, and requires a wallet',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());assert.equal((await f.request('/auth/challenge',{})).status,400);
 const challenge=await(await f.request('/auth/challenge',{wallet:f.participant.address})).json();assert.match(challenge.message,/Chain ID: 11155111/);
 assert.equal((await f.request('/auth/verify',{id:challenge.id,signature:await f.outsider.signMessage(challenge.message)})).status,401);
 const input={id:challenge.id,signature:await f.participant.signMessage(challenge.message)};
 assert.equal((await f.request('/auth/verify',input)).status,200);assert.equal((await f.request('/auth/verify',input)).status,401);
});
test('reject immediately unlists and blocks claims, queues and confirms on-chain pause, and audits reason',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const admin=await f.login(f.admin);
 assert.equal((await f.request('/admin/events/1',{action:'reject',reason:'Misleading listing'},admin)).status,202);
 assert.deepEqual(await(await f.request('/events')).json(),[]);
 const row=f.sqlite.prepare('SELECT * FROM events').get();assert.equal(row.paused,1);assert.equal(row.rejection_reason,'Misleading listing');
 let paused=false;f.chain.signAction=async action=>{assert.deepEqual(JSON.parse(action.payload),{ids:[1],paused:true});paused=true;return {raw:'pause',hash:'0xpause'};};f.chain.receipt=async()=>({status:1});
 await actionNext(f.DB,f.chain);assert(paused);assert.equal(f.sqlite.prepare('SELECT status FROM chain_actions').get().status,'live');
 assert.equal((await f.request('/admin/events/1',{action:'resume'},admin)).status,409);
 assert.match(f.sqlite.prepare('SELECT details FROM admin_audit').get().details,/Misleading listing/);
});
test('admin can edit only off-chain text; badge and mint fields are rejected',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const cookie=await f.login(f.admin),input={action:'edit',title:'New title',description:'New description',venue:'Online',category:'Workshop'};
 for(const frozen of [{uri:'changed'},{image:'changed'},{mintStartsAt:1},{mintEndsAt:2},{cap:100}])assert.equal((await f.request('/admin/events/1',{...input,...frozen},cookie)).status,400);
 assert.equal((await f.request('/admin/events/1',input,cookie)).status,200);assert.equal(f.sqlite.prepare('SELECT uri FROM events').get().uri,'ipfs://old');
});
test('direct publish freezes per-role metadata and creates a live event without review, resumes idempotently',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const cookie=await f.login(f.organizer),id=crypto.randomUUID();
 const media=await(await f.request('/artwork',{name:'Build together',description:'A day of community',role:'Attendee'},cookie)).json();
 const input={id,title:'Build together',description:'A day of community',club:'Code club',category:'Technology',venue:'Hall A',approximateAttendees:50,eventStartsAt:f.seconds,eventEndsAt:f.seconds+100,mintStartsAt:f.seconds,mintEndsAt:f.seconds+3600,roleArtwork:[{role:'Attendee',cap:50,...media}]};
 assert.equal((await f.request('/organizer/events',input,cookie)).status,202);
 assert.equal((await f.request('/organizer/events',input,cookie)).status,202);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chain_actions').get().n,1);
 await actionNext(f.DB,f.chain);const signed=f.sqlite.prepare('SELECT raw_tx FROM chain_actions').get().raw_tx;assert.equal(signed,'publish');
 f.chain.signAction=async()=>{throw Error('Must not sign twice');};f.chain.receipt=async()=>({status:1});await actionNext(f.DB,f.chain);
 const progress=await(await f.request(`/publications/${id}`,undefined,cookie)).json();assert.equal(progress.status,'live');assert.equal(progress.events[0].id,2);
 const event=(await(await f.request('/events')).json()).find(e=>e.id===2);assert.equal(event.title,input.title);assert.equal(event.organizer,f.organizer.address);
 assert.equal(f.sqlite.prepare("SELECT name FROM sqlite_master WHERE name='organizer_drafts'").get(),undefined);
});
test('RSVP, check-in, draft review, registration, and old ticket endpoints do not exist',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const cookie=await f.login(f.admin);
 for(const path of ['/events/1/rsvp','/organizer/review','/tickets/'+crypto.randomUUID(),'/registrations','/tickets/'+crypto.randomUUID()+'/check-in'])assert.equal((await f.request(path,{},cookie)).status,404,path);
 assert.equal(f.sqlite.prepare("SELECT name FROM sqlite_master WHERE name='registrations'").get(),undefined);
});
test('rotating QR accepts current and previous slot, rejects older, future, forged and another event',async()=>{
 const secret='s'.repeat(32),seconds=3000;
 for(const delta of [0,-30])assert(await validQR(secret,1,await qrToken(secret,1,seconds+delta),seconds));
 for(const delta of [-60,30])assert.equal(await validQR(secret,1,await qrToken(secret,1,seconds+delta),seconds),false);
 assert.equal(await validQR(secret,2,await qrToken(secret,1,seconds),seconds),false);
 assert.equal(await validQR(secret,1,await qrToken('x'.repeat(32),1,seconds),seconds),false);
});
test('QR mint is bound to the SIWE wallet and one per event role wallet',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const cookie=await f.login(f.participant),qr=await qrToken(f.env.QR_HMAC_SECRET,1),input={permanentConsent:true,qr};
 assert.equal((await f.request('/events/1/claim',input)).status,401);
 assert.equal((await f.request('/events/1/claim',{...input,wallet:f.outsider.address},cookie)).status,400);
 assert.equal((await f.request('/events/1/claim',input,cookie)).status,202);
 assert.equal((await f.request('/events/1/claim',input,cookie)).status,409);
 assert.equal(f.sqlite.prepare('SELECT wallet,method FROM claims').get().wallet,f.participant.address);assert.equal(f.sqlite.prepare('SELECT method FROM claims').get().method,'QR');
});
test('concurrent single-use link claims have exactly one winner, tokens only stored as hashes',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const owner=await f.login(f.organizer),link=await issue(f,owner),token=tokenOf(link),a=await f.login(f.participant),b=await f.login(f.outsider);
 assert(!JSON.stringify(f.sqlite.prepare('SELECT * FROM links').all()).includes(token));
 const responses=await Promise.all([f.request('/redeem/claim',{token,permanentConsent:true},a),f.request('/redeem/claim',{token,permanentConsent:true},b)]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[202,409]);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM claims').get().n,1);assert.equal(f.sqlite.prepare('SELECT state FROM links').get().state,'claiming');
});
test('expired windows, revoked links, paused events, and exhausted caps reject claims',async t=>{
 for(const scenario of ['expired','revoked','paused','cap']) {
  const f=fixture();t.after(()=>f.sqlite.close());const owner=await f.login(f.organizer),link=await issue(f,owner),cookie=await f.login(f.participant);
  if(scenario==='expired')f.chain.event=async()=>({cap:2n,minted:0n,startsAt:1n,endsAt:2n});
  if(scenario==='revoked')await f.request(`/links/${link.id}/revoke`,{},owner);
  if(scenario==='paused')f.sqlite.exec('UPDATE events SET paused=1');
  if(scenario==='cap')f.chain.event=async()=>({cap:2n,minted:2n,startsAt:BigInt(f.seconds-1),endsAt:BigInt(f.seconds+100)});
  assert.equal((await f.request('/redeem/claim',{token:tokenOf(link),permanentConsent:true},cookie)).status,409,scenario);
 }
});
test('duplicate normalized emails merge per role; recipients and hashes never leak publicly',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const owner=await f.login(f.organizer),response=await f.request('/events/1/links',{csv:'email,role\nPerson@Example.org,Attendee\nperson@example.org,Attendee'},owner),data=await response.json();
 assert.equal(data.links.length,1);assert.equal(data.merged,1);assert.equal(data.links[0].email,'person@example.org');
 const outsider=await f.login(f.outsider);assert.equal((await f.request('/events/1/links',undefined,outsider)).status,403);
 for(const response of [await f.request('/events'),await f.request('/redeem',{token:tokenOf(data.links[0])})])assert(!(await response.text()).includes('person@example.org'));
 const list=await(await f.request('/events/1/links',undefined,owner)).text();assert(!list.includes('token_hash'));
 await f.request('/events/1/delete-emails',{},owner);assert.equal(f.sqlite.prepare('SELECT email FROM links').get().email,null);
 assert.deepEqual(parseRecipients('"email","role"\r\n"a@example.org","Judge"'),[{email:'a@example.org',role:'Judge'}]);
 assert.match(csv([['=formula','"quoted"']]),/^"'=formula","""quoted"""$/);
});
test('permanent failure releases link; a later claim can retry and settle to minted',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const owner=await f.login(f.organizer),link=await issue(f,owner),cookie=await f.login(f.participant),path='/redeem/claim';
 const result=await(await f.request(path,{token:tokenOf(link),permanentConsent:true},cookie)).json();
 f.sqlite.prepare("UPDATE jobs SET status='failed' WHERE id=?").run(result.ticket);await settleLinks(f.DB);
 assert.equal(f.sqlite.prepare('SELECT state FROM links').get().state,'issued');
 assert.equal((await f.request(path,{token:tokenOf(link),permanentConsent:true},cookie)).status,202);
 f.chain.receipt=async()=>({status:1});f.chain.token=async()=> '12';await mintNext(f.DB,f.chain);
 assert.equal(f.sqlite.prepare('SELECT state FROM links').get().state,'minted');assert.equal(f.sqlite.prepare('SELECT token_id FROM jobs').get().token_id,'12');
});
test('email retention cleanup deletes addresses but preserves mint history',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const owner=await f.login(f.organizer);await issue(f,owner);
 f.sqlite.prepare('UPDATE links SET created_at=?').run(f.seconds-31*86400);await worker.scheduled({},f.env);
 assert.equal(f.sqlite.prepare('SELECT email FROM links').get().email,null);
});

test('500-recipient imports stay under D1 query and parameter limits',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const cookie=await f.login(f.organizer),prepare=f.DB.prepare;let statements=0;
 f.DB.prepare=sql=>{statements++;const query=prepare(sql),bind=query.bind;query.bind=(...values)=>{assert(values.length<=100,'D1 bound parameter limit');return bind(...values);};return query;};
 const recipients=Array.from({length:500},(_,i)=>({email:`person${i}@example.org`,role:'Attendee'}));
 const response=await f.request('/events/1/links',{recipients},cookie);assert.equal(response.status,201,await response.clone().text());assert.equal((await response.json()).links.length,500);assert(statements<50,'Free-tier per-request query limit');
});
test('the same email can get distinct roles, but a wallet cannot consume two links for one role',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const original=f.sqlite.prepare('SELECT * FROM events WHERE id=1').get(),second={...original,id:2,roles:'["Judge"]',group_id:'shared'};
 f.sqlite.prepare(`INSERT INTO events(${Object.keys(second).join(',')}) VALUES(${Object.keys(second).map(()=>'?').join(',')})`).run(...Object.values(second));f.sqlite.exec("UPDATE events SET group_id='shared' WHERE id=1");
 const cookie=await f.login(f.organizer),participant=await f.login(f.participant);
 const issued=await(await f.request('/events/1/links',{recipients:[{email:' person@example.org ',role:'Attendee'},{email:'person@example.org',role:'Judge'},{email:'second@example.org',role:'Attendee'}]},cookie)).json();assert.equal(issued.links.length,3);
 for(const role of ['Attendee','Judge']){const link=issued.links.find(link=>link.role===role);assert.equal((await f.request('/redeem/claim',{token:tokenOf(link),permanentConsent:true},participant)).status,202);}
 const duplicate=issued.links.find(link=>link.email==='second@example.org');assert.equal((await f.request('/redeem/claim',{token:tokenOf(duplicate),permanentConsent:true},participant)).status,409);
});
test('organizer retries a failed recipient mint atomically; revoked links cannot retry',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const owner=await f.login(f.organizer),link=await issue(f,owner),participant=await f.login(f.participant);
 const claim=await(await f.request('/redeem/claim',{token:tokenOf(link),permanentConsent:true},participant)).json();f.sqlite.exec("UPDATE jobs SET status='failed'");await settleLinks(f.DB);
 assert.equal((await f.request(`/claims/${claim.ticket}/retry`,{},owner)).status,202);assert.equal(f.sqlite.prepare('SELECT state FROM links').get().state,'claiming');
 f.sqlite.exec("UPDATE jobs SET status='failed'");await settleLinks(f.DB);await f.request(`/links/${link.id}/revoke`,{},owner);
 assert.equal((await f.request(`/claims/${claim.ticket}/retry`,{},owner)).status,409);
});
test('batch mints persist all members and recover the same signed nonce after a broadcast outage',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const qr=await qrToken(f.env.QR_HMAC_SECRET,1);
 for(const wallet of [f.participant,f.outsider])await f.request('/events/1/claim',{qr,permanentConsent:true},await f.login(wallet));
 let signs=0;f.chain.signMintBatch=async jobs=>{signs++;assert.equal(jobs.length,2);return {raw:'batch',hash:'0xbatch'};};f.chain.broadcast=async()=>{throw Error('Temporary RPC outage');};
 await mintNext(f.DB,f.chain);assert.equal(signs,1);assert(f.sqlite.prepare('SELECT * FROM jobs').all().every(job=>job.raw_tx==='batch'&&job.status==='submitted'));
 f.chain.receipt=async()=>({status:1});f.chain.token=async(id,wallet)=>wallet===f.participant.address?'11':'12';await mintNext(f.DB,f.chain);
 assert.equal(signs,1);assert(f.sqlite.prepare('SELECT * FROM jobs').all().every(job=>job.status==='confirmed'));
});
test('an acknowledged-late D1 commit cannot reset a persisted signed nonce to pending',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const qr=await qrToken(f.env.QR_HMAC_SECRET,1);await f.request('/events/1/claim',{qr,permanentConsent:true},await f.login(f.participant));
 const batch=f.DB.batch;let interrupted=false;
 f.DB.batch=async queries=>{const result=await batch(queries);if(!interrupted&&f.sqlite.prepare("SELECT id FROM jobs WHERE raw_tx IS NOT NULL").get()){interrupted=true;throw Error('Response lost after commit');}return result;};
 await mintNext(f.DB,f.chain);const job=f.sqlite.prepare('SELECT * FROM jobs').get();assert.equal(job.status,'submitted');assert.equal(job.raw_tx,'signed');
});
test('migration preserves existing issued jobs and transaction history while dropping registration data',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 try {
  const files=readdirSync('serverless/migrations').sort();for(const file of files.filter(file=>file<'0009'))db.exec(readFileSync(`serverless/migrations/${file}`,'utf8'));
  db.exec("INSERT INTO events(id,title,description,club,category,venue,image,uri,starts_at,ends_at,rsvp_deadline,cap,organizer,created_at) VALUES(1,'title','description','club','Technology','venue','image','uri',1,2,1,10,'wallet',1)");
  db.exec("INSERT INTO registrations(id,event_id,student_hash,wallet,consent_at,claimed_at) VALUES('claim',1,'private-id-hash','wallet',1,1)");
  db.exec("INSERT INTO jobs(id,status,raw_tx,tx_hash,token_id,created_at) VALUES('claim','confirmed','raw','hash','7',1)");db.exec("INSERT INTO mint_transactions VALUES('hash','claim','raw',1)");
  for(const file of files.filter(file=>file>='0009'))db.exec('BEGIN;'+readFileSync(`serverless/migrations/${file}`,'utf8')+'COMMIT;');
  assert.equal(db.prepare('SELECT token_id FROM jobs').get().token_id,'7');assert.equal(db.prepare('SELECT method FROM claims').get().method,'QR');assert.equal(db.prepare('SELECT hash FROM mint_transactions').get().hash,'hash');assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='registrations'").get(),undefined);
 }finally{db.close();}
});

test('rejecting an event moderates all its role drops in one on-chain action',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const original=f.sqlite.prepare('SELECT * FROM events WHERE id=1').get(),second={...original,id:2,roles:'["Judge"]',group_id:'shared'};
 f.sqlite.prepare(`INSERT INTO events(${Object.keys(second).join(',')}) VALUES(${Object.keys(second).map(()=>'?').join(',')})`).run(...Object.values(second));f.sqlite.exec("UPDATE events SET group_id='shared' WHERE id=1");
 const response=await f.request('/admin/events/1',{action:'reject',reason:'Rejected event'},await f.login(f.admin));assert.equal(response.status,202);
 assert(f.sqlite.prepare('SELECT * FROM events').all().every(event=>event.listed===0&&event.paused===1));
 const payload=JSON.parse(f.sqlite.prepare('SELECT payload FROM chain_actions').get().payload);assert.deepEqual(payload.ids,[1,2]);assert.equal(payload.paused,true);
});
test('the daily publish limit has one winner under concurrent publication requests',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());f.env.EVENTS_PER_WALLET_PER_DAY='1';const cookie=await f.login(f.organizer);
 const media=await(await f.request('/artwork',{name:'Community event',description:'A day of community',role:'Attendee'},cookie)).json();
 const input={title:'Community event',description:'A day of community',club:'Code club',category:'Technology',venue:'Hall A',approximateAttendees:20,eventStartsAt:f.seconds,eventEndsAt:f.seconds+100,mintStartsAt:f.seconds,mintEndsAt:f.seconds+3600,roleArtwork:[{role:'Attendee',cap:20,...media}]};
 const responses=await Promise.all([f.request('/organizer/events',{...input,id:crypto.randomUUID()},cookie),f.request('/organizer/events',{...input,id:crypto.randomUUID()},cookie)]);assert.deepEqual(responses.map(response=>response.status).sort(),[202,429]);
});

test('a lost completion acknowledgment cannot reopen a confirmed mint or duplicate a live publication',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const cookie=await f.login(f.organizer);
 const media=await(await f.request('/artwork',{name:'Community event',description:'A day of community',role:'Attendee'},cookie)).json();
 const input={id:crypto.randomUUID(),title:'Community event',description:'A day of community',club:'Code club',category:'Technology',venue:'Hall A',approximateAttendees:20,eventStartsAt:f.seconds,eventEndsAt:f.seconds+100,mintStartsAt:f.seconds,mintEndsAt:f.seconds+3600,roleArtwork:[{role:'Attendee',cap:20,...media}]};
 await f.request('/organizer/events',input,cookie);f.chain.receipt=async()=>({status:1});
 const batch=f.DB.batch;let lost=false;
 f.DB.batch=async queries=>{const result=await batch(queries);if(!lost&&f.sqlite.prepare("SELECT id FROM chain_actions WHERE status='live'").get()){lost=true;throw Error('Completion acknowledgment lost');}return result;};
 await actionNext(f.DB,f.chain);assert.equal(f.sqlite.prepare('SELECT status FROM chain_actions').get().status,'live');assert.equal(await actionNext(f.DB,f.chain),false);
 const qr=await qrToken(f.env.QR_HMAC_SECRET,1);await f.request('/events/1/claim',{qr,permanentConsent:true},await f.login(f.participant));
 let lostMint=false;
 f.DB.batch=async queries=>{const result=await batch(queries);if(!lostMint&&f.sqlite.prepare("SELECT id FROM jobs WHERE status='confirmed'").get()){lostMint=true;throw Error('Completion acknowledgment lost');}return result;};
 let signed=false;f.chain.token=async()=>signed?'17':'0';f.chain.signMint=async()=>{signed=true;return {raw:'signed',hash:'0xmint'};};
 await mintNext(f.DB,f.chain);assert.equal(f.sqlite.prepare('SELECT status FROM jobs').get().status,'confirmed');assert.equal(await mintNext(f.DB,f.chain),false);
});

test('local publishing uses real public storage URLs and validates their metadata before queueing',async t=>{
 const f=fixture('http://localhost:8787');t.after(()=>f.sqlite.close());f.env.MEDIA_BASE_URL='https://art.r2.dev/';const cookie=await f.login(f.organizer);
 const media=await(await f.request('/artwork',{name:'Community event',description:'A day of community',role:'Attendee'},cookie)).json();
 assert(media.uri.startsWith('https://art.r2.dev/metadata/'));assert(media.image.startsWith('https://art.r2.dev/art/'));
 t.mock.method(globalThis,'fetch',async uri=>Response.json(JSON.parse(f.objects.get(new URL(uri).pathname.slice(1)))));
 const input={id:crypto.randomUUID(),title:'Community event',description:'A day of community',club:'Code club',category:'Technology',venue:'Hall A',approximateAttendees:20,eventStartsAt:f.seconds,eventEndsAt:f.seconds+100,mintStartsAt:f.seconds,mintEndsAt:f.seconds+3600,roleArtwork:[{role:'Attendee',cap:20,...media}]};
 const response=await f.request('/organizer/events',input,cookie);assert.equal(response.status,202,await response.clone().text());
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chain_actions').get().n,1);
});

test('recipient and activity pagination do not advertise an empty next page',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const organizer=await f.login(f.organizer),admin=await f.login(f.admin);
 const insert=f.sqlite.prepare('INSERT INTO links(id,event_id,email,token_hash,created_at) VALUES(?,1,?,?,?)');
 for(let i=0;i<100;i++)insert.run(crypto.randomUUID(),`person${i}@example.org`,String(i).padStart(64,'0'),f.seconds);
 let page=await(await f.request('/events/1/links',undefined,organizer)).json();assert.equal(page.rows.length,100);assert.equal(page.hasMore,false);
 insert.run(crypto.randomUUID(),'last@example.org','f'.repeat(64),f.seconds);page=await(await f.request('/events/1/links',undefined,organizer)).json();assert.equal(page.hasMore,true);
 const last=await(await f.request('/events/1/links?page=1',undefined,organizer)).json();assert.equal(last.rows.length,1);assert.equal(last.hasMore,false);
 for(let i=0;i<50;i++)f.sqlite.prepare('INSERT INTO admin_audit VALUES(?,?,1,?,?,?)').run(crypto.randomUUID(),f.admin.address,'verify','{}',f.seconds);
 const audit=await(await f.request('/admin/audit',undefined,admin)).json();assert.equal(audit.rows.length,50);assert.equal(audit.hasMore,false);
});

test('all-event admin listing is protected while organizer lists remain wallet-scoped',async()=>{
 const f=fixture();
 assert.equal((await f.request('/admin/events',undefined,await f.login(f.organizer))).status,403);
 assert.equal((await f.request('/admin/events')).status,401);
 const own=await (await f.request('/organizer/events',undefined,await f.login(f.admin))).json();assert.equal(own.events.length,0);
 const all=await (await f.request('/admin/events',undefined,await f.login(f.admin))).json();assert.equal(all.events.length,1);
});

test('QR and link claims reserve only remaining on-chain supply when historical mints are not indexed',async t=>{
 for(const method of ['QR','LINK']) {
  const f=fixture();t.after(()=>f.sqlite.close());
  const original=f.chain.event;f.chain.event=async()=>({...await original(),minted:1n});
  const owner=await f.login(f.organizer),a=await f.login(f.participant),b=await f.login(f.outsider);
  const saved=new Map();
  const claim=async(cookie,email)=>method==='QR'?f.request('/events/1/claim',{qr:await qrToken(f.env.QR_HMAC_SECRET,1),permanentConsent:true},cookie):f.request('/redeem/claim',{token:saved.get(email)||await (async()=>{const token=tokenOf(await issue(f,owner,email));saved.set(email,token);return token;})(),permanentConsent:true},cookie);
  assert.equal((await claim(a,'first@example.org')).status,202);
  assert.equal((await claim(b,'second@example.org')).status,409);
  const stats=await(await f.request('/events/1/dashboard',undefined,owner)).json();
  assert.equal(stats.minted,1);assert.equal(stats.pending,1);assert.equal(stats.capRemaining,0);
  const first=f.sqlite.prepare('SELECT id FROM jobs').get().id;f.sqlite.prepare("UPDATE jobs SET status='failed' WHERE id=?").run(first);await settleLinks(f.DB);
  assert.equal((await claim(b,'second@example.org')).status,202);
  assert.equal((await f.request(`/claims/${first}/retry`,{},owner)).status,409);
 }
});

test('direct mint is superadmin-only, validates recipients and queues the supplied address exactly once',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const admin=await f.login(f.admin),input={wallet:f.participant.address};
 assert.equal((await f.request('/admin/events/1/mint',input)).status,401);
 for(const wallet of [f.organizer,f.participant])assert.equal((await f.request('/admin/events/1/mint',input,await f.login(wallet))).status,403);
 for(const wallet of ['bad','0x0000000000000000000000000000000000000000'])assert.equal((await f.request('/admin/events/1/mint',{wallet},admin)).status,400);
 const responses=await Promise.all([f.request('/admin/events/1/mint',input,admin),f.request('/admin/events/1/mint',{wallet:input.wallet.toLowerCase()},admin)]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[202,409]);
 const claim=f.sqlite.prepare('SELECT * FROM claims').get();assert.equal(claim.wallet,input.wallet);assert.equal(claim.method,'ADMIN');assert.notEqual(claim.wallet,f.admin.address);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM admin_audit').get().n,1);
 f.chain.signMint=async(id,wallet)=>{assert.equal(id,1);assert.equal(wallet,input.wallet);return {raw:'signed',hash:'0xmint'};};
 await mintNext(f.DB,f.chain);assert.equal(f.sqlite.prepare('SELECT status FROM jobs').get().status,'submitted');
});

test('POAP requests bind to the signed wallet, stay private and do not mint before admin acceptance',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const participant=await f.login(f.participant),admin=await f.login(f.admin),path='/events/1/requests';
 assert.equal((await f.request(path,{permanentConsent:true})).status,401);
 assert.equal((await f.request(path,{permanentConsent:false},participant)).status,400);
 assert.equal((await f.request(path,{permanentConsent:true,wallet:f.outsider.address},participant)).status,400);
 const row=await(await f.request(path,{permanentConsent:true},participant)).json();assert.equal(row.wallet,f.participant.address);assert.equal(row.status,'pending');
 assert.equal((await(await f.request(path,{permanentConsent:true},participant)).json()).id,row.id);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM jobs').get().n,0);
 for(const wallet of [f.organizer,f.outsider])assert.equal((await(await f.request(path,undefined,await f.login(wallet))).json()).rows.length,0);
 assert.equal((await(await f.request(path,undefined,admin)).json()).rows.length,1);
 const decision=`/admin/events/1/requests/${row.id}/accept`;
 assert.equal((await f.request(decision,{},participant)).status,403);
 assert.equal((await f.request(`/admin/events/2/requests/${row.id}/accept`,{},admin)).status,404);
 assert.equal((await f.request(decision,{},admin)).status,202);
 assert.equal((await f.request(decision,{},admin)).status,409);
 const saved=f.sqlite.prepare('SELECT * FROM poap_requests').get();assert.equal(saved.status,'accepted');
 assert.equal(saved.claim_id,f.sqlite.prepare('SELECT id FROM claims').get().id);
 assert.equal((await(await f.request(path,undefined,participant)).json()).rows[0].mint_status,'pending');
 f.sqlite.exec("UPDATE jobs SET status='failed'");
 assert.equal((await f.request(`/claims/${saved.claim_id}/retry`,{},await f.login(f.organizer))).status,403);
 assert.equal((await f.request(`/claims/${saved.claim_id}/retry`,{},admin)).status,202);
});

test('concurrent accept/reject decisions have one winner and rejected requests never create jobs',async t=>{
 for(const decisions of [['reject','reject'],['accept','reject']]) {
  const f=fixture();t.after(()=>f.sqlite.close());const admin=await f.login(f.admin);
  const row=await(await f.request('/events/1/requests',{permanentConsent:true},await f.login(f.participant))).json();
  const responses=await Promise.all(decisions.map(action=>f.request(`/admin/events/1/requests/${row.id}/${action}`,{},admin)));
  assert.equal(responses.filter(r=>r.status===409).length,1);
  const saved=f.sqlite.prepare('SELECT * FROM poap_requests').get(),jobs=f.sqlite.prepare('SELECT COUNT(*) AS n FROM jobs').get().n;
  assert.equal(jobs,saved.status==='accepted'?1:0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM admin_audit').get().n,1);
  if(saved.status==='rejected')assert.equal((await f.request(`/admin/events/1/requests/${row.id}/accept`,{},admin)).status,409);
 }
});

test('admin mint and request acceptance enforce windows, pauses, existing tokens and remaining supply',async t=>{
 for(const scenario of ['future','expired','paused','unlisted','cap','existing']) {
  const f=fixture();t.after(()=>f.sqlite.close());const admin=await f.login(f.admin);
  const row=await(await f.request('/events/1/requests',{permanentConsent:true},await f.login(f.participant))).json();
  const original=f.chain.event;
  if(scenario==='future')f.chain.event=async()=>({...await original(),startsAt:BigInt(f.seconds+100)});
  if(scenario==='expired')f.chain.event=async()=>({...await original(),endsAt:BigInt(f.seconds-1)});
  if(scenario==='cap')f.chain.event=async()=>({...await original(),minted:2n});
  if(scenario==='paused')f.sqlite.exec('UPDATE events SET paused=1');
  if(scenario==='unlisted')f.sqlite.exec('UPDATE events SET listed=0');
  if(scenario==='existing')f.chain.token=async()=> '17';
  for(const [path,input] of [[`/admin/events/1/requests/${row.id}/accept`,{}],['/admin/events/1/mint',{wallet:f.participant.address}]])assert.equal((await f.request(path,input,admin)).status,409,scenario);
  assert.equal(f.sqlite.prepare('SELECT status FROM poap_requests').get().status,'pending');assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM jobs').get().n,0);
 }
 const f=fixture();t.after(()=>f.sqlite.close());const admin=await f.login(f.admin),original=f.chain.event;f.chain.event=async()=>({...await original(),minted:1n});
 const row=await(await f.request('/events/1/requests',{permanentConsent:true},await f.login(f.participant))).json();
 const responses=await Promise.all([f.request(`/admin/events/1/requests/${row.id}/accept`,{},admin),f.request('/admin/events/1/mint',{wallet:f.outsider.address},admin)]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[202,409]);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM jobs').get().n,1);
});

test('POAP migration preserves linked claims, signed jobs and transaction history with valid foreign keys',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 try {
  for(const file of readdirSync('serverless/migrations').sort().filter(file=>file<'0011'))db.exec(readFileSync(`serverless/migrations/${file}`,'utf8'));
  db.exec("INSERT INTO events(id,title,description,club,category,venue,image,uri,starts_at,ends_at,cap,organizer,created_at) VALUES(1,'title','description','club','Technology','venue','image','uri',1,2,10,'wallet',1)");
  db.exec("INSERT INTO claims VALUES('claim',1,'wallet','LINK',1,'attempt'); INSERT INTO jobs(id,status,raw_tx,tx_hash,created_at) VALUES('claim','submitted','signed','hash',1)");
  db.exec("INSERT INTO links(id,event_id,token_hash,state,claim_id,created_at) VALUES('link',1,'secret-hash','claiming','claim',1); INSERT INTO mint_transactions VALUES('hash','claim','signed',1)");
  db.exec('BEGIN;'+readFileSync('serverless/migrations/0011_poap_requests.sql','utf8')+'COMMIT;');
  assert.equal(db.prepare('SELECT claim_id FROM links').get().claim_id,'claim');assert.equal(db.prepare('SELECT raw_tx FROM jobs').get().raw_tx,'signed');assert.equal(db.prepare('SELECT hash FROM mint_transactions').get().hash,'hash');assert.equal(db.prepare('SELECT attempt_id FROM claims').get().attempt_id,'attempt');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
});

test('request status is wallet-private across events and admin can filter to their own request',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const admin=await f.login(f.admin),participant=await f.login(f.participant);
 await f.request('/events/1/requests',{permanentConsent:true},participant);
 assert.equal((await f.request('/my/requests')).status,401);
 assert.equal((await(await f.request('/my/requests',undefined,participant)).json()).rows[0].role,'Attendee');
 assert.equal((await(await f.request('/my/requests',undefined,admin)).json()).rows.length,0);
 assert.equal((await(await f.request('/events/1/requests?mine=1',undefined,admin)).json()).rows.length,0);
 assert.equal((await(await f.request('/events/1/requests',undefined,admin)).json()).rows.length,1);
});

test('admin edits refresh dashboard listing for every role without changing frozen mint data',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const original=f.sqlite.prepare('SELECT * FROM events').get();
 const second={...original,id:2,roles:'["Speaker"]',group_id:'shared'};
 f.sqlite.prepare(`INSERT INTO events(${Object.keys(second).join(',')}) VALUES(${Object.keys(second).map(()=>'?').join(',')})`).run(...Object.values(second));f.sqlite.exec("UPDATE events SET group_id='shared' WHERE id=1");
 const admin=await f.login(f.admin),input={action:'edit',title:'Updated title',description:'Updated description',venue:'Hall B',category:'Workshop',club:'New club',campus:'North',eventStartsAt:f.seconds-100,eventEndsAt:f.seconds+100,approximateAttendees:30};
 assert.equal((await f.request('/admin/events/1',{...input,eventEndsAt:input.eventStartsAt},admin)).status,400);
 assert.equal((await f.request('/admin/events/1',input,admin)).status,200);
 for(const row of f.sqlite.prepare('SELECT * FROM events').all()){assert.equal(row.campus,'North');assert.equal(row.event_starts_at,input.eventStartsAt);assert.equal(row.starts_at,original.starts_at);assert.equal(row.uri,original.uri);assert.equal(row.cap,original.cap);}
 const dashboard=await(await f.request('/events/1/dashboard',undefined,admin)).json();assert.equal(dashboard.event.title,input.title);assert.equal(dashboard.event.approximateAttendees,30);assert.equal(dashboard.mintStartsAt,f.seconds-10);
});

test('all mint routes fail before queueing when the event issuer is not ready',async t=>{
 t.mock.method(console,'error',()=>{});
 const {ServiceError}=await import('./errors.js');const f=fixture();t.after(()=>f.sqlite.close());
 const admin=await f.login(f.admin),participant=await f.login(f.participant);
 const row=await(await f.request('/events/1/requests',{permanentConsent:true},participant)).json();
 f.chain.assertMintReady=async()=>{throw new ServiceError('ISSUER_NOT_AUTHORIZED','Issuer permission is missing.','contract',409);};
 for(const [path,data,cookie] of [['/admin/events/1/mint',{wallet:f.participant.address},admin],[`/admin/events/1/requests/${row.id}/accept`,{},admin],['/events/1/claim',{qr:await qrToken(f.env.QR_HMAC_SECRET,1),permanentConsent:true},participant]]) {
  const response=await f.request(path,data,cookie);assert.equal(response.status,409);assert.equal((await response.json()).code,'ISSUER_NOT_AUTHORIZED');
 }
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM jobs').get().n,0);assert.equal(f.sqlite.prepare('SELECT status FROM poap_requests').get().status,'pending');
});

test('batch simulation failure falls back to one mint instead of failing all recipients',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const admin=await f.login(f.admin);
 for(const wallet of [f.participant,f.outsider])assert.equal((await f.request('/admin/events/1/mint',{wallet:wallet.address},admin)).status,202);
 f.chain.signMintBatch=async()=>{throw Object.assign(Error('Receiver rejected token'),{code:'CALL_EXCEPTION'});};
 let single=0;f.chain.signMint=async()=>{single++;return {raw:'single',hash:'0xsingle'};};
 await mintNext(f.DB,f.chain);assert.equal(single,1);
 const jobs=f.sqlite.prepare('SELECT status,raw_tx FROM jobs').all();assert.equal(jobs.filter(job=>job.status==='submitted').length,1);assert.equal(jobs.filter(job=>job.status==='pending').length,1);
});

test('batch selection accounts for unindexed external mints before signing',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const admin=await f.login(f.admin);
 for(const wallet of [f.participant,f.outsider])await f.request('/admin/events/1/mint',{wallet:wallet.address},admin);
 const original=f.chain.event;f.chain.event=async()=>({...await original(),minted:1n});
 f.chain.signMintBatch=async jobs=>{assert.equal(jobs.length,1);return {raw:'one',hash:'0xone'};};
 await mintNext(f.DB,f.chain);const rows=f.sqlite.prepare('SELECT status FROM jobs').all();assert.equal(rows.filter(row=>row.status==='submitted').length,1);assert.equal(rows.filter(row=>row.status==='failed').length,1);
});

test('superadmin event cards count only pending requests and refresh after a review',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const admin=await f.login(f.admin),organizer=await f.login(f.organizer);
 const row=await(await f.request('/events/1/requests',{permanentConsent:true},await f.login(f.participant))).json();
 const list=async()=> (await(await f.request('/admin/events',undefined,admin)).json()).events[0];
 assert.equal((await list()).pendingRequests,1);
 const own=await(await f.request('/organizer/events',undefined,organizer)).json();assert.equal('pendingRequests' in own.events[0],false);
 await f.request(`/admin/events/1/requests/${row.id}/reject`,{},admin);assert.equal((await list()).pendingRequests,0);
});

test('a participant can read their confirmed request token ID without admin access',async t=>{
 const f=fixture();t.after(()=>f.sqlite.close());const participant=await f.login(f.participant),admin=await f.login(f.admin);
 const row=await(await f.request('/events/1/requests',{permanentConsent:true},participant)).json();
 await f.request(`/admin/events/1/requests/${row.id}/accept`,{},admin);
 f.sqlite.exec("UPDATE jobs SET status='confirmed',token_id='77'");
 const mine=await(await f.request('/my/requests',undefined,participant)).json();assert.equal(mine.rows[0].token_id,'77');assert.equal(mine.rows[0].mint_status,'confirmed');
 assert.equal((await(await f.request('/my/requests',undefined,await f.login(f.outsider))).json()).rows.length,0);
});
