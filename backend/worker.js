export async function processNext(store, chain) {
  const job = store.db.prepare(`SELECT jobs.*, registrations.event_id, registrations.wallet
    FROM jobs JOIN registrations ON registrations.id=jobs.registration_id
    WHERE status IN ('pending','submitted') ORDER BY jobs.id LIMIT 1`).get();
  if (!job) return;
  try {
    if (!job.raw_tx) {
      if (await chain.hasToken(job.event_id, job.wallet)) {
        store.db.prepare("UPDATE jobs SET status='confirmed',error=NULL WHERE id=?").run(job.id);
        return;
      }
      const signed = await chain.signMint(job.event_id, job.wallet);
      // Persist before broadcast so restart retries submit the identical transaction.
      store.db.prepare("UPDATE jobs SET raw_tx=?,tx_hash=?,status='submitted' WHERE id=?").run(signed.raw, signed.hash, job.id);
      job.raw_tx = signed.raw; job.tx_hash = signed.hash;
    }
    let receipt = await chain.receipt(job.tx_hash);
    if (!receipt) { await chain.broadcast(job.raw_tx); receipt = await chain.receipt(job.tx_hash); }
    if (receipt) store.db.prepare('UPDATE jobs SET status=?,error=? WHERE id=?')
      .run(receipt.status === 1 ? 'confirmed' : 'failed', receipt.status === 1 ? null : 'Transaction reverted', job.id);
  } catch {
    const attempts = job.attempts + 1;
    const status = !job.raw_tx && attempts >= 3 ? 'failed' : job.raw_tx ? 'submitted' : 'pending';
    store.db.prepare('UPDATE jobs SET status=?,attempts=?,error=? WHERE id=?').run(status, attempts,
      'Mint needs attention; check RPC, gas balance, event eligibility and issuer role', job.id);
  }
}
