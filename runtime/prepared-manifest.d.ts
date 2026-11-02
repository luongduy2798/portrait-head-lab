export interface PreparedAsset {
    bytes: number;
    sha256: string;
    mime: string;
    load: () => Promise<{
        default: string;
    }>;
}
export declare const preparedAssetManifest: Record<string, PreparedAsset>;
