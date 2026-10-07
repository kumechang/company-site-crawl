import { addEvidence, addSource } from '../lib/model.js';
import { normalizeName, nfkc } from '../lib/util.js';

export const id = 'mynavi';
const SEARCH = 'https://job.mynavi.jp/28/pc/corpinfo/displayCorpSearch/index';

const PREF_RE = /^(東京都|北海道|京都府|大阪府|[一-龥]{2,3}県)/;
const prefOf = (a) => (nfkc(a ?? '').replace(/^[\s　]*(?:〒\s*)?\d{3}[-ー−]?\d{4}[\s　]*/, '').match(PREF_RE) ?? [])[1] ?? null;

/**
 * 掲載名から照合用の名前候補を作る。
 * 例: サラヤグループ【サラヤ(株)／東京サラヤ(株)】 → [サラヤグループ, サラヤ(株), 東京サラヤ(株)]
 */
export function nameCandidates(title) {
  const t = nfkc(title).replace(/\[[^\]]*\]/g, '');
  const out = new Set();
  const inner = [...t.matchAll(/【([^】]*)】/g)].flatMap((m) => m[1].split(/[／/]/));
  const outer = t.replace(/【[^】]*】/g, '');
  for (const s of [outer, ...inner]) {
    const k = normalizeName(s);
    if (k) out.add(k);
  }
  return [...out];
}

/** 検索結果の本文: `<掲載名>\n業　種…\n本　社…\n従業員…` のブロック */
export function parseResults(text) {
  const ls = (text ?? '').split('\n').map((x) => x.trim());
  const rows = [];
  for (let i = 1; i < ls.length; i++) {
    if (!/^業\s*種/.test(ls[i]) || !ls[i - 1]) continue;
    const row = { title: ls[i - 1], hq: null, range: null };
    for (let j = i + 1; j < Math.min(ls.length, i + 4); j++) {
      const hq = ls[j].match(/^本\s*社\s*(.+)/);
      if (hq) row.hq = hq[1];
      const rg = ls[j].match(/^従業員\s*(.+)/);
      if (rg) row.range = rg[1];
    }
    rows.push(row);
  }
  return rows;
}

/** 会社概要ページ(`会社データ`)から 本社所在地・従業員数・設立・資本金 */
export function parseOutline(text) {
  const t = text ?? '';
  const field = (label) => {
    const m = t.match(new RegExp(`^${label}[\\t ]+(.+)$`, 'm'));
    return m ? m[1].trim() : null;
  };
  const empLine = field('従業員');
  const emp = empLine && nfkc(empLine).match(/^(?:グループ)?(?:連結)?\s*([\d,]+)\s*(?:名|人)/);
  const addr = field('本社所在地');
  return {
    address: addr ? addr.replace(/\s+/g, ' ') : null,
    employees: emp ? parseInt(emp[1].replace(/,/g, ''), 10) : null,
    employeesNote: empLine,
    founded: field('設立'),
    capital: field('資本金'),
  };
}

/** 会社名で検索し、(掲載名, 概要ページURL, 本社) の一覧を返す。フォーム送信(POST)のためブラウザ操作 */
async function search(crawler, name) {
  return crawler.memo(`mynavi:${name}`, async () => {
    if (!(await crawler.checkRobots(SEARCH))) throw new Error('robots.txt により取得不可');
    await crawler.throttle(SEARCH);
    return crawler.rawPage(SEARCH, async (page) => {
      await page.goto(SEARCH, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForNetworkIdle({ idleTime: 800, timeout: 12000 }).catch(() => {});
      const input = await page.$('input[name=srchWord]');
      if (!input) throw new Error('検索ボックス(srchWord)が見つからない');
      await input.type(name);
      await page.keyboard.press('Enter');
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          const text = await page.evaluate(() => document.body.innerText);
          if (/企業検索結果\s*\d+\s*社/.test(text)) {
            const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].filter((a) => /\/corp\d+\/outline\.html/.test(a.href)).map((a) => ({ href: a.href.split('?')[0], text: a.innerText.trim() })));
            return { text, links };
          }
        } catch {}
      }
      throw new Error('検索結果が表示されなかった');
    });
  });
}

/**
 * 会社名が(正規化して)一致する掲載を1件選ぶ。同名の別会社の取り違えを避けるため、
 * 既知の住所(他の情報源)があれば、本社の都道府県のどれかが一致する掲載だけを採用する。
 */
export function pickEntry(rows, links, name, knownAddresses = []) {
  const key = normalizeName(name);
  const known = knownAddresses.map(prefOf).filter(Boolean);
  const cand = [];
  for (const r of rows) {
    if (!nameCandidates(r.title).includes(key)) continue;
    const link = links.find((l) => nfkc(l.text).replace(/\s+/g, '') === nfkc(r.title).replace(/\s+/g, ''));
    if (!link) continue;
    if (known.length && r.hq && !known.some((p) => nfkc(r.hq).includes(p))) continue;
    cand.push({ ...r, url: link.href });
  }
  return cand[0] ?? null;
}

/** 戻り値: true=補完した / false=検索したが一致なし / null=エラー */
export async function lookup(c, { crawler, log }) {
  const name = c.name.replace(/[（(].*[）)]/g, '').trim();
  let res;
  try {
    res = await search(crawler, name);
  } catch (e) {
    log(`  ! mynavi ${c.name}: ${e.message.split('\n')[0]}`);
    return null;
  }
  const knownAddrs = c.evidence.filter((e) => e.field === 'address' && e.source !== id).map((e) => e.value);
  const hit = pickEntry(parseResults(res.text), res.links, name, knownAddrs);
  if (!hit) return false;
  let snap;
  try {
    snap = await crawler.snapshot(hit.url);
  } catch (e) {
    log(`  ! mynavi ${c.name}: ${e.message.split('\n')[0]}`);
    return null;
  }
  const o = parseOutline(snap.text);
  addSource(c, id, hit.url);
  const src = { source: id, url: hit.url };
  addEvidence(c, 'address', o.address, { ...src, snippet: `マイナビ(新卒) 本社所在地: ${o.address}` });
  addEvidence(c, 'employees', o.employees, { ...src, snippet: `マイナビ(新卒) 従業員: ${o.employeesNote}` });
  addEvidence(c, 'founded', o.founded, src);
  return true;
}
