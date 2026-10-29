// Offline preparation only. The browser consumes the extracted rig, never the
// full FaceVerse basis, network or portrait data. Local evaluation is explicitly
// authorized; model-data distribution terms remain unverified.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = `${root}.cache/faceverse-v4-19c67cc4/`;
const output = `${root}public/assets/faceverse/`;
const sourceUrl = 'https://static.moodlab.dev/faceverse/';
const sourceCommit = '19c67cc4d7234b1ea7d55a185a2cb55fd49bb877';
const files = {
  'basis.bin': { bytes: 48667900, sha256: '9b23ad5d087f0d109e098f903c33a5e33da9807677f09f245829a77932c2693a' },
  'expression.bin': { bytes: 20777456, sha256: 'bd489640bdc41a2fefc5ac432c1a515eb8af7347f422b208c129ce4611d8ca31' },
};
// Copied from twa-moodlab-mobile's pinned v4 reconstruct worker, including
// Big winner's intentionally unequal left/right smile and brow coefficients.
const presets = {
  unbothered: {},
  locked_in: { 0: 0.78, 1: 0.78, 14: 0.18, 15: 0.18, 28: 0.24, 29: 0.24, 46: 0.26 },
  cracking_up: { 14: 0.6, 15: 0.6, 28: 0.36, 29: 0.36, 49: 0.34, 51: 0.24, 52: 0.24, 55: 0.9, 56: 0.9 },
  full_panic: { 4: 0.84, 5: 0.84, 6: 0.54, 7: 0.54, 36: 0.9, 37: 0.9, 49: 0.66, 51: 0.12, 52: 0.12 },
  big_winner: { 4: 0.22, 5: 0.1, 55: 0.78, 56: 0.3 },
  spectacular_flop: { 0: 0.18, 1: 0.18, 4: 0.54, 5: 0.54, 14: 0.14, 15: 0.14, 53: 0.78, 54: 0.78 },
};
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
await mkdir(cache, { recursive: true });
await mkdir(output, { recursive: true });

