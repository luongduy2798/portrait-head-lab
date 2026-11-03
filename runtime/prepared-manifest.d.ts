export interface PreparedAsset {
    bytes: number;
    sha256: string;
    mime: string;
}
export declare const preparedAssetManifest: Record<string, PreparedAsset>;
