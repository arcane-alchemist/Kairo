import { readFileSync } from 'node:fs';
import { Contract, JsonRpcProvider, Wallet, getAddress } from 'ethers';
const [uri, cap, startsAt, endsAt, organizer, issuer] = process.argv.slice(2);
if (!uri?.startsWith('ipfs://') || !/^\d+$/.test(cap || '') || !/^\d+$/.test(startsAt || '') || !/^\d+$/.test(endsAt || '')) {
  throw new Error('Usage: create-event.js ipfs://METADATA CAP START_UNIX END_UNIX ORGANIZER_ADDRESS ISSUER_ADDRESS');
}
const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
if ((await provider.getNetwork()).chainId !== 11155111n) throw new Error('Sepolia only');
const signer = new Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
const { abi } = JSON.parse(readFileSync('out/Kairo.sol/Kairo.json'));
const contract = new Contract(process.env.CONTRACT_ADDRESS, abi, signer);
const tx = await contract.createEvent(uri, cap, startsAt, endsAt, getAddress(organizer), getAddress(issuer));
const receipt = await tx.wait(2);
for (const log of receipt.logs) {
  try { const parsed = contract.interface.parseLog(log); if (parsed?.name === 'EventCreated') console.log('Event ID:', parsed.args.eventId.toString()); } catch {}
}
