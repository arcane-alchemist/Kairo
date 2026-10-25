ALTER TABLE events ADD COLUMN event_starts_at INTEGER;
ALTER TABLE events ADD COLUMN event_ends_at INTEGER;
UPDATE events SET event_starts_at=starts_at,event_ends_at=ends_at;
