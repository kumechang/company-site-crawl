import zlib from 'node:zlib';

/**
 * ZIP(単一ボリューム・deflate/無圧縮)のエントリを取り出す最小実装。EDINET API の書類ZIP・コード一覧ZIP用。
 * 中央ディレクトリを読むので、ローカルヘッダのサイズ欄が0のデータ記述子付きZIPでも扱える。
 * @returns {{name: string, data: Buffer}[]}
 */
export function readZip(buf) {
  // 末尾の End of Central Directory(0x06054b50)を後ろから探す
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIPとして読めない(EOCDなし)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIPの中央ディレクトリが壊れている');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + csize);
    if (method === 0) out.push({ name, data: Buffer.from(raw) });
    else if (method === 8) out.push({ name, data: zlib.inflateRawSync(raw) });
    else throw new Error(`未対応のZIP圧縮方式 ${method} (${name})`);
  }
  return out;
}
