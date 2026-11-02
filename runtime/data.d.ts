import type { CameraFit, HeadMeasurements, HeadResult, ShapeParams } from './core/types.js';
export interface PortraitHeadData {
    schemaVersion: 1;
    generator: 'portrait-head-procedural-v1';
    sourceCommit: '9b8fb0355f628d56783e361f30ed3022fa70b710';
    params: ShapeParams;
    measurements: HeadMeasurements;
    camera: CameraFit;
    appearance: Omit<HeadResult, 'fit' | 'timings'>;
}
/** Archive fitted parameters and baked head textures, never detector landmarks,
 * source pixels, a body/wardrobe or a full-avatar GLB. */
export declare function portraitHeadData(result: HeadResult): PortraitHeadData;
/** IndexedDB is an input boundary, including after an app version change. */
export declare function isPortraitHeadData(value: unknown): value is PortraitHeadData;
