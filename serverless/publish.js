const now=()=>Math.floor(Date.now()/1000);
export async function actionNext(db,chain) {
 const action=await db.prepare("SELECT * FROM chain_actions WHERE status IN ('pending','submitted') ORDER BY (raw_tx IS NOT NULL) DESC,created_at,id LIMIT 1").first();
 if(!action)return false;
 try {
  if(!action.raw_tx) {
   const payload=JSON.parse(action.payload);
   if(action.kind==='pause'&&!payload.paused) {
    const deleted=await db.prepare(`SELECT id FROM events WHERE deleted_at IS NOT NULL AND id IN (${payload.ids.map(()=>'?').join(',')}) LIMIT 1`).bind(...payload.ids).first();
    if(deleted){await db.prepare("UPDATE chain_actions SET status='failed',error='Deleted events cannot resume',updated_at=? WHERE id=?").bind(now(),action.id).run();return true;}
   }
   const signed=await chain.signAction(action);
   await db.batch([
    db.prepare("UPDATE chain_actions SET raw_tx=?,tx_hash=?,status='submitted',updated_at=? WHERE id=?").bind(signed.raw,signed.hash,now(),action.id),
    db.prepare('INSERT OR IGNORE INTO action_transactions VALUES(?,?,?,?)').bind(signed.hash,action.id,signed.raw,now())
   ]);action.raw_tx=signed.raw;action.tx_hash=signed.hash;
  }
  let receipt=await chain.receipt(action.tx_hash);
  if(!receipt) {
   const history=await db.prepare('SELECT hash FROM action_transactions WHERE action_id=? AND hash<>?').bind(action.id,action.tx_hash).all();
   for(const previous of history.results) {receipt=await chain.receipt(previous.hash);if(receipt){action.tx_hash=previous.hash;break;}}
  }
  if(!receipt) {
   if(action.updated_at&&now()-action.updated_at>=120&&chain.replace) {
    const replacement=await chain.replace(action.raw_tx);
    if(replacement) {
     await db.batch([
      db.prepare('UPDATE chain_actions SET raw_tx=?,tx_hash=?,updated_at=? WHERE id=?').bind(replacement.raw,replacement.hash,now(),action.id),
      db.prepare('INSERT OR IGNORE INTO action_transactions VALUES(?,?,?,?)').bind(replacement.hash,action.id,replacement.raw,now())
     ]);action.raw_tx=replacement.raw;action.tx_hash=replacement.hash;
    }
   }
   try {await chain.broadcast(action.raw_tx);}catch{/* A receipt is authoritative after uncertain broadcasts. */}
   receipt=await chain.receipt(action.tx_hash);
  }
  if(!receipt)return true;
  if(receipt.status!==1) {
   await db.prepare("UPDATE chain_actions SET status='failed',raw_tx=NULL,error='Transaction reverted',tx_hash=?,updated_at=? WHERE id=?").bind(action.tx_hash,now(),action.id).run();
   return true;
  }
  const payload=JSON.parse(action.payload),writes=[];
  if(action.kind==='publish') {
   const ids=chain.createdEvents(receipt);
   if(ids.length!==payload.roleArtwork.length)throw Error('Publication receipt does not match roles');
   for(let index=0;index<ids.length;index++) {
    const art=payload.roleArtwork[index];
    writes.push(db.prepare(`INSERT INTO events(id,title,description,club,category,venue,image,uri,starts_at,ends_at,cap,organizer,created_at,event_starts_at,event_ends_at,campus,roles,animation_url,group_id,approximate_attendees)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(ids[index],payload.title,payload.description,payload.club,payload.category,payload.venue,art.image,art.uri,payload.mintStartsAt,payload.mintEndsAt,art.cap,payload.organizer,now(),payload.eventStartsAt,payload.eventEndsAt,payload.campus,JSON.stringify([art.role]),art.animationUrl||null,action.id,payload.approximateAttendees));
   }
  }
  writes.push(db.prepare("UPDATE chain_actions SET status='live',error=NULL,tx_hash=?,updated_at=? WHERE id=?").bind(action.tx_hash,now(),action.id));
  await db.batch(writes);
 } catch {
  // Never discard an unresolved signed nonce, including after database outages.
  await db.prepare("UPDATE chain_actions SET attempts=attempts+1,status=CASE WHEN raw_tx IS NOT NULL THEN 'submitted' WHEN attempts>=9 THEN 'failed' ELSE 'pending' END,error=? WHERE id=? AND status IN ('pending','submitted')")
   .bind('Publication needs attention: check relayer balance, contract authority, fee ceiling and dates',action.id).run();
 }
 return true;
}
