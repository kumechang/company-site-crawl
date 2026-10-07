import { addEvidence, addSource } from '../lib/model.js';
import { clip, lines } from '../lib/util.js';

export const id = 'aspic';

/** 一覧: サービスリンク(/asu/service/ID)を出現順に */
export function parseList(snap) {
  const m = new Map();
  for (const a of snap.anchors) {
    const x = a.href.match(/^(https:\/\/www\.aspicjapan\.org\/asu\/service\/(\d+))(?:[?#].*)?$/);
    if (x && !m.has(x[2])) m.set(x[2], x[1]);
  }
  return [...m.values()];
}

/** 詳細: 「会社概要」ブロックの `会社名<TAB>…` `所在地<TAB>…` */
export function parseService(snap) {
  const t = snap.text;
  const g = (label) => (t.match(new RegExp(`^${label}\\t(.+)$`, 'm')) ?? [])[1]?.trim() ?? null;
  const title = lines(t).find((l) => /SNS|運用/.test(l) && l.length < 60) ?? '';
  const summary = (t.match(/サービス概要\n([\s\S]{0,400})/) ?? [])[1] ?? '';
  return { company: g('会社名'), address: g('所在地'), representative: g('代表者名'), title, summary: summary.replace(/\n+/g, ' ') };
}

export async function discover(q, ctx) {
  let urls;
  try {
    urls = parseList(await ctx.crawler.snapshot(q.url)).slice(q.offset ?? 0, (q.offset ?? 0) + q.limit);
  } catch (e) {
    ctx.log(`  ! aspic ${q.url}: ${e.message}`);
    return;
  }
  ctx.log(`  aspic ${q.url}: ${urls.length} サービス`);
  for (const url of urls) {
    let info;
    try {
      info = parseService(await ctx.crawler.snapshot(url));
    } catch (e) {
      ctx.log(`  ! aspic ${url}: ${e.message}`);
      continue;
    }
    if (!info.company) continue;
    const c = ctx.upsert(info.company);
    addSource(c, id, url);
    c.seedCategories.push(q.category);
    const src = { source: id, url };
    addEvidence(c, 'address', info.address?.replace(/^〒\s*\d{3}-?\d{4}\s*/, ''), { ...src, snippet: `所在地: ${info.address}` });
    // アスピックの「SNS運用代行サービス」カテゴリ掲載 = SNS運用代行の提供根拠
    const label = q.label ?? 'SNS運用代行';
    addEvidence(c, 'profileText', clip(`${label} ${info.title} ${info.summary}`, 400), { ...src, snippet: `アスピック「${label}」カテゴリに掲載` });
  }
}
