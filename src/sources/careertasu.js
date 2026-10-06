import { addEvidence, addSource } from '../lib/model.js';
import { normalizeName, nfkc } from '../lib/util.js';

export const id = 'careertasu';
const BASE = 'https://job.career-tasu.jp';

const PREF_RE = /^(東京都|北海道|京都府|大阪府|[一-龥]{2,3}県)/;
const prefOf = (a) => (nfkc(a ?? '').replace(/^[\s　]*(?:〒\s*)?\d{3}[-ー−]?\d{4}[\s　]*/, '').match(PREF_RE) ?? [])[1] ?? null;

/**
 * 検索結果(GET /condition-search/result/?keyword=)の企業カード。
 * アンカー本文: `<都道府県><業種>\n\n<会社名>\n<評価>\n<n>フォロワー…`。本文検索にも当たるため無関係な会社も混ざる → 会社名で絞る
 */
export function parseResults(snap) {
  const out = new Map();
  for (const a of snap.anchors ?? []) {
    const m = a.href.match(/^https:\/\/job\.career-tasu\.jp\/corp\/(\d+)\/default\//);
    if (!m || out.has(m[1])) continue;
    const ls = a.text.split('\n').map((x) => x.trim()).filter(Boolean);
    if (ls.length < 2) continue;
    out.set(m[1], { name: ls[1], pref: prefOf(ls[0]), url: `${BASE}/corp/${m[1]}/detail-uc/` });
  }
  return [...out.values()];
}

/** 会社名が(正規化して)一致するカードを1件。既知の住所があれば都道府県が合うものだけ、無ければ東京都を優先 */
export function pickEntry(rows, name, knownAddresses = []) {
  const key = normalizeName(name);
  const exact = rows.filter((r) => normalizeName(r.name) === key);
  if (!exact.length) return null;
  const known = knownAddresses.map(prefOf).filter(Boolean);
  if (known.length) return exact.find((r) => r.pref && known.includes(r.pref)) ?? null;
  return exact.find((r) => r.pref === '東京都') ?? exact[0];
}

/** 会社データページ: `ラベル\n値` の並び（本社所在地1 / 従業員数 / 創業/設立 / 資本金） */
export function parseDetail(text) {
  const ls = (text ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
  const after = (re) => {
    const i = ls.findIndex((l) => re.test(l));
    return i >= 0 ? ls[i + 1] ?? null : null;
  };
  const empLine = after(/^従業員数$/);
  const emp = empLine && nfkc(empLine).match(/^([\d,]+)\s*(?:名|人)/);
  return {
    address: after(/^本社所在地\d?$/),
    employees: emp ? parseInt(emp[1].replace(/,/g, ''), 10) : null,
    employeesNote: empLine,
    founded: after(/^(?:創業\/設立|設立)$/),
  };
}

/** 戻り値: true=補完した / false=検索したが一致なし / null=エラー */
export async function lookup(c, { crawler, log }) {
  const name = c.name.replace(/[（(].*[）)]/g, '').trim();
  let rows;
  try {
    rows = parseResults(await crawler.snapshot(`${BASE}/condition-search/result/?keyword=${encodeURIComponent(name)}`, { settleMs: 1500 }));
  } catch (e) {
    log(`  ! careertasu ${c.name}: ${e.message.split('\n')[0]}`);
    return null;
  }
  const known = c.evidence.filter((e) => e.field === 'address' && e.source !== id).map((e) => e.value);
  const hit = pickEntry(rows, name, known);
  if (!hit) return false;
  let snap;
  try {
    snap = await crawler.snapshot(hit.url);
  } catch (e) {
    if (/HTTP 404/.test(e.message)) return false; // 検索には出るが会社データページが無い会社
    log(`  ! careertasu ${c.name}: ${e.message.split('\n')[0]}`);
    return null;
  }
  const d = parseDetail(snap.text);
  addSource(c, id, hit.url);
  const src = { source: id, url: hit.url };
  addEvidence(c, 'address', d.address, { ...src, snippet: `キャリタス就活 本社所在地: ${d.address}` });
  addEvidence(c, 'employees', d.employees, { ...src, snippet: `キャリタス就活 従業員数: ${d.employeesNote}` });
  addEvidence(c, 'founded', d.founded, src);
  return true;
}
