import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Connecttech Auto Poster',
    short_name: 'CAP',
    description:
      'Local-first helper to post to your Facebook groups with safe delays, a live log and no external servers.',
    // Keep permissions minimal. Add one only with a written reason in docs/SAFETY_AND_PRIVACY.md.
    permissions: ['storage', 'alarms', 'tabs', 'notifications'],
    host_permissions: ['*://*.facebook.com/*'],
    icons: { 16: '/icon/16.png', 32: '/icon/32.png', 48: '/icon/48.png', 128: '/icon/128.png' },
    action: {
      default_title: 'Connecttech Auto Poster',
      default_icon: { 16: '/icon/16.png', 32: '/icon/32.png', 48: '/icon/48.png', 128: '/icon/128.png' },
    },
    // The chat box on Facebook pages (chat.content) frames these extension pages.
    web_accessible_resources: [{ resources: ['chatbox.html', 'options.html', 'icon/48.png'], matches: ['*://*.facebook.com/*'] }],
  },
});
