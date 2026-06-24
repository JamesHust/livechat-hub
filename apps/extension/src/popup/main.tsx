import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createChatStore } from '@livechat-hub/core';
import { createSseTransport } from '@livechat-hub/transport';
import { applyThemeToElement, resolveTheme } from '@livechat-hub/themes';
import { ChatProvider, ChatWindow } from '@livechat-hub/ui';
import '@livechat-hub/ui/styles.css';
import './popup.css';

// Reuses the exact same core + transport + ui + renderers as the widget,
// demonstrating >90% shared code. Point this at your API (or the demo mock).
const API_URL = 'http://localhost:5173';

const transport = createSseTransport({ apiUrl: API_URL });
const store = createChatStore({ transport, tenantId: 'extension' });

const container = document.getElementById('root')!;
applyThemeToElement(document.documentElement, resolveTheme('auto'));

createRoot(container).render(
  <StrictMode>
    <ChatProvider store={store} locale="en">
      <ChatWindow />
    </ChatProvider>
  </StrictMode>,
);
