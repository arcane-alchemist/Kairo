-- Preserve NFT ownership, metadata, claims and transaction history when a listing is deleted.
ALTER TABLE events ADD COLUMN deleted_at INTEGER;
