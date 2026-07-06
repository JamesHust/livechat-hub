# Backend Contract (`livechat-api`)

The backend lives in a **separate Go repository** and is out of scope here. The
frontend depends only on this contract — never on which AI framework is used.

## Endpoint

```
POST {apiUrl}/agent/run
Accept: text/event-stream
Content-Type: application/json
```

### Request body

```jsonc
{
  "threadId": "conv_…", // the active conversation id — one thread per conversation
  "tenantId": "tenant_123",
  "userId": "optional",
  "messages": [
    /* UIMessage[] — full conversation so far */
  ],
  "tools": [
    /* FrontendTool[] — browser-side tools the agent may call (see below) */
  ],
  "context": [
    /* ContextItem[] — live host-page context ({ description, value }) */
  ],
  "resume": [
    /* InterruptResolution[] — present only when resuming a paused run (see below) */
  ],
  "state": {}, // shared agent state the frontend owns (mirrored via STATE_*)
  "metadata": {},
}
```

> **Threads.** `threadId` is the **active conversation id**, not a per-session
> singleton — the widget is multi-thread, so a user has several conversations and
> switches between them. Key any server-side run/resume state by `threadId` so
> each conversation streams and resumes independently.

### Response

An SSE stream of AG-UI events, one JSON object per `data:` frame. Terminate with
`data: [DONE]` or a `RUN_FINISHED` / `RUN_ERROR` event, or by closing the stream.
Required ordering for a text turn:

```
RUN_STARTED → TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT* → TEXT_MESSAGE_END → RUN_FINISHED
```

Each frame **should** carry a monotonic `id:` field:

```
id: 42
data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg_1","delta":"Hello"}

```

The client tracks the last id it received and dedupes replayed frames by id, so
ids must be **stable across a reconnect** (see _Resilience_ below).

## Event types

| Event                          | Required fields                                  |
| ------------------------------ | ------------------------------------------------ |
| `RUN_STARTED` / `RUN_FINISHED` | `runId`                                          |
| `RUN_ERROR`                    | `message` (`code?`)                              |
| `TEXT_MESSAGE_START`           | `messageId` (`role?`)                            |
| `TEXT_MESSAGE_CONTENT`         | `messageId`, `delta`                             |
| `TEXT_MESSAGE_END`             | `messageId`                                      |
| `REASONING_START/CONTENT/END`  | `messageId` (+ `delta` for CONTENT)              |
| `TOOL_CALL_START`              | `messageId`, `toolCallId`, `toolName`            |
| `TOOL_CALL_ARGS`               | `toolCallId`, `delta` (streamed JSON)            |
| `TOOL_CALL_END`                | `toolCallId`                                     |
| `TOOL_CALL_RESULT`             | `messageId`, `toolCallId`, `result` (`isError?`) |
| `STATE_SNAPSHOT`               | `snapshot`                                       |
| `STATE_DELTA`                  | `delta` (RFC 6902 JSON Patch ops)                |
| `ARTIFACT_UPDATE`              | `artifactId`, `kind`, `payload`                  |
| `CUSTOM_UI`                    | `component`, `props` (renders as a canvas part)  |

The exact TypeScript shapes are the source of truth — see
[`packages/transport/src/events.ts`](../packages/transport/src/events.ts).

## Human-in-the-loop (interrupts)

An agent can pause mid-run to ask the user for approval or input (e.g. "Allow
sending this email?"). Finish the run with an **interrupt outcome** instead of a
plain `RUN_FINISHED`:

```jsonc
{
  "type": "RUN_FINISHED",
  "runId": "run_1",
  "outcome": {
    "type": "interrupt",
    "interrupts": [
      {
        "id": "int_1",
        "kind": "approval",
        "message": "Allow sending email?",
        "value": {
          /* … */
        },
      },
      // kind: "input" prompts for free text instead of accept/reject
    ],
  },
}
```

The run enters `interrupted`; the widget shows an approval/input card and, once
the user answers, repeats the `POST` with `resume: InterruptResolution[]`
(`{ id, value }` per open interrupt — e.g. `{ approved: true }` or `{ text }`).
Resume the same `threadId` and continue the turn.

## Frontend tools (browser-side actions)

`tools` advertises actions the agent can run **in the user's browser** (navigate,
change the page, delete something…). To invoke one, emit the normal
`TOOL_CALL_*` events with its `toolName` and finish the run **without** a
`TOOL_CALL_RESULT`. The client executes the handler (optionally gating a
consequential one behind a user confirmation) and starts a **follow-up run** with
the tool's `tool-result` already in `messages` — read it and continue. This is
the same wire shape as a backend tool; only the missing result distinguishes it.

## Resilience & reconnection

The SSE transport is built to survive flaky networks. The backend should
cooperate with these client behaviors:

