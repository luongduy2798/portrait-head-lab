import { clamp, deformPoint } from './shape';
import type { Point3, ShapeParams, SkinSample } from './types';

export type SkinColorField = (point: Point3) => Point3;

export function srgbToLinear(value: number): number {
  const color = clamp(value / 255, 0, 1);
  return color <= 0.04045 ? color / 12.92 : ((color + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(value: number): number {
  const color = clamp(value, 0, 1);
  return 255 * (color <= 0.0031308 ? color * 12.92 : 1.055 * color ** (1 / 2.4) - 0.055);
}

/** Use the detected diffuse tone over unseen skin. Nearby clean samples add
 * modest variation; a forehead highlight must not colour the whole skull. */
export function createSkinField(skin: Point3, samples: SkinSample[], params: ShapeParams): SkinColorField {
  const base = skin.map(srgbToLinear) as Point3;
  const light = (color: Point3) => color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
  const baseLight = Math.max(1e-6, light(base));
  const spatialSamples = samples.map((sample) => ({
    position: deformPoint(sample.position, 'face', params),
    color: sample.color.map(srgbToLinear) as Point3,
  })).filter((sample) => light(sample.color) >= baseLight * 0.45 && light(sample.color) <= baseLight * 1.65);
  return (point) => {
    if (!spatialSamples.length) return [...base];
    const weighted: Point3 = [0, 0, 0];
    let totalWeight = 0, nearest = Infinity;
    for (const sample of spatialSamples) {
      const distanceSquared = point.reduce((sum, value, axis) => sum + (value - sample.position[axis]) ** 2, 0);
      nearest = Math.min(nearest, distanceSquared);
      const weight = 1 / (distanceSquared + 4) ** 2;
      totalWeight += weight;
      for (let channel = 0; channel < 3; channel++) weighted[channel] += sample.color[channel] * weight;
    }
    const local = 0.35 * Math.exp(-nearest / 16);
    return weighted.map((value, channel) => base[channel] * (1 - local) + value / totalWeight * local) as Point3;
  };
}
