import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { mockAgentPlugin } from './mock-agent';
import { mockWsPlugin } from './mock-ws';

export default defineConfig({
  // Two mock backends over the same scenario engine on one path (/agent/run):
  // SSE via POST and a WebSocket via HTTP upgrade, so the demo can exercise both
  // transports without them colliding.
  plugins: [tailwindcss(), mockAgentPlugin(), mockWsPlugin()],
  server: { port: 5173 },
  build: { outDir: 'dist', sourcemap: true },
});
