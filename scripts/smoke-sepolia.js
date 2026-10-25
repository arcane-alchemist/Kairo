import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Contract, JsonRpcProvider, Wallet, keccak256 } from 'ethers';

// This demo intentionally issues a permanent token to a disposable wallet, not a student.
async function main() {
  const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  assert.equal((await provider.getNetwork()).chainId, 11155111n, 'Sepolia only');
  const admin = new Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const issuer = new Wallet(process.env.ISSUER_PRIVATE_KEY, provider);
  const { abi } = JSON.parse(readFileSync('out/Kairo.sol/Kairo.json'));
  const contract = new Contract(process.env.CONTRACT_ADDRESS, abi, admin);
  assert(await contract.hasRole(await contract.DEFAULT_ADMIN_ROLE(), admin.address), 'Deployer must be admin');
  mkdirSync('data', { recursive: true });
  const path = 'data/sepolia-smoke.json';
  const state = existsSync(path) ? JSON.parse(readFileSync(path)) : {
    contract: await contract.getAddress(), admin: admin.address, issuer: issuer.address,
    attendeePrivateKey: Wallet.createRandom().privateKey
  };
  assert.equal(state.contract, await contract.getAddress(), 'Smoke journal belongs to another contract');
  assert.equal(state.admin, admin.address);
  assert.equal(state.issuer, issuer.address);
  const attendee = new Wallet(state.attendeePrivateKey, provider);
  const save = () => writeFileSync(path, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  save();
  const image = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#101827"/><text x="200" y="190" fill="white" text-anchor="middle" font-size="36">KAIRO</text><text x="200" y="235" fill="#67e8f9" text-anchor="middle" font-size="20">SEPOLIA TEST</text></svg>').toString('base64');
  const uri = 'data:application/json;base64,' + Buffer.from(JSON.stringify({
    name: 'Kairo Sepolia Smoke Test', description: 'Development test only. Does not certify attendance at a real event.', image
  })).toString('base64');

  async function sendOnce(label, signer, request) {
    if (!state[label]) {
      const raw = await signer.signTransaction(await signer.populateTransaction(request));
      state[label] = { raw, hash: keccak256(raw) };
      save();
    }
    const { raw, hash } = state[label];
    let receipt = await provider.getTransactionReceipt(hash);
    if (!receipt) {
      try { await provider.broadcastTransaction(raw); }
      catch (error) { if (!await provider.getTransaction(hash)) throw error; }
    }
    receipt = await provider.waitForTransaction(hash, 2, 180000);
    assert(receipt && receipt.status === 1, `${label} transaction failed or timed out`);
    return receipt;
  }

  if (!state.eventId) {
    const block = await provider.getBlock('latest');
    const receipt = await sendOnce('create', admin, await contract.createEvent.populateTransaction(
      uri, 1, block.timestamp, block.timestamp + 86400, admin.address, issuer.address
    ));
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === 'EventCreated') state.eventId = parsed.args.eventId.toString();
      } catch {}
    }
    assert(state.eventId, 'Missing EventCreated log');
    save();
  }
  assert(await contract.canMint(state.eventId, issuer.address));
  const receipt = await sendOnce('mint', issuer, await contract.connect(issuer).mintAttendance.populateTransaction(state.eventId, attendee.address));
  const tokenId = await contract.tokenFor(state.eventId, attendee.address);
  assert(tokenId > 0n);
  assert.equal(await contract.ownerOf(tokenId), attendee.address);
  assert.equal(await contract.eventFor(tokenId), BigInt(state.eventId));
  assert.equal(await contract.tokenURI(tokenId), uri);
  assert(await contract.locked(tokenId));
  assert(await contract.supportsInterface('0xb45a3c0e'));
  async function mustRevert(action, expected) {
    await assert.rejects(action, error => {
      try { return contract.interface.parseError(error.data)?.name === expected; } catch { return false; }
    });
  }
  await mustRevert(() => contract.connect(issuer).mintAttendance.staticCall(state.eventId, attendee.address), 'NotEligible');
  await mustRevert(() => contract.connect(attendee).mintAttendance.staticCall(state.eventId, admin.address), 'UnauthorizedEvent');
  await mustRevert(() => contract.connect(attendee).transferFrom.staticCall(attendee.address, admin.address, tokenId), 'Soulbound');
  state.tokenId = tokenId.toString(); state.verified = true; save();
  const report = { chainId: 11155111, contract: state.contract, eventId: state.eventId, tokenId: state.tokenId,
    attendee: attendee.address, createTransaction: state.create.hash, mintTransaction: receipt.hash,
    checks: ['ownership', 'event metadata', 'ERC-5192', 'duplicate rejection', 'unauthorized rejection', 'transfer rejection'] };
  mkdirSync('deployments', { recursive: true });
  writeFileSync('deployments/sepolia-smoke.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  // RPC errors can include URLs or signed payloads; never print the whole error.
  console.error('Smoke test failed:', error.code || error.name);
  process.exitCode = 1;
});
