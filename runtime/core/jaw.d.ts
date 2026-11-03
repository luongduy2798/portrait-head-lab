import type { HeadTemplate, Point2, Point3 } from './types.js';
/** A narrow atlas apron for the first row behind the observed jaw. It shares
 * the facial UV edge; the outer edge fades to generated skin, not to backdrop. */
export declare function jawTransition(template: HeadTemplate, positions: Point3[]): {
    outerUv: Point2[];
    weights: number[];
};
