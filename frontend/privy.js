export function installPrivy(win, document, loadModule = () => import('./privy-wallet.js')) {
 let sdk;
 const setTimer=win.setTimeout?.bind(win)||setTimeout, clearTimer=win.clearTimeout?.bind(win)||clearTimeout;
 const load = () => sdk ||= (async()=>{
  let timer;
  try {
   const module=await Promise.race([loadModule(),new Promise((_,reject)=>{
    timer=setTimer(()=>reject(new Error('Privy could not download. Check your connection and try Connect wallet again.')),20000);
   })]);
   clearTimer(timer);
   return await module.mountPrivy(document);
  } finally {clearTimer(timer);}
 })().catch(error => {sdk=null;throw error;});
 win.kairoPrivy = {
  connect: async (walletList, options) => (await load()).connect(walletList, options),
  disconnect: async () => {if(sdk)await(await sdk).disconnect();},
  restore: async address => (await load()).restore(address)
 };
 const warmup = () => {void load().catch(() => {});};
 if(document.readyState==='complete')warmup();
 else win.addEventListener('load',warmup,{once:true});
}
