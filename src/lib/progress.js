import fs from 'node:fs';
import path from 'node:path';

/**
 * 発見(一覧の取得)の進捗。カテゴリ × 媒体 × 一覧(URL/キーワード) ごとに「どこまで見たか・失敗したか」を data/progress.json に残し、
 * 次の実行は先頭からではなく続きから見る（先頭だけを何度も見ても件数は増えないため）。
 *
 * レコード: { nextPage, offset, found, exhausted, failures, lastError, failedAt, lastAt, runs }
 *   nextPage  ページ送りする媒体の、次に見るページ
 *   offset    1ページ完結の一覧(件数で打ち切る媒体)の、次に見る位置
 *   found     これまでに見つけた会社数(のべ)
 *   exhausted 最後まで見た（次の実行では飛ばす。--refresh で取り直す）
 *   failures  連続失敗回数 / lastError 最後のエラー / failedAt その日時
 */
export const FAIL_COOLDOWN_MS = 24 * 3600 * 1000;
export const FAIL_SKIP_AFTER = 2; // 連続でこれだけ失敗したら、クールダウンの間は飛ばす

export const progressKey = (cat, sid, spec) => `${cat}|${sid}|${spec.url ?? spec.keyword ?? JSON.stringify(spec)}`;

/** 今回の実行結果 { found, errors[], lastPage, paged } を、前回のレコードに反映して新しいレコードを返す（純関数） */
export function applyRun(prev, { found, errors = [], lastPage = null, paged = false }, now = new Date()) {
  const p = { nextPage: 1, offset: 0, found: 0, exhausted: false, failures: 0, lastError: null, failedAt: null, runs: 0, ...prev };
  p.runs += 1;
  p.lastAt = now.toISOString();
  if (errors.length && found === 0) {
    // 1社も取れず、エラーがあった = 失敗。位置は進めず、同じ所から再試行できるようにする
    p.failures += 1;
    p.lastError = errors[0].replace(/^\s*!\s*/, '').slice(0, 200);
    p.failedAt = p.lastAt;
    return p;
  }
  if (found === 0 && !errors.length && p.found === 0 && p.nextPage === 1 && p.offset === 0) {
    // 最初の位置から1社も取れず、エラーも出ていない = 取得側の不具合(ページ構造の変更・ブロック画面など)か、空の一覧。成功扱い(=最後まで見た)にしない
    p.failures += 1;
    p.lastError = '一覧から1社も取れなかった（ページ構造の変更・遮断画面・空の一覧のいずれか）';
    p.failedAt = p.lastAt;
    return p;
  }
  p.failures = 0;
  p.lastError = errors[0] ? errors[0].replace(/^\s*!\s*/, '').slice(0, 200) : null; // 一部だけ失敗した場合も残す
  p.failedAt = null;
  if (found === 0) {
    p.exhausted = true; // エラー無しで1社も出なかった = 最後まで見た
    return p;
  }
  p.found += found;
  if (paged && lastPage != null) p.nextPage = lastPage + 1;
  else p.offset += found;
  return p;
}

/** 今回は飛ばすか: 'exhausted'(最後まで見た) / 'failing'(直近で連続失敗) / null(見る) */
export function shouldSkip(rec, { refresh = false, retryFailed = false } = {}, now = new Date()) {
  if (!rec) return null;
  if (rec.exhausted && !refresh) return 'exhausted';
  if (!retryFailed && rec.failures >= FAIL_SKIP_AFTER && rec.failedAt && now - new Date(rec.failedAt) < FAIL_COOLDOWN_MS) return 'failing';
  return null;
}

export class Progress {
  constructor(file = 'data/progress.json') {
    this.file = file;
    this.map = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  }

  get(key) {
    return this.map[key];
  }

  set(key, rec) {
    this.map[key] = rec;
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.map, null, 1));
  }
}
