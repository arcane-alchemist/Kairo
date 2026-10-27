# Frontend rework audit — 2026-10-26

This is an initial audit and partial implementation against the received brief. The brief ends at “Mint window: minting start and minting”; referenced sections 5/6 and the rollout-gates document were not present in this checkout. No deployment or contract change was made. No paid service was added.

## Defects corrected

| Area | Defect | Correction |
| --- | --- | --- |
| Wallet | Header connected an address without completing sign-in; other pages ran separate connection flows. | Header performs account approval, network switch, and SIWE; other connection entries focus that control. |
| Wallet | Only MetaMask and Phantom announcements were recognized. | EIP-6963 providers are listed by their announced identity, with browser/Phantom fallbacks. Provider names are escaped. |
| Wallet | No last-wallet hint. | Only provider ID is persisted; no account, signature, or auth session is stored in localStorage. |
| Wallet | Reload discarded signed-in UI. | Restore identity with `/api/auth/me`; no extension request is made during restoration. |
| Wallet | Network changes discarded the connection. | Show a network mismatch banner and header switch action; handle unknown-chain setup through runtime config. |
| Wallet | Account changes discarded identity without reconciling it. | Clear old auth, require fresh SIWE for the changed account, and refresh shared UI. |
| Wallet | Menu lacked address copying and revocation. | Switch account, Copy address, Disconnect; request permission revocation when supported. |
| Session | Login issued a persistent ten-minute cookie. | Cookie is HttpOnly/SameSite and non-persistent; existing server-side ten-minute expiry is retained. |
| RSVP | Unauthenticated callers could register arbitrary typed/scanned destinations. | Backend requires auth and uses its wallet. A mismatched legacy wallet field is rejected; address input/scanning removed. |
| RSVP | Participants could choose elevated roles. | Role selection removed; backend rejects self-selected elevated roles. Current legacy RSVP only supports an event's Attendee role. |
| Navigation | Issuer/Collector names split overlapping purposes; phone had another Connect control. | Events, Gallery, Organize, The idea, Builders on both viewports; one header wallet control. |
| Builders | “Build with POAP” opened event publishing. | Legacy link now opens developer documentation. |
| Builders | Documentation described the old connection/typed-wallet behavior and omitted integration details. | Updated wallet/session/RSVP explanations, API methods, errors, runtime config, and actual v1 limitations. |
| Gallery | Main collection required typing an address instead of using the shared identity. | Gallery uses signed-in wallet. Public proof routes remain viewable separately. |
| Gallery | Flat token cards did not group roles under events. | Returned tokens are grouped by event; no extra tokens are fabricated. |
| Proof | Claim method missing; QR returned an invented Collector role. | Record verifier/static-QR/unknown provenance; use the recorded role. Presence requires check-in timestamp and actor. |
| Config | Frontend network switching, explorer links and categories used embedded values. | Read runtime API config. Wallet RPC is explicitly public; private issuer RPC is never exposed. |
| Artwork | Uploaded images/videos rendered as rectangles. | Circular image, SVG, video and editor preview silhouettes. |
| Dialogs | Unused demo dialogs duplicated production UI. | Removed demo dialogs and unbundled demo entry points/data/tests; keep the live dialog and cancellation handling. |
| Accessibility | Modal height and long codes could overflow narrow screens. | Constrain modal height, allow scrolling and code wrapping; retain focus styling and enforce reduced motion. Browser layout review is still outstanding. |

## Remaining requirements and dependencies

- Existing `contracts/Kairo.sol` and Worker implement one token per event/wallet. Per-role token identity, caps, artwork, organizer grants and additional claim modes depend on the separate v2/Worker rollout. No endpoints or successful responses were invented for them.
- Approved-organizer status/request handling is absent from `/api/auth/me` and current Worker interfaces. The current studio still supports the existing draft/admin-publication workflow; it does **not** yet enforce the requested approved-organizer creation policy.
- Organizer wizard, online/in-person location, college-event ID policy, per-role design and limits require the rest of the form brief and actual gated API schema. The current form is retained pending those interfaces.
- Gallery and The idea instructions from sections 5/6 were not supplied. Existing idea content and pill tabs are retained.
- Auth still expires after ten minutes on the server. Thus this pass does **not** satisfy authentication lasting the entire browser visit. Changing backend session lifetime belongs in the agreed session gate rather than silently removing expiry checks. Browser session restoration can also retain session cookies according to browser preferences.
- Legacy static QR remains explicitly labelled in docs/proofs. Rotating QR, secret-word and single-use-link claims are unavailable in this checkout.
- Some old design selectors remain in the shared stylesheet. Production demo JS/data/dialogs were removed; a broad stylesheet rewrite was avoided.
- Visual phone/desktop review and real extension approval/rejection/account-switch checks have not been performed in a browser during this pass. Automated tests use fixtures; they are not evidence of real extension or chain transactions.

## Verification

Focused tests cover provider discovery/rejection/revocation, cookie restoration without wallet prompts, SIWE ordering, shared identity across routes, grouped Gallery, RSVP trust boundaries, runtime config, dialog cancellation, output escaping and offline privacy. Validation completed:

- 81 JavaScript tests passed across frontend, Worker, and legacy backend; no failures or skips. A temporary copy of the same Linkedom version was used because iCloud placeholders stalled the installed test dependency.
- `npm run build` passed.
- Focused `git diff --check` passed.
- HTTP checks against `http://localhost:8787` passed for the served shell and runtime config. Unauthenticated RSVP and `/api/auth/me` returned 401; `/api/wallet-collection` without its required wallet returned 400, confirming the route exists.
- No production transactions, deployments, paid services, real-wallet extension checks, or browser visual checks were performed. Contract tests were not rerun because contracts were outside this change.
