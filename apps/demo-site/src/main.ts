import LiveChatHub from '@livechat-hub/sdk';
import './styles.css';

// This is exactly what a partner integration looks like — no React, no build
// knowledge of the internals; just the public SDK contract.
const widget = LiveChatHub.init({
  apiUrl: window.location.origin,
  tenantId: 'acme-demo',
  theme: 'default',
  locale: 'en',
  defaultOpen: true,
});

const log = document.getElementById('log')!;
const line = (msg: string) => {
  log.textContent += `${new Date().toLocaleTimeString()}  ${msg}\n`;
  log.scrollTop = log.scrollHeight;
};

widget.on('ready', () => line('widget ready'));
widget.on('open', () => line('panel opened'));
widget.on('close', () => line('panel closed'));
widget.on('run:status', (status) => line(`run status → ${status}`));
widget.on('message', (m) => line(`message (${m.role}) #${m.id.slice(0, 12)}`));
widget.on('error', (e) => line(`error: ${e.message}`));

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
