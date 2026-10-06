#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { Crawler } from './lib/crawler.js';
import { Store } from './lib/store.js';
import { log } from './lib/util.js';
import { CATEGORIES, SITES, ORDER } from '../config/categories.js';
import { consolidate } from './lib/merge.js';
import { enrichFromOfficial } from './enrich.js';
import { needsCorporateUrl, bestOfficial } from './lib/model.js';
import { domainOf } from './lib/util.js';
import { exportAll, exportSample } from './export.js';
import { robotsReport } from './robots-report.js';
import * as green from './sources/green.js';
import * as wantedly from './sources/wantedly.js';
import * as imitsu from './sources/imitsu.js';
import * as boxil from './sources/boxil.js';
import * as salesnow from './sources/salesnow.js';
import * as prtimes from './sources/prtimes.js';
import * as gbizinfo from './sources/gbizinfo.js';
import * as mynavi from './sources/mynavi.js';
import * as aspic from './sources/aspic.js';
import * as webkanji from './sources/webkanji.js';
import * as hikakubiz from './sources/hikakubiz.js';
import * as kyujinbox from './sources/kyujinbox.js';
import * as buzztan from './sources/buzztan.js';
import * as digimado from './sources/digimado.js';
import * as engage from './sources/engage.js';
import * as meetsmore from './sources/meetsmore.js';
import * as slidelib from './sources/slidelib.js';
import * as grip from './sources/grip.js';
import * as digitre from './sources/digitre.js';
import * as houjingoo from './sources/houjingoo.js';
import * as pitact from './sources/pitact.js';
import * as agencyhub from './sources/agencyhub.js';
import * as jcia from './sources/jcia.js';
import * as jaro from './sources/jaro.js';
import * as article from './sources/article.js';

const SALESNOW_INDEX_URLS = [
  'https://salesnow.jp/db/industries/advertising/subIndustries/internet-advertising-agency',
  'https://salesnow.jp/db/industries/advertising/subIndustries/advertising-agency',
  'https://salesnow.jp/db/industries/consulting/subIndustries/web-marketing-consulting',
  'https://salesnow.jp/db/industries/consulting/subIndustries/advertising-operation-consulting',
  'https://salesnow.jp/db/industries/consulting/subIndustries/promotion-consulting',
];

const SOURCES = { green, wantedly, imitsu, boxil, aspic, webkanji, hikakubiz, kyujinbox, buzztan, digimado, engage, meetsmore, slidelib, grip, digitre, houjingoo, pitact, agencyhub, jcia, jaro, salesnow, article, prtimes };

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    ok: { type: 'string', default: '12' }, // sample: カテゴリごとの「判定OK」目標件数
    target: { type: 'string', default: '8' }, // カテゴリごとの目標社数。達したら次の媒体へ進まない
    'per-query': { type: 'string', default: '8' }, // 1クエリ(一覧)あたりの最大取得社数
    sources: { type: 'string', default: '' }, // 空なら ORDER の全媒体。指定時はその媒体のみ
    categories: { type: 'string', default: Object.keys(CATEGORIES).join(',') },
    delay: { type: 'string', default: '2500' }, // 同一ホストへの最小アクセス間隔(ms)
    'salesnow-pages': { type: 'string', default: '25' }, // SalesNow索引で1業種あたり読むページ数(50社/ページ)
    'min-employees': { type: 'string', default: '20' },
    'no-cache': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const HELP = `使い方: node src/cli.js <command> [options]
  discover   媒体から企業候補を集める（Green / Wantedly / アイミツ）
  enrich     公式サイトを巡回して従業員数・住所・問い合わせURLを補完
  export     統合して data/companies.csv を出力
  run        discover → enrich → export を一括実行
  sample     カテゴリごとに「発見→補完→判定OKの件数」を繰り返し、OKが --ok 件に達したら次のカテゴリへ
  robots     全媒体の robots.txt を取得し、使うURLが許可されているか一覧にする
オプション: --target N(カテゴリ目標社数)  --per-query N  --sources green,wantedly,imitsu  --categories cosme_d2c,...  --delay ms  --no-cache`;

const cmd = positionals[0];
if (!cmd || opt.help || !['discover', 'enrich', 'export', 'run', 'robots', 'sample'].includes(cmd)) {
  console.log(HELP);
  process.exit(cmd ? 0 : 1);
}

const minEmployees = Number(opt['min-employees']);
const store = new Store();
const crawler = new Crawler({ minDelayMs: Number(opt.delay), useCache: !opt['no-cache'] });

/** カテゴリに該当し、除外でない企業の数（打ち切り判定用） */
function qualified(cat) {
  const label = CATEGORIES[cat].label;
  return store.all().filter((c) => {
    const r = consolidate(c, { minEmployees });
    return r.status !== '除外' && r.categories.includes(label);
  }).length;
}

