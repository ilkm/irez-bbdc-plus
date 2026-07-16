// 检测是否为英文字符（原始 s 函数）
export function isEnglishChar(char: string): boolean {
  return /[a-zA-Z']+/.test(char);
}

// 转义引号（原始 c 函数）
export function escapeString(text: string): string {
  if (!text) return '';
  return text.replace(/(\")/g, '\\"').replace(/\'/g, "\\'");
}

// 检测是否为韩文字符 Hangul 码点（原始 Y 函数）
export function isKoreanCharCode(charCode: number): boolean {
  return (12592 < charCode && charCode < 12687) || (44032 <= charCode && charCode <= 55203);
}

// 检测非日文假名字符（原始 t 函数）
// 注意：这是辅助函数，返回 false 表示是日文假名范围外的字符
function isNotJapaneseKana(char: string): boolean {
  return !1 === /[^\u0800-\u4e00]/.test(char);
}

// 韩文字符数 > 2（原始 X 函数）
export function hasTooManyKorean(text: string): boolean {
  return [...text].filter(isNotJapaneseKana).length > 2;
}

// 检测非中文字符（原始 n 函数）
function isNotChinese(char: string): boolean {
  return !1 === /[^\u4e00-\u9fa5]/.test(char);
}

// 中文字符数 > 5（原始 M 函数）
export function hasTooManyChinese(text: string): boolean {
  return [...text].filter(isNotChinese).length > 5;
}

// 计算空格数量
export function countSpaces(text: string): number {
  return [...text].filter((char) => char === ' ').length;
}

// 从文本中提取纯英文（原始 mouseup 中的逻辑）
// /[a-zA-Z ]+/.exec(text) 取第一个匹配
export function extractEnglish(text: string): string {
  const match = /[a-zA-Z ]+/.exec(text);
  return match ? match[0] : '';
}

// popup.js 的 onParse 函数 — 输入过滤
// 移除非英文字符 [^a-zA-Z ]+，空检查，首处多空格替换单空格（非全局），trim
// 注意：原始代码用 / +/ （非全局）只替换第一处多空格，这是原始行为，必须保持
export function parseInput(text: string): string | null {
  let cleaned = text.replace(/[^a-zA-Z ]+/g, '');
  if (cleaned.length === 0 || cleaned.search(/^ +$/) !== -1) {
    return null;
  }
  // 注意：原始代码用 / +/ 非全局替换，只替换第一处连续空格
  let result = cleaned.replace(/ +/, ' ');
  result = result.replace(/^ +| +$/, '');
  return result;
}
