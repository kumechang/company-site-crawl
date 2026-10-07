import { CATEGORIES, INDUSTRY_CORE, COMPETING_BUSINESS } from '../config/categories.js';
import { looksLikeContactPage, sameBrand, contactKind, normalizeUrl, findServiceLinks } from './lib/extract.js';
import { normalizeName, nfkc, domainOf, flatten } from './lib/util.js';
import { assessEmployees, SCOPE_RE } from './lib/employees.js';

/**
 * 収集結果の自己検証（外部の「ファクトチェック」と同じ4観点）。判定は OK / 要確認 / NG。
 *  1. 業種      … 公式サイトの自社説明にそのカテゴリの語があり、主業が別でないか
 *  2. 従業員数  … 公式で確認できるか、他の情報源と大きくずれていないか、連結・グループ値でないか
 *  3. 問い合わせURL … 開いて確認。公式ドメインか、IR/採用/サポート専用でないか
 *  4. 企業取り違え … 公式サイトに社名があるか、所在地・ドメインが複数の情報源で一致するか
 * 確認できないものを推測でOKにしない。
 */

const PREF_RE = /^(東京都|北海道|京都府|大阪府|[一-龥]{2,3}県)/;
const stripPostal = (a) => nfkc(a ?? '').replace(/^[\s　]*(?:〒\s*)?\d{3}[-ー−]?\d{4}[\s　]*/, '').trim();
const prefOf = (a) => (stripPostal(a).match(PREF_RE) ?? [])[1] ?? null;
const cityOf = (a) => (stripPostal(a).replace(PREF_RE, '').match(/^[^市区町村郡]*[市区町村郡]/) ?? [])[0] ?? '';
const sameCity = (a, b) => {
  const x = cityOf(a);
  const y = cityOf(b);
  return !!x && !!y && (x.startsWith(y) || y.startsWith(x));
};

const hits = (text, words) => words.filter((w) => text.includes(w));
const uniq = (a) => [...new Set(a)];
const norm = (s) => nfkc(s ?? '').replace(/\s+/g, '');

/** 公式サイトが自社をどう説明しているか: タイトル・meta説明・トップの冒頭 */
export function selfDescription(top) {
  return norm(`${top?.title ?? ''} ${top?.meta ?? ''} ${flatten(top?.text ?? '').slice(0, 700)}`);
}

// ---------------------------------------------------------------- 業種
const count = (text, words) => words.reduce((n, w) => n + text.split(w).length - 1, 0);

/**
 * 業種の判定。「主業でなくても、会社としてそのカテゴリを取り扱っていれば含める」方針。
 *  - 自社説明(タイトル・meta・トップの冒頭)にカテゴリの語がある → OK
 *  - 本文(会社概要・事業/サービスページ)に語が複数回ある → OK（取り扱いあり）。1回だけの言及は要確認
 *  - 「広告」「SNS」などの一般語しか無い → 要確認（取り扱いの具体的な記述が無い）
 *  - どこにも無い → NG
 * 別事業の語(DX・SaaS等)が並んでいても、それだけでは下げない（備考として残す）。
 */
export function checkIndustry(catKey, { top, officialText, extraText }) {
  const core = INDUSTRY_CORE[catKey];
  const label = CATEGORIES[catKey].label;
  if (!core) return { result: '要確認', comment: `${label}: 判定基準が未定義`, after: null };
  const self = selfDescription(top);
  const body = norm(`${officialText ?? ''} ${flatten(top?.text ?? '')} ${extraText ?? ''}`);
  const mainSelf = hits(self, core.main);
  const mainBody = hits(body, core.main);
  const weakAny = hits(body, core.weak ?? []);
  const compSelf = hits(self, COMPETING_BUSINESS);
  if (!top && !officialText) return { result: '要確認', comment: '公式サイトの事業内容を確認できず、業種を判断できない', after: null };
  const other = compSelf.length ? `（他に ${compSelf.slice(0, 3).join('/')} 等の事業もあり、${label}は主業でない可能性）` : '';
  if (!mainSelf.length && !mainBody.length && !weakAny.length) {
    return { result: 'NG', comment: `公式サイトの文章に「${core.main.slice(0, 4).join('/')}」等が見当たらず、${label}とは確認できない`, after: compSelf.length ? `主業は ${compSelf.slice(0, 3).join('・')} の可能性` : null };
  }
  let result = 'OK';
  let comment;
  if (mainSelf.length) {
    comment = `公式の自社説明に「${mainSelf.slice(0, 3).join('/')}」あり。${label}を取り扱っている${other}`;
  } else if (mainBody.length && (mainBody.length >= 2 || count(body, mainBody) >= 2)) {
    comment = `公式サイトの本文に「${mainBody.slice(0, 3).join('/')}」が複数あり、${label}を取り扱っている（自社説明の冒頭には無く、主業でない可能性）${other}`;
  } else if (mainBody.length) {
    result = '要確認';
    comment = `公式サイトの本文に「${mainBody[0]}」の言及が1回あるのみで、取り扱いの実態は要確認`;
  } else {
    result = '要確認';
    comment = `公式サイトに${label}を示す具体的な語がなく、関連語(${weakAny.slice(0, 3).join('/')})のみ。取り扱いの有無は要確認`;
  }
  if (core.extra && result === 'OK') {
    const ex = hits(body, core.extra);
    if (!ex.length) {
      result = '要確認';
      comment = `${core.extraLabel}を示す記述が公式サイトに無く、${label}(の実態)は要確認`;
    }
  }
  return { result, comment, after: result === 'OK' ? label : null };
}

