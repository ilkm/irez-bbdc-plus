import type {
  WordLookupResponse,
  CheckLoginResponse,
  CheckNewWordResponse,
  AudioType,
  NewWordPayload,
  WordbookListResponse,
} from './types';

// 常量（来自原始 popup.js）
export const HOST = 'https://bbdc.cn';
export const AUDIO_CDN = 'https://audio2.beingfine.cn';
export const LEXIS_API = 'https://langeasy.com.cn/loadLexisList.action';

// 转义引号（原始 transMark / c 函数）
// " → \"，' → \\'
export function escapeQuotes(text: string): string {
  if (!text) return '';
  return text.replace(/(\")/g, '\\"').replace(/\'/g, "\\'");
}

// 获取音频 URL
export function getAudioUrl(type: AudioType, word: string): string {
  return `${AUDIO_CDN}/speeches/${type}/${type}-speech/${word}.mp3`;
}

// 查询单词（langeasy API）
export async function fetchWord(word: string): Promise<WordLookupResponse> {
  const escapedWord = escapeQuotes(word);
  const response = await fetch(
    `${LEXIS_API}?strict=1&word=${escapedWord}`
  );
  return response.json();
}

// 检查登录状态（bbdc.cn API）
export async function checkLogin(): Promise<CheckLoginResponse> {
  const response = await fetch(`${HOST}/api/check-login`);
  return response.json();
}

// 检查生词是否已存在（bbdc.cn API）
export async function checkNewWord(word: string): Promise<CheckNewWordResponse> {
  const response = await fetch(
    `${HOST}/api/check-new-word?word=${word}&infoidx=100`
  );
  return response.json();
}

// 添加生词到生词本（bbdc.cn API）
// FormData key 为 "newwordlist"，值为 JSON 字符串
export async function addWord(word: string, info: string): Promise<void> {
  const payload: NewWordPayload = {
    word,
    course: '*',
    wordidx: '*',
    infoidx: '100',
    selection: '*',
    info,
    opcode: '1',
  };
  const formData = new FormData();
  formData.append('newwordlist', JSON.stringify(payload));
  const response = await fetch(`${HOST}/api/user-new-word`, {
    method: 'POST',
    body: formData,
  });
  await response.json();
}

// 拉取生词本列表（bbdc.cn API）
export async function fetchWordbook(page = 0): Promise<WordbookListResponse> {
  const time = Date.now();
  const response = await fetch(
    `${HOST}/api/user-new-word?page=${page}&time=${time}`,
    { credentials: 'include' }
  );
  return response.json();
}
