# Kairo — Your campus, collected.

College-event RSVPs, verified in-person check-in, and permanent soulbound collectibles on Sepolia. One deployed ERC-721 contract serves all events. The responsive frontend draws on POAP’s organizer/collector flows with original Kairo branding and artwork.

## What is implemented

- Live event discovery with 15-second refresh, category filters and search, remaining capacity, event details and public RSVP.
- Registration for the signed-in wallet, permanent-collectible consent and downloadable ticket QR.
- Organizer wallet sign-in using an expiring, single-use signature challenge and HttpOnly session cookie.
- College-admin event publication: artwork upload or badge generator, preview, frozen metadata, wallet-confirmed on-chain event creation and resumable publication.
- Event-scoped organizer dashboard, attendee list, ticket scanner, audited check-in, issuer permission changes and issuance pause/resume.
- Sponsored mint jobs, receipt status and confirmed-collectible gallery.
- Installable PWA with an offline shell and public discovery cache. Authenticated APIs, wallet lookups and private ticket data are never cached.

## Serverless architecture

```text
Browser / installable web app
           |
Cloudflare Worker + static assets
   |            |             |
  D1           R2       MintCoordinator Durable Object
registrations artwork     alarm-driven serial mint queue
sessions      metadata                  |
audit trail                         Sepolia Kairo
```

There is no always-running Express server or interval-based worker in the new app. A Durable Object serializes use of one dedicated issuer wallet and wakes only for queued work. A 15-minute recovery trigger wakes saved jobs after an interrupted check-in and cleans expired authentication/rate-limit records. `backend/` is the earlier local prototype, retained under `npm run start:legacy`; it is not deployed by Wrangler.

## Local development

Requires Node 24+, npm and Foundry.

```sh
git submodule update --init --recursive
npm ci
cp .dev.vars.example .dev.vars
npm run db:local
npm run dev
```

Open `http://localhost:8787/` for the connected app. No sample events or preview mode are shipped. Empty databases show an empty state; API outages show an error. Publish events from the deployed HTTPS app so immutable metadata URLs are publicly accessible.

Set these in ignored `.dev.vars`:

- `SEPOLIA_RPC_URL`: optional dedicated endpoint; otherwise the Worker uses `PUBLIC_RPC_URL` from configuration. An absent value never selects a localhost RPC.
- `ISSUER_PRIVATE_KEY`: dedicated, funded Sepolia relayer wallet. Never use it for other transactions while the queue runs.
- `ISSUER_ADDRESS`: the same wallet’s public address, used by the creation form.
- `STUDENT_HASH_SECRET`: independent random secret with at least 32 characters; back it up with D1. Never rotate it for an existing registration database.
- `SITE_ORIGIN`: the browser origin for this environment, including the port in local development.

After the server reports `Ready on http://localhost:8787`, run `npm run smoke:local`. This reads `/api/config`, `/api/health` and `/api/events`; it never publishes or mints. A degraded health check names the failing dependency. `KAIRO_LOCAL_URL` can select another loopback origin.

If startup reports empty/invalid JSON in an installed dependency, check whether the project is offloaded by iCloud. Download the project locally, then run `npm ci` from the valid lockfile. Keep active development files available offline. A failed build means no new dev server starts; a stale process may still serve an older bundle. Avoid starting a second server on another port accidentally.

The deployer key is never used by the serverless API. The college admin connects their wallet in the browser to publish an event. The event’s initial issuer must match the configured relayer. Organizers can grant additional event issuer permissions in the dashboard; the contract allows these trusted issuers to mint directly, so grant access carefully.

For new event artwork, upload PNG/JPEG up to 2 MB, upload MP4/WebM up to 10 MB, or generate an animated SVG badge from the description. R2 keys include a content hash; uploaded metadata is frozen before the on-chain event is created. Use a stable production domain for event creation: local `localhost` metadata URLs cannot be read by external wallets. Back up the bucket; content-addressed URLs still depend on hosting availability. No student identifiers belong in collectible metadata.

