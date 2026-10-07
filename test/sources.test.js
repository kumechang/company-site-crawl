import test from 'node:test';
import assert from 'node:assert/strict';
import * as salesnow from '../src/sources/salesnow.js';
import * as boxil from '../src/sources/boxil.js';
import * as prtimes from '../src/sources/prtimes.js';
import * as aspic from '../src/sources/aspic.js';
import * as webkanji from '../src/sources/webkanji.js';
import * as hikakubiz from '../src/sources/hikakubiz.js';
import * as kyujinbox from '../src/sources/kyujinbox.js';
import * as buzztan from '../src/sources/buzztan.js';
import * as digimado from '../src/sources/digimado.js';
import * as engage from '../src/sources/engage.js';
import * as meetsmore from '../src/sources/meetsmore.js';
import * as slidelib from '../src/sources/slidelib.js';
import * as gbizinfo from '../src/sources/gbizinfo.js';
import * as grip from '../src/sources/grip.js';
import * as houjingoo from '../src/sources/houjingoo.js';
import * as pitact from '../src/sources/pitact.js';
import * as agencyhub from '../src/sources/agencyhub.js';
import * as jcia from '../src/sources/jcia.js';
import * as jaro from '../src/sources/jaro.js';
import * as article from '../src/sources/article.js';
import { exportSample } from '../src/export.js';
import * as edinet from '../src/sources/edinet.js';
import { readZip } from '../src/lib/zip.js';
import { assessEmployees } from '../src/lib/employees.js';
import { checkEmployees } from '../src/verify.js';
import zlib from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { consolidate } from '../src/lib/merge.js';
import { newCompany, addEvidence, setOfficialUrl, bestOfficial, needsCorporateUrl } from '../src/lib/model.js';

test('SalesNow 企業ページ', () => {
  const text = [
    '株式会社電通', 'ホームページ', 'https://www.dentsu.co.jp/', '所在地', '東京都', '港区',
    'SalesNowスコア', 'A評価', '正社員規模(推定)', '5,578名', '年間成長率', '会員限定',
    '業歴 (設立年月)', '125年 (1901年07月設立)', '住所（登記所在地）', '東京都港区東新橋１丁目８番１号', '上場区分',
  ].join('\n');
  const r = salesnow.parseCompany({ text });
  assert.equal(r.homepage, 'https://www.dentsu.co.jp/');
  assert.equal(r.employees, 5578);
  assert.equal(r.address, '東京都港区東新橋1丁目8番1号');
  assert.equal(r.founded, '1901年07月');
});

test('SalesNow 一覧の総ページ数', () => {
  assert.equal(salesnow.totalPages({ text: '検索結果約1,100件中1件目~50件目' }), 22);
});

test('BOXIL 一覧: サービス名→運営会社', () => {
  const snap = {
    text: ['関連カテゴリ', 'CeeevのSNS運用代行', '株式会社Ceeev', '（4.50）', '2件の口コミ', 'ウルフのSNS運用支援', '株式会社ウルフ'].join('\n'),
    anchors: [
      { href: 'https://boxil.jp/service/12684/?via=x', text: 'CeeevのSNS運用代行' },
      { href: 'https://boxil.jp/service/51115/?via=x', text: 'ウルフのSNS運用支援' },
    ],
  };
  const r = boxil.parseList(snap);
  assert.deepEqual(r.map((x) => x.company), ['株式会社Ceeev', '株式会社ウルフ']);
});

test('BOXIL 詳細: 公式URLは運営元(smartcamp)リンクより前の外部リンク', () => {
  const r = boxil.parseService({
    text: 'サービス概要\nSNS運用を一括代行',
    anchors: [
      { href: 'https://boxil.jp/mag/', text: '' },
      { href: 'https://ceeev.co.jp/', text: 'https://ceeev.co.jp/' },
      { href: 'https://smartcamp.co.jp/company/', text: '会社概要' },
      { href: 'https://other.example/', text: '' },
    ],
  });
  assert.equal(r.officialUrl, 'https://ceeev.co.jp/');
});

test('従業員数がSalesNow推定のみで閾値付近なら断定しない', () => {
  const c = newCompany('株式会社テスト');
  addEvidence(c, 'employees', 18, { source: 'salesnow', url: 'u', snippet: '推定' });
  addEvidence(c, 'address', '東京都渋谷区1-1', { source: 'imitsu', url: 'u' });
  const r = consolidate(c);
  assert.equal(r.emp20, null);
  assert.notEqual(r.status, '除外');
  assert.ok(r.notes.some((n) => n.includes('推定値')));
});

test('従業員数は公式サイトがSalesNow推定より優先される', () => {
  const c = newCompany('株式会社テスト');
  addEvidence(c, 'employees', 12, { source: 'salesnow', url: 'u', snippet: '' });
  addEvidence(c, 'employees', 60, { source: 'official', url: 'u2', snippet: '従業員数60名' });
  const r = consolidate(c);
  assert.equal(r.employees, 60);
  assert.equal(r.employeesSource, 'official');
});

test('PR TIMES: 完全一致の企業のみ採用', () => {
  const snap = { anchors: [
    { href: 'https://prtimes.jp/main/html/searchrlp/company_id/111', text: '株式会社エクスクリエ2' },
    { href: 'https://prtimes.jp/main/html/searchrlp/company_id/222', text: '株式会社エクスクリエ' },
  ] };
  assert.equal(prtimes.pickCompany(snap, '株式会社エクスクリエ'), 'https://prtimes.jp/main/html/searchrlp/company_id/222');
  assert.equal(prtimes.pickCompany(snap, '株式会社別会社'), null);
});

test('PR TIMES 企業情報', () => {
  const text = '企業情報\n基本情報\n業種\n情報通信\n本社所在地\n東京都中央区日本橋2-11-2\n太陽生命日本橋ビル18階\n電話番号\n03-0000\n代表者名\n大高\n設立\n2008年03月\nURL\nhttps://www.tm-nets.com/\n詳細情報\nX';
  const r = prtimes.parseCompany({ text });
  assert.equal(r.address, '東京都中央区日本橋2-11-2 太陽生命日本橋ビル18階');
  assert.equal(r.url, 'https://www.tm-nets.com/');
});

