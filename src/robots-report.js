import fs from 'node:fs';
import { parseRobots, isAllowed } from './lib/robots.js';
import { SITES, CATEGORIES } from '../config/categories.js';

/** 媒体ごとの origin。実際に使うURL(config の各カテゴリ設定)も判定対象にする */
export const ORIGINS = {
  salesnow: 'https://salesnow.jp',
  bizmaps: 'https://biz-maps.com',
  wantedly: 'https://www.wantedly.com',
  green: 'https://www.green-japan.com',
  prtimes: 'https://prtimes.jp',
  indeed: 'https://jp.indeed.com',
  kyujinbox: 'https://xn--pckua2a7gp15o89zb.com',
  doda: 'https://doda.jp',
  mynavi: 'https://tenshoku.mynavi.jp',
  engage: 'https://en-gage.net',
  boxil: 'https://boxil.jp',
  webkanji: 'https://web-kanji.com',
  imitsu: 'https://imitsu.jp',
  hikakubiz: 'https://www.biz.ne.jp',
  hacchunavi: 'https://hnavi.co.jp',
  digimado: 'https://digi-mado.jp',
  aspic: 'https://www.aspicjapan.org',
  buzztan: 'https://www.buzztan.com',
  meetsmore: 'https://meetsmore.com',
  slidelib: 'https://cone-c-slide.com',
  gbizinfo: 'https://info.gbiz.go.jp',
  mynavi_shinsotsu: 'https://job.mynavi.jp',
  grip: 'https://grip-space.co.jp',
  houjingoo: 'https://houjin.goo.to',
  pitact: 'https://pitact.com',
  agencyhub: 'https://agencyhub.jp',
  jcia: 'https://www.jcia.org',
  jaro: 'https://www.jaro.or.jp',
};

/** そのサイトで実際に使っているURL（config に書いたもの + アダプタが辿る代表パス） */
function usedUrls(sid) {
  const urls = new Set();
  for (const def of Object.values(CATEGORIES)) for (const t of def[sid] ?? []) if (/^https?:/.test(t)) urls.add(t);
  const extra = {
    wantedly: ['https://www.wantedly.com/projects?new=true&page=1&keywords=SNS&order=mixed', 'https://www.wantedly.com/companies/example'],
    green: ['https://www.green-japan.com/company/5377'],
    imitsu: ['https://imitsu.jp/ct-net-adagency/pr-tokyo/ci-shibuya-ku/supplier/58074'],
    prtimes: ['https://prtimes.jp/main/action.php?run=html&page=searchkey&search_word=x', 'https://prtimes.jp/main/html/searchrlp/company_id/1'],
    salesnow: ['https://salesnow.jp/db/industries/advertising/subIndustries/advertising-agency/page/2', 'https://salesnow.jp/db/companies/abc'],
    boxil: ['https://boxil.jp/service/12684/'],
    webkanji: ['https://web-kanji.com/companies/comnico'],
    digimado: ['https://digi-mado.jp/products/00000000-0000-0000-0000-000000000000/'],
    aspic: ['https://www.aspicjapan.org/asu/service/47781'],
    kyujinbox: ['https://xn--pckua2a7gp15o89zb.com/jb/abc'],
    doda: ['https://doda.jp/DodaFront/View/JobSearchList.action?k=SNS'],
    hikakubiz: ['https://www.biz.ne.jp/company/segros/'],
  };
  for (const u of extra[sid] ?? []) urls.add(u);
  return [...urls];
}

export async function robotsReport(crawler, log = console.error) {
  const rows = [];
  for (const [sid, origin] of Object.entries(ORIGINS)) {
    const rec = await crawler.fetchRobots(origin);
    const ok = rec.status >= 200 && rec.status < 300;
    const groups = ok ? parseRobots(rec.text) : [];
    const star = groups.filter((g) => g.agents.includes('*'));
    const checks = usedUrls(sid).map((u) => {
      const x = new URL(u);
      const allowed = ok ? isAllowed(groups, x.pathname + x.search) : rec.status === 404 || rec.status === 410;
      return { url: u, allowed };
    });
    rows.push({
      site: SITES[sid]?.name ?? sid,
      origin,
      status: rec.status,
      error: rec.error ?? null,
      groups: groups.length,
      starRules: star.reduce((n, g) => n + g.rules.length, 0),
      checks,
    });
    log(`  robots ${origin}: ${rec.status}${rec.error ? ' ' + rec.error : ''}`);
  }
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/robots-report.json', JSON.stringify(rows, null, 1));
  return rows;
}
