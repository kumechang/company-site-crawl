import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import puppeteer from 'puppeteer';
import { sleep, originOf, log } from './util.js';
import { parseRobots, isAllowed } from './robots.js';

export class RobotsDisallowed extends Error {}
export class HostTripped extends Error {}
export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} ${url}`);
    this.status = status;
  }
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try {
    const p = puppeteer.executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch {}
  // Playwright 配布の Chromium (クラウド環境用)
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (fs.existsSync(base)) {
    for (const d of fs.readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
      const c = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(c)) return c;
    }
  }
  return undefined; // puppeteer に任せる
}

/**
 * 1ページを {url, status, title, text, anchors[]} のスナップショットにして返す。
 * - 同一ホストへのアクセス間隔を minDelayMs 以上あける
 * - robots.txt (User-agent: *) を尊重する
 * - 結果は cacheDir に保存（パーサ調整時にサイトへ再アクセスしないため）
 */
export class Crawler {
  constructor({ cacheDir = 'data/cache', robotsDir = 'data/robots', minDelayMs = 2500, timeoutMs = 45000, useCache = true, respectRobots = true } = {}) {
    Object.assign(this, { cacheDir, robotsDir, minDelayMs, timeoutMs, useCache, respectRobots });
    this.browser = null;
    this.ua = null;
    this.lastHit = new Map(); // host -> timestamp
    this.denials = new Map(); // host -> 連続して拒否(403/405/429)された回数
    this.tripped = new Set(); // 連続拒否で、この実行中はアクセスを止めたホスト
    this.robots = new Map(); // origin -> groups
    this.stats = { fetched: 0, cached: 0, blocked: 0, failed: 0 };
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  async launch() {
    const args = ['--lang=ja-JP'];
    if (process.getuid?.() === 0 || process.env.NO_SANDBOX) args.push('--no-sandbox');
    this.browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args });
    // 既定UAの "HeadlessChrome" を通常の表記にするだけ（指紋偽装等はしない）
    this.ua = (await this.browser.userAgent()).replace('HeadlessChrome', 'Chrome');
    return this;
  }

  async close() {
    await this.browser?.close();
  }

  cachePath(url) {
    const h = crypto.createHash('sha1').update(url).digest('hex');
    return path.join(this.cacheDir, h.slice(0, 2), h + '.json');
  }

  async throttle(url) {
    const host = new URL(url).host;
    const wait = (this.lastHit.get(host) ?? 0) + this.minDelayMs + Math.random() * 800 - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastHit.set(host, Date.now());
  }

  async rawPage(url, fn) {
    const page = await this.browser.newPage();
    try {
      await page.setUserAgent(this.ua);
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja,en;q=0.8' });
      await page.setViewport({ width: 1366, height: 900 });
      await page.setRequestInterception(true);
      page.on('request', (req) => (['image', 'media', 'font'].includes(req.resourceType()) ? req.abort() : req.continue()));
      return await fn(page);
    } finally {
      await page.close();
    }
  }

  /** robots.txt を取得して data/robots/<host>.json に記録する。status: 取得結果(HTTP番号 or 'error') */
  async fetchRobots(origin) {
    let rec = { origin, fetchedAt: new Date().toISOString(), status: 'error', text: '' };
    try {
      await this.throttle(origin + '/robots.txt');
      rec = await this.rawPage(origin + '/robots.txt', async (page) => {
        await page.setCacheEnabled(false); // 再取得時に 304(本文なし) を受けて「読めない」と誤判定しないため
        const r = await page.goto(origin + '/robots.txt', { waitUntil: 'domcontentloaded', timeout: 20000 });
        const status = r?.status() ?? 0;
        const text = status < 400 ? await page.evaluate(() => document.body?.innerText ?? '') : '';
        return { origin, fetchedAt: rec.fetchedAt, status, text };
      });
    } catch (e) {
      rec.error = e.message.split('\n')[0];
    }
    try {
      fs.mkdirSync(this.robotsDir, { recursive: true });
      fs.writeFileSync(path.join(this.robotsDir, new URL(origin).host + '.json'), JSON.stringify(rec, null, 1));
    } catch {}
    return rec;
  }

  /**
   * robots.txt の扱い:
   *  - 2xx          … 内容に従う
   *  - 404 / 410    … 制限なし（robots.txt が存在しない）
   *  - それ以外(401/403/429/5xx/接続失敗) … 判断できないので【アクセスしない】（保守的）
   */
  async checkRobots(url) {
    if (!this.respectRobots) return true;
    const origin = originOf(url);
    if (!this.robots.has(origin)) {
      const rec = await this.fetchRobots(origin);
      let policy;
      if (rec.status >= 200 && rec.status < 300) policy = { groups: parseRobots(rec.text) };
      else if (rec.status === 404 || rec.status === 410) policy = { groups: [] };
      else policy = { denyAll: true, reason: `robots.txt を取得できない(${rec.status}${rec.error ? ' ' + rec.error : ''})` };
      this.robots.set(origin, policy);
    }
    const pol = this.robots.get(origin);
    if (pol.denyAll) return false;
    const u = new URL(url);
    return isAllowed(pol.groups, u.pathname + u.search);
  }

  /**
   * @param {object} opts
   * @param {boolean} [opts.scroll] 遅延読み込み対策で下までスクロール
   * @param {number}  [opts.settleMs] 読み込み後に追加で待つ時間(SPAの結果差し替え対策)
   * @param {string}  [opts.waitForText] この文字列が現れるまで待つ(SPA用)
   */
  async snapshot(url, { scroll = false, waitForText = null, settleMs = 0, retries = 2 } = {}) {
    const cp = this.cachePath(url);
    const host = new URL(url).host;
    if (this.useCache && fs.existsSync(cp)) {
      this.stats.cached++;
      return JSON.parse(fs.readFileSync(cp, 'utf8'));
    }
    if (!(await this.checkRobots(url))) {
      this.stats.blocked++;
      throw new RobotsDisallowed(`robots.txt disallows ${url}`);
    }
    if (this.tripped.has(host)) throw new HostTripped(`${host} は連続して拒否されたため、この実行中はアクセスしません`);
    let lastErr;
    for (let i = 0; i <= retries; i++) {
      try {
        await this.throttle(url);
        const snap = await this.rawPage(url, async (page) => {
          const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.timeoutMs });
          await page.waitForNetworkIdle({ idleTime: 800, timeout: 12000 }).catch(() => {}); // 描画が落ち着くまで(上限あり)
          if (settleMs) await sleep(settleMs); // クライアント側で一覧が差し替わるSPA向け
          if (waitForText) await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 10000 }, waitForText).catch(() => {});
          if (scroll) {
            for (let k = 0; k < 4; k++) {
              await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
              await sleep(600);
            }
          }
          const status = res?.status() ?? 0;
          if (status >= 400) throw new HttpError(status, url);
          const data = await page.evaluate(() => ({
            title: document.title,
            text: document.body?.innerText ?? '',
            anchors: [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.href, text: (a.innerText || a.textContent || '').trim() })),
            jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent).slice(0, 5),
            finalUrl: location.href,
          }));
          return { ...data, status };
        });
        const out = { url, fetchedAt: new Date().toISOString(), ...snap };
        this.denials.set(host, 0);
        this.stats.fetched++;
        fs.mkdirSync(path.dirname(cp), { recursive: true });
        fs.writeFileSync(cp, JSON.stringify(out));
        return out;
      } catch (e) {
        lastErr = e;
        // 403/404 等は再試行しない。400/429 は一部サイトが間欠的に返す(アクセス制限)ため上限付きで再試行する
        if (e instanceof HttpError && e.status < 500 && ![400, 429].includes(e.status)) break;
        log(`  retry ${i + 1}: ${url} (${e.message.split('\n')[0]})`);
        await sleep(e instanceof HttpError ? 6000 * (i + 1) : 2000 * (i + 1));
      }
    }
    if (lastErr instanceof HttpError && [403, 405, 429].includes(lastErr.status)) {
      const n = (this.denials.get(host) ?? 0) + 1;
      this.denials.set(host, n);
      if (n >= 3 && !this.tripped.has(host)) {
        this.tripped.add(host);
        log(`  !! ${host}: ${n}回連続で拒否(HTTP ${lastErr.status})されたため、この実行中はこのサイトへのアクセスを止めます`);
      }
    }
    this.stats.failed++;
    throw lastErr;
  }
}
