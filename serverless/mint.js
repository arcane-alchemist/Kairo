import { connectChain } from './chain.js';

export async function mintNext(db, chain) {
  const job = await db.prepare(`SELECT j.*,r.event_id,r.wallet FROM jobs j JOIN registrations r ON j.id=r.id
    WHERE j.status IN ('pending','submitted') ORDER BY j.created_at,j.id LIMIT 1`).first();
  if (!job) return false;
  try {
    if (!job.raw_tx) {
      const existing = await chain.token(job.event_id, job.wallet);
      if (existing !== '0') {
        await db.prepare("UPDATE jobs SET status='confirmed',token_id=?,error=NULL WHERE id=?").bind(existing, job.id).run();
        return true;
      }
      const signed = await chain.signMint(job.event_id, job.wallet);
      await db.batch([
        db.prepare("UPDATE jobs SET raw_tx=?,tx_hash=?,status='submitted',updated_at=? WHERE id=?").bind(signed.raw, signed.hash, Math.floor(Date.now()/1000), job.id),
        db.prepare('INSERT OR IGNORE INTO mint_transactions VALUES(?,?,?,?)').bind(signed.hash, job.id, signed.raw, Math.floor(Date.now()/1000))
      ]);
      job.raw_tx = signed.raw; job.tx_hash = signed.hash;
    }
    let receipt = await chain.receipt(job.tx_hash);
    if (!receipt) {
      const { results } = await db.prepare('SELECT hash FROM mint_transactions WHERE job_id=? AND hash<>?').bind(job.id, job.tx_hash).all();
      for (const attempt of results) {
        receipt = await chain.receipt(attempt.hash);
        if (receipt) { job.tx_hash = attempt.hash; break; }
      }
    }
    if (!receipt) {
      if (chain.replace && job.updated_at && Math.floor(Date.now()/1000) - job.updated_at >= 120) {
        const replacement = await chain.replace(job.raw_tx);
        if (replacement) {
          await db.batch([
            db.prepare('UPDATE jobs SET raw_tx=?,tx_hash=?,updated_at=? WHERE id=?').bind(replacement.raw, replacement.hash, Math.floor(Date.now()/1000), job.id),
            db.prepare('INSERT OR IGNORE INTO mint_transactions VALUES(?,?,?,?)').bind(replacement.hash, job.id, replacement.raw, Math.floor(Date.now()/1000))
          ]);
          job.raw_tx = replacement.raw; job.tx_hash = replacement.hash;
        }
      }
      try { await chain.broadcast(job.raw_tx); } catch { /* Receipt polling remains authoritative after rebroadcast errors. */ }
      receipt = await chain.receipt(job.tx_hash);
    }
    if (receipt) {
      const token = receipt.status === 1 ? await chain.token(job.event_id, job.wallet) : null;
      if (receipt.status === 1 && token === '0') throw new Error('Token not found after confirmation');
      await db.prepare('UPDATE jobs SET status=?,token_id=?,error=?,tx_hash=? WHERE id=?')
        .bind(receipt.status === 1 ? 'confirmed' : 'failed', token, receipt.status === 1 ? null : 'Transaction reverted', job.tx_hash, job.id).run();
    }
  } catch {
    // An unresolved signed nonce must not be reused; unsigned failures can safely leave the queue.
    await db.prepare('UPDATE jobs SET attempts=attempts+1,status=?,error=? WHERE id=?')
      .bind(!job.raw_tx && job.attempts >= 9 ? 'failed' : job.raw_tx ? 'submitted' : 'pending',
        'Mint needs attention: check issuer permission, balance, fee ceiling and event window', job.id).run();
  }
  return true;
}

export class MintCoordinator {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async fetch(request) {
    if (new URL(request.url).pathname === '/health') { await this.ctx.storage.getAlarm(); return Response.json({ok:true}); }
    if (!await this.ctx.storage.getAlarm()) await this.ctx.storage.setAlarm(Date.now() + 1000);
    return Response.json({ queued: true });
  }
  async alarm() {
    // Only this alarm signs transactions for the dedicated issuer, across all serverless instances.
    try { await mintNext(this.env.DB, await connectChain(this.env)); }
    catch { console.warn('Mint coordinator waiting for RPC recovery'); }
    finally {
      const queued = await this.env.DB.prepare("SELECT id FROM jobs WHERE status IN ('pending','submitted') LIMIT 1").first();
      if (queued) await this.ctx.storage.setAlarm(Date.now() + 30000);
    }
  }
}
