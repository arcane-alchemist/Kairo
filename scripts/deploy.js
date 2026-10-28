import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import {pathToFileURL} from 'node:url';
import { execFileSync } from 'node:child_process';
import { ContractFactory, JsonRpcProvider, Wallet, getAddress, ZeroAddress, parseUnits } from 'ethers';

export function deploymentWallet(config,args,values) {
 if(args.some(arg=>arg!=='--use-relayer')||args.length>1)throw Error('Only --use-relayer is supported: Sepolia only');
 const key=args.includes('--use-relayer')?values.ISSUER_PRIVATE_KEY:values.DEPLOYER_PRIVATE_KEY;
 let wallet;try{wallet=new Wallet(key);}catch{throw Error('A valid local deployment key is required; use --use-relayer for the saved relayer key.');}
 if(wallet.address===getAddress(config.vars.SUPER_ADMIN_ADDRESS))throw Error('Use a deployment wallet, never the super admin key');
 if(args.includes('--use-relayer')&&wallet.address!==getAddress(config.vars.ISSUER_ADDRESS))throw Error('The locally saved relayer key must match ISSUER_ADDRESS');
 return wallet;
}
async function main() {
const args=process.argv.slice(2);
const config = JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const values={...process.env};
if(args.includes('--use-relayer'))values.ISSUER_PRIVATE_KEY=parseEnv(readFileSync('.dev.vars','utf8')).ISSUER_PRIVATE_KEY;
const signer=deploymentWallet(config,args,values);
const rpc = process.env.SEPOLIA_RPC_URL;
if (!rpc) {
  throw new Error('Configure SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY, or explicitly use --use-relayer');
}
const provider = new JsonRpcProvider(rpc);
try {
const chainId = 11155111;
if ((await provider.getNetwork()).chainId !== BigInt(chainId)) throw new Error('Unexpected deployment network');
execFileSync('forge', ['build'], { stdio: 'inherit' });
const artifact = JSON.parse(readFileSync('out/Kairo.sol/Kairo.json'));
const deployer = signer.connect(provider);
const admin = getAddress(config.vars.SUPER_ADMIN_ADDRESS);
if (deployer.address === admin) throw Error('Use the existing deployer key, never the super admin key');
if (process.env.SUPER_ADMIN_ADDRESS && getAddress(process.env.SUPER_ADMIN_ADDRESS) !== admin) throw Error('Super admin differs from config');
const previous = config.vars.CONTRACT_ADDRESS && await provider.getCode(config.vars.CONTRACT_ADDRESS) !== '0x' ? getAddress(config.vars.CONTRACT_ADDRESS) : ZeroAddress;
const fees = await provider.getFeeData();
if (!fees.maxFeePerGas || fees.maxFeePerGas > parseUnits(config.vars.MAX_FEE_GWEI || '10','gwei')) throw Error('Gas exceeds configured ceiling');
const contract = await new ContractFactory(artifact.abi, artifact.bytecode.object, deployer).deploy(admin, getAddress(config.vars.ISSUER_ADDRESS), previous, {maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas});
await contract.waitForDeployment();
const deployment = { chainId, address: await contract.getAddress(), admin,
  transactionHash: contract.deploymentTransaction().hash };
mkdirSync('deployments', { recursive: true });
if (previous !== ZeroAddress) {
  config.vars.ARCHIVE_CONTRACT_ADDRESSES = JSON.stringify([...new Set([...JSON.parse(config.vars.ARCHIVE_CONTRACT_ADDRESSES || '[]'),previous])]);
  writeFileSync(`deployments/archive-${previous}.json`, readFileSync('deployments/sepolia.json'));
}
config.vars.CONTRACT_ADDRESS = deployment.address;
writeFileSync('wrangler.jsonc',JSON.stringify(config,null,2)+'\n');
writeFileSync('deployments/sepolia.json', JSON.stringify(deployment, null, 2) + '\n');
console.log(deployment);

} finally {provider.destroy();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error('Deployment failed:',error.shortMessage||error.message);process.exitCode=1;});
