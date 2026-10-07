import { addEvidence, addSource, setOfficialUrl } from '../lib/model.js';
import { clip, lines, domainOf } from '../lib/util.js';

export const id = 'boxil';
const BASE = 'https://boxil.jp';

/** 一覧: サービス名リンク(/service/ID/) と、その直後の行にある運営会社名 */
export function parseList(snap) {
  const ls = lines(snap.text);
  const seen = new Set();
  const out = [];
  for (const a of snap.anchors) {
    const m = a.href.match(/^https:\/\/boxil\.jp\/service\/(\d+)\//);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const title = lines(a.text)[0];
    const i = ls.findIndex((l) => l === title);
    const company = i >= 0 ? ls.slice(i + 1, i + 4).find((l) => /株式会社|有限会社|合同会社|Inc\.|Co\.|\bLtd/.test(l) && l.length < 50) : null;
    if (title && company) out.push({ sid: m[1], title, company, url: `${BASE}/service/${m[1]}/` });
  }
  return out;
}

/** 詳細: フッターの運営元(smartcamp)リンクより前に出る最初の外部リンクがサービス提供会社の公式サイト */
export function parseService(snap) {
  const ext = [];
  for (const a of snap.anchors) {
    if (/smartcamp\.co\.jp/.test(a.href)) break;
    const d = domainOf(a.href);
    if (d && !/boxil\.jp$/.test(d) && !/(x\.com|twitter|facebook|youtube|tayori\.com)/.test(d)) ext.push(a.href);
  }
  const body = (snap.text.match(/サービス概要\n([\s\S]{0,500})/) ?? [])[1] ?? '';
  return { officialUrl: ext[0] ?? null, summary: body.replace(/\n+/g, ' ') };
}

export async function discover(q, ctx) {
  const pages = q.pages ?? 2;
  let taken = 0;
  for (let p = q.startPage ?? 1; p < (q.startPage ?? 1) + pages && taken < q.limit; p++) {
    if (q.state) q.state.lastPage = p;
    const url = p === 1 ? q.url : `${q.url}?order=recommended&page=${p}`;
    let list;
    try {
      list = parseList(await ctx.crawler.snapshot(url, { settleMs: 1500 }));
    } catch (e) {
      ctx.log(`  ! boxil ${url}: ${e.message}`);
      break;
    }
    ctx.log(`  boxil ${url}: ${list.length} 社`);
    for (const s of list) {
      if (taken >= q.limit) break;
      let info;
      try {
        info = parseService(await ctx.crawler.snapshot(s.url));
      } catch (e) {
        ctx.log(`  ! boxil ${s.sid}: ${e.message}`);
        continue;
      }
      taken++;
      const c = ctx.upsert(s.company);
      addSource(c, id, s.url);
      c.seedCategories.push(q.category);
      const src = { source: id, url: s.url };
      // BOXIL の「SNS運用代行会社」カテゴリに掲載されている = SNS運用代行サービスを提供している、という根拠
      const label = q.label ?? 'SNS運用代行';
      addEvidence(c, 'profileText', clip(`${label} ${s.title} ${info.summary}`, 400), { ...src, snippet: `BOXIL「${label}」カテゴリに掲載: ${s.title}` });
      setOfficialUrl(c, info.officialUrl, { ...src, snippet: `BOXIL詳細ページの公式サイトリンク` });
    }
  }
}
