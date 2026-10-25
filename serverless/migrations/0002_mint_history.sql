CREATE TABLE mint_transactions (
  hash TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id),
  raw_tx TEXT NOT NULL, created_at INTEGER NOT NULL
);
INSERT INTO mint_transactions(hash,job_id,raw_tx,created_at)
  SELECT tx_hash,id,raw_tx,created_at FROM jobs WHERE tx_hash IS NOT NULL AND raw_tx IS NOT NULL;
ALTER TABLE jobs ADD COLUMN updated_at INTEGER;
