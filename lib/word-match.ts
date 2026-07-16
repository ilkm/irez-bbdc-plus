/**
 * 高亮匹配：纯规则词形还原（无白名单）。
 * 生词本多为原形；页面上常见复数与缩写，靠后缀规则自动展开候选。
 */

/** 统一弯引号，便于 it's / it’s / can’t 一致处理 */
export function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/[\u2018\u2019\u2032]/g, "'");
}

/**
 * 英文词 tokenization：
 * - 以字母开头，不含包裹性引号（避免 'cloud 把引号算进词）
 * - 允许词中缩写 it's / can't
 * - 允许连字符复合词 cloud-native
 * - 不得贴在数字/下划线旁（避免 UUID / 4a0 等被拆出 a）
 */
export const WORD_RE =
  /(?<![A-Za-z0-9_])[a-zA-Z]+(?:[\u2018\u2019'][a-zA-Z]+)*(?:-[a-zA-Z]+(?:[\u2018\u2019'][a-zA-Z]+)*)*(?![A-Za-z0-9_])/g;

/** 缩写后缀：按长到短匹配（n't 单独处理） */
const CONTRACTION_SUFFIXES = ["'re", "'ve", "'ll", "'d", "'m", "'s"] as const;

/** 由缩写规则展开候选 */
function contractionCandidates(w: string): string[] {
  if (!w.includes("'")) return [];

  const out: string[] = [];

  // n't：同时去掉 n't 与 't，覆盖 don't→do 与 can't→can
  if (w.endsWith("n't") && w.length > 3) {
    out.push(w.slice(0, -3));
    out.push(w.slice(0, -2));
  } else {
    for (const suf of CONTRACTION_SUFFIXES) {
      if (w.endsWith(suf) && w.length > suf.length) {
        out.push(w.slice(0, -suf.length));
        break;
      }
    }
  }

  const apo = w.indexOf("'");
  if (apo > 0) {
    out.push(w.slice(0, apo));
  }

  return out;
}

/** 由复数等屈折规则展开候选 */
function inflectionCandidates(w: string): string[] {
  if (w.includes("'") || w.includes('-')) return [];

  const out: string[] = [];

  if (w.length > 4 && w.endsWith('ies')) {
    out.push(w.slice(0, -3) + 'y');
  }

  if (w.length > 4 && w.endsWith('ves')) {
    out.push(w.slice(0, -3) + 'f');
    out.push(w.slice(0, -3) + 'fe');
  }

  if (
    w.length > 4 &&
    (w.endsWith('xes') ||
      w.endsWith('zes') ||
      w.endsWith('ches') ||
      w.endsWith('shes') ||
      w.endsWith('sses'))
  ) {
    out.push(w.slice(0, -2));
  }

  if (w.length > 4 && w.endsWith('oes')) {
    out.push(w.slice(0, -2));
  }

  if (w.length > 4 && w.endsWith('es') && !w.endsWith('sses')) {
    out.push(w.slice(0, -2));
  }

  if (w.length > 2 && w.endsWith('s') && !w.endsWith('ss')) {
    out.push(w.slice(0, -1));
  }

  return out;
}

/**
 * 生成命中生词本的候选（含原词）。
 * 连字符词额外尝试去连字符形式（少见，但无害）。
 */
export function stemCandidates(token: string): string[] {
  const w = normalizeToken(token);
  if (!w) return [];

  const out: string[] = [w];
  out.push(...contractionCandidates(w));
  out.push(...inflectionCandidates(w));

  if (w.includes('-')) {
    out.push(w.replace(/-/g, ''));
  }

  return [...new Set(out.filter(Boolean))];
}

/** 若 token 或其词形能命中 wordSet，返回命中的原形（用于同色）；否则 null */
export function matchWordInSet(token: string, wordSet: Set<string>): string | null {
  for (const c of stemCandidates(token)) {
    if (wordSet.has(c)) return c;
  }
  return null;
}

/** 高亮区间：整词命中，或连字符复合词按段命中 */
export function findHighlightRanges(
  token: string,
  wordSet: Set<string>,
): Array<{ start: number; end: number; lemma: string }> {
  const full = matchWordInSet(token, wordSet);
  if (full) {
    return [{ start: 0, end: token.length, lemma: full }];
  }

  if (!token.includes('-')) return [];

  const ranges: Array<{ start: number; end: number; lemma: string }> = [];
  let offset = 0;
  const parts = token.split('-');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const lemma = matchWordInSet(part, wordSet);
    if (lemma) {
      ranges.push({ start: offset, end: offset + part.length, lemma });
    }
    offset += part.length + (i < parts.length - 1 ? 1 : 0);
  }
  return ranges;
}
