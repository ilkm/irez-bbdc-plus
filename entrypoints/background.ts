import { syncWordbook } from '@/lib/wordbook-sync';
import { syncIntervalItem } from '@/lib/storage';

export default defineBackground(() => {
  // 根据 storage 中的间隔设置创建/更新 alarm
  async function setupAlarm() {
    const intervalSec = await syncIntervalItem.getValue();
    // alarms 最小间隔 1 分钟
    const periodInMinutes = Math.max(1, intervalSec / 60);
    browser.alarms.create('wordbook-sync', { periodInMinutes });
  }

  // 安装/更新时立即同步 + 创建 alarm
  browser.runtime.onInstalled.addListener(() => {
    syncWordbook();
    setupAlarm();
  });

  // 初始创建 alarm
  setupAlarm();

  // alarm 触发同步
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'wordbook-sync') {
      syncWordbook();
    }
  });

  // 监听来自 popup / content script 的同步请求
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'sync-wordbook') {
      // 默认 force=true；仅显式传 false 时走冷却
      syncWordbook(message.force !== false);
      return;
    }
    if (message?.type === 'wordbook-local-updated') {
      // 查词页/popup 写入生词本后，广播到所有 tab 的 content script 重扫高亮
      void browser.tabs.query({}).then((tabs) => {
        for (const tab of tabs) {
          if (tab.id != null) {
            browser.tabs.sendMessage(tab.id, { type: 'wordbook-local-updated' }).catch(() => {});
          }
        }
      });
      sendResponse?.({ ok: true });
      return;
    }
    // 视频 iframe 悬浮查词 → 转发到该 tab 顶层 content script 打开弹窗
    if (
      message?.type === 'langeasy-frame-lookup' ||
      message?.type === 'langeasy-frame-lookup-close'
    ) {
      const tabId = sender.tab?.id;
      if (tabId != null) {
        // 只发给顶层，避免视频帧再次收到
        browser.tabs
          .sendMessage(
            tabId,
            {
              ...message,
              _fromFrame: true,
            },
            { frameId: 0 },
          )
          .catch(() => {});
      }
      sendResponse?.({ ok: true });
      return true;
    }
  });

  // 同步间隔变化时更新 alarm
  syncIntervalItem.watch(() => setupAlarm());
});
