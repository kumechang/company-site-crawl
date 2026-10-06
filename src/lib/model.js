import { normalizeName, domainOf } from './util.js';

/**
 * 企業レコード。各値は根拠(evidence)つきで保持し、後で検証・突合できるようにする。
 *  evidence: { field, value, source, url, snippet, at }
 */
export function newCompany(name) {
  return { key: normalizeName(name), name, officialUrl: null, domain: null, sources: [], evidence: [], seedCategories: [], contactUrl: null };
}

export function addEvidence(c, field, value, { source, url, snippet }) {
  if (value == null || value === '') return;
  const dup = c.evidence.some((e) => e.field === field && e.source === source && e.value === value);
  if (!dup) c.evidence.push({ field, value, source, url, snippet: snippet ?? '', at: new Date().toISOString() });
}

export function addSource(c, source, url) {
  if (!c.sources.some((s) => s.source === source && s.url === url)) c.sources.push({ source, url });
}

/** 公式URL候補を情報源ごとに記録する（採用は bestOfficial で優先順位により決める） */
export function setOfficialUrl(c, url, how) {
  if (!url) return;
  const d = domainOf(url);
  if (!d || /(wantedly|green-japan|imitsu|facebook|twitter|x\.com|instagram|youtube|note\.com|prtimes|google|linkedin|boxil|aspicjapan|buzztan|digi-mado|web-kanji|biz\.ne\.jp|meetsmore|cone-c-slide|grip-space|goo\.to|pitact|agencyhub|jcia\.org|jaro\.or|openwork\.jp|career-tasu)/.test(d)) return;
  const origin = new URL(url).origin + '/';
  addEvidence(c, 'officialUrl', origin, how);
  if (!c.officialUrl) {
    c.officialUrl = origin;
    c.domain = d;
  }
}

/**
 * 公式URLの採用順。会社の本体サイトを指しやすい情報源を優先し、製品サイトを指しがちな媒体は後ろにする
 * （例: デジタル化の窓口は製品ページの「情報取得元」＝製品サイトのことがある）
 */
export const OFFICIAL_PRIORITY = ['salesnow', 'prtimes', 'grip', 'openwork', 'buzztan', 'webkanji', 'boxil', 'imitsu', 'meetsmore', 'slidelib', 'wantedly', 'aspic', 'digimado'];

export function bestOfficial(c) {
  const ev = c.evidence.filter((e) => e.field === 'officialUrl');
  if (!ev.length) return c.officialUrl;
  const rank = (src) => {
    const i = OFFICIAL_PRIORITY.indexOf(src);
    return i < 0 ? 99 : i;
  };
  ev.sort((a, b) => rank(a.source) - rank(b.source));
  const best = ev[0].value;
  const others = [...new Set(ev.map((e) => e.value).filter((v) => domainOf(v) !== domainOf(best)))];
  return { url: best, others };
}

/** 会社の本体サイトを指しやすい情報源（これらが無い会社は、製品サイトを公式URLにしている可能性がある） */
export const CORPORATE_URL_SOURCES = ['salesnow', 'prtimes', 'grip', 'buzztan', 'webkanji', 'boxil', 'imitsu'];
export const needsCorporateUrl = (c) => !c.evidence.some((e) => e.field === 'officialUrl' && CORPORATE_URL_SOURCES.includes(e.source));
