import { addEvidence, addSource, setOfficialUrl } from '../lib/model.js';
import { clip, lines, nfkc } from '../lib/util.js';

export const id = 'grip';

/** 一覧: 会社ページ(/ad-db/company/ID, /web-db/company/ID)のリンクを出現順に */
export function parseList(snap) {
  const m = new Map();
  for (const a of snap.anchors) {
    const x = a.href.match(/^(https:\/\/grip-space\.co\.jp\/(?:ad|web)-db\/company\/(\d+))\/?$/);
    if (x && !m.has(x[2])) m.set(x[2], { url: x[1], name: lines(a.text)[0] });
  }
  return [...m.values()].filter((c) => c.name);
}

/** 会社ページの「会社概要」: `ラベル<TAB>値` の行 */
export function parseCompany(snap) {
  const g = (label) => (snap.text.match(new RegExp(`^${label}\\t(.+)$`, 'm')) ?? [])[1]?.trim() ?? null;
  const emp = nfkc(g('従業員数') ?? '').match(/([\d,]+)\s*名/);
  const about = (snap.text.match(/^会社について\t([\s\S]*?)\n\n/m) ?? [])[1] ?? '';
  return {
    name: g('会社名'),
    address: g('所在地'),
    officialUrl: g('公式サイト'),
    employees: emp ? parseInt(emp[1].replace(/,/g, ''), 10) : null,
    employeesRaw: g('従業員数'),
    corpNo: g('法人番号'),
    about: about.replace(/\n/g, ' '),
  };
}

export async function discover(q, ctx) {
  const pages = q.pages ?? 2;
  let taken = 0;
  for (let p = 1; p <= pages && taken < q.limit; p++) {
    const url = p === 1 ? q.url : `${q.url}?page=${p}`;
    let list;
    try {
      list = parseList(await ctx.crawler.snapshot(url));
    } catch (e) {
      ctx.log(`  ! grip ${url}: ${e.message}`);
      break;
    }
    ctx.log(`  grip ${url}: ${list.length} 社`);
    for (const co of list) {
      if (taken >= q.limit) break;
      let info;
      try {
        info = parseCompany(await ctx.crawler.snapshot(co.url));
      } catch (e) {
        ctx.log(`  ! grip ${co.url}: ${e.message}`);
        continue;
      }
      if (!info.name) continue;
      taken++;
      const c = ctx.upsert(info.name);
      addSource(c, id, co.url);
      c.seedCategories.push(q.category);
      const src = { source: id, url: co.url };
      addEvidence(c, 'address', info.address, { ...src, snippet: `グリップ 所在地: ${info.address}` });
      addEvidence(c, 'employees', info.employees, { ...src, snippet: `グリップ 従業員数: ${info.employeesRaw}` });
      // 一覧(広告代理店DB等)への掲載をカテゴリの根拠にする
      addEvidence(c, 'profileText', clip(`${q.label ?? ''} ${info.about}`, 300), { ...src, snippet: `グリップ「${q.label ?? ''}」一覧に掲載` });
      setOfficialUrl(c, info.officialUrl, { ...src, snippet: `グリップ 公式サイト: ${info.officialUrl}` });
    }
  }
}
