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

/** 一覧の見出し「転職・求人情報 55,072 件 3 ページ目」→ { total: 55072, page: 3 }。無ければ null */
export function parseTotal(snap) {
  const m = (snap.text ?? '').match(/([\d,]+)\s*件\s*(\d+)\s*ページ目/);
  return m ? { total: parseInt(m[1].replace(/,/g, ''), 10), page: Number(m[2]) } : null;
}

/** 求人詳細(/jb/)は robots.txt で禁止のため、一覧本文のみを使う。勤務地は本社所在地ではないので address には入れない */
export async function discover(q, ctx) {
  const pages = q.pages ?? 2;
  let taken = 0;
  const seen = new Set();
  for (let p = q.startPage ?? 1; p < (q.startPage ?? 1) + pages && taken < q.limit; p++) {
    if (q.state) q.state.lastPage = p;
    const url = p === 1 ? q.url : `${q.url}?pg=${p}`;
    let list;
    let head;
    try {
      const snap = await ctx.crawler.snapshot(url, { settleMs: 1500 });
      list = parseList(snap);
      head = parseTotal(snap);
    } catch (e) {
      // 404 は最終ページの先（求人ボックスは件数に関わらず、一定のページ数より先を返さない）
      ctx.log(`  ${/HTTP 404/.test(e.message) ? '- kyujinbox 最終ページを超えた' : '! kyujinbox ' + e.message}: ${url}`);
      break;
    }
    const fresh = list.filter((j) => !seen.has(j.company));
    list.forEach((j) => seen.add(j.company));
    ctx.log(`  kyujinbox ${url}: ${list.length} 社 (新規 ${fresh.length})${head ? ` / 全${head.total.toLocaleString()}件` : ''}`);
    if (!list.length || !fresh.length) break; // 新しい会社が出なくなったらそれ以上は辿らない
    for (const j of fresh) {
      if (taken >= q.limit) break;
      taken++;
      const c = ctx.upsert(j.company);
      addSource(c, id, url);
      c.seedCategories.push(q.category);
      const src = { source: id, url };
      addEvidence(c, 'jobText', clip(j.title, 200), { ...src, snippet: `求人ボックスの求人タイトル: ${clip(j.title, 60)}` });
      addEvidence(c, 'jobLocation', j.location, { ...src, snippet: `求人の勤務地(本社所在地とは限らない): ${j.location}` });
    }
  }
}
