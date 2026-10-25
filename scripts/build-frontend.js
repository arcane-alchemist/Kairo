import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('dist', { recursive: true });
for (const file of ['index.html', 'styles.css', 'icon.svg', 'manifest.webmanifest', 'sw.js', 'offline.html', 'icon-192.png', 'icon-512.png']) cpSync(`frontend/${file}`, `dist/${file}`);
await build({ entryPoints: ['frontend/app.js'], bundle: true, outfile: 'dist/app.js', format: 'esm', platform: 'browser', minify: true, target: ['es2022'] });
console.log('Frontend built in dist/');
