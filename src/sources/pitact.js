import { addEvidence, addSource } from '../lib/model.js';
import { lines, nfkc } from '../lib/util.js';

export const id = 'pitact';

/** 一覧: `社名 | 更新日:… | 法人番号 | N | 住所 | … | 電話番号 | … | 従業員数 | 3人` */
export function parseList(snap) {
  const ls = lines(snap.text);
  const out = [];
  ls.forEach((l, i) => {
    if (!/^更新日[:：]/.test(ls[i + 1] ?? '') || /^(法人番号|住所|電話番号|従業員数)$/.test(l)) return;
    const rec = { name: l, address: null, employees: null, corpNo: null };
    for (let j = i + 2; j < Math.min(i + 12, ls.length); j++) {
      if (/^更新日[:：]/.test(ls[j + 1] ?? '')) break;
      const v = ls[j + 1] ?? '';
      if (ls[j] === '法人番号') rec.corpNo = v;
      if (ls[j] === '住所' && v !== '--') rec.address = v;
      if (ls[j] === '従業員数') {
        const m = nfkc(v).match(/([\d,]+)\s*人/);
        if (m) rec.employees = parseInt(m[1].replace(/,/g, ''), 10);
      }
    }
    out.push(rec);
  });
  return out;
}

export async function discover(q, ctx) {
  const pages = q.pages ?? 1;
  let taken = 0;
  for (let p = 1; p <= pages && taken < q.limit; p++) {
    const url = p === 1 ? q.url : `${q.url}/page-${p}`;
    let list;
    try {
      list = parseList(await ctx.crawler.snapshot(url));
    } catch (e) {
      ctx.log(`  ! pitact ${url}: ${e.message}`);
      break;
    }
    ctx.log(`  pitact ${url}: ${list.length} 社`);
    for (const r of list) {
      if (taken >= q.limit) break;
      taken++;
      const c = ctx.upsert(r.name);
      addSource(c, id, url);
      c.seedCategories.push(q.category);
      const src = { source: id, url };
      addEvidence(c, 'address', r.address, { ...src, snippet: `PITACT 住所: ${r.address} (法人番号 ${r.corpNo})` });
      addEvidence(c, 'employees', r.employees, { ...src, snippet: `PITACT 従業員数: ${r.employees}人` });
      addEvidence(c, 'profileText', q.label ?? '', { ...src, snippet: `PITACT「${q.label}」一覧に掲載` });
    }
  }
}
