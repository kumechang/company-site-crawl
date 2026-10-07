import { parseLabeled } from '../lib/extract.js';
import { addEvidence, addSource, setOfficialUrl } from '../lib/model.js';
import { clip } from '../lib/util.js';

export const id = 'imitsu';

/** 一覧内の会社リンク。各社は「主カテゴリ」のURL(ct-xxx)で出てくるため、カテゴリでは絞らない */
export function parseList(snap) {
  const m = new Map();
  for (const a of snap.anchors) {
    const x = a.href.split('#')[0].match(/^(https:\/\/imitsu\.jp\/[^/]+\/pr-tokyo\/[^/]+\/supplier\/(\d+))$/);
    if (x && !m.has(x[2])) m.set(x[2], x[1]);
  }
  return [...m.entries()].map(([sid, url]) => ({ sid, url }));
}

export function parseSupplier(snap) {
  const info = parseLabeled(snap.text, ['会社名', '設立年', '住所', '会社URL', '会社概要', '従業員数', '資本金'], { start: /の会社情報$/, stop: /が紹介されている記事$/ });
  const g = (k) => (info[k] ?? []).join(' ');
  const service = (snap.text.match(/サービス紹介\n([\s\S]{0,500}?)\n条件を変更/) ?? [])[1] ?? '';
  return { name: g('会社名'), address: g('住所'), url: g('会社URL'), founded: g('設立年'), overview: g('会社概要'), employeesRaw: g('従業員数'), service: service.replace(/\n/g, ' ') };
}

export async function discover(q, ctx) {
  const list = await ctx.crawler.snapshot(q.url);
  const sups = parseList(list).slice(q.offset ?? 0, (q.offset ?? 0) + q.limit);
  ctx.log(`  imitsu ${q.url}: ${sups.length} 社`);
  for (const s of sups) {
    let info;
    try {
      info = parseSupplier(await ctx.crawler.snapshot(s.url));
    } catch (e) {
      ctx.log(`  ! imitsu ${s.sid}: ${e.message}`);
      continue;
    }
    if (!info.name) continue;
    const c = ctx.upsert(info.name.replace(/_\d{4,}$/, '')); // アイミツは社名末尾に識別子(_123456)が付く場合がある
    addSource(c, id, s.url);
    c.seedCategories.push(q.category);
    const src = { source: id, url: s.url };
    addEvidence(c, 'address', info.address, { ...src, snippet: `住所: ${info.address}` });
    addEvidence(c, 'profileText', clip(`${info.service} ${info.overview}`, 400), { ...src, snippet: 'サービス紹介/会社概要' });
    addEvidence(c, 'founded', info.founded, src);
    setOfficialUrl(c, info.url, { ...src, snippet: `会社URL: ${info.url}` });
  }
}
