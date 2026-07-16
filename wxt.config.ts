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
    description: '使用不背单词查词以及添加生字本功能，支持Chorme的选中划词翻译，有问题请找https://github.com/ilkm/irez-bbdc-plus/issues 反馈',
    version: '1.2.2',
    permissions: ['storage', 'alarms'],
    host_permissions: [
      'https://langeasy.com.cn/*',
      'https://bbdc.cn/*',
      'https://audio2.beingfine.cn/*',
    ],
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
