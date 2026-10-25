Detection review draft — not submitted

Affected domain: https://kairo-site-7fb.pages.dev
Claim page: https://kairo-site-7fb.pages.dev/#drop/2

Please review the malicious-site classification of this college event collectible app. Attendees have reported a MetaMask malicious-site interstitial and high-risk sign-in warning. We do not yet know which detection provider or rule produced this classification.

Kairo issues nontransferable, nonburnable ERC-721 attendance collectibles on Sepolia only. Contract: 0x999524Cb77Db83864DA6FAC42614387921933922. Backend: https://kairo.aakritigupta7227.workers.dev. Source: https://github.com/arcane-alchemist/Kairo.

The Connect button requests wallet accounts, switches to Sepolia, and requests a wallet-bound, single-use Sign-In with Ethereum (EIP-4361) signature. Server sessions last ten minutes. A separate Mint button submits an authenticated claim to the relayer; the relayer sponsors the Sepolia transaction. Success is shown only after confirmation. The frontend does not request token spending approvals, recovery phrases, wallet passwords, or private keys. The website does not request NFT import through the wallet.

Please identify the triggering rule and review the classification. We will supply screenshots and any additional evidence needed. We are not asking attendees to disable protection or bypass the warning.

Submit this URL classification report through MetaMask Support: https://support.metamask.io/configure/wallet/security-alerts (Contact support). MetaMask's guidance says URL classifications need support review when the alert reporting option is unavailable. Removal is subject to review; no result is guaranteed.

Investigation evidence:
- The screenshots show a malicious-site URL warning before minting and a malicious-site classification within the signature review.
- A successful Sepolia mint does not clear the domain classification.
- The official public MetaMask eth-phishing-detect configuration had no exact or parent-domain blocklist match for kairo-site-7fb.pages.dev when checked on 11 October 2026. This does not rule out other detection providers or dynamic classifications.
- We have not independently reproduced the warning on the attendee's MetaMask Mobile version. Extension automation is blocked by browser policy, and we did not bypass the warning.
- New frontend sign-ins use EIP-4361 with the Pages hostname, exact requested wallet, Sepolia chain ID, nonce, issue time and expiration. The server verifies its stored challenge, checks the recovered wallet and consumes the challenge once. Cached older clients retain their previous compatible sign-in format.
- No private keys, recovery phrases, or wallet passwords are included in this report.

Classification cause: not yet confirmed. Requested action: identify the detection provider/rule and review the domain classification.
