<div align="center">

<img src=".github/assets/banner.svg" alt="LiveChat Hub — the AI-provider-agnostic live chat frontend platform" width="100%" />

<p>
  <a href="https://github.com/JamesHust/livechat-hub/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/JamesHust/livechat-hub/ci.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=CI&color=1856FF"></a>
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.0-1856FF?style=flat-square">
  <img alt="TypeScript strict" src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react&logoColor=white">
  <img alt="pnpm workspaces" src="https://img.shields.io/badge/pnpm-workspaces-F69220?style=flat-square&logo=pnpm&logoColor=white">
  <img alt="Turborepo" src="https://img.shields.io/badge/Turborepo-monorepo-EF4444?style=flat-square&logo=turborepo&logoColor=white">
  <img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-07CA6B?style=flat-square">
</p>

<p>
  <a href="#getting-started"><b>Getting Started</b></a> ·
  <a href="#architecture-in-one-diagram"><b>Architecture</b></a> ·
  <a href="#embedding-production"><b>Embedding</b></a> ·
  <a href="docs/BACKEND.md"><b>Backend Contract</b></a>
</p>

</div>

---

A production-ready, **AI-provider-agnostic** live chat frontend platform. The UI
talks to the backend only through an **AG-UI compatible event protocol** and a
**Vercel-AI-SDK-inspired message model**, so any agent framework can power it
without UI rewrites.

## Monorepo layout

```
apps/
  widget-ui    Standalone widget harness (dev/QA), builds an embeddable bundle
  demo-site    Partner-website integration simulator (+ mock AG-UI SSE backend)
  extension    Chrome Extension (MV3) reusing the shared widget UI

packages/
  shared       Types, enums, constants, i18n, theme contracts (no runtime deps)
  transport    AG-UI event protocol: definitions, parsing, validation, SSE adapter
  core         Headless Zustand stores + streaming orchestration (no React)
  renderers    React renderers per message part (override-able)
  ui           Reusable React components (ChatWindow, Composer, …)
  themes       Theme tokens, light/dark, CSS-variable contract + base stylesheet
  sdk          Public SDK: Shadow DOM bootstrap, mounting, public API

tooling/
  eslint-config   Shared flat ESLint config (base + React presets)
  tsconfig        Shared TypeScript configs
```

## Architecture in one diagram

```
Partner site → SDK → Shadow DOM → ui (React) → core store → transport → SSE → Go backend → AI agent
```

The frontend never imports any AI provider SDK. Data flows in as AG-UI events;
the core store folds them into the canonical `UIMessage[]`; renderers display
each `MessagePart`. See [`docs/BACKEND.md`](docs/BACKEND.md) for the contract the
separate `livechat-api` (Go) repo must implement.

## Getting started

### Prerequisites

