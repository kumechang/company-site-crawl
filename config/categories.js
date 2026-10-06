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
    imitsu: ['https://imitsu.jp/ct-net-adagency/pr-tokyo/'],
  },
};
