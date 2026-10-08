import fs from 'node:fs';
import { consolidate } from './lib/merge.js';
import { CATEGORIES } from '../config/categories.js';
import { worst } from './verify.js';
import { HUMAN_OK, applyHuman } from './review.js';

const ENRICH_SOURCES = new Set(['official', 'edinet', 'salesnow', 'prtimes', 'gbizinfo', 'mynavi', 'careertasu', 'openwork']);
// 従業員数の出所の確からしさ（小さいほど確か）
const EMP_RANK = { edinet: 0, official: 0, green: 1, grip: 1, mynavi: 2, careertasu: 2, gbizinfo: 2, houjingoo: 2, pitact: 2, salesnow: 3, agencyhub: 3, openwork: 3 };

const COLS = [
  ['企業名', (r) => r.name],
  ['判定', (r) => r.status],
  ['公式URL', (r) => r.officialUrl],
  ['本社所在地', (r) => r.address],
  ['東京都本社', (r) => (r.tokyo == null ? '未確認' : r.tokyo ? '○' : '×')],
  ['従業員数', (r) => r.employees],
  ['従業員数の時点', (r) => r.employeesAsOf],
  ['20名以上', (r) => (r.emp20 == null ? '未確認' : r.emp20 ? '○' : '×')],
  ['カテゴリ', (r) => r.categories.join(' / ')],
  ['カテゴリ根拠KW', (r) => r.categoryKeywords.join(' / ')],
  ['SNS運用代行の一覧に掲載', (r) => r.listedBy.join(' + ')],
  ['問い合わせURL', (r) => r.contactUrl],
  ['不足項目', (r) => r.missing.join(' / ')],
  ['情報源', (r) => r.sources.map((s) => s.source).filter((v, i, a) => a.indexOf(v) === i).join(' + ')],
  ['所在地の根拠', (r) => r.evidence.address && `${r.evidence.address.source}: ${r.evidence.address.url}`],
  ['従業員数の根拠', (r) => r.evidence.employees && `${r.evidence.employees.source}: ${r.evidence.employees.snippet} (${r.evidence.employees.url})`],
  ['EDINETコード', (r) => r.edinetCode],
  ['証券コード', (r) => r.securitiesCode],
  ['備考', (r) => r.notes.join(' ; ')],
];

/** 検証結果(c.checks)を1行ぶんに平らにする。catKey があればその業種チェック、無ければ全カテゴリの最悪値 */
export function flatChecks(c, catKey = null) {
  const k = c.checks;
  if (!k) return null;
  const inds = catKey ? [[catKey, k.industry?.[catKey]]] : Object.entries(k.industry ?? {});
  const ind = inds.filter(([, v]) => v);
  const industry = ind.length ? { result: worst(...ind.map(([, v]) => v.result)), comment: ind.map(([key, v]) => `[${CATEGORIES[key]?.label ?? key}] ${v.comment}`).join(' / '), after: ind.map(([, v]) => v.after).filter(Boolean)[0] ?? null } : { result: '要確認', comment: '業種チェック未実施', after: null };
  return applyHuman({ industry, employees: k.employees, contact: k.contact, identity: k.identity, verifiedAt: k.verifiedAt }, c, catKey); // 人の判断があれば上書き
}

const CHECK_COLS = [
  ['業種チェック', (r) => r.checks?.industry.result],
  ['従業員数チェック', (r) => r.checks?.employees.result],
  ['問い合わせURLチェック', (r) => r.checks?.contact.result],
  ['企業取り違えチェック', (r) => r.checks?.identity.result],
  ['チェックコメント', (r) => r.checks && [`業種: ${r.checks.industry.comment}`, `従業員数: ${r.checks.employees.comment}`, `問い合わせURL: ${r.checks.contact.comment}`, `企業特定: ${r.checks.identity.comment}`].join(' ／ ')],
  ['確認後業種', (r) => r.checks?.industry.after],
  ['確認後従業員数', (r) => r.checks?.employees.after],
  ['従業員数確認時点', (r) => r.checks?.employees.asOf],
  ['確認後問い合わせURL', (r) => r.checks?.contact.after],
  ['企業特定URL', (r) => r.checks?.identity.after],
  ['検証日', (r) => r.checks?.verifiedAt],
];

