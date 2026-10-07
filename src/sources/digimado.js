import { parseLabeled } from '../lib/extract.js';
import { addEvidence, addSource, setOfficialUrl } from '../lib/model.js';
import { clip, domainOf } from '../lib/util.js';

export const id = 'digimado';

/** 記事・カテゴリページ内の製品ページリンク(/products/<uuid>/) */
export function parseList(snap) {
  const m = new Set();
  for (const a of snap.anchors) {
    const x = a.href.match(/^(https:\/\/digi-mado\.jp\/products\/[0-9a-f-]{20,}\/)/);
    if (x) m.add(x[1]);
  }
  return [...m];
}

/** 製品ページ: 「運営企業情報」の 商号 / 本社 / URL */
export function parseProduct(snap) {
  const info = parseLabeled(snap.text, ['商号', '本社', '創立', '代表者名', '資本金', 'URL'], { start: /^運営企業情報$/, stop: /^この記事を共有する/ });
  const g = (k) => (info[k] ?? []).join(' ');
  const url = snap.anchors.map((a) => a.href).find((h) => {
    const d = domainOf(h);
    return d && !/(digi-mado|creativebank|x\.com|twitter|facebook|youtube)/.test(d);
  });
  const title = ((snap.title.match(/^(.+?)の特徴/) ?? [])[1] ?? '').trim();
  return { company: g('商号') || null, address: g('本社') || null, officialUrl: url ?? null, product: title };
}

export async function discover(q, ctx) {
  let urls;
  try {
    urls = parseList(await ctx.crawler.snapshot(q.url)).slice(q.offset ?? 0, (q.offset ?? 0) + q.limit);
  } catch (e) {
    ctx.log(`  ! digimado ${q.url}: ${e.message}`);
    return;
  }
  ctx.log(`  digimado ${q.url}: ${urls.length} 製品`);
  for (const url of urls) {
    let info;
    try {
      info = parseProduct(await ctx.crawler.snapshot(url));
    } catch (e) {
      ctx.log(`  ! digimado ${url}: ${e.message}`);
      continue;
    }
    if (!info.company) continue;
    const c = ctx.upsert(info.company);
    addSource(c, id, url);
    c.seedCategories.push(q.category);
    const src = { source: id, url };
    addEvidence(c, 'address', info.address, { ...src, snippet: `本社: ${info.address}` });
    // 製品名のみ。記事/カテゴリの文脈(SNS運用代行・SNS分析ツール)はカテゴリ確認の根拠にしない（公式サイト等で確認する）
    addEvidence(c, 'jobText', clip(`${q.label ?? ''} ${info.product}`, 200), { ...src, snippet: `デジタル化の窓口 掲載製品: ${info.product}` });
    setOfficialUrl(c, info.officialUrl, { ...src, snippet: 'デジタル化の窓口 製品ページの情報取得元リンク' });
  }
}
