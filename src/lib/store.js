import fs from 'node:fs';
import path from 'node:path';
import { newCompany } from './model.js';
import { normalizeName, domainOf } from './util.js';

/** data/companies.json に企業を保持。会社名キーで突合し、公式ドメインが同じなら同一企業として統合 */
export class Store {
  constructor(file = 'data/companies.json') {
    this.file = file;
    this.map = new Map();
    if (fs.existsSync(file)) for (const c of JSON.parse(fs.readFileSync(file, 'utf8'))) this.map.set(c.key, c);
  }

  upsert(name) {
    const clean = name.replace(/\s+/g, ' ').trim();
    const key = normalizeName(clean);
    if (!this.map.has(key)) this.map.set(key, newCompany(clean));
    return this.map.get(key);
  }

  /** 公式ドメインが同じで会社名表記が違うレコード（例: 「A社」と「株式会社A」以外の表記ゆれ）を統合 */
  mergeByDomain() {
    const byDomain = new Map();
    for (const c of [...this.map.values()]) {
      const d = c.domain ?? domainOf(c.officialUrl);
      if (!d) continue;
      const first = byDomain.get(d);
      if (!first) {
        byDomain.set(d, c);
        continue;
      }
      first.evidence.push(...c.evidence);
      first.sources.push(...c.sources.filter((s) => !first.sources.some((x) => x.url === s.url)));
      first.seedCategories.push(...c.seedCategories);
      this.map.delete(c.key);
    }
  }

  all() {
    return [...this.map.values()];
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.all(), null, 1));
  }
}