- **Node.js** ≥ 18 and **pnpm** (`npm install -g pnpm` if you don't have it).

```bash
node -v
pnpm -v
```

### Run the demo (step by step)

1. **Open a terminal at the repo root.**

   ```bash
   cd "<path>/livechat-hub"
   ```

2. **Install dependencies** (first time only).

   ```bash
   pnpm install
   ```

3. **Start the partner-site demo** — the main "run it" target, bundled with a
   mock AG-UI SSE backend so no Go backend is required.

   ```bash
   pnpm --filter @livechat-hub/demo-site dev
   ```

4. **Open the URL the terminal prints** (e.g. `http://localhost:5173/`).

   > If port `5173` is already in use, Vite automatically falls back to the next
   > free port (e.g. `5174`) — always open the exact URL shown in the terminal.

5. **Try it out:** open the chat bubble and ask about the **weather** to see a
   full streamed tool-call lifecycle (`RUN_STARTED` → `TOOL_CALL_*` →
   `TEXT_MESSAGE_CONTENT` deltas → `RUN_FINISHED`) rendered end-to-end.

6. **Stop the server** with `Ctrl + C` in the terminal.

### Other run targets

```bash
# Standalone widget harness:
pnpm --filter @livechat-hub/widget-ui dev      # http://localhost:5174

# Everything:
pnpm dev
```

## Quality

```bash
pnpm typecheck   # tsc --noEmit across the graph
pnpm lint        # ESLint (flat config)
pnpm test        # Vitest unit/component tests
pnpm test:e2e    # Playwright E2E against the demo (mock backend)
pnpm build       # Turborepo build (SDK + apps bundles)
pnpm size        # Bundle-size budget for the embed bundle (after build)
```

> First E2E run: install the browser once with `pnpm --filter @livechat-hub/demo-site exec playwright install chromium`.
> Releases are managed with [Changesets](docs/RELEASING.md) (`pnpm changeset`).

## Embedding (production)

Build the self-contained bundle with `pnpm --filter @livechat-hub/sdk build`
(emits `packages/sdk/dist/livechat-sdk.js`) and host it on your CDN. The bundle
inlines React and every workspace package, so a partner page needs nothing else:

```html
<script src="https://your-cdn.example.com/livechat-sdk.js"></script>
<script>
  LiveChatHub.init({
    apiUrl: 'https://api.example.com',
    tenantId: 'tenant_123',
    theme: 'default',
  });
</script>
```

### Authenticated backends

Pass short-lived tokens through the `resilience` hooks — the transport attaches
`Authorization: Bearer …` to every run, refreshes once on `401`/`403`, and
honors `Retry-After` on `429`:

```js
LiveChatHub.init({
  apiUrl: 'https://api.example.com',
  tenantId: 'tenant_123',
  resilience: {
    getAuthToken: () => sessionStore.getToken(), // called per request
    onAuthError: async () => sessionStore.refresh(), // called once on 401/403
  },
});
```

### Async loading (non-blocking snippet)

To keep the widget off the critical path, load the bundle **asynchronously** and
queue any calls made before it finishes downloading (the Intercom/Segment
pattern). The stub buffers `LiveChatHub.*(…)` calls into a queue; the real bundle
replays them in order on load:

```html
<script>
  (function (w, d, s, u) {
    var q = [];
    var stub = { _q: q };
    [
      'init',
      'open',
      'close',
      'toggle',
      'sendMessage',
      'setTheme',
      'identify',
      'updateConfig',
      'sendProactiveMessage',
      'requestCsat',
      'on',
      'off',
      'onEvent',
      'destroy',
    ].forEach(function (m) {
      stub[m] = function () {
        q.push([m, arguments]);
        return stub;
      };
    });
    w.LiveChatHub = w.LiveChatHub || stub;
    var el = d.createElement(s);
    el.async = 1;
    el.src = u;
    d.head.appendChild(el);
  })(window, document, 'script', 'https://your-cdn.example.com/livechat-sdk.js');

  // These run immediately against the stub and replay once the bundle loads:
  LiveChatHub.init({ apiUrl: 'https://api.example.com', tenantId: 'tenant_123' });
  LiveChatHub.identify({ userId: 'u_1', name: 'Ada Lovelace' });
</script>
```

### Identify users & runtime config

The `LiveChatHub` object mirrors the instance methods as singleton helpers that
act on the active widget — so you can drive it without holding the handle:

```js
// Attach / update the end-user identity (forwarded to the agent on the next run):
LiveChatHub.identify({ userId: 'u_1', name: 'Ada', email: 'ada@x.io', traits: { plan: 'pro' } });

// Patch presentation config at runtime — no re-init, conversation preserved:
LiveChatHub.updateConfig({ locale: 'vi', theme: 'dark', suggestions: ['Track my order'] });
```

`updateConfig` applies `theme` / `colorScheme` / `themeOverrides`, `locale`,
`strings`, and `suggestions` live. Transport-level fields (`apiUrl`, `tenantId`,
`transport`) are fixed at mount and require a re-init.

### Analytics & telemetry

Pipe every lifecycle event into your own analytics/observability, or wire a
dedicated error channel:

```js
LiveChatHub.init({
  apiUrl: 'https://api.example.com',
  tenantId: 'tenant_123',
  analytics: {
    onEvent: ({ name, payload }) => analytics.track(`chat:${name}`, payload),
    onError: ({ message, code }) => Sentry.captureMessage(`${code ?? 'run'} — ${message}`),
  },
});

// Or subscribe imperatively (returns an unsubscribe fn):
const off = LiveChatHub.onEvent(({ name }) => console.debug('lch', name));
```

Events: `ready`, `open`, `close`, `message`, `run:status`, `error`, `feedback`,
`identify`, `config`, `presence`, `handoff`, `csat`, `destroy`.

### Live-chat lifecycle

```js
// Presence + human-agent handoff are backend-driven (published into the shared
// agent state) — observe them:
LiveChatHub.on('presence', (p) => console.log('agent is', p)); // 'online' | 'away' | 'offline'
LiveChatHub.on('handoff', (h) => console.log('handoff', h.status, h.agentName));

// A proactive greeting after 8s on the page (or fire your own on scroll/URL):
LiveChatHub.init({
  apiUrl: 'https://api.example.com',
  tenantId: 'tenant_123',
  proactive: { message: '👋 Need a hand finding something?', delayMs: 8000 },
});
LiveChatHub.sendProactiveMessage('Still there? Happy to help.');

// End-of-chat satisfaction survey — show it, then collect the rating:
LiveChatHub.requestCsat();
LiveChatHub.on('csat', ({ rating, comment }) => analytics.track('csat', { rating, comment }));
```

### Hardening & distribution

- **CSP + auth + storage model:** see [`SECURITY.md`](SECURITY.md) for the
  Content-Security-Policy the widget needs and its data-persistence behavior.
- **Bundle size** is a tracked KPI — CI enforces a gzip budget on the embed
  bundle (`pnpm size`).
- **API reference:** `pnpm docs:api` generates typed docs for the public SDK
  surface into `docs/api/`.
- **Releases & npm:** see [`docs/RELEASING.md`](docs/RELEASING.md).

## Design notes

- **Internal packages are consumed as TypeScript source** — apps bundle them
  directly via Vite, so there is no per-package build step (faster, simpler).
  Only the SDK and apps emit bundles.
- **Renderer overrides**: pass `renderers={{ image: MyImage }}` to `ChatProvider`
  or `renderers` to `LiveChatHub.init` to replace any part renderer.
- **White-label**: every visual is a `--lch-*` CSS variable; `themeOverrides`
  patches them at runtime without a rebuild.
