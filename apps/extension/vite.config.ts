import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [tailwindcss(), react(), crx({ manifest })],
  build: { outDir: 'dist', sourcemap: true },
  server: { port: 5175, strictPort: true },
});
