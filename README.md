# company-site-crawl

東京都内の「化粧品D2C/P2C・インフルエンサー事務所・広告代理店・SNS運用代行」企業を、
求人媒体・比較サイトと公式サイトから収集する、**個人利用向け**のヘッドレスChrome(Puppeteer)クローラー。

複数サイトの情報を**合体**し、1つの媒体で足りない項目を他の媒体・公式サイトで補う。

## 使い方

```bash
npm install                      # Chromium が未導入の環境では CHROME_PATH を指定
npm test                         # 抽出ロジックの単体テスト
node src/cli.js run --target 8   # 優先順位どおりに発見 → 公式サイト補完 → CSV出力
```

| コマンド | 内容 |
|---|---|
| `discover` | Green / Wantedly / アイミツから企業候補を収集 |
| `enrich`   | 公式サイトを巡回し、従業員数・住所・問い合わせURLを補完 |
| `export`   | 統合して `data/companies.csv` を出力（サイトにアクセスしない） |
| `run`      | 上記を一括実行 |

オプション: `--target N`(カテゴリごとの目標社数。達したらそのカテゴリは以降の媒体を見ない) / `--per-query N`(1一覧あたりの最大取得社数) / `--sources green,wantedly,imitsu` /
`--categories cosme_d2c,influencer_agency,ad_agency,sns_agency` / `--delay ms` / `--no-cache`

環境変数: `CHROME_PATH`（Chromeの場所）、`NO_SANDBOX=1`（root実行時は自動で付与）

## 出力

- `data/companies.csv` … Excel/スプレッドシートで開ける（BOM付きUTF-8）
- `data/companies.report.json` … 根拠(evidence)つきの詳細
- `data/companies.json` … 生の蓄積データ（中断しても続きから再開できる）

### 判定

| 判定 | 意味 |
|---|---|
| OK | 公式URL・東京都本社・20名以上・カテゴリ該当・問い合わせURL がすべて確認できた |
| 要確認 | 除外ではないが、不足項目がある（`不足項目` 列に列挙） |
| 除外 | 東京都外、または従業員数が20名未満と確認できた |

## 媒体の優先順位

`config/categories.js` の `ORDER` に、カテゴリごとの媒体を優先順に並べてある。上から順に見ていき、
そのカテゴリに該当する企業が `--target` 社に達したら打ち切る。`SITES` で各媒体の状態を管理する
（`ready` 実装済み / `todo` 未実装 / `blocked` 遮断されるためスキップ）。

## データの統合（合体）ルール

同じ会社は**会社名の正規化**（法人格・空白・記号を除去）と**公式ドメイン**で名寄せする。
項目ごとに情報源の優先順位を決め、上位の証拠を採用する（`src/lib/merge.js`）。

| 項目 | 優先順位 |
|---|---|
| 従業員数 | 公式サイト > Green > (アイミツ) > (Wantedly) |
| 本社所在地 | 公式サイト > Green > Wantedly > アイミツ |
| 公式URL | アイミツ・Wantedly の掲載値 |
| 問い合わせURL | 公式サイトのリンクから検出 |
| カテゴリ | 全情報源のテキストをキーワード判定（`config/categories.js`） |

- 情報源間で値が食い違う場合は `備考` 列に出す（例: 従業員数の不一致）
- Wantedly の「メンバー数」は登録ユーザー数で従業員数とは別物のため、**判定には使わず参考表示のみ**

## マナー・制約

- **robots.txt を尊重**する（`src/lib/robots.js`）。禁止されたURLには行かない
  - 例: Green は検索(`/search?`)が禁止のため、許可されている「業界×東京」一覧ページを使う
- 同一ホストへは最低2.5秒の間隔をあける。取得結果は `data/cache/` に保存し、再実行時は再アクセスしない
- ボット対策（Cloudflare等）の回避やステルス化は**しない**。遮断されたサイトは対象外
  - BIZMAPS / Indeed は遮断されるため未対応（自宅回線だと通る場合あり）
- 各サイトの利用規約は利用者自身で確認すること。取得データは個人利用の範囲で使うこと

## 構成

```
config/categories.js   カテゴリ定義（判定キーワード・媒体ごとの検索条件）
src/cli.js             CLI
src/sources/*.js       媒体アダプタ（green / wantedly / imitsu）… discover(query, ctx)
src/enrich.js          公式サイト巡回（会社概要・問い合わせリンクの検出）
src/lib/crawler.js     ヘッドレスChrome（レート制御・robots・キャッシュ）
src/lib/extract.js     従業員数・住所・リンク抽出（純関数）
src/lib/merge.js       情報源の統合・判定
src/lib/classify.js    カテゴリ判定
test/                  単体テスト
```

媒体を追加するには `src/sources/` に `discover(q, ctx)` を持つファイルを足し、`src/cli.js` の `SOURCES` と
`config/categories.js` に登録する。
