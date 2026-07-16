import Dexie, { type Table } from 'dexie';

/** IndexedDB 中存储的生词条目 */
export interface WordbookEntry {
  word: string;
  info: string;
}

/** 生词本 Dexie 数据库 */
class WordbookDB extends Dexie {
  words!: Table<WordbookEntry, string>;

  constructor() {
    super('bbdc-wordbook');
    this.version(1).stores({
      // word 作为主键，info 为普通字段
      words: 'word, info',
    });
  }
}

export const db = new WordbookDB();