- **Reconnect + backoff.** If the stream drops before a terminal event
  (`RUN_FINISHED` / `RUN_ERROR` / `[DONE]`), the client reconnects with
  exponential backoff + jitter, up to `maxRetries` (default 5) attempts, before
  reporting the run `failed`. Tuning lives in `TRANSPORT_DEFAULTS`
  ([`packages/shared/src/constants.ts`](../packages/shared/src/constants.ts)).
- **Resume via `Last-Event-ID`.** On reconnect the client repeats the same
  `POST` with a `Last-Event-ID: <id>` header carrying the last `id:` it saw.
  The backend **should resume after that id** (not replay the whole run). If it
  can only replay from the start, that is still safe: the client dedupes frames
  whose `id` it has already delivered, so streamed text is never doubled.
- **Idle timeout + heartbeat.** The client aborts and reconnects a stream that
  sends no bytes for `idleTimeoutMs` (default 30s). To keep a slow run alive,
  emit an SSE **comment heartbeat** (`:\n\n`, optionally `: ping`) well under
  that interval; any frame — data or comment — resets the client's watchdog.
- **Auth (`401` / `403`).** The client attaches `Authorization: Bearer <token>`
  from `config.resilience.getAuthToken`. On a `401`/`403` it invokes
  `config.resilience.onAuthError` once (refresh your session there) and retries
  the request a single time with a freshly fetched token.
- **Rate limiting (`429`).** The client honors a `Retry-After` header
  (delta-seconds or HTTP-date) before retrying; absent the header it falls back
  to normal backoff.

## Reference mock

[`apps/demo-site/mock-agent.ts`](../apps/demo-site/mock-agent.ts) implements this
contract as Vite dev middleware and is the canonical example to port to Go — it
emits monotonic `id:` frames per the resume contract above.

## Attachments (images, files, video, voice)

User attachments travel as ordinary message **parts** inside the `messages`
array — `image`, `video`, `audio`, and `file` (see
[`packages/shared/src/types/message.ts`](../packages/shared/src/types/message.ts)).
No separate upload endpoint is part of this contract.

Two ways the `url` on those parts is produced, decided entirely on the client:

- **No upload service (default).** The widget inlines each file as a `data:` URL,
  so it arrives self-contained in the request JSON. Fine for small media and the
  demo; large files bloat the payload.
- **With an upload service.** A deployment passes `config.uploadFile(file) →
{ url }` (see [`LiveChatConfig`](../packages/shared/src/types/config.ts)); the
  widget uploads first and sends only the resulting fetchable URL. The upload
  service itself is out of scope for this contract — wire it to your own storage.

The backend therefore treats attachment URLs as opaque: fetch/forward them to the
agent as needed. Voice messages are an `audio` part (commonly `audio/webm`) with
an optional `durationMs`.

## WebSocket transport

`createWebSocketTransport`
([`packages/transport/src/websocket.ts`](../packages/transport/src/websocket.ts))
is a full-duplex alternative to SSE, selected with `config.transport:
'websocket'`. It speaks the **same AG-UI events**; only the framing differs, so
`core` / `ui` / `renderers` are untouched. One socket is opened per run and
reconnects/resumes with the same backoff + idle rules as SSE.

Because browsers can't set WebSocket request headers, tenant and auth ride in the
run frame payload rather than headers. The wire format:

| Direction       | Frame                                                                      | Purpose                                                                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| client → server | `{"type":"run","runKey":"…","payload":<RunInput>,"token"?,"lastEventId"?}` | Start (or resume) a run. `payload` is the same body as the SSE POST.                                                                                                                                                         |
| client → server | `{"type":"ping"}`                                                          | App-level keepalive (browsers can't send native ping frames).                                                                                                                                                                |
| server → client | `{"type":"event","runKey":"…","id":"<seq>","event":<AgUiEvent>}`           | One AG-UI event. `id` is the monotonic resume cursor (like the SSE `id:` line); echoed back as `lastEventId` on reconnect so the client dedupes replayed frames. `runKey` lets a multiplexing backend address the right run. |
| server → client | `<AgUiEvent>` (bare object)                                                | Accepted too, for simple single-run backends that don't multiplex.                                                                                                                                                           |
| server → client | `{"type":"pong"}`                                                          | Optional keepalive ack; resets the client's idle watchdog.                                                                                                                                                                   |

Terminate a run by sending `RUN_FINISHED` / `RUN_ERROR` as usual. If the socket
closes before a terminal event, the client reconnects with the last `id` in
`lastEventId` and expects the run to resume (replayed frames are deduped by `id`).

A reference implementation is
[`apps/demo-site/mock-ws.ts`](../apps/demo-site/mock-ws.ts) — it shares the SSE
mock's scenario engine and serves both transports on the same `/agent/run` path
(SSE via `POST`, WebSocket via HTTP upgrade). Run the demo with
`?transport=ws` to exercise it.
