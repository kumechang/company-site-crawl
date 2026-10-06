import { extractEmployees, extractAddress, findContactLinks, findProfileLinks } from './lib/extract.js';
import { addEvidence, addSource } from './lib/model.js';
import { clip, flatten } from './lib/util.js';
import { RobotsDisallowed } from './lib/crawler.js';

/**
 * 公式サイトを巡回して、他媒体で足りなかった項目（従業員数・住所・問い合わせURL）を補完する。
 * トップ → 会社概要ページ(最大2) の順に見る。
 */
export async function enrichFromOfficial(c, { crawler, log }) {
  if (!c.officialUrl) return;
  const src = 'official';
  let top;
  try {
    top = await crawler.snapshot(c.officialUrl);
  } catch (e) {
    log(`  ! official ${c.officialUrl}: ${e instanceof RobotsDisallowed ? 'robots.txt禁止' : e.message}`);
    addEvidence(c, 'officialError', e.message.slice(0, 80), { source: src, url: c.officialUrl });
    return;
  }
  addSource(c, src, c.officialUrl);
  addEvidence(c, 'profileText', clip(`${top.title} ${flatten(top.text)}`, 500), { source: src, url: c.officialUrl, snippet: 'トップページ' });

  const pages = [{ url: c.officialUrl, snap: top }];
  for (const p of findProfileLinks(top.anchors, c.officialUrl).slice(0, 2)) {
    try {
      pages.push({ url: p.url, snap: await crawler.snapshot(p.url) });
    } catch (e) {
      log(`  ! profile ${p.url}: ${e.message}`);
    }
  }

  for (const { url, snap } of pages) {
    const emp = extractEmployees(snap.text);
    if (emp) addEvidence(c, 'employees', emp.value, { source: src, url, snippet: emp.raw });
    const addr = extractAddress(snap.text);
    if (addr?.labeled) addEvidence(c, 'address', addr.address, { source: src, url, snippet: addr.address });
    else if (addr) addEvidence(c, 'address', addr.address, { source: src, url, snippet: addr.address });
    if (snap.text) addEvidence(c, 'profileText', clip(flatten(snap.text), 500), { source: src, url, snippet: '会社概要ページ' });
  }

  // 問い合わせURL: 全ページのリンクから最良のものを採用
  const all = pages.flatMap(({ url, snap }) => findContactLinks(snap.anchors, url).map((l) => ({ ...l, from: url })));
  all.sort((a, b) => b.score - a.score);
  if (all[0]) addEvidence(c, 'contactUrl', all[0].url, { source: src, url: all[0].from, snippet: `リンク文言「${all[0].text}」` });
}
