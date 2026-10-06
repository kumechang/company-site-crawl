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
      // D2C/P2C事業者に絞るため、直販(D2C/公式通販/定期購入など)を示す語を必須にする。「EC」「通販」単独は広すぎるため含めない
      all: [
        ['化粧品', 'コスメ', 'スキンケア', 'ヘアケア', 'ボディケア', '美容液', 'サプリメント'],
        ['D2C', 'P2C', 'DtoC', '公式通販', '公式オンラインストア', '公式オンラインショップ', '公式ストア', '自社ECサイト', '定期購入', '定期便', '自社ブランド'],
      ],
    },
    green: ['https://www.green-japan.com/search/area/13/industry/130120'],
    wantedly: ['化粧品 D2C', 'コスメ ブランド'],
    salesnow: [{ url: 'https://salesnow.jp/db/industries/retail-sales/subIndustries/cosmetics-sales', label: '化粧品', pages: 5, limit: 40 }],
    jcia: [{ url: 'https://www.jcia.org/admin/memberlist', label: '化粧品', limit: 40 }],
    jaro: [{ url: 'https://www.jaro.or.jp/kaiinsha/', section: '化粧品・トイレタリー', label: '化粧品', limit: 40 }],
    article: [{ url: 'https://service.aainc.co.jp/product/letro/article/d2c_brand', label: '化粧品 D2C ブランド' }],
    // PR TIMES の検索で見つけた会社。label は「化粧品」のみ（D2C/P2Cかどうかは公式サイトの文章で判定する）
    prtimes: [
      { keyword: 'D2C 化粧品', label: '化粧品' },
      { keyword: 'スキンケア ブランド 公式通販', label: '化粧品' },
      { keyword: 'コスメ 新ブランド 発売', label: '化粧品' },
    ],
  },
  influencer_agency: {
    label: 'インフルエンサー事務所',
    match: {
      // 「マーケティング」単独だと、インフルエンサー施策を扱うだけのSNS代理店まで該当するため含めない
      // 「タレント(人材)」「事務所(オフィス)」「所属」など一般語だけで該当しないよう、事務所・マネジメント・所属を示す具体的な語句にする
      all: [
        ['インフルエンサー', 'YouTuber', 'TikToker', 'クリエイター'],
        ['インフルエンサー事務所', 'クリエイター事務所', 'YouTuber事務所', 'インフルエンサーマネジメント', 'クリエイターマネジメント', 'マネジメント事業', '所属インフルエンサー', '所属クリエイター', '所属タレント', 'キャスティング'],
      ],
    },
    green: ['https://www.green-japan.com/search/area/13/industry/100125'],
    wantedly: ['インフルエンサー キャスティング', 'インフルエンサー マネジメント'],
    // PR TIMES の検索で見つけた会社。label は「インフルエンサー」のみ（事務所かどうかは公式サイトの文章で判定する）
    prtimes: [
      { keyword: 'インフルエンサー 事務所 所属', label: 'インフルエンサー' },
      { keyword: 'インフルエンサー マネジメント', label: 'インフルエンサー' },
    ],
    boxil: [{ url: 'https://boxil.jp/sc-influencer_marketing/', label: 'インフルエンサー マーケティング キャスティング' }],
    aspic: [{ url: 'https://www.aspicjapan.org/asu/service/list/imk', label: 'インフルエンサー マーケティング キャスティング' }],
    meetsmore: [{ url: 'https://meetsmore.com/product-services/influencer-casting', label: 'インフルエンサー キャスティング マーケティング' }],
    webkanji: [{ url: 'https://web-kanji.com/search/influencer-marketing', label: 'インフルエンサー マーケティング' }],
    article: [
      { url: 'https://buzz-navi.jp/influencer-agency/', label: 'インフルエンサー事務所 マネジメント' },
      { url: 'https://influencerpulse.jp/recommend/influencer_prod/', label: 'インフルエンサー事務所 マネジメント' },
      { url: 'https://boxil.jp/mag/a6710/', label: 'インフルエンサー マーケティング キャスティング' },
    ],
  },
  ad_agency: {
    label: '広告代理店',
    maxEmployees: 2000, // 「ベンチャー・中堅」= 従業員2,000名以下（ユーザー指定）。超える会社はこのカテゴリのサンプル・OK件数に含めない
    match: { any: ['広告代理', 'アドエージェンシー', 'Web広告', '運用型広告', '広告運用', 'ネット広告', 'デジタル広告', '広告事業'] },
    green: ['https://www.green-japan.com/search/area/13/industry/100125', 'https://www.green-japan.com/search/area/13/industry/110120'],
    wantedly: ['広告代理店', '運用型広告'],
    imitsu: ['https://imitsu.jp/ct-net-adagency/pr-tokyo/'],
    grip: [
      { url: 'https://grip-space.co.jp/ad-db/pref/tokyo/field/5-1', label: '広告代理店' }, // 総合広告代理店
      { url: 'https://grip-space.co.jp/ad-db/pref/tokyo/field/5-2', label: '広告代理店 ネット広告' }, // ネット広告専門
      { url: 'https://grip-space.co.jp/ad-db/pref/tokyo/feature/ad-web', label: '広告代理店 Web広告運用' }, // Web広告運用(301社)
      { url: 'https://grip-space.co.jp/ad-db/pref/tokyo', label: '広告代理店' }, // 東京都の広告代理店 2,225社
    ],
    // デジトレ: 東京都の代理店75社(8ページ)。会社ページに本社所在地。ページ送りは /page/N/（?page=N は無視される）
    digitre: [{ url: 'https://www.digi-tre.com/area/s-tokyo/', label: '広告代理店', pages: 8 }],
    agencyhub: [{ url: 'https://agencyhub.jp/prefecture/tokyo/', label: '広告代理店' }],
    pitact: [{ url: 'https://pitact.com/search/pref-tokyo/category-6751mbkug', label: '広告代理店', pages: 1 }],
    houjingoo: [{ url: 'https://houjin.goo.to/corporations/prefs/tokyo/category-s-advertising-agency-publicity-industry', label: '広告代理店' }],
    salesnow: [{ url: 'https://salesnow.jp/db/industries/advertising/tokyo', label: '広告代理店' }],
    aspic: [{ url: 'https://www.aspicjapan.org/asu/service/list/aop', label: '広告運用代行 広告代理店' }],
    meetsmore: [{ url: 'https://meetsmore.com/product-services/web-advertisement-operation', label: 'Web広告運用代行 広告代理店' }],
    webkanji: [{ url: 'https://web-kanji.com/posts/listing-tokyo', label: '広告代理店 リスティング広告' }],
    article: [
      { url: 'https://media-radar.jp/contents/meditsubu/columns5-tokyo-ad-agency/', label: '広告代理店' },
      { url: 'https://www.biz.ne.jp/matome/2010215/', label: '広告代理店' },
      { url: 'https://www.shopowner-support.net/attracting_customers/area/tokyo/webads-agency-tokyo/', label: 'Web広告 広告代理店' },
      { url: 'https://www.centered.co.jp/blog/ad_tokyo/', label: 'Web広告 広告代理店' },
      { url: 'https://canvas.d2cr.co.jp/tokyo-ad-agency/', label: '広告代理店' },
      // 化粧品・美容向けの広告代理店の比較記事
      { url: 'https://www.rei-yokohama.co.jp/blog/cosme-ec-ad-agency', label: '広告代理店 化粧品 D2C' },
      { url: 'https://grill.co.jp/marketing-log/13270/', label: '広告代理店 化粧品 D2C' },
      { url: 'https://stock-sun.com/column/beauty-advertising-agency/', label: '広告代理店 美容' },
      { url: 'https://ecnomikata.com/bizmatching/category/48/c2-52/', label: '広告運用代行 化粧品' },
    ],
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
      'https://digi-mado.jp/articles/468ac2e4-2734-4a1d-8ac6-261cdf870b7b/', // 東京のSNS運用代行会社21選
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
      { url: 'https://grip-space.co.jp/ad-db/feature/ad-sns', label: 'SNS運用代行 広告代理店' }, // 全国356社（東京以外は住所で除外される）
    ],
    // 比較・おすすめ記事（見出し→説明文の規則性から掲載企業を抽出）
    article: [
      'https://stock-sun.com/column/sns-management-tokyo/',
      'https://pamxy.co.jp/marke-driven/sns-marketing/tokyo-sns-operation-agency/',
      'https://e-pace.co.jp/column/tokyo_sns_recommendation/',
      'https://digital-marketing.jp/sns-marketing/recommended-sns-management-agency-in-tokyo/',
      'https://fizjapan.com/column/detail/sns-unyo-daiko-tokyo/',
      'https://sider-story.co.jp/knowledge/tokyo-sns-partner/',
      'https://dym.asia/biznavi/articles/sns-31-c04afl/',
      'https://media-radar.jp/contents/meditsubu/columns4-snsoperationagency/',
      'https://oproduct.jp/articles/1384479',
      'https://holytech.jp/column/comparison-sns-operate-agency/',
      'https://oproduct.jp/categories/8935447',
      'https://www.nishinippon-adv.jp/news/29/',
      'https://media-radar.jp/contents/meditsubu/sns_support/',
      'https://houjinnavi.com/sns-daiko/',
      'https://probel.jp/promaga/b/5019/',
      'https://note.com/s_line/n/n70be505055d8',
      'https://freelance-meikan.com/column/8201/tokyo-sns-agency-recommend-2026/',
      'https://unitedanimals.co.jp/archives/blog/4515',
      'https://boxil.jp/mag/a6415/',
      'https://request.ne.jp/sns-management-agency-comparison/',
      'https://www.aspicjapan.org/asu/article/43581',
      'https://ecnomikata.com/bizmatching/category/97/c2-56/',
      'https://sns-nakodo.com/area/tokyo/', // SNS仲人(インスタ運用代行) 東京 約14社
      'https://sns-nakodo.com/area/tokyo/page/2/',
    ].map((url) => ({ url, label: 'SNS運用代行' })),
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
  prtimes: { name: 'PR TIMES', status: 'ready', note: 'キーワード検索で会社を発見 + 会社名の完全一致で公式URL・本社所在地を補完' },
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
  article: { name: '比較・おすすめ記事(共通抽出)', status: 'ready', note: '見出し→「<名>は…」で始まる説明文の規則性から掲載企業を抽出。精度は記事ごとに差がある' },
  careertasu: { name: 'キャリタス就活', status: 'enrich', note: '会社名検索(GET /condition-search/result/?keyword=)→会社データで従業員数・本社所在地。新卒採用している会社のみ' },
  openwork: { name: 'OpenWork', status: 'enrich', note: '会社名検索(GET /company_list?src_str=)→会社ページで公式URL・所在地・社員数レンジ。口コミサイトのため規約は利用者が確認' },
  digitre: { name: 'デジトレ', status: 'ready', note: '東京都の広告代理店75社。会社ページに本社所在地(従業員数・公式URLなし)' },
  grip: { name: 'グリップ 広告代理店DB', status: 'ready', note: '会社ページに公式サイト・従業員数・法人番号。一覧は?page=N' },
  houjingoo: { name: '全国法人(houjin.goo.to)', status: 'ready', note: '本社所在地・資本金・従業員数(一部)' },
  pitact: { name: 'PITACT', status: 'ready', note: '住所・法人番号・従業員数(空欄多い)。ページ送りは/page-N' },
  agencyhub: { name: 'AgencyHub', status: 'ready', note: '従業員規模のレンジ。所在地は対応エリアの可能性があり住所には使わない' },
  jcia: { name: '日本化粧品工業会 会員名簿', status: 'ready', note: '社名・住所・電話(URLなし)' },
  jaro: { name: 'JARO 会員社一覧', status: 'ready', note: '社名のみ。業種見出し(化粧品・トイレタリー等)ごと' },
  gbizinfo: { name: 'Gビズインフォ(経産省)', status: 'enrich', note: '会社名検索(フォーム操作)で本店所在地・従業員数を補完。robots.txtは全面許可' },
  mynavi_shinsotsu: { name: 'マイナビ(新卒)', status: 'enrich', note: '会社名検索(POSTフォーム srchWord)→企業の会社概要で従業員数・本社所在地を補完。新卒採用している会社のみ。従業員数は連結の場合あり' },
  slidelib: { name: 'slide lib(スライドリブ)', status: 'ready', note: 'ユーザー提供。比較記事から会社名と「サービスサイトへ」リンクを取得。住所・従業員数は無し' },
  meetsmore: { name: 'ミツモア', status: 'ready', note: 'ユーザー提供。サービスページに会社名・製品URL。/product-providers 等はrobots禁止' },
  buzztan: { name: 'バズ担', status: 'ready', note: '/list/ 1ページに全社の所在地・公式URLあり' },
};

