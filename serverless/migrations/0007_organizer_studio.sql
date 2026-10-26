ALTER TABLE events ADD COLUMN animation_url TEXT;
CREATE TABLE organizer_drafts (
  id TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','submitted','published')) DEFAULT 'draft',
  event_id INTEGER REFERENCES events(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX organizer_drafts_wallet ON organizer_drafts(wallet,updated_at);
CREATE INDEX organizer_drafts_status ON organizer_drafts(status,updated_at);
