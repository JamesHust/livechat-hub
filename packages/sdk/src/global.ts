/**
 * IIFE entry for the `<script src>` embedding scenario. Attaches the public API
 * to `window.LiveChatHub` so partner sites can call `LiveChatHub.init(...)`
 * without any module system.
 *
 * Supports the **async loader snippet** (Intercom/Segment pattern): a tiny inline
 * stub buffers method calls into a `_q` queue while this bundle downloads
 * asynchronously. On load we replace the stub and replay the queue in order, so
 * `init` (and any `identify` / `open` / … issued before load) run as intended.
 * See the README's "Async loading" section for the snippet.
 */
import LiveChatHub from './index';

/** The stub shape the async loader installs before this bundle loads. */
interface LoaderStub {
  _q?: Array<[string, ArrayLike<unknown>]>;
}

declare global {
  interface Window {
    LiveChatHub: typeof LiveChatHub;
  }
}

if (typeof window !== 'undefined') {
  const existing = window.LiveChatHub as (typeof LiveChatHub & LoaderStub) | undefined;
  window.LiveChatHub = LiveChatHub;
  if (existing && Array.isArray(existing._q)) {
    LiveChatHub._flush(existing._q);
  }
}

export default LiveChatHub;
