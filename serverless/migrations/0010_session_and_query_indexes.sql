-- All subsequent sessions must come from the wallet-bound SIWE challenge.
DELETE FROM sessions;
DELETE FROM challenges;
CREATE INDEX actions_wallet ON chain_actions(wallet,kind,created_at);
CREATE INDEX events_organizer ON events(organizer COLLATE NOCASE,created_at);
CREATE INDEX links_retention ON links(created_at) WHERE email IS NOT NULL;
CREATE INDEX audit_time ON admin_audit(created_at,id);
