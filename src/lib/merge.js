import { classify } from './classify.js';
import { isTokyoAddress } from './extract.js';
import { nfkc } from './util.js';
import { CATEGORIES } from '../../config/categories.js';

/**
 * 項目ごとの情報源の優先順位（左ほど信頼）。
 *  公式サイト > 求人媒体の企業ページ(Green) > 比較サイト(アイミツ) > Wantedly
 */
export const PRIORITY = {
  employees: ['official', 'green', 'imitsu', 'wantedly'],
  address: ['official', 'green', 'wantedly', 'imitsu'],
};

const rank = (field, source) => {
  const i = (PRIORITY[field] ?? []).indexOf(source);
  return i < 0 ? 99 : i;
};

const byField = (c, field) => c.evidence.filter((e) => e.field === field);

/** 優先順位の最上位の証拠を採用し、他情報源との食い違いも返す */
export function pick(c, field, { valid = () => true, same = (a, b) => a === b } = {}) {
  const ev = byField(c, field)
    .filter((e) => valid(e.value))
    .sort((a, b) => rank(field, a.source) - rank(field, b.source));
  if (!ev.length) return null;
  const best = ev[0];
  const conflicts = ev.slice(1).filter((e) => !same(e.value, best.value));
  return { value: best.value, source: best.source, url: best.url, snippet: best.snippet, from: [...new Set(ev.map((e) => e.source))], conflicts };
}

/** 統合してレポート用の1レコードにする */
export function consolidate(c, { minEmployees = 20 } = {}) {
  const emp = pick(c, 'employees', { valid: (v) => Number.isFinite(v) });
  const addr = pick(c, 'address', { same: (a, b) => isTokyoAddress(a) === isTokyoAddress(b) });
  const members = pick(c, 'wantedlyMembers');
  const contact = pick(c, 'contactUrl');

  const text = byField(c, 'profileText').map((e) => e.value).join(' ');
  const cats = classify(`${c.name} ${text}`);

  const tokyo = addr ? isTokyoAddress(addr.value) : null;
  // 従業員数: 確定値があれば判定、無ければ Wantedly メンバー数は参考値(判定には使わない)
  const emp20 = emp ? emp.value >= minEmployees : null;

  const missing = [];
  if (!c.officialUrl) missing.push('公式URL');
  if (tokyo === null) missing.push('本社所在地');
  if (emp20 === null) missing.push('従業員数');
  if (!cats.length) missing.push('カテゴリ');
  if (!contact) missing.push('問い合わせURL');

  let status;
  if (tokyo === false || emp20 === false) status = '除外';
  else if (missing.length === 0) status = 'OK';
  else status = '要確認';

  const notes = [];
  if (emp?.conflicts.length) notes.push(`従業員数が情報源間で不一致: ${[emp, ...emp.conflicts].map((e) => `${e.source ?? emp.source}=${e.value}`).join(', ')}`);
  if (addr?.conflicts.length) notes.push(`所在地(東京/他)が情報源間で不一致`);
  if (!cats.length && c.seedCategories.length) notes.push(`カテゴリは検索元の推定のみ: ${[...new Set(c.seedCategories)].map((k) => CATEGORIES[k]?.label).join('/')}`);
  if (emp == null && members) notes.push(`Wantedlyメンバー数 ${members.value}人(参考・従業員数とは別物)`);

  return {
    name: c.name,
    officialUrl: c.officialUrl,
    address: addr?.value ?? null,
    tokyo,
    employees: emp?.value ?? null,
    employeesSource: emp?.source ?? null,
    emp20,
    categories: cats.map((x) => x.label),
    categoryKeywords: [...new Set(cats.flatMap((x) => x.keywords))],
    contactUrl: contact?.value ?? null,
    status,
    missing,
    sources: c.sources,
    evidence: {
      address: addr && { source: addr.source, url: addr.url, snippet: addr.snippet },
      employees: emp && { source: emp.source, url: emp.url, snippet: emp.snippet },
      contact: contact && { source: contact.source, url: contact.url, snippet: contact.snippet },
    },
    notes,
  };
}

export const normalizeText = nfkc;