/**
 * カテゴリごとの媒体の優先順位（上から順に見て、目標社数に達したら打ち切る）。
 */
export const ORDER = {
  cosme_d2c: ['salesnow', 'bizmaps', 'jcia', 'jaro', 'article', 'wantedly', 'green', 'prtimes', /* 第2群 */ 'indeed', 'kyujinbox', 'doda', 'mynavi', 'engage'],
  influencer_agency: ['wantedly', 'green', 'kyujinbox', 'indeed', 'prtimes', 'boxil', 'aspic', 'meetsmore', 'webkanji', 'article', 'imitsu'],
  ad_agency: ['webkanji', 'imitsu', 'boxil', 'aspic', 'meetsmore', 'grip', 'digitre', 'agencyhub', 'pitact', 'houjingoo', 'salesnow', 'article', 'digimado', 'wantedly', 'green', 'doda', 'indeed', 'kyujinbox', 'mynavi', 'engage'],
  sns_agency: ['boxil', 'aspic', 'digimado', 'buzztan', 'slidelib', 'webkanji', 'imitsu', 'meetsmore', 'grip', 'article', 'wantedly', 'green', 'kyujinbox', 'engage', 'indeed'],
};

/**
 * 「業種チェック」用。公式サイトが自社をどう説明しているか(タイトル・説明文・トップの冒頭・事業内容)に、そのカテゴリの語があるか、
 * 主業が別(SaaS・DX・メディア・人材など)でないかを見る。
 *  main   … そのカテゴリの事業を示す語
 *  extra  … カテゴリによっては追加で必要な語(化粧品=直販、インフルエンサー=事務所・マネジメントの実態)
 */
