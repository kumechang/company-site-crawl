#!/usr/bin/env bash
# GitHub Actions 用: クローラーを回しつつ、一定間隔で収集データを専用ブランチ(crawl-data)に退避する。
# 使い方: scripts/ci-crawl.sh "<cli.js に渡す引数>"
set -uo pipefail
ARGS="${1:?cli.js の引数を渡す}"
LIMIT_MIN="${LIMIT_MIN:-320}"      # ジョブの上限(6時間)より手前で止める
SNAP_MIN="${SNAP_MIN:-15}"         # 退避の間隔
# shellcheck source=scripts/ci-data.sh
source "$(dirname "$0")/ci-data.sh"

data_restore
# 人の確認があれば、最初に取り込む（判断・修正が検証と合格件数に反映される）
[ -f data/review_input.csv ] && node src/cli.js import-review

# shellcheck disable=SC2086
node src/cli.js $ARGS &
PID=$!
START=$(date +%s)
while kill -0 "$PID" 2>/dev/null; do
  for _ in $(seq 1 $((SNAP_MIN * 6))); do kill -0 "$PID" 2>/dev/null || break; sleep 10; done
  data_snapshot
  if [ $(( ($(date +%s) - START) / 60 )) -ge "$LIMIT_MIN" ]; then
    echo "時間上限($LIMIT_MIN分)に達したので止める。続きは次回の実行で再開される"
    kill -TERM "$PID" 2>/dev/null; sleep 20; kill -KILL "$PID" 2>/dev/null || true
    break
  fi
done
wait "$PID" 2>/dev/null || true
data_snapshot
