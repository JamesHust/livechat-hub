import { test, expect } from '@playwright/test';
import { enterChat, gotoDemo, sendMessage, widget } from './helpers';

test.beforeEach(async ({ page }) => {
  await gotoDemo(page);
});

test('opens and closes the chat panel from the launcher', async ({ page }) => {
  const w = widget(page);
  // The demo boots with `defaultOpen`, so the panel is already up.
  await expect(w.getByRole('dialog')).toBeVisible();

  // "Close chat" is the aria-label on both the launcher and the header button;
  // scope to the dialog to hit the in-panel one unambiguously.
  await w.getByRole('dialog').getByRole('button', { name: 'Close chat', exact: true }).click();
  await expect(w.getByRole('dialog')).toBeHidden();

  await w.getByRole('button', { name: 'Open chat', exact: true }).click();
  await expect(w.getByRole('dialog')).toBeVisible();
});

test('guest can send a message and receive a streamed reply', async ({ page }) => {
  await enterChat(page);
  await sendMessage(page, 'Tell me about this project');

  // The mock streams a multi-word answer token by token; asserting on a
  // distinctive phrase proves the SSE → store → renderer path completed.
  await expect(widget(page).getByText(/vertical slice/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#log')).toContainText('message (assistant)');
});

test('streams a full tool-call lifecycle for the weather prompt', async ({ page }) => {
  await enterChat(page);
  await sendMessage(page, 'What is the weather?');

  // RUN_STARTED → TOOL_CALL_* → TOOL_CALL_RESULT → TEXT deltas → RUN_FINISHED.
  // The tool call surfaces its (humanized) name, then the tool-informed answer
  // streams in; seeing the final answer proves the whole lifecycle completed.
  await expect(widget(page).getByText(/get weather/i).first()).toBeVisible({ timeout: 15_000 });
  // "…and sunny" is unique to the streamed answer (the tool-result JSON says
  // "condition": "Sunny", which /sunny/ would also match).
  await expect(widget(page).getByText(/and sunny/i)).toBeVisible({ timeout: 15_000 });
});

test('host page can toggle the widget color scheme', async ({ page }) => {
  const root = widget(page).locator('.lch-root');
  await expect(root).toHaveAttribute('data-lch-color-scheme', 'light');

  await page.locator('#theme').click(); // demo wires this to widget.setTheme('dark')
  await expect(root).toHaveAttribute('data-lch-color-scheme', 'dark');
});

test('switches the widget UI locale at runtime', async ({ page }) => {
  const w = await enterChat(page);

  await w.getByRole('button', { name: 'Settings', exact: true }).click();
  await w.getByRole('radio', { name: 'Tiếng Việt' }).click();

  // The composer placeholder is localized; its Vietnamese form confirms the
  // whole UI re-rendered in the new locale.
  await expect(w.getByLabel(/nhập tin nhắn/i)).toBeVisible();
});
