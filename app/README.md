# Kairo Home mobile app

Standalone Expo / React Native Android and iOS app. All mobile source, dependencies, tests, configuration and build output are in this folder. The existing Cloudflare Worker supplies the real backend; no private keys are included in the mobile bundle.

## Run on your phone

```sh
cd app
npm ci
npm start
```

Scan the development QR with a compatible Expo Go version. Both phone and laptop must be on the same network. Alternatively use `npm run android` with an Android emulator, or `npm run ios` with an installed iOS simulator. Native camera and wallet flows require a physical device or native emulator; the Android JS export is not an APK.

## Build an installable Android APK

```sh
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

EAS requires your Expo account and may have build limits. `production` builds an Android App Bundle for later Play Store submission. No app-store submission or EAS build has been performed automatically.

## Connected features

- Address-only onboarding; no account custody or private key entry.
- Real confirmed Kairo collections, original uploaded artwork, drop and NFT IDs, Sepolia transaction links.
- Explore and search drops; browse collectors; device-local favorites and following.
- Drop detail with event, RSVP and minting dates; real RSVP submission and explicit permanent-NFT consent.
- Native camera scans wallet, Drop ID, and ticket QR codes. Input validation prevents arbitrary QR links from opening.
- Dispenser imports a real Drop ID and shares its registration QR. QR possession does not grant mint permission.
- Native encrypted ticket storage, live polling, real mint status notifications when the app refreshes and permission is enabled.
- Settings: address copy/QR, nickname, account change/logout, FAQ, Sepolia network.
- Capsule moments with captions and optional photos, explicitly saved on-device; share captions with the OS share sheet.
- Organizer wallet authentication/check-in opens the working site in MetaMask's browser. Address-only viewing never grants organizer authority.

## Boundaries

This uses a POAP-inspired visual layout with Kairo branding. It is not affiliated with POAP. There is no mock event list or simulated mint. The backend collection endpoint covers confirmed app registrations, not a full chain index. Favorites, follows, nickname and moments are local and do not sync between phones. Email custody, ENS resolution, remote/background push delivery, public social tagging, NFC/location/secret-word claims and other networks are not implemented; the app does not display fake counters or pretend they work. Real attendance must still be checked by staff.

The API defaults to `https://kairo.aakritigupta7227.workers.dev`; change `EXPO_PUBLIC_API_URL` only to a trusted HTTPS Kairo backend. Never put secrets in EXPO_PUBLIC variables. Web preview is not the target: native HTTP can set the API's required Origin header; browser cross-origin requests cannot. Use the separately deployed website for browser usage.

## Verification

```sh
npm test
npm run check
npm run export
```

These validate QR parsing, real-data search/status behavior, Expo module versions, and Android bundle compilation. They do not substitute for on-device camera, MetaMask, image-picker, notification, or store-release QA.

Dependency audit: Expo SDK 57's transitive toolchain currently reports 22 advisories (15 high, 7 moderate), including Metro glob parsing, node-forge, and xcode's uuid dependency. Compatible npm audit fixes were applied; npm's forced recommendation downgrades Expo incompatibly and was not applied. Review updated SDK/toolchain patches before store release.
