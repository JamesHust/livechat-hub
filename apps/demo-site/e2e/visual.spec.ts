import { test, expect } from '@playwright/test';
import { gotoDemo, widget } from './helpers';

/**
 * Visual regression (Sprint 5.5). Tagged `@visual` and **excluded from the
 * functional `test:e2e` gate** because screenshot baselines are platform-
 * specific (Playwright suffixes them per-OS/browser). Run and update with:
 *
 *   pnpm --filter @livechat-hub/demo-site test:visual
 *   pnpm --filter @livechat-hub/demo-site test:visual -- --update-snapshots
 *
 * The global config emulates `prefers-reduced-motion`, and `animations:
 * 'disabled'` freezes any CSS animation, so the captures are stable.
 */
test.describe('@visual', () => {
  test('widget panel — light', async ({ page }) => {
    await gotoDemo(page);
    const dialog = widget(page).getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Let brand fonts + layout settle before capturing.
    await page.waitForTimeout(500);
    await expect(dialog).toHaveScreenshot('panel-light.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('widget panel — dark', async ({ page }) => {
    await gotoDemo(page);
    await page.locator('#theme').click(); // demo wires this to setTheme('dark')
    const dialog = widget(page).getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(500);
    await expect(dialog).toHaveScreenshot('panel-dark.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });
});
