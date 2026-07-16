import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: '不背单词查词',
    description: '使用不背单词查词以及添加生字本功能，支持Chorme的选中划词翻译，有问题请找@Anota_ju反馈',
    version: '1.2.2',
    permissions: ['storage', 'alarms'],
    host_permissions: [
      'https://langeasy.com.cn/*',
      'https://bbdc.cn/*',
      'https://audio2.beingfine.cn/*',
    ],
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz2ctgNKrZNXkck6E4NGjKejv/HWMiEOxOovAoV+LjI09qAEhksxre7vzhiAl+TrDDqERpw2ArDrTy39JVuvmk8XUaap/GrmwtL+wmGD/7ns6kDv5mM1pdHlhZ+aC5R7e5NXZIdYjY0wGrksUWx4rzTTKRMlE3B8wN8hzUCAM+16yRfpz8b/p5FowEP5WULYURF0a26lrOQWfWO7NTDv8ZEAyQEJmsaps0Y/5Qj50O/9tugT4rJ+7+KZ3skRLAm1QpWFIlyWjL3IscrM0O1+RMCwmFC+eJ8qz5SVn7I4N8vTG3xRxYnZmzZNjyfyUaMA17ukf3mq1kaVWGcxLAEruDwIDAQAB',
    icons: {
      19: 'images/icon_19.png',
      48: 'images/icon_48.png',
      128: 'images/icon_128.png',
    },
    action: {
      default_title: '不背单词查词',
      default_icon: {
        48: 'images/icon_48.png',
      },
    },
    web_accessible_resources: [
      {
        matches: ['<all_urls>'],
        resources: ['lookup.html', 'images/icon_128.png'],
      },
    ],
  },
});
