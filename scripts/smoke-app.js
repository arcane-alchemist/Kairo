import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Contract, JsonRpcProvider, Wallet, formatEther, keccak256, parseUnits } from 'ethers';

// Explicitly authorized test: one permanent NFT, synthetic attendance only.
const origin = 'https://kairo.aakritigupta7227.workers.dev';
const path = 'data/app-smoke.json';
let cookie = '';
async function api(route, input) {
  const response = await fetch(origin + '/api' + route, { headers: {
    origin, 'content-type': 'application/json', cookie
  }, ...(input === undefined ? {} : { method: 'POST', body: JSON.stringify(input) }) });
  if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  const result = await response.json();
  assert(response.ok, `${route}: ${response.status} ${result.error || ''}`);
  return result;
}
async function main() {
  const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  assert.equal((await provider.getNetwork()).chainId, 11155111n);
  const admin = new Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const config = await api('/config');
  const { abi } = JSON.parse(readFileSync('out/Kairo.sol/Kairo.json'));
  const contract = new Contract(config.contractAddress, abi, admin);
  assert(await contract.hasRole(await contract.DEFAULT_ADMIN_ROLE(), admin.address));
  mkdirSync('data', { recursive: true });
  const state = existsSync(path) ? JSON.parse(readFileSync(path)) : {
    contract: config.contractAddress, attendeeKey: Wallet.createRandom().privateKey,
    title: 'Kairo live distribution test',
    description: 'Synthetic integration test only. This collectible does not certify physical attendance.',
    studentId: 'KAIRO-TEST-' + crypto.randomUUID()
  };
  assert.equal(state.contract, config.contractAddress);
  const save = () => writeFileSync(path, JSON.stringify(state, null, 2), { mode: 0o600 });
  save();
  const attendee = new Wallet(state.attendeeKey);
  const challenge = await api('/auth/challenge', {});
  await api('/auth/verify', { id: challenge.id, signature: await admin.signMessage(challenge.message) });
  assert((await api('/auth/me')).admin);
  if (!state.media) {
    state.media = await api('/artwork', { name: state.title, description: state.description,
      image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' });
    save();
  }
  if (!state.eventId) {
    if (!state.raw) {
      const block = await provider.getBlock('latest');
      state.deadline = block.timestamp + 86400;
      const fees = await provider.getFeeData();
      const ceiling = parseUnits('2', 'gwei');
      assert(fees.maxFeePerGas && fees.maxFeePerGas <= ceiling, 'Gas too expensive; no transaction sent');
      const request = await admin.populateTransaction(await contract.createEvent.populateTransaction(
        state.media.uri, 1, block.timestamp, state.deadline, admin.address, config.issuerAddress,
        { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas }
      ));
      assert(request.gasLimit * request.maxFeePerGas < parseUnits('0.002', 'ether'), 'Creation exceeds test budget');
      state.raw = await admin.signTransaction(request); state.createHash = keccak256(state.raw); save();
    }
    let receipt = await provider.getTransactionReceipt(state.createHash);
    if (!receipt) {
      try { await provider.broadcastTransaction(state.raw); }
      catch { assert(await provider.getTransaction(state.createHash), 'Broadcast failed'); }
      console.log('Event transaction submitted:', state.createHash);
      receipt = await provider.waitForTransaction(state.createHash, 2, 180000);
    }
    assert(receipt?.status === 1, 'Event transaction not confirmed');
    for (const log of receipt.logs) {
      try { const parsed = contract.interface.parseLog(log); if (parsed?.name === 'EventCreated') state.eventId = Number(parsed.args.eventId); } catch {}
    }
    assert(state.eventId); save();
  }
  await api('/events', { id: state.eventId, title: state.title, description: state.description,
    club: 'Kairo test', category: 'Technology', venue: 'Synthetic test — no physical event',
    ...state.media, rsvpDeadline: state.deadline });
  if (!state.ticket) {
    state.ticket = (await api(`/events/${state.eventId}/rsvp`, {
      studentId: state.studentId, wallet: attendee.address, permanentConsent: true
    })).ticket; save();
  }
  await api(`/tickets/${state.ticket}/check-in`, { studentId: state.studentId, physicallyVerified: true });
  console.log('Test RSVP and check-in accepted; waiting for deployed relayer.');
  const until = Date.now() + 300000;
  let ticket;
  do {
    ticket = await api(`/tickets/${state.ticket}`);
    assert(ticket.status !== 'failed', ticket.error || 'Mint failed');
    if (ticket.status === 'confirmed') break;
    await new Promise(resolve => setTimeout(resolve, 15000));
  } while (Date.now() < until);
  assert.equal(ticket.status, 'confirmed', 'Mint still awaiting confirmation; rerun safely');
  const token = BigInt(ticket.token_id);
  assert.equal(await contract.ownerOf(token), attendee.address);
  assert.equal(await contract.tokenURI(token), state.media.uri);
  assert(await contract.locked(token));
  assert.equal(await contract.eventFor(token), BigInt(state.eventId));
  const collection = await api('/collection?wallet=' + attendee.address);
  assert(collection.some(item => String(item.tokenId) === String(token)));
  const createReceipt = await provider.getTransactionReceipt(state.createHash);
  const mintReceipt = await provider.getTransactionReceipt(ticket.tx_hash);
  assert.equal(mintReceipt.status, 1);
  const report = { site: origin, eventId: state.eventId, tokenId: String(token), attendee: attendee.address,
    createTransaction: state.createHash, mintTransaction: ticket.tx_hash,
    totalGasETH: formatEther(createReceipt.fee + mintReceipt.fee), verified: true,
    checks: ['live authentication', 'R2 artwork', 'event publication', 'RSVP', 'synthetic staff check-in', 'Worker relayer mint', 'ownership', 'locked token', 'collection'] };
  writeFileSync('deployments/app-smoke.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2)); provider.destroy();
}
main().catch(error => { console.error('Live test stopped:', error.code || error.name, error.code === 'ERR_ASSERTION' || !error.code ? error.message : ''); process.exit(1); });
