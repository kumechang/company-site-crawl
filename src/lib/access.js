/** サイトに接続できなかった(robots.txtが取れない・403/429/5xx・タイムアウト等)エラーか。robots.txtの明示的な禁止や404は含めない */
export function isAccessFailure(e) {
  const m = String(e?.message ?? '');
  if (/robots\.txt disallows/.test(m)) return false;
  if (/robots\.txt を取得できない|連続して拒否/.test(m)) return true;
  if (e?.status) return e.status === 401 || e.status === 403 || e.status === 429 || e.status >= 500;
  return /timeout|net::|ERR_|ECONN|ENOTFOUND|ETIMEDOUT|Navigation|Connection closed|Target closed/i.test(m);
}

/** プロキシ経由で動かしているか（cli が起動時に設定する）。出口IPが変わるので、実行環境の種別に含める */
let proxied = false;
export const setProxied = (v) => { proxied = !!v; };

/** 実行環境の種別（接続失敗が環境依存かどうかの判断用。GitHub Actions のIPは一部サイトに弾かれる） */
export const runEnv = () => (process.env.GITHUB_ACTIONS ? 'actions' : 'local') + (proxied ? '+proxy' : '');
