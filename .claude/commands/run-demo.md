---
description: Start the demo-site with the mock AG-UI backend and verify streaming
allowed-tools: Bash(pnpm --filter:*), Bash(curl:*)
---

Start the partner-site demo and confirm the end-to-end vertical slice works.

1. Start the dev server in the background:
   `pnpm --filter @livechat-hub/demo-site dev` (serves http://localhost:5173 with
   the mock AG-UI SSE backend from `apps/demo-site/mock-agent.ts`).
2. Wait for "ready", then verify the stream with a POST:
   `curl -s -X POST http://localhost:5173/agent/run -H "content-type: application/json" -d '{"threadId":"t1","tenantId":"demo","messages":[{"role":"user","parts":[{"type":"text","text":"what is the weather"}]}]}'`
3. Confirm the response contains `RUN_STARTED`, a `TOOL_CALL_*` lifecycle, and
   `TEXT_MESSAGE_CONTENT` deltas, then `RUN_FINISHED`.
4. Report the result and **stop the background server** when done.

Do not leave the dev server running after the check unless the user asked you to.
