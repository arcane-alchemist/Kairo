import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {Contract,FetchRequest,JsonRpcProvider,Wallet,ZeroHash,formatEther,getAddress} from 'ethers';
import {ABI} from '../serverless/chain.js';
// Read-only: verifies the real configured Sepolia deployment, never mints a test event.
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8')).vars;
let values={};
for(const file of ['.env','.dev.vars']){try{values={...values,...parseEnv(readFileSync(file,'utf8'))};}catch(error){if(error.code!=='ENOENT')throw error;}}
values={...values,...process.env};
const connection=new FetchRequest(values.SEPOLIA_RPC_URL||config.PUBLIC_RPC_URL);connection.timeout=10000;
const provider=new JsonRpcProvider(connection,11155111,{staticNetwork:true});
try {
 if(BigInt(await provider.send('eth_chainId',[]))!==11155111n)throw Error('Sepolia required');
 const contract=new Contract(config.CONTRACT_ADDRESS,ABI,provider);
 if(await provider.getCode(config.CONTRACT_ADDRESS)==='0x')throw Error('Contract missing');
 const admin=getAddress(config.SUPER_ADMIN_ADDRESS);
 const hasAdmin=await contract.hasRole(ZeroHash,admin);
 const report={chain:'Sepolia',contract:config.CONTRACT_ADDRESS,superAdmin:admin,configuredWalletHasAdmin:hasAdmin};
 const deployment=JSON.parse(readFileSync('deployments/sepolia.json','utf8'));
 const receipt=deployment.address.toLowerCase()===config.CONTRACT_ADDRESS.toLowerCase()?await provider.getTransactionReceipt(deployment.transactionHash):null;
 {
  const latestBlock=await provider.getBlockNumber();
  let creationBlock=receipt?.blockNumber;
  if(creationBlock===undefined){
   let low=0,high=latestBlock;
   while(low<high){const mid=Math.floor((low+high)/2);if(await provider.getCode(config.CONTRACT_ADDRESS,mid)==='0x')low=mid+1;else high=mid;}
   creationBlock=low;
  }
  const roles=new Contract(config.CONTRACT_ADDRESS,['event RoleGranted(bytes32 indexed role,address indexed account,address indexed sender)','event RoleRevoked(bytes32 indexed role,address indexed account,address indexed sender)'],provider);
  const latest=await provider.getBlockNumber(),holders=new Set();
  for(let start=creationBlock;start<=latest;start+=45000) {
   const end=Math.min(start+44999,latest);
   const logs=(await Promise.all([roles.queryFilter(roles.filters.RoleGranted(ZeroHash),start,end),roles.queryFilter(roles.filters.RoleRevoked(ZeroHash),start,end)])).flat().sort((a,b)=>a.blockNumber-b.blockNumber||a.index-b.index);
   for(const log of logs){if(log.fragment.name==='RoleGranted')holders.add(getAddress(log.args.account));else holders.delete(getAddress(log.args.account));}
  }
  report.currentAdmins=[...holders];report.onlyConfiguredAdmin=holders.size===1&&holders.has(admin);
 }
 try{report.fixedSuperAdmin=await contract.superAdmin();report.relayer=await contract.relayer();report.updatedContract=true;}
 catch{report.updatedContract=false;report.requiredAction='The existing contract needs the updated bytecode before sponsored publishing and batching can work.';}
 report.relayerBalanceETH=formatEther(await provider.getBalance(config.ISSUER_ADDRESS));
 report.deployerKeyAvailable=Boolean(values.DEPLOYER_PRIVATE_KEY);
 report.relayerKeyMatches=values.ISSUER_PRIVATE_KEY?new Wallet(values.ISSUER_PRIVATE_KEY).address===getAddress(config.ISSUER_ADDRESS):false;
 console.log(JSON.stringify(report,null,2));
 if(!hasAdmin||!report.onlyConfiguredAdmin||!report.updatedContract||!report.relayerKeyMatches)process.exitCode=1;
} catch(error) {console.error('Sepolia verification failed:',error.code||error.name);process.exitCode=1;} finally {provider.destroy();}