async function resource(name) {
  const expected = files[name];
  let bytes;
  try { bytes = await readFile(`${cache}${name}`); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.log(`Preparing ${name} (${(expected.bytes / 1048576).toFixed(1)} MiB)`);
    const response = await fetch(`${sourceUrl}${name}?v=${expected.sha256}`);
    if (!response.ok) throw new Error(`Không tải được ${name}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) throw new Error(`Sai checksum ${name}`);
    await writeFile(`${cache}${name}`, bytes);
  }
  if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) throw new Error(`Sai checksum ${name}; không dùng dữ liệu khác phiên bản.`);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

const [basis, expression] = await Promise.all(Object.keys(files).map(resource));
const header = new DataView(basis), expHeader = new DataView(expression);
const vertexCount = header.getUint32(8, true), triangleCount = header.getUint32(12, true);
if (header.getUint32(0, true) !== 0x34564641 || header.getUint32(4, true) !== 1 ||
    vertexCount !== 19546 || header.getUint32(16, true) !== 156 || header.getUint32(20, true) !== 251 ||
    expHeader.getUint32(0, true) !== 0x45564641 || expHeader.getUint32(4, true) !== 1 ||
    expHeader.getUint32(8, true) !== vertexCount || expHeader.getUint32(12, true) !== 177) {
  throw new Error('Header FaceVerse không khớp phiên bản đã pin.');
}
const offsets = Array.from({ length: 6 }, (_, i) => header.getUint32(24 + i * 4, true));
const sizes = [vertexCount * 12, vertexCount * 12, triangleCount * 12, 478 * 4, vertexCount * 3 * 156 * 2, vertexCount * 3 * 251 * 2];
if (offsets.some((offset, i) => offset < 48 || offset % 4 || offset + sizes[i] > basis.byteLength ||
    (i > 0 && offset < offsets[i - 1] + sizes[i - 1]))) throw new Error('Offset basis FaceVerse không hợp lệ.');
const partOffset = expHeader.getUint32(16, true), skinOffset = expHeader.getUint32(20, true);
const expOffset = expHeader.getUint32(24, true), partCount = expHeader.getUint32(28, true);
if (partCount < 6 || partCount > 32 || partOffset < 32 || partOffset % 4 ||
    skinOffset < partOffset + partCount * 4 || expOffset < skinOffset + vertexCount || expOffset % 4 ||
    expOffset + vertexCount * 3 * 177 * 2 !== expression.byteLength) throw new Error('Offset expression FaceVerse không hợp lệ.');
const mean = new Float32Array(basis, offsets[0], vertexCount * 3);
const colors = new Float32Array(basis, offsets[1], vertexCount * 3);
const indices = new Uint32Array(basis, offsets[2], triangleCount * 3);
const landmarkIds = new Uint32Array(basis, offsets[3], 478);
const parts = new Uint32Array(expression, partOffset, partCount);
if (parts[partCount - 1] !== vertexCount || parts.some((value, i) => value > vertexCount || (i > 0 && value < parts[i - 1])) ||
    landmarkIds.slice(0, 468).some((id) => id >= parts[0]) || landmarkIds.some((id) => id >= vertexCount) ||
    indices.some((id) => id >= vertexCount)) throw new Error('Topology/landmark FaceVerse không hợp lệ.');
const basisExpressions = new Uint16Array(expression, expOffset, vertexCount * 3 * 177);
const half = Float32Array.from({ length: 65536 }, (_, value) => {
  const sign = value & 0x8000 ? -1 : 1, exponent = (value >> 10) & 31, mantissa = value & 1023;
  return sign * (exponent === 0 ? mantissa * 2 ** -24 : exponent === 31 ? (mantissa ? NaN : Infinity) : (1 + mantissa / 1024) * 2 ** (exponent - 15));
});
const round = (value) => Math.round(value * 1e7) / 1e7;
const point = (positions, id) => [positions[id * 3], positions[id * 3 + 1], positions[id * 3 + 2]].map(round);

function pose(preset) {
  const positions = mean.slice();
  for (const [key, amount] of Object.entries(preset)) {
    for (let i = 0; i < positions.length; i++) positions[i] += half[basisExpressions[i * 177 + Number(key)]] * amount;
  }
  // Same native jaw/cavity alignment as orientHead in the mobile worker.
  // Eye angles are zero for these identity-independent preset assets.
  const jawShift = positions[19496 * 3 + 2] - positions[6550 * 3 + 2] - (mean[19496 * 3 + 2] - mean[6550 * 3 + 2]);
  for (let id = parts[2]; id < parts[5]; id++) positions[id * 3 + 2] -= jawShift;
  // Source centimetres, X-right/Y-down/Z-away -> X-right/Y-up/Z-forward.
  for (let i = 0; i < positions.length; i++) if (i % 3 !== 0) positions[i] *= -1;
  if (!positions.every(Number.isFinite)) throw new Error('Biểu cảm FaceVerse chứa tọa độ không hữu hạn.');
  return positions;
}
const neutral = pose({});
const deltas = Object.fromEntries(Object.entries(presets).map(([name, preset]) => {
  const target = pose(preset);
  return [name, Float32Array.from(target, (value, i) => value - neutral[i])];
}));
const oral = ['tongue', 'lowerTeeth', 'upperTeeth'].map((name, part) => {
  const first = parts[part + 2], end = parts[part + 3];
  const ids = Array.from({ length: end - first }, (_, i) => first + i);
  const triangles = [];
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = Array.from(indices.subarray(i, i + 3));
    if (triangle.every((id) => id >= first && id < end)) triangles.push(triangle.map((id) => id - first));
  }
  if (!ids.length || !triangles.length) throw new Error(`Thiếu hình học ${name}.`);
  return {
    name, positions: ids.map((id) => point(neutral, id)), triangles,
    colors: ids.map((id) => point(colors, id).map((value) => round(Math.max(0, Math.min(1, value / 255))))),
    deltas: Object.fromEntries(Object.entries(deltas).map(([id, values]) => [id, ids.map((vertex) => point(values, vertex))])),
  };
});
const source = {
  provider: 'FaceVerse v4', sourceUrl, sourceCommit,
  sourceModelSHA256: '077df2658add90ea22ac9675967e38edf56170822c2a7acfe40bda55a9ed3702',
  files, licenseVerified: false, localEvaluationAuthorized: true,
  license: 'Separate model-data distribution terms have not been independently verified; authorized for local evaluation only.',
  codeLicense: { file: 'licenses/faceverse-code-mit.txt', sha256: 'f726d74d9df4062476c26b2d2d01fd74efe60cd87bed507d2488da1be718753e' },
  presetSource: 'twa-moodlab-mobile/src/pages/Home/AvatarStudio/ThreeD/lib/faceverse-reconstruct.worker.ts',
  presetCoefficientsSHA256: sha256(JSON.stringify(presets)),
};
const asset = {
  schemaVersion: 1, expressionSet: 'faceverse-mobile-v1', units: 'centimetres', source,
  landmarks: Array.from(landmarkIds.slice(0, 468), (id) => point(neutral, id)),
  deltas: Object.fromEntries(Object.entries(deltas).map(([name, values]) => [name, Array.from(landmarkIds.slice(0, 468), (id) => point(values, id))])),
  oral,
};
const bytes = Buffer.from(JSON.stringify(asset));
const manifest = { schemaVersion: 1, expressionSet: asset.expressionSet, file: 'expression-rig.json', bytes: bytes.length, sha256: sha256(bytes), source };
await writeFile(`${output}expression-rig.json`, bytes);
await writeFile(`${output}expression-rig-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared expression-rig.json: ${bytes.length} bytes, SHA-256 ${manifest.sha256}`);
