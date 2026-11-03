import type { Analysis, CameraFit, FaceIdentity, HeadTemplate, Point3, ShapeParams } from './types.js';
/** MediaPipe Z is relative, points away from the camera and uses the X scale.
 * It is a learned estimate, not measured depth. Degenerate estimates must not
 * flatten the face or determine pose. */
export declare function relativeDepthConfidence(analysis: Analysis): number;
/** Apply the same neutral correction to rendering, texture visibility and
 * restore. Sliders/styles always start from the template plus this field. */
export declare function facePositions(template: HeadTemplate, params: ShapeParams, identity?: FaceIdentity, expression?: ShapeParams): Point3[];
/** Retain the measured contour, nasal planes and eyelid aperture through
 * refinement. The weights also apply to photo correspondence and morphs. */
export declare function faceDetailWeights(template: HeadTemplate): (0.2 | 0.05 | 0.55)[];
/** Fit a regularized displacement field after the coarse pose/shape solve.
 * Smooth the corrections, not the face itself: observed cheek hollows and
 * jaw angles can survive without forcing left/right symmetry. */
export declare function fitFaceIdentity(template: HeadTemplate, analysis: Analysis, params: ShapeParams, expression: ShapeParams, camera: CameraFit, landmarkWeights: number[]): FaceIdentity;
