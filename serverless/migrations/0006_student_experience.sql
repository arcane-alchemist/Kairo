ALTER TABLE events ADD COLUMN campus TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN eligibility TEXT NOT NULL DEFAULT 'Open to campus participants with a college ID';
ALTER TABLE events ADD COLUMN roles TEXT NOT NULL DEFAULT '["Attendee"]';
ALTER TABLE registrations ADD COLUMN participation_role TEXT NOT NULL DEFAULT 'Attendee';
