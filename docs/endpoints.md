# Kairo endpoint reference

Local base URL: `http://localhost:8787`. Hash routes are browser pages. `/api/` routes are JSON APIs. Replace `{eventId}`, `{requestId}`, `{claimId}`, `{linkId}` and `{publicationId}` with actual IDs. An event ID identifies one role drop; grouped role drops share an event group.

A signed-in superadmin is recognized from the server session automatically: a persistent **Superadmin profile → Events & requests** shortcut appears. The main Create destination opens the admin workspace for that wallet. After publication confirms, superadmin-created events open `/#admin/events/{eventId}` automatically, with POAP request review first. Event cards show pending request counts; **Refresh requests** reloads them. Ordinary organizers retain their own event workspace.

## Browser pages

| URL path | What it does | Access |
| --- | --- | --- |
| `/#` | Homepage and event discovery | Public |
| `/#events` | Search/browse events | Public |
| `/#create` | Create an event; upload custom artwork or generate badges; resume or clear the saved publication draft | Wallet sign-in required to upload/publish |
| `/#organize` or `/#issuer/studio` | Organizer's event/publication dashboard | Signed-in organizer |
| `/#issuer/manage/{eventId}` | Manage the organizer's event role: QR, recipient links, transactions and failed mint retries | Event organizer or superadmin |
| `/#drop/{eventId}` | Event details, badge preview and POAP request form/status | Public details; signed-in wallet for requests |
| `/#gallery` | Connected wallet's POAPs and private request statuses | Signed-in wallet |
| `/#collection/{wallet}` | Look up a public wallet collection | Public |
| `/#profile/{wallet}` | Participation profile for a public wallet | Public |
| `/#badge/{tokenId}/{wallet}` | Badge details and ownership/transaction information | Public |
| `/#redeem/{token}` | Preview and claim a single-use recipient link | Link holder; sign-in required to mint |
| `/#claim/{claimId}/{eventId}` | Follow a queued mint through confirmation | Claim wallet, event organizer or superadmin |
| `/#admin/login` | Sign in with the configured global superadmin wallet | Configured wallet only |
| `/#admin` | All-event admin dashboard, system health and audit activity | Superadmin |
| `/#admin/events/{eventId}` | Review POAP requests, directly mint by address, edit event details and moderate the event | Superadmin |
| `/#issuer/guide` | Organizer workflow guide | Public |
| `/#builders/documentation` | Developer documentation | Public |
| `/#about/proof` | About Kairo | Public |

## Public configuration, discovery and artwork

| Method | Endpoint | What it does | Access |
| --- | --- | --- | --- |
| GET | `/api/config` | Network, contract addresses, categories and public configuration | Public |
| GET | `/api/health` | Database/schema, storage, queue, RPC, contract and relayer readiness; 503 when degraded | Public |
| GET | `/api/events` | Listed event roles | Public |
| GET | `/api/events/{eventId}` | One listed event role's details | Public |
| POST | `/api/artwork` | Upload validated custom artwork/video or generate a descriptive SVG; store artwork and immutable badge metadata | Signed-in wallet |
| GET | `/media/{art\|video\|metadata}/{contentHash}.{extension}` | Public content-addressed artwork, video or badge metadata from R2 | Public |

## Wallet sign-in

| Method | Endpoint | What it does |
| --- | --- | --- |
| POST | `/api/auth/challenge` | Generate a SIWE challenge for `{wallet}` |
| POST | `/api/auth/verify` | Verify `{id, signature}` and establish the wallet session cookie |
| GET | `/api/auth/me` | Return the signed-in wallet and whether it is the configured superadmin |
| POST | `/api/auth/logout` | Delete the session and clear its cookie |

## Event publishing and management

| Method | Endpoint | What it does | Access |
| --- | --- | --- | --- |
| GET | `/api/organizer/events?page=0` | List this wallet's events and recent publications | Signed-in wallet; own events only |
| POST | `/api/organizer/events` | Queue/resume an event publication using its stable UUID and frozen role artwork | Signed-in wallet |
| GET | `/api/publications/{publicationId}` | Read publication state, transaction, errors and created role IDs | Publication owner or superadmin |
| GET | `/api/events/{eventId}/dashboard` | Counts, latest listing state, actual mint window, pause state and remaining supply | Event organizer or superadmin |
| GET | `/api/events/{eventId}/transactions?page=0` | Paginated mint transactions and statuses | Event organizer or superadmin |
| GET | `/api/events/{eventId}/export` | Download mint transactions as CSV | Event organizer or superadmin |

## POAP requests and superadmin actions

