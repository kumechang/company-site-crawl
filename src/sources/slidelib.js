import { addEvidence, addSource, setOfficialUrl } from '../lib/model.js';
import { clip, lines } from '../lib/util.js';

export const id = 'slidelib';
const CORP = /(株式会社|有限会社|合同会社|Inc\.?|Co\.,?\s*Ltd)/;

/** 「（Instagram特化）」「（LINE特化）」などの注記を除く */
export const cleanCompany = (name) => name.replace(/[（(][^）)]*特化[）)]\s*$/, '').trim();

/**
 * 比較記事は「見出し(サービス名（会社名） or 会社名) → 説明 → 仕様 → サービスサイトへ」の繰り返し。
 * 見出しは「直後が『引用：…』の行」または「直後の行が見出しの名前で始まる説明文」。
 * 「サービスサイトへ」は本文の出現順と同名リンクの出現順が対応する。1社に複数あれば最初のものを採用。
 */
export function parseArticle(snap) {
  const ls = lines(snap.text);
  const links = snap.anchors.filter((a) => a.text === 'サービスサイトへ').map((a) => a.href);
  const out = [];
  let cur = null;
  let n = 0;
  ls.forEach((l, k) => {
    if (l === 'サービスサイトへ') {
      if (cur && !cur.url) cur.url = links[n];
      n++;
      return;
    }
    const next = ls[k + 1] ?? '';
    const base = l.split(/[（(]/)[0].trim();
    const isHeading = l.length <= 80 && !/^引用：/.test(l) && (/^引用：/.test(next) || (base.length >= 2 && next.startsWith(base) && /^[はがの、]/.test(next.slice(base.length))));
    if (!isHeading) return;
    const inner = (l.match(/[（(]([^）)]+)[）)]/) ?? [])[1];
    cur = { heading: l, company: cleanCompany(inner && CORP.test(inner) ? inner : l), url: null };
    out.push(cur);
  });
  return out.filter((e) => e.url);
}

export async function discover(q, ctx) {
  let list;
  try {
    list = parseArticle(await ctx.crawler.snapshot(q.url, { settleMs: 1500 })).slice(q.offset ?? 0, (q.offset ?? 0) + q.limit);
  } catch (e) {
    ctx.log(`  ! slidelib ${q.url}: ${e.message}`);
    return;
  }
  ctx.log(`  slidelib ${q.url}: ${list.length} 社`);
  for (const e of list) {
    const c = ctx.upsert(e.company);
    addSource(c, id, q.url);
    c.seedCategories.push(q.category);
    const src = { source: id, url: q.url };
    // slide lib の「SNS運用代行会社おすすめ◯選」掲載 = SNS運用代行の提供根拠
    addEvidence(c, 'profileText', clip(`SNS運用代行 ${e.heading}`, 200), { ...src, snippet: `slide lib「SNS運用代行会社おすすめ選」掲載: ${e.heading}` });
    setOfficialUrl(c, e.url, { ...src, snippet: `slide lib「サービスサイトへ」: ${e.url}` });
  }
}
