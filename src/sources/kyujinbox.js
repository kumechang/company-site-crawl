import { addEvidence, addSource } from '../lib/model.js';
import { clip, lines } from '../lib/util.js';

export const id = 'kyujinbox';
const PREF = /^(東京都|北海道|京都府|大阪府|[一-龥]{2,3}県)\s/;
const CORP = /(株式会社|有限会社|合同会社|一般社団法人|一般財団法人|医療法人|社会福祉法人|学校法人|Inc\.?|Co\.|Ltd)/;

/**
 * 一覧本文は `求人タイトル | 会社名 | 勤務地(東京都 渋谷区 …) | 給与 …` の並び。
 * 勤務地行の1つ前を会社名、その前を求人タイトルとして拾う。
 */
export function parseList(snap) {
  const ls = lines(snap.text);
  const out = new Map();
  ls.forEach((l, i) => {
    if (i < 2 || !PREF.test(l)) return;
    const company = ls[i - 1];
    if (!CORP.test(company) || company.length > 40) return;
    const title = ls[i - 2];
    if (!out.has(company)) out.set(company, { company, title, location: l });
  });
  return [...out.values()];
}

/** 求人詳細(/jb/)は robots.txt で禁止のため、一覧本文のみを使う。勤務地は本社所在地ではないので address には入れない */
export async function discover(q, ctx) {
  const pages = q.pages ?? 2;
  let taken = 0;
  for (let p = 1; p <= pages && taken < q.limit; p++) {
    const url = p === 1 ? q.url : `${q.url}?pg=${p}`;
    let list;
    try {
      list = parseList(await ctx.crawler.snapshot(url, { settleMs: 1500 }));
    } catch (e) {
      ctx.log(`  ! kyujinbox ${url}: ${e.message}`);
      break;
    }
    ctx.log(`  kyujinbox ${url}: ${list.length} 社`);
    for (const j of list) {
      if (taken >= q.limit) break;
      taken++;
      const c = ctx.upsert(j.company);
      addSource(c, id, url);
      c.seedCategories.push(q.category);
      const src = { source: id, url };
      addEvidence(c, 'profileText', clip(j.title, 200), { ...src, snippet: `求人ボックスの求人タイトル: ${clip(j.title, 60)}` });
      addEvidence(c, 'jobLocation', j.location, { ...src, snippet: `求人の勤務地(本社所在地とは限らない): ${j.location}` });
    }
  }
}
