import { extractEmployees, extractAddress, findContactLinks, findProfileLinks, looksLikeContactPage, sameBrand } from './lib/extract.js';
import { addEvidence, addSource, bestOfficial } from './lib/model.js';
import { domainOf } from './lib/util.js';
import { clip, flatten } from './lib/util.js';
import { RobotsDisallowed } from './lib/crawler.js';
import { isAccessFailure, runEnv } from './lib/access.js';

// 外部のフォームサービス（公式サイトからリンクされていれば公式の問い合わせ先とみなす。ページ自体は取得しない）
const FORM_HOSTS = /(forms\.gle|docs\.google\.com\/forms|tayori\.com|form\.run|formrun\.|hubspot|hsforms|typeform|formzu|secure-link|kintoneapp|cybozu\.com|b-forms|extra-form|pardot|marketo|sfdc|force\.com|zendesk)/i;
const CONTACT_BODY = /お問い?合わせ|お問合せ|問合せ|contact|inquiry|ご相談|フォーム|送信|メールアドレス/i;
const FALLBACK_PATHS = ['/contact/', '/contact', '/inquiry/', '/inquiry', '/contact.html', '/contact-us/', '/form/', '/toiawase/'];

/** 問い合わせページとして妥当か確認（メニューの「お問い合わせ」の文字だけでは通さない） */
async function verifyContact(url, crawler, topText) {
  if (FORM_HOSTS.test(url)) return { ok: true, how: '外部フォームサービス(公式サイトからリンク)' };
  try {
    const snap = await crawler.snapshot(url);
    return looksLikeContactPage(snap, { requested: url, topText }) ? { ok: true, how: 'ページ実在とフォームの記述を確認' } : { ok: false };
  } catch (e) {
    if (e instanceof RobotsDisallowed) return { ok: true, how: 'リンク検出のみ(robots.txtにより未アクセス)' };
    return { ok: false };
  }
}

/** 公式URLの候補（情報源ごとの記録）のうち、採用した公式URLとはドメインが違うもの。サービスサイトが公式URLになっている会社の本体サイトを探すのに使う */
function alternateOfficialUrls(c) {
  const main = domainOf(c.officialUrl);
  const seen = new Set([main]);
  const out = [];
  for (const e of c.evidence) {
    if (e.field !== 'officialUrl' || !e.value) continue;
    const d = domainOf(e.value);
    if (!d || seen.has(d)) continue;
    seen.add(d);
    out.push(e.value);
  }
  return out.slice(0, 2);
}

/** 公式サイトの巡回が必要か: 巡回の記録が無い会社。接続失敗だけで終わった会社は、まだ試していない環境(手元など)でだけ取り直す */
export function needsOfficialCrawl(c, env = runEnv()) {
  const off = c.evidence.filter((e) => e.source === 'official');
  if (!off.length) return true;
  if (off.some((e) => e.field !== 'officialError' && e.field !== 'officialAccessFailed')) return false;
  const tried = off.filter((e) => e.field === 'officialAccessFailed').map((e) => e.value);
  // 旧形式(環境の記録なし)の接続失敗は、GitHub Actions で試したものとみなす
  if (!tried.length && off.some((e) => e.field === 'officialError' && /robots\.txt を取得できない|^HTTP (401|403|429|5\d\d)|timeout/i.test(e.value))) tried.push('actions');
  return tried.length > 0 && !tried.includes(env);
}

