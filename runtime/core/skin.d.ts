import type { Point3, ShapeParams, SkinSample } from './types.js';
export type SkinColorField = (point: Point3) => Point3;
export declare function srgbToLinear(value: number): number;
export declare function linearToSrgb(value: number): number;
/** Use the detected diffuse tone over unseen skin. Nearby clean samples add
 * modest variation; a forehead highlight must not colour the whole skull. */
export declare function createSkinField(skin: Point3, samples: SkinSample[], params: ShapeParams): SkinColorField;
