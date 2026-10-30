# Kairo

**Keep your moments.** Kairo turns participation in campus and community events into permanent, non-transferable POAPs on Ethereum Sepolia.

Organizers publish events and create badges for different participation roles. Participants collect approved drops in their wallets, while admins review events and POAP requests. A dedicated relayer sponsors publication and minting transactions using Sepolia test ETH.

The website and API run on Cloudflare Workers. The repository also includes the Solidity contract and an Expo mobile companion app.

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Architecture](#architecture)
- [Local development](#local-development)
- [Configuration](#configuration)
- [Tests and verification](#tests-and-verification)
- [Deployment](#deployment)
- [Mobile app](#mobile-app)
- [Troubleshooting](#troubleshooting)
- [Project structure](#project-structure)

## Features

- **Privy authentication:** wallet and email login, with Ethereum wallet support configured for MetaMask, Rainbow, Coinbase Wallet, and WalletConnect. Email login can create an embedded wallet.
- **Organizer studio:** publish events with 1–8 participation roles, each with its own artwork and supply of 1–10,000 drops. The default publication limit is five events per wallet per day.
- **Custom or generated artwork:** upload PNG/JPEG images or MP4/WebM videos, or generate a badge from the event description. Still-image uploads are center-cropped into 512 × 512 circular PNGs with transparent corners before publication.
- **Admin review:** approve or reject events, review POAP requests, mint directly to an address, and pause or resume minting.
- **Multiple claiming flows:** public mint links, single-use recipient links, walk-in QR claims, and admin-reviewed POAP requests.
- **Wallet Gallery:** show ownership-verified collectibles, full-page POAP details, and MetaMask import controls. Mint confirmation displays the artwork and message in the page.
- **Responsive website and PWA:** layouts for laptop, tablet, and phone, reduced-motion support, an offline shell, and a refresh notice when an updated build is available.

Kairo is configured for **Sepolia only**. These are testnet assets, not mainnet tokens. A badge cannot be transferred or burned; hiding it in a wallet changes only that wallet’s display.

## How it works

### Connect and sign in

Privy downloads and initializes quietly after the browser finishes loading the page. Initialization does not open a login modal or connect a wallet automatically. Clicking **Connect wallet** opens Privy authentication; early clicks share the same initialization request.

If Privy has restored a session but Kairo needs a new sign-in, the explicit Connect action clears that Privy session before reopening authentication. Account switching uses the wallet chooser. Download, initialization, and session-reset failures allow a retry instead of leaving the button busy indefinitely.

After Privy returns an Ethereum wallet, Kairo requests the configured Sepolia network and a Sign-In with Ethereum (SIWE) signature. The Worker verifies the signature and creates the application session. Privy authentication does not replace this backend verification. Admin access is checked against the contract.

### Publish and approve an event

1. Sign in and open **Create → Organizer studio**.
2. Enter the event details, dates, minting window, and participation roles.
3. Choose each role’s drop count, then upload or generate its artwork.
4. Publish. Metadata is saved to content-addressed R2 objects, and the relayer queues the on-chain publication.
5. Once the transaction confirms, the event appears in the organizer’s studio awaiting admin approval. Public and recipient claims require approval and an open minting window.

Artwork, badge metadata, supply, and minting dates are fixed by publication. Listing details such as title, description, venue, organization, campus, and event dates can be edited by the organizer. Deleting a listing stops new claims and queues a pause; it does not remove previously minted POAPs. A transaction already submitted may confirm before a pause takes effect.

### Collect a POAP

Participants connect their wallet, consent to receiving a permanent badge, and use an eligible claim method. Participant claims are bound to the authenticated wallet; the admin direct-mint flow can specify a recipient address.

Recipient links can be generated from `email,role` CSV data, copied, and exported. Only token hashes are stored, so save the issued links when they are created. Kairo does not send email automatically. Recipient emails remain private and are removed according to `EMAIL_RETENTION_DAYS` or on request.

The transaction coordinator reserves capacity and tracks queued, submitted, failed, and confirmed mints. Gallery displays confirmed, ownership-verified POAPs. **Add to MetaMask** imports an existing NFT for display; it does not mint another token. Some MetaMask versions can show blank artwork after automatic import. If this happens, hide the entry in MetaMask and use NFTs → Import NFT with the contract address and token ID to restore it.

Circular PNG artwork retains its transparent corners outside the website, but each wallet controls its surrounding tile layout. New image processing does not alter previously published or minted artwork. Video files are stored separately as the metadata’s animation asset.

## Architecture

| Component | Responsibility |
| --- | --- |
| Astro and browser JavaScript | Build the website into `dist/`, render pages, and handle hash-based navigation |
| React and Privy | Mount the authentication SDK and coordinate wallet/email login |
| Three.js | Interactive homepage medal |
| Cloudflare Worker | Serve the website, `/api/`, and `/media/` |
| Cloudflare D1 | Events, sessions, claims, recipient links, jobs, and audit records |
| Cloudflare R2 | Content-addressed artwork, videos, and metadata |
| Durable Object (`MintCoordinator`) | Serialize relayer transactions, track receipts, and recover pending work |
| Solidity and OpenZeppelin | Enforce badge ownership, roles, minting windows, caps, and non-transferability |
| Expo / React Native | Load the shared website in a mobile shell with native integrations |

The service worker caches the app shell, public discovery/configuration responses, and eligible content-addressed artwork. Private wallet, authentication, claim, and staff API responses are excluded. Offline access does not support new blockchain writes or sign-ins.

## Local development

### Prerequisites

- Node.js **24 or newer** and npm.
- Foundry (`forge` and `anvil`) for contract and workflow tests.
- Access to the configured Cloudflare resources, or your own D1 database, R2 bucket, and Worker configuration.
- A Sepolia RPC endpoint and a funded relayer wallet for publication and minting.
- A Privy app configuration appropriate for your website origins.

### Setup

```sh
git clone --recurse-submodules https://github.com/arcane-alchemist/Kairo.git
cd Kairo
npm ci
```

For an existing clone, initialize the contract dependency:

```sh
git submodule update --init --recursive
```

Create local configuration if `.dev.vars` does not already exist:

```sh
cp .dev.vars.example .dev.vars
```

Set `ISSUER_PRIVATE_KEY` to the relayer key matching `ISSUER_ADDRESS` in [wrangler.jsonc](wrangler.jsonc). Review the public settings and resource bindings before starting. For a separate installation, replace the project-specific Cloudflare resource identifiers and Privy app configuration with your own.

Authenticate Wrangler when accessing Cloudflare resources:

```sh
npx wrangler login
```

Start the complete website and API:

```sh
npm run dev
```

Open **http://localhost:8787**. This command builds the frontend, applies local D1 migrations, and starts Wrangler. `npm start` runs the same workflow.

**Local development is not an isolated blockchain sandbox.** D1 and the transaction coordinator run locally, but the configured R2 binding is remote and blockchain requests use real Sepolia. Publishing and minting can write remote artwork and spend Sepolia test ETH. Use `npm run test:workflow` for the isolated local EVM integration test instead.

After editing frontend files, rebuild with `npm run build` and reload the browser. If an update notice appears, save any work before refreshing.

## Configuration

| Location | Purpose |
| --- | --- |
| [wrangler.jsonc](wrangler.jsonc) | Public runtime variables, Cloudflare bindings, cron schedule, and asset serving |
| [.dev.vars.example](.dev.vars.example) → `.dev.vars` | Local Worker secrets and optional local overrides |
| [.env.example](.env.example) → `.env` | Optional contract deployment credentials and RPC configuration |
| [frontend/privy-wallet.js](frontend/privy-wallet.js) | Privy app ID, login methods, supported wallets, and chain configuration |
| [app/.env.example](app/.env.example) | Public origin loaded by the mobile app |

### Important settings

| Setting | Meaning |
| --- | --- |
| `CONTRACT_ADDRESS` | Active Sepolia Kairo contract |
| `ARCHIVE_CONTRACT_ADDRESSES` | Earlier contracts included in supported historical reads |
| `CHAIN_ID`, `CHAIN_NAME` | Configured network; Sepolia uses chain ID `11155111` |
| `SITE_ORIGIN` | Deployed Worker origin |
| `ISSUER_ADDRESS` | Public address of the relayer authorized by the contract |
| `ISSUER_PRIVATE_KEY` | Secret key used by the Worker to sign sponsored transactions |
| `SUPER_ADMIN_ADDRESS` | Public superadmin address; must agree with the contract |
| `PUBLIC_RPC_URL` | Default public Sepolia RPC |
| `SEPOLIA_RPC_URL` | Optional dedicated RPC override; treat provider credentials as secrets |
| `MEDIA_BASE_URL` | Public base URL serving the bound artwork bucket |
| `EXPLORER_URL` | Explorer used for transaction and token links |
| `MAX_FEE_GWEI` | Relayer gas-price ceiling; configured default is `10` |
| `EVENTS_PER_WALLET_PER_DAY` | Publication limit; configured default is `5` |
| `EMAIL_RETENTION_DAYS` | Recipient-email retention; configured default is `30` |

Local publishing needs a publicly accessible `MEDIA_BASE_URL`; localhost artwork URLs cannot be frozen into published metadata. The example local configuration uses the public R2 origin. Production serves media through the Worker’s `/media/` route.

Keep private keys out of source control, screenshots, browser code, and `EXPO_PUBLIC_*` variables. `.dev.vars` and `.env` are ignored by Git. Neither file automatically configures production: deployed runtime credentials must be stored as Cloudflare Worker secrets. The deployer key is separate from the relayer key and is not uploaded by the runtime-secret script.

The superadmin can grant or revoke delegated panel access. Transferring the superadmin role requires `proposeSuperAdmin` and `acceptSuperAdmin`, followed by updating the matching public configuration. Possessing the deployer or relayer key does not itself grant panel access.

## Tests and verification

Run these from the repository root:

| Command | Checks / effects |
| --- | --- |
| `npm run build` | Build production HTML, hashed bundles, headers, and the service worker |
| `npm test` | Build, run Foundry contract tests, and run application/regression tests |
| `npm run test:frontend` | Build and test the browser application against generated HTML |
| `npm run test:contracts` | Run contract tests with Foundry |
| `npm run test:workflow` | Build contracts and exercise publication/minting against an isolated Anvil chain |
| `npm run smoke:local` | Read the running local Worker’s config, health, and events endpoints |
| `npm run preflight:app` | Check local publishing configuration, Sepolia contract, relayer identity, and balance |
| `npm run verify:sepolia` | Read-only verification against the configured live Sepolia deployment |
| `npm run verify:media` | Upload, read, and delete a temporary object in remote R2 |
| `npm run verify:local` | Exercise real local SIWE authentication and remote artwork upload, then clean up; creates no event or token |

Build before running individual frontend test files directly. Live verification commands need their configured services and credentials; successful unit tests do not prove that a deployed wallet login or live mint has completed.

For a release, also check in a browser: quiet Privy startup, Connect/cancel/retry, wallet and email login, account switching, event publication and approval, mint confirmation, Gallery, and MetaMask import. Check phone, tablet, and laptop layouts and reduced-motion behavior.

## Deployment

### Website and API on Cloudflare Workers

Review [wrangler.jsonc](wrangler.jsonc), authenticate Wrangler, and confirm the D1, R2, and Durable Object bindings belong to the intended environment. Back up the hosted D1 database before applying pending migrations.

For initial setup or an intentional credential update, upload the configured local runtime secrets:

```sh
npm run secrets:app
```

This writes `ISSUER_PRIVATE_KEY` and, when present, `SEPOLIA_RPC_URL` to the configured Worker. It excludes the deployer key. Do not run it just to redeploy frontend changes.

Test and deploy:

```sh
npm test
npm run deploy:app
```

`deploy:app` builds the frontend, **applies remote D1 migrations**, and deploys the Worker and assets. Migration files live in [serverless/migrations](serverless/migrations); retain previously applied migrations. Event approval is introduced by `0013_event_approval.sql`, while `0010_session_and_query_indexes.sql` expires legacy sessions.

When the target database is already current, a code/assets-only deployment can be made with:

```sh
npm run build
npx wrangler deploy
```

Neither website deployment command deploys a Solidity contract. Verify the resulting site and its dependency health after deployment; records in [deployments](deployments) are historical reports, not a live health check.

### Optional Cloudflare Pages frontend

`npm run deploy:pages` builds and publishes the configured Pages project. The proxy handlers in [functions](functions) forward `/api/` and `/media/` to the Worker; update their backend origin when using a different Worker. Pages deployment does not replace or deploy that backend.

### Optional contract deployment

Routine website updates do not require a new contract. For an intentional Sepolia contract deployment, prepare `.env` from [.env.example](.env.example) and review the public admin/relayer configuration first:

```sh
npm run deploy:sepolia
```

This sends a real Sepolia deployment transaction, spends test ETH, and updates `wrangler.jsonc` and deployment records. Use a deployment wallet, never the superadmin’s private key. Preserve the database and archived contract addresses so existing collectibles remain discoverable. See [deployments/sepolia.json](deployments/sepolia.json) for the recorded contract deployment.

## Mobile app

The [app](app) directory contains an Expo / React Native WebView companion using the same website and API. Its public `EXPO_PUBLIC_API_URL` must point to an origin serving both the website and same-origin API requests.

See [app/package.json](app/package.json) for development and validation commands, [app/app.json](app/app.json) for platform configuration, and [app/eas.json](app/eas.json) for preview, production, and local-device build profiles. Mobile dependencies are installed separately from the root website dependencies. Use a development/device build for native wallet integrations.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Changes do not appear on localhost | Rebuild with `npm run build`, reload, and use the update notice after saving work. Wrangler serves `dist/`. |
| Connect stays on “Opening Privy…” | Confirm the latest bundle is served, inspect browser errors and blocked requests, and retry after an initialization error. A restored Privy session needs the current explicit reauthentication handling. |
| MetaMask rejects the sign-in signature | Confirm the intended site origin, account, and Sepolia network. Kairo cannot override a wallet spam-filter denial. |
| Missing OpenZeppelin contract imports | Run `git submodule update --init --recursive`. |
| `/api/health` returns `503` | Inspect the reported dependency failures: RPC, contract compatibility, storage, relayer configuration/funding, or database schema. |
| Artwork is saved but publishing fails | Check `MEDIA_BASE_URL` and public access to the bound R2 bucket. Publication checks metadata against the saved artwork. |
| Minting is unavailable | Check event approval, minting dates, pauses, remaining supply, and whether the wallet already owns that role’s POAP. |
| Relayer transactions remain queued | Check Sepolia connectivity, relayer balance and identity, the fee ceiling, and coordinator status. Avoid manually resubmitting uncertain transactions. |
| Wrangler cannot resolve Cloudflare’s API hostname | Check the terminal’s network/DNS access. A local build or dry run does not mean deployment succeeded. |
| NFT does not appear automatically in MetaMask | Use **Add to MetaMask**, or import the displayed contract address and token ID with the receiving account on Sepolia. |

## Project structure

```text
frontend/              Astro pages/components and browser application
contracts/             Kairo Solidity contract
test/                  Foundry contract tests
serverless/            Worker API, transaction coordinator, and regression tests
  migrations/          Ordered D1 migrations
scripts/               Build, deployment, smoke, and verification scripts
functions/             Optional Cloudflare Pages API/media proxies
app/                   Expo mobile companion
lib/                   Foundry dependencies, including the OpenZeppelin submodule
deployments/           Contract records and historical verification reports
dist/                  Generated website assets (ignored by Git)
wrangler.jsonc         Worker configuration and resource bindings
foundry.toml           Solidity compiler and test configuration
```
