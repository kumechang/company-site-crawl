import crypto from 'node:crypto';

/**
 * プロキシ一覧の読み込み。1行1件で `host:port:user:pass`（Webshare の形式）または `host:port`。
 * 一覧は環境変数 PROXY_LIST（改行区切り）で渡す（GitHub Actions では secrets.PROXY_LIST）。認証情報はリポジトリに置かず、ログにも出さない。
 */
export function parseProxyList(text) {
  const out = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [host, port, username, ...rest] = line.split(':');
    if (!host || !/^\d+$/.test(port ?? '')) continue;
    out.push({ server: `http://${host}:${port}`, label: `${host}:${port}`, username: username || null, password: username ? rest.join(':') : null });
  }
  return out;
}

/** 環境変数から一覧を作る。未設定なら null（プロキシを使わない） */
export function proxyPoolFromEnv(env = process.env) {
  const text = env.PROXY_LIST;
  if (text && text.trim()) return new ProxyPool(parseProxyList(text));
  return null;
}

/**
 * ホストごとに同じプロキシを使い続ける（固定割り当て）。
 *  - 同じサイトには常に同じ出口IPから行く（アクセスのたびに出口を変えて、サイトの制限や拒否をすり抜けることはしない）
 *  - 拒否(403/429)があっても別のプロキシで取り直さない。プロキシ自体につながらない場合だけ、そのプロキシを外して次の割り当て先にする
 */
export class ProxyPool {
  constructor(proxies) {
    this.all = proxies;
    this.dead = new Set();
  }

  get size() {
    return this.all.length - this.dead.size;
  }

  forHost(host) {
    const alive = this.all.filter((p) => !this.dead.has(p.label));
    if (!alive.length) return null;
    const h = crypto.createHash('sha1').update(host).digest().readUInt32BE(0);
    return alive[h % alive.length];
  }

  markDead(proxy) {
    this.dead.add(proxy.label);
  }
}

/** プロキシ自体に問題がある(接続できない・認証に失敗した)エラーか。サイト側の403などは含めない */
export function isProxyError(e) {
  return /ERR_PROXY|ERR_TUNNEL_CONNECTION_FAILED|ERR_NO_SUPPORTED_PROXIES|ERR_PROXY_AUTH|ERR_PROXY_CONNECTION_FAILED/.test(String(e?.message ?? ''));
}
