import fs from 'node:fs';
import { consolidate } from './lib/merge.js';
import { CATEGORIES } from '../config/categories.js';
import { flatChecks, allChecksOk, isOk } from './export.js';
import { REVIEW_COLS } from './review.js';

const CHECKS = [['industry', '業種'], ['employees', '従業員数'], ['contact', '問い合わせURL'], ['identity', '企業特定']];
const esc = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** そのカテゴリで、4観点すべてOK(人の確認を含む)のサンプル件数 */
export function passingCount(companies, catKey, { minEmployees = 20 } = {}) {
  const def = CATEGORIES[catKey];
  return companies.filter((c) => {
    if (!c.seedCategories.includes(catKey)) return false;
    const r = consolidate(c, { minEmployees });
    if (def.maxEmployees && r.employees != null && r.employees > def.maxEmployees) return false;
    return r.status === 'OK' && r.categories.includes(def.label) && allChecksOk(flatChecks(c, catKey));
  }).length;
}

/**
 * 人が確認する会社の一覧。サンプルが目標(okTarget)に届いていないカテゴリで、「あと一歩」の会社だけを出す:
 *  - 検証済み: 4観点のうち要確認が2つまで・NGなし(人がOKと判断すれば合格になる)
 *  - 未検証: 判定が要確認で、不足項目が1つだけ(従業員数・問い合わせURL・公式URLなどを人が補えば検証に進める)
 * 並びは、手間が少ない順(要確認の数・不足項目の数)。
 */
export function buildReviewQueue(companies, { minEmployees = 20, okTarget = 10, categories = Object.keys(CATEGORIES) } = {}) {
  const rows = [];
  const summary = {};
  for (const catKey of categories) {
    const def = CATEGORIES[catKey];
    if (!def) continue;
    const have = passingCount(companies, catKey, { minEmployees });
    summary[def.label] = { 合格: have, 目標: okTarget, 確認対象: 0 };
    if (have >= okTarget) continue;
    for (const c of companies) {
      if (!c.seedCategories.includes(catKey)) continue;
      const r = consolidate(c, { minEmployees });
      if (r.status === '除外' || !r.categories.includes(def.label)) continue;
      if (def.maxEmployees && r.employees != null && r.employees > def.maxEmployees) continue;
      const checks = r.status === 'OK' ? flatChecks(c, catKey) : null;
      let item = null;
      if (checks) {
        const bad = CHECKS.filter(([k]) => !isOk(checks[k]));
        if (!bad.length || bad.length > 2 || bad.some(([k]) => checks[k]?.result === 'NG')) continue;
        item = { kind: '検証済み', effort: bad.length, points: bad.map(([, label]) => label).join(' / '), reason: bad.map(([k, label]) => `${label}: ${checks[k].comment}`).join(' ／ ') };
      } else if (r.status === '要確認' && r.missing.length === 1) {
        item = { kind: '未検証', effort: 1.5, points: r.missing[0], reason: `不足項目: ${r.missing[0]}（人が補えば検証に進める）` };
      } else continue;
      rows.push({ catKey, label: def.label, c, r, ...item });
      summary[def.label].確認対象++;
    }
  }
  rows.sort((a, b) => a.effort - b.effort || a.label.localeCompare(b.label, 'ja') || a.r.name.localeCompare(b.r.name, 'ja'));
  return { rows, summary };
}

const COLS = [
  [REVIEW_COLS.id, (x) => x.c.key],
  ['企業名', (x) => x.r.name],
  ['カテゴリ', (x) => x.label],
  [REVIEW_COLS.catKey, (x) => x.catKey],
  ['種別', (x) => x.kind],
  ['要確認の観点', (x) => x.points],
  ['理由', (x) => x.reason],
  ['公式URL', (x) => x.r.officialUrl],
  ['本社所在地', (x) => x.r.address],
  ['従業員数(現在)', (x) => x.r.employees],
  ['従業員数の根拠', (x) => x.r.evidence.employees && `${x.r.evidence.employees.source}: ${x.r.evidence.employees.snippet} ${x.r.evidence.employees.url ?? ''}`.trim()],
  ['問い合わせURL(現在)', (x) => x.r.contactUrl],
  ['備考', (x) => x.r.notes.join(' ; ')],
  [REVIEW_COLS.industry, () => ''],
  [REVIEW_COLS.employees, () => ''],
  [REVIEW_COLS.contact, () => ''],
  [REVIEW_COLS.identity, () => ''],
  [REVIEW_COLS.empValue, () => ''],
  [REVIEW_COLS.contactValue, () => ''],
  [REVIEW_COLS.officialValue, () => ''],
  [REVIEW_COLS.note, () => ''],
];

/** data/review_queue.csv を書く。人が右側の「…の判断」列に OK / NG、修正が要る所は「(修正)」列に値を入れて、review_input.csv として戻す */
export function writeReviewQueue(companies, { outDir = 'data', ...opts } = {}) {
  const { rows, summary } = buildReviewQueue(companies, opts);
  const csv = '﻿' + [COLS.map(([h]) => h).join(','), ...rows.map((x) => COLS.map(([, f]) => esc(f(x))).join(','))].join('\n');
  fs.writeFileSync(`${outDir}/review_queue.csv`, csv);
  return { count: rows.length, summary };
}