test('アスピック 詳細: 会社名・所在地', () => {
  const r = aspic.parseService({ text: 'SNS ONE MATCH\n会社概要\n会社名\tone move株式会社\n代表者名\t原 慎吾\n所在地\t〒150-6013 東京都渋谷区恵比寿4-20-3\n資料ダウンロード' });
  assert.equal(r.company, 'one move株式会社');
  assert.equal(r.address, '〒150-6013 東京都渋谷区恵比寿4-20-3');
});

test('Web幹事 一覧と会社ページ', () => {
  const list = webkanji.parseList({ anchors: [
    { href: 'https://web-kanji.com/companies/comnico', text: '株式会社コムニコ' },
    { href: 'https://web-kanji.com/companies/industries', text: 'その他の業界' },
    { href: 'https://web-kanji.com/companies/comnico', text: '株式会社コムニコ' },
  ] });
  assert.deepEqual(list.map((x) => x.slug), ['comnico']);
  const r = webkanji.parseCompany({ title: '株式会社コムニコの制作実績と評判 | Web幹事', text: '特徴\nSNSに強い\nSNS運用代行可能', anchors: [
    { href: 'https://douga-kanji.com/', text: '' }, { href: 'https://www.comnico.jp/', text: '' } ] });
  assert.equal(r.officialUrl, 'https://www.comnico.jp/');
  assert.ok(r.features.includes('SNS運用代行可能'));
});

test('比較ビズ 一覧カード', () => {
  const text = ['企業を選択する','株式会社セグロス','特色','ノウハウ','有村　智也','東京都品川区東五反田2-9-5','実績(23)','対応業務','営業代行','特徴','スピーディー','企業を選択する','株式会社ツクモ','東京都豊島区東池袋1-34-5','対応業務','テレマーケティング'].join('\n');
  const r = hikakubiz.parseList({ text, anchors: [
    { href: 'https://www.biz.ne.jp/company/segros/', text: '' }, { href: 'https://www.biz.ne.jp/company/tsukumo/', text: '' } ] });
  assert.equal(r.length, 2);
  assert.equal(r[0].address, '東京都品川区東五反田2-9-5');
  assert.equal(r[1].slug, 'tsukumo');
});

test('求人ボックス 一覧: タイトル/会社名/勤務地', () => {
  const text = ['SNS運用スタッフ／Webマーケティング・ネット広告','株式会社ドクターブリッジ','東京都 渋谷区 渋谷駅 徒歩8分','年収300万円～600万円','正社員',
    '経験2年以上／SNSアカウント運用','東京都','時給～3,180円','業務委託'].join('\n');
  const r = kyujinbox.parseList({ text });
  assert.equal(r.length, 1);
  assert.equal(r[0].company, '株式会社ドクターブリッジ');
  assert.equal(r[0].title, 'SNS運用スタッフ／Webマーケティング・ネット広告');
});

test('バズ担 一覧: 運営会社・所在地・公式URL', () => {
  const text = ['アイビス','Facebookなどを実施している会社です。','項目\t内容','運営会社\t株式会社アイビス','所在地\t大阪府大阪市浪速区湊町2-1-7-5F','公式URL\thttps://mag.ibis.gs/ 、 https://ibis.gs/x/','電話番号\t0800',
    'アイビスのSNSコンサルの評判・費用について詳しく','いつも','売ることを目的にした会社です。','項目\t内容','運営会社\t株式会社いつも','所在地\t東京都千代田区有楽町1-13-2-21F','公式URL\thttps://itsumo365.co.jp/','電話番号\t03'].join('\n');
  const r = buzztan.parseList({ text });
  assert.equal(r.length, 2);
  assert.equal(r[0].url, 'https://mag.ibis.gs/');
  assert.equal(r[1].company, '株式会社いつも');
  assert.equal(r[1].address, '東京都千代田区有楽町1-13-2-21F');
  assert.equal(r[1].brand, 'いつも');
});

test('デジタル化の窓口 製品ページ', () => {
  const r = digimado.parseProduct({
    title: 'NEX-RAY の特徴・料金・機能と導入事例の一覧| デジタル化の窓口',
    text: '本文\n運営企業情報\n商号\nフィシルコム株式会社\n本社\n東京都千代田区神田佐久間町3丁目19\n創立\n代表者名\n与謝　秀作\n資本金\nURL\n\nこの記事を共有する',
    anchors: [{ href: 'https://digi-mado.jp/cases/', text: '' }, { href: 'https://corp.ficilcom.jp/', text: '情報取得元' }],
  });
  assert.equal(r.company, 'フィシルコム株式会社');
  assert.equal(r.address, '東京都千代田区神田佐久間町3丁目19');
  assert.equal(r.officialUrl, 'https://corp.ficilcom.jp/');
  assert.equal(r.product, 'NEX-RAY');
});

test('エンゲージ 一覧: 会社名 / 職種 + 勤務地', () => {
  const text = ['未経験OK','【R8】SNS運用＠初台','アデコ株式会社 / SNS運用スタッフ','時給 1,720円 ～','交通費支給あり','東京都新宿区','初台','2日前','経験者優遇','株式会社テンポスホールディングス / SNS運用コンサルタント','月給 30万円 ～','東京都大田区'].join('\n');
  const r = engage.parseList({ text });
  assert.deepEqual(r.map((x) => x.company), ['アデコ株式会社', '株式会社テンポスホールディングス']);
  assert.equal(r[0].location, '東京都新宿区');
});

test('求人文面(jobText)はカテゴリ判定の根拠にならない', () => {
  const c = newCompany('株式会社テスト');
  addEvidence(c, 'jobText', 'SNS運用スタッフ募集 SNSマーケティング', { source: 'engage', url: 'u' });
  assert.deepEqual(consolidate(c).categories, []);
  addEvidence(c, 'profileText', 'SNSアカウント運用代行を提供', { source: 'official', url: 'u2' });
  assert.deepEqual(consolidate(c).categories, ['SNS運用代行']);
});