/** 1カテゴリ×1媒体の発見。実行したら true、スキップしたら false */
async function discoverSource(cat, sid, limit, ctx) {
  const def = CATEGORIES[cat];
  const site = SITES[sid];
  if (site.status === 'blocked') {
    log(`  - ${site.name}: 利用不可のためスキップ (${site.note})`);
    return false;
  }
  if (!SOURCES[sid]) {
    log(`  - ${site.name}: ${site.status === 'enrich' ? '補完専用(enrichで使用)' : '未実装のためスキップ'}`);
    return false;
  }
  if (!(def[sid] ?? []).length) {
    log(`  - ${site.name}: このカテゴリの対象URLが未設定のためスキップ (config/categories.js の ${sid})`);
    return false;
  }
  for (const t of def[sid]) {
    // 目標は URL/キーワードの文字列、または {url, label, pages, section…} のオブジェクトで指定できる
    const spec = typeof t === 'string' ? (['wantedly', 'prtimes'].includes(sid) ? { keyword: t } : { url: t }) : t;
    const q = { category: cat, limit, pages: 2, ...spec };
    try {
      await SOURCES[sid].discover(q, ctx);
    } catch (e) {
      log(`  ! ${site.name} ${spec.url ?? spec.keyword}: ${e.message}`);
    }
    store.save();
  }
  return true;
}

/** そのカテゴリで「判定OK」の会社数 */
function okCount(cat) {
  const label = CATEGORIES[cat].label;
  return store.all().filter((c) => {
    // そのカテゴリの一覧・検索で見つけた会社だけを数える（他カテゴリで見つけた会社で目標を満たし、その媒体を見ずに終わるのを防ぐ）
    if (!c.seedCategories.includes(cat)) return false;
    const r = consolidate(c, { minEmployees });
    const max = CATEGORIES[cat].maxEmployees; // 例: 広告代理店は「ベンチャー・中堅」= 2,000名以下
    if (max && r.employees != null && r.employees > max) return false;
    return r.status === 'OK' && r.categories.includes(label);
  }).length;
}

async function discover() {
  const target = Number(opt.target);
  const limit = Number(opt['per-query']);
  const only = opt.sources ? opt.sources.split(',') : null;
  const ctx = { crawler, log, minEmployees, upsert: (n) => store.upsert(n) };
  for (const cat of opt.categories.split(',')) {
    const def = CATEGORIES[cat];
    if (!def) throw new Error(`unknown category ${cat}`);
    log(`# ${def.label} (目標 ${target}社)`);
    for (const sid of ORDER[cat]) {
      if (only && !only.includes(sid)) continue;
      if (!(await discoverSource(cat, sid, limit, ctx))) continue;
      const n = qualified(cat);
      log(`  → ${SITES[sid].name} まで: 該当 ${n}/${target}社`);
      if (n >= target) {
        log(`  ✔ 目標達成のため ${def.label} の以降の媒体は見ません`);
        break;
      }
    }
  }
  store.mergeByDomain();
  store.save();
}

/** サンプル作成: 媒体ごとに 発見 → 補完 → 「判定OK」件数を数え、目標(--ok)に達したらそのカテゴリを終える */
async function sample() {
  const okTarget = Number(opt.ok);
  const only = opt.sources ? opt.sources.split(',') : null;
  const limit = Number(opt['per-query']);
  const ctx = { crawler, log, minEmployees, upsert: (n) => store.upsert(n) };
  for (const cat of opt.categories.split(',')) {
    const def = CATEGORIES[cat];
    if (!def) throw new Error(`unknown category ${cat}`);
    log(`# ${def.label}: 判定OKを ${okTarget} 件作る (現在 ${okCount(cat)} 件)`);
    for (const sid of ORDER[cat]) {
      if (okCount(cat) >= okTarget) break;
      if (only && !only.includes(sid)) continue;
      if (!(await discoverSource(cat, sid, limit, ctx))) continue;
      store.mergeByDomain();
      store.save();
      await enrich();
      log(`  → ${SITES[sid].name} まで: 判定OK ${okCount(cat)}/${okTarget}件`);
    }
    log(`# ${def.label}: ${okCount(cat) >= okTarget ? '目標達成' : '全媒体を見ても目標に届かず'} (判定OK ${okCount(cat)}件)`);
  }
}

