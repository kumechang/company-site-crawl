import { nfkc } from './util.js';
import { CATEGORIES } from '../../config/categories.js';

/** テキストからカテゴリ判定。matched keywords を根拠として返す */
export function classify(text) {
  const t = nfkc(text ?? '').toLowerCase();
  const has = (kw) => t.includes(nfkc(kw).toLowerCase());
  const out = [];
  for (const [key, def] of Object.entries(CATEGORIES)) {
    let hits = [];
    if (def.match.any) {
      hits = def.match.any.filter(has);
      if (hits.length) out.push({ category: key, label: def.label, keywords: hits });
    } else if (def.match.all) {
      const groups = def.match.all.map((g) => g.filter(has));
      if (groups.every((g) => g.length)) out.push({ category: key, label: def.label, keywords: groups.flat() });
    }
  }
  return out;
}
