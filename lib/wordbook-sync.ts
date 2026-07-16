import { db, type WordbookEntry } from './db';
import { fetchWordbook } from './api';
import { wordbookWordsItem } from './storage';
import type { WordbookListItem, WordbookListResponse } from './types';

/** 是否正在同步中（防止并发） */
let syncing = false;

/** 上次成功同步时间（短冷却，避免同页多 frame 重复打满） */
let lastSyncAttempt = 0;

/** 上次认证失败时间（5 秒短冷却，允许重新登录后快速重试） */
let lastAuthFail = 0;

/** 成功同步后的冷却（仅对 force=false；页面刷新/登录用 force=true） */
const SYNC_COOLDOWN = 30_000;

/** 认证失败后的冷却（5 秒） */
const AUTH_FAIL_COOLDOWN = 5_000;

/** bbdc.cn API 成功码：check-login / add 返回 200，部分 list 返回 20000 */
const SUCCESS_CODES = new Set([200, 20000]);

/** 从响应中解析词列表与云端总数（兼容 wordList/pageInfo 与 list/total） */
function parseWordbookPage(resp: WordbookListResponse): {
  list: WordbookListItem[];
  cloudTotal: number | undefined;
  totalPage: number;
  pageSize: number;
} {
  const body = resp.data_body ?? {};
  const list = body.wordList ?? body.list ?? [];
  const cloudTotal = body.pageInfo?.totalRecord ?? body.total;
  const totalPage = body.pageInfo?.totalPage ?? 1;
  const pageSize = body.pageInfo?.pageSize ?? 20;
  return { list, cloudTotal, totalPage, pageSize };
}

/**
 * 从 API 拉取生词本并写入 chrome.storage.local + IndexedDB
 * 自动分页拉取，全部完成后一次性更新 storage
 * 以云端为准；本地数量与云端一致时跳过分页全量拉取
 *
 * @param force true=跳过冷却立即同步（登录成功、页面刷新、popup、alarm）
 *              false=受冷却限制
 */
export async function syncWordbook(force = true): Promise<number> {
  if (syncing) return 0;
  if (!force) {
    const now = Date.now();
    if (now - lastSyncAttempt < SYNC_COOLDOWN || now - lastAuthFail < AUTH_FAIL_COOLDOWN) {
      return 0;
    }
  }
  syncing = true;
  try {
    const localWords = await wordbookWordsItem.getValue();
    const localCount = localWords.length;

    const firstResp = await fetchWordbook(0);
    if (firstResp === null) {
      console.log('[bbdc] syncWordbook: 未登录或认证失败，跳过同步');
      lastAuthFail = Date.now();
      return 0;
    }
    if (!SUCCESS_CODES.has(firstResp.result_code)) {
      console.log(`[bbdc] syncWordbook: result_code=${firstResp.result_code}，可能未登录`);
      lastAuthFail = Date.now();
      return 0;
    }

    lastSyncAttempt = Date.now();

    const { list: firstPageList, cloudTotal, totalPage, pageSize } = parseWordbookPage(firstResp);

    // 数量一致 → 跳过分页全量拉取
    if (cloudTotal !== undefined && cloudTotal === localCount) {
      console.log(`[bbdc] syncWordbook: 本地 ${localCount} 个 = 云端 ${cloudTotal} 个，已是最新`);
      return localCount;
    }

    const entries: WordbookEntry[] = [];
    const words: string[] = [];

    for (const item of firstPageList) {
      entries.push({ word: item.word, info: item.info ?? '' });
      words.push(item.word);
    }

    // 按 totalPage 继续拉取后续页（page 从 0 起，共 totalPage 页）
    if (totalPage > 1) {
      for (let page = 1; page < totalPage && page < 5000; page++) {
        const resp = await fetchWordbook(page);
        if (resp === null) break;
        if (!SUCCESS_CODES.has(resp.result_code)) break;
        const { list } = parseWordbookPage(resp);
        if (list.length === 0) break;
        for (const item of list) {
          entries.push({ word: item.word, info: item.info ?? '' });
          words.push(item.word);
        }
        if (list.length < pageSize) break;
        if (page + 1 < totalPage) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }

    // 以云端为准：替换本地缓存
    await wordbookWordsItem.setValue(words);
    try {
      await db.words.clear();
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
    lastAuthFail = Date.now();
    return 0;
  } finally {
    syncing = false;
  }
}

/** 查询单词是否已在生词本中（走 chrome.storage.local，跨页面即时同步） */
export async function isWordInWordbook(word: string): Promise<boolean> {
  const words = await wordbookWordsItem.getValue();
  const lower = word.toLowerCase();
  return words.some((w) => w.toLowerCase() === lower);
}

/** 添加生词到本地缓存（API 调用成功后调用，先写 storage 再写 IndexedDB） */
export async function addWordToLocal(word: string, info: string): Promise<void> {
  const words = await wordbookWordsItem.getValue();
  const lower = word.toLowerCase();
  if (!words.some((w) => w.toLowerCase() === lower)) {
    await wordbookWordsItem.setValue([...words, word]);
  }
  try {
    await db.words.put({ word, info });
  } catch (e) {
    console.log('[bbdc] IndexedDB put error:', e);
  }
}

/** 从本地缓存删除生词（API 删除成功后调用） */
export async function removeWordFromLocal(word: string): Promise<void> {
  const words = await wordbookWordsItem.getValue();
  const lower = word.toLowerCase();
  const next = words.filter((w) => w.toLowerCase() !== lower);
  await wordbookWordsItem.setValue(next);
  try {
    await db.words.delete(word);
    // 兼容大小写不一致的主键
    const all = await db.words.toArray();
    for (const entry of all) {
      if (entry.word.toLowerCase() === lower) {
        await db.words.delete(entry.word);
      }
    }
  } catch (e) {
    console.log('[bbdc] IndexedDB delete error:', e);
  }
}
