import fs from 'node:fs';
import path from 'node:path';
import { readZip } from '../lib/zip.js';
import { addEvidence, addSource } from '../lib/model.js';
import { normalizeName, nfkc, sleep } from '../lib/util.js';

export const id = 'edinet';

/**
 * EDINET(金融庁)の有価証券報告書から、上場会社などの従業員数・本店所在地を取る。
 * 一次情報（提出会社単体の従業員数が時点つきで載る）なので、第三者サイトより優先する。
 *
 *  1. EDINETコード一覧(CSV)で会社名(+既知の所在地)から EDINETコード を特定
 *  2. EDINET API v2 の書類一覧(日付ごと)から、そのコードの最新の有価証券報告書(様式030000)を探す
 *  3. 書類のXBRL→CSV(type=5)から jpcrp_cor:NumberOfEmployees を読む（単体 CurrentYearInstant_NonConsolidatedMember / 連結 CurrentYearInstant）
 *
 * APIキーは環境変数 EDINET_API_KEY。キーはURLに付くため、ログ・エラー文・キャッシュには決して出さない。
 * 有報を出していない会社(未上場のベンチャー等)は一覧に無いので「一致なし」になる。
 */
const API = 'https://api.edinet-fsa.go.jp/api/v2';
const CODELIST_URL = 'https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip';
const VIEWER = (docID) => `https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?${docID},,`;
const WINDOW_DAYS = 400; // 有報は年1回出るので、約13か月さかのぼれば各社の最新が見つかる
const CODELIST_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const ANNUAL = { docTypeCode: '120', formCode: '030000', ordinanceCode: '010' }; // 有価証券報告書（内国会社・第三号様式）
const EMP_ELEMENT = 'jpcrp_cor:NumberOfEmployees';

// ---------------------------------------------------------------- 純関数（テスト対象）

/** 1行のCSV(ダブルクォート・"" エスケープ対応)をセルの配列にする */
export function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** EDINETコード一覧(1行目はメタ情報・2行目がヘッダ) → [{code,kind,listed,consolidated,fiscalEnd,name,address,secCode,industry}] */
export function parseCodeList(text) {
  const ls = (text ?? '').split(/\r?\n/).filter(Boolean);
  const hi = ls.findIndex((l) => l.includes('ＥＤＩＮＥＴコード') || l.startsWith('EDINETコード'));
  if (hi < 0) return [];
  return ls.slice(hi + 1).map((l) => {
    const c = parseCsvLine(l);
    return { code: c[0], kind: c[1], listed: c[2], consolidated: c[3], fiscalEnd: c[5], name: c[6], address: c[9], industry: c[10], secCode: c[11] || null };
  }).filter((r) => /^E\d{5}$/.test(r.code ?? ''));
}

const PREF_RE = /^(東京都|北海道|京都府|大阪府|[一-龥]{2,3}県)/;
const stripPostal = (a) => nfkc(a ?? '').replace(/^[\s　]*(?:〒\s*)?\d{3}[-ー−]?\d{4}[\s　]*/, '').trim();
const prefOf = (a) => (stripPostal(a).match(PREF_RE) ?? [])[1] ?? null;
const cityOf = (a) => (stripPostal(a).replace(PREF_RE, '').match(/^[^市区町村郡]*[市区町村郡]/) ?? [])[0] ?? '';
/** 市区町村名だけの住所（東京23区は「港区…」と都名が付かない）。東京23区なら true */
const isTokyoWard = (city) => /^[^市区町村郡]{1,4}区$/.test(city);

/** 一覧の所在地は都道府県名が付かないため、市区町村で照合する。都道府県が分かる側(既知の住所)があれば、東京23区との整合も見る */
export function sameLocation(known, filerAddr) {
  const k = cityOf(known);
  const f = cityOf(filerAddr);
  if (!k || !f || !(k.startsWith(f) || f.startsWith(k))) return false;
  const kp = prefOf(known);
  const fp = prefOf(filerAddr);
  if (kp && fp) return kp === fp;
  if (kp && isTokyoWard(f)) return kp === '東京都'; // 「中央区」「西区」等は東京以外にもあるが、区だけで市が付かないのは東京23区
  return true;
}

