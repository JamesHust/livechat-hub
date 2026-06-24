import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { mockAgentPlugin } from './mock-agent';

export default defineConfig({
  plugins: [tailwindcss(), react(), mockAgentPlugin()],
  server: { port: 5174 },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
