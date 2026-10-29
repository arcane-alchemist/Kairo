# Kairo

A MetaMask-only POAP platform on Sepolia. The website and API run on Cloudflare Workers, with D1, R2 and one alarm-driven Durable Object for serialized relayer transactions. There is no always-running backend, email provider, paid badge-generation service, sample-event mode, or alternative blockchain.

## Website (Astro)

Astro builds the website into `dist/`, which the existing Cloudflare Worker serves alongside `/api/` and `/media/`. `frontend/pages/index.astro` uses `frontend/layouts/SiteLayout.astro` and the components in `frontend/components/`. The current styling, Three.js medal, Anatomy memory press, wallet flows and hash URLs are preserved. The Expo app in `app/` continues to use the same website and API.

`npm run build` renders the Astro pages, bundles the browser application into content-hashed chunks and generates the service worker's exact asset list. Cache versions change with the rendered page, public files, service worker or generated bundles. HTML, stylesheets and other unversioned files revalidate online; content-hashed bundles and artwork reuse the cache. Installation refreshes the offline shell, activation removes older Kairo caches, and artwork storage is capped at 60 entries. Only the app shell, public discovery and content-addressed artwork enter the offline cache; private wallet and staff responses remain excluded.

Use `npm run dev` for the complete local site and API at `http://localhost:8787`. Run `npm run test:frontend` for the browser application tests against Astro's generated HTML, or `npm test` for the full contract and application checks. Build before running individual frontend tests directly. The shared doodle loader covers startup and page navigation until data, fonts, images and home scene assets settle; videos wait for a playable first frame. Refresh and the loader's recovery button retain the current hash URL.

## Accounts and publishing

`SUPER_ADMIN_ADDRESS` is a public setting in `wrangler.jsonc`, set to `0x4CB1E99035D2812472B2d50DBB590E9C593188bE`. Both localhost and deployed Workers read this setting; it is not a runtime secret. Contract deployment and verification scripts use the same public setting; any local admin override must match it. The server checks the current on-chain admin before granting panel access. The superadmin can add or revoke panel wallets from **Admin → Activity → Panel access** using MetaMask; delegates sign in with their own wallets and can review requests and manage events, but cannot grant access to others. The superadmin role itself transfers through `proposeSuperAdmin(newAddress)` and `acceptSuperAdmin()`; update the public Worker setting and the deployment environment after acceptance. The deployer and relayer do not receive admin panel rights.

Any signed-in MetaMask wallet can publish an event. The form collects its title, description, category, venue or online link, event dates, approximate attendees, mint window, and 1–8 roles. Each role has its own uploaded/generated badge and cap of 1–10,000. `EVENTS_PER_WALLET_PER_DAY` defaults to 5; the server enforces this atomically. Publication immediately freezes content-addressed R2 metadata and queues a single relayer transaction creating every role. After confirmation, all role listings become live together. Saved transaction bytes, receipts, publication IDs and the organizer studio support recovery after interruption. There is no review prerequisite.

Badge artwork and the mint window are frozen on chain and cannot be edited. Admin moderation affects all role drops of an event: accept/verify, reject/unlist with a reason, edit listing title/description/venue/category/organization/campus/event dates/approximate attendees, and pause/resume. Rejection blocks new claims immediately and queues the on-chain pause. A signed transaction already in flight can confirm before a pause; the dashboard reports queued actions rather than claiming instant blockchain finality. Every moderation mutation is audited. The admin studio also shows relayer balance and dependency health.

The publishing wallet can edit those listing details or delete its published event from **Organizer studio → Manage event**. Edit and delete apply to every role in the event group. Deletion removes discovery and new claim access, cancels unsigned pending mints, revokes unused links and queues an on-chain pause; existing badges and history remain. An already submitted mint may confirm while the pause is pending. Event end dates move listings to Past events, while the immutable mint window determines when claims stop.

## Claiming

Participant QR/link claims and POAP requests bind to the connected, SIWE-signed MetaMask wallet; typed participant destinations are rejected. The authenticated super admin can mint directly to a validated, nonzero Ethereum destination.

