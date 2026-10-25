CREATE TABLE events (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
  club TEXT NOT NULL, category TEXT NOT NULL, venue TEXT NOT NULL,
  image TEXT NOT NULL, uri TEXT NOT NULL, starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL, rsvp_deadline INTEGER NOT NULL, cap INTEGER NOT NULL,
  organizer TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE registrations (
  id TEXT PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id),
  student_hash TEXT NOT NULL, wallet TEXT NOT NULL, consent_at INTEGER NOT NULL,
  checked_in_at INTEGER, checked_in_by TEXT,
  UNIQUE(event_id, student_hash), UNIQUE(event_id, wallet)
);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY REFERENCES registrations(id), status TEXT NOT NULL DEFAULT 'pending',
  raw_tx TEXT, tx_hash TEXT, token_id TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX jobs_status ON jobs(status, created_at);
CREATE INDEX registrations_event ON registrations(event_id);
CREATE INDEX registrations_wallet ON registrations(wallet);
CREATE TABLE challenges (id TEXT PRIMARY KEY, message TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE sessions (hash TEXT PRIMARY KEY, wallet TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
