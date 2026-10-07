import { addEvidence, addSource } from '../lib/model.js';
import { clip, lines, nfkc } from '../lib/util.js';

export const id = 'agencyhub';

/**
 * 一覧: `社名 | 紹介文 | タグ… | 所在地(市) | 従業員規模(31-100名) | 詳細を見る`
 * 所在地は「対応エリア」の可能性があり本社とは限らないため、住所としては使わない。
 */
export function parseList(snap) {
  const ls = lines(snap.text);
  const out = [];
  let start = ls.findIndex((l) => l === '詳細') + 1;
  ls.forEach((l, k) => {
    if (l !== '詳細を見る') return;
    const block = ls.slice(start, k);
    start = k + 1;
    if (block.length < 4) return;
    const range = block[block.length - 1];
    const m = nfkc(range).match(/^(\d+)\s*[-〜~]\s*(\d+)名$|^(\d+)名以上$/);
    out.push({
      name: block[0],
      description: block[1],
      tags: block.slice(2, -2),
      employeesMin: m ? parseInt(m[1] ?? m[3], 10) : null,
      employeesMax: m && m[2] ? parseInt(m[2], 10) : null,
      range: m ? range : null,
    });
  });
  return out.filter((r) => /(株式会社|有限会社|合同会社)/.test(r.name));
}

export async function discover(q, ctx) {
  const pages = q.pages ?? 2;
  let taken = 0;
  for (let p = q.startPage ?? 1; p < (q.startPage ?? 1) + pages && taken < q.limit; p++) {
    if (q.state) q.state.lastPage = p;
    const url = p === 1 ? q.url : `${q.url.replace(/\/$/, '')}/page/${p}/`;
    let list;
    try {
      list = parseList(await ctx.crawler.snapshot(url, { settleMs: 1500 }));
    } catch (e) {
      ctx.log(`  ! agencyhub ${url}: ${e.message}`);
      break;
    }
    ctx.log(`  agencyhub ${url}: ${list.length} 社`);
    for (const r of list) {
      if (taken >= q.limit) break;
      taken++;
      const c = ctx.upsert(r.name);
      addSource(c, id, url);
      c.seedCategories.push(q.category);
      const src = { source: id, url };
      // 規模は幅(レンジ)。下限を値として記録し、閾値付近は断定しない(merge側)
      addEvidence(c, 'employees', r.employeesMin, { ...src, snippet: `AgencyHub 従業員規模: ${r.range}（下限を採用）` });
      addEvidence(c, 'profileText', clip(`${q.label ?? ''} ${r.tags.join(' ')} ${r.description}`, 300), { ...src, snippet: `AgencyHub「${q.label}」一覧に掲載: ${r.tags.join('/')}` });
    }
  }
}
