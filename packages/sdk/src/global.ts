/**
 * IIFE entry for the `<script src>` embedding scenario. Attaches the public API
 * to `window.LiveChatHub` so partner sites can call `LiveChatHub.init(...)`
 * without any module system.
 */
import LiveChatHub from './index';

declare global {
  interface Window {
    LiveChatHub: typeof LiveChatHub;
  }
}

if (typeof window !== 'undefined') {
  window.LiveChatHub = LiveChatHub;
}

export default LiveChatHub;
