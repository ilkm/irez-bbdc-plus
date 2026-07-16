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

// lookup React 已挂载，可安全接收 lookup 消息
export interface LookupReadyMessage {
  type: 'lookup-ready';
}

// 音频类型
export type AudioType = 'UK' | 'US';

// 生词本添加/删除请求数据
export interface NewWordPayload {
  word: string;
  course: string;
  wordidx: string;
  infoidx: string;
  selection: string;
  info: string;
  opcode: string;
}

/** 生词本列表单项 */
export interface WordbookListItem {
  word: string;
  info?: string;
  ukpron?: string;
  uspron?: string;
  updatetime?: string;
  [key: string]: unknown;
}

/** 生词本分页信息 */
export interface WordbookPageInfo {
  totalRecord: number;
  pageSize: number;
  totalPage: number;
  currentPage: number;
}

// 生词本列表 API 响应（bbdc.cn/api/user-new-word?page=0）
// 实际字段为 wordList + pageInfo（兼容旧字段 list/total）
export interface WordbookListResponse {
  result_code: number;
  data_body: {
    wordList?: WordbookListItem[];
    pageInfo?: WordbookPageInfo;
    list?: WordbookListItem[];
    total?: number;
  };
}
