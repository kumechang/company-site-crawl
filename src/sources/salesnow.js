import { addEvidence, addSource, setOfficialUrl } from '../lib/model.js';
import { normalizeName, nfkc, flatten, clip } from '../lib/util.js';

export const id = 'salesnow';
const BASE = 'https://salesnow.jp';

/** 一覧ページから企業名とリンクを取る（名前→企業ページの索引用） */
export function parseList(snap) {
  const m = new Map();
  for (const a of snap.anchors) {
    if (!/\/db\/companies\/[a-z0-9]+$/.test(a.href)) continue;
    const name = a.text.split('\n')[0].trim();
    if (name && !m.has(a.href)) m.set(a.href, { name, href: a.href });
  }
  return [...m.values()];
}

export function totalPages(snap, perPage = 50) {
  const m = nfkc(snap.text).match(/検索結果約?([\d,]+)件中/);
  return m ? Math.ceil(parseInt(m[1].replace(/,/g, ''), 10) / perPage) : 1;
}

/** 企業ページ: ホームページ / 所在地 / 登記住所 / 正社員規模(推定) など */
export function parseCompany(snap) {
  const t = nfkc(flatten(snap.text));
  const g = (re) => (t.match(re) ?? [])[1]?.trim() ?? null;
  const home = g(/ホームページ \| (https?:\/\/[^\s|]+)/);
  const emp = g(/正社員規模\(推定\) \| ([\d,]+)名/);
  return {
    homepage: home,
    address: g(/住所（登記所在地） \| ([^|]+)/) ?? g(/住所\(登記所在地\) \| ([^|]+)/),
    employees: emp ? parseInt(emp.replace(/,/g, ''), 10) : null,
    founded: g(/業歴 \(設立年月\) \| [^|(]*\((\d{4}年\d{1,2}月)設立\)/),
    summary: clip(g(/Powered by AI \| ([^|]+)/) ?? '', 300),
  };
}

/**
 * 業種ごとの全社一覧を「会社名→企業ページ」索引にする（SalesNow DB には会社名検索が無いため）。
 * 一覧は規模の大きい順。キャッシュされるので2回目以降はアクセスしない。
 */
export async function buildIndex(urls, { crawler, log, maxPages = 30 }) {
  const index = new Map();
  for (const u of urls) {
    let n = 1;
    for (let p = 1; p <= Math.min(n, maxPages); p++) {
      const url = p === 1 ? u : `${u}/page/${p}`;
      let snap;
      try {
        snap = await crawler.snapshot(url);
      } catch (e) {
        log(`  ! salesnow ${url}: ${e.message}`);
        break;
      }
      if (p === 1) n = totalPages(snap);
      for (const c of parseList(snap)) index.set(normalizeName(c.name), c);
    }
    log(`  salesnow 索引: ${u.replace(BASE + '/db/industries/', '')} まで ${index.size}社`);
  }
  return index;
}

/** 索引に会社名が完全一致したら企業ページを見て 公式URL・登記住所・従業員数(推定) を補完 */
export async function enrichFromIndex(c, index, { crawler, log }) {
  const hit = index.get(c.key);
  if (!hit) return false;
  let info;
  try {
    info = parseCompany(await crawler.snapshot(hit.href));
  } catch (e) {
    log(`  ! salesnow ${hit.href}: ${e.message}`);
    return false;
  }
  addSource(c, id, hit.href);
  const src = { source: id, url: hit.href };
  addEvidence(c, 'address', info.address, { ...src, snippet: `登記所在地: ${info.address}` });
  addEvidence(c, 'employees', info.employees, { ...src, snippet: `正社員規模(推定): ${info.employees}名（SalesNowの推定値）` });
  addEvidence(c, 'profileText', info.summary, { ...src, snippet: 'SalesNow概要' });
  addEvidence(c, 'founded', info.founded, src);
  setOfficialUrl(c, info.homepage, { ...src, snippet: `ホームページ: ${info.homepage}` });
  return true;
}

/**
 * 業種別・地域別の一覧から会社を発見する（一覧は規模の大きい順）。
 * 一覧に載った会社の企業ページで 公式URL・登記住所・従業員数(推定) を取る。
 */
export async function discover(q, ctx) {
  const pages = q.pages ?? 2;
  let taken = 0;
  for (let p = 1; p <= pages && taken < q.limit; p++) {
    const url = p === 1 ? q.url : `${q.url}/page/${p}`;
    let list;
    try {
      list = parseList(await ctx.crawler.snapshot(url));
    } catch (e) {
      ctx.log(`  ! salesnow ${url}: ${e.message}`);
      break;
    }
    ctx.log(`  salesnow ${url}: ${list.length} 社`);
    for (const co of list) {
      if (taken >= q.limit) break;
      let info;
      try {
        info = parseCompany(await ctx.crawler.snapshot(co.href));
      } catch (e) {
        ctx.log(`  ! salesnow ${co.href}: ${e.message}`);
        continue;
      }
      taken++;
      const c = ctx.upsert(co.name);
      addSource(c, id, co.href);
      c.seedCategories.push(q.category);
      const src = { source: id, url: co.href };
      addEvidence(c, 'address', info.address, { ...src, snippet: `登記所在地: ${info.address}` });
      addEvidence(c, 'employees', info.employees, { ...src, snippet: `正社員規模(推定): ${info.employees}名（SalesNowの推定値）` });
      addEvidence(c, 'profileText', clip(`${q.label ?? ''} ${info.summary}`, 300), { ...src, snippet: `SalesNow「${q.label ?? ''}」一覧に掲載` });
      setOfficialUrl(c, info.homepage, { ...src, snippet: `ホームページ: ${info.homepage}` });
    }
  }
}
