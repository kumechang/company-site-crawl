import { nfkc, flatten, lines, clip } from './util.js';

const PREF = '(?:東京都|北海道|京都府|大阪府|[一-龥]{2,3}県)';

/**
 * 従業員数を抽出。
 * @returns {{value:number, raw:string, approx:boolean}|null}
 */
export function extractEmployees(text) {
  const t = nfkc(flatten(text));
  const re = /(従業員数|社員数|スタッフ数|人員数|職員数|従業員|社員)(?:（[^）]*）|\([^)]*\))?([\s|:：]*)(?:約|およそ)?\s*(?:正社員\s*)?([0-9][0-9,]*)(?![0-9,])(?![.．]\s*[^\s0-9])\s*(?:[〜~～-]\s*([0-9][0-9,]*)(?![0-9,]))?\s*(名|人)?(?!\s*年)(?!\s*から)/g;
  for (const m of t.matchAll(re)) {
    const label = m[1];
    const strong = label.endsWith('数');
    // 「従業員」「社員」だけのラベルは、文章・見出し・番号付き箇条書きの誤検出が多いため、区切り文字と単位(名/人)を必須にする
    if (!strong && (!m[2] || !m[5])) continue;
    const lo = parseInt(m[3].replace(/,/g, ''), 10);
    if (!Number.isFinite(lo) || lo < 1 || lo > 500000) continue;
    const raw = clip(t.slice(m.index, m.index + m[0].length + 24), 60);
    return { value: lo, raw, approx: Boolean(m[4]) || /約/.test(m[0]), strong };
  }
  return null;
}

/**
 * 住所を抽出。ラベル(本社所在地/所在地/本社/住所)付きを優先。
 * @returns {{address:string, labeled:boolean}|null}
 */
export function extractAddress(text) {
  const t = nfkc(flatten(text));
  const labeled = new RegExp(`(?:本社所在地|本社住所|本店所在地|本社|所在地|住所)[\\s|:：]*(?:〒?\\s*\\d{3}-?\\d{4}[\\s|]*)?(${PREF}[^|]{1,70})`);
  let m = t.match(labeled);
  if (m) return { address: cleanAddress(m[1]), labeled: true };
  m = t.match(new RegExp(`(?:〒?\\s*\\d{3}-?\\d{4}[\\s|]*)(${PREF}[^|]{1,70})`));
  if (m) return { address: cleanAddress(m[1]), labeled: false };
  return null;
}