/** 一覧の所在地に都道府県を補う（東京23区は都名が付かない）。補えなければそのまま */
export function withPrefecture(filerAddr, knownAddrs = []) {
  const a = stripPostal(filerAddr);
  if (prefOf(a)) return a;
  const known = knownAddrs.find((k) => prefOf(k) && sameLocation(k, a));
  if (known) return prefOf(known) + a;
  return isTokyoWard(cityOf(a)) ? '東京都' + a : a;
}

/**
 * 会社名が(正規化して)一致する提出者から1社を選ぶ。同名の別会社を取り違えないよう:
 *  - 既知の住所があれば、市区町村が合う提出者だけを採用。合うものが無ければ採用しない
 *  - 既知の住所が無いときは、同名が1社だけの場合に限って採用（同名が複数なら断定しない）
 * 有価証券報告書等の提出義務者以外（種別が「内国法人・組合」でないもの）は対象外。
 */
export function pickFiler(rows, name, knownAddresses = []) {
  const key = normalizeName((name ?? '').replace(/[（(].*[）)]/g, ''));
  if (key.length < 2) return null;
  const exact = rows.filter((r) => r.kind === '内国法人・組合' && normalizeName(r.name) === key);
  if (!exact.length) return null;
  const known = (Array.isArray(knownAddresses) ? knownAddresses : [knownAddresses]).filter(Boolean);
  if (known.length) {
    const cand = exact.filter((r) => known.some((k) => sameLocation(k, r.address)));
    if (cand.length !== 1) return null; // 合う提出者が無い(別会社の可能性)か、複数で決められない
    return { row: cand[0], sameName: exact.length, byAddress: true };
  }
  if (exact.length !== 1) return null;
  return { row: exact[0], sameName: 1, byAddress: false };
}

/** 書類一覧の1件が、使う有価証券報告書か（取下げ済みは除く） */
export const isAnnualReport = (d) => d.docTypeCode === ANNUAL.docTypeCode && d.formCode === ANNUAL.formCode && d.ordinanceCode === ANNUAL.ordinanceCode && d.withdrawalStatus === '0' && !!d.edinetCode;

export const slimDoc = (d) => ({ docID: d.docID, edinetCode: d.edinetCode, secCode: d.secCode ?? null, periodEnd: d.periodEnd, submitDateTime: d.submitDateTime });

/** 書類一覧(日ごと)から、EDINETコードごとの最新の有価証券報告書(決算期末→提出日時の新しい順) */
export function latestByCode(docs) {
  const m = new Map();
  for (const d of docs) {
    const cur = m.get(d.edinetCode);
    if (!cur || `${d.periodEnd}|${d.submitDateTime}` > `${cur.periodEnd}|${cur.submitDateTime}`) m.set(d.edinetCode, d);
  }
  return m;
}

/** XBRL→CSV(UTF-16LE・タブ区切り・各値を"で囲む)から、当期末の従業員数を取る。nonCons=提出会社単体 / cur=連結(連結財務諸表を作らない会社では単体) */
export function parseEmployeesCsv(text) {
  const num = (v) => {
    const n = parseInt(nfkc(v ?? '').replace(/[,\s]/g, ''), 10);
    return Number.isFinite(n) ? n : null; // 「－」などは無し
  };
  let cur = null;
  let nonCons = null;
  for (const line of (text ?? '').split(/\r?\n/)) {
    const c = line.split('\t').map((x) => x.replace(/^"|"$/g, ''));
    if (c[0] !== EMP_ELEMENT) continue;
    if (c[2] === 'CurrentYearInstant') cur = num(c[8]);
    else if (c[2] === 'CurrentYearInstant_NonConsolidatedMember' && nonCons == null) nonCons = num(c[8]);
  }
  return { cur, nonCons };
}

/**
 * 採用する従業員数。単体の値があればそれ(提出会社単体)。無く、連結財務諸表を作成する会社なら
 * 「連結」の値のみ(スコープ注記つき=単体として断定しない)。連結を作らない会社の当期末は単体そのもの。
 */
export function chooseEmployees({ cur, nonCons }, hasConsolidated) {
  if (nonCons != null) return { value: nonCons, scope: '提出会社単体', consolidated: cur != null && cur !== nonCons ? cur : null };
  if (cur == null) return null;
  return hasConsolidated ? { value: cur, scope: '連結', consolidated: null } : { value: cur, scope: '提出会社単体', consolidated: null };
}

