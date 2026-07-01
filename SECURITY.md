# Security Policy

LiveChat Hub is a **partner-embedded** widget: it runs inside third-party pages,
talks to a backend over an AG-UI event stream, and persists conversation data on
the end user's device. This document describes how to report vulnerabilities and
the security model partners should design around when embedding the widget.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead, use
GitHub's private vulnerability reporting on this repository
(**Security → Report a vulnerability**). Include a description, reproduction
steps, affected version, and impact. We aim to acknowledge reports within a few
business days and will coordinate a fix and disclosure timeline with you.

## Supported versions

The project is pre-1.0. Only the latest published `@livechat-hub/sdk` release
receives security fixes; pin a version and upgrade promptly.

## Embedding security model

### Shadow DOM isolation is for styling, not sandboxing

The widget mounts into an **open** Shadow DOM (`data-livechat-hub` host) to keep
its styles from leaking into — or being overridden by — the host page. This is a
CSS/DOM encapsulation boundary, **not** a security sandbox: script on the host
page can still reach into an open shadow root. Do not treat the widget as an
isolation boundary for untrusted host pages, and never place secrets in the DOM.

### Content Security Policy (CSP)

The widget needs the following sources. Tighten to your deployment; prefer a
nonce/hash over `'unsafe-inline'` where your stack supports it.

```
Content-Security-Policy:
  script-src  'self' https://your-cdn.example.com;   # the livechat-sdk.js bundle
  connect-src 'self' https://api.example.com;         # apiUrl (SSE / fetch)
  style-src   'self' 'unsafe-inline';                 # scoped stylesheet + inline style attrs
  font-src    https://fonts.gstatic.com;              # brand fonts loaded into the shadow root
  img-src     'self' data: blob: https:;              # avatars, attachment previews
```

- The widget injects a compiled stylesheet and inline `style` attributes into the
  shadow root; both are governed by `style-src`.
- It loads Plus Jakarta Sans / JetBrains Mono from Google Fonts. Self-host the
  fonts and drop `fonts.gstatic.com` if you disallow third-party origins.
- Streaming uses `fetch` + `ReadableStream` against `apiUrl` — allow it under
  `connect-src`.

### Authentication & token handling

Auth is provided by the host, never hard-coded in the widget:

- Supply a **short-lived** bearer token via `resilience.getAuthToken()`. It is
  attached as `Authorization: Bearer …` on every run request.
- On `401`/`403` mid-run, the transport invokes `resilience.onAuthError(status)`
  **once** to let you refresh credentials, then retries a single time with the
  fresh token from `getAuthToken()`.
- On `429`, the transport honors `Retry-After` before backing off.

Guidance: mint per-session tokens scoped to a single tenant/user, keep TTLs
short, and enforce all authorization **server-side**. The `tenantId` sent by the
client is a routing hint, not a trust boundary.

### Client-side rate limiting & resilience

Reconnection is bounded to avoid hammering the backend: exponential backoff with
full jitter, capped by `resilience.maxRetries` (default `5`) and an idle-stream
timeout (`idleTimeoutMs`, default `30s`). These are **best-effort** client
protections; the backend must enforce its own rate limits and quotas.

### Data persistence & privacy

Conversation history and composer drafts are stored **on the user's device**
(IndexedDB, with a localStorage fallback), keyed by tenant/session. This may
include user-entered PII. Consider:

- Calling `destroy()` and clearing storage on logout / session end.
- Communicating retention behavior in your own privacy policy.
- That anyone with access to the browser profile can read stored conversations.

### Rendering untrusted agent output

Assistant messages arrive over the wire and are rendered through the message-part
renderers. Treat all backend/agent output as untrusted data: do not add renderers
that inject raw HTML from event payloads, and sanitize any host-provided
generative-UI components you register. Keep the message schema extensions
(`MessagePart`) declarative.
