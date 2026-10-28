import type { CameraFit, HeadTemplate, Point2, Point3, ShapeParams, Style } from './types';

export const shapeControls = [
  ['faceWidth', 'Độ rộng mặt'], ['faceLength', 'Chiều dài mặt'],
  ['foreheadHeight', 'Độ cao trán'], ['foreheadWidth', 'Độ rộng trán'],
  ['templeWidth', 'Thái dương'], ['cheekboneWidth', 'Gò má'],
  ['cheekFullness', 'Độ đầy má'], ['jawWidth', 'Độ rộng hàm'],
  ['jawAngle', 'Góc hàm'], ['chinWidth', 'Độ rộng cằm'],
  ['chinLength', 'Độ dài cằm'], ['eyeSpacing', 'Khoảng cách mắt'],
  ['eyeSize', 'Kích thước mắt'], ['eyeTilt', 'Độ nghiêng mắt'],
  ['eyeOpening', 'Độ mở mắt'], ['browArch', 'Độ cong mày'],
  ['browHeight', 'Độ cao lông mày'], ['noseWidth', 'Độ rộng mũi'],
  ['noseLength', 'Chiều dài mũi'], ['noseBridge', 'Sống mũi'],
  ['noseTip', 'Đầu mũi'], ['mouthWidth', 'Độ rộng miệng'],
  ['lipFullness', 'Độ dày môi'], ['earSize', 'Kích thước tai'],
  ['earHeight', 'Độ cao tai'],
] as const;
export const manualKeys = ['faceWidth', 'jawWidth', 'chinLength', 'eyeSpacing', 'eyeOpening', 'eyeTilt', 'browHeight', 'browArch', 'noseWidth', 'noseTip', 'mouthWidth', 'lipFullness'];
export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const gaussian = (value: number, center: number, width: number) => Math.exp(-(((value - center) / width) ** 2));

/** Smooth, symmetric, bounded procedural bases. All deltas use the neutral
 * point, so changing a style/slider cannot accumulate deformation. */