// ---------------------------------------------------------------- 従業員数
export function checkEmployees(c, r) {
  const evs = c.evidence.filter((e) => e.field === 'employees' && Number.isFinite(e.value));
  const chosen = r.evidence.employees;
  if (!chosen || r.employees == null) return { result: '要確認', comment: '従業員数を確認できていない', after: null, asOf: null, source: null };
  const a = assessEmployees({ value: r.employees, source: chosen.source, snippet: chosen.snippet }, evs);
  const bySrc = new Map();
  for (const e of evs) if (!bySrc.has(e.source)) bySrc.set(e.source, e);
  const others = [...bySrc.values()].filter((e) => e.source !== chosen.source);
  const notes = [];
  let result = a.confirmed ? 'OK' : '要確認';
  if (!a.confirmed) notes.push(...a.reasons);
  // 他の情報源との乖離
  const worst = others.map((e) => ({ e, ratio: Math.max(e.value, r.employees) / Math.max(1, Math.min(e.value, r.employees)) })).sort((x, y) => y.ratio - x.ratio)[0];
  if (worst && worst.ratio >= 1.5) {
    const detail = `${worst.e.source}=${worst.e.value}名`;
    const explained = SCOPE_RE.test(worst.e.snippet ?? '') || a.scope;
    // 有報(EDINET)は社名+所在地で特定した一次情報。他サイトとの乖離は「別会社」ではなく集計範囲・時点の違いとして要確認に留める
    if (worst.ratio >= 3 && !explained && chosen.source !== 'edinet') {
      result = 'NG';
      notes.push(`${chosen.source}=${r.employees}名に対し${detail}と${worst.ratio.toFixed(1)}倍の乖離。別会社の数字の可能性`);
    } else {
      if (result === 'OK') result = '要確認';
      notes.push(`${chosen.source}=${r.employees}名に対し${detail}と差がある(${worst.ratio.toFixed(1)}倍)。調査時点・集計範囲の違いの可能性`);
    }
  }
  if (result === 'OK') notes.unshift(`${{ official: '公式サイト', edinet: '有価証券報告書(EDINET)' }[chosen.source] ?? chosen.source}で${r.employees}名${a.asOf ? `（${a.asOf}時点）` : ''}${others.length ? `。他の情報源(${others.map((e) => `${e.source}=${e.value}`).join(', ')})とも概ね整合` : ''}`);
  return { result, comment: notes.join(' / '), after: r.employees, asOf: a.asOf, source: chosen.source };
}

