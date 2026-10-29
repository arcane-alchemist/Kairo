export function installPrivy(win, document) {
 let sdk;
 const load = () => sdk ||= import('./privy-wallet.js').then(module => module.mountPrivy(document));
 win.kairoPrivy = {
  connect: async (walletList, options) => (await load()).connect(walletList, options),
  disconnect: async () => {if(sdk)await(await sdk).disconnect();},
  restore: async address => (await load()).restore(address)
 };
}
