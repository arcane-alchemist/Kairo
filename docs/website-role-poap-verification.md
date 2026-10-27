# Website and role POAP verification — 27 October 2026

## Changes

- Discovery has a search icon and search field, category selection, and separate live, upcoming and past sections.
- Gallery displays linked badge artwork without search/year/role/organization/sort controls. Linked role drops group under one event; profile event counts deduplicate their group.
- Organizer studio puts Create an event first, on the left. Attendance desk, organizer guide, event editor and About examples have explicit return links. Draft editors have their own URLs so returning to the studio works.
- About replaces The idea. Builders now explains creating campus experiences, role designs, publication, attendance and collection.
- The editor has one custom upload/generation slot per role, up to eight. Saving never implicitly generates artwork. Each role has independently frozen metadata and an optional video. Story changes require explicit regeneration for generated designs.
- The existing contract has one immutable URI per drop. Publication therefore creates one linked on-chain drop per role, with one admin transaction per role. Each role drop has the configured capacity. Partial publication is resumable and already published roles are skipped. Partially published drafts cannot be edited. Older drafts without role-specific metadata must be regenerated or uploaded again and resubmitted.
- Staff still verify identity, requested role and presence. Registering for a role is a request, not proof of that role. Open QR claims remain unverified participation.
- Pages now proxies content-addressed media as well as API requests. Unreachable backends and non-JSON upstream outages become structured 503 responses. Informational pages and collection navigation stay available during an event-directory failure. Config and session initialization can succeed independently of the event directory.
- Local development is configured for port 8787. Service worker cache version was increased.

## Verification

`npm test`: all 105 JavaScript tests and 9 Solidity tests pass. Includes backend integration, authentication, check-in/mint queue, metadata validation, per-role generation/uploads, linked publication and interruption recovery, discovery grouping, gallery controls, navigation, Pages proxy outages and media forwarding.

`npm run build` and `git diff --check` pass.

Chrome verified the real local discovery screen and return navigation from attendance desk, organizer guide and About examples. The local database is empty; no fixture events were inserted into it. Test transactions use stubs; no real blockchain event was created.

Local `/api/config` and `/api/events` respond successfully on `http://localhost:8787`. After applying migration 0008, `/api/health` confirms D1, R2, the mint coordinator and RPC are reachable. Health remains degraded because the local issuer key is missing or does not match the configured issuer address. Set the correct `ISSUER_PRIVATE_KEY` in `.dev.vars` privately, then restart the Worker and rerun `npm run smoke:local`.

The configured hosted Worker returned HTTP 404 with `error code: 1042` during this check. The configured Pages hostname could not be resolved from the terminal. These observations do not identify a Cloudflare account/deployment root cause; hosted service restoration has not been verified.

## Deployment requirements

Apply `serverless/migrations/0008_role_drops.sql` to the remote D1 database before deploying the Worker and Pages frontend together. The migration is additive and has already been applied locally. Configure the correct funded issuer key on the deployed Worker and verify its actual URL matches the Pages proxy. No production migration, deployment, or live mint was performed in this task.

## Create editor and default-wallet follow-up

Navigation now labels the organizer workspace Create. Clicking Connect wallet uses the browser-injected Ethereum provider, then a detected provider if the browser exposes no default. Kairo no longer displays a wallet chooser; the wallet still controls account access and signature approval. A declined request never silently switches to another wallet.

The organizer wallet field starts blank and is required. Signing in no longer fills it automatically. The eligibility field and shared capacity input have been removed from the editor. Each role has its own approximate drop count (1–10,000), saved with its artwork and enforced as that role drop’s on-chain supply. Legacy draft quantities fall back to their saved capacity. Different role counts are validated by the backend against the actual on-chain drop before publication.

The admin action now reads Publish event; the former nested quoted string incorrectly displayed a template expression. Local publication is disabled with an inline explanation instead of a popup failure. Local drafts and submissions remain available. Permanent on-chain metadata still requires public HTTPS artwork hosting, so the localhost restriction is retained. Publication is still authorized by the existing college-admin contract permission.

Follow-up verification: all 109 JavaScript tests and 9 Solidity tests pass; build and diff whitespace checks pass. Chrome verified the Create label, absence of eligibility, empty required organizer address, and independent role quantities of 40 and 12. Production preflight still fails on the issuer configuration. No deployment or live blockchain publication/minting was performed.
