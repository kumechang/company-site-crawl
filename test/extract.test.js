import test from 'node:test';
import assert from 'node:assert/strict';
import { extractEmployees, extractAddress, isTokyoAddress, findContactLinks, findProfileLinks, parseLabeled, looksLikeContactPage, nearlySame, sameBrand } from '../src/lib/extract.js';
import { classify } from '../src/lib/classify.js';
import { parseRobots, isAllowed } from '../src/lib/robots.js';
import { normalizeName } from '../src/lib/util.js';

test('従業員数: 基本形', () => {
  assert.equal(extractEmployees('従業員数\n120名').value, 120);
  assert.equal(extractEmployees('会社名 | 株式会社A | 従業員数 | 7人 | 平均年齢').value, 7);
  assert.equal(extractEmployees('従業員数：1,200名（2024年4月現在）').value, 1200);
  assert.equal(extractEmployees('従業員数　約５０名').value, 50);
  assert.equal(extractEmployees('従業員数 20〜50名').approx, true);
  assert.equal(extractEmployees('従業員数（連結） 300名').value, 300);
  assert.equal(extractEmployees('従業員数 正社員 45名 / アルバイト 10名').value, 45);
});
test('従業員数: 誤検出しない', () => {
  assert.equal(extractEmployees('設立 2013年12月 事業内容'), null);
  assert.equal(extractEmployees('従業員数 2020年'), null);
  assert.equal(extractEmployees('従業員募集中'), null);
});
test('従業員数: 沿革などの文章中の語は拾わない', () => {
  assert.equal(extractEmployees('従業員0人からスタート。 | 2014.01 | グループ'), null);
  assert.equal(extractEmployees('従業員数 0名'), null);
  assert.equal(extractEmployees('従業員5名から始まった会社です'), null);
  assert.equal(extractEmployees('従業員 | 45名').value, 45);
  assert.equal(extractEmployees('社員数：30人').value, 30);
});
test('従業員数: 番号付き見出しや単位のない「社員」を拾わない', () => {
  assert.equal(extractEmployees('社員 | 2. 中途・新卒社員 | 1. 全雇用形態 | 4'), null);
  assert.equal(extractEmployees('社員インタビュー | 3 | 先輩社員'), null);
  const r = extractEmployees('従業員数 | 213名 ※2024年4月現在');
  assert.equal(r.value, 213);
  assert.equal(r.strong, true);
  assert.equal(extractEmployees('従業員 | 45名').strong, false);
});
test('住所: ラベル付き', () => {
  const a = extractAddress('本社所在地 | 〒150-0001 東京都渋谷区神宮前1-2-3 ○○ビル5F | TEL 03-0000-0000');
  assert.equal(a.address, '東京都渋谷区神宮前1-2-3 ○○ビル5F');
  assert.ok(isTokyoAddress(a.address));
});
test('住所: 郵便番号のみ', () => {
  const a = extractAddress('〒107-0061 東京都港区北青山2-12-8 BIZSMART青山 215号室 | http://emolva.tokyo');
  assert.ok(isTokyoAddress(a.address));
});
test('住所: 郵便番号つき・全角空白でも東京判定', () => {
  assert.ok(isTokyoAddress('〒101-0052　 東京都千代田区神田小川町2-12'));
  assert.ok(isTokyoAddress('〒105-5536 東京都港区虎ノ門2-6-1'));
  assert.ok(isTokyoAddress('1050001 東京都港区'));
  assert.equal(isTokyoAddress('〒530-0001 大阪府大阪市北区'), false);
  assert.equal(isTokyoAddress(null), false);
});
test('住所: 大阪は東京でない', () => {
  const a = extractAddress('所在地：大阪府大阪市北区1-1-1');
  assert.equal(isTokyoAddress(a.address), false);
});
test('住所: 東京は支社より本社を優先', () => {
  const a = extractAddress('大阪支社 大阪府大阪市 本社 東京都千代田区丸の内1-1-1');
  assert.ok(isTokyoAddress(a.address));
});
test('問い合わせリンク', () => {
  const l = findContactLinks(
    [
      { href: 'https://ex.co.jp/privacy', text: 'プライバシーポリシー' },
      { href: 'https://ex.co.jp/contact/', text: 'お問い合わせ' },
      { href: 'mailto:a@ex.co.jp', text: 'メール' },
    ],
    'https://ex.co.jp/'
  );
  assert.equal(l[0].url, 'https://ex.co.jp/contact/');
  assert.equal(l.length, 1);
});
test('会社概要リンク', () => {
  const l = findProfileLinks(
    [
      { href: 'https://ex.co.jp/news', text: 'ニュース' },
      { href: 'https://ex.co.jp/company', text: '会社概要' },
      { href: 'https://other.com/company', text: '会社概要' },
    ],
    'https://ex.co.jp/'
  );
  assert.equal(l.length, 1);
  assert.equal(l[0].url, 'https://ex.co.jp/company');
});
test('parseLabeled', () => {
  const r = parseLabeled('企業情報\n会社名\nA社\n従業員数\n7人\n本社住所\n東京都目黒区1-1\n3F\nこの企業と同じ', ['会社名', '従業員数', '本社住所'], { start: /^企業情報$/, stop: /^この企業と同じ/ });
  assert.deepEqual(r['本社住所'], ['東京都目黒区1-1', '3F']);
  assert.deepEqual(r['従業員数'], ['7人']);
});
test('カテゴリ分類', () => {
  assert.deepEqual(classify('SNSアカウント運用代行と広告運用').map((c) => c.category).sort(), ['ad_agency', 'sns_agency']);
  assert.deepEqual(classify('自社ブランドのスキンケアをD2Cで展開').map((c) => c.category), ['cosme_d2c']);
  assert.deepEqual(classify('飲食店向けPOSレジ'), []);
});
test('robots', () => {
  const g = parseRobots('User-agent: *\nDisallow: /s/*?*page=\nDisallow: /api/\nAllow: /api/public\n');
  assert.equal(isAllowed(g, '/s/pref13?page=2'), false);
  assert.equal(isAllowed(g, '/s/pref13'), true);
  assert.equal(isAllowed(g, '/api/x'), false);
  assert.equal(isAllowed(g, '/api/public/x'), true);
});
test('会社名正規化', () => {
  assert.equal(normalizeName('パンパシフィック 株式会社'), normalizeName('株式会社パンパシフィック'));
  assert.equal(normalizeName('(株)ＡＢＣ'), 'abc');
});