const periodLabel = (d) => {
  const m = (d ?? '').match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}年${Number(m[2])}月期` : '';
};
const dateLabel = (s) => {
  const m = (s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : '';
};

// ---------------------------------------------------------------- API クライアント

const jstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const isWeekend = (ymd) => [0, 6].includes(new Date(ymd + 'T00:00:00Z').getUTCDay());

export class Edinet {
  constructor({ apiKey = process.env.EDINET_API_KEY, cacheDir = 'data/cache/edinet', delayMs = 600, useCache = true, log = () => {}, fetchImpl = fetch } = {}) {
    if (!apiKey) throw new Error('EDINET_API_KEY が未設定');
    Object.assign(this, { cacheDir, delayMs, useCache, log, fetchImpl });
    this.apiKey = apiKey;
    this.last = 0;
    this.requests = 0;
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  async throttle() {
    const wait = this.last + this.delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.last = Date.now();
  }

  /** GET。失敗時のメッセージにURL(=キー)を含めない。一時的なエラー(429/5xx/通信)は待って再試行 */
  async get(pathAndQuery, { attempts = 4 } = {}) {
    const sep = pathAndQuery.includes('?') ? '&' : '?';
    const url = `${API}${pathAndQuery}${sep}Subscription-Key=${encodeURIComponent(this.apiKey)}`;
    let last = '';
    for (let i = 0; i < attempts; i++) {
      await this.throttle();
      this.requests++;
      try {
        const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(90000) });
        if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`EDINET APIが認証エラー(HTTP ${res.status})。EDINET_API_KEY を確認`), { fatal: true });
        if (res.status === 200) return Buffer.from(await res.arrayBuffer());
        last = `HTTP ${res.status}`;
        if (res.status < 500 && res.status !== 429) break;
      } catch (e) {
        if (e.fatal) throw e;
        last = e.name === 'TimeoutError' ? 'タイムアウト' : String(e.cause?.code ?? e.message).replace(url, '[url]').slice(0, 80);
      }
      await sleep(2000 * 2 ** i);
    }
    throw new Error(`EDINET API ${pathAndQuery.split('?')[0]} 失敗: ${last}`);
  }

  async getJson(pathAndQuery) {
    const j = JSON.parse((await this.get(pathAndQuery)).toString('utf8'));
    const st = j.metadata?.status ?? j.statusCode;
    if (st != null && String(st) !== '200') throw new Error(`EDINET API エラー ${st}: ${String(j.metadata?.message ?? j.message ?? '').slice(0, 80)}`);
    return j;
  }

  cachePath(name) {
    return path.join(this.cacheDir, name);
  }

  readCache(name, maxAgeMs = Infinity) {
    const p = this.cachePath(name);
    if (!this.useCache || !fs.existsSync(p) || Date.now() - fs.statSync(p).mtimeMs > maxAgeMs) return null;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return null;
    }
  }

  writeCache(name, v) {
    fs.writeFileSync(this.cachePath(name), JSON.stringify(v));
  }

  /** EDINETコード一覧（提出者名・所在地など）。週に1回取り直す */
  async codeList() {
    if (this._codes) return this._codes;
    let rows = this.readCache('codelist.json', CODELIST_MAX_AGE_MS);
    if (!rows) {
      this.log('  EDINETコード一覧を取得');
      await this.throttle();
      const res = await this.fetchImpl(CODELIST_URL, { signal: AbortSignal.timeout(90000) });
      if (res.status !== 200) throw new Error(`EDINETコード一覧の取得に失敗: HTTP ${res.status}`);
      const entry = readZip(Buffer.from(await res.arrayBuffer())).find((e) => /\.csv$/i.test(e.name));
      if (!entry) throw new Error('EDINETコード一覧ZIPにCSVが無い');
      rows = parseCodeList(new TextDecoder('shift_jis').decode(entry.data));
      if (!rows.length) throw new Error('EDINETコード一覧を解析できなかった');
      this.writeCache('codelist.json', rows);
    }
    return (this._codes = rows);
  }

  /** ある日に提出された有価証券報告書の一覧。過去日は不変なのでキャッシュ（当日分は提出が続くので保存しない） */
  async annualReportsOn(ymd) {
    const name = `day-${ymd}.json`;
    const cached = ymd < jstToday() ? this.readCache(name) : null;
    if (cached) return cached;
    const j = await this.getJson(`/documents.json?date=${ymd}&type=2`);
    const docs = (j.results ?? []).filter(isAnnualReport).map(slimDoc);
    if (ymd < jstToday()) this.writeCache(name, docs);
    return docs;
  }

  /** 直近 WINDOW_DAYS 日の有価証券報告書 → EDINETコードごとの最新1件（土日は提出が無いので飛ばす。初回のみ数分、以降は差分だけ） */
  async docIndex() {
    if (this._index) return this._index;
    const today = jstToday();
    const all = [];
    let fetched = 0;
    for (let n = 0; n <= WINDOW_DAYS; n++) {
      const ymd = addDays(today, -n);
      if (isWeekend(ymd)) continue;
      const before = this.requests;
      all.push(...(await this.annualReportsOn(ymd)));
      if (this.requests > before && ++fetched % 50 === 0) this.log(`  EDINET 書類一覧: ${fetched}日分を取得`);
    }
    return (this._index = latestByCode(all));
  }

  /** 有価証券報告書1件の従業員数(単体/連結)。書類ごとにキャッシュ */
  async employeesOf(docID) {
    const name = `emp-${docID}.json`;
    const cached = this.readCache(name);
    if (cached) return cached;
    const buf = await this.get(`/documents/${docID}?type=5`);
    if (buf[0] === 0x7b) throw new Error(`EDINET 書類${docID}: CSVを取得できない(${buf.toString('utf8', 0, 120).replace(/\s+/g, ' ')})`);
    const entry = readZip(buf).find((e) => /XBRL_TO_CSV\/jpcrp030000-asr-.*\.csv$/i.test(e.name));
    const emp = entry ? parseEmployeesCsv(new TextDecoder('utf-16le').decode(entry.data)) : { cur: null, nonCons: null };
    this.writeCache(name, emp);
    return emp;
  }
}

// ---------------------------------------------------------------- 補完

/**
 * 会社名(+既知の所在地)で EDINET を引き、本店所在地・従業員数(有価証券報告書)・EDINETコードを証拠に加える。
 * 何度実行しても同じ結果になるよう、以前の edinet の証拠は取り除いてから加え直す(新しい有報が出た時に更新される)。
 * 戻り値: true=一致 / false=有報提出会社に一致なし / null=エラー(再試行できる)
 */
export async function lookup(c, { edinet, log }) {
  try {
    const knownAddrs = c.evidence.filter((e) => e.field === 'address' && e.source !== id).map((e) => e.value);
    const hit = pickFiler(await edinet.codeList(), c.name, knownAddrs);
    c.evidence = c.evidence.filter((e) => e.source !== id);
    c.sources = c.sources.filter((s) => s.source !== id);
    if (!hit) return false;
    const { row, byAddress } = hit;
    const doc = (await edinet.docIndex()).get(row.code);
    if (!doc) return false; // 一覧に載るが直近の有報が無い(提出義務の終了・決算期変更など)
    const choice = chooseEmployees(await edinet.employeesOf(doc.docID), row.consolidated === '有');
    const url = VIEWER(doc.docID);
    const src = { source: id, url };
    const how = byAddress ? '' : '（所在地での照合なし・社名のみ一致）';
    const doc_ = `有価証券報告書 ${periodLabel(doc.periodEnd)}（${dateLabel(doc.submitDateTime)}提出・書類ID ${doc.docID}）`;
    addSource(c, id, url);
    addEvidence(c, 'edinetCode', row.code, { ...src, snippet: `EDINETコード ${row.code} / ${row.listed}${row.secCode ? ` 証券コード${row.secCode.replace(/0$/, '')}` : ''} / ${row.industry}${how}` });
    addEvidence(c, 'address', withPrefecture(row.address, knownAddrs), { ...src, snippet: `EDINETコード一覧の本店所在地: ${row.address}${how}` });
    if (choice) {
      addEvidence(c, 'employees', choice.value, { ...src, snippet: `${doc_} ${choice.scope}の従業員数 ${choice.value}名${how}` });
      if (choice.consolidated != null) addEvidence(c, 'employeesConsolidated', choice.consolidated, { ...src, snippet: `${doc_} 連結の従業員数 ${choice.consolidated}名` });
    }
    return true;
  } catch (e) {
    log(`  ! edinet ${c.name}: ${e.message.split('\n')[0]}`);
    if (e.fatal) throw e; // キー不正など: 全社で同じ失敗になるので止める
    return null;
  }
}
