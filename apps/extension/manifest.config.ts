import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'LiveChat Hub',
  version: '0.1.0',
  description: 'LiveChat Hub assistant — reuses the shared widget UI in an MV3 popup.',
  action: {
    default_title: 'LiveChat Hub',
    default_popup: 'src/popup/index.html',
  },
  permissions: ['storage'],
  // Allow the popup to reach the local mock backend / your API during dev.
  host_permissions: ['http://localhost:5173/*', 'https://*/*'],
});
