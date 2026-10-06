import fs from 'node:fs';
import { consolidate } from './lib/merge.js';

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
