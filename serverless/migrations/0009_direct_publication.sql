-- Preserve issued/pending mint records; discard registration-only personal data.
CREATE TABLE claims (
 id TEXT PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id),
 wallet TEXT NOT NULL COLLATE NOCASE, method TEXT NOT NULL CHECK(method IN ('QR','LINK','LEGACY')),
 created_at INTEGER NOT NULL, UNIQUE(event_id,wallet)
);
INSERT INTO claims SELECT r.id,r.event_id,r.wallet,CASE WHEN r.claimed_at IS NOT NULL THEN 'QR' ELSE 'LEGACY' END,r.consent_at
 FROM registrations r JOIN jobs j ON j.id=r.id;
CREATE TABLE jobs_new (
 id TEXT PRIMARY KEY REFERENCES claims(id), status TEXT NOT NULL DEFAULT 'pending',
 raw_tx TEXT, tx_hash TEXT, token_id TEXT, attempts INTEGER NOT NULL DEFAULT 0,
 error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER
);
INSERT INTO jobs_new SELECT * FROM jobs;
CREATE TABLE transactions_new (hash TEXT NOT NULL,job_id TEXT NOT NULL REFERENCES jobs_new(id),raw_tx TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(hash,job_id));
INSERT INTO transactions_new SELECT * FROM mint_transactions;
DROP TABLE mint_transactions;
DROP TABLE jobs;
DROP TABLE registrations;
ALTER TABLE jobs_new RENAME TO jobs;
ALTER TABLE transactions_new RENAME TO mint_transactions;
CREATE INDEX jobs_status ON jobs(status,created_at);
CREATE INDEX claims_wallet ON claims(wallet);
DROP TABLE organizer_drafts;
ALTER TABLE events DROP COLUMN rsvp_deadline;
ALTER TABLE events DROP COLUMN eligibility;
ALTER TABLE events DROP COLUMN claim_mode;
ALTER TABLE events ADD COLUMN listed INTEGER NOT NULL DEFAULT 1;
ALTER TABLE events ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN paused INTEGER NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN rejection_reason TEXT;
ALTER TABLE events ADD COLUMN approximate_attendees INTEGER NOT NULL DEFAULT 0;
CREATE TABLE links (
 id TEXT PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id), email TEXT,
 token_hash TEXT UNIQUE NOT NULL, state TEXT NOT NULL DEFAULT 'issued' CHECK(state IN ('issued','claiming','minted')),
 revoked_at INTEGER, claim_id TEXT REFERENCES claims(id), created_at INTEGER NOT NULL,
 UNIQUE(event_id,email)
);
CREATE INDEX links_claim ON links(claim_id);
CREATE TABLE chain_actions (
 id TEXT PRIMARY KEY, wallet TEXT NOT NULL COLLATE NOCASE, kind TEXT NOT NULL CHECK(kind IN ('publish','pause')),
 payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', raw_tx TEXT, tx_hash TEXT,
 error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX actions_status ON chain_actions(status,created_at);
CREATE TABLE admin_audit (id TEXT PRIMARY KEY,wallet TEXT NOT NULL,event_id INTEGER,action TEXT NOT NULL,details TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE action_transactions (hash TEXT PRIMARY KEY,action_id TEXT NOT NULL REFERENCES chain_actions(id),raw_tx TEXT NOT NULL,created_at INTEGER NOT NULL);
ALTER TABLE claims ADD COLUMN attempt_id TEXT;
