import type { BufferAttribute, InterleavedBufferAttribute } from 'three';
import type { HeadSurface } from './subdivision.js';
import type { Point3 } from './types.js';
interface SurfaceHit {
    point: Point3;
    normal: Point3;
}
/** Exact lateral intersection with the rendered neutral head. A YZ grid
 * limits triangle candidates without approximating their positions or normals.
 * Units are canonical centimetres, like HeadSurface and the ear template. */
export declare function createSideSurfaceSampler(surface: HeadSurface, normals: BufferAttribute | InterleavedBufferAttribute): (side: -1 | 1, y: number, z: number) => SurfaceHit | undefined;
export {};