test('公式URLは情報源の優先順位で選ぶ(製品サイトを指しがちな媒体は後ろ)', () => {
  const c = newCompany('テテマーチ株式会社');
  setOfficialUrl(c, 'https://sinis.jp/lp', { source: 'digimado', url: 'u1' });
  setOfficialUrl(c, 'https://tetemarche.co.jp/company', { source: 'webkanji', url: 'u2' });
  const b = bestOfficial(c);
  assert.equal(b.url, 'https://tetemarche.co.jp/');
  assert.deepEqual(b.others, ['https://sinis.jp/']);
  assert.ok(consolidate(c).notes.some((n) => n.includes('公式URL候補が複数')));
});

test('SNS運用代行の一覧掲載媒体を列挙', () => {
  const c = newCompany('株式会社テスト');
  c.sources.push({ source: 'buzztan', url: 'u' }, { source: 'wantedly', url: 'u' }, { source: 'boxil', url: 'u' });
  assert.deepEqual(consolidate(c).listedBy.sort(), ['boxil', 'buzztan']);
});

test('ミツモア: 一覧のサービス、会社名の表記ゆれ補正、製品URL', () => {
  const list = meetsmore.parseList({ anchors: [
    { href: 'https://meetsmore.com/products/comnic', text: 'コムニコ' },
    { href: 'https://meetsmore.com/products/comnic', text: '費用相場' },
    { href: 'https://meetsmore.com/product-services/sns-operation-agency/media/1', text: '費用相場' },
    { href: 'https://meetsmore.com/products/FULLSPEED', text: 'フルスピード' },
  ] });
  assert.deepEqual(list.map((x) => x.slug), ['comnic', 'FULLSPEED']);
  assert.equal(meetsmore.cleanCompany('株株式会社コムニコ（comnico inc.）'), '株式会社コムニコ');
  const r = meetsmore.parseProduct({ text: 'コムニコ\n株株式会社コムニコ（comnico inc.）\nコムニコなど人気の\n製品URL\nhttps://www.comnico.jp/services/consulting\n更新日' });
  assert.equal(r.company, '株式会社コムニコ');
  assert.equal(r.url, 'https://www.comnico.jp/services/consulting');
});

test('ミツモア: サービス名の行(…（株式会社X）)を会社名に使わない', () => {
  const r = meetsmore.parseProduct({ text: '運用代行サービス（株式会社４Ｘ）\n株式会社４Ｘ\n運用代行サービス（株式会社４Ｘ）など人気の\n製品URL\nhttps://4x-corp.com/service' });
  assert.equal(r.company, '株式会社４Ｘ');
});

test('製品ページ系の媒体だけが公式URLの根拠なら本体サイトの探し直し対象', () => {
  const c = newCompany('株式会社テスト');
  setOfficialUrl(c, 'https://product.example/', { source: 'meetsmore', url: 'u' });
  assert.equal(needsCorporateUrl(c), true);
  setOfficialUrl(c, 'https://corp.example/', { source: 'prtimes', url: 'u2' });
  assert.equal(needsCorporateUrl(c), false);
  assert.equal(bestOfficial(c).url, 'https://corp.example/');
});

test('slide lib: 見出し→サービスサイトへ の対応、注記の除去', () => {
  const text = ['比較表','SNS ONE MATCH（one move株式会社）','SNS ONE MATCHは、SNS運用を行うサービスです。','対応SNS\tInstagram','サービスサイトへ','資料を見てみる',
    '株式会社SAKIYOMI（Instagram特化）','引用：株式会社SAKIYOMI','説明文が続きます。','サービスサイトへ','サービスサイトへ','株式会社デジアサ','株式会社デジアサは、テレビ制作のノウハウを持つ会社です。','サービスサイトへ'].join('\n');
  const r = slidelib.parseArticle({ text, anchors: [
    { href: 'https://onemove.co.jp/SNS', text: 'サービスサイトへ' },
    { href: 'https://sns-sakiyomi.com/', text: 'サービスサイトへ' },
    { href: 'https://sns-sakiyomi.com/second', text: 'サービスサイトへ' },
    { href: 'https://digima.asahi.co.jp/', text: 'サービスサイトへ' } ] });
  assert.deepEqual(r.map((x) => x.company), ['one move株式会社', '株式会社SAKIYOMI', '株式会社デジアサ']);
  assert.deepEqual(r.map((x) => x.url), ['https://onemove.co.jp/SNS', 'https://sns-sakiyomi.com/', 'https://digima.asahi.co.jp/']);
});

test('Gビズインフォ 検索結果の表を解析し、同名の取り違えを避ける', () => {
  const text = ['「株式会社コムニコ」 の検索結果　 632件','法人名','本店所在地','株式会社コムニコ','\t東京都港区\t-\t-\t154人\t3件','株式会社コムニコ','\t大阪府大阪市\t-\t-\t-\t0件','株式会社コムニコス','\t東京都中央区\t-\t-\t-\t6件','株式会社コムニテ(閉鎖)','\t静岡県浜松市\t-\t-\t-\t0件'].join('\n');
  const rows = gbizinfo.parseResults(text);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].employees, 154);
  const hit = gbizinfo.pickRow(rows, '株式会社コムニコ', ['東京都港区新橋']);
  assert.equal(hit.sameName, 2);
  assert.equal(hit.row.address, '東京都港区');
  assert.equal(gbizinfo.pickRow(rows, '株式会社コムニ', []), null);
  // 既知の住所(東京都渋谷区)と合う同名行が無ければ採用しない（別会社の可能性）
  assert.equal(gbizinfo.pickRow(rows, '株式会社コムニコ', ['東京都渋谷区神宮前']), null);
  // 既知の住所が無く同名が複数あれば東京都の行を優先
  assert.equal(gbizinfo.pickRow(rows, '株式会社コムニコ', []).row.address, '東京都港区');
});

