import { expressionControls, expressionSet, type ExpressionName } from './expressions';
import type { Point3 } from './types';

export interface OralRigSurface {
  name: 'tongue' | 'lowerTeeth' | 'upperTeeth';
  positions: Point3[];
  colors: Point3[];
  triangles: [number, number, number][];
  deltas: Record<ExpressionName, Point3[]>;
}
export interface ExpressionRigAsset {
  schemaVersion: 1;
  expressionSet: typeof expressionSet;
  units: 'centimetres';
  landmarks: Point3[];
  deltas: Record<ExpressionName, Point3[]>;
  oral: OralRigSurface[];
}
const sourceCommit = '19c67cc4d7234b1ea7d55a185a2cb55fd49bb877';
const sourceBasis = '9b23ad5d087f0d109e098f903c33a5e33da9807677f09f245829a77932c2693a';
const sourceExpressions = 'bd489640bdc41a2fefc5ac432c1a515eb8af7347f422b208c129ce4611d8ca31';
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const points = (value: unknown, count: number): value is Point3[] => Array.isArray(value) && value.length === count &&
  value.every((point) => Array.isArray(point) && point.length === 3 && point.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10000));
const deltas = (value: unknown, count: number) => record(value) && expressionControls.every(([name]) => points(value[name], count));
let pending: Promise<ExpressionRigAsset> | undefined;

export function loadExpressionRig(): Promise<ExpressionRigAsset> {
  pending ??= (async () => {
    const base = '/assets/faceverse/';
    const manifestResponse = await fetch(`${base}expression-rig-manifest.json`, { cache: 'no-cache' });
    if (!manifestResponse.ok) throw new Error('Thiếu rig biểu cảm local. Chạy npm run assets:expressions để chuẩn bị.');
    const manifest: unknown = await manifestResponse.json();
    if (!record(manifest) || manifest.schemaVersion !== 1 || manifest.expressionSet !== expressionSet || manifest.file !== 'expression-rig.json' ||
      typeof manifest.bytes !== 'number' || !Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0 || manifest.bytes > 8_000_000 ||
      typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
      !record(manifest.source) || manifest.source.sourceCommit !== sourceCommit || !record(manifest.source.files)) {
      throw new Error('Manifest rig biểu cảm không khớp phiên bản local.');
    }
    const files = manifest.source.files;
    if (!record(files['basis.bin']) || files['basis.bin'].sha256 !== sourceBasis ||
      !record(files['expression.bin']) || files['expression.bin'].sha256 !== sourceExpressions) throw new Error('Rig biểu cảm không dùng basis FaceVerse đã pin.');
    const response = await fetch(`${base}expression-rig.json?v=${manifest.sha256}`, { cache: 'force-cache' });
    if (!response.ok) throw new Error('Không đọc được rig biểu cảm local. Chạy npm run assets:expressions để chuẩn bị.');
    const bytes = await response.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (value) => value.toString(16).padStart(2, '0')).join('');
    if (bytes.byteLength !== manifest.bytes || digest !== manifest.sha256) throw new Error('Checksum rig biểu cảm không khớp. Hãy chuẩn bị lại asset local.');
    const asset: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!record(asset) || asset.schemaVersion !== 1 || asset.expressionSet !== expressionSet || asset.units !== 'centimetres' ||
      !points(asset.landmarks, 468) || !deltas(asset.deltas, 468) || !Array.isArray(asset.oral) || asset.oral.length !== 3) throw new Error('Dữ liệu rig biểu cảm không hợp lệ.');
    for (const [index, name] of ['tongue', 'lowerTeeth', 'upperTeeth'].entries()) {
      const surface: unknown = asset.oral[index];
      if (!record(surface)) throw new Error(`Thiếu hình học ${name}.`);
      const count = Array.isArray(surface.positions) ? surface.positions.length : 0;
      if (surface.name !== name || count < 100 || count > 5000 ||
        !points(surface.positions, count) || !points(surface.colors, count) ||
        !surface.colors.every((color) => color.every((value) => value >= 0 && value <= 1)) || !deltas(surface.deltas, count) ||
        !Array.isArray(surface.triangles) || surface.triangles.length === 0 || surface.triangles.length > 20000 ||
        !surface.triangles.every((triangle) => Array.isArray(triangle) && triangle.length === 3 && triangle.every((id) => Number.isInteger(id) && id >= 0 && id < count))) {
        throw new Error(`Hình học ${name} trong rig biểu cảm không hợp lệ.`);
      }
    }
    return asset as unknown as ExpressionRigAsset;
  })().catch((error) => { pending = undefined; throw error; });
  return pending;
}
