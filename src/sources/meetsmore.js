import { addEvidence, addSource, setOfficialUrl } from '../lib/model.js';
import { clip, lines } from '../lib/util.js';

export const id = 'meetsmore';
const BASE = 'https://meetsmore.com';

/** 比較ページ内のサービスページ(/products/<slug>)を出現順に（同一slugは1つに） */
export function parseList(snap) {
  const m = new Map();
  for (const a of snap.anchors) {
    const x = a.href.match(/^https:\/\/meetsmore\.com\/products\/([^/?#]+)\/?(?:[?#].*)?$/);
    if (x && !m.has(x[1])) m.set(x[1], { slug: x[1], name: lines(a.text)[0] ?? x[1] });
  }
  return [...m.values()];
}

/** サイト側の表記ゆれ(「株株式会社…」「（comnico inc.）」)を整える */
export function cleanCompany(name) {
  return name
    .replace(/^株(?=株式会社)/, '')
    .replace(/[（(][^）)]*[）)]\s*$/, '')
    .trim();
}

/** サービスページ: 「<サービス名> | <運営会社> | …」と「製品URL」 */
export function parseProduct(snap) {
  const ls = lines(snap.text);
  // 会社名の行は先頭か末尾が法人格。「運用代行サービス（株式会社４Ｘ）」のようなサービス名の行は除く
  const corp = ls.find((l) => /^株?(株式会社|有限会社|合同会社)/.test(l) || /(株式会社|有限会社|合同会社)$/.test(l)) ;
  const url = (snap.text.match(/製品URL\s*\n?\s*(https?:\/\/\S+)/) ?? [])[1] ?? null;
  return { company: corp ? cleanCompany(corp) : null, url };
}

export async function discover(q, ctx) {
  let list;
  try {
    list = parseList(await ctx.crawler.snapshot(q.url, { settleMs: 2000 })).slice(q.offset ?? 0, (q.offset ?? 0) + q.limit);
  } catch (e) {
    ctx.log(`  ! meetsmore ${q.url}: ${e.message}`);
    return;
  }
  ctx.log(`  meetsmore ${q.url}: ${list.length} サービス`);
  for (const p of list) {
    const url = `${BASE}/products/${p.slug}`;
    let info;
    try {
      info = parseProduct(await ctx.crawler.snapshot(url, { settleMs: 1500 }));
    } catch (e) {
      ctx.log(`  ! meetsmore ${p.slug}: ${e.message}`);
      continue;
    }
    if (!info.company) continue;
    const c = ctx.upsert(info.company);
    addSource(c, id, url);
    c.seedCategories.push(q.category);
    const src = { source: id, url };
    // ミツモアの「SNS運用代行サービス比較」掲載 = SNS運用代行の提供根拠
    const label = q.label ?? 'SNS運用代行';
    addEvidence(c, 'profileText', clip(`${label} ${p.name}`, 200), { ...src, snippet: `ミツモア「${label}」カテゴリに掲載: ${p.name}` });
    setOfficialUrl(c, info.url, { ...src, snippet: `ミツモア 製品URL: ${info.url}` });
  }
}
