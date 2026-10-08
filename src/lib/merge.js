import { classify } from './classify.js';
import { isTokyoAddress } from './extract.js';
import { nfkc } from './util.js';
import { bestOfficial } from './model.js';
import { assessEmployees, asOf } from './employees.js';
import { CATEGORIES } from '../../config/categories.js';

/**
 * 項目ごとの情報源の優先順位（左ほど信頼）。
 *  有価証券報告書(EDINET・一次情報) > 公式サイト > 求人媒体の企業ページ(Green) > Gビズインフォ(政府保有情報) > SalesNow(推定値) > 比較サイト(アイミツ) > Wantedly
 */
/** SNS運用代行の会社一覧を載せている媒体 */
export const LISTING_SITES = ['boxil', 'aspic', 'buzztan', 'webkanji', 'meetsmore', 'slidelib'];

export const PRIORITY = {
  employees: ['human', 'edinet', 'official', 'green', 'grip', 'mynavi', 'careertasu', 'gbizinfo', 'houjingoo', 'pitact', 'salesnow', 'agencyhub', 'openwork', 'imitsu', 'wantedly'],
  contactUrl: ['human', 'official'], // 人が確認した問い合わせURLを最優先
  address: ['human', 'edinet', 'official', 'mynavi', 'careertasu', 'gbizinfo', 'grip', 'houjingoo', 'pitact', 'jcia', 'openwork', 'green', 'salesnow', 'wantedly', 'imitsu'],
};

const rank = (field, source) => {
  const i = (PRIORITY[field] ?? []).indexOf(source);
  return i < 0 ? 99 : i;
};

const byField = (c, field) => c.evidence.filter((e) => e.field === field);

/** 優先順位の最上位の証拠を採用し、他情報源との食い違いも返す */
export function pick(c, field, { valid = () => true, same = (a, b) => a === b, exclude = () => false } = {}) {
  const ev = byField(c, field)
    .filter((e) => valid(e.value) && !exclude(e))
    .sort((a, b) => rank(field, a.source) - rank(field, b.source));
  if (!ev.length) return null;
  const best = ev[0];
  const conflicts = ev.slice(1).filter((e) => !same(e.value, best.value));
  return { value: best.value, source: best.source, url: best.url, snippet: best.snippet, from: [...new Set(ev.map((e) => e.source))], conflicts };
}

/**
 * 従業員数の採用ルール:
 *  1. 人が確認した値 → 2. 公式サイトの値（取れればそれを正とする）→
 *  3. それ以外は、「◯◯年時点」の記載が最も新しい情報（時点の記載が無いものは最後。同じ新しさなら従来の情報源の優先順位）
 */
export function pickEmployees(c, { exclude = () => false } = {}) {
  const ev = byField(c, 'employees').filter((e) => Number.isFinite(e.value) && !exclude(e));
  if (!ev.length) return null;
  const tier = (e) => (e.source === 'human' ? 0 : e.source === 'official' ? 1 : 2);
  const when = (e) => {
    const d = asOf(e.snippet);
    return d ? d.year * 12 + (d.month ?? 6) : -1;
  };
  ev.sort((a, b) => tier(a) - tier(b) || (tier(a) === 2 ? when(b) - when(a) : 0) || rank('employees', a.source) - rank('employees', b.source));
  const best = ev[0];
  const conflicts = ev.slice(1).filter((e) => e.value !== best.value);
  return { value: best.value, source: best.source, url: best.url, snippet: best.snippet, from: [...new Set(ev.map((e) => e.source))], conflicts };
}

