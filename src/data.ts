import type { CameraFit, FaceIdentity, HeadMeasurements, HeadResult, ShapeParams } from './core/types.js';

export interface PortraitHeadData {
  schemaVersion: 1;
  generator: 'portrait-head-procedural-v1';
  sourceCommit: '9b8fb0355f628d56783e361f30ed3022fa70b710';
  params: ShapeParams;
  identity?: FaceIdentity;
  measurements: HeadMeasurements;
  camera: CameraFit;
  appearance: Omit<HeadResult, 'fit' | 'timings'>;
}

/** Archive fitted parameters and baked head textures, never detector landmarks,
 * source pixels, a body/wardrobe or a full-avatar GLB. */
export function portraitHeadData(result: HeadResult): PortraitHeadData {
  const { fit } = result;
  const appearance = {
    atlas: result.atlas, atlasSize: result.atlasSize,
    scalpSkinMap: result.scalpSkinMap, scalpSkinMapSize: result.scalpSkinMapSize,
    rearSkinMap: result.rearSkinMap, rearSkinMapSize: result.rearSkinMapSize,
    skinColor: result.skinColor, skinDarkColor: result.skinDarkColor, skinLightColor: result.skinLightColor,
    skinSamples: result.skinSamples, projectedCoverage: result.projectedCoverage,
  };
  return {
    schemaVersion: 1, generator: 'portrait-head-procedural-v1',
    sourceCommit: '9b8fb0355f628d56783e361f30ed3022fa70b710',
    params: { ...fit.params }, measurements: { ...fit.measurements }, camera: { ...fit.camera }, appearance,
    ...(fit.identity ? { identity: { ...fit.identity, deltas: fit.identity.deltas.map((delta) => [...delta] as [number, number, number]) } } : {}),
  };
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const point = (value: unknown) => Array.isArray(value) && value.length === 3 && value.every(finite);

/** IndexedDB is an input boundary, including after an app version change. */
export function isPortraitHeadData(value: unknown): value is PortraitHeadData {
  if (!record(value) || value.schemaVersion !== 1 || value.generator !== 'portrait-head-procedural-v1' ||
    value.sourceCommit !== '9b8fb0355f628d56783e361f30ed3022fa70b710' || !record(value.params) ||
    !Object.values(value.params).every(finite) || !record(value.measurements) || !record(value.camera) ||
    !['rx', 'ry', 'rz', 'scale', 'tx', 'ty'].every((key) => finite((value.camera as Record<string, unknown>)[key])) ||
    !['faceAspectRatio', 'foreheadScale', 'cheekScale', 'jawScale', 'lowerJawScale', 'chinScale']
      .every((key) => finite((value.measurements as Record<string, unknown>)[key])) || !record(value.appearance)) return false;
  const appearance = value.appearance;
  if (value.identity !== undefined) {
    const identity = value.identity;
    if (!record(identity) || identity.version !== 1 || !finite(identity.depthConfidence) || identity.depthConfidence < 0 || identity.depthConfidence > 1 ||
      !Array.isArray(identity.deltas) || identity.deltas.length !== 468 ||
      !identity.deltas.every((delta) => point(delta) && (delta as number[]).every((coordinate) => Math.abs(coordinate) <= 5))) return false;
  }
  const map = (data: unknown, size: unknown, maximum: number, byte: boolean) =>
    finite(size) && Number.isInteger(size) && size > 0 && size <= maximum &&
    (data === null || (byte ? data instanceof Uint8ClampedArray : data instanceof Float32Array) &&
      (data as Uint8ClampedArray | Float32Array).length === size * size * 4);
  return map(appearance.atlas, appearance.atlasSize, 1024, true) &&
    map(appearance.scalpSkinMap, appearance.scalpSkinMapSize, 512, false) &&
    map(appearance.rearSkinMap, appearance.rearSkinMapSize, 512, false) &&
    ['skinColor', 'skinDarkColor', 'skinLightColor'].every((key) => point(appearance[key])) &&
    finite(appearance.projectedCoverage) && Array.isArray(appearance.skinSamples) && appearance.skinSamples.length <= 1000 &&
    appearance.skinSamples.every((sample) => record(sample) && typeof sample.region === 'string' && point(sample.position) && point(sample.color));
}
