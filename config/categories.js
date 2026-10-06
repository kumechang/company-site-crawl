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
    salesnow: [{ url: 'https://salesnow.jp/db/industries/retail-sales/subIndustries/cosmetics-sales', label: '化粧品' }],
    jcia: [{ url: 'https://www.jcia.org/admin/memberlist', label: '化粧品' }],
    jaro: [{ url: 'https://www.jaro.or.jp/kaiinsha/', section: '化粧品・トイレタリー', label: '化粧品' }],
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
    grip: [
      { url: 'https://grip-space.co.jp/ad-db/pref/tokyo/field/5-1', label: '広告代理店' }, // 総合広告代理店
      { url: 'https://grip-space.co.jp/ad-db/pref/tokyo/field/5-2', label: '広告代理店 ネット広告' }, // ネット広告専門
    ],
    agencyhub: [{ url: 'https://agencyhub.jp/prefecture/tokyo/', label: '広告代理店' }],
    pitact: [{ url: 'https://pitact.com/search/pref-tokyo/category-6751mbkug', label: '広告代理店', pages: 1 }],
    houjingoo: [{ url: 'https://houjin.goo.to/corporations/prefs/tokyo/category-s-advertising-agency-publicity-industry', label: '広告代理店' }],
    salesnow: [{ url: 'https://salesnow.jp/db/industries/advertising/tokyo', label: '広告代理店' }],
  },
  sns_agency: {
    label: 'SNS運用代行',
    match: { any: ['SNS運用', 'SNSアカウント運用', 'SNSマーケティング', 'Instagram運用', 'TikTok運用', 'SNS代行', 'SNSコンサル', 'SNS広告'] },
    green: ['https://www.green-japan.com/search/area/13/industry/100125'],
    wantedly: ['SNS運用代行', 'SNSマーケティング'],
    boxil: ['https://boxil.jp/sc-sns_operationagency/'],
    aspic: ['https://www.aspicjapan.org/asu/service/list/smm'],
    webkanji: ['https://web-kanji.com/posts/sns-tokyo'],
    buzztan: ['https://www.buzztan.com/list/'],
    digimado: [
      'https://digi-mado.jp/articles/38fdcd64-6f04-4f5d-a762-ab1505cadcf6/', // SNS運用代行おすすめ19選
      'https://digi-mado.jp/category/marketing/sns-analysis-tools/', // SNS分析ツール
    ],
    engage: ['https://en-gage.net/user/search/?from=list&keyword=SNS%E9%81%8B%E7%94%A8&area=23'],
    kyujinbox: ['https://xn--pckua2a7gp15o89zb.com/SNS%E9%81%8B%E7%94%A8%E4%BB%A3%E8%A1%8C-%E6%9D%B1%E4%BA%AC%E9%83%BD%E3%81%AE%E4%BB%95%E4%BA%8B'],
    // アイミツには専用カテゴリが無く特集ページのみ（ユーザー確認済み）。一覧中の東京のsupplierだけを拾う
    imitsu: ['https://imitsu.jp/list/net-adagency/socialmedia-outsourcing', 'https://imitsu.jp/list/hp-design/sns/'],
    slidelib: ['https://cone-c-slide.com/liblog/sns/'], // 他に /liblog/instagram/ /tiktok/ /twitter/ /youtube/ /facebook/ /threads/ /sns-consulting/ の比較記事あり（未使用）
    meetsmore: ['https://meetsmore.com/product-services/sns-operation-agency'], // 広告用パラメータ(utm_*, gclid)は除去
    grip: [
      { url: 'https://grip-space.co.jp/ad-db/pref/tokyo/feature/ad-sns', label: 'SNS運用代行 広告代理店' },
      { url: 'https://grip-space.co.jp/web-db/pref/tokyo/service/sns', label: 'SNS運用代行 ホームページ制作' },
    ],
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
  salesnow: { name: 'SalesNow', status: 'ready', note: '会社名検索が無いため、業種別・地域別の一覧を発見用に、索引を補完用に使う' },
  bizmaps: { name: 'BIZMAPS', status: 'blocked', note: '403 (サーバー側でIP拒否)' },
  indeed: { name: 'Indeed', status: 'blocked', note: 'Cloudflare確認画面。規約上もスクレイピング禁止' },
  prtimes: { name: 'PR TIMES', status: 'enrich', note: '会社名の完全一致で公式URL・本社所在地を補完(発見には未使用)' },
  kyujinbox: { name: '求人ボックス', status: 'ready', note: '求人詳細はrobots.txt禁止のため一覧本文の社名・求人タイトルのみ使用' },
  doda: { name: 'doda', status: 'blocked', note: '求人一覧(JobSearchList)がrobots.txtで禁止' },
  mynavi: { name: 'マイナビ転職', status: 'blocked', note: 'この環境からは400/503が返る(アクセス制限)。自宅回線なら取得できる可能性あり' },
  engage: { name: 'エンゲージ', status: 'ready' },
  boxil: { name: 'BOXIL', status: 'ready', note: 'Cloudflareあり。通常ブラウザで取得できるが規約は要確認' },
  webkanji: { name: 'Web幹事', status: 'ready' },
  hikakubiz: { name: '比較ビズ', status: 'ready', note: 'アダプタ実装済み。SNS運用代行・広告代理店のページが無い(ユーザー確認済み)ため現状は対象なし' },
  hacchunavi: { name: '発注ナビ', status: 'none', note: 'SNS運用代行・広告代理店のページが無い(ユーザー確認済み)' },
  digimado: { name: 'デジタル化の窓口', status: 'ready', note: 'digi-mado.jp。記事/カテゴリ→製品ページ→運営企業情報' },
  aspic: { name: 'アスピック', status: 'ready' },
  grip: { name: 'グリップ 広告代理店DB', status: 'ready', note: '会社ページに公式サイト・従業員数・法人番号。一覧は?page=N' },
  houjingoo: { name: '全国法人(houjin.goo.to)', status: 'ready', note: '本社所在地・資本金・従業員数(一部)' },
  pitact: { name: 'PITACT', status: 'ready', note: '住所・法人番号・従業員数(空欄多い)。ページ送りは/page-N' },
  agencyhub: { name: 'AgencyHub', status: 'ready', note: '従業員規模のレンジ。所在地は対応エリアの可能性があり住所には使わない' },
  jcia: { name: '日本化粧品工業会 会員名簿', status: 'ready', note: '社名・住所・電話(URLなし)' },
  jaro: { name: 'JARO 会員社一覧', status: 'ready', note: '社名のみ。業種見出し(化粧品・トイレタリー等)ごと' },
  gbizinfo: { name: 'Gビズインフォ(経産省)', status: 'enrich', note: '会社名検索(フォーム操作)で本店所在地・従業員数を補完。robots.txtは全面許可' },
  slidelib: { name: 'slide lib(スライドリブ)', status: 'ready', note: 'ユーザー提供。比較記事から会社名と「サービスサイトへ」リンクを取得。住所・従業員数は無し' },
  meetsmore: { name: 'ミツモア', status: 'ready', note: 'ユーザー提供。サービスページに会社名・製品URL。/product-providers 等はrobots禁止' },
  buzztan: { name: 'バズ担', status: 'ready', note: '/list/ 1ページに全社の所在地・公式URLあり' },
};

/**
 * カテゴリごとの媒体の優先順位（上から順に見て、目標社数に達したら打ち切る）。
 */
export const ORDER = {
  cosme_d2c: ['salesnow', 'bizmaps', 'jcia', 'jaro', 'wantedly', 'green', 'prtimes', /* 第2群 */ 'indeed', 'kyujinbox', 'doda', 'mynavi', 'engage'],
  influencer_agency: ['wantedly', 'green', 'kyujinbox', 'indeed', 'prtimes', 'boxil', 'webkanji', 'imitsu'],
  ad_agency: ['webkanji', 'imitsu', 'boxil', 'grip', 'agencyhub', 'pitact', 'houjingoo', 'salesnow', 'digimado', 'wantedly', 'green', 'doda', 'indeed', 'kyujinbox', 'mynavi', 'engage'],
  sns_agency: ['boxil', 'aspic', 'digimado', 'buzztan', 'slidelib', 'webkanji', 'imitsu', 'meetsmore', 'grip', 'wantedly', 'green', 'kyujinbox', 'engage', 'indeed'],
};
