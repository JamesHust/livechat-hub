---
name: 'source-command-verify'
description: 'Run the full quality gate (typecheck, lint, test, build) and report'
---

# source-command-verify

Use this skill when the user asks to run the migrated source command `verify`.

## Command Template

Run the repository quality gate from the root, in this order, and stop at the
first failure so the cause is clear:

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test`
4. `pnpm build`

Report a concise pass/fail summary per step. For any failure, show the relevant
output and the file:line, propose the fix, and apply it only if it is
unambiguous — otherwise ask. Do not commit anything.
