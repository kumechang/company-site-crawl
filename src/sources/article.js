import { addEvidence, addSource } from '../lib/model.js';
import { clip, lines, nfkc } from '../lib/util.js';

export const id = 'article';

const STOP = /^(まとめ|はじめに|目次|概要|特徴|料金|比較表|選び方|メリット|デメリット|注意点|おわりに|関連記事|この記事|よくある質問|FAQ|会社概要|サービス概要|実績|事例|口コミ|評判)/;
const CORP = /(株式会社|有限会社|合同会社|Inc\.?|Co\.,?\s*Ltd)/;

/** 見出しの装飾（番号・順位・【…】・括弧書き）を除いた名前の候補（"A/株式会社B" のような併記は分割） */
export function nameVariants(heading) {
  let h = nfkc(heading).trim();
  h = h.replace(/^(?:第?\d+位[:：]?\s*|No\.?\s*\d+[:：]?\s*|\d+[.．、)）]\s*|[①-⑳]\s*|【[^】]*】\s*)/, '');
  const inner = (h.match(/[（(]([^）)]+)[）)]/) ?? [])[1];
  const base = h.replace(/[（(][^）)]*[）)]/g, '').trim();
  const parts = base.split(/[\/／|｜]/).map((x) => x.trim()).filter(Boolean);
  const out = [...parts];
  if (inner && CORP.test(inner)) out.unshift(inner.trim());
  return [...new Set(out)];
}

/**
 * 比較記事の見出しを拾う。見出し行 H（短く、文でない）の直後(8行以内)に「H は/が/の/、…」で始まる説明文があれば、
 * H を掲載企業（またはブランド）とみなす。法人格付きの名前を優先して company とする。
 */
export function parseArticle(snap) {
  const ls = lines(snap.text);
  const out = new Map();
  ls.forEach((l, k) => {
    if (l.length < 2 || l.length > 45 || /[。！？!?]/.test(l) || STOP.test(l) || /とは$/.test(l)) return;
    for (const v of nameVariants(l)) {
      if (v.length < 2) continue;
      const hit = ls.slice(k + 1, k + 9).some((x) => x.startsWith(v) && /^[はがの、，,]/.test(x.slice(v.length)));
      if (!hit) continue;
      const corp = nameVariants(l).find((x) => CORP.test(x)) ?? v;
      const key = nfkc(corp).toLowerCase().replace(/\s/g, '');
      if (!out.has(key)) out.set(key, { heading: l, company: corp });
      break;
    }
  });
  return [...out.values()];
}

export async function discover(q, ctx) {
  let list;
  let title = '';
  try {
    const snap = await ctx.crawler.snapshot(q.url, { settleMs: 1500 });
    title = snap.title;
    list = parseArticle(snap).slice(0, q.limit);
  } catch (e) {
    ctx.log(`  ! article ${q.url}: ${e.message}`);
    return;
  }
  ctx.log(`  article ${q.url}: ${list.length} 社`);
  for (const e of list) {
    const c = ctx.upsert(e.company);
    addSource(c, id, q.url);
    c.seedCategories.push(q.category);
    // 比較記事への掲載をカテゴリの根拠にする（label は設定で指定）
    addEvidence(c, 'profileText', clip(`${q.label ?? ''} ${e.heading}`, 200), { source: id, url: q.url, snippet: `記事「${clip(title, 40)}」に掲載: ${e.heading}` });
  }
}