Sign-in requests one MetaMask account selection, reads the approved account, then sends a standard SIWE `personal_sign` message. A wallet-side spam-filter denial is shown as a clear error and is never silently retried or treated as authentication. A manual retry reuses the approved account when it remains connected. If MetaMask continues to deny the signature, Kairo cannot override that wallet decision; use the intended Kairo origin and report a false positive to MetaMask.

- **Recipient links:** paste or upload `email,role` CSV, or enter one row per recipient. Up to 500 rows per request; emails are normalized and duplicates merged per event and role. Each token has 128 bits of cryptographic randomness. Only its SHA-256 hash is stored. The public link puts the token in the URL fragment; API redemption sends it in the request body to keep bearer tokens out of request-path logs.

A link works for whoever opens it first. Its page shows the event and role before requiring MetaMask sign-in. A D1 transaction reserves capacity, creates the wallet claim and changes `issued` to `claiming`; concurrent redemptions have one winner. Confirmation changes it to `minted`. Permanent failure returns it to `issued`. Revoke/regenerate is allowed only before a claim is in flight or minted. The contract and database both enforce one token per role drop and wallet. Pauses, caps and mint windows apply to every claim method.

New or regenerated links can be copied, opened in the organizer's own mail app, and exported as `email,role,link` CSV. Save this export when issued: the server cannot reconstruct tokens from hashes. No email service sends mail. Emails are private to the organizer and super admin, are never added to badge metadata, and can be deleted on request. `EMAIL_RETENTION_DAYS` defaults to 30; the recovery cron clears expired addresses every 15 minutes.

Participants can request a POAP from the event details after signing in and consenting to a permanent badge. Requests are private to that wallet and the super admin. In the super admin event dashboard, choose an event and role to accept and mint a request, reject it without minting, or enter a nonzero Ethereum address to mint directly. Acceptance and direct minting use the existing sponsored queue and enforce the mint window, pauses, remaining supply and one POAP per role and wallet. Requests can be submitted before the mint window; acceptance waits until it opens. Rejected requests cannot be resubmitted; the super admin can still issue a direct mint. Public and recipient-link claims use the sponsored mint flow after event approval.

Each role dashboard shows links issued/used, QR claims, minted/pending/failed, cap remaining, paginated transactions and recipient rows, failed-mint retry, and transaction CSV export. Gallery shows only confirmed, ownership-verified POAPs with their original uploaded/generated artwork and Add to MetaMask controls. It refreshes automatically and offers manual refresh. Request status remains on each event's details page and in the private request API. Mint success shows the badge and Etherscan link from `EXPLORER_URL`.

## Local setup (real Sepolia)

Credential locations: `.dev.vars` stores local Worker secrets, including `ISSUER_PRIVATE_KEY`; `.env` stores the deployment/RPC configuration, including `SEPOLIA_RPC_URL` (which may contain a provider API key). Production runtime credentials live in Cloudflare Worker secrets, uploaded by `scripts/upload-runtime-secrets.js`. Cloudflare CLI authentication is stored outside this repository at `~/Library/Preferences/.wrangler/config/default.toml`. The mobile app's `EXPO_PUBLIC_API_URL` is a public website URL, never a secret. Do not put private API keys in `EXPO_PUBLIC_*` variables.

Install Node 24+, Foundry for contract compilation/tests, and npm dependencies:

```sh
npm install
cp .dev.vars.example .dev.vars
# Configure the existing relayer key locally; never commit or paste keys into chat.
npm run dev
```

Open `http://localhost:8787`. D1 and the transaction coordinator run locally; artwork uses the real R2 bucket through its remote binding, and all chain reads/transactions use real Sepolia. `MEDIA_BASE_URL` in `.dev.vars` points to the enabled public R2 HTTPS URL, so publishing from localhost never freezes localhost asset URLs. The production config serves assets through the Worker’s `/media/` route after you deploy the website. No Anvil or synthetic runtime is used. The relayer key must match `ISSUER_ADDRESS` in `wrangler.jsonc`; public address overrides were removed from `.dev.vars`. The contract must be the updated deployment. Use `PUBLIC_RPC_URL`, or set `SEPOLIA_RPC_URL` locally for a private RPC.

