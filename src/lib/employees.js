import { nfkc } from './util.js';

/**
 * 従業員数が「確認済み」と言えるか。第三者サイトの値(Gビズ・SalesNow・OpenWork等)は古い/推定/連結のことが多く、
 * 公式の値でも集計範囲(連結・グループ・業務委託・関連会社を含む等)や時点で意味が変わる。
 */
export const ESTIMATE_SOURCES = new Set(['salesnow', 'agencyhub', 'openwork', 'gbizinfo']); // 推定値・レンジ・古い可能性のある政府保有情報
const CORROBORATING = new Set(['green', 'grip', 'mynavi', 'careertasu', 'houjingoo', 'pitact']); // 複数一致すれば補強になる第三者
export const SCOPE_RE = /連結|グループ(?:全体|合計|計|総数|スタッフ|従業員|人員)|当社グループ|関連会社|業務委託|派遣|うち日本|国内外|海外含/;
const PRIMARY_SOURCES = new Set(['official', 'edinet']); // 会社自身が出した数字（公式サイト・有価証券報告書）
const STALE_YEARS = 3; // これより古い時点の数字は現行値として断定しない

/** 「2026年5月」「2025年10月現在」などの時点 → { year, month, label } */
export function asOf(s) {
  const m = nfkc(s ?? '').match(/(20\d\d)\s*年\s*(\d{1,2})?\s*月?/);
  return m ? { year: Number(m[1]), month: m[2] ? Number(m[2]) : null, label: `${m[1]}年${m[2] ? m[2] + '月' : ''}` } : null;
}

const ratio = (a, b) => Math.max(a, b) / Math.max(1, Math.min(a, b));

/**
 * @param emp  採用した従業員数 { value, source, snippet }
 * @param evs  従業員数の証拠すべて [{ value, source, snippet }]
 * @returns { confirmed, reasons[], asOf, scope }
 */
export function assessEmployees(emp, evs, { now = new Date() } = {}) {
  if (!emp) return { confirmed: false, reasons: ['従業員数を確認できていない'], asOf: null, scope: null };
  const reasons = [];
  const scope = (emp.snippet ?? '').match(SCOPE_RE)?.[0] ?? null;
  const date = asOf(emp.snippet);
  let confirmed;
  if (PRIMARY_SOURCES.has(emp.source)) {
    const label = emp.source === 'edinet' ? '有価証券報告書' : '公式';
    confirmed = true;
    if (scope) {
      confirmed = false;
      reasons.push(`${label}の数字に「${scope}」の記載があり、単体の従業員数ではない可能性`);
    }
    if (date && now.getFullYear() - date.year >= STALE_YEARS) {
      confirmed = false;
      reasons.push(`${label}の数字が${date.label}時点と古く、現行値として断定できない`);
    }
  } else {
    const others = evs.filter((e) => e.source !== emp.source && CORROBORATING.has(e.source) && ratio(e.value, emp.value) <= 1.5);
    confirmed = CORROBORATING.has(emp.source) && others.length > 0 && !scope;
    reasons.push(
      confirmed
        ? `公式では確認できないが、${emp.source}と${others.map((e) => e.source).join('/')}の値が概ね一致`
        : `公式サイトで従業員数を確認できず、${emp.source}の${ESTIMATE_SOURCES.has(emp.source) ? '推定値/レンジ/古い可能性のある値' : '値'}(${emp.value}名)のみ。第三者情報のため断定しない`
    );
  }
  return { confirmed, reasons, asOf: date?.label ?? null, scope };
}
