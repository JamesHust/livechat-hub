import LiveChatHub from '@livechat-hub/sdk';
import './styles.css';

const log = document.getElementById('log')!;
const line = (msg: string) => {
  log.textContent += `${new Date().toLocaleTimeString()}  ${msg}\n`;
  log.scrollTop = log.scrollHeight;
};

// This is exactly what a partner integration looks like — no React, no build
// knowledge of the internals; just the public SDK contract.
const widget = LiveChatHub.init({
  apiUrl: window.location.origin,
  tenantId: 'acme-demo',
  theme: 'default',
  locale: 'en',
  defaultOpen: true,
  // Suggested prompts shown on the empty state — click one to start chatting.
  suggestions: ['What is the weather?', 'Change the background', 'Delete a file'],
  // Frontend tools: the agent can act on THIS page, not just reply. Ask the
  // widget to "change the background" to see the agent call this in the browser.
  actions: [
    {
      name: 'set_page_background',
      description: 'Change the demo page background color. Args: { color: CSS color string }',
      parameters: {
        type: 'object',
        properties: { color: { type: 'string', description: 'Any CSS color' } },
        required: ['color'],
      },
      handler: ({ color }) => {
        document.body.style.backgroundColor = String(color);
        line(`frontend action → set_page_background(${String(color)})`);
        return { ok: true, applied: color };
      },
    },
  ],
  // Live context the agent receives on every run (an AG-UI "readable").
  context: [{ description: 'The demo page title', get: () => document.title }],
});

widget.on('ready', () => line('widget ready'));
widget.on('open', () => line('panel opened'));
widget.on('close', () => line('panel closed'));
widget.on('run:status', (status) => line(`run status → ${status}`));
widget.on('message', (m) => line(`message (${m.role}) #${m.id.slice(0, 12)}`));
widget.on('error', (e) => line(`error: ${e.message}`));
widget.on('feedback', (f) =>
  line(`feedback → ${f.value ?? 'cleared'} on #${f.messageId.slice(0, 12)}`),
);

let dark = false;
document.getElementById('open')?.addEventListener('click', () => widget.toggle());
document.getElementById('theme')?.addEventListener('click', () => {
  dark = !dark;
  widget.setTheme(dark ? 'dark' : 'default');
  line(`theme → ${dark ? 'dark' : 'default'}`);
});
document.getElementById('send')?.addEventListener('click', () => {
  widget.open();
  widget.sendMessage('What is the weather?');
});
