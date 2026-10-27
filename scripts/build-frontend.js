import { build } from 'esbuild';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { PAGE_HEADERS } from '../serverless/security.js';
mkdirSync('dist', { recursive: true });
for (const file of ['index.html', 'styles.css', 'icon.svg', 'manifest.webmanifest', 'sw.js', 'offline.html', 'icon-192.png', 'icon-512.png', 'favicon.svg', 'ntl-logo.png']) cpSync(`frontend/${file}`, `dist/${file}`);
await build({ entryPoints: ['frontend/app.js'], bundle: true, outfile: 'dist/app.js', format: 'esm', platform: 'browser', minify: true, target: ['es2022'] });
writeFileSync('dist/_headers', '/*\n' + Object.entries(PAGE_HEADERS).map(([name,value]) => `  ${name}: ${value}`).join('\n') + '\n');
console.log('Frontend built in dist/');
