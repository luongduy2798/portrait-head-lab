import { expressionSet, type ExpressionName } from './expressions.js';
import type { Point3 } from './types.js';
import { type HeadAssetOptions } from '../assets.js';
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
export declare function loadExpressionRig(options?: HeadAssetOptions, signal?: AbortSignal): Promise<ExpressionRigAsset>;
