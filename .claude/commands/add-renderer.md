---
description: Add or override a message-part renderer end to end
argument-hint: <part-type> (e.g. audio, chart)
---

Wire up rendering for a message part of type `$1` across the layers, following
the "Adding things" checklist in [CLAUDE.md](../../CLAUDE.md).

1. **Schema** — if `$1` is a brand-new part kind, add its `*Part` interface to
   [packages/shared/src/types/message.ts](../../packages/shared/src/types/message.ts)
   and include it in the `MessagePart` union. Keep the schema additive.
2. **Renderer** — add a `${1}Renderer` React component to
   [packages/renderers/src/parts.tsx](../../packages/renderers/src/parts.tsx),
   styled only with `--lch-*` tokens / `lch-` classes. Presentation only.
3. **Register** — add it to `defaultRenderers` in
   [packages/renderers/src/registry.tsx](../../packages/renderers/src/registry.tsx).
4. **Streaming** — if it arrives incrementally over the wire, add the matching
   AG-UI event(s) to [packages/transport/src/events.ts](../../packages/transport/src/events.ts)
   (+ validation) and handle them in
   [packages/core/src/reducer.ts](../../packages/core/src/reducer.ts).
5. **Styles** — add any needed classes to
   [packages/themes/src/base.css](../../packages/themes/src/base.css).
6. Run `/verify` (or at least `pnpm typecheck && pnpm test`).

If `$1` already exists, treat this as an override: show how a consumer would
pass it via `renderers={{ "$1": Custom }}` to `ChatProvider` / `LiveChatHub.init`.
