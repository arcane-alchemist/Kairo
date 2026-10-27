# Local verification — 26 October 2026

Production deployment is deferred at the user’s request. No production deployment or public-chain transaction was performed after that instruction. The following results are from an isolated local Worker, local D1/R2/Durable Object storage, and an Anvil EVM running the compiled Kairo contract.

## Changes

- Wallet connections begin with an explicit MetaMask/Phantom choice. EIP-6963 discovery and Phantom’s own EVM namespace avoid relying on whichever extension controls `window.ethereum`. MetaMask requests account permissions; Phantom uses its documented `eth_requestAccounts` method. Rejection and account changes clear the application connection. The extension-level `Cannot redefine property: ethereum` error cannot be repaired by rewriting or suppressing the extension from the website.
- Each close button closes its containing dialog. Cancelling wallet selection releases the busy button. A pending ticket response cannot reopen a closed dialog.
- Organiser addresses can be typed and are preserved during authentication and saving. The backend checks valid non-zero Ethereum addresses, retains the signed-in account as the private draft owner, and checks that the on-chain event manager matches the selected organiser before publication. Typing an address does not grant publishing or staff access.
- Dynamic text and IDs are escaped before insertion into HTML. Artwork URLs permit HTTPS or the same-origin media path, including local HTTP media, and reject active schemes, credentials, traversal and control characters. CSP blocks inline scripts/event attributes, embedding and base-URL replacement; SVG files are sandboxed and served with `nosniff`. These are targeted XSS protections and regression checks, not a certification that every possible attack is excluded.
- Uploaded/existing artwork rotates gently in place in the website. New description-generated SVGs include declarative animation and respect reduced-motion settings. Existing immutable artwork and metadata are not rewritten. Videos retain playback controls.
- About text was rewritten with the official POAP protocol page as a reference. It remains original Kairo copy and accurately describes its own soulbound contract.
- QR claim screens clear gallery callbacks when replacing the search fields. Successful refreshes clear stale connection errors. Unreadable responses show a user-facing retry message.
- Local testing exposed media URLs losing their port because of the development upstream override. `npm run dev` now retains Wrangler’s request origin instead.

## Automated checks

`npm test`: **9 Solidity and 84 JavaScript tests passed**. `npm run build` and `git diff --check` passed. The tests include both wallet adapters, connection rejection/cancellation, cross buttons, late responses, hostile event text/IDs/URLs, selected organiser persistence, publication permissions, SVG output and security headers.

## Actual local integration

Local website: http://127.0.0.1:8891/. Local RPC: http://127.0.0.1:8546/. The local EVM uses the chain ID from `/api/config` for compatibility with the application; it is separate from public Sepolia. Contract: the contract from `/api/config`.

- Signed challenges and session cookies were exercised using local development accounts; contract-based admin checks passed.
- Description-generated animated SVGs were saved to local R2 and fetched back with their SVG sandbox policy.
- PNG upload bytes were read back unchanged. Active SVG uploads and cross-origin writes were rejected. Hostile artwork text remained escaped text.
- A draft saved by one account retained a different selected organiser. Other accounts could not edit the draft or publish it. The admin created the actual contract event, and the API persisted its matching publication.
- An RSVP enforced permanent consent and duplicate prevention. Only the selected event staff could check in the attendee, and a mismatched student ID was rejected.
- The Durable Object signed and broadcast the sponsored mint to the local EVM. The API confirmed the receipt after two confirmations; ownership, the locked-token flag and the contract-backed collection were checked.
- A second event exercised public QR claims. Missing consent was rejected; repeated claims returned the same ticket. The resulting second token appeared in the collection and was not counted as physically verified attendance.

Local fixtures created two events and two tokens. They exist only in the isolated local chain and local storage. Temporary verification configuration, development keys and request journals are under `/tmp/kairo-local-verification/`; production configuration and secrets were not replaced.

## Remaining browser boundary

Browser access to `http://127.0.0.1:8891` was declined by the browser approval gate. No alternate host, port or browser automation was used to bypass that decision. Local visual/viewport checks and actual MetaMask/Phantom popup approval therefore remain pending access. Dialog and wallet logic passed DOM/adapter tests; those tests do not substitute for browser approval and rendering.
