import { addEvidence, addSource, setOfficialUrl } from '../lib/model.js';
import { clip, lines } from '../lib/util.js';
import { isTokyoAddress } from '../lib/extract.js';

export const id = 'buzztan';

/**
 * 一覧ページ(/list/)に、各社の「運営会社 / 所在地 / 公式URL」がまとまっている。
 *   ブランド名 | 紹介文 | 項目<TAB>内容 | 運営会社<TAB>… | 所在地<TAB>… | 公式URL<TAB>… | 電話番号<TAB>…
 */
export function parseList(snap) {
  const ls = lines(snap.text);
  const out = [];
  ls.forEach((l, i) => {
    const m = l.match(/^運営会社\t(.+)$/);
    if (!m) return;
    const rec = { company: m[1].trim(), address: null, url: null, description: '', brand: '' };
    const head = ls.lastIndexOf('項目\t内容', i);
    if (head >= 1 && i - head <= 2) {
      rec.description = ls[head - 1] ?? '';
      rec.brand = ls[head - 2] ?? '';
    }
    for (let j = i + 1; j < Math.min(i + 6, ls.length); j++) {
      const x = ls[j];
      if (/^運営会社\t/.test(x) || /評判・費用について/.test(x)) break;
      const a = x.match(/^所在地\t(.+)$/);
      if (a) rec.address = a[1].trim();
      const u = x.match(/^公式URL\t(.+)$/);
      if (u) rec.url = (u[1].match(/https?:\/\/[^\s、,]+/) ?? [])[0] ?? null;
    }
    out.push(rec);
  });
  return out;
}

export async function discover(q, ctx) {
  let list;
  try {
    list = parseList(await ctx.crawler.snapshot(q.url));
  } catch (e) {
    ctx.log(`  ! buzztan ${q.url}: ${e.message}`);
    return;
  }
  // 所在地が一覧で分かるので、東京都本社のみ採用（取得は1ページで済む）
  const tokyo = list.filter((r) => isTokyoAddress(r.address));
  ctx.log(`  buzztan ${q.url}: 全${list.length}社中 東京都本社 ${tokyo.length}社`);
  for (const r of tokyo.slice(0, q.limit)) {
    const c = ctx.upsert(r.company);
    addSource(c, id, q.url);
    c.seedCategories.push(q.category);
    const src = { source: id, url: q.url };
    addEvidence(c, 'address', r.address, { ...src, snippet: `バズ担 所在地: ${r.address}` });
    // バズ担の「SNS運用代行会社一覧」掲載 = SNS運用代行の提供根拠
    addEvidence(c, 'profileText', clip(`SNS運用代行 ${r.brand} ${r.description}`, 300), { ...src, snippet: 'バズ担「SNS運用代行会社一覧」掲載' });
    setOfficialUrl(c, r.url, { ...src, snippet: `バズ担 公式URL: ${r.url}` });
  }
}
