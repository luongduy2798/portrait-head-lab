// Offline asset preparation. This does not run when a user generates a head.
// The facial surface is derived from Google's Apache-2.0 canonical face.
// The closed cranium and ears below are original procedural geometry.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(resolve(root, 'vendor/canonical_face_model.obj'), 'utf8');
const positions = [], textureCoordinates = [], triangles = [], uv = [];
for (const line of source.split('\n')) {
  const parts = line.trim().split(/\s+/);
  if (parts[0] === 'v') positions.push(parts.slice(1).map(Number));
  if (parts[0] === 'vt') textureCoordinates.push(parts.slice(1).map(Number));
  if (parts[0] === 'f') {
    const corners = parts.slice(1).map((part) => part.split('/').map((value) => Number(value) - 1));
    triangles.push(corners.map(([vertex]) => vertex));
    for (const [vertex, tex] of corners) uv[vertex] = textureCoordinates[tex];
  }
}
const canonicalCount = positions.length;
// Keep the canonical data's exact surface correspondence. Subdivision never
// changes the landmark anchor vertices. No index is borrowed from another mesh.
const anchorTriangles = new Map();
triangles.forEach((triangle, index) => triangle.forEach((vertex, corner) => {
  if (!anchorTriangles.has(vertex)) anchorTriangles.set(vertex, { triangle: index, weights: [0, 1, 2].map((i) => i === corner ? 1 : 0) });
}));
const edgeCounts = new Map();
for (const tri of triangles) for (let i = 0; i < 3; i++) {
  const edge = [tri[i], tri[(i + 1) % 3]].sort((a, b) => a - b).join(',');
  edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
}
const adjacency = new Map();
for (const [edge, count] of edgeCounts) if (count === 1) {
  const [a, b] = edge.split(',').map(Number);
  adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
  adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
}
const boundary = [10];
let previous = -1, current = 10;
while (true) {
  const next = adjacency.get(current).find((value) => value !== previous);
  if (next === boundary[0]) break;
  boundary.push(next);
  previous = current; current = next;
}
const faceTriangleCount = triangles.length;
const parts = new Array(positions.length).fill('face');
let ring = boundary;
const addVertex = (point, part, tex = [0, 0]) => {
  const index = positions.length;
  positions.push(point); parts.push(part); uv.push(tex);
  return index;
};
// Ensure the cranium uses the opposite edge direction from the facial patch.
const first = boundary[0], second = boundary[1];
const faceUsesForward = triangles.some((tri) => tri.some((v, i) => v === first && tri[(i + 1) % 3] === second));
const bridge = (a, b, c, d) => {
  if (faceUsesForward) triangles.push([b, a, c], [b, c, d]);
  else triangles.push([a, b, c], [b, d, c]);
};
for (let step = 1; step <= 15; step++) {
  const t = step / 16;
  const nextRing = boundary.map((vertex, i) => {
    const [x, y, z] = positions[vertex];
    const radius = Math.cos(t * Math.PI / 2);
    const upper = Math.max(0, y / 8.3);
    return addVertex([
      x * radius * (1 + 0.12 * Math.sin(t * Math.PI)),
      // Give the forehead a fuller, rounder crown instead of a short, flat cap.
      y * radius + t + upper * 5.2 * Math.sin(t * Math.PI),
      z * (1 - t) - 10 * Math.sin(t * Math.PI / 2),
    ], 'cranium', [i / boundary.length, t]);
  });
  ring.forEach((a, i) => bridge(a, ring[(i + 1) % ring.length], nextRing[i], nextRing[(i + 1) % ring.length]));
  ring = nextRing;
}
const back = addVertex([0, 1, -10], 'cranium', [0.5, 1]);
ring.forEach((a, i) => {
  const b = ring[(i + 1) % ring.length];
  triangles.push(faceUsesForward ? [b, a, back] : [a, b, back]);
});
// A tapered neck sits under the jaw and overlaps the head so there is no
// abrupt cut at the chin. It shares the cranium material at runtime.
const neckRings = [
  { y: -7.1, rx: 3.3, rz: 3.65, z: -0.05 },
  { y: -8.0, rx: 3.35, rz: 3.55, z: -0.12 },
  { y: -9.0, rx: 3.1, rz: 3.3, z: -0.22 },
  { y: -10.1, rx: 2.85, rz: 2.95, z: -0.3 },
  { y: -11.4, rx: 2.65, rz: 2.7, z: -0.35 },
  { y: -12.8, rx: 2.75, rz: 2.6, z: -0.35 },
];
const neckSegments = 40;
const neckStart = positions.length;
for (const neckRing of neckRings) {
  for (let col = 0; col < neckSegments; col++) {
    const angle = col / neckSegments * Math.PI * 2;
    const x = neckRing.rx * Math.cos(angle), z = neckRing.z + neckRing.rz * Math.sin(angle);
    addVertex([x, neckRing.y, z], 'cranium', [0.5 + x / 16, 0.5 + (z - neckRing.z) / 16]);
  }
}
for (let row = 0; row < neckRings.length - 1; row++) for (let col = 0; col < neckSegments; col++) {
  const next = (col + 1) % neckSegments;
  const a = neckStart + row * neckSegments + col;
  const b = neckStart + row * neckSegments + next;
  const c = neckStart + (row + 1) * neckSegments + col;
  const d = neckStart + (row + 1) * neckSegments + next;
  triangles.push([a, b, c], [b, d, c]);
}
const neckTop = addVertex([0, neckRings[0].y, neckRings[0].z], 'cranium', [0.5, 0.5]);
const neckBottom = addVertex([0, neckRings[neckRings.length - 1].y, neckRings[neckRings.length - 1].z], 'cranium', [0.5, 0.5]);
const lastNeckRing = neckStart + (neckRings.length - 1) * neckSegments;
for (let col = 0; col < neckSegments; col++) {
  const next = (col + 1) % neckSegments;
  triangles.push([neckTop, neckStart + next, neckStart + col]);
  triangles.push([neckBottom, lastNeckRing + col, lastNeckRing + next]);
}
// Closed pinnae, embedded slightly into the lateral skull. They are separate
// connected components; the template is not a rigged or fabrication-ready scan.
for (const side of [-1, 1]) {
  const columns = 24, rows = 16;
  const start = positions.length;
  for (let row = 0; row <= rows; row++) {
    const latitude = row / rows * Math.PI;
    for (let col = 0; col <= columns; col++) {
      const longitude = col / columns * Math.PI * 2;
      const radius = Math.sin(latitude);
      const relief = 1 - 0.18 * Math.max(0, Math.cos(longitude));
      const outerRim = Math.exp(-(((radius - 0.82) / 0.18) ** 2));
      addVertex([
        side * (7.35 + 0.65 * outerRim - 0.18 * radius * Math.max(0, -Math.cos(longitude))),
        0.7 + 2.05 * Math.cos(latitude),
        -0.35 + 1.25 * radius * Math.sin(longitude) * relief,
      ], 'ear', [col / columns, 1 - row / rows]);
    }
  }
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const a = start + row * (columns + 1) + col, b = a + columns + 1;
    const faces = [[a, a + 1, b], [a + 1, b + 1, b]];
    triangles.push(...faces.map((tri) => side === -1 ? tri.reverse() : tri));
  }
}
const anchors = Array.from({ length: canonicalCount }, (_, landmark) => ({
  landmark, ...anchorTriangles.get(landmark),
}));
const template = {
  schemaVersion: 1,
  description: 'Canonical face + fuller procedural cranium, tapered neck and pinnae; Y up, +Z forward, centimetres.',
  canonicalCount, faceTriangleCount,
  positions, uv, triangles, parts, boundary,
};
await writeFile(resolve(root, 'public/assets/head-template.json'), JSON.stringify(template));
await writeFile(resolve(root, 'public/assets/landmark-anchors.json'), JSON.stringify({ schemaVersion: 1, template: 'head-template-v1', anchors }, null, 2));
// Write a neutral GLB asset offline, using the same topology as the JSON.
// Runtime exports still use Three.js GLTFExporter and include the photo atlas.
const normals = positions.map(() => [0, 0, 0]);
for (const [ia, ib, ic] of triangles) {
  const a = positions[ia], b = positions[ib], c = positions[ic];
  const u = b.map((v, i) => v - a[i]), v = c.map((value, i) => value - a[i]);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  for (const id of [ia, ib, ic]) for (let axis = 0; axis < 3; axis++) normals[id][axis] += n[axis];
}
for (const normal of normals) { const length = Math.hypot(...normal) || 1; for (let i = 0; i < 3; i++) normal[i] /= length; }
const chunks = [], bufferViews = [], accessors = [];
let byteOffset = 0;
function attribute(values, size, componentType, type, bounds) {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => componentType === 5126 ? bytes.writeFloatLE(value, index * 4) : bytes.writeUInt32LE(value, index * 4));
  const view = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length });
  chunks.push(bytes); byteOffset += bytes.length;
  const index = accessors.length;
  accessors.push({ bufferView: view, componentType, count: values.length / size, type, ...bounds });
  return index;
}
const metricPositions = positions.map((point) => point.map((value) => value * 0.01));
const position = attribute(metricPositions.flat(), 3, 5126, 'VEC3', {
  min: [0, 1, 2].map((axis) => Math.min(...metricPositions.map((point) => point[axis]))),
  max: [0, 1, 2].map((axis) => Math.max(...metricPositions.map((point) => point[axis]))),
});
const normal = attribute(normals.flat(), 3, 5126, 'VEC3');
const texcoord = attribute(uv.flat(), 2, 5126, 'VEC2');
const faceIndices = attribute(triangles.slice(0, faceTriangleCount).flat(), 1, 5125, 'SCALAR');
const craniumIndices = attribute(triangles.slice(faceTriangleCount).flat(), 1, 5125, 'SCALAR');
const gltf = {
  asset: { version: '2.0', generator: 'portrait-head-lab offline template generator' },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'headAsset' }],
  meshes: [{ name: 'baldHead', primitives: [faceIndices, craniumIndices].map((indices, material) => ({ attributes: { POSITION: position, NORMAL: normal, TEXCOORD_0: texcoord }, indices, material })) }],
  materials: ['face', 'cranium-and-ears'].map((name) => ({ name, pbrMetallicRoughness: { baseColorFactor: [0.56, 0.35, 0.25, 1], metallicFactor: 0, roughnessFactor: 0.9 } })),
  accessors, bufferViews, buffers: [{ byteLength: byteOffset }],
  extras: { units: 'metres', forward: '+Z', up: '+Y', rigged: false, sourceLicense: 'Apache-2.0; see licenses/mediapipe-apache-2.0.txt' },
};
const json = Buffer.from(JSON.stringify(gltf));
const jsonPad = Buffer.alloc((4 - json.length % 4) % 4, 0x20);
const binary = Buffer.concat(chunks);
const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8);
header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + jsonPad.length + 8 + binary.length, 8);
jsonHeader.writeUInt32LE(json.length + jsonPad.length); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942, 4);
await writeFile(resolve(root, 'public/assets/head-neutral.glb'), Buffer.concat([header, jsonHeader, json, jsonPad, binHeader, binary]));
const registryPath = resolve(root, 'public/assets/registry.json');
let registry = { schemaVersion: 1, assets: [] };
try { registry = JSON.parse(await readFile(registryPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const generatedNames = ['head-template.json', 'landmark-anchors.json', 'head-neutral.glb'];
registry.assets = registry.assets.filter((entry) => !generatedNames.includes(entry.name));
for (const name of generatedNames) {
  const bytes = await readFile(resolve(root, 'public/assets', name));
  registry.assets.push({ name, source: 'scripts/generate-template.mjs + pinned canonical_face_model.obj', sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, license: 'Apache-2.0 derivative; original procedural cranium and ears' });
}
await writeFile(registryPath, JSON.stringify(registry, null, 2) + '\n');
console.log('Đã tạo template đầu kín phía sau và bảng anchor từ nguồn canonical đã pin.');
