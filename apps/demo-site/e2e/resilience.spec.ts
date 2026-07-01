import { test, expect } from '@playwright/test';
import { enterChat, gotoDemo, sendMessage, widget } from './helpers';

test.beforeEach(async ({ page }) => {
  await gotoDemo(page);
});

test('reconnects mid-stream and resumes the reply without duplication', async ({ page }) => {
  await enterChat(page);

  // The "flaky" prompt makes the mock backend drop the socket after the first
  // words, with no terminal event. The transport reconnects with Last-Event-ID
  // and the mock resumes the SAME assistant message from where it left off.
  await sendMessage(page, 'flaky please');

  await expect(widget(page).getByText(/stream resumed without losing your reply/i)).toBeVisible({
    timeout: 20_000,
  });

  // The pre-drop half and the resumed half must land in ONE bubble — the
  // Last-Event-ID dedupe prevents a duplicated "Reconnected" fragment.
  await expect(widget(page).getByText(/Reconnected/)).toHaveCount(1);
});
