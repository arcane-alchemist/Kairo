-- Extend claim methods while preserving claims, jobs, links and transaction history.
CREATE TABLE claims_new (
 id TEXT PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id),
 wallet TEXT NOT NULL COLLATE NOCASE, method TEXT NOT NULL CHECK(method IN ('QR','LINK','LEGACY','ADMIN')),
 created_at INTEGER NOT NULL, attempt_id TEXT, UNIQUE(event_id,wallet)
);
INSERT INTO claims_new SELECT id,event_id,wallet,method,created_at,attempt_id FROM claims;
CREATE TABLE jobs_new (
 id TEXT PRIMARY KEY REFERENCES claims_new(id), status TEXT NOT NULL DEFAULT 'pending',
 raw_tx TEXT, tx_hash TEXT, token_id TEXT, attempts INTEGER NOT NULL DEFAULT 0,
 error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER
);
INSERT INTO jobs_new SELECT * FROM jobs;
CREATE TABLE transactions_new (hash TEXT NOT NULL,job_id TEXT NOT NULL REFERENCES jobs_new(id),raw_tx TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(hash,job_id));
INSERT INTO transactions_new SELECT * FROM mint_transactions;
CREATE TABLE links_new (
 id TEXT PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id), email TEXT,
 token_hash TEXT UNIQUE NOT NULL, state TEXT NOT NULL DEFAULT 'issued' CHECK(state IN ('issued','claiming','minted')),
 revoked_at INTEGER, claim_id TEXT REFERENCES claims_new(id), created_at INTEGER NOT NULL,
 UNIQUE(event_id,email)
);
INSERT INTO links_new SELECT * FROM links;
DROP TABLE mint_transactions;
DROP TABLE links;
DROP TABLE jobs;
DROP TABLE claims;
ALTER TABLE claims_new RENAME TO claims;
ALTER TABLE jobs_new RENAME TO jobs;
ALTER TABLE transactions_new RENAME TO mint_transactions;
ALTER TABLE links_new RENAME TO links;
CREATE INDEX jobs_status ON jobs(status,created_at);
CREATE INDEX links_claim ON links(claim_id);
CREATE INDEX links_retention ON links(created_at) WHERE email IS NOT NULL;
CREATE INDEX claims_wallet ON claims(wallet);
CREATE TABLE poap_requests (
 id TEXT PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id),
 wallet TEXT NOT NULL COLLATE NOCASE, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
 claim_id TEXT REFERENCES claims(id), created_at INTEGER NOT NULL, UNIQUE(event_id,wallet)
);
CREATE INDEX requests_event ON poap_requests(event_id,created_at,id);
