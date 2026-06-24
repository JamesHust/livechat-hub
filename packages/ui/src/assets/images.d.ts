/*
 * Ambient declarations for image imports inside the `ui` package.
 *
 * Unlike the apps/sdk, this package's tsconfig does not pull in `vite/client`,
 * so `tsc` needs to be told that `import x from './bot.png?inline'` yields a
 * string. The `?inline` variant is what we actually use: Vite inlines the asset
 * as a base64 data URI (see the SDK's single self-contained IIFE bundle), so the
 * embedded widget makes no extra network request and the image loads inside the
 * Shadow DOM. `tsc` matches these wildcards without touching disk, so typecheck
 * passes even before a real `bot.png` is dropped in.
 */
declare module '*.png?inline' {
  const src: string;
  export default src;
}
declare module '*.png' {
  const src: string;
  export default src;
}
