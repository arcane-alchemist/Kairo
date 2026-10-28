# POAP workflow changes and verification — 2026-10-28

## What caused ongoing-event minting to fail

The running local D1 database had migrations through `0010_session_and_query_indexes.sql`, but not `0011_poap_requests.sql`. The request table did not exist. The old health probe still reported the system healthy because it did not query that table. The local frontend also needed rebuilding to expose the new controls.

Migration 0011 has now been applied successfully to the real local D1 database. It preserves existing claim IDs, signed jobs, recipient links and transaction history. The frontend has been rebuilt. No remote database or existing event/token was changed by this work.

The actual event #4 has an open on-chain mint window of **28 October 2026, 09:00–14:00 IST**. The old Hacktober drop's mint window ended on 11 October; it cannot mint again under its immutable contract rules. Event dates and mint dates are distinct: an event being ongoing does not override its mint window.

## User workflow

1. Connect MetaMask and sign the wallet-bound SIWE message.
2. Create an event, set event dates and mint dates, and choose 1–8 roles with independent supply caps.
3. Upload a custom PNG/JPEG (or existing supported video design), or generate a descriptive SVG badge. Preview each role before publishing.
4. Publish with sponsored gas. The existing relayer queue signs and confirms all role drops; the studio supports resuming an interrupted publication.
5. Open an event and request its POAP with permanent-badge consent. Requests always target the signed-in wallet; a caller cannot supply someone else's destination.
6. Check the request status in event details or **Gallery → My POAP requests**. Pending/accepted/submitted/confirmed/failed/rejected states stay visible; status polling does not turn a pending request into a badge.
7. Once minting confirms, Gallery checks real ownership and displays the exact published custom/generated artwork, role, token and transaction history. It refreshes when request status changes or an issuance is pending, and includes a manual refresh control.

## Superadmin workflow

1. Sign in with the configured superadmin wallet and open **Admin → Manage claims**.
2. Choose the event and role. Review individual address requests with **Accept & mint** or **Reject**. Acceptance reserves supply and queues a mint; rejection creates no mint job. Concurrent decisions have one winner.
3. Alternatively, enter a valid nonzero Ethereum address and select **Mint POAP**. The recipient does not need an existing request or a wallet connection. The relayer pays Sepolia gas.
4. Review queued/submitted/confirmed or failed transactions. Failed admin mints can be retried by the superadmin after fixing the cause.
5. Edit the event listing's title, description, category, venue, organization, campus, event dates and approximate attendance. Changes apply to every role drop in the group and are audited. The dashboard reads fresh state after saving.
6. Pause/resume or moderate the whole event using the existing controls.

Published POAP artwork, badge metadata, supply and mint dates remain immutable. Listing edits do not rewrite already minted collectibles. Rejected requests cannot be resubmitted, although the superadmin may intentionally issue a direct mint. Existing QR and invited-link distribution still mint immediately under their existing authorization rules; rejecting a request does not revoke a separately issued recipient link or live QR authorization.

## Reliability changes

- Health now fails if the request schema is missing. Deployment applies remote D1 migrations before updating the Worker, preventing the original schema/code mismatch.
- All claim methods check the actual on-chain mint window, pauses and remaining supply. Relayer funding/key and event-specific mint permission are checked before creating an accepted mint job. Missing issuer permission produces an actionable error instead of an indefinitely queued mint.
- Database and contract checks prevent duplicate mints for the same event, role and wallet. Requests and approval outcomes are private to the wallet and superadmin; privileged actions remain server-authorized and audited.
- Batch selection accounts for on-chain supply consumed outside the local index. If batch gas simulation reverts, the queue falls back to one recipient so a rejecting receiver does not mark every recipient failed together. Temporary RPC failures retain the existing persisted nonce/receipt recovery behavior.
- Dashboard background refresh does not overwrite forms while the user is entering an address, CSV or event edits. Manual refresh intentionally reloads server state.
- Request-status failures do not block Gallery ownership reads. Custom video badges retain their media preview. The service-worker shell version was bumped so clients fetch the rebuilt app.

## Evidence

- `npm test`: **18 Solidity tests + 131 JavaScript tests passed**, zero failures.
- `npm run build`: passed. `git diff --check`: passed.
- `npm run test:workflow`: passed against a real Anvil EVM using chain ID 11155111. It deploys the actual compiled Kairo contract with temporary test wallets, drives the real API route handlers, signs and broadcasts through `connectChain`, mines receipts, and verifies contract ownership and Gallery metadata. D1 is represented by SQLite with foreign keys and all migrations; R2 uses an isolated in-memory fixture. It creates **five confirmed local test mints**, and **zero live Sepolia transactions**.
- That integration covers SIWE, independent custom/generated artwork, sponsored multi-role publication during an ongoing event, group-wide listing edits, private requests, rejection, acceptance, direct address minting, duplicate blocking, Gallery ownership/history, existing QR/link claims, and group pause/resume followed by another mint.
- Regression tests cover approval races, paused/expired/future/full events, invalid destinations, unauthorized callers, missing request schema, issuer failures, migration preservation, batch fallback and supply changes, Gallery status progression, and dashboard input preservation.
- Read-only real Sepolia verification confirmed deployed contract `0x90a2920272dd3852193A79DA621B1Ccc9D093714`, the fixed configured superadmin, matching funded relayer and approximately 5 Sepolia ETH. No admin private key was used or requested.
- `npm run smoke:local`: config, full dependency/schema health and discovery all returned HTTP 200. Authenticated checks of `/api/events/4/requests?mine=1` and `/api/my/requests` passed using a temporary real SIWE relayer session, then logged out. No requests, events or mints were created.
- Direct read-only checks of Sepolia event #4 confirmed its mint window is open, it is unpaused, supply is 0/50 minted, and the configured relayer is authorized and funded.
- Browser inspection of the rebuilt localhost ongoing-event page confirmed the actual event artwork, open mint window, role and request guidance.

## Deployment status and remaining live check

This is verified locally and against the actual contract bytecode on an isolated EVM. It is not a claim that a live superadmin mint has been completed. A live MetaMask-approved admin session was not available for that final action. No real event was used for test minting, and no existing token was changed.

The configured public Worker endpoints returned HTML rather than API JSON during the initial check; a public production deployment was not performed in this task. Before calling the hosted workflow ready:

1. Back up the hosted D1 database, check the intended `SITE_ORIGIN`, Worker route, R2 URL and existing runtime secrets.
2. Run `npm run deploy:app` when ready to deploy. It builds, applies `npm run db:remote`, then deploys Worker/assets. It does not redeploy the contract.
3. Verify the public `/api/health` is HTTP 200 JSON and the configured origin serves the matching frontend/API. Verify custom and generated artwork are publicly readable.
4. In MetaMask, sign in as the configured admin and complete one intended request acceptance/direct mint to a verified recipient during its mint window. Confirm receipt and Gallery ownership. Use a controlled test event if verification should not consume an existing event's supply.

Production here means the Sepolia-hosted application. Mainnet use is not implemented. Keep the relayer funded and the public RPC available; live chain finality and third-party service availability remain external dependencies.
