import { parseLabeled } from '../lib/extract.js';
import { addEvidence, addSource, setOfficialUrl } from '../lib/model.js';
import { clip, normalizeName } from '../lib/util.js';

export const id = 'prtimes';
const BASE = 'https://prtimes.jp';

/** 検索結果から、会社名が完全一致する企業ページだけを選ぶ（あいまい一致は誤紐付けの元なので採用しない） */
export function pickCompany(snap, name) {
  const key = normalizeName(name);
  for (const a of snap.anchors) {
    const m = a.href.match(/\/main\/html\/searchrlp\/company_id\/(\d+)/);
    if (m && normalizeName(a.text.split('\n')[0]) === key) return `${BASE}/main/html/searchrlp/company_id/${m[1]}`;
  }
  return null;
}

export function parseCompany(snap) {
  const info = parseLabeled(snap.text, ['業種', '本社所在地', '電話番号', '代表者名', '上場', '資本金', '設立', 'URL'], { start: /^基本情報$/, stop: /^詳細情報$/ });
  const g = (k) => (info[k] ?? []).join(' ');
  return { address: g('本社所在地') || null, url: (info['URL'] ?? []).find((l) => /^https?:\/\//.test(l)) ?? null, industry: g('業種') };
}

/** 公式URLが無い会社を会社名で引く。PR TIMES に企業ページがある会社のみ解決できる */
export async function resolve(c, { crawler, log }) {
  const search = `${BASE}/main/action.php?run=html&page=searchkey&search_word=${encodeURIComponent(c.name)}`;
  let url;
  try {
    url = pickCompany(await crawler.snapshot(search, { settleMs: 1500 }), c.name);
    if (!url) return false;
    const info = parseCompany(await crawler.snapshot(url));
    addSource(c, id, url);
    const src = { source: id, url };
    addEvidence(c, 'address', info.address, { ...src, snippet: `本社所在地: ${info.address}` });
    setOfficialUrl(c, info.url, { ...src, snippet: `PR TIMES企業情報のURL: ${info.url}` });
    return Boolean(info.url);
  } catch (e) {
    log(`  ! prtimes ${c.name}: ${e.message}`);
    return /HTTP 404/.test(e.message) ? false : null; // 404=検索結果なし(再検索しない) / 通信エラー等=null(再試行できる)
  }
}

/** 検索結果ページ内の企業ページリンク(出現順・重複除去) */
export function parseSearchCompanies(snap) {
  const m = new Map();
  for (const a of snap.anchors) {
    const x = a.href.match(/\/main\/html\/searchrlp\/company_id\/(\d+)/);
    const name = (a.text ?? '').split('\n')[0].trim();
    if (x && name && !m.has(x[1])) m.set(x[1], { id: x[1], name });
  }
  return [...m.values()];
}

/** キーワード検索で会社を発見し、企業ページの 本社所在地・公式URL を取る */
export async function discover(q, ctx) {
  const search = `${BASE}/main/action.php?run=html&page=searchkey&search_word=${encodeURIComponent(q.keyword)}`;
  let list;
  try {
    list = parseSearchCompanies(await ctx.crawler.snapshot(search, { settleMs: 1500 })).slice(q.offset ?? 0, (q.offset ?? 0) + q.limit);
  } catch (e) {
    ctx.log(`  ! prtimes "${q.keyword}": ${e.message}`);
    return;
  }
  ctx.log(`  prtimes "${q.keyword}": ${list.length} 社`);
  for (const co of list) {
    const url = `${BASE}/main/html/searchrlp/company_id/${co.id}`;
    let info;
    try {
      info = parseCompany(await ctx.crawler.snapshot(url));
    } catch (e) {
      ctx.log(`  ! prtimes ${co.id}: ${e.message}`);
      continue;
    }
    const c = ctx.upsert(co.name);
    addSource(c, id, url);
    c.seedCategories.push(q.category);
    const src = { source: id, url };
    addEvidence(c, 'address', info.address, { ...src, snippet: `本社所在地: ${info.address}` });
    addEvidence(c, 'profileText', clip(`${q.label ?? ''} ${info.industry ?? ''}`, 120), { ...src, snippet: `PR TIMES「${q.keyword}」の検索に登場` });
    setOfficialUrl(c, info.url, { ...src, snippet: `PR TIMES企業情報のURL: ${info.url}` });
  }
}
