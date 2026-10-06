import { parseLabeled, extractAddress } from '../lib/extract.js';
import { addEvidence, addSource } from '../lib/model.js';
import { lines, clip } from '../lib/util.js';

export const id = 'green';
const BASE = 'https://www.green-japan.com';

/** 求人一覧のカード(アンカー)から企業を拾う */
export function parseSearch(snap) {
  const out = new Map();
  for (const a of snap.anchors) {
    const m = a.href.match(/\/company\/(\d+)\/job\/\d+/);
    if (!m || out.has(m[1])) continue;
    const ls = lines(a.text).filter((l) => l !== 'New');
    const name = ls[0];
    if (!name) continue;
    const emp = ls.find((l) => /^[\d,]+人$/.test(l));
    const founded = ls.find((l) => /^\d{4}年設立$/.test(l));
    const loc = ls.find((l) => /(東京都|神奈川県|大阪府|フルリモート)/.test(l) && l.length < 60);
    out.set(m[1], { id: m[1], name, employees: emp ? parseInt(emp.replace(/[,人]/g, ''), 10) : null, founded, jobLocation: loc, snippet: clip(ls.join(' / '), 140) });
  }
  return [...out.values()];
}

const LABELS = ['会社名', '業界', '企業の特徴', '設立年月', '代表者氏名', '事業内容', '株式公開（証券取引所）', '従業員数', '平均年齢', '本社住所', '資本金', '売上高'];

export function parseCompany(snap) {
  const info = parseLabeled(snap.text, LABELS, { start: /^企業情報$/, stop: /^この企業と同じ業界/ });
  const g = (k) => (info[k] ?? []).join(' ');
  const emp = g('従業員数').match(/([\d,]+)人/);
  return {
    name: g('会社名'),
    industry: g('業界'),
    business: g('事業内容'),
    employees: emp ? parseInt(emp[1].replace(/,/g, ''), 10) : null,
    employeesRaw: g('従業員数'),
    address: g('本社住所') || extractAddress(snap.text)?.address || null,
    founded: g('設立年月'),
  };
}

/**
 * Green は検索(/search?)が robots.txt で禁止のため、許可されている「業界×エリア」一覧を使う。
 * @param {{category:string, url:string, limit:number}} q
 * @param {{crawler:import('../lib/crawler.js').Crawler, upsert:Function, log:Function}} ctx
 */
export async function discover(q, ctx) {
  const snap = await ctx.crawler.snapshot(q.url);
  const cards = parseSearch(snap).filter((c) => c.employees == null || c.employees >= ctx.minEmployees);
  ctx.log(`  green ${q.url}: カード${cards.length}件(従業員数フィルタ後)`);
  let taken = 0;
  for (const card of cards) {
    if (taken >= q.limit) break;
    const companyUrl = `${BASE}/company/${card.id}`;
    let info = null;
    try {
      info = parseCompany(await ctx.crawler.snapshot(companyUrl));
    } catch (e) {
      ctx.log(`  ! green company ${card.id}: ${e.message}`);
      continue;
    }
    taken++;
    const c = ctx.upsert(info?.name || card.name);
    addSource(c, id, companyUrl);
    c.seedCategories.push(q.category);
    const src = { source: id, url: companyUrl };
    addEvidence(c, 'address', info.address, { ...src, snippet: `本社住所: ${info.address}` });
    addEvidence(c, 'employees', info.employees ?? card.employees, { ...src, snippet: `従業員数: ${info.employeesRaw || card.employees}` });
    addEvidence(c, 'profileText', clip([info.industry, info.business, card.snippet].filter(Boolean).join(' / '), 400), { ...src, snippet: '業界/事業内容' });
    addEvidence(c, 'founded', info.founded, src);
  }
}
