import { clamp } from './shape';
import type { Analysis, GenerationOptions } from './types';

export const eyeContours = [
  { upper: [33, 246, 161, 160, 159, 158, 157, 173, 133], lower: [33, 7, 163, 144, 145, 153, 154, 155, 133] },
  { upper: [362, 398, 384, 385, 386, 387, 388, 466, 263], lower: [362, 382, 381, 380, 374, 373, 390, 249, 263] },
];
export const browContours = [
  { upper: [70, 63, 105, 66, 107], lower: [46, 53, 52, 65, 55] },
  { upper: [336, 296, 334, 293, 300], lower: [285, 295, 282, 283, 276] },
];
export const outerLip = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
const eyeIds = new Set(eyeContours.flatMap(({ upper, lower }) => [...upper, ...lower]));
const browIds = new Set(browContours.flatMap(({ upper, lower }) => [...upper, ...lower]));
const eyeCorners = new Set([33, 133, 362, 263]);

export function maskAt(mask: Float32Array, analysis: Analysis, x: number, y: number) {
  const px = clamp(x * analysis.maskWidth - 0.5, 0, analysis.maskWidth - 1);
  const py = clamp(y * analysis.maskHeight - 0.5, 0, analysis.maskHeight - 1);
  const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
  const at = (cx: number, cy: number) => mask[Math.min(cy, analysis.maskHeight - 1) * analysis.maskWidth + Math.min(cx, analysis.maskWidth - 1)];
  return (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
}

export function landmarkVisibility(analysis: Analysis, options: GenerationOptions) {
  const eyeDistance = Math.hypot(analysis.landmarks[263][0] - analysis.landmarks[33][0], analysis.landmarks[263][1] - analysis.landmarks[33][1]);
  const radius = eyeDistance * 0.045;
  return analysis.landmarks.slice(0, 468).map(([x, y], id) => {
    let hair = 0, accessory = 0;
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
      hair += maskAt(analysis.hair, analysis, x + dx * radius, y + dy * radius) / 5;
      accessory += maskAt(analysis.accessories, analysis, x + dx * radius, y + dy * radius) / 5;
    }
    // This is an occlusion heuristic, not a dedicated glasses detector.
    let weight = clamp(1 - Math.max(hair * (browIds.has(id) ? 0.65 : 1.15), accessory * 1.3), 0.12, 1);
    if (options.occludedEyes && eyeIds.has(id)) weight = Math.min(weight, eyeCorners.has(id) ? 0.4 : 0.12);
    return weight;
  });
}

export function eyeVisibility(weights: number[]) {
  return [...eyeIds].reduce((sum, id) => sum + weights[id], 0) / eyeIds.size;
}
