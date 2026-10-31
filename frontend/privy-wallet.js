import {createElement, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PrivyProvider, usePrivy, useWallets, useConnectWallet, useLogin} from '@privy-io/react-auth';
import {sepolia} from 'viem/chains';

export const privyConfig = {
 appearance: {theme:'light',accentColor:'#573174',walletChainType:'ethereum-only',walletList:['metamask','rainbow','coinbase_wallet','wallet_connect_qr']},
 loginMethods:['wallet','email'],
 defaultChain:sepolia,supportedChains:[sepolia],
 embeddedWallets:{ethereum:{createOnLogin:'users-without-wallets'}}
};

export function mountPrivy(document) {
 return new Promise((resolve, reject) => {
  let pending, controls;
  const root=document.createElement('div');root.id='privy-root';document.body.append(root);
  let reactRoot;
  const failMount = error => {
   clearTimeout(timer);
   if(pending){pending.reject(error);pending=null;}
   reactRoot?.unmount();root.remove();
   reject(error);
  };
  const timer=setTimeout(()=>failMount(new Error('Privy could not load. Check your connection and try Connect wallet again.')),20000);
  const finish = async (kind, {wallet}) => {
   const request=pending;
   if(!request||request.kind!==kind||request.finishing)return;
   request.finishing=true;
   clearTimeout(request.timer);
   try {
    await wallet.switchChain(sepolia.id);
    const provider=await wallet.getEthereumProvider();
    if(pending===request)request.resolve({address:wallet.address,provider,name:wallet.walletClientType});
   } catch(error){if(pending===request)request.reject(error);}
   finally {if(pending===request)pending=null;}
  };
  const failed = (kind, error) => {
   const request=pending;
   if(!request||request.kind!==kind)return;
   clearTimeout(request.timer);
   pending=null;
   const code=typeof error==='string'?error:error?.code;
   request.reject(code==='exited_auth_flow'
    ? Object.assign(new Error('Wallet connection cancelled. Choose Connect wallet to try again.'),{code:4001})
    : new Error('Wallet connection could not be completed. Please try again.'));
  };
  const invoke = (kind, action) => {
   try {Promise.resolve(action()).catch(error=>failed(kind,error));}
   catch(error){failed(kind,error);}
  };
  function Bridge() {
   const {ready,authenticated,logout}=usePrivy();
   const [loginResult,setLoginResult]=useState(null);
   const {wallets,ready:walletsReady}=useWallets();
   const {connectWallet}=useConnectWallet({onSuccess:result=>finish('wallet',result),onError:error=>failed('wallet',error)});
   const {login}=useLogin({onComplete:result=>setLoginResult(result),onError:error=>failed('auth',error)});
   useEffect(()=>{
    if(!ready||authenticated||!pending?.restartLogin)return;
    pending.restartLogin=false;
    clearTimeout(pending.timer);
    setLoginResult(null);
    invoke('auth',login);
   },[ready,authenticated,login]);
   useEffect(()=>{
    if(!walletsReady||!loginResult||pending?.kind!=='auth')return;
    const account=loginResult.loginAccount;
    const address=(account?.type==='wallet'?account.address:null)||loginResult.user.wallet?.address||loginResult.user.linkedAccounts?.find(account=>account.type==='wallet'&&account.chainType==='ethereum'&&account.walletClientType==='privy')?.address;
    const wallet=wallets.find(wallet=>wallet.address.toLowerCase()===address?.toLowerCase());
    if(wallet)finish('auth',{wallet});
   },[walletsReady,wallets,loginResult]);
   useEffect(()=>{
    if(!ready||!walletsReady)return;
    controls={wallets,authenticated,logout,connectWallet,login};
    clearTimeout(timer);
    resolve({
     connect: (walletList, {switchAccount=false}={}) => new Promise((resolve,reject)=>{
      if(pending){reject(new Error('A wallet connection is already open.'));return;}
      const kind=walletList||switchAccount?'wallet':'auth';
      pending={resolve,reject,kind};
      if(kind==='wallet')invoke(kind,()=>controls.connectWallet(walletList?{walletList}:undefined));
      else {
       setLoginResult(null);
       if(controls.authenticated){
        // Privy login is a no-op for a restored session; reopen authentication only on this explicit click.
        pending.restartLogin=true;
        pending.timer=setTimeout(()=>failed(kind,'session_reset_timeout'),20000);
        invoke(kind,()=>controls.logout());
       } else invoke(kind,()=>controls.login());
      }
     }),
     restore: async address => {const wallet=controls.wallets.find(wallet=>wallet.address.toLowerCase()===address?.toLowerCase());return wallet?{address:wallet.address,provider:await wallet.getEthereumProvider(),name:wallet.walletClientType}:null;},
     disconnect: async()=>{if(pending)failed(pending.kind,'exited_auth_flow');await controls.logout();}
    });
   },[ready,walletsReady,wallets,authenticated,logout,connectWallet,login]);
   return null;
  }
  reactRoot=createRoot(root,{onUncaughtError:failMount});
  reactRoot.render(createElement(PrivyProvider,{appId:'cmvsbtgq800070hi9h9pxzcer',config:privyConfig},createElement(Bridge)));
 });
}
