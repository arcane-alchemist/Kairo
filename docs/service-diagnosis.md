# Local service diagnosis — 2026-10-27

## Reproduced failures

1. `GET /api/config` and `GET /api/events` returned 200, while `GET /api/wallet-collection?wallet=<issuer from live config>&cursor=1` returned 503 with `{"error":"Service unavailable. Please try again shortly"}`. The Worker was running. This was an answered HTTP request, not a browser transport failure.
2. Adding secret-redacted diagnostics revealed the actual Worker error: `Network connection lost.` Request ID: `32157c70-7ade-4d02-a185-a7db413713e8`. `.dev.vars` and `.env` were absent. `connectChain` constructed Ethers with an undefined RPC URL; the installed Ethers implementation defaults that to an unrelated localhost RPC. The configured public RPC was reachable and returned the expected test network. Using it explicitly restored the same collection request to 200 with an actual on-chain balance of zero.
3. Starting `npm run dev` as documented failed before Wrangler could start: `Unexpected end of file in JSON`, at `node_modules/@scure/base/lib/esm/package.json`. macOS showed that file as `compressed,dataless` (iCloud offloaded), despite a nonzero recorded size. Around 9,865 installed dependency files were offloaded. Restoring dependencies with `npm ci` from the valid existing lockfile fixed startup. Solidity sources also needed downloading before Foundry could read them. No dependency versions were changed.

A historical browser `Failed to fetch` was not independently reproduced against the initially running local Worker. It means no usable HTTP response reached the client; the observed startup failure explains how a fresh server can be absent. Separately, the production origin configured for normal APK builds returned DNS `ENOTFOUND` during this check. Do not treat that transport failure as an HTTP 503.

Browser console capture also showed `Cannot redefine property: ethereum` originating in the Phantom extension. The site continued to render and issue API requests. The application does not redefine that property. Native Chrome DevTools access was not approved, so the Network panel was not inspected; request status evidence came from direct HTTP calls and Wrangler logs.

## Ordered environment checks

| Check | Evidence/result |
| --- | --- |
| Wrangler startup | Existing process was listening on 8787. Fresh README startup initially failed at dependency JSON parsing; after reinstall, build and startup succeeded. |
| Version/date | Wrangler 4.149.0 accepted the configured compatibility date without a date mismatch warning. |
| Local values | `.dev.vars` initially absent: no private RPC, hashing secret or issuer key. Public deployment settings were present. Public RPC is now an explicit fallback; local origin and a fresh hashing secret were created in an ignored mode-600 file after confirming the local database had zero events and registrations. The issuer key is still absent. |
| D1 | All seven existing migrations applied; Wrangler reported “No migrations to apply!”. Actual queries succeeded. No schema changes made. |
| R2 / Durable Object | Existing bindings and SQLite class migration present. Health probes succeeded. DO health reads storage without scheduling an alarm or mint. |
| Routes / port | Custom routes are empty. An old dev process occupied 8787 initially; one fresh README-started process now serves that port. No automatic alternate port used. |
| Contract / ABI | Configured deployment has bytecode. An actual RPC call decoded the existing event getter into its six expected fields. No contract or ABI migration was performed. |
| RPC | Configured free public RPC answered real network, bytecode and event reads. Missing private RPC no longer silently selects localhost. |
| Browser API base | Frontend requests are same-origin `/api/...`, with no embedded deployment host. |
| Origin | A write from a mismatched loopback origin was rejected with JSON 403/FORBIDDEN. Same-origin requests work. Local SIWE uses the actual local origin including port. No CORS relaxation added. |
| Rate limit | Actual local D1 counters had a maximum of 3 requests per bucket against the existing limit of 20; this was not the reproduced failure. |
| Cache | Previous version cached only successful public responses; no evidence it caused the reproduced RPC failure. Cache version, immediate activation, update prompt and GET recovery now tested. Private collections remain excluded. |
| Shipped endpoints | `/api/collection` remains supported and has a compatibility test. The unused old native API/model modules were removed; the shipped WebView uses the website client. |

## APK conclusion

The APK did not cause the local website's reproduced 503. The same failure occurred with no ADB device attached and no emulator process running. The missing configuration was already documented in commit `0f63a20`, before the inspected APK was built; `serverless/chain.js` had no intervening APK-related change before this fix. App changes affected client routing and the USB target, not D1 schema or the contract ABI.

Inspection of the existing APK's embedded Android bundle confirmed its USB origin was `http://127.0.0.1:8891`; there was no listener on that port. Normal production builds used the configured hosted origin, whose DNS now fails. Thus those app builds have their own reachability problems, independent of the server-side collection failure. The current source reads the public origin from build configuration; the USB profile targets the current dev port. Existing installed binaries are not changed by source edits. No APK was rebuilt or tested on a phone.

Local D1 state and the deployed Worker database are separate. The normal hosted app cannot directly reach this local D1. The old USB APK targeted another local dev setup, not the Worker on 8787.

## Corrections and verification

- Explicit free public RPC fallback with a timeout and network guard; configuration validation instead of an accidental SDK default.
- Structured JSON error codes, request IDs and redacted server diagnostics, including awaited asset failures and an outer fetch guard.
- `/api/health` checks config, RPC/deployed contract, D1 schema, R2 and DO storage with bounded probes.
- GET-only retry/backoff and request timeouts; distinct transport/server/wallet messages and Retry actions. Partial or malformed collections remain errors, never empty galleries.
- Versioned service-worker cache, no HTTP error caching, prompt activation and a visitor refresh prompt. Actual update prompt and refresh were observed in Chrome.
- Approved guide and Builders copy with seven numbered sections each; removed visible contract values/internal rollout notes. Runtime network labels and explorer links come from config.
- Browser layout checks at 1440px and 360px had no horizontal overflow. Screenshots: `/tmp/kairo-diagnosis/builders-desktop.jpg` and `/tmp/kairo-diagnosis/guide-phone.jpg`. The actively edited event tab was left open and temporary viewport overrides were reset.
- Build passed; Foundry's 9 tests passed; backend/frontend and smoke/error-path tests passed; mobile tests, lint and type-check passed. Final results: `npm test` passed 9 Solidity plus 94 JavaScript tests; the mobile suite passed 8 tests, lint and type-check. Build and diff whitespace checks passed. An additional unscoped `node --test` run traversed the vendored OpenZeppelin JavaScript/Hardhat suite and failed because its separate Hardhat dependency is not installed. The existing project test command intentionally targets project suites; vendor files and dependencies were not changed.

## Remaining blocker

`npm run smoke:local` checks all three endpoints. Config and events pass. Health honestly returns 503/NOT_CONFIGURED because the dedicated issuer private key is missing. RPC, D1, R2 and DO are healthy. Restore the existing dedicated testnet issuer key locally in `.dev.vars`, matching the configured issuer address, then reload the dev configuration and rerun the smoke command. Do not paste keys into chat or commit them. No replacement issuer key, funding transaction, permission change, production deployment or paid service was created.

Real-device APK behavior, Phantom signing on the test network, and the original historical browser transport failure remain not verified. The hosted origin remains unavailable; it was not redeployed. Existing server-side session lifetime and wider rollout behavior were left unchanged.
