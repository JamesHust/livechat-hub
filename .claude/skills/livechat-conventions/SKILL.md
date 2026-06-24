---
name: livechat-conventions
description: LiveChat Hub monorepo conventions — package layering, AG-UI protocol, canonical message schema, source-consumed build model, theming via --lch-* tokens, and the shadcn/Tailwind setup. Use whenever editing or adding code under packages/* or apps/*, wiring transport/store/renderers, or styling the widget, to keep changes consistent with the architecture.
---

# LiveChat Hub conventions

Authoritative rules live in [CLAUDE.md](../../../CLAUDE.md); this skill is the
quick-reference Claude should apply automatically when touching the codebase.

## Layering (one-way dependencies)

`shared → transport → core → renderers / ui → sdk → apps`

Never import backwards. Quick map:

- **shared** — types/enums/i18n/theme contracts. No runtime deps, no workspace imports.
- **transport** — AG-UI events + parse/validate + SSE adapter. Only place that knows the wire format. No React.
- **core** — Zustand stores + streaming orchestration + persistence. **Zero React, ever.**
- **renderers / ui** — React, presentation only. No network/transport/store wiring.
- **sdk** — composition root: Shadow DOM bootstrap + public API.
- **apps** — widget-ui, demo-site, extension. No shared business logic.

## Hard invariants

1. Frontend **never** depends on an AI provider/framework — data enters only as
   AG-UI events.
2. Protocol events are **AG-UI-aligned**; extend the union in
   [transport/src/events.ts](../../../packages/transport/src/events.ts) (+ validation),
   never invent proprietary names.
3. Canonical message schema is `UIMessage` / `MessagePart` in
   [shared/src/types/message.ts](../../../packages/shared/src/types/message.ts) —
   additive only.
4. New message part → type in `shared` → renderer in `renderers/src/parts.tsx` →
   register in `registry.tsx` → handle in `core/src/reducer.ts` if it streams.
   (Use `/add-renderer`.)

## Build model (non-obvious)

Internal packages are **consumed as TypeScript source**: `exports."."` →
`src/index.ts`, **no `build` script**. Apps/SDK bundle them via Vite. So:
`pnpm build` only builds the SDK + 3 apps; verify libs with `pnpm typecheck`.
Imports between packages use the package name (e.g. `@livechat-hub/shared`), not
deep relative paths.

## Styling

- **Tailwind v4 + shadcn/ui**, compiled into the **Shadow DOM** (SDK injects
  `@livechat-hub/ui/styles.css?inline`). Use the `shadcn` skill for components.
- Theme via **`--lch-*` CSS variables** only — no hard-coded colors in components.
  Add a token in `shared/theme.ts` + `themes/tokens.ts` and reference it.
- The project's visual language is **glassmorphism** — see the `glassmorphism`
  skill for tokens/recipes.
- `cn()` + base UI primitives live in `packages/ui/src/{lib,components/ui}`;
  imports are relative (not `@/`) because packages are consumed as source.
- **Icons**, in priority order: **Tabler** (`@tabler/icons-react`) → **Lucide**
  (`lucide-react`, only if Tabler lacks it) → **hand-author an SVG in Tabler's
  style** (24×24, `fill="none"`, `stroke="currentColor"`, width 2, round caps).
  Both libs stay installed; keep `currentColor` + size via `size-*`. No third
  icon lib. See CLAUDE.md → Icons.

## Localization (i18n)

**Never hard-code user-facing copy** — visible text _and_ `aria-label` /
`placeholder` / `title` / `alt`. The widget ships in `en`, `vi`, `ja`, `zh`,
`id` with a runtime switcher, so every literal must route through i18n.

When adding/changing UI text:

1. Add the key to [shared/src/i18n/en.ts](../../../packages/shared/src/i18n/en.ts)
   (English = source of truth for the `StringKey` union; dotted keys like
   `composer.send`).
2. Mirror it into **every** locale dict in
   [shared/src/i18n/](../../../packages/shared/src/i18n) (`vi`, `ja`, `zh`, `id`)
   with a real translation — a test fails if any dict's keys drift from `en`.
3. Read via `t()`: `useChatContext().t(key)` in `ui`; `context.t(key)` in
   `renderers` (passed through `RendererContext`).
4. New locale → extend `Locale` in `shared/types/config.ts`, add the dict, and
   register it in `shared/i18n/index.ts` (`dictionaries` + `localeNames` +
   `availableLocales`); the `LanguageSwitcher` picks it up automatically.

White-label per-instance copy comes via `config.strings` overrides, not by
editing dicts. See CLAUDE.md → Localization (i18n).

## Quality gate

Before declaring done: `pnpm typecheck && pnpm lint && pnpm test`
(or run `/verify`). Tests sit next to code as `*.test.ts(x)`; add a
`core/src/store.test.ts` case when you change streaming/reducer logic.
