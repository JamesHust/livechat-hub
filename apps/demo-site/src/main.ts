import LiveChatHub from '@livechat-hub/sdk';
import { createDomActions } from '../dom-actions';
import './styles.css';

const log = document.getElementById('log')!;
const line = (msg: string) => {
  log.textContent += `${new Date().toLocaleTimeString()}  ${msg}\n`;
  log.scrollTop = log.scrollHeight;
};

// DOM-primitive frontend actions (Sprint 5.6) — the agent can read + operate the
// host page's signup form. Ask the widget to "fill the signup form".
const dom = createDomActions(line);

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
  suggestions: [
    'What is the weather?',
    'Change the background',
    'Delete the note',
    'Compare prices online',
  ],
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
    // Generic DOM primitives (read / fill / click) — the browser-use client-side pack.
    ...dom.actions,
  ],
  // Live context the agent receives on every run (AG-UI "readables"): the page
  // title, plus the interactive-element tree for the DOM primitives.
  context: [{ description: 'The demo page title', get: () => document.title }, dom.context],
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
  // Notifications: launcher badge + chime + OS/desktop notifications when a reply
  // lands while the panel is closed or the tab is backgrounded. Toggle sound in
  // the widget's settings; enable desktop notifications there too (asks for OS
  // permission from a user gesture). Ask the weather, then close the panel or
  // switch tabs to see the badge + chime + desktop notification arrive.
  notifications: { badge: true, sound: true, desktop: true, showPreview: true },
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
widget.on('unread', ({ total }) => line(`unread → ${total}`));
widget.on('notification', (n) => line(`notification → ${n.title || 'New reply'}`));

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
// Reflect the signup form submission (driven by the agent's dom.click) locally.
document.getElementById('signup')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = (document.getElementById('signup-name') as HTMLInputElement | null)?.value ?? '';
  const status = document.getElementById('signup-status');
  if (status) status.textContent = name ? `Subscribed — thanks, ${name}!` : 'Subscribed!';
  line(`form submitted → ${name || '(no name)'}`);
});
