import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ContractFactory, JsonRpcProvider, Wallet, getAddress } from 'ethers';

const local = process.argv.includes('--local');
const rpc = local ? process.env.LOCAL_RPC_URL : process.env.SEPOLIA_RPC_URL;
if (!rpc || !process.env.DEPLOYER_PRIVATE_KEY) {
  throw new Error('Configure SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY locally');
}
const provider = new JsonRpcProvider(rpc);
const chainId = local ? 31337 : 11155111;
if ((await provider.getNetwork()).chainId !== BigInt(chainId)) throw new Error('Unexpected deployment network');
execFileSync('forge', ['build'], { stdio: 'inherit' });
const artifact = JSON.parse(readFileSync('out/Kairo.sol/Kairo.json'));
const deployer = new Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
const admin = getAddress(process.env.ADMIN_ADDRESS || deployer.address);
const contract = await new ContractFactory(artifact.abi, artifact.bytecode.object, deployer).deploy(admin);
await contract.waitForDeployment();
const deployment = { chainId, address: await contract.getAddress(), admin,
  transactionHash: contract.deploymentTransaction().hash };
mkdirSync('deployments', { recursive: true });
writeFileSync(`deployments/${local ? 'local' : 'sepolia'}.json`, JSON.stringify(deployment, null, 2) + '\n');
console.log(deployment);
