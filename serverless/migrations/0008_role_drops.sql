ALTER TABLE events ADD COLUMN group_id TEXT;
CREATE UNIQUE INDEX events_group_role ON events(group_id, roles) WHERE group_id IS NOT NULL;
