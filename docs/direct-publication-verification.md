# Kairo — historical publication verification

Superseded deployment status: the compatible contract has since been deployed. See [POAP workflow verification](poap-workflow-verification.md) for the current contract, migration and end-to-end results. The findings below describe the earlier implementation work.

Changes remain on `main`, uncommitted. No push, production website deployment, remote D1 migration, contract deployment or Sepolia transaction was performed.

## Fixed in the dashboard / hosting follow-up

- Replaced the raw health paragraph with a styled admin overview, relayer balance/address, clear setup tasks, expandable service details and a readable activity timeline. Removed empty moderation sections and inactive pagination. Pagination now checks one extra row, so a full last page does not advertise an empty next page.
- Added usable event cards and empty states, grouped role badges, direct links into event management, and styled controls. The signed-out studio was inspected in the real browser. Admin markup and behavior are covered by DOM regression tests; a fresh manual admin session still requires MetaMask approval.
- Removed the localhost publication prohibition when a configured public media store is available. Local uploads now go to the real R2 bucket using its remote binding. `MEDIA_BASE_URL` in the ignored `.dev.vars` points to the enabled public bucket URL; public metadata is fetched and compared with the stored content before publication is queued.
- Public artwork URL: `https://pub-51a8922866864bbd9a42197f6ab9a222.r2.dev/`. Only the artwork bucket was made public. Emails and sessions stay in D1. Production config uses the Worker's `/media/` route after the user deploys the website.
- Configured the user-funded `0x8C60aF4B93d1e4c14C473F5B9Ffc488cfa2c4E7C` relayer. Read-only Sepolia checks confirm **5.0 ETH** and its matching key already saved in `.dev.vars`. No wallet or key was generated or disclosed. The optional terminal deployment command can explicitly reuse this wallet without the missing separate deployer key.
- Added a separate `#admin/login` MetaMask panel and protected `/api/admin/events` listing. Organizer studio now stays wallet-scoped even for the admin.
- Restored the missing local Hacktober listing after checking the real immutable contract record and existing R2 assets. Legacy artwork URLs display through the current public R2 host without changing frozen metadata or on-chain URIs. Actual Gallery API confirms Hacktober token **#4** owned by the configured admin; its image returns HTTP 200 (1,261,981 bytes). The cancelled, paused extra drop was not restored.
- Health separates Sepolia connectivity, deployed contract compatibility and relayer readiness. Expected setup failures no longer produce misleading RPC-outage messages or stack-trace noise. The dashboard does not pretend that missing setup is healthy.
- A known setup failure leaves the event form retryable. An uncertain network response exposes Resume immediately and reuses its publication ID. Stalled MetaMask permission requests time out without approving or selecting an account silently.

## Public metadata fetch correction

The publishing check used `fetch(..., {redirect:'error'})`, which the actual Cloudflare Worker runtime rejects with a TypeError before making a request. Changed it to `redirect:'manual'`; non-2xx responses, including redirects, still fail validation. Reproduced the original error and confirmed HTTP 200 for the real Hacktober metadata after the change in the local Worker runtime. Regression assertions cover the supported fetch mode and rejection of redirects. The earlier Node-based public hosting check did not catch this runtime difference.

## Organizer distribution follow-up

- Successful publication now opens the event dashboard directly, where the organizer can display the rotating Walk-in QR or create single-use recipient links. QR controls explain the window and disable outside it, while paused/unlisted, or when supply is exhausted.
- Claim reservations, failed-mint retries and dashboard supply now account for real on-chain mints that are absent from local history. Regression tests cover QR and link admission at the last available place, failed-mint retries, and the organizer QR/link/CSV/mail controls.
- The actual `verifyPublicMetadata` helper was bundled and run in the real local Worker runtime against existing public Hacktober metadata: passed. Real local SIWE and generated-badge upload/public reads also passed; temporary assets were deleted. No test event or token was created.
- Current local health confirms all dependencies except `contract` pass. The full read-only role-history verifier hit an RPC `UNKNOWN_ERROR` on this run; the local RPC/gallery checks succeeded afterward. Updated-contract publication and minting still need the owner's deployment.

## Passing checks

- `npm test`: **18 contract tests and 116 JavaScript tests passed**, zero failures.
- `npm run build` and `git diff --check`: passed.
- Local migrations 0009 and 0010: applied; existing issued jobs/history preserved.
- `npm run verify:media`: uploaded, publicly fetched and deleted a temporary object in the real R2 bucket — passed.
- `npm run verify:local`: real wallet-bound SIWE, authenticated organizer workspace, badge generation/upload through localhost, public metadata and public SVG image — passed. It created **zero events and zero NFTs**. Temporary sessions and artwork were cleaned up, including the artifacts from the earlier failed hosting check.
- Local config/discovery HTTP checks return 200. Local browser inspection showed the rebuilt studio, correct signed-out state, and no useless pagination.
- Earlier read-only Sepolia audit confirmed that `0x4CB1E99035D2812472B2d50DBB590E9C593188bE` is the only current default admin of `0x999524Cb77Db83864DA6FAC42614387921933922`.

## What still requires deployment

One updated contract must be deployed: `contracts/Kairo.sol:Kairo`. See [Sepolia setup](sepolia-setup.md) for its exact constructor arguments, key files and prepared deployment command. The existing contract lacks the new immutable-admin, sponsored-publication and batch methods. The funded relayer key already matches.

The readiness endpoint therefore correctly remains 503 for `CONTRACT_MISMATCH` only; all other dependencies, including gas sponsorship and media, pass. Actual publishing, minting, moderation transactions and replacement-contract archive reads have not been exercised on the updated Sepolia deployment. No simulation or substitute blockchain is served to make these checks appear successful.

Contract preparation: 18 Solidity tests now cover role-count limits, atomic role publication and group moderation, 20-mint batches with rollback, organizer permission isolation, and frozen artwork/cap/window after moderation. Compiled contract runtime is 9,069 bytes, below the 24,576-byte deployment limit; every app ABI function/event matches the compiled artifact. No deployment, branch change or commit was performed.
