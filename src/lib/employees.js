import { nfkc } from './util.js';

/**
 * 従業員数が「確認済み」と言えるか。第三者サイトの値(Gビズ・SalesNow・OpenWork等)は古い/推定/連結のことが多く、
 * 公式の値でも集計範囲(連結・グループ・業務委託・関連会社を含む等)や時点で意味が変わる。
 */
export const ESTIMATE_SOURCES = new Set(['salesnow', 'agencyhub', 'openwork', 'gbizinfo']); // 推定値・レンジ・古い可能性のある政府保有情報
export const SCOPE_RE = /連結|グループ(?:全体|合計|計|総数|スタッフ|従業員|人員)|当社グループ|関連会社|業務委託|派遣|うち日本|国内外|海外含/;
const STALE_YEARS = 3; // これより古い時点の数字は現行値として断定しない

/** 「2026年5月」「2025年10月現在」などの時点 → { year, month, label } */
export function asOf(s) {
  const m = nfkc(s ?? '').match(/(20\d\d)\s*年\s*(\d{1,2})?\s*月?/);
  return m ? { year: Number(m[1]), month: m[2] ? Number(m[2]) : null, label: `${m[1]}年${m[2] ? m[2] + '月' : ''}` } : null;
}

export const SOURCE_LABELS = { official: '公式サイト', edinet: '有価証券報告書(EDINET)', human: '人の確認', green: 'Green', wantedly: 'Wantedly', mynavi: 'マイナビ(新卒)', careertasu: 'キャリタス就活', renew: 'Renew(インターン求人)', openwork: 'OpenWork', gbizinfo: 'Gビズインフォ', salesnow: 'SalesNow', agencyhub: 'AgencyHub', grip: 'グリップ', houjingoo: '全国法人', pitact: 'PITACT', engage: 'engage', kyujinbox: '求人ボックス', stanby: 'スタンバイ' };
export const RECRUIT_SOURCES = new Set(['green', 'wantedly', 'mynavi', 'careertasu', 'renew', 'openwork', 'engage', 'kyujinbox', 'stanby']); // 採用サイト

/**
 * 従業員数の採用ルール(merge.js の pickEmployees で選んだ値の評価):
 *  1. 公式サイトから取れればそれを正とする（連結・グループ等の記載や古い時点は、備考に残すだけで確認済みを妨げない）
 *  2. 採用サイトなどから取った値に「◯◯年時点」の記載があれば、備考に残す（時点の記載が無ければ、その旨）
 *  3. 公式サイト以外から取れた場合は、時点が最も新しい情報を採用する（merge.js）
 * 値が取れていれば「確認済み」。要確認に残るのは、値が全く取れない会社か、推定値が閾値付近(10〜40名)の会社。
 * @param emp  採用した従業員数 { value, source, snippet }
 * @param evs  従業員数の証拠すべて [{ value, source, snippet }]
 * @returns { confirmed, reasons[], remarks[], asOf, scope }  remarks は備考欄に出す文
 */
export function assessEmployees(emp, evs, { now = new Date() } = {}) {
  if (!emp) return { confirmed: false, reasons: ['従業員数を確認できていない'], remarks: [], asOf: null, scope: null };
  const remarks = [];
  const scope = (emp.snippet ?? '').match(SCOPE_RE)?.[0] ?? null;
  const date = asOf(emp.snippet);
  const label = SOURCE_LABELS[emp.source] ?? emp.source;
  if (emp.source === 'human') {
    remarks.push('従業員数は人が確認した値');
  } else if (emp.source === 'official') {
    if (scope) remarks.push(`公式の数字に「${scope}」の記載あり（単体の従業員数ではない可能性）`);
    if (date && now.getFullYear() - date.year >= STALE_YEARS) remarks.push(`公式の数字は${date.label}時点と古い`);
  } else {
    const kind = RECRUIT_SOURCES.has(emp.source) ? '採用サイト' : '公式サイト以外';
    remarks.push(`公式サイトでは確認できず、${kind}(${label})の値を採用${date ? `（${date.label}時点）` : '（時点の記載なし）'}`);
    if (scope) remarks.push(`この数字に「${scope}」の記載あり（単体の従業員数ではない可能性）`);
    if (ESTIMATE_SOURCES.has(emp.source)) remarks.push(`${label}の値は推定値/レンジ/古い可能性のある値`);
  }
  return { confirmed: true, reasons: remarks, remarks, asOf: date?.label ?? null, scope };
}
