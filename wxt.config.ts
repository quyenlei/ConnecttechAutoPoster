import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Connecttech Auto Poster',
    short_name: 'CAP',
    description:
      'Local-first helper to post to your Facebook groups with safe delays, a live log and no external servers.',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApxw5DIPBGeTMY39IY9C+sV2IPsUShwcH9ps+VUpjDTFNJo0HngOY8P4VdZrNekrHOAD3AddUw0dJTwug47o/BDAvz7qAwiLGOzRpvzB/8drPGKkL5oPmv2r7f1IAv++w/L+3gWcmR2bOpD7Gb4zo02/lOtDGm7fg62o+Rb44lnPVnlrdHomtRwl52b1NX4KxjxrpjsQ9hOk+dh+raPNsYvVvQX1rwrcGp+eJ0olO5ATg2xijtsLwXGJHvfa0jRG/5Mrfq3IP6gFMWekxdJxTPufTwyfC+ZTL1J26UnFaOALSbJlS2FvaHfBK1p5l4/uTOW6sxFC4sPZXYe9uvRSU+QIDAQAB',
    // Keep permissions minimal. Add one only with a written reason in docs/SAFETY_AND_PRIVACY.md.
    permissions: ['storage', 'alarms', 'tabs', 'notifications', 'nativeMessaging'],
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
