import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createChatStore } from '@livechat-hub/core';
import { createSseTransport } from '@livechat-hub/transport';
import { applyThemeToElement, resolveTheme } from '@livechat-hub/themes';
import {
  ChatProvider,
  ChatWidget,
  type GenerativeComponentMap,
  type GenerativeComponentProps,
} from '@livechat-hub/ui';
import '@livechat-hub/ui/styles.css';
import './main.css';

const TENANT_ID = 'widget-ui-dev';

const transport = createSseTransport({
  // Same-origin: handled by the dev mock-agent middleware.
  apiUrl: import.meta.env.VITE_API_URL ?? window.location.origin,
});

const store = createChatStore({ transport, tenantId: TENANT_ID });

/**
 * Generative UI: the agent renders this by name via a `CUSTOM_UI` event
 * (`{ component: 'weather-card', props: {...} }`) instead of plain text. The
 * model fills `props`; the host owns the presentation. Ask about the weather
 * to see it. Values are agent-supplied data (not UI chrome); a real card with
 * its own labels would localize them via `context.t`.
 *
 * No own entrance animation: like every other message part (text, tool-call),
 * it renders inside the message bubble, which already animates in on mount —
 * self-animating one part would be inconsistent and fire in the stream path.
 */
function WeatherCard({ props }: GenerativeComponentProps) {
  const city = typeof props.city === 'string' ? props.city : '';
  const tempC = typeof props.tempC === 'number' ? props.tempC : null;
  const condition = typeof props.condition === 'string' ? props.condition : '';
  return (
    <div className="bg-card my-1 flex items-center justify-between gap-4 rounded-xl border p-3">
      <div>
        <div className="text-foreground text-sm font-medium">{city}</div>
        <div className="text-muted-foreground text-xs">{condition}</div>
      </div>
      {tempC != null && <div className="text-foreground text-2xl font-semibold">{tempC}°</div>}
    </div>
  );
}

const components: GenerativeComponentMap = { 'weather-card': WeatherCard };

const container = document.getElementById('root')!;
applyThemeToElement(document.documentElement, resolveTheme('default'));

createRoot(container).render(
  <StrictMode>
    <ChatProvider store={store} components={components} locale="en">
      <ChatWidget defaultOpen />
    </ChatProvider>
  </StrictMode>,
);
