import {createElement, useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {PrivyProvider, usePrivy, useWallets, useConnectWallet, useConnectOrCreateWallet} from '@privy-io/react-auth';
import {sepolia} from 'viem/chains';

export const privyConfig = {
 appearance: {theme:'light',accentColor:'#573174',walletChainType:'ethereum-only',walletList:['metamask','rainbow','coinbase_wallet','wallet_connect_qr']},
 loginMethods:['wallet','email'],
 defaultChain:sepolia,supportedChains:[sepolia],
 embeddedWallets:{ethereum:{createOnLogin:'users-without-wallets'}}
};

export function mountPrivy(document) {
 return new Promise(resolve => {
  let pending, controls;
  const finish = async (kind, {wallet}) => {
   const request=pending;
   if(!request||request.kind!==kind)return;
   pending=null;
   try {request.resolve({address:wallet.address,provider:await wallet.getEthereumProvider(),name:wallet.walletClientType});}
   catch(error){request.reject(error);}
  };
  const failed = (kind, error) => {
   const request=pending;
   if(!request||request.kind!==kind)return;
   pending=null;
   const code=typeof error==='string'?error:error?.code;
   request.reject(code==='exited_auth_flow'
    ? Object.assign(new Error('Wallet connection cancelled. Choose Connect wallet to try again.'),{code:4001})
    : new Error('Wallet connection could not be completed. Please try again.'));
  };
  function Bridge() {
   const {ready,logout}=usePrivy();
   const {wallets,ready:walletsReady}=useWallets();
   const {connectWallet}=useConnectWallet({onSuccess:result=>finish('wallet',result),onError:error=>failed('wallet',error)});
   const {connectOrCreateWallet}=useConnectOrCreateWallet({onSuccess:result=>finish('auth',result),onError:error=>failed('auth',error)});
   useEffect(()=>{
    if(!ready||!walletsReady)return;
    controls={wallets,logout,connectWallet,connectOrCreateWallet};
    resolve({
     connect: (walletList, {switchAccount=false}={}) => new Promise((resolve,reject)=>{
      if(pending){reject(new Error('A wallet connection is already open.'));return;}
      const kind=walletList||switchAccount?'wallet':'auth';
      pending={resolve,reject,kind};
      try {if(kind==='wallet')controls.connectWallet(walletList?{walletList}:undefined);else controls.connectOrCreateWallet();}catch(error){failed(kind,error);}
     }),
     restore: async address => {const wallet=controls.wallets.find(wallet=>wallet.address.toLowerCase()===address?.toLowerCase());return wallet?{address:wallet.address,provider:await wallet.getEthereumProvider(),name:wallet.walletClientType}:null;},
     disconnect: async()=>{if(pending)failed(pending.kind,'exited_auth_flow');await controls.logout();}
    });
   },[ready,walletsReady,wallets,logout,connectWallet,connectOrCreateWallet]);
   return null;
  }
  const root=document.createElement('div');root.id='privy-root';document.body.append(root);
  createRoot(root).render(createElement(PrivyProvider,{appId:'cmvsbtgq800070hi9h9pxzcer',config:privyConfig},createElement(Bridge)));
 });
}
