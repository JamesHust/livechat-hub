import LiveChatHub from '@livechat-hub/sdk';
import './styles.css';

const log = document.getElementById('log')!;
const line = (msg: string) => {
  log.textContent += `${new Date().toLocaleTimeString()}  ${msg}\n`;
  log.scrollTop = log.scrollHeight;
};

// Pick the transport with `?transport=ws` to stream over the WebSocket mock
// (default is SSE). Both replay the same scenario engine.
const useWs = new URLSearchParams(window.location.search).get('transport') === 'ws';

// This is exactly what a partner integration looks like — no React, no build
// knowledge of the internals; just the public SDK contract.
const widget = LiveChatHub.init({
  // Both transports resolve to /agent/run (SSE via POST, WS via upgrade), so the
  // apiUrl is the same; the WebSocket transport upgrades http→ws internally.
  apiUrl: window.location.origin,
  tenantId: 'acme-demo',
  transport: useWs ? 'websocket' : 'sse',
  theme: 'default',
  locale: 'en',
  defaultOpen: true,
  // Suggested prompts shown on the empty state — click one to start chatting.
  suggestions: ['What is the weather?', 'Change the background', 'Delete the note'],
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
    {
      // A *consequential* frontend action: gated by requireConfirmation, so the
      // widget shows an approval card before the handler ever runs (HITL for
      // browser-side actions). Ask the widget to "delete the note".
      name: 'delete_note',
      description: 'Delete the pinned note from the demo page. Args: {}',
      parameters: { type: 'object', properties: {} },
      requireConfirmation: true,
      confirmationMessage: 'Delete the pinned note from the page? This cannot be undone.',
      handler: () => {
        const note = document.getElementById('demo-note');
        note?.remove();
        line('frontend action → delete_note (approved)');
        return { ok: true, deleted: Boolean(note) };
      },
    },
  ],
  // Live context the agent receives on every run (an AG-UI "readable").
  context: [{ description: 'The demo page title', get: () => document.title }],
  // Full end-user identity (Intercom-style) — forwarded to the agent; update it
  // later with `widget.identify(...)` without a re-init.
  user: { userId: 'demo-user', name: 'Demo Guest', traits: { plan: 'trial' } },
  // Telemetry tap: mirror every lifecycle event into the host's analytics sink.
  analytics: {
    onEvent: ({ name }) => line(`analytics → ${name}`),
    onError: ({ message }) => line(`analytics error → ${message}`),
  },
  // Proactive/triggered greeting: nudge after 10s on the page (a time trigger).
  proactive: { message: '👋 Looking for something? Ask me anything.', delayMs: 10_000 },
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
widget.on('presence', (p) => line(`presence → ${p}`));
widget.on('handoff', (h) => line(`handoff → ${h.status}${h.agentName ? ` (${h.agentName})` : ''}`));
widget.on('csat', (c) => line(`csat → ${c.rating}★${c.comment ? ` "${c.comment}"` : ''}`));

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
document.getElementById('csat')?.addEventListener('click', () => {
  widget.open();
  widget.requestCsat();
});
