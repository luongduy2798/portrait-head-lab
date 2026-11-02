export declare function preparedAssetInfo(path: string): import("./prepared-manifest.js").PreparedAsset;
/** Lazy compressed payloads keep model data out of the initial SDK module. */
export declare function readPreparedAsset(path: string): Promise<Uint8Array<ArrayBuffer>>;
