export type Point3 = [number, number, number];
export type Point2 = [number, number];
export type HeadPart = 'face' | 'cranium' | 'ear' | 'neck' | 'bridge';
export interface SkinSample {
  region: 'left-cheek' | 'right-cheek' | 'left-temple' | 'right-temple' | 'forehead' | 'jaw';
  position: Point3;
  color: [number, number, number];
}
export interface HeadTemplate {
  schemaVersion: 1;
  canonicalCount: number;
  faceTriangleCount: number;
  positions: Point3[];
  uv: Point2[];
  triangles: [number, number, number][];
  parts: HeadPart[];
  boundary: number[];
}
export interface Anchor {
  landmark: number;
  triangle: number;
  weights: Point3;
}
export interface Analysis {
  landmarks: Point3[];
  blendshapes: Record<string, number>;
  skin: Float32Array;
  hair: Float32Array;
  accessories: Float32Array;
  maskWidth: number;
  maskHeight: number;
  timings: Record<string, number>;
}
export interface CameraFit extends Record<string, number> {
  rx: number; ry: number; rz: number;
  scale: number; tx: number; ty: number;
}
export type ShapeParams = Record<string, number>;
export type Style = 'natural' | 'cartoon' | 'caricature';
export interface GenerationOptions { occludedEyes: boolean }
export interface PaletteOverrides { skin?: string; eyes?: string; brows?: string }
export interface FitResult {
  params: ShapeParams;
  expression: ShapeParams;
  camera: CameraFit;
  projected: Point2[];
  normalizedError: number;
  iterations: number;
  landmarkWeights: number[];
  warnings: string[];
}
export interface HeadResult {
  fit: FitResult;
  atlas: Uint8ClampedArray | null;
  atlasSize: number;
  skinColor: [number, number, number];
  skinDarkColor: [number, number, number];
  skinLightColor: [number, number, number];
  skinSamples: SkinSample[];
  timings: Record<string, number>;
  projectedCoverage: number;
}

