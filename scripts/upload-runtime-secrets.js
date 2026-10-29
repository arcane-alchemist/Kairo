import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { Wallet, getAddress, ZeroAddress } from 'ethers';

try {
  const values = parseEnv(readFileSync('.dev.vars', 'utf8'));
  const config = JSON.parse(readFileSync('wrangler.jsonc'));
  const issuer = new Wallet(values.ISSUER_PRIVATE_KEY);
  if (issuer.address !== config.vars.ISSUER_ADDRESS || getAddress(config.vars.SUPER_ADMIN_ADDRESS) === ZeroAddress) throw Error('Invalid configuration');
  if(values.SUPER_ADMIN_ADDRESS && getAddress(values.SUPER_ADMIN_ADDRESS)!==getAddress(config.vars.SUPER_ADMIN_ADDRESS))throw Error('Local admin override differs');
  const secrets = Object.fromEntries(['SEPOLIA_RPC_URL', 'ISSUER_PRIVATE_KEY'].filter(key=>values[key]).map(key => [key, values[key]]));
  // Runtime credentials go only to Cloudflare stdin; the deployer key is excluded.
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'secret', 'bulk'], {
    input: JSON.stringify(secrets), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
  });
  if (result.status !== 0) throw Error('Upload failed; check Cloudflare login and Worker configuration');
  console.log('Uploaded configured runtime secrets to the configured Cloudflare Worker.');
} catch {
  console.error('Runtime secret upload failed. Check local configuration and Cloudflare authentication.');
  process.exitCode = 1;
}