| Method | Endpoint | What it does | Access |
| --- | --- | --- | --- |
| POST | `/api/events/{eventId}/requests` | Submit a POAP request for the signed-in wallet; body `{permanentConsent:true}` | Signed-in wallet |
| GET | `/api/events/{eventId}/requests?page=0` | List requests: superadmin sees all addresses for this role; other wallets see only their own | Signed-in wallet |
| GET | `/api/events/{eventId}/requests?mine=1` | List only the signed-in wallet's request, including when that wallet is superadmin | Signed-in wallet |
| GET | `/api/my/requests?page=0` | Private cross-event request list with review/mint status | Signed-in wallet; own requests only |
| POST | `/api/admin/events/{eventId}/requests/{requestId}/accept` | Accept one pending request and queue a mint to its wallet; body `{}` | Superadmin |
| POST | `/api/admin/events/{eventId}/requests/{requestId}/reject` | Reject one pending request without minting; body `{}` | Superadmin |
| POST | `/api/admin/events/{eventId}/mint` | Directly queue a mint to `{wallet:"0x…"}` | Superadmin |
| GET | `/api/admin/events?page=0` | List events across organizers | Superadmin |
| POST | `/api/admin/events/{eventId}` | Verify, reject, pause, resume or edit an event listing; see actions below | Superadmin |
| GET | `/api/admin/system` | Relayer funding, contract/admin information and moderation queue state | Superadmin |
| GET | `/api/admin/audit?page=0` | Paginated admin action history | Superadmin |

The event moderation endpoint uses these JSON bodies:

| Action | Body / effect |
| --- | --- |
| Verify event | `{ "action": "verify" }` marks the listing verified |
| Reject event | `{ "action": "reject", "reason": "…" }` unlists the event and queues a group pause |
| Pause minting | `{ "action": "pause" }` blocks new claims and queues the on-chain pause |
| Resume minting | `{ "action": "resume" }` queues resume; rejected events cannot resume |
| Edit listing | `{action:"edit",title,description,venue,category}` with optional `club`, `campus`, `eventStartsAt`, `eventEndsAt`, `approximateAttendees` |

Event moderation applies to all role drops in the event group. Editing listing details does not change published POAP artwork/metadata, supply or mint dates. Verifying an event and accepting an individual POAP request are different actions.

## Existing QR and recipient-link flows

| Method | Endpoint | What it does | Access |
| --- | --- | --- | --- |
| GET | `/api/events/{eventId}/qr` | Generate a rotating walk-in QR token for the Attendee role | Event organizer or superadmin |
| POST | `/api/events/{eventId}/claim` | Queue a QR mint to the signed-in wallet; body `{permanentConsent:true,qr}` | Signed-in wallet with a valid live QR |
| GET | `/api/events/{eventId}/links?page=0` | List recipient links without exposing bearer tokens | Event organizer or superadmin |
| POST | `/api/events/{eventId}/links` | Create recipient links from `{csv}` or `{recipients:[{email,role}]}` | Event organizer or superadmin |
| POST | `/api/links/{linkId}/revoke` | Revoke an unused recipient link | Event organizer or superadmin |
| POST | `/api/links/{linkId}/regenerate` | Replace an unused link token and return its new URL | Event organizer or superadmin |
| POST | `/api/links/{linkId}/delete-email` | Remove one recipient's email while preserving history | Event organizer or superadmin |
| POST | `/api/events/{eventId}/delete-emails` | Remove this role's recipient emails | Event organizer or superadmin |
| POST | `/api/redeem` | Preview an available recipient link using `{token}` | Link holder; no sign-in required for preview |
| POST | `/api/redeem/claim` | Claim a single-use link with `{token,permanentConsent:true}` | Signed-in link holder |
| GET | `/api/claims/{claimId}` | Read mint status, destination, token, errors and transaction | Claim wallet, event organizer or superadmin |
| POST | `/api/claims/{claimId}/retry` | Retry a failed mint if window, supply and link authorization allow | Event organizer or superadmin; ADMIN claims require superadmin |

Every participant can see their own token IDs in Gallery and confirmed request statuses. Opening a Gallery badge shows its actual NFT contract address, token ID, network and separate copy buttons for manual MetaMask NFT import. Older badges retain their original contract address; do not substitute the current contract for archived badges.

## Gallery APIs

| Method | Endpoint | What it does | Access |
| --- | --- | --- | --- |
| GET | `/api/wallet-collection?wallet={address}&cursor=1` | Verify ownership on the current/archived contracts and return badge artwork, metadata, role and issuance history; used by Gallery | Public |
| GET | `/api/collection?wallet={address}` | Return confirmed mint records indexed in the database | Public |

## Important behavior

- Creating an event makes the wallet its organizer. Global superadmin access stays tied to `SUPER_ADMIN_ADDRESS`; creators do not automatically gain access to other events.
- Mutations use JSON POST requests, a matching request Origin and, where required, the SIWE session cookie. API access checks are enforced on the server.
- Queueing a publication/mint normally returns HTTP 202; this is not confirmation that an NFT already exists. Follow publication/claim/transaction status until confirmed.
- All mint paths enforce the actual mint window, pause state, supply, issuer readiness and one badge per role/wallet.
- `page` is zero-based where supported. Gallery's `cursor` starts at 1 and follows `nextCursor`.
- Saved publication drafts exist only in browser local storage. **Clear draft & start new** removes that saved draft and resets the editor; there is no draft-deletion API. It cannot cancel a publication already queued or undo an on-chain transaction. Track those publications in the studio.
