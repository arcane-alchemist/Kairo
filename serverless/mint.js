import {connectChain} from './chain.js';
import {actionNext} from './publish.js';
const now=()=>Math.floor(Date.now()/1000);
export async function settleLinks(db) {
 await db.batch([
  db.prepare("UPDATE links SET state='minted' WHERE state='claiming' AND claim_id IN (SELECT id FROM jobs WHERE status='confirmed')"),
  db.prepare("UPDATE links SET state='issued' WHERE state='claiming' AND claim_id IN (SELECT id FROM jobs WHERE status='failed')")
 ]);
}
export async function mintNext(db,chain) {
 let job=await db.prepare(`SELECT j.*,c.event_id,c.wallet FROM jobs j JOIN claims c ON j.id=c.id
  WHERE j.status IN ('pending','submitted') ORDER BY (j.raw_tx IS NOT NULL) DESC,j.created_at,j.id LIMIT 1`).first();
 if(!job)return false;
 let batch=[job];
 try {
  if(!job.raw_tx) {
   const useBatch=chain.signMintBatch&&(!chain.batchCompatible||await chain.batchCompatible(job.event_id));
   const candidates=useBatch?(await db.prepare(`SELECT j.*,c.event_id,c.wallet FROM jobs j JOIN claims c ON c.id=j.id WHERE j.status='pending' AND j.raw_tx IS NULL ORDER BY j.created_at,j.id LIMIT 20`).all()).results:[job];
   batch=[];const reserved=new Map();
   for(const candidate of candidates) {
    if(useBatch&&chain.batchCompatible&&!await chain.batchCompatible(candidate.event_id))continue;
    const existing=await chain.token(candidate.event_id,candidate.wallet);
    if(existing!=='0') {
     await db.prepare("UPDATE jobs SET status='confirmed',token_id=?,updated_at=?,error=NULL WHERE id=?").bind(existing,now(),candidate.id).run();continue;
    }
    const listing=await db.prepare('SELECT listed,paused FROM events WHERE id=?').bind(candidate.event_id).first(),event=await chain.event(candidate.event_id);
    if(!listing?.listed||listing.paused||event.paused||now()<Number(event.startsAt)||now()>Number(event.endsAt)||Number(event.minted)+(reserved.get(candidate.event_id)||0)>=Number(event.cap)) {
     await db.prepare("UPDATE jobs SET status='failed',error='Minting closed, paused, or full',updated_at=? WHERE id=?").bind(now(),candidate.id).run();continue;
    }
    batch.push(candidate);reserved.set(candidate.event_id,(reserved.get(candidate.event_id)||0)+1);
   }
   if(!batch.length){await settleLinks(db);return true;}
   job=batch[0];
   let signed;
   try {signed=useBatch?await chain.signMintBatch(batch):await chain.signMint(job.event_id,job.wallet);}
   catch(error) {
    if(!useBatch||batch.length<2||error.code!=='CALL_EXCEPTION')throw error;
    // A recipient contract that rejects ERC721s must not fail everyone else's mint.
    batch=[job];signed=await chain.signMint(job.event_id,job.wallet);
   }
   const ids=batch.map(candidate=>candidate.id),slots=ids.map(()=>'?').join(',');
   // Recheck the whole batch atomically: deletion or pause during signing must not revive cancelled jobs.
   const saved=await db.batch([
    db.prepare(`UPDATE jobs SET raw_tx=?,tx_hash=?,status='submitted',updated_at=? WHERE id IN (${slots}) AND status='pending' AND raw_tx IS NULL
     AND (SELECT COUNT(*) FROM jobs j JOIN claims c ON c.id=j.id JOIN events e ON e.id=c.event_id WHERE j.id IN (${slots}) AND j.status='pending' AND j.raw_tx IS NULL AND e.listed=1 AND e.paused=0)=?`)
     .bind(signed.raw,signed.hash,now(),...ids,...ids,ids.length),
    ...batch.map(candidate=>db.prepare("INSERT OR IGNORE INTO mint_transactions SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM jobs WHERE id=? AND raw_tx=? AND status='submitted')").bind(signed.hash,candidate.id,signed.raw,now(),candidate.id,signed.raw))
   ]);
   if(saved[0].meta.changes!==batch.length){await settleLinks(db);return true;}
   job.raw_tx=signed.raw;job.tx_hash=signed.hash;
  } else batch=(await db.prepare(`SELECT j.*,c.event_id,c.wallet FROM jobs j JOIN claims c ON c.id=j.id WHERE j.raw_tx=? AND j.status='submitted'`).bind(job.raw_tx).all()).results;
  let receipt=await chain.receipt(job.tx_hash);
  if(!receipt) {
   const history=await db.prepare('SELECT hash FROM mint_transactions WHERE job_id=? AND hash<>?').bind(job.id,job.tx_hash).all();
   for(const previous of history.results){receipt=await chain.receipt(previous.hash);if(receipt){job.tx_hash=previous.hash;break;}}
  }
  if(!receipt) {
   if(chain.replace&&job.updated_at&&now()-job.updated_at>=120) {
    const replacement=await chain.replace(job.raw_tx);
    if(replacement) {
     await db.batch(batch.flatMap(candidate=>[
      db.prepare('UPDATE jobs SET raw_tx=?,tx_hash=?,updated_at=? WHERE id=?').bind(replacement.raw,replacement.hash,now(),candidate.id),
      db.prepare('INSERT OR IGNORE INTO mint_transactions VALUES(?,?,?,?)').bind(replacement.hash,candidate.id,replacement.raw,now())
     ]));job.raw_tx=replacement.raw;job.tx_hash=replacement.hash;
    }
   }
   try{await chain.broadcast(job.raw_tx);}catch{/* Receipt polling remains authoritative after uncertain broadcasts. */}
   receipt=await chain.receipt(job.tx_hash);
  }
  if(receipt) {
   const writes=[];
   for(const candidate of batch) {
    const token=receipt.status===1?await chain.token(candidate.event_id,candidate.wallet):null;
    if(receipt.status===1&&token==='0')throw Error('Token missing after confirmation');
    writes.push(db.prepare('UPDATE jobs SET status=?,token_id=?,error=?,tx_hash=?,updated_at=? WHERE id=?').bind(receipt.status===1?'confirmed':'failed',token,receipt.status===1?null:'Transaction reverted',job.tx_hash,now(),candidate.id));
   }
   await db.batch(writes);
  }
 }catch {
  // An unresolved signed nonce must never be reused for another transaction.
  if(batch.length)await db.batch(batch.map(candidate=>db.prepare(`UPDATE jobs SET attempts=attempts+1,
   status=CASE WHEN raw_tx IS NOT NULL THEN 'submitted' WHEN attempts>=9 THEN 'failed' ELSE 'pending' END,error=? WHERE id=? AND status IN ('pending','submitted')`)
   .bind('Mint needs attention: check relayer balance, issuer permission, fee ceiling and mint window',candidate.id)));

 }
 await settleLinks(db);return true;
}
export class MintCoordinator {
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async fetch(request) {
  if(new URL(request.url).pathname==='/health'){await this.ctx.storage.getAlarm();return Response.json({ok:true});}
  if(!await this.ctx.storage.getAlarm())await this.ctx.storage.setAlarm(Date.now()+1000);
  return Response.json({queued:true});
 }
 async alarm() {
  try {
   const db=this.env.DB,chain=await connectChain(this.env);
   const unresolved=await db.prepare("SELECT id FROM jobs WHERE status='submitted' LIMIT 1").first();
   if(unresolved)await mintNext(db,chain);
   else if(!await actionNext(db,chain))await mintNext(db,chain);
  }catch{console.warn('Mint coordinator waiting for RPC recovery');}
  finally {
   const queued=await this.env.DB.prepare("SELECT id FROM jobs WHERE status IN ('pending','submitted') UNION ALL SELECT id FROM chain_actions WHERE status IN ('pending','submitted') LIMIT 1").first();
   if(queued)await this.ctx.storage.setAlarm(Date.now()+30000);
  }
 }
}
