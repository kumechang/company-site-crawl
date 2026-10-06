import fs from 'node:fs';
import { consolidate } from './lib/merge.js';
import { CATEGORIES } from '../config/categories.js';

const ENRICH_SOURCES = new Set(['official', 'salesnow', 'prtimes', 'gbizinfo', 'mynavi', 'careertasu', 'openwork']);
// 従業員数の出所の確からしさ（小さいほど確か）
const EMP_RANK = { official: 0, green: 1, grip: 1, mynavi: 2, careertasu: 2, gbizinfo: 2, houjingoo: 2, pitact: 2, salesnow: 3, agencyhub: 3, openwork: 3 };

const COLS = [
  ['企業名', (r) => r.name],
  ['判定', (r) => r.status],
  ['公式URL', (r) => r.officialUrl],
  ['本社所在地', (r) => r.address],
  ['東京都本社', (r) => (r.tokyo == null ? '未確認' : r.tokyo ? '○' : '×')],
  ['従業員数', (r) => r.employees],
  ['20名以上', (r) => (r.emp20 == null ? '未確認' : r.emp20 ? '○' : '×')],
  ['カテゴリ', (r) => r.categories.join(' / ')],
  ['カテゴリ根拠KW', (r) => r.categoryKeywords.join(' / ')],
  ['SNS運用代行の一覧に掲載', (r) => r.listedBy.join(' + ')],
  ['問い合わせURL', (r) => r.contactUrl],
  ['不足項目', (r) => r.missing.join(' / ')],
  ['情報源', (r) => r.sources.map((s) => s.source).filter((v, i, a) => a.indexOf(v) === i).join(' + ')],
  ['所在地の根拠', (r) => r.evidence.address && `${r.evidence.address.source}: ${r.evidence.address.url}`],
  ['従業員数の根拠', (r) => r.evidence.employees && `${r.evidence.employees.source}: ${r.evidence.employees.snippet} (${r.evidence.employees.url})`],
  ['備考', (r) => r.notes.join(' ; ')],
];

const esc = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportAll(companies, { outDir = 'data', minEmployees = 20 } = {}) {
  const rows = companies.map((c) => consolidate(c, { minEmployees }));
  const order = { OK: 0, 要確認: 1, 除外: 2 };
  rows.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name, 'ja'));
  const csv = '﻿' + [COLS.map((c) => c[0]).join(','), ...rows.map((r) => COLS.map(([, f]) => esc(f(r))).join(','))].join('\n');
  fs.writeFileSync(`${outDir}/companies.csv`, csv);
  fs.writeFileSync(`${outDir}/companies.report.json`, JSON.stringify(rows, null, 1));
  return rows;
}

/**
 * カテゴリごとの「しっかりしたサンプル」(判定OKのみ・最大 perCategory 件)。
 * そのカテゴリの一覧・検索で見つけた会社を対象に、複数媒体に載る会社・従業員数の出所が確かな会社を優先する。
 */
export function exportSample(companies, { outDir = 'data', perCategory = 15, minEmployees = 20 } = {}) {
  const rows = [];
  const summary = {};
  for (const [key, def] of Object.entries(CATEGORIES)) {
    const picked = companies
      .filter((c) => c.seedCategories.includes(key))
      .map((c) => ({ c, r: consolidate(c, { minEmployees }) }))
      .filter(({ r }) => r.status === 'OK' && r.categories.includes(def.label))
      .filter(({ r }) => !def.maxEmployees || r.employees == null || r.employees <= def.maxEmployees) // カテゴリ別の従業員数上限(広告代理店: 2,000名以下)
      .map((x) => ({ ...x, nSrc: new Set(x.c.sources.map((s) => s.source).filter((s) => !ENRICH_SOURCES.has(s))).size }))
      .sort((a, b) => b.nSrc - a.nSrc || (EMP_RANK[a.r.employeesSource] ?? 9) - (EMP_RANK[b.r.employeesSource] ?? 9) || a.r.name.localeCompare(b.r.name, 'ja'))
      .slice(0, perCategory);
    summary[def.label] = picked.length;
    for (const { r } of picked) rows.push({ ...r, sampleCategory: def.label });
  }
  const cols = [['カテゴリ', (r) => r.sampleCategory], ...COLS];
  const csv = '\uFEFF' + [cols.map((c) => c[0]).join(','), ...rows.map((r) => cols.map(([, f]) => esc(f(r))).join(','))].join('\n');
  fs.writeFileSync(`${outDir}/sample.csv`, csv);
  return { rows, summary };
}
