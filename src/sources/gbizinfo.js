import { addEvidence, addSource } from '../lib/model.js';
import { normalizeName, nfkc } from '../lib/util.js';

export const id = 'gbizinfo';
const TOP = 'https://info.gbiz.go.jp/';

/**
 * 検索結果の表: `法人名` の行の次に `<TAB>本店所在地<TAB>創業年<TAB>資本金<TAB>従業員数<TAB>件数` の行が続く。
 * 例: 株式会社コムニコ | \t東京都港区\t-\t-\t154人\t3件
 */
export function parseResults(text) {
  const ls = (text ?? '').split('\n');
  const rows = [];
  for (let i = 0; i < ls.length - 1; i++) {
    const cells = ls[i + 1].split('\t').map((x) => x.trim());
    if (!ls[i + 1].startsWith('\t') || cells.length < 6) continue;
    const name = ls[i].replace(/\t/g, '').trim();
    if (!name) continue;
    const emp = cells[4].match(/([\d,]+)人/);
    rows.push({ name, address: cells[1] === '-' ? null : cells[1], founded: cells[2] === '-' ? null : cells[2], employees: emp ? parseInt(emp[1].replace(/,/g, ''), 10) : null });
  }
  return rows;
}

/** 会社名が(正規化して)一致する行から1件選ぶ。既知の住所に合うもの → 従業員数ありの順 */
export function pickRow(rows, name, knownAddress) {
  const key = normalizeName(name);
  const exact = rows.filter((r) => normalizeName(r.name.replace(/\(閉鎖\)$/, '')) === key && !/閉鎖/.test(r.name));
  if (!exact.length) return null;
  const area = (a) => nfkc(a ?? '').replace(/^(東京都|北海道|京都府|大阪府|.{2,3}県)/, '').slice(0, 3);
  const known = knownAddress ? area(knownAddress) : null;
  const scored = exact.map((r) => ({ r, score: (known && r.address && nfkc(r.address).includes(known) ? 2 : 0) + (r.employees != null ? 1 : 0) }));
  scored.sort((a, b) => b.score - a.score);
  return { row: scored[0].r, sameName: exact.length };
}

/** フォーム検索（URLで表せないためブラウザ操作）。結果の本文テキストを返す */
async function searchText(crawler, name) {
  return crawler.memo(`gbiz:${name}`, async () => {
    if (!(await crawler.checkRobots(TOP))) throw new Error('robots.txt により取得不可');
    await crawler.throttle(TOP);
    return crawler.rawPage(TOP, async (page) => {
      await page.goto(TOP, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForNetworkIdle({ idleTime: 800, timeout: 12000 }).catch(() => {});
      const input = await page.$('form[name="sim_search"] input[type=text], input[type=text], input:not([type])');
      if (!input) throw new Error('検索ボックスが見つからない');
      await input.type(name);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.body.innerText.includes('の検索結果'), { timeout: 20000 });
      return page.evaluate(() => document.body.innerText);
    });
  });
}

/** 会社名で Gビズインフォ(経産省)を引き、本店所在地・従業員数を補完 */
export async function lookup(c, { crawler, log }) {
  let text;
  try {
    text = await searchText(crawler, c.name.replace(/[（(].*[）)]/g, '').trim());
  } catch (e) {
    log(`  ! gbizinfo ${c.name}: ${e.message.split('\n')[0]}`);
    return false;
  }
  const knownAddr = c.evidence.find((e) => e.field === 'address')?.value;
  const hit = pickRow(parseResults(text), c.name.replace(/[（(].*[）)]/g, '').trim(), knownAddr);
  if (!hit) return false;
  const { row, sameName } = hit;
  addSource(c, id, TOP);
  const src = { source: id, url: TOP };
  const note = sameName > 1 ? `（同名${sameName}件から選択）` : '';
  addEvidence(c, 'address', row.address, { ...src, snippet: `Gビズインフォ 本店所在地: ${row.address}${note}` });
  addEvidence(c, 'employees', row.employees, { ...src, snippet: `Gビズインフォ 従業員数: ${row.employees}人${note}` });
  addEvidence(c, 'founded', row.founded, src);
  return true;
}
