import type { Analysis, Point3 } from './types.js';
export declare const skinColorHex: (color: Point3) => string;
/** Estimate a single skin material, without retaining photo lighting patches. */
export declare function sampleSkinColor(analysis: Analysis, pixels: Uint8ClampedArray, width: number, height: number): {
    color: Point3;
    warning: string;
} | {
    color: Point3;
    warning?: undefined;
};
