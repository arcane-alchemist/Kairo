# Sepolia deployment and relayer setup

Current status (2026-10-28): the updated contract is already deployed at `0x90a2920272dd3852193A79DA621B1Ccc9D093714`; read-only checks confirm its fixed admin and relayer. The commands below describe deployment history and future replacement deployments. Do not redeploy for the POAP-request workflow changes. See [current workflow verification](poap-workflow-verification.md).

Deploy **one contract: `contracts/Kairo.sol:Kairo`**. OpenZeppelin contracts compile into it and need no separate deployment. The relayer is the Cloudflare transaction coordinator signing transactions with your locally saved wallet key; it is not another Solidity contract.

| Constructor argument | Configured address |
| --- | --- |
| `admin` | `0x4CB1E99035D2812472B2d50DBB590E9C593188bE` |
| `sponsor` | `0x8C60aF4B93d1e4c14C473F5B9Ffc488cfa2c4E7C` |
| `previous` | `0x999524Cb77Db83864DA6FAC42614387921933922` |

The sponsor has 5 Sepolia ETH at the latest check. Its matching private key already exists in ignored `.dev.vars`; no wallet was generated for this update. Keep that file private and backed up. Never paste keys into chat or Git. A lost key cannot be reconstructed from a public address; MetaMask recovery requires its original wallet credentials/recovery phrase.

From the project directory, use the saved funded relayer as the deployment signer:

```sh
npm run deploy:sepolia -- --use-relayer
npm run verify:sepolia
npm run dev
```

In another terminal:

```sh
npm run smoke:local
```

The existing ignored `.env` supplies `SEPOLIA_RPC_URL`. The explicit `--use-relayer` flag reads the existing `.dev.vars` key, validates its address, enforces Sepolia and the configured gas ceiling, and refuses to use the super admin's key. Without the flag, `npm run deploy:sepolia` requires your separate `DEPLOYER_PRIVATE_KEY` in `.env`.

Deployment archives the old contract and updates `CONTRACT_ADDRESS` automatically, preserving visibility of old badges and avoiding event/token ID collisions. Restart an existing dev server after deployment. These commands do not deploy the website or push Git changes.

Local publishing uses the real R2 bucket and its public HTTPS URL from `MEDIA_BASE_URL` in `.dev.vars`. Existing Worker artwork URLs are displayed through this public host without changing frozen metadata or on-chain URIs. `node scripts/restore-hacktober.js` restores the missing **local** Hacktober event listing only after checking its real on-chain record and existing R2 objects; it does not modify the remote database or mint badges. Gallery remains ownership-based.

Super admin login: `http://localhost:8787/#admin/login`. Connect the configured admin wallet in MetaMask and sign in; no admin private key is needed in the app. Other wallets cannot access admin API routes.

This workflow update does not deploy a website or a replacement contract. The configured contract is now compatible; the local Worker passes readiness after migration 0011. Remote migration/hosting verification and a browser-approved live admin mint remain separate deployment checks.
