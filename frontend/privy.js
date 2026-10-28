export function installPrivy(win, document) {
 let sdk;
 const load = () => sdk ||= import('./privy-wallet.js').then(module => module.mountPrivy(document));
 win.kairoPrivy = {
  connect: async walletList => (await load()).connect(walletList),
  disconnect: async () => {if(sdk)await(await sdk).disconnect();},
  restore: async address => (await load()).restore(address)
 };
}
