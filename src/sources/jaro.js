import { addEvidence, addSource } from '../lib/model.js';
import { lines } from '../lib/util.js';

export const id = 'jaro';
const HEADER = /^(.{1,30}?)\s*[（(]\d+社[）)]$/;

/** 会員社一覧を業種見出し(例: 化粧品・トイレタリー (56社))ごとの社名リストにする */
export function parseSections(snap) {
  const out = {};
  let cur = null;
  for (const l of lines(snap.text)) {
    const m = l.match(HEADER);
    if (m) {
      cur = m[1].trim();
      out[cur] = [];
    } else if (cur && /(株式会社|有限会社|合同会社|団体)/.test(l) && l.length < 40) out[cur].push(l);
  }
  return out;
}

export async function discover(q, ctx) {
  let sections;
  try {
    sections = parseSections(await ctx.crawler.snapshot(q.url));
  } catch (e) {
    ctx.log(`  ! jaro ${q.url}: ${e.message}`);
    return;
  }
  const names = sections[q.section] ?? [];
  ctx.log(`  jaro ${q.url} 「${q.section}」: ${names.length} 社`);
  for (const name of names.slice(0, q.limit)) {
    const c = ctx.upsert(name);
    addSource(c, id, q.url);
    c.seedCategories.push(q.category);
    addEvidence(c, 'profileText', `${q.label ?? q.section} JARO会員(広告主)`, { source: id, url: q.url, snippet: `JARO会員社一覧「${q.section}」` });
  }
}
