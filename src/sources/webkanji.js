import { addEvidence, addSource, setOfficialUrl } from '../lib/model.js';
import { clip, lines, domainOf } from '../lib/util.js';

export const id = 'webkanji';
const BASE = 'https://web-kanji.com';
const SISTER = /(-kanji\.com|web-kanji\.com)$/;

/** 記事/一覧ページ内の会社ページリンク(/companies/slug) */
export function parseList(snap) {
  const m = new Map();
  for (const a of snap.anchors) {
    const x = a.href.match(/^https:\/\/web-kanji\.com\/companies\/([a-z0-9_-]+)\/?$/i);
    if (!x || ['industries', 'objects', 'features', 'areas', 'search'].includes(x[1]) || m.has(x[1])) continue;
    m.set(x[1], { slug: x[1], name: lines(a.text)[0] });
  }
  return [...m.values()];
}

/** 会社ページ: 社名(タイトル)・特徴・公式サイトリンク。所在地は複数拠点の列挙で本社とは限らないため使わない */
export function parseCompany(snap) {
  const ext = snap.anchors.map((a) => a.href).find((h) => {
    const d = domainOf(h);
    return d && !SISTER.test(d) && !/(x\.com|twitter|facebook|youtube|instagram|line\.me)/.test(d);
  });
  const t = lines(snap.text);
  const i = t.findIndex((l) => l === '特徴');
  const features = i >= 0 ? t.slice(i + 1, i + 12).join(' / ') : '';
  const name = (snap.title.match(/^(.+?)(?:の制作実績|の評判|｜|\|)/) ?? [])[1] ?? t.find((l) => /株式会社|有限会社|合同会社/.test(l) && l.length < 40);
  return { name, officialUrl: ext ?? null, features };
}

export async function discover(q, ctx) {
  let list;
  try {
    list = parseList(await ctx.crawler.snapshot(q.url)).slice(0, q.limit);
  } catch (e) {
    ctx.log(`  ! webkanji ${q.url}: ${e.message}`);
    return;
  }
  ctx.log(`  webkanji ${q.url}: ${list.length} 社`);
  for (const co of list) {
    const url = `${BASE}/companies/${co.slug}`;
    let info;
    try {
      info = parseCompany(await ctx.crawler.snapshot(url));
    } catch (e) {
      ctx.log(`  ! webkanji ${co.slug}: ${e.message}`);
      continue;
    }
    const name = (co.name && /株式会社|有限会社|合同会社|Inc/.test(co.name) ? co.name : info.name) || co.name;
    if (!name) continue;
    const c = ctx.upsert(name.replace(/の制作実績.*$/, ''));
    addSource(c, id, url);
    c.seedCategories.push(q.category);
    const src = { source: id, url };
    addEvidence(c, 'profileText', clip(`${q.label ?? ''} ${info.features}`, 300), { ...src, snippet: `Web幹事の特徴: ${clip(info.features, 80)}` });
    setOfficialUrl(c, info.officialUrl, { ...src, snippet: 'Web幹事の会社ページの公式サイトリンク' });
  }
}
