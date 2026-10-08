import { addEvidence } from './lib/model.js';
import { normalizeName } from './lib/util.js';

/**
 * 人の確認(レビュー)。要確認の会社を、人が確認用CSVで判断・修正し、その結果を c.review に取り込む。
 *  c.review = { at, note, industry: {カテゴリキー: 'OK'|'NG'}, employees, contact, identity: 'OK'|'NG', ... }
 *  人が直した値(従業員数・問い合わせURL・公式URL)は、source='human' の証拠として追加し、第三者・公式より優先する。
 */
export const HUMAN_OK = 'OK（人の確認）';

/** CSV(ダブルクォート・"" エスケープ・セル内改行・BOM・CRLF 対応) → 2次元配列 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  const s = (text ?? '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

/** ヘッダ行つきの2次元配列 → [{列名: 値}] */
export function toRecords(rows) {
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

/** OK/NG の入力ゆれ(ok・○・✓ / ng・×・✗)を正規化。判断なし(空・不明)は null */
export function normalizeDecision(v) {
  const t = (v ?? '').normalize('NFKC').trim().toLowerCase();
  if (['ok', '○', '〇', '✓', 'yes', 'y'].includes(t)) return 'OK';
  if (['ng', '×', '✗', 'no', 'n'].includes(t)) return 'NG';
  return null;
}

const normUrl = (u) => {
  const t = (u ?? '').trim();
  if (!t) return null;
  try {
    return new URL(/^https?:/i.test(t) ? t : `https://${t}`).toString();
  } catch {
    return null;
  }
};

export const REVIEW_COLS = {
  id: '企業ID',
  catKey: 'カテゴリキー',
  industry: '業種の判断',
  employees: '従業員数の判断',
  contact: '問い合わせURLの判断',
  identity: '企業特定の判断',
  empValue: '従業員数(修正)',
  contactValue: '問い合わせURL(修正)',
  officialValue: '公式URL(修正)',
  note: 'メモ',
};

/**
 * 確認用CSVの行を会社に取り込む。判断も修正も空の行は無視。企業IDが見つからない行は unknown に数える。
 * @param {{all(): object[]}} store  @returns {{applied:number, unknown:number, skipped:number}}
 */
export function importReviewRows(store, records, now = new Date()) {
  const byKey = new Map(store.all().map((c) => [c.key, c]));
  let applied = 0;
  let unknown = 0;
  let skipped = 0;
  const at = now.toISOString().slice(0, 10);
  for (const rec of records) {
    const c = byKey.get(rec[REVIEW_COLS.id]) ?? byKey.get(normalizeName(rec[REVIEW_COLS.id] ?? ''));
    const d = { industry: normalizeDecision(rec[REVIEW_COLS.industry]), employees: normalizeDecision(rec[REVIEW_COLS.employees]), contact: normalizeDecision(rec[REVIEW_COLS.contact]), identity: normalizeDecision(rec[REVIEW_COLS.identity]) };
    // 「従業員数の判断」の列に数字を入れた場合は、「従業員数(修正)」の値として扱う（入力の取り違えを救う）
    const judgeCell = (rec[REVIEW_COLS.employees] ?? '').normalize('NFKC').replace(/[,\s名人]/g, '');
    const asValue = /^\d+$/.test(judgeCell) ? judgeCell : '';
    const empValue = parseInt((rec[REVIEW_COLS.empValue] ?? '').normalize('NFKC').replace(/[,\s名人]/g, '') || asValue, 10);
    const contactValue = normUrl(rec[REVIEW_COLS.contactValue]);
    const officialValue = normUrl(rec[REVIEW_COLS.officialValue]);
    const note = rec[REVIEW_COLS.note] ?? '';
    const any = Object.values(d).some(Boolean) || Number.isFinite(empValue) || contactValue || officialValue;
    if (!any) {
      skipped++;
      continue;
    }
    if (!c) {
      unknown++;
      continue;
    }
    const rv = (c.review ??= { industry: {} });
    rv.at = at;
    if (note) rv.note = note;
    const catKey = rec[REVIEW_COLS.catKey];
    if (d.industry && catKey) (rv.industry ??= {})[catKey] = d.industry;
    for (const k of ['employees', 'contact', 'identity']) if (d[k]) rv[k] = d[k];
    const src = { source: 'human', url: '', snippet: `人が確認(${at})${note ? `: ${note}` : ''}` };
    if (Number.isFinite(empValue)) {
      rv.employeesValue = empValue;
      c.evidence = c.evidence.filter((e) => !(e.field === 'employees' && e.source === 'human'));
      addEvidence(c, 'employees', empValue, src);
    }
    if (contactValue) {
      rv.contactUrl = contactValue;
      c.evidence = c.evidence.filter((e) => !(e.field === 'contactUrl' && e.source === 'human'));
      addEvidence(c, 'contactUrl', contactValue, src);
    }
    if (officialValue) {
      rv.officialUrl = officialValue;
      c.evidence = c.evidence.filter((e) => !(e.field === 'officialUrl' && e.source === 'human'));
      addEvidence(c, 'officialUrl', new URL(officialValue).origin + '/', src);
      c.officialUrl = new URL(officialValue).origin + '/';
      c.domain = new URL(officialValue).hostname.replace(/^www\./, '');
    }
    applied++;
  }
  return { applied, unknown, skipped };
}

/** 検証結果(flatChecks の戻り値)に、人の判断を上書きして返す。判断が無い観点はそのまま */
export function applyHuman(checks, c, catKey) {
  const rv = c.review;
  if (!checks || !rv) return checks;
  const over = (orig, decision) => {
    if (!decision) return orig;
    const tag = `人の判断(${rv.at}): ${decision}${rv.note ? ` ${rv.note}` : ''}`;
    return { ...orig, result: decision === 'OK' ? HUMAN_OK : 'NG', comment: `${tag} ／ 元の判定: ${orig?.result} ${orig?.comment ?? ''}`.trim() };
  };
  return { ...checks, industry: over(checks.industry, rv.industry?.[catKey]), employees: over(checks.employees, rv.employees), contact: over(checks.contact, rv.contact), identity: over(checks.identity, rv.identity) };
}
