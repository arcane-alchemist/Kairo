-- QR drops with identical immutable metadata represent the same collectible.
CREATE TRIGGER one_wallet_per_qr_collectible
BEFORE INSERT ON registrations
WHEN EXISTS (
  SELECT 1 FROM registrations r
  JOIN events previous ON previous.id=r.event_id
  JOIN events current ON current.id=NEW.event_id
  WHERE r.wallet=NEW.wallet COLLATE NOCASE
    AND r.event_id<>NEW.event_id
    AND previous.uri=current.uri
    AND previous.claim_mode='qr' AND current.claim_mode='qr'
)
BEGIN
  SELECT RAISE(ABORT, 'Collectible already claimed by this wallet');
END;
