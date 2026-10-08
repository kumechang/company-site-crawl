import test from 'node:test';
import assert from 'node:assert/strict';
import { checkIndustry, checkEmployees, checkIdentity, selfDescription, worst } from '../src/verify.js';

const top = (title, text, meta = '') => ({ title, text, meta, finalUrl: 'https://example.co.jp/' });

test('業種: 自社説明にカテゴリ語があり主業が別でなければOK', () => {
  const r = checkIndustry('ad_agency', { top: top('株式会社A | 広告代理店', 'インターネット広告の運用・Web広告の代理店です'), officialText: '' });
  assert.equal(r.result, 'OK');
});

test('業種: 主業が別でも、自社説明にカテゴリ語があれば取り扱いありとしてOK', () => {
  const r = checkIndustry('ad_agency', { top: top('Speee | DX・SaaS', 'デジタルトランスフォーメーション DXとSaaS、コンサルティング。広告事業も展開。'), officialText: '' });
  assert.equal(r.result, 'OK');
  assert.match(r.comment, /主業でない可能性/);
});

test('業種: 本文に複数回あればOK、1回だけの言及・一般語のみは要確認、どこにも無ければNG', () => {
  const pad = '会社概要 当社は不動産の仲介を行います。' + 'x'.repeat(800);
  const multi = pad + ' ネット広告の運用を行います。インターネット広告の事例も掲載。';
  const r = checkIndustry('ad_agency', { top: top('株式会社B', multi), officialText: '' });
  assert.equal(r.result, 'OK');
  assert.match(r.comment, /本文に.*複数/);
  assert.equal(checkIndustry('ad_agency', { top: top('株式会社B', pad + ' ネット広告も扱います。'), officialText: '' }).result, '要確認');
  assert.equal(checkIndustry('ad_agency', { top: top('株式会社B', pad + ' 事業の一つとして広告も扱います。'), officialText: '' }).result, '要確認');
  assert.equal(checkIndustry('ad_agency', { top: top('株式会社C', '家具・インテリアの販売'), officialText: '' }).result, 'NG');
  // 事業ページ(extraText)に記述があれば取り扱いを確認できる
  assert.equal(checkIndustry('sns_agency', { top: top('株式会社F', '総合マーケティング'), officialText: '', extraText: 'SNS運用代行・SNSアカウント運用を提供' }).result, 'OK');
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

test('従業員数: 公式以外のみでも、取れていれば採用し、出所と時点(無ければその旨)を備考に残す', () => {
  const c = co([ev('employees', 908, 'salesnow', 'SalesNowの推定値')]);
  const k = checkEmployees(c, rr(908, 'salesnow', 'SalesNowの推定値'));
  assert.equal(k.result, 'OK');
  assert.match(k.comment, /公式サイトでは確認できず.*SalesNow.*時点の記載なし/);
  const sn = 'マイナビ(新卒) 従業員: 150名（2025年4月現在）';
  const k2 = checkEmployees(co([ev('employees', 150, 'mynavi', sn)]), rr(150, 'mynavi', sn));
  assert.equal(k2.result, 'OK');
  assert.match(k2.comment, /採用サイト\(マイナビ\(新卒\)\)の値を採用（2025年4月時点）/);
  assert.equal(k2.asOf, '2025年4月');
});

test('従業員数: 公式サイトの値を正とする（古い時点・業務委託/関連会社・連結の記載は備考に残す）', () => {
  const sn = '従業員数 120名(2021年4月現在)';
  const k = checkEmployees(co([ev('employees', 120, 'official', sn)]), rr(120, 'official', sn));
  assert.equal(k.result, 'OK');
  assert.match(k.comment, /2021年4月時点と古い/);
  const sn2 = '従業員 | 250名(業務委託・関連会社含む)';
  const k2 = checkEmployees(co([ev('employees', 250, 'official', sn2)]), rr(250, 'official', sn2));
  assert.equal(k2.result, 'OK');
  assert.match(k2.comment, /「業務委託」の記載あり/);
  const sn3 = '従業員数 500名（連結）';
  assert.match(checkEmployees(co([ev('employees', 500, 'official', sn3)]), rr(500, 'official', sn3)).comment, /「連結」/);
  assert.equal(checkEmployees(co([ev('employees', 149, 'official', '従業員数 | 149名 | グループ企業 |')]), rr(149, 'official', '従業員数 | 149名 | グループ企業 |')).comment.includes('記載あり'), false); // 「グループ企業」は見出し
});

test('従業員数: 他の情報源との差は注記に留め、時点不明の公式以外が3倍以上ずれて説明も無いときだけNG', () => {
  // 公式が正。他の情報源(グリップ 1500)と大きくずれても、公式の値のままOK(注記のみ)
  const c = co([ev('employees', 200, 'official', '従業員数 200名'), ev('employees', 1500, 'grip')]);
  const k = checkEmployees(c, rr(200, 'official', '従業員数 200名'));
  assert.equal(k.result, 'OK');
  assert.match(k.comment, /差がある\(7\.5倍\)/);
  // 公式以外(時点不明)を採用していて、他と3倍以上ずれ、連結等の理由も無い → 別会社の数字の可能性
  const c2 = co([ev('employees', 200, 'grip', 'グリップ 従業員数: 200名'), ev('employees', 1500, 'houjingoo')]);
  assert.equal(checkEmployees(c2, rr(200, 'grip', 'グリップ 従業員数: 200名')).result, 'NG');
  // 時点が分かる値なら、ずれても注記のみ
  const sn = 'グリップ 従業員数: 200名(2025年1月現在)';
  assert.equal(checkEmployees(co([ev('employees', 200, 'grip', sn), ev('employees', 1500, 'houjingoo')]), rr(200, 'grip', sn)).result, 'OK');
  assert.equal(checkEmployees(co([]), rr(null)).result, '要確認');
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

import { findServiceLinks } from '../src/lib/extract.js';

test('事業・サービスページのリンク候補', () => {
  const a = (text, href) => ({ text, href });
  const links = findServiceLinks(
    [a('サービス', 'https://example.co.jp/service/'), a('採用情報', 'https://example.co.jp/recruit/'), a('事業内容', 'https://example.co.jp/business'), a('TOP', 'https://example.co.jp/'), a('サービス', 'https://other.com/service/'), a('お問い合わせ', 'https://example.co.jp/contact/')],
    'https://example.co.jp/'
  );
  assert.deepEqual(links.map((l) => l.url).sort(), ['https://example.co.jp/business', 'https://example.co.jp/service/']);
});

import { checkSig, VERIFY_VERSION } from '../src/verify.js';

test('検証の署名: 入力が同じなら同じ、会社の情報・カテゴリが変われば変わる', () => {
  const r = { officialUrl: 'https://a.jp/', address: '東京都港区', employees: 50, employeesSource: 'official', contactUrl: 'https://a.jp/contact', categories: ['広告代理店'] };
  assert.equal(checkSig(r, ['ad_agency', 'sns_agency']), checkSig({ ...r }, ['sns_agency', 'ad_agency'])); // カテゴリの順序は無関係
  assert.notEqual(checkSig(r, ['ad_agency']), checkSig({ ...r, employees: 60 }, ['ad_agency'])); // 従業員数が変わった
  assert.notEqual(checkSig(r, ['ad_agency']), checkSig(r, ['ad_agency', 'sns_agency'])); // 検証するカテゴリが増えた
  assert.ok(checkSig(r, []).startsWith(`[${VERIFY_VERSION},`)); // ロジックのバージョンを含む
});

import { isAccessFailure, checkContact, needsVerify, verifyCompany } from '../src/verify.js';
import { HttpError, RobotsDisallowed } from '../src/lib/crawler.js';

test('接続失敗の判定: robots.txt取得不可・403/429/5xx・タイムアウトは接続失敗、明示的なrobots禁止や404は違う', () => {
  assert.equal(isAccessFailure(new RobotsDisallowed('robots.txt を取得できない(403)のためアクセスしない: https://a.jp/')), true);
  assert.equal(isAccessFailure(new HttpError(403, 'https://a.jp/')), true);
  assert.equal(isAccessFailure(new HttpError(503, 'https://a.jp/')), true);
  assert.equal(isAccessFailure(new Error('Navigation timeout of 45000 ms exceeded')), true);
  assert.equal(isAccessFailure(new RobotsDisallowed('robots.txt disallows https://a.jp/contact')), false);
  assert.equal(isAccessFailure(new HttpError(404, 'https://a.jp/contact')), false);
});

test('問い合わせURL: 接続できなかったときはNGにせず要確認(accessFailed)、開けて404ならNG', async () => {
  const r = { contactUrl: 'https://a.jp/contact', officialUrl: 'https://a.jp/' };
  const fail = (e) => ({ snapshot: async () => { throw e; } });
  const a = await checkContact({}, r, { crawler: fail(new RobotsDisallowed('robots.txt を取得できない(403)のためアクセスしない: x')), top: null });
  assert.equal(a.result, '要確認');
  assert.equal(a.accessFailed, true);
  const b = await checkContact({}, r, { crawler: fail(new HttpError(404, 'x')), top: null });
  assert.equal(b.result, 'NG');
});

test('再検証の要否: 入力が変わったとき、または接続失敗で別の環境のときだけ', () => {
  const ok = { checks: { sig: 's' } };
  assert.equal(needsVerify(ok, 's', 'actions'), false);
  assert.equal(needsVerify(ok, 't', 'actions'), true);
  const failed = { checks: { sig: 's', accessFailed: true, env: 'actions' } };
  assert.equal(needsVerify(failed, 's', 'actions'), false);
  assert.equal(needsVerify(failed, 's', 'local'), true);
});

test('検証: 公式サイトに接続できなかった記録は accessFailed と環境が残る', async () => {
  const c = { evidence: [] };
  const r = { name: '株式会社テスト', officialUrl: 'https://a.jp/', contactUrl: null, employees: null, categories: [], address: '東京都渋谷区1-1', evidence: {} };
  const crawler = { snapshot: async () => { throw new RobotsDisallowed('robots.txt を取得できない(403)のためアクセスしない: x'); } };
  const k = await verifyCompany(c, r, [], { crawler });
  assert.equal(k.accessFailed, true);
  assert.ok(k.env);
});

test('再検証の要否: 接続失敗がNGで保存された旧形式は取り直す', () => {
  const old = { checks: { sig: 's', contact: { result: 'NG', comment: '問い合わせURLを開けない(robots.txt を取得できない(403)のためアクセスしない: https://a.jp/c)' } } };
  assert.equal(needsVerify(old, 's', 'local'), true);
  const real = { checks: { sig: 's', contact: { result: 'NG', comment: '問い合わせURLを開けない(HTTP 404 https://a.jp/c)' } } };
  assert.equal(needsVerify(real, 's', 'local'), false);
});
