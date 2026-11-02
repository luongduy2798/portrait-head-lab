import * as THREE from 'three';
import type { HeadAssetOptions } from './assets.js';
import { type Progress } from './core/pipeline.js';
import type { Point3 } from './core/types.js';
import { type PortraitHeadData } from './data.js';
export interface PortraitHead {
    data: PortraitHeadData;
    root: THREE.Group;
    neutral: THREE.BufferGeometry;
    landmarks: Point3[];
    neckIndices: number[];
    skinColor: number[];
    dispose(): void;
}
export interface PortraitHeadOptions extends HeadAssetOptions {
    /** A body adapter can request an open neck; standalone heads stay closed. */
    openNeck?: boolean;
}
export interface PortraitHeadGenerateOptions {
    signal?: AbortSignal;
    onProgress?: (progress: Progress) => void;
    crop?: 'auto' | 'none';
    occludedEyes?: boolean;
}
export interface PortraitHeadRestoreOptions extends PortraitHeadOptions {
    signal?: AbortSignal;
}
/** Rebuild a saved face using the same library-owned model/data contract. */
export declare function restorePortraitHead(data: PortraitHeadData, options?: PortraitHeadRestoreOptions): Promise<PortraitHead>;
/** Complete SDK session: assets, analysis, fitting, mesh creation and restore. */
export declare class PortraitHeadPipeline {
    private readonly pipeline;
    private readonly options;
    private active?;
    constructor(options?: PortraitHeadOptions);
    generate(source: File | HTMLCanvasElement, options?: PortraitHeadGenerateOptions): Promise<PortraitHead>;
    restore(data: PortraitHeadData, options?: {
        signal?: AbortSignal;
    }): Promise<PortraitHead>;
    private run;
    cancel(): void;
    dispose(): void;
}
