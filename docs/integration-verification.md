# Kairo live verification — 26 October 2026

The connected entry point is `frontend/app.js`; the standalone preview modules
are not bundled into production.

## Deployed

- Worker version: `883c4643-ed70-40df-b751-bbe5bf683a67`.
- Pages deployment: `57392931.kairo-site-7fb.pages.dev`.
- Production website: https://kairo-site-7fb.pages.dev/.
- Remote migrations through `0007_organizer_studio.sql` applied successfully.
- Existing contract, issuer configuration and runtime secrets preserved.

## Checks

| Boundary | Evidence |
| --- | --- |
| Automated checks | 9 Solidity tests and 67 JavaScript tests passed |
| Production build and whitespace | Passed |
| Cold page load | Connect MetaMask stays visible; no account is restored or requested |
| MetaMask connection | EIP-6963 discovery; explicit account-permission request before account access; rejected and late approvals covered by tests |
| Wallet changes | Clear the connection and session instead of adopting the new address |
| Exclusive navigation | Chrome verified opening Issuer closes About; subsection links close the menu |
| About and documentation | Separate About subsections, seven documentation chapters, working chapter links |
| Responsive layout | Browser checks at 320, 768, 1280 and 1920 px; phone header overflow fixed |
| Doodle motion | Visible doodles report running animations; global Pause motion reports all paused |
| Real signed authentication | Passed against the deployed backend using a disposable wallet |
| Private organiser API | Signed-in workspace returns its own drafts; unauthenticated requests return 401 |
| Admin review API | Non-admin signed wallet returns 403 |
| Description-based generation | Real SVG and frozen JSON stored in R2 and served successfully |
| Video upload through Pages | Actual 1,128,375-byte MP4 stored and read back with matching SHA-256 |
| Video metadata | `animation_url` and generated poster match stored media |
| Browser video decoding | 960 × 540, 5.055 seconds, readyState 4, no media error |
| Collection API | HTTP 200, real contract-backed response; existing minted token previously verified in live UI |
| Draft → submit → admin publication | SQLite-backed handler tests cover ownership, metadata, schedule validation, admin restriction, atomic publication and immutable published drafts |

The video verification used MDN's public CC0 flower clip. It created hosted media
and metadata only; it did not publish a gallery event or mint a token.

## Remaining boundary

New on-chain publication still requires the college admin's MetaMask confirmation,
as enforced by the existing contract. No new event transaction or attendee mint
was submitted during this update. Uploaded media depends on continued R2/domain
availability. The description-based design generator is procedural SVG generation,
not an external AI image service.


## Android parity update — 26 October 2026

The Expo Android project now hosts the same production interface in a trusted-origin WebView. Native integrations provide MetaMask Mobile handoff, validated PNG sharing, safe areas, resize-on-keyboard, unrestricted orientation, deep-link routing and Android back handling. Production connects to the actual Worker; there is no simulated provider or backend fallback in the release path.

- Shared Worker deployed as `f738d30a-ce51-4928-ba2a-f95e01f4f8ca`; Pages deployment `a38d36c5.kairo-site-7fb.pages.dev` (supersedes the versions above).
- Live `/api/config` and `/api/wallet-collection` returned HTTP 200 through the Pages proxy; collection returned the queried wallet’s real empty result, not a fabricated token.
- Android lint, strict TypeScript, eight app unit tests and Android Hermes export passed. Final root checks passed nine Solidity and 72 JavaScript tests (89 tests including the app).
- Expo dependency compatibility passed and Expo doctor passed 21/21 checks after a transient DNS failure.
- Generated manifest checked: MetaMask package visibility, CAMERA/INTERNET permissions, no microphone, media-library or overlay permission, single-task deep-link activity, unspecified orientation and keyboard resize.
- Chrome layout checks passed About, documentation, organiser entry and collection at 320×568, 360×640, 393×852, 844×390 and 768×1024. A contract-address min-content overflow in documentation was found and fixed. These checks cover the rendered shared interface, not Android device rendering.
- Signed APK build is pending Expo account login. There is no Android SDK on this workstation. Native wallet return, camera, photo/video chooser, sharing, keyboard and rotation require the resulting APK on Android hardware. No real mint transaction was performed during this Android update.
