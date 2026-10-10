# Kairo

College-event attendance collectibles: permanently soulbound, non-burnable ERC-721 tokens with ERC-5192 recognition. Sepolia prototype; not official academic credentials.

## Setup and checks

Requires Node 24+, npm, and Foundry (`forge`, `anvil`).

```sh
npm ci
npm test
forge fmt --check
cp .env.example .env
```

Never commit `.env` or paste private keys into chat. Use dedicated testnet wallets. The admin creates events and manages issuers; the backend uses a separate issuer wallet with test ETH. No attendee gas payment is required.

## Sepolia deployment

Set `SEPOLIA_RPC_URL` and `DEPLOYER_PRIVATE_KEY` in `.env`. Optionally set `ADMIN_ADDRESS` to a separate admin. Then:

```sh
npm run deploy:sepolia
```

The script checks chain ID 11155111, builds and deploys the single Kairo contract, broadcasts and records the address/transaction in `deployments/sepolia.json`. Set `CONTRACT_ADDRESS` to the recorded `address`. Deployment does not automatically verify source on Etherscan. Use Foundry verification with constructor arguments matching the deployment record before a public pilot.

Create an event using the admin wallet in `DEPLOYER_PRIVATE_KEY`:

```sh
node --env-file=.env scripts/create-event.js ipfs://YOUR_METADATA_CID 100 START_UNIX END_UNIX ORGANIZER_ADDRESS ISSUER_ADDRESS
```

Metadata should contain `name`, `description`, and an `image` URI. Pin the artwork and metadata yourself; the contract freezes the URI immediately, but HTTP content could still change. Never put student identifiers in metadata. Set the mint end time late enough for queued transactions to confirm after check-in.

For local deployment, run `anvil`, configure `LOCAL_RPC_URL=http://127.0.0.1:8545` and a disposable Anvil key, then `node --env-file=.env scripts/deploy.js --local`. Never use an Anvil key on a public network.

## Backend foundation

Set `ISSUER_PRIVATE_KEY`, `CONTRACT_ADDRESS`, independent random `STAFF_API_TOKEN` and `STUDENT_HASH_SECRET` values (32+ characters each), then `npm start`. The server binds to localhost, checks Sepolia and verifies event-specific issuer permission at check-in, and stores data in SQLite. Place behind HTTPS before remote use. Back up the database and hashing secret together.

All endpoints except `/health` require `Authorization: Bearer STAFF_API_TOKEN`. This is an operator-only foundation, not public signup or club-scoped authentication.

| Endpoint | Body / result |
| --- | --- |
| `POST /registrations` | `{ "eventId": 1, "studentId": "college-issued-id", "wallet": "0x…" }`; returns registration ID |
| `POST /registrations/:id/check-in` | `{ "physicallyVerified": true, "permanentCollectibleConsent": true }`; returns mint job |
| `GET /jobs/:id` | Mint status, transaction hash and safe error message |

Staff must actually verify student identity, attendance, consent and wallet destination. The booleans record staff confirmation; software cannot establish physical presence itself. Address-only entry does not prove wallet ownership. Each student and wallet can register once per event. IDs are stored as keyed hashes, not raw identifiers; hashed identifiers are still sensitive.

The single worker processes a durable queue serially. Signed transactions are stored before broadcast and reused after restart; two confirmations are required. Unsigned jobs fail after three unsuccessful attempts so later jobs can proceed. Do not run multiple backend instances against the same database or send other transactions from the issuer wallet. An unresolved signed transaction blocks the queue to avoid nonce conflicts: inspect RPC, balance, nonce and event window before manually intervening. Automatic fee replacement, deep reorg handling, club authentication, public RSVP, QR UI and gallery are next steps, not implemented yet.

## Contract structure

`contracts/Kairo.sol` serves all events from one ERC-721 collection. Each event has its own frozen metadata URI, organizer, issuer allowlist, capacity, mint window and pause state. Token IDs are globally unique and `eventFor(tokenId)` identifies their event. The college admin creates events and can manage any event; an organizer can manage issuers and pause only their own event. Minting always requires explicit authorization for that event—even the college admin has no automatic mint permission.

Event creation takes `(uri, cap, startsAt, endsAt, organizer, issuer)`. Organizers/admins use `setEventIssuer(eventId, wallet, allowed)` to grant or revoke event-specific mint permission. Assign the backend issuer wallet separately to each event it should serve. Set `CONTRACT_ADDRESS` to the new deployment; the previous two-contract deployment ABI is incompatible.

## Contract guarantees

- Admin-only event creation, event-specific issuer minting, revocable event permissions.
- Event capacity and mint windows, emergency pause of issuance.
- One token per event/wallet; one student per event is enforced privately by the backend.
- Transfers, approvals and even internal burns revert. No proxy, unlock, metadata setter, or burn entry point.
- Wallet mistakes/loss cannot be repaired by moving or destroying tokens. Wallet control can still change outside the contract.

Tests cover permissions, interfaces, URI, caps, duplicates, mint windows, pause, transfer variants, approvals, internal burns, API validation, consent, idempotent check-in and mint retry reconciliation. This is not an independent security audit.
