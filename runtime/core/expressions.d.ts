import * as THREE from 'three';
import type { ExpressionRigAsset } from './expression-rig.js';
import type { Point3 } from './types.js';
export declare const expressionSet = "faceverse-mobile-v1";
export declare const expressionControls: readonly [readonly ["unbothered", "Unbothered"], readonly ["locked_in", "Locked in"], readonly ["cracking_up", "Cracking up"], readonly ["full_panic", "Full panic"], readonly ["big_winner", "Big winner"], readonly ["spectacular_flop", "Spectacular flop"]];
export declare const legacyExpressionControls: readonly [readonly ["happy", "Vui"], readonly ["sad", "Buồn"], readonly ["angry", "Tức giận"], readonly ["surprised", "Ngạc nhiên"], readonly ["fearful", "Sợ hãi"], readonly ["disgusted", "Ghê tởm"]];
export type ExpressionName = typeof expressionControls[number][0];
export type ExpressionSelection = ExpressionName | typeof legacyExpressionControls[number][0] | 'neutral';
export declare const expressionIntensityMultiplier = 2;
export declare function controlsForObject(object?: THREE.Object3D): readonly [readonly ["unbothered", "Unbothered"], readonly ["locked_in", "Locked in"], readonly ["cracking_up", "Cracking up"], readonly ["full_panic", "Full panic"], readonly ["big_winner", "Big winner"], readonly ["spectacular_flop", "Spectacular flop"]] | readonly [readonly ["happy", "Vui"], readonly ["sad", "Buồn"], readonly ["angry", "Tức giận"], readonly ["surprised", "Ngạc nhiên"], readonly ["fearful", "Sợ hãi"], readonly ["disgusted", "Ghê tởm"]];
export declare function supportsExpressions(object?: THREE.Object3D): boolean;
/** Include the full 2x preset range in culling bounds. Exact export bounds are
 * still measured from the active pose by Box3.setFromObject(..., true). */
export declare function updateExpressionBounds(geometry: THREE.BufferGeometry): void;
export declare function applyExpression(object: THREE.Object3D, selected: ExpressionSelection, strength: number): void;
/** glTF may wrap the exported group in a scene. Prefer its normalized UI
 * metadata, including zero-weight Unbothered, over guessing from raw weights. */
export declare function readExpression(object: THREE.Object3D): {
    name: ExpressionSelection;
    strength: number;
};
/** A common resting mouth frame places the dental arches and tongue. The same
 * transform is used on every source pose, preserving native jaw alignment. */
export declare function mouthTransform(source: readonly Point3[], target: readonly Point3[]): THREE.Matrix4;
/** Fit a local affine differential from each canonical one-ring. Its normal
 * constraint supplies depth where surface neighbors alone are nearly planar.
 * No face geometry from FaceVerse replaces the fitted identity. */
export declare function retargetExpressionDeltas(rig: ExpressionRigAsset, identity: Point3[], triangles: [number, number, number][]): Record<"unbothered" | "locked_in" | "cracking_up" | "full_panic" | "big_winner" | "spectacular_flop", Point3[]>;