test('Gビズインフォの値は10〜40名付近だと断定しない', () => {
  const c = newCompany('株式会社テスト');
  addEvidence(c, 'employees', 15, { source: 'gbizinfo', url: 'u', snippet: '' });
  addEvidence(c, 'address', '東京都渋谷区1-1', { source: 'official', url: 'u' });
  const r = consolidate(c);
  assert.equal(r.emp20, null);
  assert.notEqual(r.status, '除外');
  const c2 = newCompany('株式会社テスト2');
  addEvidence(c2, 'employees', 5, { source: 'gbizinfo', url: 'u', snippet: '' });
  assert.equal(consolidate(c2).emp20, false);
});

test('グリップ: 一覧リンクと会社概要', () => {
  const list = grip.parseList({ anchors: [
    { href: 'https://grip-space.co.jp/ad-db/company/3861646', text: '株式会社アドウェイズ\n東京都新宿区' },
    { href: 'https://grip-space.co.jp/ad-db/company/3861646', text: '続きを見る' },
    { href: 'https://grip-space.co.jp/web-db/company/12', text: '株式会社テスト' },
    { href: 'https://grip-space.co.jp/ad-db/pref/tokyo', text: '東京都' } ] });
  assert.deepEqual(list.map((x) => x.name), ['株式会社アドウェイズ', '株式会社テスト']);
  const r = grip.parseCompany({ text: '会社概要\n会社名\t株式会社アドウェイズ\n所在地\t東京都新宿区西新宿５丁目１番１号\n公式サイト\thttps://www.adways.net\n従業員数\t745名\n法人番号\t7011101041652\n会社について\t広告事業\nメディア事業\n\n次' });
  assert.equal(r.employees, 745);
  assert.equal(r.officialUrl, 'https://www.adways.net');
  assert.equal(r.address, '東京都新宿区西新宿５丁目１番１号');
});

test('全国法人: 見出しを住所と取り違えず、従業員数と住所を取る', () => {
  const text = ['都道府県で探す','検索結果1,978件中 1件目〜50件目を表示','株式会社日宣','ニッセン','証券番号','6543','本社東京都千代田区・サービス業・資本金32,030万円・従業員106名','サービス業','広告業界',' 東京都千代田区神田司町２丁目６番地５','更新日：2026年06月22日',
    '株式会社テスト広告','テストコウコク','広告業界',' 東京都渋谷区代々木２丁目２番２号 求人情報提供','更新日：2026年09月22日'].join('\n');
  const r = houjingoo.parseList({ text });
  assert.equal(r.length, 2);
  assert.equal(r[0].employees, 106);
  assert.equal(r[0].address, '東京都千代田区神田司町２丁目６番地５');
  assert.equal(r[1].address, '東京都渋谷区代々木２丁目２番２号');
});

test('PITACT: 住所・従業員数', () => {
  const text = ['株式会社フォルマ','','更新日:2025年02月21日','','法人番号','6012401001421','住所','東京都府中市宮町１丁目４１番地','電話番号','042-366-4141','従業員数','--','商業施設運営',
    '株式会社デンコー','','更新日:2025年02月21日','','法人番号','7010901007739','住所','東京都世田谷区尾山台３丁目９番１号','電話番号','03','従業員数','20人'].join('\n');
  const r = pitact.parseList({ text });
  assert.equal(r.length, 2);
  assert.equal(r[0].employees, null);
  assert.equal(r[1].employees, 20);
  assert.equal(r[1].corpNo, '7010901007739');
});

test('AgencyHub: 規模レンジの下限', () => {
  const text = ['詳細','株式会社アド・ウォーク','販促を支援する会社。','専門特化','SNS支援','大阪市','31-100名','詳細を見る','株式会社テスト','説明','総合支援','東京','HPに記載なし','詳細を見る'].join('\n');
  const r = agencyhub.parseList({ text });
  assert.equal(r.length, 2);
  assert.equal(r[0].employeesMin, 31);
  assert.deepEqual(r[0].tags, ['専門特化', 'SNS支援']);
  assert.equal(r[1].employeesMin, null);
});

test('JCIA: 会員名簿の行', () => {
  const r = jcia.parseList({ text: 'ア行\nアース製薬株式会社\t101-0048\t東京都千代田区神田司町2-12-1\t03-5207-7451\t\n株式会社アーダン\t894-0007\t鹿児島県奄美市\t0997\t' });
  assert.equal(r.length, 2);
  assert.equal(r[0].address, '東京都千代田区神田司町2-12-1');
});

test('JARO: 業種見出しごとの社名', () => {
  const s = jaro.parseSections({ text: '広告主(367社)\n化粧品・トイレタリー (2社)\n株式会社アリミノ\n株式会社伊勢半\n食品 (1社)\n味の素株式会社' });
  assert.deepEqual(s['化粧品・トイレタリー'], ['株式会社アリミノ', '株式会社伊勢半']);
  assert.deepEqual(s['食品'], ['味の素株式会社']);
});

test('AgencyHubの規模は推定扱い(閾値付近は断定しない)', () => {
  const c = newCompany('株式会社テスト');
  addEvidence(c, 'employees', 11, { source: 'agencyhub', url: 'u', snippet: '11-30名' });
  addEvidence(c, 'address', '東京都渋谷区1-1', { source: 'grip', url: 'u' });
  const r = consolidate(c);
  assert.equal(r.emp20, null);
  assert.ok(r.notes.some((n) => n.includes('AgencyHub')));
});

test('住所が一致しない情報源の従業員数は使わない(同名の別会社)', () => {
  const c = newCompany('株式会社アクシス');
  addEvidence(c, 'address', '東京都港区三田5-8-8', { source: 'official', url: 'u1' });
  addEvidence(c, 'address', '鳥取県米子市夜見町3024-37', { source: 'salesnow', url: 'u2' });
  addEvidence(c, 'employees', 1, { source: 'salesnow', url: 'u2', snippet: '' });
  const r = consolidate(c);
  assert.equal(r.employees, null);
  assert.notEqual(r.status, '除外');
  assert.ok(r.notes.some((n) => n.includes('不採用')));
});

