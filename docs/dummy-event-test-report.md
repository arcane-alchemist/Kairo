# Dummy event test — 27 October 2026

Environment: isolated, disposable Anvil blockchain. No production or live Sepolia event was created.

| Role | Maximum supply | Minted token | Result |
| --- | ---: | ---: | --- |
| Attendee | 20 | 1 | Confirmed |
| Volunteer | 5 | 2 | Confirmed |
| Judge | 3 | 3 | Confirmed |

One POAP per role was minted to a disposable test wallet, rather than minting the entire maximum supply.

Passed: description-generated distinct role artwork; signed login; persisted draft submission; three real contract event-creation transactions; RSVP; dummy verifier check-in; sponsored mint queue; two-confirmation transaction receipts; ownership; immutable metadata URI; soulbound lock; and Gallery API returning all three badges with their artwork, descriptions and roles.

The first attempt rejected check-in because the test advanced the blockchain clock without advancing the backend clock. The test was corrected to wait for the actual event window, after which all three mints confirmed.

The confirmation component's automated tests verify that “Woo Hoo! POAP Minted”, the image and the description appear only after confirmation. Browser automation failed to open the temporary verification tab, so manual visual confirmation was not completed.

Cleanup: the temporary server and Anvil process were stopped; their in-memory event database, generated artwork and local blockchain were discarded. The temporary JSON event report was deleted. Production bindings, existing events and wallet funds were untouched.

Live Sepolia publication/minting remains untested because admin and issuer keys are not configured in this checkout.
