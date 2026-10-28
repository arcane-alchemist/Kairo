import { isNativeApp } from './native.js';

// Discover providers without reading accounts or competing for window.ethereum.
export function metaMaskWallet(win, changed = () => {}, loadMobileWallet = async () => (await import('./mobile-wallet.js')).createMobileWallet(win)) {
  const announced = new Map();
  let selected, mobile, pending = false, walletId = '';
  const handlers = Object.fromEntries(['accountsChanged', 'chainChanged', 'disconnect'].map(event => [event, value => changed(event, value)]));
  const canonical = id => id === 'io.metamask' ? 'metamask' : id === 'app.phantom' ? 'phantom' : id;
  win.addEventListener('eip6963:announceProvider', event => {
    const {info, provider} = event.detail || {};
    if (typeof info?.rdns === 'string' && typeof provider?.request === 'function') announced.set(canonical(info.rdns), {id:canonical(info.rdns), name:String(info.name || info.rdns), provider});
  });
  win.dispatchEvent(new win.Event('eip6963:requestProvider'));
  function wallets() {
    const entries = new Map(announced);
    for (const provider of [win.ethereum, ...(win.ethereum?.providers || []), win.phantom?.ethereum]) {
      if (typeof provider?.request !== 'function' || [...entries.values()].some(item => item.provider === provider)) continue;
      const id = provider.isPhantom ? 'phantom' : provider.isRabby ? 'rabby' : provider.isCoinbaseWallet ? 'coinbase' : provider.isMetaMask ? 'metamask' : 'injected';
      if (!entries.has(id)) entries.set(id, {id, provider, name:({metamask:'MetaMask',phantom:'Phantom',rabby:'Rabby',coinbase:'Coinbase',injected:'Browser wallet'})[id]});
    }
    for (const [id,name] of [['metamask','MetaMask'],['phantom','Phantom']]) if (!entries.has(id)) entries.set(id,{id,name});
    return [...entries.values()];
  }
  function detach() {
    for (const [event, handler] of Object.entries(handlers)) selected?.removeListener?.(event, handler);
    selected = null;
  }
  function attach(entry) {
    detach(); selected = entry.provider; walletId = entry.id;
    for (const [event, handler] of Object.entries(handlers)) selected?.on?.(event, handler);
  }
  function lastUsed() { try { return win.localStorage?.getItem('kairo-wallet-provider') || ''; } catch { return ''; } }
  return {
    get provider() { if (!selected) throw Error('Use Connect wallet in the header to approve account access.'); return selected; },
    get name() { return wallets().find(item => item.id === walletId)?.name || 'Wallet'; },
    get wallets() { return wallets().filter(item => item.id === 'metamask').map(({id,name}) => ({id,name})); },
    get lastUsed() { return lastUsed(); },
    restore() { const entry = wallets().find(item => item.id === 'metamask' && item.provider); if (entry) attach(entry); },
    async disconnect() {
      const provider = selected; detach();
      try { await provider?.request({method:'wallet_revokePermissions',params:[{eth_accounts:{}}]}); } catch { /* Wallets may not implement permission revocation. */ }
      await mobile?.disconnect().catch(() => {});
    },
    async connect(id = 'metamask') {
      if (id !== 'metamask') throw Error('Kairo connects with MetaMask only.');
      if (pending) throw Error('A wallet permission request is already open. Review it in your wallet.');
      const entry = wallets().find(item => item.id === id);
      if (!entry?.provider && !(id === 'metamask' && isNativeApp(win))) throw Error(`${entry?.name || 'Wallet'} was not detected. Install its extension or open Kairo in that wallet’s mobile browser.`);
      pending = true; detach();
      try {
        let accounts, approved = entry;
        async function request(input) {
          let timer;
          try {
            return await Promise.race([approved.provider.request(input),new Promise((resolve,reject)=>{
              timer=(win.setTimeout || setTimeout).call(win,()=>reject(Object.assign(Error('MetaMask is still waiting. Open MetaMask to finish or cancel the request, then try Connect wallet again.'),{code:'WALLET_TIMEOUT'})),90000);
            })]);
          } finally {(win.clearTimeout || clearTimeout).call(win,timer);}
        }
        if (!entry?.provider) {
          mobile ||= await loadMobileWallet();
          ({accounts} = await mobile.connect()); approved = {...entry, provider:mobile.provider};
        } else {
          try { await request({method:'wallet_requestPermissions',params:[{eth_accounts:{}}]}); }
          catch (error) { if (![4200,-32601].includes(error.code)) throw error; }
          accounts = await request({method:'eth_requestAccounts'});
        }
        if (Array.isArray(accounts)&&accounts.length>1) {
          try {await request({method:'wallet_revokePermissions',params:[{eth_accounts:{}}]});}catch{/* The connection stays detached if revocation is unsupported. */}
          throw Error('Select exactly one account in MetaMask for this Kairo session, then connect again.');
        }
        if (!Array.isArray(accounts)||accounts.length!==1||!/^0x[\da-f]{40}$/i.test(accounts?.[0] || '')) throw Error('No Ethereum account was approved in your wallet.');
        attach(approved);
        try { win.localStorage?.setItem('kairo-wallet-provider',id); } catch { /* Connection works without browser storage. */ }
        return accounts[0];
      } finally { pending = false; }
    }
  };
}