test('記事抽出: 見出しの直後に「<名前>は…」で始まる説明文がある行を企業とみなす', () => {
  const text = ['目次','【2026年版】インフルエンサー事務所一覧','CARAFUL','Nadia Management','CARAFUL','TikTok特化の事務所です。','CARAFULは2019年設立のインフルエンサーマーケティング企業です。',
    'CRAZE/株式会社Greed','CRAZE/株式会社Greedは、大手事務所です。','株式会社Greedは、テスト。','Nadia Management','Nadia Managementは2012年設立の料理家プロダクションです。','選び方のポイント','選び方のポイントは次の5つです。','まとめ','まとめは以下の通りです。'].join('\n');
  const r = article.parseArticle({ text });
  const names = r.map((x) => x.company);
  assert.ok(names.includes('CARAFUL'));
  assert.ok(names.includes('Nadia Management'));
  assert.ok(names.includes('株式会社Greed'));
  assert.ok(!names.includes('まとめ'));
  assert.deepEqual(article.nameVariants('第1位：A社（株式会社エー）'), ['株式会社エー', 'A社']);
});

test('PR TIMES 検索結果: 企業ページリンクを重複なく取る', () => {
  const r = prtimes.parseSearchCompanies({ anchors: [
    { href: 'https://prtimes.jp/main/html/searchrlp/company_id/45188', text: 'ニーリー\n株式会社' },
    { href: 'https://prtimes.jp/main/html/searchrlp/company_id/45188', text: '' },
    { href: 'https://prtimes.jp/main/html/searchrlp/company_id/23490', text: 'FANTAS technology株式会社' },
    { href: 'https://prtimes.jp/main/html/rd/p/1.html', text: 'リリース' } ] });
  assert.deepEqual(r.map((x) => x.id), ['45188', '23490']);
  assert.equal(r[0].name, 'ニーリー');
});

test('サンプル出力: 広告代理店は従業員数2,000名超を含めない', () => {
  const mk = (name, emp) => {
    const c = newCompany(name);
    c.seedCategories.push('ad_agency');
    c.officialUrl = 'https://' + name + '.example/';
    addEvidence(c, 'address', '東京都渋谷区1-1', { source: 'official', url: 'u' });
    addEvidence(c, 'employees', emp, { source: 'official', url: 'u', snippet: '' });
    addEvidence(c, 'contactUrl', 'https://' + name + '.example/contact', { source: 'official', url: 'u' });
    addEvidence(c, 'profileText', '広告代理店', { source: 'grip', url: 'u' });
    c.sources.push({ source: 'grip', url: 'u' });
    const ok = { result: 'OK', comment: '', after: null };
    c.checks = { verifiedAt: '2026-10-06', industry: { 'ad_agency': ok }, employees: ok, contact: ok, identity: ok };
    return c;
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sample-'));
  const { summary } = exportSample([mk('mid', 500), mk('edge', 2000), mk('big', 6000)], { outDir: dir });
  assert.equal(summary['広告代理店'], 2);
  const csv = fs.readFileSync(path.join(dir, 'sample.csv'), 'utf8');
  assert.ok(csv.includes('mid') && csv.includes('edge') && !csv.includes('big'));
});

import * as mynavi from '../src/sources/mynavi.js';

test('マイナビ(新卒) 検索結果・会社概要', () => {
  const text = `企業検索結果3社

最終更新日：2026/09/25

サラヤグループ【サラヤ(株)／東京サラヤ(株)】
業　種 化学 、 薬品、食品、化粧品、医療用機器・医療関連
本　社大阪府大阪市東住吉区、東京都品川区
従業員1000 ～ 3000人未満

衛生・感染対策のプロフェッショナル

最終更新日：2026/02/04

トーアン(株)
業　種 商社（複合）
本　社福島県郡山市
従業員50 ～ 100人未満
`;
  const rows = mynavi.parseResults(text);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].hq, '大阪府大阪市東住吉区、東京都品川区');
  assert.deepEqual(mynavi.nameCandidates(rows[0].title).sort(), ['サラヤ', 'サラヤグルプ', '東京サラヤ'].sort());
  const links = rows.map((r, i) => ({ href: `https://job.mynavi.jp/28/pc/search/corp${i}/outline.html`, text: r.title }));
  const hit = mynavi.pickEntry(rows, links, 'サラヤ株式会社', ['東京都品川区東品川']);
  assert.equal(hit.url, 'https://job.mynavi.jp/28/pc/search/corp0/outline.html');
  assert.equal(mynavi.pickEntry(rows, links, 'サラヤ株式会社', ['神奈川県横浜市']), null); // 本社の都道府県が合わない = 別会社の可能性
  assert.equal(mynavi.pickEntry(rows, links, 'アミック株式会社', []), null);

  const o = mynavi.parseOutline('会社データ\n本社郵便番号\t546-0013\n本社所在地\t大阪府大阪市東住吉区湯里2-2-8\n創業\t1952年\n設立\t1959年\n資本金\t4,500万円\n従業員\t2,274名（連結2社　2025年11月現在）\n');
  assert.equal(o.employees, 2274);
  assert.equal(o.address, '大阪府大阪市東住吉区湯里2-2-8');
  assert.equal(o.founded, '1959年');
  assert.equal(mynavi.parseOutline('従業員\tグループ連結　13,135名（2025年12月期末 嘱託・パートを含む）').employees, 13135);
  assert.equal(mynavi.parseOutline('従業員\t1000 ～ 3000人未満').employees, null);
});

import * as digitre from '../src/sources/digitre.js';

