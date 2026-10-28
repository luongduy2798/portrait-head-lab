import * as THREE from 'three';
import { clamp } from './shape';
import type { Point3 } from './types';

export const expressionControls = [
  ['happy', 'Vui'], ['sad', 'Buồn'], ['angry', 'Tức giận'],
  ['surprised', 'Ngạc nhiên'], ['fearful', 'Sợ hãi'], ['disgusted', 'Ghê tởm'],
] as const;
export type ExpressionName = typeof expressionControls[number][0];
export type ExpressionSelection = ExpressionName | 'neutral';

interface ExpressionPose {
  smile: number; frown: number; browInner: number; browOuter: number;
  eyeOpen: number; jawOpen: number; mouthStretch: number; upperLip: number; noseRaise: number;
}
const poses: Record<ExpressionName, ExpressionPose> = {
  happy: { smile: 1, frown: 0, browInner: 0.05, browOuter: 0.1, eyeOpen: -0.45, jawOpen: 0.12, mouthStretch: 0.65, upperLip: 0, noseRaise: 0 },
  sad: { smile: 0, frown: 1, browInner: 0.85, browOuter: -0.3, eyeOpen: -0.2, jawOpen: 0, mouthStretch: -0.15, upperLip: 0, noseRaise: 0 },
  angry: { smile: 0, frown: 0.35, browInner: -1, browOuter: 0.15, eyeOpen: -0.4, jawOpen: 0, mouthStretch: 0.1, upperLip: 0.05, noseRaise: 0.1 },
  surprised: { smile: 0, frown: 0, browInner: 1, browOuter: 1, eyeOpen: 1, jawOpen: 1, mouthStretch: -0.5, upperLip: 0.15, noseRaise: 0 },
  fearful: { smile: 0, frown: 0.4, browInner: 1, browOuter: 0.4, eyeOpen: 0.85, jawOpen: 0.45, mouthStretch: 0.75, upperLip: 0.15, noseRaise: 0 },
  disgusted: { smile: 0, frown: 0.3, browInner: -0.4, browOuter: -0.15, eyeOpen: -0.3, jawOpen: 0.12, mouthStretch: -0.2, upperLip: 1, noseRaise: 1 },
};
const gaussian = (value: number, center: number, width: number) => Math.exp(-(((value - center) / width) ** 2));

/** Author six bounded poses on the identity cage, before subdivision. The
 * original lip rows identify upper/lower lips even after neutral closure. */
export function expressionPositions(neutral: Point3[], identity: Point3[], name: ExpressionName): Point3[] {
  const pose = poses[name];
  const mouthX = (identity[61][0] + identity[291][0]) * 0.5;
  const mouthY = (identity[13][1] + identity[14][1]) * 0.5;
  const halfMouth = Math.max(0.8, Math.abs(identity[291][0] - identity[61][0]) * 0.5);
  const eyes = [[33, 133, 159, 145], [362, 263, 386, 374]].map((ids) =>
    ids.reduce((sum, id) => sum.map((value, axis) => value + identity[id][axis] / ids.length) as Point3, [0, 0, 0] as Point3));
  const browY = [70, 105, 107, 336, 334, 300].reduce((sum, id) => sum + identity[id][1] / 6, 0);
  const eyeY = (eyes[0][1] + eyes[1][1]) * 0.5;
  const hingeY = eyeY - 1.1, hingeZ = -1.5;
  return neutral.map(([x, y, z], id): Point3 => {
    const original = identity[id], mx = (x - mouthX) / halfMouth;
    const mouth = gaussian(y, mouthY, 1.2) * Math.exp(-((mx / 1.3) ** 4));
    const corner = gaussian(Math.abs(mx), 0.95, 0.45) * gaussian(y, mouthY, 1.15);
    const lipCenter = (identity[61][1] + identity[291][1]) * 0.5;
    const curve = mouthY + (lipCenter - mouthY) * Math.min(1, mx * mx);
    const lower = original[1] < curve;
    const lip = gaussian(original[1], curve, 0.7) * Math.exp(-((mx / 0.85) ** 4));
    const jaw = Math.max(THREE.MathUtils.smoothstep(mouthY - original[1], 0.1, 1.7), lower ? lip : 0);
    const theta = 0.2 * pose.jawOpen * jaw;
    let dy = (y - hingeY) * (Math.cos(theta) - 1) - (z - hingeZ) * Math.sin(theta);
    let dz = (y - hingeY) * Math.sin(theta) + (z - hingeZ) * (Math.cos(theta) - 1);
    let dx = (x - mouthX) * 0.12 * pose.mouthStretch * mouth;
    dy += (0.75 * pose.smile - 0.55 * pose.frown) * corner;
    dy += (lower ? 0 : 0.18 * pose.jawOpen + 0.55 * pose.upperLip) * lip;
    const cheek = gaussian(Math.abs(x - mouthX), halfMouth + 1.2, 1.7) * gaussian(y, mouthY + 2.3, 1.6);
    dy += 0.3 * pose.smile * cheek;
    dz += 0.12 * pose.smile * cheek;
    const eye = eyes[x < 0 ? 0 : 1];
    const eyeMask = gaussian(x, eye[0], 1.5) * gaussian(y, eye[1], 0.9);
    dy += (y - eye[1]) * 0.5 * pose.eyeOpen * eyeMask;
    const inner = gaussian(Math.abs(x), 1.6, 1.1), outer = gaussian(Math.abs(x), 4.4, 1.4);
    const brow = gaussian(y, browY, 0.85);
    dy += 0.65 * (pose.browInner * inner + pose.browOuter * outer) * brow;
    dx -= Math.sign(x) * 0.15 * Math.max(0, -pose.browInner) * inner * brow;
    const nose = gaussian(x, 0, 1.25) * gaussian(y, identity[2][1], 1.15);
    dy += 0.25 * pose.noseRaise * nose;
    dz += 0.12 * pose.noseRaise * nose;
    return [x + dx, y + dy, z + dz];
  });
}

export function supportsExpressions(object?: THREE.Object3D): boolean {
  let supported = false;
  object?.traverse((child) => {
    if (child instanceof THREE.Mesh && expressionControls.every(([name]) => child.morphTargetDictionary?.[name] !== undefined)) supported = true;
  });
  return supported;
}

export function applyExpression(object: THREE.Object3D, selected: ExpressionSelection, strength: number) {
  const amount = clamp(strength, 0, 1);
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.morphTargetInfluences || !child.morphTargetDictionary) return;
    for (const [name] of expressionControls) {
      const index = child.morphTargetDictionary[name];
      if (index !== undefined) child.morphTargetInfluences[index] = name === selected ? amount : 0;
    }
  });
  object.userData.expression = { name: selected, strength: amount };
}