export const INDUSTRY_CORE = {
  cosme_d2c: {
    main: ['化粧品', 'コスメ', 'スキンケア', 'ヘアケア', 'ボディケア', '美容液', 'サプリメント'],
    extra: ['D2C', 'P2C', 'DtoC', '公式通販', '公式オンラインストア', '公式オンラインショップ', '公式ストア', 'オンラインストア', 'オンラインショップ', '自社EC', '定期購入', '定期便', '直営店', '通販'],
    extraLabel: '直販(D2C/公式通販など)',
  },
  influencer_agency: {
    main: ['インフルエンサー', 'YouTuber', 'TikToker', 'クリエイター'],
    extra: ['インフルエンサー事務所', 'クリエイター事務所', 'マネジメント', 'キャスティング', '所属'],
    extraLabel: '事務所・マネジメント・キャスティング',
  },
  ad_agency: { main: ['広告代理', '広告運用', '運用型広告', 'ネット広告', 'インターネット広告', 'Web広告', 'デジタル広告', 'アドエージェンシー', 'アドテク', '広告事業'], weak: ['広告', 'マーケティング', 'プロモーション'] },
  sns_agency: { main: ['SNS運用', 'SNSマーケティング', 'SNSアカウント運用', 'Instagram運用', 'TikTok運用', 'SNS広告', 'SNS代行', 'SNSコンサル', 'ソーシャルメディアマーケティング', 'ソーシャルメディア運用'], weak: ['SNS', 'ソーシャルメディア', 'インフルエンサー'] },
};

/** 主業が別にある可能性を示す語(自社説明の冒頭にこれが並ぶ場合は「業種は要確認」) */
export const COMPETING_BUSINESS = ['SaaS', 'DX', 'コンサルティング', 'システム開発', '受託開発', '人材', 'メディア運営', 'ゲーム', 'EC事業', '不動産', '金融', 'データ分析', 'ソフトウェア', 'プラットフォーム', 'マッチング', 'クラウド', '出版', '製造', 'フリーランス', 'AI', '家具', 'インテリア', 'マットレス', '寝具', '求人', '採用支援', '採用代行', '雑誌', 'スキルマーケット', 'マーケットプレイス', 'ECマーケティング', 'EC支援', 'ウィッグ', '育毛'];