test('デジトレ 一覧・会社ページ', () => {
  const list = digitre.parseList({
    anchors: [
      { href: 'https://www.digi-tre.com/company/ruk/', text: 'RUK株式会社\n\nRUK株式会社は、広告運用' },
      { href: 'https://www.digi-tre.com/company/ruk/', text: 'もっと見る' },
      { href: 'https://www.digi-tre.com/area/s-tokyo/page/2/', text: '2' },
      { href: 'https://www.digi-tre.com/company/gmo-nikko/', text: 'GMO NIKKO株式会社\n\nGMO NIKKOは' },
    ],
  });
  assert.deepEqual(list.map((x) => x.name), ['RUK株式会社', 'GMO NIKKO株式会社']);
  const c = digitre.parseCompany({ text: '会社案内\nGMO NIKKOは総合マーケティング支援会社で、\n会社情報\n会社名\nGMO NIKKO株式会社 （英文表記：GMO NIKKO Inc.）\n所在地\n本社所在地 〒150-0043 東京都渋谷区道玄坂1-2-3渋谷フクラス\n宮崎オフィス所在地 〒880-0801 宮崎県宮崎市\n事業内容\n総合マーケティング支援事業\n' });
  assert.equal(c.name, 'GMO NIKKO株式会社');
  assert.equal(c.address, '東京都渋谷区道玄坂1-2-3渋谷フクラス');
});

test('比較記事: 「〜とは」の見出しは企業にしない', () => {
  const r = article.parseArticle({ text: 'SNS運用代行とは\nSNS運用代行とは、アカウント運用を任せることです。\n株式会社テスト\n株式会社テストは、SNS運用を行う会社です。\n' });
  assert.deepEqual(r.map((x) => x.company), ['株式会社テスト']);
});

test('比較記事: 都道府県名だけの見出しは企業にしない', () => {
  const r = article.parseArticle({ text: '東京都\n東京都に拠点を置くインスタ運用代行会社です。\nオア―ド株式会社\nオア―ド株式会社は、東京都に拠点を置く会社。\n' });
  assert.deepEqual(r.map((x) => x.company), ['オア―ド株式会社']);
});

import * as careertasu from '../src/sources/careertasu.js';
import * as openwork from '../src/sources/openwork.js';

test('キャリタス就活 検索結果・会社データ', () => {
  const rows = careertasu.parseResults({
    anchors: [
      { href: 'https://job.career-tasu.jp/corp/00021375/default/?tcd=x', text: '大阪府化学・石油｜医薬品｜食品\n\nサラヤ株式会社\n4.17\n12フォロワー\nフォローする' },
      { href: 'https://job.career-tasu.jp/corp/00024600/default/', text: '東京都化学・石油｜医療関連\n\n東京サラヤ株式会社\n-\n5フォロワー' },
      { href: 'https://job.career-tasu.jp/corp/00071579/default/', text: '静岡県ソフトウェア\n\n株式会社アミック\n-\n0フォロワー' },
    ],
  });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].pref, '大阪府');
  assert.equal(rows[0].url, 'https://job.career-tasu.jp/corp/00021375/detail-uc/');
  assert.equal(careertasu.pickEntry(rows, 'サラヤ株式会社', []).url, rows[0].url);
  assert.equal(careertasu.pickEntry(rows, 'サラヤ株式会社', ['東京都品川区']), null); // 既知の住所と都道府県が合わない
  assert.equal(careertasu.pickEntry(rows, '東京サラヤ株式会社', ['東京都品川区']).url, rows[1].url);
  const d = careertasu.parseDetail('創業/設立\n1959年2月\n本社所在地1\n大阪府大阪市東住吉区湯里２-２-８\n電話番号\n06\n資本金\n4,500万円\n従業員数\n2,239名（2024年10月現在）（正社員、契約社員、アルバイト・パート含む）\n');
  assert.equal(d.employees, 2239);
  assert.equal(d.address, '大阪府大阪市東住吉区湯里２-２-８');
  assert.equal(d.founded, '1959年2月');
});

test('OpenWork 検索結果・会社ページ', () => {
  const list = openwork.parseList({
    anchors: [
      { href: 'https://www.openwork.jp/company.php?m_id=a0C10000011UUpz&utm=x', text: '株式会社コムニコ' },
      { href: 'https://www.openwork.jp/company.php?m_id=a0C10000011UUpz', text: 'クチコミ' },
      { href: 'https://www.openwork.jp/company_list?src_str=x', text: '企業一覧' },
    ],
  });
  assert.deepEqual(list, [{ name: '株式会社コムニコ', url: 'https://www.openwork.jp/company.php?m_id=a0C10000011UUpz' }]);
  const c = openwork.parseCompany('x\n企業情報\n業界\nSIer、ソフト開発\nURL\nhttp://www.comnico.jp/\n所在地\n東京都港区虎ノ門4-1-13\n社員数\n100〜499人\nもっと見る ▼\n');
  assert.equal(c.url, 'http://www.comnico.jp/');
  assert.equal(c.address, '東京都港区虎ノ門4-1-13');
  assert.deepEqual(openwork.parseRange(c.range), { min: 100, max: 499 });
  assert.deepEqual(openwork.parseRange('1000人以上'), { min: 1000, max: null });
  assert.equal(openwork.parseRange('不明'), null);
  const cands = [{ info: { address: '大阪府大阪市' }, url: 'a' }, { info: { address: '東京都港区' }, url: 'b' }];
  assert.equal(openwork.pickCompany(cands, []).url, 'b'); // 既知の住所が無ければ東京都を優先
  assert.equal(openwork.pickCompany(cands, ['大阪府吹田市']).url, 'a');
  assert.equal(openwork.pickCompany(cands, ['愛知県名古屋市']), null);
});

