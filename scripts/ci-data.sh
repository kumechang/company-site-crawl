#!/usr/bin/env bash
# GitHub Actions 用: 収集データ(companies.json・progress.json・robots記録)を専用ブランチ(crawl-data)に退避・復元する。
# 実行したブランチ(main等)には書き込まない。他のコミットとの衝突(rebase競合)が起きず、複数回の実行で続きから処理できる。
# 使い方: source scripts/ci-data.sh; data_restore  /  data_snapshot
DATA_BRANCH="${DATA_BRANCH:-crawl-data}"
DATA_WT="${RUNNER_TEMP:-/tmp}/crawl-data-wt"
DATA_FILES=(data/companies.json data/progress.json)

data_init() {
  rm -rf "$DATA_WT"
  git worktree prune
  if git fetch -q origin "$DATA_BRANCH" 2>/dev/null; then
    git worktree add -q -B "$DATA_BRANCH" "$DATA_WT" "origin/$DATA_BRANCH"
  else
    # 初回: 履歴を持たない専用ブランチを作る
    git worktree add -q --detach "$DATA_WT"
    (cd "$DATA_WT" && git checkout -q --orphan "$DATA_BRANCH" && git rm -rfq . >/dev/null 2>&1 || true)
  fi
}

# 前回までのデータを data/ に戻す（専用ブランチがあればそれを優先。無ければ、チェックアウトしたブランチのデータで始める）
data_restore() {
  data_init
  mkdir -p data/robots
  for f in "${DATA_FILES[@]}"; do [ -f "$DATA_WT/$f" ] && cp "$DATA_WT/$f" "$f"; done
  [ -d "$DATA_WT/data/robots" ] && cp -r "$DATA_WT/data/robots/." data/robots/
  # EDINETの書類一覧・コード一覧のキャッシュ（毎回取り直すと数分かかるため引き継ぐ）
  if [ -d "$DATA_WT/data/cache/edinet" ]; then mkdir -p data/cache/edinet; cp -r "$DATA_WT/data/cache/edinet/." data/cache/edinet/; fi
  echo "データを復元: $(ls "$DATA_WT"/data 2>/dev/null | tr '\n' ' ')"
  return 0
}

# 現在のデータを専用ブランチにコミット・push する（失敗しても処理は止めない）
data_snapshot() {
  [ -d "$DATA_WT" ] || data_init
  mkdir -p "$DATA_WT/data/robots"
  for f in "${DATA_FILES[@]}"; do [ -f "$f" ] && cp "$f" "$DATA_WT/$f"; done
  [ -d data/robots ] && cp -r data/robots/. "$DATA_WT/data/robots/"
  if [ -d data/cache/edinet ]; then mkdir -p "$DATA_WT/data/cache/edinet"; cp -r data/cache/edinet/. "$DATA_WT/data/cache/edinet/"; fi
  (
    cd "$DATA_WT" || exit 0
    git add -A
    git diff --cached --quiet && exit 0
    git commit -qm "crawl data snapshot $(date -u +%FT%TZ)"
    for i in 1 2 3; do git push -q -f origin "HEAD:$DATA_BRANCH" && exit 0; sleep 5; done
    echo "データの退避に失敗（次の機会に再試行）"
  )
  return 0
}