test('問い合わせページ判定: トップと同じ内容(ソフト404)は不可、メニューの語だけでも不可', () => {
  const top = 'よくあるご質問\nお問い合わせ\n採用情報\nTOPICS\n新着情報\nSHOP LIST';
  assert.equal(nearlySame(top, top + '\n追加'), true);
  assert.equal(looksLikeContactPage({ text: top, finalUrl: 'https://ex.jp/contact.html' }, { requested: 'https://ex.jp/contact.html', topText: top, guess: true }), false);
  // トップへリダイレクトされる
  assert.equal(looksLikeContactPage({ text: 'お名前\nメールアドレス\n送信', finalUrl: 'https://ex.jp/' }, { requested: 'https://ex.jp/contact/', topText: top, guess: true }), false);
  // 本物のフォームページ
  assert.equal(looksLikeContactPage({ text: 'お問い合わせ\nお名前\nメールアドレス\nお問い合わせ内容\n送信', finalUrl: 'https://ex.jp/contact/' }, { requested: 'https://ex.jp/contact/', topText: top, guess: true }), true);
  // メニューにお問い合わせの語しかなく、フォーム語が無い推測パスは不可
  assert.equal(looksLikeContactPage({ text: 'メニュー\nお問い合わせ', finalUrl: 'https://ex.jp/c' }, { requested: 'https://ex.jp/c', topText: top, guess: true }), false);
});
test('リンクされた問い合わせページ: フォームが埋め込みで項目名が無くても可。トップと同一は不可', () => {
  const top = '会社紹介\nサービス\nお問い合わせ\n採用情報';
  const page = '会社紹介\nサービス\nお問い合わせ\n採用情報\nマーケティング支援に関するご相談など、\nお問い合わせはこちらのフォームから\nご入力ください\n担当より折り返しご連絡します';
  assert.equal(looksLikeContactPage({ text: page }, { requested: 'https://ex.jp/contact', topText: top }), true);
  assert.equal(looksLikeContactPage({ text: top }, { requested: 'https://ex.jp/contact', topText: top }), false);
});
test('「お客様相談室」も問い合わせ候補', () => {
  const l = findContactLinks([{ href: 'https://www.hoyu.co.jp/customer/', text: 'お客様相談室' }], 'https://www.hoyu.co.jp/');
  assert.equal(l[0].url, 'https://www.hoyu.co.jp/customer/');
});
test('同じブランドの別ドメインを同一とみなす', () => {
  assert.equal(sameBrand('https://www.houseofrose.jp/contact/', 'https://www.houseofrose.co.jp/'), true);
  assert.equal(sameBrand('https://saleskpi.xyz/form', 'https://www.mds-fund.com/'), false);
  assert.equal(sameBrand('https://a.co.jp/', 'https://b.co.jp/'), false);
});
