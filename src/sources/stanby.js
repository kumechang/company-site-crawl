import { addEvidence, addSource } from '../lib/model.js';
import { clip, lines } from '../lib/util.js';

export const id = 'stanby';
const CORP = /(株式会社|有限会社|合同会社|一般社団法人|一般財団法人|医療法人|社会福祉法人|学校法人|Inc\.?|Co\.|Ltd)/;
const LOCATION = /^(東京都)?[^\s／/]{1,8}[区市町村]$/; // 「港区」「東京都港区」など、勤務地だけの行

/**
 * 一覧本文は `[雇用形態] | 求人タイトル | 会社名 | 勤務地(港区) | 給与 …` の並び。
 * 勤務地だけの行の1つ前を会社名、その前を求人タイトルとして拾う（会社名が「非公開」の求人は除く）。
 */
export function parseList(snap) {
  const ls = lines(snap.text);
  const out = new Map();
  ls.forEach((l, i) => {
    if (i < 2 || !LOCATION.test(l)) return;
    const company = ls[i - 1];
    if (!CORP.test(company) || company.length > 40 || /[／/]/.test(company)) return;
    const title = ls[i - 2];
    if (!out.has(company)) out.set(company, { company, title, location: l });
  });
  return [...out.values()];
}

/** 一覧見出しの全件数（「…の求人・仕事・採用」の次の「39,446 件」）。無ければ null */
export function parseTotal(snap) {
  const m = (snap.text ?? '').match(/求人・仕事・採用\s*\n\s*([\d,]+)\s*\n?\s*件/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}

/**
 * スタンバイの一覧(`/r_…`)を、`/r_…/2` `/r_…/3` とページ送りして会社名を集める。
 * robots.txt は `/jobs/`(求人詳細)・`/search`・`?` を含むURLを禁止しているため、詳細ページにも検索にも行かず、
 * ユーザーが作った固定パスの一覧(ページ送りはパス形式)だけを使う。勤務地は本社所在地ではないので address には入れない。
 */
export async function discover(q, ctx) {
  const pages = q.pages ?? 2;
  let taken = 0;
  const seen = new Set();
  const base = q.url.replace(/\/\d+\/?$/, '').replace(/\/$/, '');
  for (let p = 1; p <= pages && taken < q.limit; p++) {
    const url = p === 1 ? base : `${base}/${p}`;
    let list;
    let total;
    try {
      const snap = await ctx.crawler.snapshot(url, { settleMs: 1500 });
      list = parseList(snap);
      total = parseTotal(snap);
    } catch (e) {
      ctx.log(`  ${/HTTP 404/.test(e.message) ? '- stanby 最終ページを超えた' : '! stanby ' + e.message}: ${url}`);
      break;
    }
    const fresh = list.filter((j) => !seen.has(j.company));
    list.forEach((j) => seen.add(j.company));
    ctx.log(`  stanby ${url}: ${list.length} 社 (新規 ${fresh.length})${total ? ` / 全${total.toLocaleString()}件` : ''}`);
    if (!list.length || !fresh.length) break;
    for (const j of fresh) {
      if (taken >= q.limit) break;
      taken++;
      const c = ctx.upsert(j.company);
      addSource(c, id, url);
      c.seedCategories.push(q.category);
      const src = { source: id, url };
      addEvidence(c, 'jobText', clip(j.title, 200), { ...src, snippet: `スタンバイの求人タイトル: ${clip(j.title, 60)}` });
      addEvidence(c, 'jobLocation', j.location, { ...src, snippet: `求人の勤務地(本社所在地とは限らない): ${j.location}` });
    }
  }
}