/** 1つのサイトを巡回: トップ → 会社概要ページ(従業員数が見つかるまで最大4)。従業員数・住所・本文を証拠として追加 */
async function crawlSite(c, url, { crawler, log, primary, earlyStop }) {
  const src = 'official';
  let top;
  try {
    top = await crawler.snapshot(url);
  } catch (e) {
    log(`  ! official ${url}: ${e instanceof RobotsDisallowed ? 'robots.txt禁止' : e.message}`);
    if (primary) {
      addEvidence(c, 'officialError', e.message.slice(0, 80), { source: src, url });
      // 接続できなかっただけ（robots.txtの403・HTTP 403/429/5xx・タイムアウト）なら、サイト側の拒否とは限らない。試した環境を残し、別の環境では取り直す
      if (isAccessFailure(e)) addEvidence(c, 'officialAccessFailed', runEnv(), { source: src, url });
    }
    return null;
  }
  if (primary) c.evidence = c.evidence.filter((e) => !(e.source === src && (e.field === 'officialError' || e.field === 'officialAccessFailed'))); // 取り直しで開けたら、失敗の記録は消す
  addSource(c, src, url);
  addEvidence(c, 'profileText', clip(`${top.title} ${flatten(top.text)}`, 1500), { source: src, url, snippet: 'トップページ' });
  const pages = [{ url, snap: top }];
  // 見切り: どのカテゴリの語もトップに無い会社は、会社概要・問い合わせの巡回(数ページ)まで進まない
  if (primary && earlyStop?.(top)) {
    addEvidence(c, 'earlyStop', true, { source: src, url, snippet: 'トップページにどのカテゴリの語も無いため、概要・問い合わせの巡回を省略(求人一覧のみで見つかった会社)' });
    return { url, top, pages, hasEmp: false, stopped: true };
  }
  let strong = !!extractEmployees(top.text)?.strong;
  for (const p of findProfileLinks(top.anchors, url).slice(0, 4)) {
    if (strong && pages.length > 2) break; // 従業員数が見つかり、概要ページも見たなら十分
    try {
      const snap = await crawler.snapshot(p.url);
      pages.push({ url: p.url, snap });
      if (extractEmployees(snap.text)?.strong) strong = true;
    } catch (e) {
      log(`  ! profile ${p.url}: ${e.message}`);
    }
  }
  const emps = pages.map(({ url: u, snap }) => ({ url: u, emp: extractEmployees(snap.text) })).filter((x) => x.emp);
  const anyStrong = emps.some((x) => x.emp.strong);
  for (const { url: u, emp } of emps) if (!anyStrong || emp.strong) addEvidence(c, 'employees', emp.value, { source: src, url: u, snippet: emp.raw });
  for (const { url: u, snap } of pages) {
    const addr = extractAddress(snap.text);
    if (addr) addEvidence(c, 'address', addr.address, { source: src, url: u, snippet: addr.address });
    if (snap.text) addEvidence(c, 'profileText', clip(flatten(snap.text), 1500), { source: src, url: u, snippet: '会社概要ページ' });
  }
  return { url, top, pages, hasEmp: emps.length > 0 };
}

/** 問い合わせURL: 検出したリンクを上位から実在確認 → 見つからなければ一般的なパスを試す。用途限定の窓口(IR・採用・英語・サービス別・サポート等)は選ばない */
async function findContact(c, site, { crawler }) {
  const { url: base, top, pages } = site;
  const same = (x, y) => x && y && (x === y || x.endsWith('.' + y) || y.endsWith('.' + x));
  // 公式サイトと無関係なドメイン(別サービスのフォーム等)は、外部フォームサービスでない限り採用しない
  // 同じブランドの別ドメイン(houseofrose.jp 等)や、公式URLのリダイレクト先(corp.kose.co.jp → koseholdings.co.jp)も公式の問い合わせ先
  const sameDomain = (u) => {
    const a = domainOf(u) ?? '';
    return same(a, domainOf(base) ?? '') || sameBrand(u, base) || (top.finalUrl && (same(a, domainOf(top.finalUrl) ?? '') || sameBrand(u, top.finalUrl)));
  };
  const all = pages
    .flatMap(({ url, snap }) => findContactLinks(snap.anchors, url).map((l) => ({ ...l, from: url })))
    .filter((l) => (sameDomain(l.url) || FORM_HOSTS.test(l.url)) && !l.kind);
  all.sort((a, b) => b.score - a.score);
  for (const l of all.slice(0, 3)) {
    const v = await verifyContact(l.url, crawler, top.text);
    if (v.ok) {
      addEvidence(c, 'contactUrl', l.url, { source: 'official', url: l.from, snippet: `リンク文言「${l.text}」/ ${v.how}` });
      return true;
    }
  }
  const origin = new URL(base).origin;
  for (const path of FALLBACK_PATHS) {
    const u = origin + path;
    try {
      const snap = await crawler.snapshot(u, { retries: 0 });
      // 存在しないパスでトップページを返すサイト(ソフト404)を除くため、リダイレクト・トップとの同一性・フォーム語まで確認する
      if (looksLikeContactPage(snap, { requested: u, topText: top.text, guess: true })) {
        addEvidence(c, 'contactUrl', u, { source: 'official', url: u, snippet: `トップにリンクが見つからず、一般的なパス(${path})にフォームの記述のあるページが実在` });
        return true;
      }
    } catch {}
  }
  return false;
}

/**
 * 公式サイトを巡回して、他媒体で足りなかった項目（従業員数・住所・問い合わせURL）を補完する。
 * 公式URLがサービスサイトで従業員数が載っていない場合は、他の情報源が示す公式URL候補(本体サイト)も巡回する。
 */
export async function enrichFromOfficial(c, { crawler, log, earlyStop }) {
  const best = bestOfficial(c);
  if (best && typeof best === 'object') {
    c.officialUrl = best.url;
    c.domain = domainOf(best.url);
  }
  if (!c.officialUrl) return;
  const sites = [];
  for (const [i, u] of [c.officialUrl, ...alternateOfficialUrls(c)].entries()) {
    if (i > 0 && sites.some((x) => x.hasEmp)) break;
    const site = await crawlSite(c, u, { crawler, log, primary: i === 0, earlyStop });
    if (site?.stopped) return; // 見切り: 別の公式URL候補も、問い合わせの探索もしない
    if (site) sites.push(site);
  }
  for (const site of sites) if (await findContact(c, site, { crawler })) return;
}
