import type { Analysis, FitResult, HeadTemplate, Point3, SkinSample } from './types.js';
export declare function buildTexture(template: HeadTemplate, fit: FitResult, analysis: Analysis, pixels: Uint8ClampedArray, width: number, height: number, size?: number): {
    atlas: Uint8ClampedArray<ArrayBuffer>;
    atlasSize: number;
    scalpSkinMap: Float32Array<ArrayBuffer>;
    scalpSkinMapSize: number;
    rearSkinMap: Float32Array<ArrayBuffer>;
    rearSkinMapSize: number;
    skinColor: Point3;
    skinDarkColor: [number, number, number];
    skinLightColor: [number, number, number];
    skinSamples: SkinSample[];
    projectedCoverage: number;
};
