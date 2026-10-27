import { Contract, FetchRequest, JsonRpcProvider, Wallet, Transaction, keccak256, parseUnits } from 'ethers';

import { ServiceError } from './errors.js';

export const ABI = [
  'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
  'function hasRole(bytes32,address) view returns (bool)',
  'function eventAdmin(uint256) view returns (address)',
  'function canMint(uint256,address) view returns (bool)',
  'function events(uint256) view returns (string uri,uint64 cap,uint64 minted,uint64 startsAt,uint64 endsAt,bool paused)',
  'function createEvent(string,uint64,uint64,uint64,address,address) returns (uint256)',
  'function mintAttendance(uint256,address) returns (uint256)',
  'function setEventIssuer(uint256,address,bool)',
  'function setEventPaused(uint256,bool)',
  'function tokenFor(uint256,address) view returns (uint256)',
  'function ownerOf(uint256) view returns (address)',
  'function balanceOf(address) view returns (uint256)',
  'function nextEventId() view returns (uint256)',
  'function tokenURI(uint256) view returns (string)',
  'function locked(uint256) view returns (bool)',
  'event EventCreated(uint256 indexed eventId,string uri)'
];

export async function connectChain(env) {
  const rpcUrl = env.SEPOLIA_RPC_URL || env.PUBLIC_RPC_URL;
  if (!rpcUrl) throw new ServiceError('NOT_CONFIGURED','Kairo RPC is not configured.');
  const connection = new FetchRequest(rpcUrl); connection.timeout = 8000;
  const provider = new JsonRpcProvider(connection, 11155111, {staticNetwork:true});
  // Do not trust configuration to select the network used for sponsored transactions.
  if (BigInt(await provider.send('eth_chainId', [])) !== 11155111n) throw new ServiceError('WRONG_NETWORK','Your wallet or the network is wrong. Use the configured test network.','rpc',409);
  const contract = new Contract(env.CONTRACT_ADDRESS, ABI, provider);
  return {
    provider, contract,
    async collectionPage(wallet, cursor = 1) { return readCollectionPage(contract, wallet, cursor); },
    async event(id) { return contract.events(id); },
    async admin(wallet) { return contract.hasRole(await contract.DEFAULT_ADMIN_ROLE(), wallet); },
    async staff(id, wallet) {
      return await this.admin(wallet) || await contract.eventAdmin(id) === wallet || await contract.canMint(id, wallet);
    },
    async token(id, wallet) { return (await contract.tokenFor(id, wallet)).toString(); },
    async signMint(id, wallet) {
      const signer = new Wallet(env.ISSUER_PRIVATE_KEY, provider);
      if (!await contract.canMint(id, signer.address)) throw new Error('Issuer not authorized');
      const fees = await provider.getFeeData();
      const ceiling = parseUnits(env.MAX_FEE_GWEI || '10', 'gwei');
      if (!fees.maxFeePerGas || fees.maxFeePerGas > ceiling) throw new Error('Gas above configured ceiling');
      const tx = await contract.connect(signer).mintAttendance.populateTransaction(id, wallet);
      const raw = await signer.signTransaction(await signer.populateTransaction({ ...tx,
        maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas }));
      return { raw, hash: keccak256(raw) };
    },
    async replace(raw) {
      const signer = new Wallet(env.ISSUER_PRIVATE_KEY, provider);
      return signReplacement(signer, await contract.getAddress(), raw, await provider.getFeeData(), parseUnits(env.MAX_FEE_GWEI || '10', 'gwei'));
    },
    async receipt(hash) {
      const result = await provider.getTransactionReceipt(hash);
      return result && await result.confirmations() >= 2 ? result : null;
    },
    async broadcast(raw) { return provider.broadcastTransaction(raw); }
  };
}

export async function signReplacement(signer, contractAddress, raw, fees, ceiling) {
      const previous = Transaction.from(raw);
      if (previous.from !== signer.address || previous.chainId !== 11155111n || previous.to !== contractAddress) throw new Error('Unexpected signed transaction');
      const bump = value => value * 9n / 8n + 1n;
      const max = (a,b) => a > b ? a : b;
      const maxFeePerGas = max(bump(previous.maxFeePerGas), fees.maxFeePerGas || 0n);
      const maxPriorityFeePerGas = max(bump(previous.maxPriorityFeePerGas), fees.maxPriorityFeePerGas || 0n);
      if (maxFeePerGas > ceiling || maxPriorityFeePerGas > maxFeePerGas) return null;
      // Replace only fees: preserve nonce, recipient, calldata, value and gas limit.
      const replacement = await signer.signTransaction({ to: previous.to, data: previous.data,
        value: previous.value, nonce: previous.nonce, gasLimit: previous.gasLimit,
        chainId: previous.chainId, type: 2, maxFeePerGas, maxPriorityFeePerGas });
      return { raw: replacement, hash: keccak256(replacement) };
}

export async function readCollectionPage(contract, wallet, cursor = 1) {
      const [next, balance] = await Promise.all([contract.nextEventId(), contract.balanceOf(wallet)]);
      if (balance === 0n) return { items: [], total: 0, nextCursor: null };
      const end = Math.min(cursor + 10, Number(next));
      const items = await Promise.all(Array.from({ length: Math.max(0, end - cursor) }, async (_, offset) => {
        const id = cursor + offset;
        const token = await contract.tokenFor(id, wallet);
        if (!token) return null;
        if ((await contract.ownerOf(token)).toLowerCase() !== wallet.toLowerCase()) throw Error('Ownership changed');
        const [event, organizer, uri] = await Promise.all([contract.events(id), contract.eventAdmin(id), contract.tokenURI(token)]);
        return { id, tokenId: token.toString(), uri, organizer, mintStartsAt: Number(event.startsAt), mintEndsAt: Number(event.endsAt) };
      }));
      return { items: items.filter(Boolean), total: Number(balance), nextCursor: end < Number(next) ? end : null };
}
