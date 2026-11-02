import type { HeadPart, Point2, Point3 } from './types.js';
export interface HeadSurface {
    mouthRim?: number[];
    neckRim?: number[];
    positions: Point3[];
    parts: HeadPart[];
    uv: Point2[];
    triangles: [number, number, number][];
    skinFade: number[];
    faceTriangleCount: number;
    photoPoints?: Point2[];
}
export interface SubdividedHeadFields {
    surface: HeadSurface;
    fields: Point3[][];
}
/** Refine geometry and photo correspondence with the same Loop weights.
 * UVs only subdivide the atlas domain; smoothing photo coordinates removes
 * the affine breaks that would otherwise bend glasses at cage edges. */
export declare function smoothHeadSurface(head: HeadSurface, passes?: number): HeadSurface;
/** Subdivide several displacement fields together so they share the same
 * expensive edge/neighbor topology instead of rebuilding it for each morph. */
export declare function smoothHeadSurfaceFields(head: HeadSurface, fields: Point3[][], passes?: number): SubdividedHeadFields;
