import { createEVMClient } from '@metamask/connect-evm';
import { nativeRequest } from './native.js';

export async function createMobileWallet(win = window, createClient = createEVMClient) {
  const openErrors = new Set();
  const client = await createClient({
    dapp:{name:'Kairo',url:win.location.origin,iconUrl:win.location.origin+'/favicon.svg',nativeScheme:'kairo://wallet-return'},
    api:{supportedNetworks:{'0xaa36a7':'https://ethereum-sepolia-rpc.publicnode.com'}},
    ui:{headless:true,preferExtension:false,showInstallModal:false},
    analytics:{enabled:false},skipAutoAnnounce:true,
    mobile:{useDeeplink:true,preferredOpenLink:url => {nativeRequest('open-wallet',{url},win).catch(error => {for (const fail of openErrors) fail(error);});}}
  });
  const provider = client.getProvider();
  // Native launch errors must reject a pending wallet operation instead of leaving its button busy.
  const invoke = operation => new Promise((resolve,reject) => {
    const fail = error => { openErrors.delete(fail); client.disconnect().catch(() => {}); reject(error); };
    openErrors.add(fail);
    Promise.resolve().then(operation).then(resolve,reject).finally(() => {openErrors.delete(fail);});
  });
  return {
    provider: {
      request:args => invoke(() => provider.request(args)),
      on:(...args) => provider.on(...args),removeListener:(...args) => provider.removeListener(...args)
    },
    async connect() { return invoke(() => client.connect({chainIds:['0xaa36a7'],forceRequest:true})); },
    async disconnect() { await client.disconnect(); }
  };
}
