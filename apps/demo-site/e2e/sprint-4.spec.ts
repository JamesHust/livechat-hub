import { test, expect } from '@playwright/test';
import { enterChat, gotoDemo, sendMessage } from './helpers';

test.beforeEach(async ({ page }) => {
  await gotoDemo(page);
});

test('gates a consequential frontend action behind a confirmation card', async ({ page }) => {
  const w = await enterChat(page);
  await sendMessage(page, 'Please delete the note');

  // The agent calls the browser-side `delete_note` tool (requireConfirmation),
  // so the widget shows an approval card before the handler ever runs — and the
  // note is still on the host page at this point.
  await expect(w.getByText(/delete the pinned note from the page/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('#demo-note')).toBeVisible();

  // Approving runs the handler (which removes the note) and the agent confirms.
  await w.getByRole('button', { name: 'Allow', exact: true }).click();
  await expect(w.getByText(/removed the pinned note/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#demo-note')).toHaveCount(0);
});

test('creates and lists multiple conversations', async ({ page }) => {
  const w = await enterChat(page);
  await sendMessage(page, 'Tell me about this project');
  await expect(w.getByText(/vertical slice/i)).toBeVisible({ timeout: 15_000 });

  // Open the multi-thread sheet; the current thread is auto-titled from its
  // first message.
  await w.getByRole('button', { name: 'Conversations', exact: true }).click();
  const sheet = w.getByRole('dialog', { name: 'Conversations' });
  await expect(sheet.getByRole('button', { name: /tell me about this project/i })).toBeVisible();

  // Start a fresh thread → back to the empty state.
  await sheet.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(w.getByText(/how can we help/i)).toBeVisible();

  // The earlier thread is still in the list.
  await w.getByRole('button', { name: 'Conversations', exact: true }).click();
  await expect(
    w
      .getByRole('dialog', { name: 'Conversations' })
      .getByRole('button', { name: /tell me about this project/i }),
  ).toBeVisible();
});

test('searches within the conversation and reports match count', async ({ page }) => {
  const w = await enterChat(page);
  await sendMessage(page, 'Tell me about this project');
  await expect(w.getByText(/vertical slice/i)).toBeVisible({ timeout: 15_000 });

  // Open search and query a word that appears only in the assistant reply.
  await w.getByRole('button', { name: 'Search messages', exact: true }).click();
  await w.getByPlaceholder(/search this conversation/i).fill('vertical');

  // One matching message → the "1/1" counter is shown.
  await expect(w.getByText('1/1')).toBeVisible();
});
