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
  const finish = async ({wallet}) => {
   const request=pending;pending=null;
   if(!request)return;
   try {request.resolve({address:wallet.address,provider:await wallet.getEthereumProvider(),name:wallet.walletClientType});}
   catch(error){request.reject(error);}
  };
  const failed = error => {const request=pending;pending=null;request?.reject(new Error(typeof error==='string'?error:'Wallet connection cancelled or failed. Try again.'));};
  function Bridge() {
   const {ready,logout}=usePrivy();
   const {wallets,ready:walletsReady}=useWallets();
   const {connectWallet}=useConnectWallet({onSuccess:finish,onError:failed});
   const {connectOrCreateWallet}=useConnectOrCreateWallet({onSuccess:finish,onError:failed});
   useEffect(()=>{
    if(!ready||!walletsReady)return;
    controls={wallets,logout,connectWallet,connectOrCreateWallet};
    resolve({
     connect: (walletList) => new Promise((resolve,reject)=>{
      if(pending){reject(new Error('A wallet connection is already open.'));return;}
      pending={resolve,reject};
      try {if(walletList)controls.connectWallet({walletList});else controls.connectOrCreateWallet();}catch(error){failed(error);}
     }),
     restore: async address => {const wallet=controls.wallets.find(wallet=>wallet.address.toLowerCase()===address?.toLowerCase());return wallet?{address:wallet.address,provider:await wallet.getEthereumProvider(),name:wallet.walletClientType}:null;},
     disconnect: async()=>{failed('Wallet disconnected.');await controls.logout();}
    });
   },[ready,walletsReady,wallets,logout,connectWallet,connectOrCreateWallet]);
   return null;
  }
  const root=document.createElement('div');root.id='privy-root';document.body.append(root);
  createRoot(root).render(createElement(PrivyProvider,{appId:'cmvsbtgq800070hi9h9pxzcer',config:privyConfig},createElement(Bridge)));
 });
}