test('サンプル出力: 検証が全てOKでない会社はサンプルに入れず、sample_review.csv に出す', () => {
  const mk = (name, contact) => {
    const c = newCompany(name);
    c.seedCategories.push('ad_agency');
    c.officialUrl = 'https://' + name + '.example/';
    addEvidence(c, 'address', '東京都渋谷区1-1', { source: 'official', url: 'u' });
    addEvidence(c, 'employees', 100, { source: 'official', url: 'u', snippet: '従業員数 100名' });
    addEvidence(c, 'contactUrl', 'https://' + name + '.example/contact', { source: 'official', url: 'u' });
    addEvidence(c, 'profileText', '広告代理店', { source: 'grip', url: 'u' });
    const ok = { result: 'OK', comment: '', after: null };
    c.checks = { verifiedAt: '2026-10-06', industry: { ad_agency: ok }, employees: ok, contact, identity: ok };
    return c;
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sample-'));
  const { summary, review } = exportSample([mk('good', { result: 'OK', comment: '', after: null }), mk('irpage', { result: '要確認', comment: 'IR専用', after: null })], { outDir: dir });
  assert.equal(summary['広告代理店'], 1);
  assert.equal(review, 1);
  assert.ok(fs.readFileSync(path.join(dir, 'sample_review.csv'), 'utf8').includes('irpage'));
  assert.ok(!fs.readFileSync(path.join(dir, 'sample.csv'), 'utf8').includes('irpage'));
});

// ---------------------------------------------------------------- EDINET(有価証券報告書)
const CODELIST = [
  'ダウンロード実行日,2026年10月07日現在,件数,4件',
  '"ＥＤＩＮＥＴコード","提出者種別","上場区分","連結の有無","資本金","決算日","提出者名","提出者名（英字）","提出者名（ヨミ）","所在地","提出者業種","証券コード","提出者法人番号"',
  '"E04760","内国法人・組合","上場","有","74609","12月31日","株式会社電通グループ","DENTSU GROUP INC.","","港区東新橋一丁目８番１号","サービス業","43240","4010401048922"',
  '"E90001","内国法人・組合","非上場","無","100","3月31日","株式会社同名","X","","大阪市西区靱本町","サービス業","",""',
  '"E90002","内国法人・組合","非上場","無","100","3月31日","株式会社同名","X","","横浜市西区みなとみらい","サービス業","",""',
  '"E90003","内国法人・組合（有価証券報告書等の提出義務者以外）","非上場","無","100","3月31日","株式会社対象外","X","","千代田区","サービス業","",""',
].join('\r\n');

test('EDINETコード一覧の解析と提出者の選択', () => {
  const rows = edinet.parseCodeList(CODELIST);
  assert.equal(rows.length, 4);
  assert.deepEqual([rows[0].code, rows[0].name, rows[0].secCode, rows[0].consolidated], ['E04760', '株式会社電通グループ', '43240', '有']);
  // 名前+東京の既知住所 → 一致。住所が合わなければ別会社として採用しない
  assert.equal(edinet.pickFiler(rows, '電通グループ', ['東京都港区南青山']).row.code, 'E04760');
  assert.equal(edinet.pickFiler(rows, '株式会社電通グループ', ['東京都渋谷区神宮前']), null);
  // 住所が無くても同名が1社なら採用（照合なしの印つき）
  assert.deepEqual([edinet.pickFiler(rows, '株式会社電通グループ', []).row.code, edinet.pickFiler(rows, '株式会社電通グループ', []).byAddress], ['E04760', false]);
  // 同名が複数: 住所で1社に絞れれば採用、住所なしは断定しない。「西区」の大阪/横浜も市で区別する
  assert.equal(edinet.pickFiler(rows, '株式会社同名', []), null);
  assert.equal(edinet.pickFiler(rows, '株式会社同名', ['大阪府大阪市西区靱本町1-1']).row.code, 'E90001');
  assert.equal(edinet.pickFiler(rows, '株式会社同名', ['神奈川県横浜市西区']).row.code, 'E90002');
  // 提出義務者以外は対象外
  assert.equal(edinet.pickFiler(rows, '株式会社対象外', []), null);
  // 区だけの住所は東京23区。東京以外の既知住所とは合わない
  assert.equal(edinet.sameLocation('大阪府大阪市北区', '北区'), false);
  assert.equal(edinet.sameLocation('東京都北区', '北区'), true);
});

test('EDINETの所在地に都道府県を補う', () => {
  assert.equal(edinet.withPrefecture('港区東新橋一丁目８番１号'), '東京都港区東新橋一丁目8番1号');
  assert.equal(edinet.withPrefecture('横浜市西区みなとみらい', ['神奈川県横浜市']), '神奈川県横浜市西区みなとみらい');
  assert.equal(edinet.withPrefecture('四條畷市中野新町', []), '四條畷市中野新町'); // 補えないものはそのまま
});

const q = (cells) => cells.map((x) => `"${x}"`).join('\t');
const emp = (ctx, v) => q(['jpcrp_cor:NumberOfEmployees', '従業員数', ctx, '当期末', 'その他', '時点', 'pure', '', v]);

test('有報CSVから従業員数(単体/連結)を取る', () => {
  const csv = [
    q(['要素ID', '項目名', 'コンテキストID', '相対年度', '連結・個別', '期間・時点', 'ユニットID', '単位', '値']),
    emp('Prior1YearInstant', '402'),
    emp('CurrentYearInstant', '1,786'),
    emp('CurrentYearInstant_NonConsolidatedMember', '568'),
    emp('CurrentYearInstant_jpcrp030000-asr_E01024-000JapanReportableSegmentsMember', '665'),
    emp('CurrentYearInstant_NonConsolidatedMember_CorporateSharedMember', '81'),
  ].join('\r\n');
  assert.deepEqual(edinet.parseEmployeesCsv(csv), { cur: 1786, nonCons: 568 });
  assert.deepEqual(edinet.parseEmployeesCsv(emp('CurrentYearInstant', '－')), { cur: null, nonCons: null });
  // 単体があれば単体。連結のみで連結財務諸表を作る会社は「連結」(単体として断定しない)。連結を作らない会社の当期末は単体
  assert.deepEqual(edinet.chooseEmployees({ cur: 1786, nonCons: 568 }, true), { value: 568, scope: '提出会社単体', consolidated: 1786 });
  assert.deepEqual(edinet.chooseEmployees({ cur: 143, nonCons: null }, true), { value: 143, scope: '連結', consolidated: null });
  assert.deepEqual(edinet.chooseEmployees({ cur: 143, nonCons: null }, false), { value: 143, scope: '提出会社単体', consolidated: null });
  assert.equal(edinet.chooseEmployees({ cur: null, nonCons: null }, true), null);
});

test('書類一覧: 有価証券報告書だけを選び、コードごとに最新を残す', () => {
  const d = (o) => ({ docID: 'S1', edinetCode: 'E1', docTypeCode: '120', formCode: '030000', ordinanceCode: '010', withdrawalStatus: '0', periodEnd: '2026-03-31', submitDateTime: '2026-06-25 09:00', ...o });
  assert.equal(edinet.isAnnualReport(d({})), true);
  assert.equal(edinet.isAnnualReport(d({ docTypeCode: '140' })), false); // 四半期報告書
  assert.equal(edinet.isAnnualReport(d({ formCode: '07A000' })), false); // 投資信託の有報
  assert.equal(edinet.isAnnualReport(d({ withdrawalStatus: '1' })), false); // 取下げ
  const m = edinet.latestByCode([d({ docID: 'old', periodEnd: '2025-03-31' }), d({ docID: 'new' }), d({ docID: 'other', edinetCode: 'E2' })]);
  assert.equal(m.get('E1').docID, 'new');
  assert.equal(m.size, 2);
});

test('ZIPの読み出し(deflate・無圧縮)', () => {
  const zip = (entries) => {
    const locals = [];
    const centrals = [];
    let off = 0;
    for (const [name, data, method] of entries) {
      const raw = method === 8 ? zlib.deflateRawSync(data) : data;
      const nm = Buffer.from(name);
      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0);
      lh.writeUInt16LE(method, 8);
      lh.writeUInt32LE(raw.length, 18);
      lh.writeUInt16LE(nm.length, 26);
      locals.push(lh, nm, raw);
      const ch = Buffer.alloc(46);
      ch.writeUInt32LE(0x02014b50, 0);
      ch.writeUInt16LE(method, 10);
      ch.writeUInt32LE(raw.length, 20);
      ch.writeUInt16LE(nm.length, 28);
      ch.writeUInt32LE(off, 42);
      centrals.push(ch, nm);
      off += 30 + nm.length + raw.length;
    }
    const cd = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(cd.length, 12);
    end.writeUInt32LE(off, 16);
    return Buffer.concat([...locals, cd, end]);
  };
  const out = readZip(zip([['a/b.csv', Buffer.from('こんにちは'.repeat(50)), 8], ['c.txt', Buffer.from('plain'), 0], ['dir/', Buffer.alloc(0), 0]]));
  assert.deepEqual(out.map((e) => e.name), ['a/b.csv', 'c.txt']);
  assert.equal(out[0].data.toString(), 'こんにちは'.repeat(50));
  assert.equal(out[1].data.toString(), 'plain');
});

