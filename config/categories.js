// カテゴリ定義。
//  - match: テキストにこの条件が当てはまればそのカテゴリと判定（all の各グループから1語以上ヒット）
//  - green:    Green の「東京×業界」一覧URL（Green は検索が robots.txt で禁止のため一覧を使う）
//  - wantedly: Wantedly の検索キーワード
//  - imitsu:   アイミツの東京の一覧URL
//  最終的なカテゴリ判定は、集めたテキストに対する match で行う（検索元は参考情報）
export const CATEGORIES = {
  cosme_d2c: {
    label: '化粧品D2C/P2C',
    match: {
      all: [
        ['化粧品', 'コスメ', 'スキンケア', 'ヘアケア', 'ボディケア', '美容液', 'サプリ', '美容'],
        ['D2C', 'P2C', 'DtoC', '自社ブランド', '自社開発', '通販', 'ネット販売', 'オンライン販売', 'EC', '定期'],
      ],
    },
    green: ['https://www.green-japan.com/search/area/13/industry/130120'],
    wantedly: ['化粧品 D2C', 'コスメ ブランド'],
  },
  influencer_agency: {
    label: 'インフルエンサー事務所',
    match: {
      all: [
        ['インフルエンサー', 'YouTuber', 'TikToker', 'クリエイター', 'タレント'],
        ['マネジメント', '所属', '事務所', 'キャスティング', 'プロダクション', 'マーケティング'],
      ],
    },
    green: ['https://www.green-japan.com/search/area/13/industry/100125'],
    wantedly: ['インフルエンサー キャスティング', 'インフルエンサー マネジメント'],
  },
  ad_agency: {
    label: '広告代理店',
    match: { any: ['広告代理', 'アドエージェンシー', 'Web広告', '運用型広告', '広告運用', 'ネット広告', 'デジタル広告', '広告事業'] },
    green: ['https://www.green-japan.com/search/area/13/industry/100125', 'https://www.green-japan.com/search/area/13/industry/110120'],
    wantedly: ['広告代理店', '運用型広告'],
    imitsu: ['https://imitsu.jp/ct-net-adagency/pr-tokyo/'],
  },
  sns_agency: {
    label: 'SNS運用代行',
    match: { any: ['SNS運用', 'SNSアカウント運用', 'SNSマーケティング', 'Instagram運用', 'TikTok運用', 'SNS代行', 'SNSコンサル', 'SNS広告'] },
    green: ['https://www.green-japan.com/search/area/13/industry/100125'],
    wantedly: ['SNS運用代行', 'SNSマーケティング'],
    boxil: ['https://boxil.jp/sc-sns_operationagency/'],
    imitsu: ['https://imitsu.jp/ct-net-adagency/pr-tokyo/'],
  },
};

/**
 * 媒体の状態。
 *  ready   … アダプタ実装済み
 *  todo    … 未実装（robots.txt・構造の確認からやる）
 *  blocked … この環境からは遮断される（ボット対策の回避はしない）。自宅回線なら通る場合あり
 */
export const SITES = {
  green: { name: 'Green', status: 'ready' },
  wantedly: { name: 'Wantedly', status: 'ready' },
  imitsu: { name: 'アイミツ', status: 'ready' },
  salesnow: { name: 'SalesNow', status: 'enrich', note: '会社名検索が無いため索引化して補完用に使う(発見には使わない)' },
  bizmaps: { name: 'BIZMAPS', status: 'blocked', note: '403 (サーバー側でIP拒否)' },
  indeed: { name: 'Indeed', status: 'blocked', note: 'Cloudflare確認画面。規約上もスクレイピング禁止' },
  prtimes: { name: 'PR TIMES', status: 'todo' },
  kyujinbox: { name: '求人ボックス', status: 'todo' },
  doda: { name: 'doda', status: 'todo' },
  mynavi: { name: 'マイナビ転職', status: 'todo' },
  engage: { name: 'エンゲージ', status: 'todo' },
  boxil: { name: 'BOXIL', status: 'ready', note: 'Cloudflareあり。通常ブラウザで取得できるが規約は要確認' },
  webkanji: { name: 'Web幹事', status: 'todo' },
  hikakubiz: { name: '比較ビズ', status: 'todo' },
  hacchunavi: { name: '発注ナビ', status: 'todo' },
  digimado: { name: 'デジタル化の窓口', status: 'todo' },
  aspic: { name: 'アスピック', status: 'todo' },
  buzztan: { name: 'バズ担', status: 'todo' },
};

/**
 * カテゴリごとの媒体の優先順位（上から順に見て、目標社数に達したら打ち切る）。
 */
export const ORDER = {
  cosme_d2c: ['salesnow', 'bizmaps', 'wantedly', 'green', 'prtimes', /* 第2群 */ 'indeed', 'kyujinbox', 'doda', 'mynavi', 'engage'],
  influencer_agency: ['wantedly', 'green', 'kyujinbox', 'indeed', 'prtimes', 'boxil', 'webkanji', 'imitsu', 'hikakubiz'],
  ad_agency: ['webkanji', 'imitsu', 'hikakubiz', 'hacchunavi', 'boxil', 'digimado', 'wantedly', 'green', 'doda', 'indeed', 'kyujinbox', 'mynavi', 'engage'],
  sns_agency: ['boxil', 'aspic', 'digimado', 'buzztan', 'webkanji', 'imitsu', 'hikakubiz', 'wantedly', 'green', 'kyujinbox', 'indeed'],
};
