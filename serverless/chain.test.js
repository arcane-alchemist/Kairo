import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, Transaction, Interface, parseUnits } from 'ethers';
import { ABI, signReplacement } from './chain.js';

test('fee replacement preserves the mint and nonce while respecting the gas ceiling', async () => {
  const signer = Wallet.createRandom(), contract = Wallet.createRandom().address;
  const data = new Interface(ABI).encodeFunctionData('mintAttendance', [7, Wallet.createRandom().address]);
  const raw = await signer.signTransaction({ to: contract, data, chainId: 11155111n, nonce: 4,
    type: 2, value: 0n, gasLimit: 200000n, maxFeePerGas: parseUnits('2','gwei'), maxPriorityFeePerGas: parseUnits('1','gwei') });
  const signed = await signReplacement(signer, contract, raw, { maxFeePerGas: parseUnits('3','gwei'), maxPriorityFeePerGas: parseUnits('1','gwei') }, parseUnits('10','gwei'));
  const replacement = Transaction.from(signed.raw);
  assert.equal(replacement.nonce, 4); assert.equal(replacement.data, data);
  assert.equal(replacement.to, contract); assert.equal(replacement.value, 0n);
  assert.equal(replacement.gasLimit, 200000n); assert.equal(replacement.from, signer.address);
  assert.equal(replacement.chainId, 11155111n);
  assert(replacement.maxFeePerGas > Transaction.from(raw).maxFeePerGas);
  assert.equal(await signReplacement(signer, contract, raw, { maxFeePerGas: parseUnits('11','gwei') }, parseUnits('10','gwei')), null);
  await assert.rejects(signReplacement(Wallet.createRandom(), contract, raw, {}, parseUnits('10','gwei')));
});

test('collection checks every event on-chain in bounded pages, including unindexed tokens', async () => {
  const { readCollectionPage } = await import('./chain.js');
  const seen = [];
  const contract = { nextEventId: async () => 23n, balanceOf: async () => 1n,
    tokenFor: async id => { seen.push(id); return id === 22 ? 100n : 0n; }, ownerOf: async () => '0xAB',
    events: async () => ({ startsAt: 10n, endsAt: 20n }), eventAdmin: async () => '0xCD', tokenURI: async () => 'ipfs://badge' };
  const first = await readCollectionPage(contract, '0xab');
  assert.equal(first.items.length, 0); assert.equal(first.total, 1); assert.equal(first.nextCursor, 11);
  const middle = await readCollectionPage(contract, '0xab', first.nextCursor);
  assert.equal(middle.nextCursor, 21);
  const last = await readCollectionPage(contract, '0xab', middle.nextCursor);
  assert.equal(last.items[0].tokenId, '100'); assert.equal(last.nextCursor, null);
  assert.equal(seen.length, 22);
  contract.ownerOf = async () => '0xWRONG';
  await assert.rejects(readCollectionPage(contract, '0xab', 21), /Ownership changed/);
});
