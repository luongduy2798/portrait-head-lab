import { type HeadAssetOptions } from '../assets.js';
import type { Analysis, Anchor, GenerationOptions, HeadResult, HeadTemplate } from './types.js';
export interface Progress {
    phase: 'loadingModel' | 'detecting' | 'segmenting' | 'fitting' | 'texturing';
    progress: number;
}
export interface PipelineGenerationOptions extends GenerationOptions {
    signal?: AbortSignal;
    /** File inputs default to auto; a canvas from the demo cropper defaults to none. */
    crop?: 'auto' | 'none';
}
interface TemplateAssets {
    template: HeadTemplate;
    anchors: Anchor[];
}
export declare function loadTemplate(options?: HeadAssetOptions, signal?: AbortSignal): Promise<TemplateAssets>;
/** Each session owns its worker pair; only immutable model data is shared. */
export declare class HeadPipeline {
    private analyzer?;
    private generator?;
    private activeReject?;
    private activeController?;
    private sequence;
    private busy;
    private readonly workerURLs;
    private readonly assets;
    constructor(options?: HeadAssetOptions);
    generate(source: File | HTMLCanvasElement, onProgress: (progress: Progress) => void, options?: PipelineGenerationOptions): Promise<{
        result: HeadResult;
        analysis: Analysis;
        template: HeadTemplate;
    }>;
    private createWorker;
    private request;
    cancel(): void;
    dispose(): void;
}
export {};
