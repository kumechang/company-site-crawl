import { addEvidence, addSource } from '../lib/model.js';
import { isTokyoAddress } from '../lib/extract.js';

export const id = 'jcia';

/** 会員名簿: `社名<TAB>郵便番号<TAB>住所<TAB>電話番号<TAB>URL` の行 */
export function parseList(snap) {
  return snap.text
    .split('\n')
    .filter((l) => l.includes('\t') && /(株式会社|有限会社|合同会社)/.test(l))
    .map((l) => {
      const [name, zip, address, tel, url] = l.split('\t').map((x) => x.trim());
      return { name, zip, address, tel, url: /^https?:/.test(url ?? '') ? url : null };
    });
}

export async function discover(q, ctx) {
  let list;
  try {
    list = parseList(await ctx.crawler.snapshot(q.url));
  } catch (e) {
    ctx.log(`  ! jcia ${q.url}: ${e.message}`);
    return;
  }
  const tokyo = list.filter((r) => isTokyoAddress(r.address));
  ctx.log(`  jcia ${q.url}: 全${list.length}社中 東京都 ${tokyo.length}社`);
  for (const r of tokyo.slice(q.offset ?? 0, (q.offset ?? 0) + q.limit)) {
    const c = ctx.upsert(r.name);
    addSource(c, id, q.url);
    c.seedCategories.push(q.category);
    const src = { source: id, url: q.url };
    addEvidence(c, 'address', r.address, { ...src, snippet: `日本化粧品工業会 会員名簿 住所: ${r.address}` });
    addEvidence(c, 'profileText', q.label ?? '化粧品', { ...src, snippet: '日本化粧品工業会 会員' });
  }
}
