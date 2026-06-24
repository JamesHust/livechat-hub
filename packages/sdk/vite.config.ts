import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

// Builds a self-contained, framework-free bundle for `<script src>` embedding.
// React and all workspace packages are bundled in so partner sites need nothing.
// Tailwind compiles the `?inline` widget stylesheet injected into the Shadow DOM.
export default defineConfig({
  plugins: [tailwindcss(), react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/global.ts'),
      name: 'LiveChatHubGlobal',
      formats: ['iife'],
      fileName: () => 'livechat-sdk.js',
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
