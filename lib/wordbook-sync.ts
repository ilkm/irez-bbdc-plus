import { db, type WordbookEntry } from './db';
import { fetchWordbook } from './api';
import { wordbookWordsItem } from './storage';

/** 是否正在同步中（防止并发） */
let syncing = false;

/**
 * 从 API 拉取生词本并写入 chrome.storage.local + IndexedDB
 * 自动分页拉取，全部完成后一次性更新 storage
 * 在 background service worker 中调用，不受页面生命周期影响
 */
export async function syncWordbook(): Promise<number> {
  if (syncing) return 0;
  syncing = true;
  try {
    const entries: WordbookEntry[] = [];
    const words: string[] = [];
    let page = 0;
    while (page < 5000) {
      const resp = await fetchWordbook(page);
      if (resp.result_code !== 200) break;
      const list = resp.data_body?.list ?? [];
      if (list.length === 0) break;
      for (const item of list) {
        entries.push({ word: item.word, info: item.info ?? '' });
        words.push(item.word);
      }
      if (list.length < 20) break;
      page++;
      // 每页间隔 3 秒，避免请求过快
      if (page < 5000) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    // 以云端为准：替换本地缓存
    await wordbookWordsItem.setValue(words);
    // IndexedDB 写入（可能失败，不影响功能）
    try {
      if (entries.length > 0) {
        await db.words.bulkPut(entries);
      }
    } catch (e) {
      console.log('[bbdc] IndexedDB write error:', e);
    }
    console.log(`[bbdc] syncWordbook 完成: ${words.length} 个单词`);
    return entries.length;
  } catch (e) {
    console.log('[bbdc] syncWordbook error:', e);
    return 0;
  } finally {
    syncing = false;
  }
}

/** 查询单词是否已在生词本中（走 chrome.storage.local，跨页面即时同步） */
export async function isWordInWordbook(word: string): Promise<boolean> {
  const words = await wordbookWordsItem.getValue();
  return words.includes(word);
}

/** 添加生词到本地缓存（API 调用成功后调用，先写 storage 再写 IndexedDB） */
export async function addWordToLocal(word: string, info: string): Promise<void> {
  // 先更新 chrome.storage.local（跨页面立即可见）
  const words = await wordbookWordsItem.getValue();
  if (!words.includes(word)) {
    await wordbookWordsItem.setValue([...words, word]);
  }
  // 再写入 IndexedDB（可能失败，不影响功能）
  try {
    await db.words.put({ word, info });
  } catch (e) {
    console.log('[bbdc] IndexedDB put error:', e);
  }
}