async function enrich() {
  // 1) SalesNow の索引で、公式URLまたは従業員数が足りない会社を補完
  const needs = (c) => !c.officialUrl || !c.evidence.some((e) => e.field === 'employees');
  const lacking = store.all().filter((c) => needs(c) && !c.evidence.some((e) => e.source === 'salesnow'));
  if (lacking.length) {
    log(`# SalesNow で補完: ${lacking.length} 社（索引を作成）`);
    const index = await salesnow.buildIndex(SALESNOW_INDEX_URLS, { crawler, log, maxPages: Number(opt['salesnow-pages']) });
    let n = 0;
    for (const c of lacking) if (await salesnow.enrichFromIndex(c, index, { crawler, log })) n++;
    log(`  → ${n}/${lacking.length} 社が一致`);
    store.mergeByDomain();
    store.save();
  }
  // 1b) まだ公式URLが無い会社は PR TIMES の企業ページ(会社名が完全一致した場合のみ)で解決
  // 公式URLが無い、または製品ページ系の媒体由来のみ(本体サイトでない可能性)の会社が対象
  const noUrl = store.all().filter((c) => (!c.officialUrl || needsCorporateUrl(c)) && !c.evidence.some((e) => e.source === 'prtimes'));
  if (noUrl.length) {
    log(`# PR TIMES で公式URLを解決: ${noUrl.length} 社`);
    let n = 0;
    for (const c of noUrl) if (await prtimes.resolve(c, { crawler, log })) n++;
    log(`  → ${n}/${noUrl.length} 社の公式URLを解決`);
    store.mergeByDomain();
    store.save();
  }
  // 2) 公式サイトを巡回（従業員数・住所・問い合わせURL）
  // 公式URLの採用が変わった会社は、以前のサイト由来の情報を破棄して取り直す
  for (const c of store.all()) {
    const best = bestOfficial(c);
    const bestUrl = best && typeof best === 'object' ? best.url : c.officialUrl;
    const crawled = c.sources.find((s) => s.source === 'official');
    if (bestUrl && crawled && domainOf(crawled.url) !== domainOf(bestUrl)) {
      c.evidence = c.evidence.filter((e) => e.source !== 'official');
      c.sources = c.sources.filter((s) => s.source !== 'official');
    }
  }
  const targets = store.all().filter((c) => (c.officialUrl || bestOfficial(c)) && !c.evidence.some((e) => e.source === 'official'));
  log(`# 公式サイト補完: ${targets.length} 社`);
  for (const c of targets) {
    log(`  official ${c.name} ${c.officialUrl}`);
    await enrichFromOfficial(c, { crawler, log });
    store.save();
  }
  // 3) Gビズインフォ(経産省)で会社名検索。公式サイト等で住所が分かった後に引くことで、同名の別会社の取り違えを減らす
  const gb = store.all().filter((c) => !c.evidence.some((e) => e.field === 'employees') && !c.evidence.some((e) => e.source === 'gbizinfo') && !c.noGbiz);
  if (gb.length) {
    log(`# Gビズインフォで補完: ${gb.length} 社`);
    let n = 0;
    for (const c of gb) {
      const r = await gbizinfo.lookup(c, { crawler, log });
      if (r === true) n++;
      else if (r === false) c.noGbiz = true; // 検索したが一致なし → 再検索しない（エラー時は印を付けず再試行できる）
      store.save();
    }
    log(`  → ${n}/${gb.length} 社が一致`);
  }
  // 4) まだ従業員数が無い会社は マイナビ(新卒)の会社名検索で補完（新卒採用をしている会社のみ掲載）
  const mn = store.all().filter((c) => !c.evidence.some((e) => e.field === 'employees') && !c.evidence.some((e) => e.source === 'mynavi') && !c.noMynavi);
  if (mn.length) {
    log(`# マイナビ(新卒)で補完: ${mn.length} 社`);
    let n = 0;
    for (const c of mn) {
      const r = await mynavi.lookup(c, { crawler, log });
      if (r === true) n++;
      else if (r === false) c.noMynavi = true;
      store.save();
    }
    log(`  → ${n}/${mn.length} 社が一致`);
  }
}

try {
  if (cmd === 'robots') {
    await crawler.launch();
    const rows = await robotsReport(crawler);
    for (const r of rows) {
      const bad = r.checks.filter((c) => !c.allowed);
      console.log(`${r.status}\t${r.site}\t規則(*)${r.starRules}件\t${bad.length ? '禁止: ' + bad.map((b) => new URL(b.url).pathname).join(' ') : '使用URLは許可'}`);
    }
    process.exit(0);
  }
  if (cmd !== 'export') await crawler.launch();
  if (cmd === 'discover' || cmd === 'run') await discover();
  if (cmd === 'sample') await sample();
  if (cmd === 'enrich' || cmd === 'run') await enrich();
  const rows = exportAll(store.all(), { minEmployees });
  const sm = exportSample(store.all(), { minEmployees });
  log('# サンプル(data/sample.csv):', JSON.stringify(sm.summary));
  const n = (s) => rows.filter((r) => r.status === s).length;
  log(`# 完了: 全${rows.length}社 / OK ${n('OK')} / 要確認 ${n('要確認')} / 除外 ${n('除外')}  → data/companies.csv`);
  log('# 通信:', JSON.stringify(crawler.stats));
} finally {
  await crawler.close();
}
