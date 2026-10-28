import { defineConfig } from 'astro/config';

export default defineConfig({
  srcDir: './frontend',
  output: 'static',
  outDir: './dist',
  vite: {build: {assetsInlineLimit: 0}}
});
