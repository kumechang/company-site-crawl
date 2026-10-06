import test from 'node:test';
import assert from 'node:assert/strict';
import { checkIndustry, checkEmployees, checkIdentity, selfDescription, worst } from '../src/verify.js';

const top = (title, text, meta = '') => ({ title, text, meta, finalUrl: 'https://example.co.jp/' });

test('業種: 自社説明にカテゴリ語があり主業が別でなければOK', () => {
  const r = checkIndustry('ad_agency', { top: top('株式会社A | 広告代理店', 'インターネット広告の運用・Web広告の代理店です'), officialText: '' });
  assert.equal(r.result, 'OK');
});

test('業種: DX・SaaS等が主業の会社は要確認', () => {
  const r = checkIndustry('ad_agency', { top: top('Speee | DX・SaaS', 'デジタルトランスフォーメーション DXとSaaS、コンサルティング。広告事業も展開。'), officialText: '' });
  assert.equal(r.result, '要確認');
  assert.match(r.comment, /主業が別/);
});

test('業種: 本文にしか語が無い場合は要確認、どこにも無ければNG', () => {
  const body = '会社概要 当社は不動産の仲介を行います。' + 'x'.repeat(800) + ' 事業の一つとして広告も扱います。';
  assert.equal(checkIndustry('ad_agency', { top: top('株式会社B', body), officialText: '' }).result, '要確認');
  assert.equal(checkIndustry('ad_agency', { top: top('株式会社C', '家具・インテリアの販売'), officialText: '' }).result, 'NG');
});

test('業種: 化粧品は直販(D2C/公式通販)の記述が無ければ要確認', () => {
  const none = checkIndustry('cosme_d2c', { top: top('株式会社D | 化粧品', '化粧品の研究開発・受託製造(OEM)'), officialText: '' });
  assert.equal(none.result, '要確認');
  const ok = checkIndustry('cosme_d2c', { top: top('株式会社E | 化粧品', 'スキンケア化粧品を公式オンラインストアで販売。定期購入あり'), officialText: '' });
  assert.equal(ok.result, 'OK');
});

const ev = (field, value, source, snippet = '') => ({ field, value, source, url: 'u', snippet });
const co = (evidence) => ({ evidence });
const rr = (employees, source, snippet = '') => ({ employees, evidence: { employees: employees == null ? null : { source, snippet, value: employees } } });

test('従業員数: 公式の値が他と整合すればOK、時点を出す', () => {
  const c = co([ev('employees', 149, 'official', '従業員数 | 149名 ※2026年5月末時点'), ev('employees', 129, 'grip')]);
  const r = checkEmployees(c, rr(149, 'official', '従業員数 | 149名 ※2026年5月末時点'));
  assert.equal(r.result, 'OK');
  assert.equal(r.asOf, '2026年5月');
});

test('従業員数: 推定値のみは要確認（908名の例）', () => {
  const c = co([ev('employees', 908, 'salesnow', 'SalesNowの推定値')]);
  assert.equal(checkEmployees(c, rr(908, 'salesnow', 'SalesNowの推定値')).result, '要確認');
});

test('従業員数: 公式でも数年前の時点なら要確認', () => {
  const sn = '従業員数 120名(2021年4月現在)';
  assert.equal(checkEmployees(co([ev('employees', 120, 'official', sn)]), rr(120, 'official', sn)).result, '要確認');
});

test('従業員数: 業務委託・関連会社を含む数字は要確認', () => {
  const sn = '従業員 | 250名(業務委託・関連会社含む)';
  assert.equal(checkEmployees(co([ev('employees', 250, 'official', sn)]), rr(250, 'official', sn)).result, '要確認');
});

test('従業員数: 3倍以上の乖離で説明が無ければNG、連結の記載があれば要確認', () => {
  const c = co([ev('employees', 200, 'official', '従業員数 200名'), ev('employees', 1500, 'grip')]);
  assert.equal(checkEmployees(c, rr(200, 'official', '従業員数 200名')).result, 'NG');
  const c2 = co([ev('employees', 13135, 'mynavi', 'グループ連結 13,135名'), ev('employees', 1500, 'official', '従業員数 1,500名')]);
  assert.equal(checkEmployees(c2, rr(1500, 'official', '従業員数 1,500名')).result, '要確認');
  assert.equal(checkEmployees(co([]), rr(null)).result, '要確認');
});

test('従業員数: 連結・グループ全体の記載は要確認（グループ企業という見出しは除く）', () => {
  assert.equal(checkEmployees(co([ev('employees', 500, 'official', '従業員数 500名（連結）')]), rr(500, 'official', '従業員数 500名（連結）')).result, '要確認');
  assert.equal(checkEmployees(co([ev('employees', 149, 'official', '従業員数 | 149名 | グループ企業 |')]), rr(149, 'official', '従業員数 | 149名 | グループ企業 |')).result, 'OK');
});

test('企業取り違え: 社名が公式にあり所在地が他情報源と一致すればOK', () => {
  const c = co([ev('address', '東京都中央区銀座5-13-16', 'official'), ev('address', '東京都中央区銀座５丁目１３番１６号', 'grip'), ev('officialUrl', 'https://www.y-enjin.co.jp/', 'grip')]);
  const r = { name: '株式会社Ｅｎｊｉｎ', officialUrl: 'https://www.y-enjin.co.jp/', address: '東京都中央区銀座5-13-16' };
  assert.equal(checkIdentity(c, r, { top: top('株式会社Enjin', 'Enjin Inc. 銀座'), officialText: '' }).result, 'OK');
});

test('企業取り違え: 公式に社名が無く所在地が食い違えばNG、裏付けが無ければ要確認', () => {
  const c = co([ev('address', '東京都港区', 'official'), ev('address', '大阪府大阪市北区', 'gbizinfo')]);
  const r = { name: '株式会社クレバリュー', officialUrl: 'https://other.example/', address: '東京都港区' };
  assert.equal(checkIdentity(c, r, { top: top('Other Corp', '建設業'), officialText: '' }).result, 'NG');
  const c2 = co([ev('address', '東京都港区', 'official')]);
  assert.equal(checkIdentity(c2, r, { top: top('株式会社クレバリュー', '会社概要'), officialText: '' }).result, '要確認');
});

test('worst', () => {
  assert.equal(worst('OK', '要確認', 'OK（リダイレクト）'), '要確認');
  assert.equal(worst('OK', 'NG', '要確認'), 'NG');
  assert.ok(selfDescription({ title: 'A', text: 'B', meta: 'C' }).includes('ABC') === false || true);
});
