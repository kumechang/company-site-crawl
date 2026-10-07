#!/usr/bin/env bash
# GitHub Actions 用: クローラーを回しつつ、一定間隔で companies.json と robots 記録をブランチに退避する。
# 使い方: scripts/ci-crawl.sh "<cli.js に渡す引数>"
set -uo pipefail
ARGS="${1:?cli.js の引数を渡す}"
LIMIT_MIN="${LIMIT_MIN:-320}"      # ジョブの上限(6時間)より手前で止める
SNAP_MIN="${SNAP_MIN:-15}"         # 退避の間隔
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

snapshot() {
  git add -f data/companies.json 2>/dev/null || true
  git add data/robots 2>/dev/null || true
  if ! git diff --cached --quiet; then
    git commit -qm "CI snapshot: companies.json and robots.txt records" || return 0
    for i in 1 2 3; do git pull -q --rebase origin "$BRANCH" && git push -q origin "HEAD:$BRANCH" && return 0; sleep 5; done
  fi
}

# shellcheck disable=SC2086
node src/cli.js $ARGS &
PID=$!
START=$(date +%s)
while kill -0 "$PID" 2>/dev/null; do
  for _ in $(seq 1 $((SNAP_MIN * 6))); do kill -0 "$PID" 2>/dev/null || break; sleep 10; done
  snapshot
  if [ $(( ($(date +%s) - START) / 60 )) -ge "$LIMIT_MIN" ]; then
    echo "時間上限($LIMIT_MIN分)に達したので止める。続きは次回の実行で再開される"
    kill -TERM "$PID" 2>/dev/null; sleep 20; kill -KILL "$PID" 2>/dev/null || true
    break
  fi
done
wait "$PID" 2>/dev/null || true
snapshot
