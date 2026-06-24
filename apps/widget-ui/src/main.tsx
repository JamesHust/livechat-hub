import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createChatStore } from '@livechat-hub/core';
import { createSseTransport } from '@livechat-hub/transport';
import { applyThemeToElement, resolveTheme } from '@livechat-hub/themes';
import { ChatProvider, ChatWidget } from '@livechat-hub/ui';
import '@livechat-hub/ui/styles.css';
import './main.css';

const TENANT_ID = 'widget-ui-dev';

const transport = createSseTransport({
  // Same-origin: handled by the dev mock-agent middleware.
  apiUrl: import.meta.env.VITE_API_URL ?? window.location.origin,
});

const store = createChatStore({ transport, tenantId: TENANT_ID });

const container = document.getElementById('root')!;
applyThemeToElement(document.documentElement, resolveTheme('default'));

createRoot(container).render(
  <StrictMode>
    <ChatProvider store={store} locale="en">
      <ChatWidget defaultOpen />
    </ChatProvider>
  </StrictMode>,
);
