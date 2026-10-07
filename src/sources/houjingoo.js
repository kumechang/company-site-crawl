import { addEvidence, addSource } from '../lib/model.js';
import { clip, lines, nfkc } from '../lib/util.js';

export const id = 'houjingoo';
// 市区町村まで含む住所行（見出しの「都道府県で探す」などを除く）
const ADDR = /^(東京都|北海道|京都府|大阪府|[一-龥]{2,3}県)[^\s]*?[市区町村郡]/;

/** 一覧: 各社は `社名 | (かな) | … | 本社○○・業種・資本金…・従業員N名 | 業種 | 住所 | 更新日：…` */
export function parseList(snap) {
  const ls = lines(snap.text);
  const out = [];
  let start = ls.findIndex((l) => /検索結果.*件中/.test(l)) + 1;
  ls.forEach((l, i) => {
    if (!/^更新日：/.test(l)) return;
    const block = ls.slice(start, i);
    start = i + 1;
    const name = block.find((x) => /(株式会社|有限会社|合同会社)/.test(x) && x.length < 40);
    if (!name) return;
    const addr = block.find((x) => ADDR.test(x.trim()) && x.length < 90);
    const emp = nfkc(block.join(' ')).match(/従業員([\d,]+)名/);
    out.push({ name, address: addr ? addr.trim().replace(/\s+(求人情報提供|求人募集中).*$/, '') : null, employees: emp ? parseInt(emp[1].replace(/,/g, ''), 10) : null, summary: clip(block.find((x) => /^本社/.test(x)) ?? '', 100) });
  });
  return out;
}

export async function discover(q, ctx) {
  const pages = q.pages ?? 2;
  let taken = 0;
  for (let p = 1; p <= pages && taken < q.limit; p++) {
    const url = p === 1 ? q.url : `${q.url}/page${p}`;
    let list;
    try {
      list = parseList(await ctx.crawler.snapshot(url));
    } catch (e) {
      ctx.log(`  ! houjingoo ${url}: ${e.message}`);
      break;
    }
    ctx.log(`  houjingoo ${url}: ${list.length} 社`);
    for (const r of list) {
      if (taken >= q.limit) break;
      taken++;
      const c = ctx.upsert(r.name);
      addSource(c, id, url);
      c.seedCategories.push(q.category);
      const src = { source: id, url };
      addEvidence(c, 'address', r.address, { ...src, snippet: `全国法人 所在地: ${r.address}` });
      addEvidence(c, 'employees', r.employees, { ...src, snippet: `全国法人 ${r.summary}` });
      addEvidence(c, 'profileText', q.label ?? '', { ...src, snippet: `全国法人「${q.label}」一覧に掲載` });
    }
  }
}
