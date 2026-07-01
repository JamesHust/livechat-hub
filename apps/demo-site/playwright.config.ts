import { defineConfig, devices } from '@playwright/test';

// E2E runs against the partner-site demo, which bundles the mock AG-UI SSE
// backend as Vite dev middleware (see mock-agent.ts). We therefore drive the
// *dev* server, not `vite preview` — the mock only exists in `configureServer`.
const PORT = Number(process.env.PORT ?? 5173);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Fail CI if a stray `test.only` was committed; locally it's allowed.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    // Collapse the widget's framer-motion enter/exit so assertions don't race
    // animation frames; functional coverage, not motion coverage.
    reducedMotion: 'reduce',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