```sh
npm test                  # contract and JavaScript unit/regression tests
npm run test:workflow     # isolated local EVM integration; no live keys or Sepolia transactions
npm run build             # production frontend build
npm run smoke:local       # local config, dependency health and discovery checks
npm run verify:sepolia    # read-only real-chain admin, bytecode compatibility and balance audit
npm run verify:media      # upload/read/delete one public R2 verification object
npm run verify:local      # real SIWE and public badge upload, without creating events or tokens
```

The application does not replace failures with sample data. `/api/health` reports network connectivity, contract compatibility, relayer configuration/funding storage, and the POAP-request schema separately. It returns 503 until the required setup is complete. The admin panel presents these as setup tasks and hides pagination when no further page exists. A green unit-test run does not claim that live Sepolia publication/minting has been exercised.

## Database migration

Applied migrations are preserved. `0009_direct_publication.sql` migrates issued/pending jobs and transaction history to `claims`, drops registrations and organizer drafts, and removes registration-only event columns. `0010_session_and_query_indexes.sql` expires legacy authentication sessions so all subsequent sessions use wallet-bound SIWE and adds query indexes. Applying it signs existing users out. `0011_poap_requests.sql` adds address-based POAP requests and the `ADMIN` claim method while preserving claims, signed jobs, recipient links and transaction history. `0012_event_deletion.sql` adds a deletion marker without dropping NFT, claim or transaction records. Apply migrations before deploying this version.

`npm run dev` applies migrations only to local D1. Before a Worker deployment, back up the hosted database. `npm run deploy:app` builds the frontend, runs `npm run db:remote` to apply migrations, and then deploys the Worker/assets. You can run `npm run db:remote` separately when needed. No remote D1 migrations or website deployment were performed as part of this update.

## Contract configuration

The active Sepolia contract is `0xC99296d7C8D50F1c0DB7234c6338ea50805e6121` (deployment transaction `0xe7a236e7032f3b91a8d4791400b10cd1e9b9f7e34a996851c3af9c50f042c9cd`). Its initial superadmin is `0x4CB1E99035D2812472B2d50DBB590E9C593188bE`; no delegated wallets are initially granted access. The previous contract is archived for Gallery and existing event reads, so earlier POAPs remain at their original contract address. The new contract starts at event ID 11 and token ID 20, preserving the previous counters.

When the existing deployer key is configured locally in `.env`, `npm run deploy:sepolia` compiles and deploys only to Sepolia, checks the gas-price ceiling, uses the configured super admin and relayer, and updates `wrangler.jsonc` and the deployment manifest. It refuses to sign with the super admin's key. The constructor continues prior event/token IDs, and `ARCHIVE_CONTRACT_ADDRESSES` preserves read access to prior collections. Keep the previous deployment record and database: existing badges remain on their original contract. This script does not deploy the website.

The dedicated relayer signs all publishing, moderation and mint transactions through the same coordinator. Up to 20 eligible new-contract mints share a batch. Signed bytes are saved before broadcast, uncertain broadcasts are polled, replacement transactions keep the nonce and calldata, and an unresolved signed nonce is never recycled. `MAX_FEE_GWEI` defaults to 10. Neither participants nor organizers pay gas. Only Sepolia test ETH is spent; no mainnet transactions are supported. Free-tier services still have usage limits; no claim of unlimited free capacity is made.

The Worker and frontend were deployed with the new contract address and the existing Cloudflare secrets. For later deployments, keep the public vars in `wrangler.jsonc` and Worker secrets (`ISSUER_PRIVATE_KEY` and optional `SEPOLIA_RPC_URL`) configured. `.env` is for deployment scripts and `.dev.vars` is for local Wrangler; neither automatically configures a deployed Worker. `scripts/upload-runtime-secrets.js` excludes the deployer key.

Local artwork storage uses the existing `kairo-media` bucket with [remote R2 bindings](https://developers.cloudflare.com/r2/get-started/workers-api/). Its public r2.dev URL is enabled for local Sepolia testing; the D1 database containing emails remains private. Public metadata is fetched and compared with the stored content before publication is queued. Temporary verification objects are cleaned up.
