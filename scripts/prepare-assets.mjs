import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(await readFile(resolve(root, 'vendor/mediapipe-source.json'), 'utf8'));
const registryPath = resolve(root, 'public/assets/registry.json');
let previous = { assets: [] };
try { previous = JSON.parse(await readFile(registryPath, 'utf8')); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const assets = previous.assets.filter((asset) => ['head-template.json', 'landmark-anchors.json', 'head-neutral.glb'].includes(asset.name));
const downloads = [
  ['face_landmarker.task', 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'],
  ['selfie_multiclass.tflite', 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite'],
];
for (const [name, url] of downloads) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const pinned = previous.assets.find((asset) => asset.name === name);
  if (pinned && pinned.sha256 !== sha256) throw new Error(`Checksum thay đổi: ${name}`);
  await writeFile(resolve(root, 'public/assets', name), bytes);
  assets.push({ name, source: url, sha256, bytes: bytes.length, license: 'Apache-2.0' });
  console.log(`Đã chuẩn bị ${name}: ${(bytes.length / 1048576).toFixed(1)} MiB`);
}
await mkdir(resolve(root, 'public/vendor/mediapipe'), { recursive: true });
const wasmDir = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
for (const name of await readdir(wasmDir)) {
  const bytes = await readFile(resolve(wasmDir, name));
  await copyFile(resolve(wasmDir, name), resolve(root, 'public/vendor/mediapipe', name));
  assets.push({ name: `runtime/${name}`, source: '@mediapipe/tasks-vision@0.10.35', sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, license: 'Apache-2.0' });
}
// A classic worker avoids MediaPipe's importScripts/module-worker incompatibility.
const cjs = await readFile(resolve(root, 'node_modules/@mediapipe/tasks-vision/vision_bundle.cjs'), 'utf8');
// Expose the distributed CJS exports in a classic worker. The runtime prefers
// importScripts; its optional dynamic-loader fallback uses self.import.
await writeFile(resolve(root, 'public/vendor/mediapipe/vision_bundle.js'), `self.import = (url) => import(url);\n(function(exports) {\n${cjs}\n})(self.vision = {});\n`);
const bundle = await readFile(resolve(root, 'public/vendor/mediapipe/vision_bundle.js'));
assets.push({ name: 'runtime/vision_bundle.js', source: '@mediapipe/tasks-vision@0.10.35', sha256: createHash('sha256').update(bundle).digest('hex'), bytes: bundle.length, license: 'Apache-2.0' });
assets.push({ name: 'canonical_face_model.obj', source: `${source.repository}/blob/${source.commit}/mediapipe/modules/face_geometry/data/canonical_face_model.obj`, sha256: createHash('sha256').update(await readFile(resolve(root, 'vendor/canonical_face_model.obj'))).digest('hex'), license: 'Apache-2.0' });
await writeFile(registryPath, JSON.stringify({ schemaVersion: 1, assets }, null, 2) + '\n');
