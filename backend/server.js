import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Contract, JsonRpcProvider, Wallet, keccak256 } from 'ethers';
import { createStore } from './store.js';
import { createApp } from './app.js';
import { processNext } from './worker.js';

for (const key of ['STAFF_API_TOKEN', 'STUDENT_HASH_SECRET']) {
  if ((process.env[key] || '').length < 32) throw new Error(`${key} must contain at least 32 characters`);
}
const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
if ((await provider.getNetwork()).chainId !== 11155111n) throw new Error('Sepolia only');
const signer = new Wallet(process.env.ISSUER_PRIVATE_KEY, provider);
const { abi } = JSON.parse(readFileSync('out/Kairo.sol/Kairo.json'));
const contract = new Contract(process.env.CONTRACT_ADDRESS, abi, signer);
const chain = {
  async assertEvent(id, checkIn) {
    if (checkIn && !await contract.canMint(id, signer.address)) throw new Error('Event unavailable');
    const e = await contract.events(id);
    const block = await provider.getBlock('latest');
    if (!e.cap || e.paused || BigInt(block.timestamp) > e.endsAt ||
        (checkIn && (BigInt(block.timestamp) < e.startsAt || e.minted >= e.cap))) throw new Error('Event unavailable');
  },
  async hasToken(id, wallet) { return (await contract.tokenFor(id, wallet)) !== 0n; },
  async signMint(id, wallet) {
    const request = await contract.mintAttendance.populateTransaction(id, wallet);
    const raw = await signer.signTransaction(await signer.populateTransaction(request));
    return { raw, hash: keccak256(raw) };
  },
  async receipt(hash) {
    const receipt = await provider.getTransactionReceipt(hash);
    return receipt && await receipt.confirmations() >= 2 ? receipt : null;
  },
  async broadcast(raw) { await provider.broadcastTransaction(raw); }
};
const path = process.env.DATABASE_PATH || 'data/kairo.sqlite';
mkdirSync(dirname(path), { recursive: true });
const store = createStore(path, process.env.STUDENT_HASH_SECRET);
const server = createApp(store, process.env.STAFF_API_TOKEN, chain).listen(Number(process.env.PORT || 3001), '127.0.0.1', () => console.log('Kairo backend listening'));
// shortcut: one mint worker per database, move to a coordinated queue before multiple server instances.
let running = false;
const timer = setInterval(async () => {
  if (running) return;
  running = true;
  try { await processNext(store, chain); } finally { running = false; }
}, 5000);
process.on('SIGINT', () => { clearInterval(timer); server.close(() => process.exit(0)); });
