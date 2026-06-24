# UI brand assets

## `bot.png` — the agent's avatar / launcher image

Drop your agent image here as **`bot.png`** (this exact path):

```
packages/ui/src/assets/bot.png
```

It is consumed by [`AgentMark`](../components/AgentMark.tsx), which is the single
source of the agent's visual identity, so replacing this one file restyles
**every** placement at once:

- the avatar beside agent messages (`MessageBubble`, `TypingIndicator`)
- the header, empty state and welcome-screen avatars
- the floating **chat-bubble launcher** button (when closed)

Notes:

- The PNG currently committed is a 1×1 transparent **placeholder** so the build,
  tests and typecheck stay green. Overwrite it with your real image — no code
  change needed.
- It is rendered full-bleed inside a circular, gradient-filled badge
  (`object-cover`, `rounded-full`). A roughly **square** image reads best; a
  **transparent background** lets the themeable `--lch-gradient` show through.
- Vite inlines it as a base64 data URI, so keep it reasonably small (a few KB)
  to avoid bloating the embedded widget bundle.