test('EDINET: 検索→証拠の追加（API部分は差し替え）と、判定への反映', async () => {
  const fake = {
    codeList: async () => edinet.parseCodeList(CODELIST),
    docIndex: async () => new Map([['E04760', { docID: 'S100XS0O', periodEnd: '2025-12-31', submitDateTime: '2026-03-26 15:00' }]]),
    employeesOf: async () => ({ cur: 67454, nonCons: 135 }),
  };
  const c = newCompany('株式会社電通グループ');
  addEvidence(c, 'address', '東京都港区東新橋', { source: 'official', url: 'u', snippet: '' });
  addEvidence(c, 'employees', 60000, { source: 'official', url: 'u', snippet: 'グループ全体で60,000名' });
  assert.equal(await edinet.lookup(c, { edinet: fake, log: () => {} }), true);
  const r = consolidate(c);
  // 有報(単体)が公式のグループ値より優先され、確認済み。連結値は備考に出る
  assert.deepEqual([r.employees, r.employeesSource, r.empConfirmed], [135, 'edinet', true]);
  assert.equal(r.edinetCode, 'E04760');
  assert.equal(r.securitiesCode, '4324');
  assert.equal(r.address, '東京都港区東新橋一丁目8番1号');
  assert.match(r.notes.join(' '), /連結従業員数は67454名/);
  // 再実行しても証拠が重複しない
  await edinet.lookup(c, { edinet: fake, log: () => {} });
  assert.equal(c.evidence.filter((e) => e.source === 'edinet' && e.field === 'employees').length, 1);
  // 公式の値(60,000名)との乖離は「別会社」ではなく集計範囲の違いとして要確認(NGにしない)
  const k = checkEmployees(c, r);
  assert.notEqual(k.result, 'NG');
  assert.match(k.comment, /有価証券報告書\(EDINET\)|差がある/);
  // 一致なし: 以前の証拠は消える
  const other = newCompany('株式会社コムニコ');
  assert.equal(await edinet.lookup(other, { edinet: fake, log: () => {} }), false);
  assert.equal(other.evidence.length, 0);
});

test('連結のみの有報は従業員数を「確認済み」にしない', () => {
  const ev = { value: 143, source: 'edinet', snippet: '有価証券報告書 2026年3月期（2026年6月25日提出・書類ID S1） 連結の従業員数 143名' };
  const a = assessEmployees(ev, [ev]);
  assert.equal(a.confirmed, false);
  assert.match(a.reasons.join(), /有価証券報告書の数字に「連結」/);
  const ok = assessEmployees({ ...ev, snippet: ev.snippet.replace('連結', '提出会社単体') }, [ev]);
  assert.equal(ok.confirmed, true);
  assert.equal(ok.asOf, '2026年3月');
});

test('求人ボックス: 一覧見出しから全件数とページ番号', async () => {
  const kb = await import('../src/sources/kyujinbox.js');
  assert.deepEqual(kb.parseTotal({ text: '求人検索 SNS運用 - 東京都の転職・求人情報\n転職・求人情報 71,010 件 3 ページ目\n…' }), { total: 71010, page: 3 });
  assert.equal(kb.parseTotal({ text: 'ありません' }), null);
});
