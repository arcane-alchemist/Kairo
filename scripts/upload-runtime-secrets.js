import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { Wallet } from 'ethers';

try {
  const values = parseEnv(readFileSync('.dev.vars', 'utf8'));
  const config = JSON.parse(readFileSync('wrangler.jsonc'));
  const issuer = new Wallet(values.ISSUER_PRIVATE_KEY);
  if (issuer.address !== config.vars.ISSUER_ADDRESS || !values.SEPOLIA_RPC_URL || values.STUDENT_HASH_SECRET?.length < 32) throw Error('Invalid configuration');
  const secrets = Object.fromEntries(['SEPOLIA_RPC_URL', 'ISSUER_PRIVATE_KEY', 'STUDENT_HASH_SECRET'].map(key => [key, values[key]]));
  // Runtime credentials go only to Cloudflare stdin; the deployer key is excluded.
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'secret', 'bulk'], {
    input: JSON.stringify(secrets), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
  });
  if (result.status !== 0) throw Error('Upload failed; check Cloudflare login and Worker configuration');
  console.log('Uploaded the three runtime secrets to the configured Cloudflare Worker.');
} catch {
  console.error('Runtime secret upload failed. Check local configuration and Cloudflare authentication.');
  process.exitCode = 1;
}
