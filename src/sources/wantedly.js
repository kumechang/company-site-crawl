import { extractAddress } from '../lib/extract.js';
import { addEvidence, addSource, setOfficialUrl } from '../lib/model.js';
import { clip, lines, nfkc } from '../lib/util.js';

export const id = 'wantedly';
const BASE = 'https://www.wantedly.com';

/** 一覧の「企業リンク」と「募集リンク」を出現順に対応づける */
export function parseSearch(snap) {
  const comps = [];
  const seen = new Set();
  for (const a of snap.anchors) {
    const m = a.href.match(/^https:\/\/www\.wantedly\.com\/companies\/([^/?#]+)$/);
    if (!m || seen.has(m[1]) || !a.text) continue;
    seen.add(m[1]);
    comps.push({ slug: m[1], name: a.text.split('\n')[0].trim() });
  }
  const projs = snap.anchors.filter((a) => /\/projects\/\d+/.test(a.href));
  comps.forEach((c, i) => {
    const t = projs[i] ? lines(projs[i].text).filter((l) => !/^(NEW|\d+ entries)$/.test(l)).join(' / ') : '';
    c.jobTitle = clip(t, 150);
  });
  return comps;
}

/** 企業ページ: 「会社情報」以降に 住所 / 公式URL / 設立 / N人のメンバー が並ぶ */
export function parseCompany(snap) {
  const ls = lines(snap.text);
  const i = ls.findIndex((l) => l === '会社情報');
  const block = i >= 0 ? ls.slice(i, i + 12) : [];
  const text = block.join('\n');
  const members = nfkc(text).match(/([\d,]+)\s*人のメンバー/);
  const url = block.find((l) => /^https?:\/\//.test(l)) ?? snap.anchors.find((a) => /^https?:\/\/(?!.*(wantedly|facebook|twitter|instagram|youtube|x\.com))/.test(a.href))?.href;
  return {
    address: extractAddress(text)?.address ?? null,
    officialUrl: url ?? null,
    members: members ? parseInt(members[1].replace(/,/g, ''), 10) : null,
    founded: (text.match(/(\d{4}\/\d{1,2})\s*に設立/) ?? [])[1] ?? null,
    block: clip(text.replace(/\n/g, ' | '), 200),
  };
}

export async function discover(q, ctx) {
  // UI が使う URL 形式。new=true&order=mixed が無いとキーワードが反映されない。固定の広告枠が上位に混ざる点はカテゴリ判定で除外する
  const url = `${BASE}/projects?new=true&page=1&keywords=${encodeURIComponent(q.keyword)}&order=mixed`;
  const snap = await ctx.crawler.snapshot(url, { settleMs: 3000 });
  const comps = parseSearch(snap).slice(0, q.limit);
  ctx.log(`  wantedly "${q.keyword}": ${comps.length} 社`);
  for (const co of comps) {
    const companyUrl = `${BASE}/companies/${co.slug}`;
    let info;
    try {
      info = parseCompany(await ctx.crawler.snapshot(companyUrl, { waitForText: '会社情報' }));
    } catch (e) {
      ctx.log(`  ! wantedly ${co.slug}: ${e.message}`);
      continue;
    }
    const c = ctx.upsert(co.name);
    addSource(c, id, companyUrl);
    c.seedCategories.push(q.category);
    const src = { source: id, url: companyUrl };
    addEvidence(c, 'address', info.address, { ...src, snippet: info.block });
    // Wantedly の「メンバー」は登録ユーザー数で、従業員数とは別物 → 別フィールドで保持（補助情報）
    addEvidence(c, 'wantedlyMembers', info.members, { ...src, snippet: info.block });
    addEvidence(c, 'profileText', clip(`${co.jobTitle}`, 300), { ...src, snippet: '募集タイトル' });
    addEvidence(c, 'founded', info.founded, src);
    setOfficialUrl(c, info.officialUrl, { ...src, snippet: info.block });
  }
}
