declare const headErrorCodes: readonly ["invalidImage", "noFace", "multipleFaces", "smallFace", "frontalFace", "landmarks", "assets", "generation", "faceUnavailable"];
export type HeadErrorCode = (typeof headErrorCodes)[number];
export declare function isHeadErrorCode(value: unknown): value is HeadErrorCode;
export declare class HeadError extends Error {
    readonly code: HeadErrorCode;
    constructor(code: HeadErrorCode);
}
export {};
