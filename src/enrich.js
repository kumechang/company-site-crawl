import { extractEmployees, extractAddress, findContactLinks, findProfileLinks } from './lib/extract.js';
import { addEvidence, addSource, bestOfficial } from './lib/model.js';
import { domainOf } from './lib/util.js';
import { clip, flatten } from './lib/util.js';
import { RobotsDisallowed } from './lib/crawler.js';

// 外部のフォームサービス（公式サイトからリンクされていれば公式の問い合わせ先とみなす。ページ自体は取得しない）
const FORM_HOSTS = /(forms\.gle|docs\.google\.com\/forms|tayori\.com|form\.run|formrun\.|hubspot|hsforms|typeform|formzu|secure-link|kintoneapp|cybozu\.com|b-forms|extra-form|pardot|marketo|sfdc|force\.com|zendesk)/i;
const CONTACT_BODY = /お問い?合わせ|お問合せ|問合せ|contact|inquiry|ご相談|フォーム|送信|メールアドレス/i;
const FALLBACK_PATHS = ['/contact/', '/contact', '/inquiry/', '/inquiry', '/contact.html', '/contact-us/', '/form/', '/toiawase/'];

/** 問い合わせページが実在し、問い合わせ用のページらしいか確認 */
async function verifyContact(url, crawler) {
  if (FORM_HOSTS.test(url)) return { ok: true, how: '外部フォームサービス(公式サイトからリンク)' };
  try {
    const snap = await crawler.snapshot(url);
    return CONTACT_BODY.test(snap.text) ? { ok: true, how: 'ページ実在を確認' } : { ok: false };
  } catch (e) {
    if (e instanceof RobotsDisallowed) return { ok: true, how: 'リンク検出のみ(robots.txtにより未アクセス)' };
    return { ok: false };
  }
}

/**
 * 公式サイトを巡回して、他媒体で足りなかった項目（従業員数・住所・問い合わせURL）を補完する。
 * トップ → 会社概要ページ(最大2) の順に見る。
 */
export async function enrichFromOfficial(c, { crawler, log }) {
  const best = bestOfficial(c);
  if (best && typeof best === 'object') {
    c.officialUrl = best.url;
    c.domain = domainOf(best.url);
  }
  if (!c.officialUrl) return;
  const src = 'official';
  let top;
  try {
    top = await crawler.snapshot(c.officialUrl);
  } catch (e) {
    log(`  ! official ${c.officialUrl}: ${e instanceof RobotsDisallowed ? 'robots.txt禁止' : e.message}`);
    addEvidence(c, 'officialError', e.message.slice(0, 80), { source: src, url: c.officialUrl });
    return;
  }
  addSource(c, src, c.officialUrl);
  addEvidence(c, 'profileText', clip(`${top.title} ${flatten(top.text)}`, 500), { source: src, url: c.officialUrl, snippet: 'トップページ' });

  const pages = [{ url: c.officialUrl, snap: top }];
  for (const p of findProfileLinks(top.anchors, c.officialUrl).slice(0, 2)) {
    try {
      pages.push({ url: p.url, snap: await crawler.snapshot(p.url) });
    } catch (e) {
      log(`  ! profile ${p.url}: ${e.message}`);
    }
  }

  for (const { url, snap } of pages) {
    const emp = extractEmployees(snap.text);
    if (emp) addEvidence(c, 'employees', emp.value, { source: src, url, snippet: emp.raw });
    const addr = extractAddress(snap.text);
    if (addr?.labeled) addEvidence(c, 'address', addr.address, { source: src, url, snippet: addr.address });
    else if (addr) addEvidence(c, 'address', addr.address, { source: src, url, snippet: addr.address });
    if (snap.text) addEvidence(c, 'profileText', clip(flatten(snap.text), 500), { source: src, url, snippet: '会社概要ページ' });
  }

  // 問い合わせURL: 検出したリンクを上位から実在確認 → 見つからなければ一般的なパスを試す
  // 公式サイトと無関係なドメイン(別サービスのフォーム等)は、外部フォームサービスでない限り採用しない。サポート/FAQは問い合わせ先とみなさない
  const sameDomain = (u) => {
    const a = domainOf(u) ?? '';
    const b = domainOf(c.officialUrl) ?? '';
    return a === b || a.endsWith('.' + b) || b.endsWith('.' + a);
  };
  const all = pages
    .flatMap(({ url, snap }) => findContactLinks(snap.anchors, url).map((l) => ({ ...l, from: url })))
    .filter((l) => (sameDomain(l.url) || FORM_HOSTS.test(l.url)) && !/\/(support|faq|help)(\/|$)/i.test(new URL(l.url).pathname));
  all.sort((a, b) => b.score - a.score);
  for (const l of all.slice(0, 3)) {
    const v = await verifyContact(l.url, crawler);
    if (v.ok) {
      addEvidence(c, 'contactUrl', l.url, { source: src, url: l.from, snippet: `リンク文言「${l.text}」/ ${v.how}` });
      return;
    }
  }
  const origin = new URL(c.officialUrl).origin;
  for (const path of FALLBACK_PATHS) {
    const u = origin + path;
    try {
      const snap = await crawler.snapshot(u, { retries: 0 });
      if (CONTACT_BODY.test(snap.text)) {
        addEvidence(c, 'contactUrl', u, { source: src, url: u, snippet: `トップにリンクが見つからず、一般的なパス(${path})の実在を確認` });
        return;
      }
    } catch {}
  }
}
