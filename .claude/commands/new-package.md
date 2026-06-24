---
description: Scaffold a new workspace package following repo conventions
argument-hint: <package-name> [--react]
---

Scaffold a new internal package named `@livechat-hub/$1` under `packages/$1`,
matching the conventions in [CLAUDE.md](../../CLAUDE.md) and existing packages.

Steps:

1. Create `packages/$1/package.json` with:
   - `"name": "@livechat-hub/$1"`, `"version": "0.1.0"`, `"private": true`, `"type": "module"`
   - `"exports": { ".": "./src/index.ts" }` (consumed as source — **no `build` script**)
   - scripts: `typecheck` (`tsc --noEmit`), `lint` (`eslint .`), `test` (`vitest run --passWithNoTests`)
   - devDeps: `@livechat-hub/eslint-config`, `@livechat-hub/tsconfig`, `typescript`, `vitest`
   - If `--react` was passed, add `react` to `peerDependencies` and `@types/react` + `react` to devDeps.
2. `tsconfig.json` extending `@livechat-hub/tsconfig/base.json` (or `react-library.json`
   with `--react`), `compilerOptions.noEmit: true`, `include: ["src/**/*"]`.
3. `eslint.config.js` re-exporting `baseConfig` (or `reactConfig` with `--react`)
   from `@livechat-hub/eslint-config`.
4. `src/index.ts` with a placeholder export.
5. Run `pnpm install`, then `pnpm --filter @livechat-hub/$1 typecheck` to confirm it wires up.

Respect the layering rules: declare a dependency on another workspace package
only if the dependency direction in CLAUDE.md allows it. Report what you created.
