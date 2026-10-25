ALTER TABLE events ADD COLUMN claim_mode TEXT NOT NULL DEFAULT 'attendance' CHECK(claim_mode IN ('attendance','qr'));
ALTER TABLE registrations ADD COLUMN claimed_at INTEGER;
