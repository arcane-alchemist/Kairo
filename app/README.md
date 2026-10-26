# Kairo Android

The Android app renders the production [Kairo website](https://kairo-site-7fb.pages.dev) inside a native Expo WebView. It shares the website’s actual lavender, ink, cream and lime palette, typography, animated artwork, responsive layouts, and backend. There is no separate imitation interface or simulated data source. Website deployments update the interface without requiring another APK.

## Real workflows

Explore events, register and retrieve tickets, view confirmed collections, authenticate a wallet, and use the organiser studio and administrator tools through the same production APIs. Organisers can upload supported images/videos or generate SVG artwork from an event description, save a draft and submit it for review. Generated SVG artwork is procedural artwork, not a claim of AI image generation. Issuer permissions and staff attendance checks remain enforced by the backend and contract.

Wallet connection starts only after the user taps Connect. The official MetaMask Connect SDK relays requests to MetaMask Mobile, where the user approves accounts, signatures and transactions. Install MetaMask Mobile and use Sepolia. Private keys stay in MetaMask; app credentials and issuer secrets are never embedded. Browser extensions continue using the website’s injected MetaMask flow.

The native shell handles Android safe areas, portrait/landscape resizing, keyboard resizing, back navigation, trusted deep links, and QR PNG sharing through Android’s share sheet. Media uploads use Android’s file chooser. Camera access is requested by Android when a camera workflow needs it. Storage-library, microphone and overlay permissions are blocked. External HTTPS links open in the system browser. Native messages validate their origin, action, file size and filename.

An internet connection is required. A failed page load displays a themed retry screen. The app does not simulate a backend response when disconnected. Backend: https://kairo.aakritigupta7227.workers.dev. The fixed website origin is in `src/shell.ts`; the website proxies API requests to the Worker using its deployed configuration.

## Development

Use Node 24 or newer:

```sh
cd app
npm ci
npm start
```

Use a compatible Expo development client for native testing; `npm run android` requires a local Android SDK and emulator/device. The generated `android/` directory is ignored and must not be edited manually. Configuration belongs in `app.json` and `plugins/`.

```sh
npm test
npm run check
npm run lint
npm run typecheck
npm run export
npx expo-doctor
```

`export` compiles the Android JavaScript bundle. It does not produce an installable APK or verify native hardware integrations.

## Signed APK and Play Store bundle

```sh
npx eas-cli@latest login
npm run build:apk
```

The preview EAS profile produces a signed, installable APK. On the first build, link/create the Expo project and generate its Android signing credentials in your account. `npm run build:aab` produces a production Android App Bundle; store submission is separate. No Expo project ID, account credential or signing key is fabricated in this repository.

Build status: Android export, unit tests, lint and typecheck can run locally. An installable APK has not yet been built because EAS is signed out and this workstation has no Android SDK. Physical-device verification of MetaMask approval/return, camera, file/video upload, QR sharing, keyboard and rotation remains required before release.

## Release checks

Verify denied and approved wallet permissions, account changes, signature rejection, real organiser upload/generation and review, ticket registration/check-in/mint/collection, QR sharing, external links and Android back. Test small phones, landscape, tablets, system font scaling, cutouts and keyboard-visible forms on real Android hardware. A real mint requires an authorised issuer and a real transaction; unit tests do not establish that it happened.

Compatible dependency audit fixes were applied. Remaining upstream advisories include Expo CLI signing/parser tooling, Expo Router transitive URL parsing, and the web wallet SDK’s UUID dependency. Do not force an incompatible Expo downgrade to suppress the audit. Recheck patched upstream releases before store publication.
