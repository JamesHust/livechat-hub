import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { mockAgentPlugin } from './mock-agent';

export default defineConfig({
  plugins: [tailwindcss(), mockAgentPlugin()],
  server: { port: 5173 },
  build: { outDir: 'dist', sourcemap: true },
});
