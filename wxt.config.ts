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
    permissions: ['storage', 'alarms', 'tabs'],
    host_permissions: ['*://*.facebook.com/*'],
    action: { default_title: 'Connecttech Auto Poster' },
  },
});