// ---------------------------------------------------------------- 問い合わせURL
const FORM_HOSTS = /(forms\.gle|docs\.google\.com\/forms|tayori\.com|form\.run|formrun\.|hubspot|hsforms|typeform|formzu|secure-link|kintoneapp|cybozu\.com|b-forms|extra-form|pardot|marketo|sfdc|force\.com|zendesk)/i;
const trimSlash = (u) => u.replace(/#.*$/, '').replace(/\/+$/, '').replace(/^https?:\/\/(www\.)?/, '');

export async function checkContact(c, r, { crawler, top }) {
  const url = r.contactUrl && normalizeUrl(r.contactUrl);
  if (!url) return { result: '要確認', comment: '問い合わせURLを取得できていない', after: null };
  const notes = [];
  let snap = null;
  if (!FORM_HOSTS.test(url)) {
    try {
      snap = await crawler.snapshot(url);
    } catch (e) {
      return { result: 'NG', comment: `問い合わせURLを開けない(${e.message.slice(0, 60)})`, after: null };
    }
  }
  const finalUrl = snap?.finalUrl ?? url;
  const redirected = snap && trimSlash(finalUrl) !== trimSlash(url);
  const official = r.officialUrl;
  const site = (u) => {
    const a = domainOf(u) ?? '';
    const b = domainOf(official) ?? '';
    const same = (x, y) => x && y && (x === y || x.endsWith('.' + y) || y.endsWith('.' + x));
    return same(a, b) || sameBrand(u, official) || (top?.finalUrl && (same(a, domainOf(top.finalUrl) ?? '') || sameBrand(u, top.finalUrl)));
  };
  if (!FORM_HOSTS.test(url) && !site(url) && !site(finalUrl)) return { result: 'NG', comment: `問い合わせURLが公式サイト(${domainOf(official)})と無関係のドメイン(${domainOf(url)})`, after: null };
  let result = 'OK';
  const kind = contactKind(finalUrl, snap?.title ?? '');
  if (kind) {
    result = '要確認';
    notes.push(`${kind}の問い合わせページの可能性(${(() => { try { return new URL(finalUrl).pathname; } catch { return finalUrl; } })()})。一般の問い合わせ用途か要確認`);
  }
  if (snap && !looksLikeContactPage(snap, { requested: url, topText: top?.text })) {
    result = '要確認';
    notes.push('ページ内に問い合わせフォーム/窓口の記述が確認できない');
  }
  if (result === 'OK') notes.push(FORM_HOSTS.test(url) ? '公式サイトからリンクされた外部フォーム' : `公式ドメイン上の問い合わせページを開いて確認${redirected ? '（リダイレクトあり）' : ''}`);
  return { result: result === 'OK' && redirected ? 'OK（リダイレクト）' : result, comment: notes.join(' / '), after: finalUrl };
}

// ---------------------------------------------------------------- 企業取り違え
export function checkIdentity(c, r, { top, officialText }) {
  const core = normalizeName(r.name.replace(/[（(].*[）)]/g, ''));
  const notes = [];
  const site = norm(`${top?.title ?? ''} ${top?.meta ?? ''} ${top?.text ?? ''} ${officialText ?? ''}`).toLowerCase();
  const nameFound = core.length >= 2 && normalizeName(site).includes(core);
  // 所在地の一致: 採用した所在地と、他の情報源の所在地を比べる
  const adopted = r.address;
  const addrs = c.evidence.filter((e) => e.field === 'address' && e.value);
  const agree = uniq(addrs.filter((e) => e.value !== adopted && prefOf(e.value) === prefOf(adopted) && sameCity(e.value, adopted)).map((e) => e.source));
  const conflict = uniq(addrs.filter((e) => prefOf(e.value) && prefOf(adopted) && prefOf(e.value) !== prefOf(adopted)).map((e) => e.source));
  // 公式URLのドメインを示した情報源の数
  const dom = domainOf(r.officialUrl);
  const domSources = uniq(c.evidence.filter((e) => e.field === 'officialUrl' && e.value && (domainOf(e.value) === dom || sameBrand(e.value, r.officialUrl))).map((e) => e.source));
  const sameName = c.evidence.some((e) => /同名\d+件/.test(e.snippet ?? ''));
  const corroborated = agree.length > 0 || domSources.filter((s) => s !== 'official').length >= 2;

  let result;
  if (!r.officialUrl) {
    result = '要確認';
    notes.push('公式サイトが特定できていない');
  } else if (!top && !officialText) {
    result = '要確認';
    notes.push('公式サイトを取得できず、社名・所在地の照合ができない');
  } else if (!nameFound && (conflict.length || !agree.length)) {
    result = conflict.length ? 'NG' : '要確認';
    notes.push(`公式サイト(${dom})上に社名「${r.name}」が見当たらず、${conflict.length ? `所在地も${conflict.join('/')}と食い違う` : '所在地の裏付けもない'}。別企業の可能性`);
  } else if (!nameFound) {
    result = '要確認';
    notes.push(`公式サイト上に社名が確認できない(所在地は${agree.join('/')}と一致)`);
  } else if (conflict.length && !corroborated) {
    result = '要確認';
    notes.push(`社名は公式サイトにあるが、${conflict.join('/')}の所在地(${conflict.map((s) => prefOf(addrs.find((e) => e.source === s).value)).join('/')})が採用した所在地(${prefOf(adopted)})と食い違う`);
  } else if (!corroborated) {
    result = '要確認';
    notes.push('公式サイトに社名はあるが、所在地・ドメインを裏付ける別の情報源がなく、同名企業との区別は未確認');
  } else {
    result = 'OK';
    notes.push(`公式サイトに社名あり。${agree.length ? `所在地(${prefOf(adopted)}${cityOf(adopted)})が${agree.join('/')}と一致` : ''}${domSources.length > 1 ? `${agree.length ? '、' : ''}公式ドメインを${domSources.join('/')}が示す` : ''}`);
    if (conflict.length) notes.push(`${conflict.join('/')}は別の所在地(同名・拠点違いの可能性、不採用)`);
  }
  if (sameName) notes.push('同名企業が複数ありうる(照合時に既知の住所で絞り込み済み)');
  return { result, comment: notes.join(' / '), after: r.officialUrl };
}

// ---------------------------------------------------------------- まとめ
const RANK = { OK: 0, 'OK（リダイレクト）': 0, 要確認: 1, NG: 2 };
export const worst = (...rs) => rs.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'OK');

