import { addEvidence, addSource, setOfficialUrl } from '../lib/model.js';
import { normalizeName, nfkc } from '../lib/util.js';

export const id = 'renew';
const BASE = 'https://renew-career.com';

const PREF_RE = /^(東京都|北海道|京都府|大阪府|[一-龥]{2,3}県)/;
const prefOf = (a) => (nfkc(a ?? '').replace(/^[\s　]*(?:〒\s*)?\d{3}[-ー−]?\d{4}[\s　]*/, '').match(PREF_RE) ?? [])[1] ?? null;

/**
 * 検索結果(GET /search?keyword=)の求人カードから、掲載している会社を取り出す（求人1件=1カード、同じ会社が複数出る）。
 * アンカー本文: `[NEW|募集終了]\n<都道府県>\n<職種>\n<求人タイトル>\n\n<会社名>\ncurrency_yen…`。会社名は「currency_yen」の直前の行。
 * キーワードに関連する別会社の求人も並ぶので、会社名で絞る。ページ送り(?page=)は robots.txt で禁止のため使わない。
 */
export function parseResults(snap) {
  const out = new Map();
  for (const a of snap.anchors ?? []) {
    const m = a.href.match(/^https:\/\/renew-career\.com\/companies\/(\d+)\/joboffers\/\d+/);
    if (!m || out.has(m[1])) continue;
    const ls = a.text.split('\n').map((x) => x.trim()).filter(Boolean);
    const i = ls.indexOf('currency_yen');
    if (i < 1) continue; // 「求人を見る」だけのリンクなどは会社名を持たない
    const head = ls.find((l) => PREF_RE.test(l) && l.length <= 5);
    out.set(m[1], { name: ls[i - 1], pref: head ? prefOf(head) : null, url: `${BASE}/companies/${m[1]}` });
  }
  return [...out.values()];
}

/** 会社名が(正規化して)一致するカードを1件。既知の住所があれば都道府県が合うものだけ。無ければ東京都を優先 */
export function pickEntry(rows, name, knownAddresses = []) {
  const key = normalizeName(name);
  const exact = rows.filter((r) => normalizeName(r.name) === key);
  if (!exact.length) return null;
  const known = knownAddresses.map(prefOf).filter(Boolean);
  if (known.length) return exact.find((r) => r.pref && known.includes(r.pref)) ?? null;
  return exact.find((r) => r.pref === '東京都') ?? exact[0];
}

const LABELS = ['会社名', '業界', '代表者名', '資本金', '従業員数', '本社', '企業URL'];

/** 会社ページの「会社概要」: `ラベル\n値` の並び。値が空の項目(資本金など)はラベルが続くので、次のラベルは値として読まない */
export function parseDetail(text) {
  const ls = (text ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
  const start = ls.indexOf('会社概要');
  const body = start >= 0 ? ls.slice(start + 1) : ls;
  const get = (label) => {
    const i = body.indexOf(label);
    if (i < 0) return null;
    const v = body[i + 1];
    return v && !LABELS.includes(v) ? v : null;
  };
  const empLine = get('従業員数');
  const emp = empLine && nfkc(empLine).match(/^([\d,]+)\s*(?:名|人)/);
  const url = get('企業URL');
  return {
    name: get('会社名'),
    address: get('本社'),
    employees: emp ? parseInt(emp[1].replace(/,/g, ''), 10) : null,
    employeesNote: empLine,
    officialUrl: url && /^https?:\/\//.test(url) ? url : null,
  };
}

/** 戻り値: true=補完した / false=検索したが一致なし / null=エラー */
export async function lookup(c, { crawler, log }) {
  const name = c.name.replace(/[（(].*[）)]/g, '').trim();
  let rows;
  try {
    rows = parseResults(await crawler.snapshot(`${BASE}/search?keyword=${encodeURIComponent(name)}`, { settleMs: 2000 }));
  } catch (e) {
    log(`  ! renew ${c.name}: ${e.message.split('\n')[0]}`);
    return null;
  }
  const known = c.evidence.filter((e) => e.field === 'address' && e.source !== id).map((e) => e.value);
  const hit = pickEntry(rows, name, known);
  if (!hit) return false;
  let snap;
  try {
    snap = await crawler.snapshot(hit.url, { settleMs: 1500 });
  } catch (e) {
    if (/HTTP 404/.test(e.message)) return false;
    log(`  ! renew ${c.name}: ${e.message.split('\n')[0]}`);
    return null;
  }
  const d = parseDetail(snap.text);
  addSource(c, id, hit.url);
  const src = { source: id, url: hit.url };
  addEvidence(c, 'address', d.address, { ...src, snippet: `Renew(インターン求人) 本社: ${d.address}` });
  addEvidence(c, 'employees', d.employees, { ...src, snippet: `Renew(インターン求人) 従業員数: ${d.employeesNote}` });
  setOfficialUrl(c, d.officialUrl, { ...src, snippet: `Renew 企業URL: ${d.officialUrl}` });
  return true;
}
