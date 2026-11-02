/** Optional per-instance override; normal consumers use library-owned defaults. */
export interface HeadAssetOptions {
    assetBaseUrl?: string;
}
/** Both packaged assets and CDN files become verified, same-origin Blob URLs. */
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
