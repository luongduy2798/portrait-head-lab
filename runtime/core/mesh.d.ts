import * as THREE from 'three';
import type { EarTemplate } from './ears.js';
import type { ExpressionRigAsset } from './expression-rig.js';
import { type HeadSurface } from './subdivision.js';
import type { HeadResult, HeadTemplate, ShapeParams, Style } from './types.js';
/** Corner-angle weighting avoids letting the largest triangles dominate the
 * shading where the facial mesh joins the differently spaced loft rings. */
export declare function computeSmoothNormals(geometry: THREE.BufferGeometry): void;
export interface HeadBuildOptions {
    /** Keep the generated neck open for the mobile body adapter. */
    openNeck?: boolean;
    onNeutralSurface?: (geometry: THREE.BufferGeometry, surface: HeadSurface) => void;
    includeExpressions?: boolean;
    includeEars?: boolean;
    includeOralCavity?: boolean;
}
export declare function createHead(template: HeadTemplate, ears?: EarTemplate, rig?: ExpressionRigAsset, result?: HeadResult, params?: ShapeParams, style?: Style, strength?: number, flat?: boolean, options?: HeadBuildOptions): THREE.Group<THREE.Object3DEventMap>;
export declare function updateFlatAppearance(object: THREE.Object3D | undefined, flat: boolean): void;
export declare function disposeObject(object: THREE.Object3D): void;
