import { isNativeApp } from './native.js';
// EIP-6963 avoids taking whichever wallet last overwrote window.ethereum.
export function metaMaskWallet(win, invalidate = () => {}, loadMobileWallet = async () => (await import('./mobile-wallet.js')).createMobileWallet(win)) {
  let announced, selected, mobile, pending = false;
  const changed = () => { disconnect(); invalidate(); };
  win.addEventListener('eip6963:announceProvider', event => {
    if (event.detail?.info?.rdns === 'io.metamask') announced = event.detail.provider;
  });
  win.dispatchEvent(new win.Event('eip6963:requestProvider'));
  function disconnect() {
    selected?.removeListener?.('accountsChanged', changed);
    selected?.removeListener?.('chainChanged', changed);
    selected?.removeListener?.('disconnect', changed);
    selected = null;
  }
  return {
    get provider() { if (!selected) throw Error('Connect MetaMask and approve account access first.'); return selected; },
    disconnect() {disconnect(); mobile?.disconnect().catch(() => {});},
    async connect() {
      if (pending) throw Error('A MetaMask permission request is already open. Review it in MetaMask.');
      const candidates = win.ethereum?.providers || [win.ethereum];
      const provider = announced || candidates.find(p => p?.isMetaMask && !p.isPhantom && !p.isBraveWallet);
      if (!provider && !isNativeApp(win)) throw Error('MetaMask was not detected. Install MetaMask or open this site in its mobile browser.');
      pending = true;
      disconnect();
      try {
        let accounts, approvedProvider = provider;
        if (!provider) {
          mobile ||= await loadMobileWallet();
          ({accounts} = await mobile.connect()); approvedProvider = mobile.provider;
        } else {
          await provider.request({ method: 'wallet_requestPermissions', params: [{eth_accounts: {}}] });
          accounts = await provider.request({ method: 'eth_requestAccounts' });
        }
        if (!/^0x[\da-f]{40}$/i.test(accounts?.[0] || '')) throw Error('No Ethereum account was approved in MetaMask.');
        selected = approvedProvider;
        approvedProvider.on?.('accountsChanged', changed);
        approvedProvider.on?.('chainChanged', changed);
        approvedProvider.on?.('disconnect', changed);
        return accounts[0];
      } finally { pending = false; }
    }
  };
}
