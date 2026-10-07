import { addEvidence, addSource } from '../lib/model.js';
import { clip, lines } from '../lib/util.js';

export const id = 'engage';
const PREF = /^(東京都|北海道|京都府|大阪府|[一-龥]{2,3}県)/;
const CORP = /(株式会社|有限会社|合同会社|一般社団法人|医療法人|社会福祉法人|学校法人|Inc\.?|Co\.|Ltd)/;

/** 一覧の求人行は `求人タイトル | 会社名 / 職種 | 給与 … | 勤務地(東京都…)` */
export function parseList(snap) {
  const ls = lines(snap.text);
  const out = new Map();
  ls.forEach((l, i) => {
    const m = l.match(/^(.{2,40}?) \/ (.+)$/);
    if (!m || !CORP.test(m[1])) return;
    if (!ls.slice(i + 1, i + 6).some((x) => PREF.test(x))) return;
    const loc = ls.slice(i + 1, i + 6).find((x) => PREF.test(x));
    if (!out.has(m[1])) out.set(m[1], { company: m[1].trim(), role: m[2], title: ls[i - 1] ?? '', location: loc });
  });
  return [...out.values()];
}

/** 求人の文面はカテゴリ判定の根拠にしない(募集職種と事業内容は別)ため jobText に入れる。勤務地は本社所在地とは限らない */
export async function discover(q, ctx) {
  let list;
  try {
    list = parseList(await ctx.crawler.snapshot(q.url, { settleMs: 2500 })).slice(0, q.limit);
  } catch (e) {
    ctx.log(`  ! engage ${q.url}: ${e.message}`);
    return;
  }
  ctx.log(`  engage ${q.url}: ${list.length} 社`);
  for (const j of list) {
    const c = ctx.upsert(j.company);
    addSource(c, id, q.url);
    c.seedCategories.push(q.category);
    const src = { source: id, url: q.url };
    addEvidence(c, 'jobText', clip(`${j.title} ${j.role}`, 200), { ...src, snippet: `エンゲージの求人: ${clip(j.title, 60)}` });
    addEvidence(c, 'jobLocation', j.location, { ...src, snippet: `求人の勤務地(本社とは限らない): ${j.location}` });
  }
}
