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

export function setOfficialUrl(c, url, how) {
  if (!url) return;
  const d = domainOf(url);
  if (!d || /(wantedly|green-japan|imitsu|facebook|twitter|x\.com|instagram|youtube|note\.com|prtimes|google|linkedin)/.test(d)) return;
  if (!c.officialUrl) {
    c.officialUrl = new URL(url).origin + '/';
    c.domain = d;
  }
  addEvidence(c, 'officialUrl', c.officialUrl, how);
}