const esc = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportAll(companies, { outDir = 'data', minEmployees = 20 } = {}) {
  const rows = companies.map((c) => ({ ...consolidate(c, { minEmployees }), checks: flatChecks(c) }));
  const order = { OK: 0, 要確認: 1, 除外: 2 };
  rows.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name, 'ja'));
  const csv = '﻿' + [[...COLS, ...CHECK_COLS].map((c) => c[0]).join(','), ...rows.map((r) => [...COLS, ...CHECK_COLS].map(([, f]) => esc(f(r))).join(','))].join('\n');
  fs.writeFileSync(`${outDir}/companies.csv`, csv);
  fs.writeFileSync(`${outDir}/companies.report.json`, JSON.stringify(rows, null, 1));
  return rows;
}

/**
 * カテゴリごとの「しっかりしたサンプル」(判定OKのみ・最大 perCategory 件)。
 * そのカテゴリの一覧・検索で見つけた会社を対象に、複数媒体に載る会社・従業員数の出所が確かな会社を優先する。
 */
export const isOk = (x) => x && (x.result === 'OK' || x.result === 'OK（リダイレクト）' || x.result === HUMAN_OK);
/** 4観点(業種・従業員数・問い合わせURL・企業取り違え)がすべてOKか */
export const allChecksOk = (checks) => !!checks && [checks.industry, checks.employees, checks.contact, checks.identity].every(isOk);

export function exportSample(companies, { outDir = 'data', perCategory = 15, minEmployees = 20 } = {}) {
  const rows = [];
  const review = [];
  const summary = {};
  for (const [key, def] of Object.entries(CATEGORIES)) {
    const cand = companies
      .filter((c) => c.seedCategories.includes(key))
      .map((c) => ({ c, r: { ...consolidate(c, { minEmployees }), checks: flatChecks(c, key) } }))
      .filter(({ r }) => r.status === 'OK' && r.categories.includes(def.label))
      .filter(({ r }) => !def.maxEmployees || r.employees == null || r.employees <= def.maxEmployees); // カテゴリ別の従業員数上限(広告代理店: 2,000名以下)
    // サンプルは「検証(4観点)がすべてOK」の会社だけ。要確認・NGは理由つきで sample_review.csv に出す
    const solid = cand.filter(({ r }) => allChecksOk(r.checks));
    const picked = solid
      .map((x) => ({ ...x, nSrc: new Set(x.c.sources.map((s) => s.source).filter((s) => !ENRICH_SOURCES.has(s))).size }))
      // 複数媒体に載る会社・従業員数の出所が確かな会社を先に
      .sort((a, b) => b.nSrc - a.nSrc || (EMP_RANK[a.r.employeesSource] ?? 9) - (EMP_RANK[b.r.employeesSource] ?? 9) || a.r.name.localeCompare(b.r.name, 'ja'))
      .slice(0, perCategory);
    summary[def.label] = picked.length;
    for (const { r } of picked) rows.push({ ...r, sampleCategory: def.label });
    for (const { r } of cand.filter(({ r }) => !allChecksOk(r.checks))) review.push({ ...r, sampleCategory: def.label });
  }
  const cols = [['カテゴリ', (r) => r.sampleCategory], ...COLS, ...CHECK_COLS];
  const toCsv = (rs) => '\uFEFF' + [cols.map((c) => c[0]).join(','), ...rs.map((r) => cols.map(([, f]) => esc(f(r))).join(','))].join('\n');
  fs.writeFileSync(`${outDir}/sample.csv`, toCsv(rows));
  fs.writeFileSync(`${outDir}/sample_review.csv`, toCsv(review));
  return { rows, summary, review: review.length };
}
