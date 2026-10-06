export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 全角→半角などの正規化 */
export const nfkc = (s) => (s ?? '').normalize('NFKC');

/** 会社名の突合用キー: 法人格・空白・記号を除去 */
export function normalizeName(name) {
  return nfkc(name)
    .toLowerCase()
    .replace(/株式会社|有限会社|合同会社|\(株\)|\(有\)|\(合\)|㈱|㈲|inc\.?|co\.,?\s*ltd\.?|ltd\.?|corporation|corp\.?/g, '')
    .replace(/[\s　・･\-ー_.,，、。()（）「」『』【】\[\]]/g, '');
}

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** innerText 等を ` | ` 区切りの1行テキストにする */
export const flatten = (text) =>
  (text ?? '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' | ');

export const lines = (text) =>
  (text ?? '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

export const clip = (s, n = 120) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
};

export function log(...args) {
  console.error(new Date().toISOString().slice(11, 19), ...args);
}
