# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets).
It records intended version bumps as small Markdown files so releases are
reviewable and changelogs are generated automatically.

## Cutting a release

1. After a user-facing change, run `pnpm changeset` and follow the prompts to
   pick the bump (patch / minor / major) and write a summary.
2. Commit the generated `.changeset/*.md` file with your PR.
3. On merge to `main`, the **Release** workflow opens (or updates) a
   _"Version Packages"_ PR that applies the bumps and updates changelogs.
4. Merging that PR publishes the affected public packages to npm.

Only **published** (non-`private`) packages are versioned here. Every internal
workspace package is `"private": true` (they are consumed as TypeScript source
and bundled by `@livechat-hub/sdk`), so Changesets ignores them automatically —
today `@livechat-hub/sdk` is the sole publishable artifact. See
[`docs/RELEASING.md`](../docs/RELEASING.md) for distribution details.
