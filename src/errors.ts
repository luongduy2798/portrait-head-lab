const headErrorCodes = [
  'invalidImage', 'noFace', 'multipleFaces', 'smallFace', 'frontalFace',
  'landmarks', 'assets', 'generation',
] as const;

export type HeadErrorCode = (typeof headErrorCodes)[number];

export function isHeadErrorCode(value: unknown): value is HeadErrorCode {
  return typeof value === 'string' && headErrorCodes.some((code) => code === value);
}

export class HeadError extends Error {
  constructor(readonly code: HeadErrorCode) {
    super(code);
    this.name = 'HeadError';
  }
}
