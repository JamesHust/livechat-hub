---
name: glassmorphism
description: The unified visual design language for LiveChat Hub — frosted-glass surfaces, electric-blue accents, Plus Jakarta Sans. Use when styling, building, or restyling any widget/demo UI (panels, bubbles, launcher, composer, landing) so the look stays consistent and youthful. Triggers on requests to design, theme, style, beautify, or pick colors/fonts for the chat UI.
---

# Glassmorphism — LiveChat Hub design language

The chosen, project-wide aesthetic: semi-transparent **frosted-glass** surfaces with
backdrop blur, an **electric-blue** primary and **muted-plum** support, floating over
rich backgrounds. Modern, premium, and youthful. Apply it through the repo's token
system — never hard-code colors in components (see [CLAUDE.md](../../CLAUDE.md)).

## How it maps to this repo

Theming flows through `--lch-*` CSS variables set by `applyThemeToElement`
([packages/themes/src/tokens.ts](../../packages/themes/src/tokens.ts) +
[apply.ts](../../packages/themes/src/apply.ts)); shadcn semantic tokens
(`--primary`, `--background`, …) are bridged onto them. To adopt this language,
set the token values below — components and shadcn `Button`/`Textarea` inherit
automatically, and `setTheme()` keeps working at runtime.

### Tokens (set these on the theme)

| Role                            | Light                    | Notes                                               |
| ------------------------------- | ------------------------ | --------------------------------------------------- |
| primary / `--lch-primary`       | `#1856FF`                | electric blue — actions, links, active, user bubble |
| secondary accent                | `#3A344E`                | muted plum — supporting surfaces                    |
| success                         | `#07CA6B`                | online / confirmations                              |
| warning                         | `#E89558`                | pending                                             |
| danger / `--lch-danger`         | `#EA2143`                | errors, destructive                                 |
| surface / `--lch-surface`       | `rgba(255,255,255,0.65)` | translucent (60–80%)                                |
| background / `--lch-background` | `rgba(255,255,255,0.72)` | translucent base                                    |
| text / `--lch-text`             | `#141414`                | near-black for contrast                             |
| border / `--lch-border`         | `rgba(255,255,255,0.18)` | low-opacity white hairline                          |

Dark theme: keep the same hues; swap surfaces to low-opacity dark
(`rgba(20,20,20,0.55)`), text to `#F5F5F5`, keep the white-ish hairline border.

### Glass surface recipe

```css
/* applied to the panel / cards via base styles, not inline in components */
background: var(--lch-surface); /* translucent fill */
backdrop-filter: blur(20px); /* Medium; Light 8–12, Heavy 24–32 */
-webkit-backdrop-filter: blur(20px);
border: 1px solid var(--lch-border); /* low-opacity white hairline */
border-radius: var(--lch-radius-lg);
box-shadow: var(--lch-shadow);
```

Blur scale: **Light 8–12px** (bubbles, inputs) · **Medium 16–20px** (panel) ·
**Heavy 24–32px** (modals/overlays).

## Typography

- Display/body: **Plus Jakarta Sans** (geometric sans). Set `--lch-font-family`.
- Mono (timestamps, code, tool args): **JetBrains Mono**.
- Load fonts **inside the Shadow DOM** (the widget is isolated) or self-host;
  do not rely on the partner page having them. Mobile-first compact scale.

## Shadow DOM reality (important here)

The widget renders in a Shadow DOM floating over the partner site, so
`backdrop-filter` blurs **the host page** behind it — which is exactly the
intended glass effect. But:

- A partner page with a plain white background gives nothing to blur → always
  ship a **fallback solid-ish fill** (≥60% opacity) so text stays legible.
- `backdrop-filter` is GPU-cheap but not free; use it on the panel and launcher,
  not on every message bubble in a long streaming list.

## Accessibility (non-negotiable)

- **WCAG 2.2 AA** contrast minimum. Enforce the minimum surface-opacity
  thresholds above; never let text sit on a <60% translucent fill.
- **Focus indicators must be solid** rings/borders, not translucent ones.
- Respect **`prefers-reduced-motion`** (see the Animation section in CLAUDE.md);
  glass + motion should degrade gracefully.

## Do / Don't

- ✅ Put glass over a rich background (gradient/image/colored surface).
- ✅ Hover = opacity shift, not a background-color swap.
- ✅ Keep one accent (electric blue); plum is support only.
- ❌ Don't mix with neobrutalism or flat material — pick this language and commit.
- ❌ Don't hard-code these hex values in components — set them as `--lch-*` tokens.
