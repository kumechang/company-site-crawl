#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { Crawler } from './lib/crawler.js';
import { Store } from './lib/store.js';
import { log } from './lib/util.js';
import { CATEGORIES } from '../config/categories.js';
import { enrichFromOfficial } from './enrich.js';
import { exportAll } from './export.js';
import * as green from './sources/green.js';
import * as wantedly from './sources/wantedly.js';
import * as imitsu from './sources/imitsu.js';

const SOURCES = { green, wantedly, imitsu };

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'per-category': { type: 'string', default: '8' }, // 1クエリあたりの取得社数
    sources: { type: 'string', default: 'green,wantedly,imitsu' },
    categories: { type: 'string', default: Object.keys(CATEGORIES).join(',') },
    delay: { type: 'string', default: '2500' }, // 同一ホストへの最小アクセス間隔(ms)
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
オプション: --per-category N  --sources green,wantedly,imitsu  --categories cosme_d2c,...  --delay ms  --no-cache`;

const cmd = positionals[0];
if (!cmd || opt.help || !['discover', 'enrich', 'export', 'run'].includes(cmd)) {
  console.log(HELP);
  process.exit(cmd ? 0 : 1);
}

const minEmployees = Number(opt['min-employees']);
const store = new Store();
const crawler = new Crawler({ minDelayMs: Number(opt.delay), useCache: !opt['no-cache'] });

async function discover() {
  const limit = Number(opt['per-category']);
  const ctx = { crawler, log, minEmployees, upsert: (n) => store.upsert(n) };
  for (const cat of opt.categories.split(',')) {
    const def = CATEGORIES[cat];
    if (!def) throw new Error(`unknown category ${cat}`);
    log(`# ${def.label}`);
    for (const sid of opt.sources.split(',')) {
      for (const target of def[sid] ?? []) {
        const q = sid === 'wantedly' ? { category: cat, keyword: target, limit } : { category: cat, url: target, limit };
        try {
          await SOURCES[sid].discover(q, ctx);
        } catch (e) {
          log(`  ! ${sid} ${target}: ${e.message}`);
        }
        store.save();
      }
    }
  }
  store.mergeByDomain();
  store.save();
}

async function enrich() {
  const targets = store.all().filter((c) => c.officialUrl && !c.evidence.some((e) => e.source === 'official'));
  log(`# 公式サイト補完: ${targets.length} 社`);
  for (const c of targets) {
    log(`  official ${c.name} ${c.officialUrl}`);
    await enrichFromOfficial(c, { crawler, log });
    store.save();
  }
}

try {
  if (cmd !== 'export') await crawler.launch();
  if (cmd === 'discover' || cmd === 'run') await discover();
  if (cmd === 'enrich' || cmd === 'run') await enrich();
  const rows = exportAll(store.all(), { minEmployees });
  const n = (s) => rows.filter((r) => r.status === s).length;
  log(`# 完了: 全${rows.length}社 / OK ${n('OK')} / 要確認 ${n('要確認')} / 除外 ${n('除外')}  → data/companies.csv`);
  log('# 通信:', JSON.stringify(crawler.stats));
} finally {
  await crawler.close();
}
