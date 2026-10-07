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
| 従業員数 | 有価証券報告書(EDINET) > 公式サイト > Green > (アイミツ) > (Wantedly) |
| 本社所在地 | 有価証券報告書(EDINET) > 公式サイト > Green > Wantedly > アイミツ |
| 公式URL | アイミツ・Wantedly の掲載値 |
| 問い合わせURL | 公式サイトのリンクから検出 |
| カテゴリ | 全情報源のテキストをキーワード判定（`config/categories.js`） |

- 情報源間で値が食い違う場合は `備考` 列に出す（例: 従業員数の不一致）
- Wantedly の「メンバー数」は登録ユーザー数で従業員数とは別物のため、**判定には使わず参考表示のみ**

## EDINET（有価証券報告書）

上場会社など有価証券報告書を提出している会社は、**EDINET API v2**（金融庁）から従業員数と本店所在地を一次情報で取る（`src/sources/edinet.js`）。
`enrich`（`run` / `sample` に含まれる）で、公式サイト巡回のあと・Gビズインフォの前に実行される。

```bash
export EDINET_API_KEY=...        # 必須。無ければこの補完は飛ばす（キーはログ・キャッシュ・エラー文に出さない）
node src/cli.js enrich
```

1. EDINETコード一覧（CSV）で会社名と既知の所在地（市区町村）から EDINETコード を特定。同名が複数で絞れなければ採用しない。所在地が未確認で同名が1社だけのときは社名のみ一致として採用し、根拠に明記する
2. 書類一覧API（日付ごと・直近約13か月・土日は除く）から、そのコードの最新の有価証券報告書（様式030000）を探す。初回は約290リクエスト（数分）、以降は日付ごとにキャッシュ（`data/cache/edinet/`）して差分だけ取得
3. 書類の XBRL→CSV から `jpcrp_cor:NumberOfEmployees`（当期末）を読む。**提出会社単体**があればそれを採用し、連結の値は備考に出す。連結しか無い会社は「連結」と注記して確認済みにしない

- 有報の従業員数は、従業員数の優先順位の先頭（`PRIORITY.employees`）。決算期末の時点つきで、第三者サイトの推定値より確かなため
- 有報を出していない会社（未上場のベンチャー等）は一覧に無く「一致なし」。他の情報源で補完する
- 出力CSVに `EDINETコード` `証券コード` 列を追加
- 書類取得APIは公開APIのため robots.txt の対象外（APIキー認証）。リクエスト間隔は約0.6秒

## 人の確認（要確認を人が判断して反映する）

`export` が `data/review_queue.csv` を出す（Actions では成果物 `csv` と、`crawl-data` ブランチの `data/review_queue.csv`）。
サンプルが目標(`--ok`)に届いていないカテゴリの「あと一歩」の会社だけが、手間の少ない順に並ぶ。

- **検証済み**: 4観点のうち要確認が2つまで・NGなし。人がOKと判断すれば合格になる
- **未検証**: 判定が要確認で、不足項目が1つだけ（従業員数・問い合わせURL・公式URLなど）。人が補えば次の実行で検証に進む

1. CSV の右側を埋める: 「業種／従業員数／問い合わせURL／企業特定の判断」に `OK` か `NG`（空欄=判断しない）。値が違う・足りないときは「従業員数(修正)」「問い合わせURL(修正)」「公式URL(修正)」に正しい値、「メモ」に理由
2. 名前を `review_input.csv` にして、リポジトリの `crawl-data` ブランチの `data/` にアップロード（GitHub の Add file → Upload files）
3. 次の実行の最初に取り込まれ（`node src/cli.js import-review`）、`data/review_applied/` に退避される。ローカルでは `node src/cli.js import-review <ファイル>`

- OK の判断は検証結果を `OK（人の確認）` に上書きし、理由に「人の判断(日付): OK メモ ／ 元の判定: …」を残す。NG は NG のまま（合格にならない）
- 修正した値は `human` の証拠になり、公式サイト・有報より優先される（従業員数は「確認済み」扱い）
- 同じ企業IDの判断は、後から取り込んだものが優先される

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