function cleanAddress(a) {
  return a
    .replace(/\s*(TEL|Tel|FAX|電話|アクセス|地図|MAP|Map).*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** 郵便番号などの先頭要素を除いた住所 */
export const stripPostal = (addr) => nfkc(addr ?? '').replace(/^[\s　]*(?:〒\s*)?\d{3}[-ー−]?\d{4}[\s　]*/, '').trim();

export const isTokyoAddress = (addr) => /^東京都/.test(stripPostal(addr));

/** `ラベル行 → 値行(複数可)` 形式の innerText を {label: string[]} にする */
export function parseLabeled(text, labels, { start = null, stop = null } = {}) {
  let ls = lines(text);
  if (start) {
    const i = ls.findIndex((l) => start.test(l));
    if (i >= 0) ls = ls.slice(i + 1);
  }
  const out = {};
  let cur = null;
  for (const l of ls) {
    if (stop && stop.test(l)) break;
    if (labels.includes(l)) {
      cur = l;
      out[cur] = [];
    } else if (cur) out[cur].push(l);
  }
  return out;
}

const CONTACT_TEXT = /お問い?合わせ|お問合わせ|問い合わせ|ご相談|お客様相談|お客様窓口|相談窓口|カスタマーセンター|カスタマーサポート|contact|inquiry|enquiry/i;
const CONTACT_HREF = /contact|inquiry|enquiry|toiawase|otoiawase|form|support/i;
const PROFILE_TEXT = /会社概要|会社情報|企業情報|企業概要|会社案内|運営会社|会社紹介|about\s*us|company|corporate|about/i;
const PROFILE_HREF = /company|corporate|about|gaiyo|overview|profile|outline|info/i;

const sameSite = (a, b) => {
  try {
    const x = new URL(a).hostname.replace(/^www\./, '');
    const y = new URL(b).hostname.replace(/^www\./, '');
    return x === y || x.endsWith('.' + y) || y.endsWith('.' + x);
  } catch {
    return false;
  }
};

const NOISE_HREF = /^(mailto|tel|javascript):|#$/i;
const NOISE_PRIVACY = /privacy|policy|プライバシー|個人情報|利用規約|採用|recruit|career/i;

/** アンカー一覧から問い合わせページ候補を探す（スコア降順） */
export function findContactLinks(anchors, baseUrl) {
  const scored = [];
  for (const a of anchors ?? []) {
    if (!a.href || NOISE_HREF.test(a.href)) continue;
    const text = nfkc(a.text ?? '');
    const tHit = CONTACT_TEXT.test(text);
    const hHit = CONTACT_HREF.test(a.href) && !/information/i.test(a.href);
    if (!tHit && !hHit) continue;
    if (NOISE_PRIVACY.test(text) && !tHit) continue;
    let score = (tHit ? 3 : 0) + (hHit ? 2 : 0) + (sameSite(a.href, baseUrl) ? 1 : 0);
    if (/\/(contact|inquiry)\/?(\?.*)?$/i.test(a.href)) score += 2;
    scored.push({ url: a.href.split('#')[0], text: clip(text, 30), score });
  }
  const seen = new Set();
  return scored
    .sort((x, y) => y.score - x.score)
    .filter((x) => (seen.has(x.url) ? false : seen.add(x.url)));
}

/** アンカー一覧から会社概要ページ候補を探す（同一サイト限定、スコア降順） */
export function findProfileLinks(anchors, baseUrl) {
  const scored = [];
  for (const a of anchors ?? []) {
    if (!a.href || NOISE_HREF.test(a.href) || !sameSite(a.href, baseUrl)) continue;
    const text = nfkc(a.text ?? '');
    if (/採用|recruit|career|ir\b|news|blog|プライバシー|privacy/i.test(text)) continue;
    const tHit = PROFILE_TEXT.test(text);
    const hHit = PROFILE_HREF.test(new URL(a.href).pathname);
    if (!tHit && !hHit) continue;
    let score = (tHit ? 3 : 0) + (hHit ? 1 : 0);
    if (/会社概要|企業情報|会社情報/.test(text)) score += 2;
    if (/\/(company|about|corporate|profile|overview|outline)\/?$/i.test(new URL(a.href).pathname)) score += 1;
    scored.push({ url: a.href.split('#')[0], text: clip(text, 30), score });
  }
  const seen = new Set();
  return scored.sort((x, y) => y.score - x.score).filter((x) => (seen.has(x.url) ? false : seen.add(x.url)));
}

const FORM_WORDS = /お名前|氏名|メールアドレス|電話番号|お問い合わせ内容|お問合せ内容|ご質問|送信|入力内容|必須/g;
const MAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const lineSet = (t) => new Set((t ?? '').split('\n').map((l) => l.trim()).filter(Boolean));

/** 2つのページ本文が(ほぼ)同じか。存在しないパスでトップページを返すサイト(ソフト404)の検出用 */
export function nearlySame(a, b) {
  const x = lineSet(a);
  const y = lineSet(b);
  if (!x.size || !y.size) return false;
  let inter = 0;
  for (const l of x) if (y.has(l)) inter++;
  return inter / (x.size + y.size - inter) >= 0.8;
}

/**
 * 問い合わせページとして妥当か。メニューにある「お問い合わせ」の文字だけでは足りない。
 *  - 推測パス(guess=true)は、リダイレクトされていない・トップページと同一でない・フォーム語が2種以上(またはメールアドレス)
 *  - 実際にリンクされていたページは、トップページと同一でなく、フォーム語が1種以上であればよい
 */
export function looksLikeContactPage(snap, { requested, topText, guess = false }) {
  const text = snap?.text ?? '';
  if (guess && snap?.finalUrl && requested) {
    const norm = (u) => new URL(u).pathname.replace(/\/$/, '');
    if (norm(snap.finalUrl) !== norm(requested)) return false;
  }
  if (topText && nearlySame(text, topText)) return false;
  const kinds = new Set(text.match(FORM_WORDS) ?? []).size;
  if (guess) return kinds >= 2 || (MAIL.test(text) && /お問い?合わせ|問合せ|contact/i.test(text));
  // 実際にリンクされていたページ: フォームが埋め込み(iframe等)で本文に項目名が出ないことが多いため、問い合わせに関する語があれば可
  return kinds >= 1 || /お問い?合わせ|問合せ|contact|相談|フォーム|窓口/i.test(text);
}

/** ブランド名(ドメインの中核)が同じか。例: houseofrose.co.jp と houseofrose.jp */
export function coreOfHost(host) {
  const labels = (host ?? '').replace(/^www\./, '').split('.');
  const suffix2 = ['co.jp', 'or.jp', 'ne.jp', 'go.jp', 'ac.jp', 'ed.jp', 'co.uk'];
  const tail = labels.slice(-2).join('.');
  const rest = suffix2.includes(tail) ? labels.slice(0, -2) : labels.slice(0, -1);
  return rest[rest.length - 1] ?? '';
}
export const sameBrand = (a, b) => {
  try {
    const x = coreOfHost(new URL(a).hostname);
    const y = coreOfHost(new URL(b).hostname);
    return x.length >= 4 && x === y;
  } catch {
    return false;
  }
};
