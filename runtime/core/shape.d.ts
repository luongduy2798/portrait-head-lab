import type { CameraFit, HeadTemplate, Point2, Point3, ShapeParams, Style } from './types.js';
export declare const shapeControls: readonly [readonly ["faceWidth", "Độ rộng mặt"], readonly ["faceLength", "Chiều dài mặt"], readonly ["foreheadHeight", "Độ cao trán"], readonly ["foreheadWidth", "Độ rộng trán"], readonly ["templeWidth", "Thái dương"], readonly ["cheekboneWidth", "Gò má"], readonly ["cheekFullness", "Độ đầy má"], readonly ["jawWidth", "Độ rộng hàm"], readonly ["jawAngle", "Góc hàm"], readonly ["chinWidth", "Độ rộng cằm"], readonly ["chinLength", "Độ dài cằm"], readonly ["eyeSpacing", "Khoảng cách mắt"], readonly ["eyeSize", "Kích thước mắt"], readonly ["eyeTilt", "Độ nghiêng mắt"], readonly ["eyeOpening", "Độ mở mắt"], readonly ["browArch", "Độ cong mày"], readonly ["browHeight", "Độ cao lông mày"], readonly ["noseWidth", "Độ rộng mũi"], readonly ["noseLength", "Chiều dài mũi"], readonly ["noseBridge", "Sống mũi"], readonly ["noseTip", "Đầu mũi"], readonly ["mouthWidth", "Độ rộng miệng"], readonly ["lipFullness", "Độ dày môi"], readonly ["earSize", "Kích thước tai"], readonly ["earHeight", "Độ cao tai"], readonly ["earOutset", "Độ vểnh tai"]];
export declare const manualKeys: string[];
export declare const clamp: (value: number, low: number, high: number) => number;
/** Smooth, symmetric, bounded procedural bases. All deltas use the neutral
 * point, so changing a style/slider cannot accumulate deformation. */
export declare function deformPoint(point: Point3, part: HeadTemplate['parts'][number], params: ShapeParams, expression?: ShapeParams): Point3;
export declare function styledParams(params: ShapeParams, style: Style, strength: number): ShapeParams;
export declare function rotate(point: Point3, camera: CameraFit): Point3;
export declare function project(point: Point3, camera: CameraFit): Point2;
