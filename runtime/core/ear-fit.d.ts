import type { Analysis, CameraFit, HeadMeasurements, HeadTemplate } from './types.js';
/** Measure only the visible skin silhouette outside the face. The detector
 * has no ear landmarks: these ratios cannot describe the helix or hidden ear. */
export declare function measureVisibleEars(analysis: Analysis, template: HeadTemplate, camera: CameraFit): HeadMeasurements['ears'];
