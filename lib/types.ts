// 查词 API 响应（langeasy.com.cn/loadLexisList.action）
export interface WordEntry {
  word: string;
  uk_pron: string;
  us_pron: string;
  interpret: string;
}

export interface WordLookupResponse {
  wordlist: WordEntry[];
}

// 登录状态 API 响应（bbdc.cn/api/check-login）
export interface CheckLoginResponse {
  result_code: number;
  data_body: {
    name: string;
  };
}

// 检查生词 API 响应（bbdc.cn/api/check-new-word）
export interface CheckNewWordResponse {
  result_code: number;
  data_body: {
    list: unknown[];
  };
}

// content.ts → lookup 页面的消息
export interface LookupMessage {
  type: 'lookup';
  word: string;
  data: WordLookupResponse | null;
}

// lookup 页面 → content.ts 的消息
export interface ResizeMessage {
  type: 'resize';
  height: number;
}

// 音频类型
export type AudioType = 'UK' | 'US';

// 生词本添加请求数据
export interface NewWordPayload {
  word: string;
  course: string;
  wordidx: string;
  infoidx: string;
  selection: string;
  info: string;
  opcode: string;
}

// 生词本列表 API 响应（bbdc.cn/api/user-new-word?page=0）
export interface WordbookListResponse {
  result_code: number;
  data_body: {
    list: Array<{
      word: string;
      info?: string;
      [key: string]: unknown;
    }>;
  };
}
