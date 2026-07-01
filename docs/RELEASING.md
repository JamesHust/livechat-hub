# Releasing

LiveChat Hub uses [Changesets](https://github.com/changesets/changesets) for
versioning and changelog generation, and ships two artifacts from the SDK.

## What gets published

Every internal workspace package is `"private": true` — they are **consumed as
TypeScript source** and bundled by the SDK, so they are never published on their
own (Changesets ignores private packages automatically). Today
`@livechat-hub/sdk` is the single publishable package.

The SDK produces the embeddable, self-contained bundle:

```bash
pnpm --filter @livechat-hub/sdk build   # → packages/sdk/dist/livechat-sdk.js
```

Two distribution channels:

1. **`<script>` / CDN (primary).** `livechat-sdk.js` is an IIFE that inlines
   React and every workspace package, so a partner page needs nothing else:

   ```html
   <script src="https://your-cdn.example.com/livechat-sdk.js"></script>
   <script>
     LiveChatHub.init({ apiUrl: 'https://api.example.com', tenantId: 't1' });
   </script>
   ```

2. **npm (`@livechat-hub/sdk`).** The release pipeline is wired end to end and CI
   validates packaging on every PR (see below).

> **Note on npm consumption.** The bundle is self-contained, but the package's
> `exports` currently point at TypeScript source that references other
> (`private`, unpublished) workspace packages. Consuming the SDK from npm as an
> ES module therefore expects the consumer's bundler to resolve those — the
> hosted `<script>` bundle is the supported path today. A dedicated library
> build (ESM + `.d.ts` with dependencies inlined) is the tracked follow-up for
> first-class npm consumption.

## Cutting a release

1. **Add a changeset** describing the change and its bump level:

   ```bash
   pnpm changeset
   ```

   Commit the generated `.changeset/*.md` alongside your code.

2. **Merge to `main`.** The [`Release`](../.github/workflows/release.yml)
   workflow opens (or updates) a **"Version Packages"** PR that consumes the
   changesets, bumps versions, and updates `CHANGELOG.md`.

3. **Merge the Version Packages PR.** With an `NPM_TOKEN` repository secret
   configured, this publishes the bumped public packages via
   `pnpm run release` (`changeset publish`).

## CI guardrail (dry-run)

On every PR and push, the `publish-dry-run` job builds the SDK and runs:

```bash
pnpm --filter @livechat-hub/sdk publish --dry-run --no-git-checks
```

This verifies the package packs cleanly (name, version, `files`, tarball
contents) without contacting the registry, so packaging regressions are caught
before a real release.

## Local commands

| Task                        | Command                                                             |
| --------------------------- | ------------------------------------------------------------------- |
| Record a change             | `pnpm changeset`                                                    |
| Apply versions + changelogs | `pnpm version:packages`                                             |
| Publish (needs npm auth)    | `pnpm release`                                                      |
| Dry-run packaging           | `pnpm --filter @livechat-hub/sdk publish --dry-run --no-git-checks` |
| Check bundle-size budget    | `pnpm build && pnpm size`                                           |
| Generate API reference      | `pnpm docs:api` → `docs/api/`                                       |
