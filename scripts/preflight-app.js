import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { Wallet, JsonRpcProvider, Contract, formatEther, getAddress } from 'ethers';
import { ABI } from '../serverless/chain.js';
import { checkConfig } from '../serverless/health.js';
import { ServiceError } from '../serverless/errors.js';

try {
  const config = JSON.parse(readFileSync('wrangler.jsonc'));
  const secrets = existsSync('.dev.vars') ? parseEnv(readFileSync('.dev.vars', 'utf8')) : {};
  if(secrets.SUPER_ADMIN_ADDRESS)assert.equal(getAddress(secrets.SUPER_ADMIN_ADDRESS),getAddress(config.vars.SUPER_ADMIN_ADDRESS),'Local admin override differs from wrangler.jsonc');
  checkConfig({...config.vars,...secrets}, {writes:true});
  const issuer = new Wallet(secrets.ISSUER_PRIVATE_KEY);
  assert.equal(getAddress(config.vars.ISSUER_ADDRESS), issuer.address, 'Issuer key and public address differ');
  const provider = new JsonRpcProvider(secrets.SEPOLIA_RPC_URL || config.vars.PUBLIC_RPC_URL);
  assert.equal((await provider.getNetwork()).chainId, 11155111n, 'Sepolia required');
  assert.notEqual(await provider.getCode(config.vars.CONTRACT_ADDRESS), '0x', 'Contract is missing');
  const contract = new Contract(config.vars.CONTRACT_ADDRESS, ABI, provider);
  assert.equal((await contract.superAdmin()).toLowerCase(),getAddress(config.vars.SUPER_ADMIN_ADDRESS).toLowerCase(),'Contract admin differs from wrangler.jsonc');
  assert.equal((await contract.relayer()).toLowerCase(),issuer.address.toLowerCase(),'Contract relayer differs');
  const balance = await provider.getBalance(issuer.address);
  console.log(JSON.stringify({ contract: config.vars.CONTRACT_ADDRESS, issuer: issuer.address,
    balanceETH: formatEther(balance), funded: balance > 0n,
    databaseConfigured: config.d1_databases[0].database_id !== '00000000-0000-0000-0000-000000000000' }, null, 2));
  if (!balance) { console.error('Fund the issuer with Sepolia test ETH before attendee minting.'); process.exitCode = 1; }
} catch (error) {
  console.error('Preflight failed:', error instanceof ServiceError ? error.message : error.code || error.name);
  process.exitCode = 1;
}