The latest wallet, dialog, organiser-address, animation and XSS verification results are in [docs/local-verification.md](docs/local-verification.md). Keep normal local development on its actual host and port; overriding `--local-upstream` can remove the port from generated media URLs.

## Cloudflare deployment

The production configuration targets Cloudflare Pages at https://kairo-site-7fb.pages.dev. Deployment is currently deferred while the changes are verified locally. When deployed, Pages forwards same-origin API requests to the Worker at https://kairo.aakritigupta7227.workers.dev, with the remote `kairo` D1 database, all seven migrations applied, the `kairo-media` R2 bucket, and all three runtime secrets. The homepage and D1-backed event API passed live checks. The requested custom domain `poap.ntlap.in` remains deferred because Cloudflare reports that the `ntlap.in` zone does not exist in the authenticated account. Wrangler deploys to the working `workers.dev` address with no custom routes. Once the zone is active, add its custom-domain route to `wrangler.jsonc` before deploying. Run `npm run preflight:app` to verify the contract, runtime secrets and relayer funding before deployment.

```sh
npx wrangler login
npx wrangler d1 create kairo
npx wrangler r2 bucket create kairo-media
```

Replace the placeholder `database_id` in `wrangler.jsonc` with the D1 command’s returned ID. Keep `CONTRACT_ADDRESS` set to the deployed Sepolia contract. Configure `ISSUER_ADDRESS` in Wrangler vars (public, not a secret). Choose `MAX_FEE_GWEI` for your testnet budget; the relayer waits/retries instead of signing above this ceiling.

```sh
npx wrangler secret put SEPOLIA_RPC_URL
npx wrangler secret put ISSUER_PRIVATE_KEY
npx wrangler secret put STUDENT_HASH_SECRET
# Or use npm run secrets:app to upload only runtime secrets from .dev.vars via stdin.
npx wrangler d1 migrations apply kairo --remote
npm run deploy:app
```

Wrangler deploys the API, static assets and Durable Object. D1, R2, Workers and Durable Objects have their own platform limits and billing; serverless does not guarantee free hosting. Configure a stable domain before publishing real event metadata. Do not upload `.env`, `.dev.vars`, test wallet journals or RPC credentials to GitHub or hosting assets.

## Gas policy

- Discovery, signatures, artwork uploads, RSVPs and check-ins are off-chain: no blockchain gas.
- The admin pays testnet gas to create an event or change on-chain permissions.
- Attendees pay no gas. The dedicated relayer pays for each attendance mint after verification.
- The deployed contract requires one transaction per attendee; the app does not claim cheaper per-mint gas or implement batching. Gas estimation and an EIP-1559 fee ceiling avoid signing during excessive fees; they do not guarantee the lowest future fee.
- Extend the mint end time beyond the physical event so queued transactions can finish. Queue processing is conservative: one unresolved signed transaction at a time. Larger events need pipelined nonces or a separately reviewed batching contract before promising fast mass minting.

## Contract and deployment

`contracts/Kairo.sol` provides event-specific metadata, organizers, revocable issuer allowlists, caps, windows and issuance pauses. Every token is permanently locked (ERC-5192); transfer, approvals and even internal burn fail. No proxy, unlock or metadata setter exists. Admin event management does not automatically grant mint permission.

The Sepolia deployment is recorded in `deployments/sepolia.json`. To deploy another instance:

```sh
cp .env.example .env
# Configure RPC, deployer key and optional ADMIN_ADDRESS locally.
npm run deploy:sepolia
```

The optional `npm run smoke:sepolia` script creates a permanent demo event and issues a non-burnable NFT to a disposable test wallet. It has not been run. Its ignored `data/sepolia-smoke.json` journal contains the test key and signed payloads. Keep it private. Source verification on Etherscan is also pending.

## Checks and practical limits

```sh
npm test
npm run build
forge fmt --check
```

