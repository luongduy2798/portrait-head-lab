import type { Point3 } from './types.js';
import { type HeadAssetOptions } from '../assets.js';
export interface EarTemplate {
    positions: Point3[];
    triangles: [number, number, number][];
    rootWeights: number[];
    neighbors: number[][];
}
export declare function loadEarTemplate(options?: HeadAssetOptions, signal?: AbortSignal): Promise<EarTemplate>;
