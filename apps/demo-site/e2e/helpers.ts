import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The widget mounts inside an open Shadow DOM on a host element tagged
 * `data-livechat-hub`. Playwright pierces open shadow roots, so scoping every
 * query to this host keeps widget locators from colliding with the surrounding
 * demo page (which has its own "Open chat" / "Send" buttons).
 */
export function widget(page: Page): Locator {
  return page.locator('[data-livechat-hub]');
}

/** Load the demo and wait for the SDK to finish booting. */
export async function gotoDemo(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#log')).toContainText('widget ready');
}

/**
 * Open the panel if needed and clear the guest onboarding gate, returning the
 * widget scope ready to chat (composer visible).
 */
export async function enterChat(page: Page, name = 'Playwright'): Promise<Locator> {
  const w = widget(page);
  const dialog = w.getByRole('dialog');
  if (!(await dialog.isVisible().catch(() => false))) {
    await w.getByRole('button', { name: 'Open chat', exact: true }).click();
  }
  await expect(dialog).toBeVisible();

  // Guests (no host-supplied userId, as in the demo) must enter a display name
  // before reaching the conversation; returning guests skip this.
  const nameInput = w.getByLabel(/enter your name/i);
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill(name);
    await w.getByRole('button', { name: /start chatting/i }).click();
  }
  await expect(w.getByLabel(/type a message/i)).toBeVisible();
  return w;
}

/** Type into the composer and send. Assumes the composer is visible. */
export async function sendMessage(page: Page, text: string): Promise<void> {
  const w = widget(page);
  await w.getByLabel(/type a message/i).fill(text);
  await w.getByRole('button', { name: 'Send', exact: true }).click();
}
