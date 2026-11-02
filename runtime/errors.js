const headErrorCodes = [
    'invalidImage', 'noFace', 'multipleFaces', 'smallFace', 'frontalFace',
    'landmarks', 'assets', 'generation', 'faceUnavailable',
];
export function isHeadErrorCode(value) {
    return typeof value === 'string' && headErrorCodes.some((code) => code === value);
}
export class HeadError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'HeadError';
    }
}
