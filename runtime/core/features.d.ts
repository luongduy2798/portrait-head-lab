import * as THREE from 'three';
import type { HeadPart, HeadTemplate, PaletteOverrides, Point3 } from './types.js';
export interface FacePalette {
    skin: THREE.Color;
    lips: THREE.Color;
    brows: THREE.Color;
    iris: THREE.Color;
    pupil: THREE.Color;
    sclera: THREE.Color;
}
export declare function createPalette(skin: Point3, overrides?: PaletteOverrides): FacePalette;
/** The existing lip surface already has sculpted geometry and six morphs.
 * Give it an authored colour instead of projecting lips from the portrait. */
export declare function colorFaceDetails(geometry: THREE.BufferGeometry, template: HeadTemplate, parts: HeadPart[], palette: FacePalette): void;
/** Build details from the smoothed head's landmarks, then author matching
 * targets from its actual expression deltas. No portrait pixels are used. */
export declare function createFaceDetails(head: THREE.BufferGeometry, palette: FacePalette): THREE.Group<THREE.Object3DEventMap>;
