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
  "threadId": "sess_…", // stable per end-user session
  "tenantId": "tenant_123",
  "userId": "optional",
  "messages": [
    /* UIMessage[] — full conversation so far */
  ],
  "metadata": {},
}
```

### Response

An SSE stream of AG-UI events, one JSON object per `data:` frame. Terminate with
`data: [DONE]` or by closing the stream. Required ordering for a text turn:

```
RUN_STARTED → TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT* → TEXT_MESSAGE_END → RUN_FINISHED
```

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

## Reference mock

[`apps/demo-site/mock-agent.ts`](../apps/demo-site/mock-agent.ts) implements this
contract as Vite dev middleware and is the canonical example to port to Go.

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

## WebSocket (future)

The `Transport` interface in
[`packages/transport/src/transport.ts`](../packages/transport/src/transport.ts)
is transport-agnostic; a `createWebSocketTransport` can be added later without
touching the core, UI, or renderers.
