/** Dependency-free itch.io exporter, copied into each independent project.
 * The ZIP writer uses the standard DEFLATE/CRC32 format (no shell zip dependency).
 * Runtime .mjs modules become .js for predictable static-host MIME handling.
 */
import { readdir, readFile, mkdir, rm, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(path.join(root, 'itch.json'), 'utf8'));
const destination = path.join(root, 'dist', 'itch');
const excluded = new Set(['package.json', 'package-lock.json', 'serve.mjs', 'package-itch.mjs', 'itch.json']);
async function runtimeFiles(folder, prefix = '') {
  const out = [];
  for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const name = prefix + entry.name;
    if (entry.isDirectory()) {
      if (prefix || ['assets', 'vendor'].includes(entry.name)) out.push(...await runtimeFiles(path.join(folder, entry.name), name + '/'));
    } else if (!excluded.has(name) && (prefix || /\.(html|css|js|mjs|json|md|txt)$/i.test(name))) out.push(name);
  }
  return out;
}
const table = Array.from({ length: 256 }, (_, n) => {
  let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
});
function crc32(data) { let c = 0xffffffff; for (const b of data) c = table[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const entries = [];
await mkdir(destination, { recursive: true });
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const source of await runtimeFiles(root)) {
  const name = source.replace(/\.mjs$/, '.js');
  let data = await readFile(path.join(root, source));
  if (/\.(m?js|html|css|json)$/i.test(source)) {
    // Change only explicit local module suffix references, retaining image bytes.
    data = Buffer.from(data.toString('utf8').replace(/\.mjs(?=["'`?])/g, '.js'));
  }
  if (entries.some(entry => entry.name === name)) throw new Error(`Export name collision: ${name}`);
  if (name.length > 240 || data.length > 200 * 1024 * 1024) throw new Error(`itch.io file limit exceeded: ${name}`);
  await mkdir(path.dirname(path.join(destination, name)), { recursive: true });
  await writeFile(path.join(destination, name), data);
  entries.push({ name, data, sha256: createHash('sha256').update(data).digest('hex') });
}
if (!entries.some(entry => entry.name === 'index.html')) throw new Error('Missing root index.html');
const unpackedBytes = entries.reduce((sum, entry) => sum + entry.data.length, 0);
if (entries.length > 1000 || unpackedBytes > 500 * 1024 * 1024) throw new Error('itch.io archive limits exceeded');
const locals = [], directories = []; let offset = 0;
for (const entry of entries) {
  const name = Buffer.from(entry.name, 'utf8'), compressed = deflateRawSync(entry.data), crc = crc32(entry.data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
  local.writeUInt16LE(33, 12); // 1980-01-01; stable timestamps make exports reproducible.
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(entry.data.length, 22); local.writeUInt16LE(name.length, 26);
  locals.push(local, name, compressed);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
  central.writeUInt16LE(33, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(entry.data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
  directories.push(central, name); offset += local.length + name.length + compressed.length;
}
const centralDirectory = Buffer.concat(directories), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralDirectory.length, 12); end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...locals, centralDirectory, end]);
const zipPath = path.join(root, 'dist', config.slug + '-itch.zip');
await writeFile(zipPath + '.tmp', zip); await rename(zipPath + '.tmp', zipPath);
const report = { slug: config.slug, title: config.title, archive: path.basename(zipPath), entry: 'index.html', files: entries.length, unpackedBytes, zipBytes: zip.length, sha256: createHash('sha256').update(zip).digest('hex'), recommendedEmbed: config.embed, entries: entries.map(({ name, data, sha256 }) => ({ name, bytes: data.length, sha256 })) };
await writeFile(path.join(root, 'dist', 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`${config.title}: ${zipPath} (${entries.length} files; ${(zip.length / 1048576).toFixed(2)} MiB)`);
