import type { Analysis, GenerationOptions } from './types.js';
export declare const eyeContours: {
    upper: number[];
    lower: number[];
}[];
export declare const browContours: {
    upper: number[];
    lower: number[];
}[];
export declare const outerLip: number[];
export declare function maskAt(mask: Float32Array, analysis: Analysis, x: number, y: number): number;
export declare function landmarkVisibility(analysis: Analysis, options: GenerationOptions): number[];
export declare function eyeVisibility(weights: number[]): number;