export function deformPoint(point: Point3, part: HeadTemplate['parts'][number], params: ShapeParams, expression: ShapeParams = {}): Point3 {
  const [x, y, z] = point;
  const p = (key: string) => clamp(params[key] ?? 0, -1, 1);
  // The face keeps its landmark-fitted identity. The generated skull follows
  // the boundary gently, while the bridge carries edits across the seam.
  if (part === 'cranium' || part === 'bridge') {
    const crown = gaussian(y, 7, 4);
    const temple = gaussian(y, 3.5, 3);
    return [
      x + x * (0.025 * p('faceWidth') + 0.06 * p('foreheadWidth') * crown + 0.035 * p('templeWidth') * temple),
      y + 0.3 * p('foreheadHeight') * crown + 0.15 * p('faceLength') * clamp(y / 10, -1, 1),
      z,
    ];
  }
  if (part === 'ear') {
    const side = Math.sign(x) || 1;
    return [
      x + x * 0.025 * p('faceWidth') + (x - side * 7.3) * 0.25 * p('earSize'),
      y + y * 0.025 * p('faceLength') + (y - 0.7) * 0.25 * p('earSize') + 0.9 * p('earHeight'),
      z,
    ];
  }
  if (part === 'neck') {
    const lowerJaw = gaussian(y, -8, 3);
    return [x + x * (0.025 * p('faceWidth') + 0.04 * p('jawWidth') * lowerJaw), y + 0.12 * p('faceLength'), z];
  }
  let dx = x * 0.12 * p('faceWidth');
  let dy = y * 0.1 * p('faceLength');
  let dz = 0;
  const front = part === 'face' ? 1 : part === 'cranium' ? 0.3 : 0;
  const forehead = gaussian(y, 7, 4);
  dx += x * 0.15 * p('foreheadWidth') * forehead;
  dy += 1.2 * p('foreheadHeight') * forehead;
  dx += x * 0.1 * p('templeWidth') * gaussian(y, 3.5, 3);
  const cheek = gaussian(y, -0.8, 3) * gaussian(Math.abs(x), 5, 2.5);
  dx += Math.sign(x) * 0.9 * p('cheekboneWidth') * cheek;
  dz += 0.9 * p('cheekFullness') * cheek * front;
  const jaw = gaussian(y, -5.7, 2.6);
  dx += x * 0.17 * p('jawWidth') * jaw;
  dy += 0.85 * p('jawAngle') * jaw * gaussian(Math.abs(x), 5, 2);
  const chin = gaussian(y, -8.8, 2.1);
  dx += x * 0.3 * p('chinWidth') * chin;
  dy -= 1.25 * p('chinLength') * chin;
  const eye = gaussian(Math.abs(x), 3.15, 1.8) * gaussian(y, 2.5, 1.3) * front;
  dx += Math.sign(x) * 0.65 * p('eyeSpacing') * eye;
  dx += (x - Math.sign(x) * 3.15) * 0.2 * p('eyeSize') * eye;
  dy += (y - 2.5) * 0.35 * p('eyeSize') * eye;
  dy += (y - 2.5) * 0.5 * p('eyeOpening') * eye;
  dy += (Math.abs(x) - 3.15) * 0.18 * p('eyeTilt') * eye;
  dy += 0.6 * p('browHeight') * gaussian(y, 4.2, 1.2) * gaussian(Math.abs(x), 3, 2) * front;
  dy += 0.65 * p('browArch') * gaussian(y, 4.6, 0.9) * gaussian(Math.abs(x), 3.4, 1.1) * front;
  const nose = gaussian(x, 0, 1.7) * gaussian(y, -0.1, 2.6) * front;
  dx += x * 0.35 * p('noseWidth') * nose;
  dy -= 0.8 * p('noseLength') * nose;
  dz += p('noseBridge') * gaussian(x, 0, 1) * gaussian(y, 1.5, 2.2) * front;
  dz += p('noseTip') * gaussian(x, 0, 1.2) * gaussian(y, -1.1, 1.1) * front;
  const mouth = gaussian(x, 0, 2.6) * gaussian(y, -4.4, 1.4) * front;
  dx += x * 0.25 * p('mouthWidth') * mouth;
  dy += (y + 4.3) * 0.4 * p('lipFullness') * mouth;
  dz += 0.35 * p('lipFullness') * mouth;
  // Nuisance expression controls participate in fitting, never baked into the
  // exported neutral identity. Their prior comes from MediaPipe blendshapes.
  dy -= (expression.jawOpen ?? 0) * 1.4 * gaussian(y, -6, 3) * front;
  dy += (expression.smile ?? 0) * 0.75 * gaussian(Math.abs(x), 2, 1) * gaussian(y, -4.3, 1.2) * front;
  dy -= (expression.blink ?? 0) * (y - 2.5) * 0.45 * eye;
  return [x + dx, y + dy, z + dz];
}

export function styledParams(params: ShapeParams, style: Style, strength: number): ShapeParams {
  const result = { ...params };
  if (style === 'cartoon') {
    result.eyeSize = clamp((params.eyeSize ?? 0) + 0.45 * strength, -1, 1);
    result.cheekFullness = clamp((params.cheekFullness ?? 0) + 0.2 * strength, -1, 1);
    result.noseTip = clamp((params.noseTip ?? 0) - 0.12 * strength, -1, 1);
  } else if (style === 'caricature') {
    // Amplify the largest observed identity deviations, rather than every knob.
    const distinctive = Object.entries(params).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5);
    for (const [key, value] of distinctive) result[key] = clamp(value * (1 + strength * 0.65), -1, 1);
  }
  return result;
}

export function rotate(point: Point3, camera: CameraFit): Point3 {
  const [x, y, z] = point;
  const y1 = y * Math.cos(camera.rx) - z * Math.sin(camera.rx);
  const z1 = y * Math.sin(camera.rx) + z * Math.cos(camera.rx);
  const x2 = x * Math.cos(camera.ry) + z1 * Math.sin(camera.ry);
  const z2 = -x * Math.sin(camera.ry) + z1 * Math.cos(camera.ry);
  return [x2 * Math.cos(camera.rz) - y1 * Math.sin(camera.rz), x2 * Math.sin(camera.rz) + y1 * Math.cos(camera.rz), z2];
}

export function project(point: Point3, camera: CameraFit): Point2 {
  const [x, y] = rotate(point, camera);
  return [camera.tx + x * camera.scale, camera.ty - y * camera.scale];
}