/** 検証ロジックを変えたら上げる（保存済みの検証結果を無効にして、次の実行で取り直す） */
export const VERIFY_VERSION = 2;

/** 検証の入力の署名。これが前回と同じなら、検証結果も同じになるので取り直さない（会社の情報・カテゴリ・ロジックが変わったときだけ再検証） */
export function checkSig(r, cats) {
  return JSON.stringify([VERIFY_VERSION, [...cats].sort(), r.officialUrl, r.address, r.employees, r.employeesSource, r.contactUrl, r.categories]);
}

/** 1社を検証して c.checks に保存。cats: 検証するカテゴリキー（業種チェック用） */
export async function verifyCompany(c, r, cats, { crawler, log }) {
  let top = null;
  if (r.officialUrl) {
    try {
      top = await crawler.snapshot(r.officialUrl);
    } catch (e) {
      log?.(`  ! verify ${r.name}: 公式サイトを開けない (${e.message.slice(0, 60)})`);
    }
  }
  const officialText = c.evidence.filter((e) => e.field === 'profileText' && e.source === 'official').map((e) => e.value).join(' ');
  let industry = {};
  for (const k of cats) industry[k] = checkIndustry(k, { top, officialText });
  // OKにならなかったカテゴリは、事業・サービスのページ(最大3)も読んで取り扱いの記述を探す（取得結果はキャッシュされる）
  if (top && cats.some((k) => industry[k].result !== 'OK')) {
    const pages = [];
    for (const l of findServiceLinks(top.anchors, r.officialUrl).slice(0, 3)) {
      try {
        pages.push(flatten((await crawler.snapshot(l.url, { retries: 0, timeoutMs: 20000 })).text ?? '').slice(0, 4000)); // 補助的な確認なので、遅い/落ちるページで待たない
      } catch (e) {
        log?.(`  ! verify ${r.name}: 事業ページを開けない ${l.url} (${e.message.slice(0, 40)})`);
      }
    }
    if (pages.length) {
      const extraText = pages.join(' ');
      industry = {};
      for (const k of cats) industry[k] = checkIndustry(k, { top, officialText, extraText });
    }
  }
  const identity = checkIdentity(c, r, { top, officialText });
  const employees = checkEmployees(c, r);
  const contact = await checkContact(c, r, { crawler, top });
  c.checks = { verifiedAt: new Date().toISOString().slice(0, 10), sig: checkSig(r, cats), industry, employees, contact, identity };
  return c.checks;
}

/** カテゴリキーに対する検証結果の取り出し（業種はカテゴリ別） */
export function checksFor(c, catKey) {
  const k = c.checks;
  if (!k) return null;
  const ind = k.industry?.[catKey] ?? null;
  return { industry: ind, employees: k.employees, contact: k.contact, identity: k.identity, verifiedAt: k.verifiedAt };
}
