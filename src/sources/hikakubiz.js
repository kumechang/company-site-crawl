import { addEvidence, addSource, setOfficialUrl } from '../lib/model.js';
import { clip, lines, domainOf } from '../lib/util.js';

export const id = 'hikakubiz';
const PREF = /^(東京都|北海道|京都府|大阪府|[一-龥]{2,3}県)/;

/** 一覧のカード: `企業を選択する | 社名 | 特色 | … | 代表者 | 所在地 | 実績 | 対応業務 | … | 特徴 | …` */
export function parseList(snap) {
  const ls = lines(snap.text);
  const slugs = [...new Set(snap.anchors.map((a) => (a.href.match(/^https:\/\/www\.biz\.ne\.jp\/company\/([a-z0-9_-]+)\/?$/i) ?? [])[1]).filter((s) => s && s !== 'form'))];
  const out = [];
  ls.forEach((l, i) => {
    if (l !== '企業を選択する') return;
    const end = ls.findIndex((x, j) => j > i && x === '企業を選択する');
    const block = ls.slice(i + 1, end < 0 ? i + 25 : end);
    const name = block[0];
    const address = block.find((x) => PREF.test(x));
    const work = block[block.indexOf('対応業務') + 1];
    const k = block.indexOf('特徴');
    const features = k >= 0 ? block.slice(k + 1, k + 4).join(' / ') : '';
    out.push({ name, address, work, features, slug: slugs[out.length] });
  });
  return out.filter((c) => c.name && c.name.length < 50);
}

/** 会社ページ: Google マップ等を除いた最初の外部リンクが会社の公式サイト */
export function parseCompany(snap) {
  const ext = snap.anchors.map((a) => a.href).find((h) => {
    const d = domainOf(h);
    return d && /^https?:/.test(h) && !/(biz\.ne\.jp|google\.|x\.com|twitter|facebook|youtube|instagram|line\.me)/.test(d);
  });
  return { officialUrl: ext ?? null, title: snap.title };
}

export async function discover(q, ctx) {
  let list;
  try {
    list = parseList(await ctx.crawler.snapshot(q.url)).slice(q.offset ?? 0, (q.offset ?? 0) + q.limit);
  } catch (e) {
    ctx.log(`  ! hikakubiz ${q.url}: ${e.message}`);
    return;
  }
  ctx.log(`  hikakubiz ${q.url}: ${list.length} 社`);
  for (const co of list) {
    const c = ctx.upsert(co.name);
    const url = co.slug ? `https://www.biz.ne.jp/company/${co.slug}/` : q.url;
    addSource(c, id, url);
    c.seedCategories.push(q.category);
    const src = { source: id, url: q.url };
    addEvidence(c, 'address', co.address, { ...src, snippet: `所在地: ${co.address}` });
    addEvidence(c, 'profileText', clip(`${co.work ?? ''} ${co.features}`, 300), { ...src, snippet: `比較ビズ 対応業務: ${co.work}` });
    if (co.slug) {
      try {
        const info = parseCompany(await ctx.crawler.snapshot(url));
        // 一覧と企業ページの対応が取れていることをタイトルで確認してから公式URLを採用
        if (info.title.includes(co.name.replace(/\s/g, ''))) setOfficialUrl(c, info.officialUrl, { source: id, url, snippet: '比較ビズ会社ページの公式サイトリンク' });
      } catch (e) {
        ctx.log(`  ! hikakubiz ${co.slug}: ${e.message}`);
      }
    }
  }
}
