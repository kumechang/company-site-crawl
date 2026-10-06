import test from 'node:test';
import assert from 'node:assert/strict';
import * as salesnow from '../src/sources/salesnow.js';
import * as boxil from '../src/sources/boxil.js';
import * as prtimes from '../src/sources/prtimes.js';
import * as aspic from '../src/sources/aspic.js';
import * as webkanji from '../src/sources/webkanji.js';
import * as hikakubiz from '../src/sources/hikakubiz.js';
import * as kyujinbox from '../src/sources/kyujinbox.js';
import { consolidate } from '../src/lib/merge.js';
import { newCompany, addEvidence } from '../src/lib/model.js';

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
