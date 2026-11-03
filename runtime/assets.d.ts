/** Optional per-instance override; normal consumers use library-owned defaults. */
export interface HeadAssetOptions {
    assetBaseUrl?: string;
}
/** CDN files become verified Blob URLs before being passed to browser workers. */
export declare function headAssetURL(options: HeadAssetOptions, path: string): Promise<string>;
export declare function headWorkerAssets(options: HeadAssetOptions): Promise<{
    bundle: string;
    landmarker: string;
    segmenter: string;
    files: {
        wasmLoaderPath: string;
        wasmBinaryPath: string;
    };
}>;
/** A session can stop waiting without aborting another session's shared assets. */
export declare function waitForHeadAssets<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T>;
