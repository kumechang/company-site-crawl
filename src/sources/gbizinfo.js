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

const PREF_RE = /^(東京都|北海道|京都府|大阪府|[一-龥]{2,3}県)/;
const prefOf = (a) => (nfkc(a ?? '').match(PREF_RE) ?? [])[1] ?? null;
const cityOf = (a) => (nfkc(a ?? '').replace(PREF_RE, '').match(/^[^市区町村郡]*[市区町村郡]/) ?? [])[0] ?? '';

/**
 * 会社名が(正規化して)一致する行から1件選ぶ。同名の別会社を取り違えないよう:
 *  - 既知の住所(他の情報源)があれば、都道府県と市区町村が合う行だけを採用。合う行が無ければ採用しない
 *  - 既知の住所が無く同名が複数あるときは、東京都の行を優先（収集対象が東京の会社のため）し、従業員数のある行を選ぶ
 */
export function pickRow(rows, name, knownAddresses = []) {
  const key = normalizeName(name);
  const exact = rows.filter((r) => normalizeName(r.name) === key && !/閉鎖/.test(r.name));
  if (!exact.length) return null;
  const known = (Array.isArray(knownAddresses) ? knownAddresses : [knownAddresses]).filter(Boolean);
  const byEmp = (a, b) => (b.employees != null) - (a.employees != null);
  let cand;
  if (known.length) {
    cand = exact.filter((r) => known.some((k) => prefOf(k) && prefOf(k) === prefOf(r.address) && (!cityOf(r.address) || !cityOf(k) || cityOf(k).startsWith(cityOf(r.address)) || cityOf(r.address).startsWith(cityOf(k)))));
    if (!cand.length) return null; // 既知の住所と合う同名行が無い = 別会社の可能性
  } else {
    cand = exact.length > 1 && exact.some((r) => prefOf(r.address) === '東京都') ? exact.filter((r) => prefOf(r.address) === '東京都') : exact;
  }
  cand.sort(byEmp);
  return { row: cand[0], sameName: exact.length };
}

/** フォーム検索（URLで表せないためブラウザ操作）。結果の本文テキストを返す */
async function searchText(crawler, name) {
  return crawler.memo(`gbiz:${name}`, async () => {
    if (!(await crawler.checkRobots(TOP))) throw new Error('robots.txt により取得不可');
    await crawler.throttle(TOP);
    return crawler.rawPage(TOP, async (page) => {
      await page.goto(TOP, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForNetworkIdle({ idleTime: 800, timeout: 12000 }).catch(() => {});
      // 画面に表示されている入力欄だけを対象にする（非表示の別検索欄に入力して検索が走らない不具合の防止）
      const handle = await page.evaluateHandle(() => [...document.querySelectorAll('input[type=text], input[type=search], input:not([type])')].find((i) => i.offsetWidth || i.offsetHeight));
      const input = handle.asElement();
      if (!input) throw new Error('表示されている検索ボックスが見つからない');
      await input.type(name);
      await page.keyboard.press('Enter');
      // 送信でページが遷移するため、waitForFunction ではなく一定間隔で本文を確認する（遷移中の評価エラーは無視して続行）
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          const t = await page.evaluate(() => document.body.innerText);
          if (t.includes('の検索結果')) return t;
        } catch {}
      }
      throw new Error('検索結果が表示されなかった');
    });
  });
}

/** 会社名で Gビズインフォ(経産省)を引き、本店所在地・従業員数を補完。戻り値: true=一致 / false=検索したが一致なし / null=エラー */
export async function lookup(c, { crawler, log }) {
  let text;
  try {
    text = await searchText(crawler, c.name.replace(/[（(].*[）)]/g, '').trim());
  } catch (e) {
    log(`  ! gbizinfo ${c.name}: ${e.message.split('\n')[0]}`);
    return null; // エラー: 再試行できるよう「一致なし」とは区別する
  }
  const knownAddrs = c.evidence.filter((e) => e.field === 'address' && e.source !== id).map((e) => e.value);
  const hit = pickRow(parseResults(text), c.name.replace(/[（(].*[）)]/g, '').trim(), knownAddrs);
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
