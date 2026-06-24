import { mountWidget, type MountOptions, type WidgetInstance } from './mount';

export type { MountOptions, WidgetInstance };
export type { WidgetEvents, EventName } from './emitter';
export type { LiveChatConfig } from '@livechat-hub/shared';

/**
 * Public SDK surface. Designed so consumers need zero React knowledge:
 *
 * ```html
 * <script src="livechat-sdk.js"></script>
 * <script>
 *   LiveChatHub.init({ apiUrl: 'https://api.example.com', tenantId: 't1' });
 * </script>
 * ```
 */
export const LiveChatHub = {
  /** Bootstrap, mount into a Shadow DOM, and return the instance handle. */
  init(options: MountOptions): WidgetInstance {
    if (typeof document === 'undefined') {
      throw new Error('LiveChatHub.init must run in a browser environment');
    }
    return mountWidget(options);
  },
};

export type LiveChatHubApi = typeof LiveChatHub;
export default LiveChatHub;
