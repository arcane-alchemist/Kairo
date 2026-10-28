import { Contract, FetchRequest, JsonRpcProvider, Wallet, Transaction, keccak256, parseUnits } from 'ethers';

import { ServiceError } from './errors.js';

export const ABI = [
  'function superAdmin() view returns (address)',
  'function PANEL_ADMIN_ROLE() view returns (bytes32)',
  'function getRoleMemberCount(bytes32) view returns (uint256)',
  'function getRoleMember(bytes32,uint256) view returns (address)',
  'function setPanelAdmin(address,bool)',
  'function relayer() view returns (address)',
  'function createEvents((string uri,uint64 cap)[] roles,uint64 startsAt,uint64 endsAt,address organizer)',
  'function mintAttendanceBatch(uint256[] ids,address[] wallets)',
  'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
  'function hasRole(bytes32,address) view returns (bool)',
  'function eventAdmin(uint256) view returns (address)',
  'function canMint(uint256,address) view returns (bool)',
  'function events(uint256) view returns (string uri,uint64 cap,uint64 minted,uint64 startsAt,uint64 endsAt,bool paused)',
  'function createEvent(string,uint64,uint64,uint64,address,address) returns (uint256)',
  'function mintAttendance(uint256,address) returns (uint256)',
  'function setEventIssuer(uint256,address,bool)',
  'function setEventPaused(uint256,bool)',
  'function setEventsPaused(uint256[],bool)',
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
  const archives = JSON.parse(env.ARCHIVE_CONTRACT_ADDRESSES || '[]').map(value=>new Contract(value,ABI,provider));
  async function forEvent(id) {
    for (const instance of [contract,...archives]) if ((await instance.events(id)).cap) return instance;
    return contract;
  }
  async function sign(tx) {
    const signer = new Wallet(env.ISSUER_PRIVATE_KEY, provider);
    const fees = await provider.getFeeData(), ceiling = parseUnits(env.MAX_FEE_GWEI || '10','gwei');
    if (!fees.maxFeePerGas || fees.maxFeePerGas > ceiling) throw Error('Gas above configured ceiling');
    const raw = await signer.signTransaction(await signer.populateTransaction({...tx,maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas}));
    return {raw,hash:keccak256(raw)};
  }
  return {
    provider, contract,
    async assertContract() {
      let admin,issuer;
      try {[admin,issuer]=await Promise.all([contract.superAdmin(),contract.relayer()]);}
      catch(error) {
        if(error.code==='CALL_EXCEPTION')throw new ServiceError('CONTRACT_MISMATCH','Deploy the updated Kairo contract to enable publishing and minting.','contract');
        throw error;
      }
      if(admin.toLowerCase()!==env.SUPER_ADMIN_ADDRESS.toLowerCase()||issuer.toLowerCase()!==env.ISSUER_ADDRESS.toLowerCase())throw new ServiceError('CONTRACT_MISMATCH','The contract admin or relayer differs from your Worker environment. Update the configured address.','contract');
    },
    async assertReady() {
      await this.assertContract();
      let signer;
      try {signer=new Wallet(env.ISSUER_PRIVATE_KEY);}catch{throw new ServiceError('RELAYER_NOT_CONFIGURED','Connect the relayer wallet to enable sponsored publishing.','relayer');}
      if(signer.address.toLowerCase()!==env.ISSUER_ADDRESS.toLowerCase())throw new ServiceError('RELAYER_MISMATCH','The relayer key belongs to a different wallet. Update the local configuration.','relayer');
      if(await provider.getBalance(signer.address)===0n)throw new ServiceError('RELAYER_UNFUNDED','Add Sepolia test ETH to the relayer to enable publishing and minting.','relayer');
    },
    async assertMintReady(id) {
      let signer;
      try {signer=new Wallet(env.ISSUER_PRIVATE_KEY);}catch{throw new ServiceError('RELAYER_NOT_CONFIGURED','The relayer is not configured.','relayer');}
      if(signer.address.toLowerCase()!==env.ISSUER_ADDRESS.toLowerCase())throw new ServiceError('RELAYER_MISMATCH','The relayer key does not match the configured issuer.','relayer');
      const instance=await forEvent(id);
      if(!await instance.canMint(id,signer.address))throw new ServiceError('ISSUER_NOT_AUTHORIZED','The relayer is not authorized to mint this event. The contract admin must grant it issuer permission.','contract',409);
      if(await provider.getBalance(signer.address)===0n)throw new ServiceError('RELAYER_UNFUNDED','Add Sepolia test ETH to the relayer before minting.','relayer');
    },
    async signAction(action) {
      const signer = new Wallet(env.ISSUER_PRIVATE_KEY,provider), payload=JSON.parse(action.payload);
      if ((await contract.relayer()).toLowerCase() !== signer.address.toLowerCase() ||
          (await contract.superAdmin()).toLowerCase() !== env.SUPER_ADMIN_ADDRESS.toLowerCase()) throw Error('Contract authority mismatch; update the Worker admin or relayer address');
      return sign(action.kind==='publish'
        ? await contract.connect(signer).createEvents.populateTransaction(payload.roleArtwork.map(art=>[art.uri,art.cap]),payload.mintStartsAt,payload.mintEndsAt,payload.organizer)
        : await contract.connect(signer).setEventsPaused.populateTransaction(payload.ids,payload.paused));
    },
    createdEvents(receipt) {
      return receipt.logs.map(log=>{try{return contract.interface.parseLog(log);}catch{return null;}}).filter(log=>log?.name==='EventCreated').map(log=>Number(log.args.eventId));
    },
    async collectionPage(wallet, cursor = 1) {
      const pages = await Promise.all([contract,...archives].map(async instance=>{
        const page = await readCollectionPage(instance,wallet,cursor);
        return {...page,items:page.items.map(item=>({...item,contractAddress:instance.target}))};
      }));
      const cursors=pages.map(page=>page.nextCursor).filter(value=>value!==null);
      return {items:pages.flatMap(page=>page.items),total:pages.reduce((sum,page)=>sum+page.total,0),nextCursor:cursors.length?Math.max(...cursors):null};
    },
    async event(id) { return (await forEvent(id)).events(id); },
    async batchCompatible(id) { return Boolean((await contract.events(id)).cap); },
    async admin(wallet) { return wallet.toLowerCase()===(await contract.superAdmin()).toLowerCase() || contract.hasRole(await contract.PANEL_ADMIN_ROLE(), wallet); },
    async panelAdmins() {
      const role=await contract.PANEL_ADMIN_ROLE(),count=Number(await contract.getRoleMemberCount(role));
      return Promise.all(Array.from({length:count},(_,i)=>contract.getRoleMember(role,i)));
    },
    async token(id, wallet) { return (await (await forEvent(id)).tokenFor(id, wallet)).toString(); },
    async signMint(id, wallet) {
      const signer = new Wallet(env.ISSUER_PRIVATE_KEY, provider), instance=await forEvent(id);
      if (!await instance.canMint(id, signer.address)) throw new Error('Issuer not authorized');
      return sign(await instance.connect(signer).mintAttendance.populateTransaction(id,wallet));
    },
    async signMintBatch(jobs) {
      const signer = new Wallet(env.ISSUER_PRIVATE_KEY,provider);
      return sign(await contract.connect(signer).mintAttendanceBatch.populateTransaction(jobs.map(j=>j.event_id),jobs.map(j=>j.wallet)));
    },
    async replace(raw) {
      const signer = new Wallet(env.ISSUER_PRIVATE_KEY, provider);
      const target=Transaction.from(raw).to;
      if (![contract,...archives].some(instance=>instance.target.toLowerCase()===target?.toLowerCase())) throw Error('Unexpected transaction target');
      return signReplacement(signer, target, raw, await provider.getFeeData(), parseUnits(env.MAX_FEE_GWEI || '10', 'gwei'));
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