/** 統合してレポート用の1レコードにする */
export function consolidate(c, { minEmployees = 20 } = {}) {
  const addr = pick(c, 'address', { same: (a, b) => isTokyoAddress(a) === isTokyoAddress(b) });
  // 同名の別会社を引いた可能性: その情報源自身の住所が、採用した住所と都道府県で食い違うなら、その情報源の従業員数は使わない
  const prefOf = (a) => (nfkc(a ?? '').replace(/^[\s　]*(?:〒\s*)?\d{3}[-ー−]?\d{4}[\s　]*/, '').match(/^(東京都|北海道|京都府|大阪府|[一-龥]{2,3}県)/) ?? [])[1] ?? null;
  const finalPref = addr ? prefOf(addr.value) : null;
  const rejected = new Set(
    c.evidence
      .filter((e) => e.field === 'address' && finalPref && prefOf(e.value) && prefOf(e.value) !== finalPref)
      .map((e) => e.source)
      .filter((src) => src !== addr?.source)
  );
  const emp = pickEmployees(c, { exclude: (e) => rejected.has(e.source) });
  const members = pick(c, 'wantedlyMembers');
  const edinetCode = byField(c, 'edinetCode')[0] ?? null;
  const consolidated = byField(c, 'employeesConsolidated')[0] ?? null;
  const contact = pick(c, 'contactUrl');
  const off = bestOfficial(c);
  const officialUrl = off && typeof off === 'object' ? off.url : c.officialUrl;
  // SNS運用代行の「会社一覧」を掲載している媒体（ツール会社や求人だけで見つかった会社との見分けに使う）
  const listedBy = [...new Set(c.sources.map((x) => x.source).filter((x) => LISTING_SITES.includes(x)))];

  const text = byField(c, 'profileText').map((e) => e.value).join(' ');
  const cats = classify(`${c.name} ${text}`);

  const tokyo = addr ? isTokyoAddress(addr.value) : null;
  // 従業員数: 確定値があれば判定、無ければ Wantedly メンバー数は参考値(判定には使わない)
  // SalesNow の規模は推定値。閾値付近(10〜40名)は断定せず「要確認」にする
  const estimateOnly = ['salesnow', 'agencyhub', 'gbizinfo', 'openwork'].includes(emp?.source); // 時点不明の推定値・規模レンジ・政府保有情報は、採用はするが、閾値付近(10〜40名)では断定せず要確認（20名未満での除外を避ける）
  const nearThreshold = estimateOnly && emp.value >= 10 && emp.value <= 40;
  const emp20 = emp ? (nearThreshold ? null : emp.value >= minEmployees) : null;

  // 従業員数の採用ルールに沿った評価(値が取れていれば確認済み。時点・出所・集計範囲は備考に残す)
  const empEvs = byField(c, 'employees').filter((e) => Number.isFinite(e.value) && !rejected.has(e.source));
  const empCheck = assessEmployees(emp, empEvs);

  const missing = [];
  if (!officialUrl) missing.push('公式URL');
  if (tokyo === null) missing.push('本社所在地');
  if (emp20 === null) missing.push(nearThreshold ? '従業員数(推定値のみ)' : '従業員数');
  else if (emp20 && !empCheck.confirmed) missing.push('従業員数(公式で未確認)');
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
  if (off && typeof off === 'object' && off.others.length) notes.push(`公式URL候補が複数: ${[off.url, ...off.others].join(' , ')}`);
  if (rejected.size && byField(c, 'employees').some((e) => rejected.has(e.source))) notes.push(`住所が一致しない情報源の従業員数は不採用(同名の別会社の可能性): ${[...rejected].join(', ')}`);
  if (emp) notes.push(...empCheck.remarks.map((x) => `従業員数: ${x}`));
  if (consolidated) {
    const single = byField(c, 'employees').find((e) => e.source === 'edinet');
    notes.push(`有価証券報告書の連結従業員数は${consolidated.value}名${single ? `（提出会社単体は${single.value}名${emp?.source === 'edinet' ? '。これを採用' : ''}）` : ''}`);
  }
  if (byField(c, 'earlyStop').length) notes.push('公式トップにどのカテゴリの語も無く、巡回を途中で見切った(求人一覧のみで見つかった会社。取りこぼしの疑いがあれば --no-early-stop で取り直す)');
  if (emp == null && members) notes.push(`Wantedlyメンバー数 ${members.value}人(参考・従業員数とは別物)`);

  return {
    name: c.name,
    officialUrl,
    listedBy,
    address: addr?.value ?? null,
    tokyo,
    employees: emp?.value ?? null,
    employeesSource: emp?.source ?? null,
    emp20,
    empConfirmed: empCheck.confirmed,
    employeesAsOf: empCheck.asOf,
    edinetCode: edinetCode?.value ?? null,
    securitiesCode: (edinetCode?.snippet ?? '').match(/証券コード(\d{4,5})/)?.[1] ?? null,
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
