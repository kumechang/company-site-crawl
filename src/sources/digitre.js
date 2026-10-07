import { addEvidence, addSource } from '../lib/model.js';
import { clip, lines, nfkc } from '../lib/util.js';

export const id = 'digitre';

/** 一覧: 会社ページ(/company/<slug>/)へのリンク。アンカー本文の1行目が会社名 */
export function parseList(snap) {
  const m = new Map();
  for (const a of snap.anchors) {
    const x = a.href.match(/^(https:\/\/www\.digi-tre\.com\/company\/([\w-]+))\/?$/);
    const name = lines(a.text)[0];
    if (x && name && !m.has(x[2])) m.set(x[2], { url: x[1] + '/', name });
  }
  return [...m.values()];
}

/** 会社ページ: 会社名 / 所在地(本社…) / 事業内容 / 会社案内（従業員数・公式URLは載っていない） */
export function parseCompany(snap) {
  const ls = (snap.text ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
  const after = (label) => {
    const i = ls.indexOf(label);
    return i >= 0 ? ls[i + 1] : null;
  };
  // 所在地: 「本社所在地 〒… 住所」の1行形式と、「本社 / 〒… / 住所」の複数行形式がある。次の項目名までを対象にする
  const i1 = ls.indexOf('所在地');
  const block = [];
  if (i1 >= 0) for (const l of ls.slice(i1 + 1)) { if (/^(代表|事業内容|設立|資本金|従業員|関連する地域)/.test(l)) break; block.push(l); }
  const k = block.findIndex((l) => /^本社/.test(l));
  let address = null;
  for (let j = k; k >= 0 && j < Math.min(block.length, k + 3) && !address; j++) {
    const rest = block[j].replace(/^本社(?:所在地)?\s*/, '').replace(/^〒\s*[\d-]+\s*/, '').trim();
    if (rest && !/^(?:本社|[^\s]*(?:営業所|支社|支店|オフィス)[^\s]*)$/.test(rest)) address = rest;
  }
  const name = (after('会社名') ?? '').replace(/[（(][^）)]*[A-Za-z][^）)]*[）)]\s*$/, '').replace(/[（(][^）)]*英文[^）)]*[）)]/, '').trim();
  const biz = after('事業内容');
  const i0 = ls.indexOf('会社案内');
  const about = i0 >= 0 ? ls.slice(i0 + 1, i0 + 3).join(' ') : '';
  return { name: name || null, address, about: `${biz ?? ''} ${about}`.trim() };
}

export async function discover(q, ctx) {
  const pages = q.pages ?? 8;
  let taken = 0;
  for (let p = 1; p <= pages && taken < q.limit; p++) {
    const url = p === 1 ? q.url : `${q.url.replace(/\/$/, '')}/page/${p}/`; // ?page=N は無視され1ページ目になる
    let list;
    try {
      list = parseList(await ctx.crawler.snapshot(url));
    } catch (e) {
      ctx.log(`  ! digitre ${url}: ${e.message}`);
      break;
    }
    ctx.log(`  digitre ${url}: ${list.length} 社`);
    for (const co of list) {
      if (taken >= q.limit) break;
      let info;
      try {
        info = parseCompany(await ctx.crawler.snapshot(co.url));
      } catch (e) {
        ctx.log(`  ! digitre ${co.url}: ${e.message}`);
        continue;
      }
      taken++;
      const c = ctx.upsert(nfkc(info.name ?? co.name));
      addSource(c, id, co.url);
      c.seedCategories.push(q.category);
      const src = { source: id, url: co.url };
      addEvidence(c, 'address', info.address, { ...src, snippet: `デジトレ 本社所在地: ${info.address}` });
      addEvidence(c, 'profileText', clip(`${q.label ?? ''} ${info.about}`, 300), { ...src, snippet: `デジトレ「${q.label ?? ''}」一覧に掲載` });
    }
  }
}
