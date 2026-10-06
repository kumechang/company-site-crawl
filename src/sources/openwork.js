import { addEvidence, addSource, setOfficialUrl } from '../lib/model.js';
import { normalizeName, nfkc } from '../lib/util.js';

export const id = 'openwork';
const BASE = 'https://www.openwork.jp';

const PREF_RE = /^(東京都|北海道|京都府|大阪府|[一-龥]{2,3}県)/;
const prefOf = (a) => (nfkc(a ?? '').replace(/^[\s　]*(?:〒\s*)?\d{3}[-ー−]?\d{4}[\s　]*/, '').match(PREF_RE) ?? [])[1] ?? null;

/** 検索結果(GET /company_list?src_str=): 会社ページ company.php?m_id=… へのリンク（アンカー本文が会社名） */
export function parseList(snap) {
  const out = new Map();
  for (const a of snap.anchors ?? []) {
    const m = a.href.match(/^https:\/\/www\.openwork\.jp\/company\.php\?m_id=([\w]+)/);
    const name = a.text.split('\n').map((x) => x.trim()).filter(Boolean)[0];
    if (!m || !name || out.has(m[1])) continue;
    out.set(m[1], { name, url: `${BASE}/company.php?m_id=${m[1]}` });
  }
  return [...out.values()];
}

/** 社員数のレンジ表記 → 下限。例: 100〜499人 / 1000人以上 / 1〜10人 */
export function parseRange(s) {
  const t = nfkc(s ?? '').replace(/,/g, '');
  const r = t.match(/^(\d+)\s*[〜~～-]\s*(\d+)\s*人/);
  if (r) return { min: Number(r[1]), max: Number(r[2]) };
  const u = t.match(/^(\d+)\s*人以上/);
  if (u) return { min: Number(u[1]), max: null };
  return null;
}

/** 会社ページの「企業情報」: `業界` `URL` `所在地` `社員数` それぞれ次の行が値 */
export function parseCompany(text) {
  const ls = (text ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
  const i0 = ls.indexOf('企業情報');
  const part = i0 >= 0 ? ls.slice(i0, i0 + 14) : ls;
  const after = (label) => {
    const i = part.indexOf(label);
    return i >= 0 ? part[i + 1] ?? null : null;
  };
  const url = after('URL');
  return {
    industry: after('業界'),
    url: url && /^https?:\/\//.test(url) ? url : null,
    address: after('所在地'),
    range: after('社員数'),
  };
}

/** 会社名が一致する候補のうち、既知の住所と都道府県が合うもの（無ければ東京都）を選ぶ */
export function pickCompany(cands, known) {
  const kp = known.map(prefOf).filter(Boolean);
  const ok = (x) => (kp.length ? kp.includes(prefOf(x.info.address)) : true);
  const hits = cands.filter(ok);
  return (kp.length ? hits[0] : hits.find((x) => prefOf(x.info.address) === '東京都') ?? hits[0]) ?? null;
}

/** 戻り値: true=補完した / false=検索したが一致なし / null=エラー */
export async function lookup(c, { crawler, log }) {
  const name = c.name.replace(/[（(].*[）)]/g, '').trim();
  const q = name.replace(/株式会社|有限会社|合同会社/g, '').trim();
  let list;
  try {
    list = parseList(await crawler.snapshot(`${BASE}/company_list?src_str=${encodeURIComponent(q)}`, { settleMs: 1000 }));
  } catch (e) {
    if (/HTTP 404/.test(e.message)) return false; // 該当なしのとき 404 を返す
    log(`  ! openwork ${c.name}: ${e.message.split('\n')[0]}`);
    return null;
  }
  const key = normalizeName(name);
  const exact = list.filter((x) => normalizeName(x.name) === key).slice(0, 3);
  if (!exact.length) return false;
  const known = c.evidence.filter((e) => e.field === 'address' && e.source !== id).map((e) => e.value);
  const cands = [];
  try {
    for (const x of exact) cands.push({ ...x, info: parseCompany((await crawler.snapshot(x.url, { settleMs: 800 })).text) });
  } catch (e) {
    log(`  ! openwork ${c.name}: ${e.message.split('\n')[0]}`);
    return null;
  }
  const hit = pickCompany(cands, known);
  if (!hit) return false;
  addSource(c, id, hit.url);
  const src = { source: id, url: hit.url };
  const r = parseRange(hit.info.range);
  addEvidence(c, 'address', hit.info.address, { ...src, snippet: `OpenWork 所在地: ${hit.info.address}` });
  // レンジの下限が20以上ならその下限、上限が20未満なら上限を採用。20をまたぐレンジ(例 1〜50人)は判定できないので使わない
  const emp = r && (r.min >= 20 ? r.min : r.max != null && r.max < 20 ? r.max : null);
  if (emp != null) addEvidence(c, 'employees', emp, { ...src, snippet: `OpenWork 社員数: ${hit.info.range}（レンジ${r.min >= 20 ? '下限' : '上限'}を採用）` });
  setOfficialUrl(c, hit.info.url, { ...src, snippet: `OpenWork URL: ${hit.info.url}` });
  return true;
}
