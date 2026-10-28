-- Preserve existing approved links and claims; new publications explicitly await review.
ALTER TABLE events ADD COLUMN approval TEXT NOT NULL DEFAULT 'approved' CHECK(approval IN ('pending','approved','rejected'));