Contract tests cover isolation between events, authorization, metadata, caps, duplicates, mint windows, pause, receiver rollback, transfer variants, approvals and internal burns. Serverless tests exercise real SQLite SQL behind a D1-shaped adapter, signature replay rejection, cross-event staff isolation, consent/capacity validation, audited idempotent check-in, frozen-artwork publication and durable mint retry behavior. These are not real-chain or Cloudflare-production integration tests.

- Staff must check physical presence and college identity; the ID entered at check-in must match the hashed RSVP ID. Public RSVP does not prove ownership of a student ID or wallet. Rate limits limit abuse but do not replace verified college sign-in; add college SSO before relying on this for official attendance.
- RSVP IDs are bearer ticket secrets. Keep QR codes private. Consent timestamps and staff wallet/timestamps are stored, not raw student IDs.
- The directory returns up to 200 events; the staff table displays up to 1,000 registrations. Paginate before those limits. The web collection checks ownership directly against the configured Kairo contract in pages; the legacy `/api/collection` endpoint remains database-only for existing clients.
- Unsigned jobs fail after ten attempts. Unresolved signed transactions retain their nonce and block later mints; deep reorg recovery remains future work. Transactions unresolved for two minutes can be replaced using the same nonce and calldata, with bumped fees capped by MAX_FEE_GWEI; receipts from every attempt are checked. Event staff can retry failed jobs from the dashboard; submitted jobs cannot be reset because their nonce is unresolved. All signed attempts are retained in mint_transactions.
- Hosted metadata remains available only while its bucket/domain are maintained. Back up D1 and R2; a token surviving on-chain does not ensure its artwork survives.
- Wallet loss or a wrong destination cannot be corrected by transferring or burning. Sepolia assets are testnet collectibles, not permanent academic credentials.
- Organizer login currently supports externally owned wallets via injected Ethereum providers. Contract-wallet signature login and native app-store builds are not included.


### Pages deployment and mobile app

Run `npm run deploy:pages` to build and publish the website. The deploy script stages the Pages config and Functions in ignored `.wrangler/pages-site`; the root Wrangler config remains dedicated to the minting Worker. Pages has no private keys: its API proxy forwards requests to the Worker and rejects cross-origin mutations. The Pages homepage, event API and admin message-signature login were verified live. Custom domain setup is deferred.

Capacity 0 means unlimited: the creator uses the uint64 maximum on-chain, and D1 stores 0 as the unlimited sentinel. Finite capacity defaults to 50. Publishing creates a Drop ID; the drop page provides a downloadable QR linking to the real deployed drop. Staff attendance verification remains required. A QR cannot bypass it.

The Android project uses the same live website inside a native Expo WebView, preserving the theme and backend workflows. Native code handles safe areas, Android back navigation, MetaMask Mobile handoff, and QR file sharing. Setup, verification, and APK build instructions are in [app/README.md](app/README.md). A signed APK and physical-device QA require an authenticated Expo build account.


### Hacktober QR claims

Hacktober Drop #2 uses the organizer-approved public QR mode: any authenticated wallet can consent and claim once, up to 50 wallets, during 11 October 2026 9:30 AM–1 PM IST. RSVP remains closed. Other attendance-mode drops still require staff check-in. QR claims store `claimed_at` separately and never fabricate `checked_in_at`. The backend validates the wallet signature, event-specific policy, capacity, pause state, and on-chain mint window. The original uploaded PNG is preserved byte-for-byte. See deployments/hacktober.json and output/hacktober/drop-qr.png.

## Student experience refresh

The web frontend uses a midnight design system, responsive event discovery, date/category/role filters, linked event and badge details, wallet profiles, and a read-only wallet connection. Only an explicit sign-in or write action requests a signature or network switch. Existing organizer and minting flows remain available.

Apply `serverless/migrations/0006_student_experience.sql` before running the updated API against an existing database:

```sh
npm run db:local
# For the hosted database, before deploying the Worker:
npx wrangler d1 migrations apply kairo --remote
npm run deploy:app
# If serving the frontend through the existing Pages deployment as well:
npm run deploy:pages
```

