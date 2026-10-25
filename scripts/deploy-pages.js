import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const directory = '.wrangler/pages-site';
mkdirSync(directory, { recursive: true });
cpSync('dist', `${directory}/dist`, { recursive: true });
cpSync('functions', `${directory}/functions`, { recursive: true });
writeFileSync(`${directory}/wrangler.jsonc`, JSON.stringify({ name: 'kairo-site', pages_build_output_dir: './dist', compatibility_date: '2026-10-01' }));
const result = spawnSync('npx', ['wrangler', 'pages', 'deploy', 'dist', '--project-name', 'kairo-site', '--branch', 'main'], { cwd: directory, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