`GET /api/wallet-collection?wallet=0x…&cursor=1` checks the configured Sepolia Kairo contract directly, scanning ten event IDs per page. It returns the contract balance, verified ownership, available metadata, public issuance history, pending issuance count, and a continuation cursor. Tokens minted outside the app database are included. Missing metadata or issuance dates are labeled unavailable/unindexed; an RPC failure is never treated as an empty collection. This is a Kairo collection viewer, not an index of unrelated NFT contracts. Search/filter results and profile counts cover loaded records. Large collections can continue loading in the UI.

Campus, eligibility and available roles are organizer-provided listing information. A registration records a requested role; staff must verify it at check-in. The existing contract does not encode roles, so they are staff records rather than on-chain role attestations. QR claims are labeled Collector and excluded from verified-participation metrics. Organization names are not independently verified. Cancellation requires a signed-in matching wallet and atomically removes only an unverified RSVP without a mint job.

The PWA caches its shell, public discovery/configuration, and up to 60 content-addressed artwork/metadata resources. It excludes authenticated APIs, ticket secrets, staff data and wallet collections. Offline discovery is labeled as previously loaded content; verification and writes require connectivity. System typography and flat SVG badges work without external fonts or WebGL. Push notifications are not implemented.

## Kairos-ui integration and generated badges

The served entry point is `frontend/app.js`. The Kairos-ui visual shell now routes
Gallery, Collection, Collectors, Build with POAP, and Manage attendance to the
existing Worker/D1/R2/Sepolia flows. Empty databases stay empty; API failures show
an error and retry. Static artwork in the hero and memory press is decorative.
The unused design preview entry points and their simulated event data have been removed.

`POST /api/artwork` accepts `{ name, description, image? }` using the existing
admin session. With no image, the Worker generates an SVG badge from description
keywords (technology, music, art, sports, or community), with a stable palette and
pattern derived from the event text. This is a procedural generator; it does not
call a paid AI image service. Custom PNG/JPEG uploads remain supported. Both paths
store content-addressed artwork and frozen metadata in R2 and return `{ image,
uri }`. The creator can preview a generated badge or generate automatically during
publication. Creating artwork alone does not mint: the admin must still confirm
event creation, followed by eligible attendee issuance through the real contract.

Run `npm run db:local`, `npm run dev`, `npm test`, and `npm run build` locally.
Wallet authentication, generation, publication, and minting require the runtime
secrets listed above; this checkout does not include `.dev.vars`. Deploy the Worker
and frontend together so the optional-image API and UI are the same version.

## Organizer studio, MetaMask consent, and video collectibles

The organiser workspace is at `/#issuer/studio`. Any signed-in wallet can generate
artwork, upload PNG/JPEG (2 MB) or MP4/WebM (10 MB), save its own event drafts to D1,
and submit them for publication. The college admin sees submitted events in the
same studio and confirms their on-chain creation; contract permissions are
unchanged. Private draft APIs never return another organiser's submissions to a
non-admin. Published drafts cannot be edited. Video metadata uses `animation_url`
and retains a generated SVG poster; collection and event details provide playback
controls. These are hosted assets, so maintaining R2 and its URLs is still required.

Apply `serverless/migrations/0007_organizer_studio.sql` before deploying this
version. The migration adds draft storage and an optional event animation URL.

Wallet connection uses MetaMask EIP-6963 discovery, with a MetaMask-only injected
provider fallback. Startup never restores an account automatically. Each explicit
connection requests `wallet_requestPermissions` before `eth_requestAccounts`;
rejection leaves the app disconnected. Sign-in is separate. Account/network
changes clear the selected connection and server session. Switching accounts is
available in the wallet menu. Disconnecting from Kairo clears its app session;
MetaMask's own site-permission controls remain available inside the extension.

About and Documentation now describe the actual organiser/collector workflows.
Navigation groups are exclusive on desktop and mobile. Animated doodles respect
reduced-motion preferences and the global Pause motion control.
