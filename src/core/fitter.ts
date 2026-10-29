import { clamp, deformPoint, project, shapeControls } from './shape';
import { eyeVisibility, landmarkVisibility, maskAt } from './visibility';
import type { Analysis, Anchor, CameraFit, FitResult, GenerationOptions, HeadTemplate, Point3, ShapeParams } from './types';

const fittingLandmarks = [10, 21, 54, 67, 103, 109, 127, 162, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454, 356, 389, 251, 284, 332, 297, 338, 33, 133, 159, 145, 263, 362, 386, 374, 70, 63, 105, 66, 107, 336, 296, 334, 293, 300, 1, 2, 4, 5, 6, 98, 327, 168, 195, 61, 291, 0, 17, 13, 14, 78, 308, 50, 280, 101, 330];
const stableLandmarks = new Set([33, 133, 263, 362, 1, 2, 4, 5, 6, 98, 327, 168, 195]);
const huber = (residual: number) => residual < 0.025 ? residual * residual / 2 : 0.025 * (residual - 0.0125);

/** Infer the visible head proportions from local segmentation. The back of
 * the skull remains a conservative prior because a single frontal photo does
 * not contain enough evidence to recover its true depth. */
function inferHeadGeometry(analysis: Analysis): ShapeParams {
  const { landmarks, maskWidth, maskHeight, hair, skin, bodySkin } = analysis;
  if (maskWidth < 2 || maskHeight < 2 || hair.length < maskWidth * maskHeight || skin.length < maskWidth * maskHeight) return {};

  const faceTop = landmarks[10][1], chinY = landmarks[152][1];
  const faceHeight = chinY - faceTop;
  const faceWidth = Math.abs(landmarks[454][0] - landmarks[234][0]);
  const centerX = (landmarks[33][0] + landmarks[263][0]) * 0.5;
  if (faceHeight < 0.05 || faceWidth < 0.05) return {};

  const sample = (mask: Float32Array, x: number, y: number) => maskAt(mask, analysis, x, y);
  // The model separates face skin from body skin. Use the latter for neck
  // measurements so face-only segmentation does not silently disable them.
  const neckMask = bodySkin && bodySkin.length >= maskWidth * maskHeight ? bodySkin : skin;
  const inferred: ShapeParams = {};

  // Use a band rather than a single pixel so a centre part or a stray hair
  // does not decide the crown height. A top clipped by the crop is ignored.
  const crownOffsets = [-0.12, -0.06, 0, 0.06, 0.12];
  const crownStep = Math.max(1 / maskHeight, faceHeight / 160);
  const crownStart = Math.max(0.015, faceTop - faceHeight * 0.82);
  const crownEnd = faceTop - faceHeight * 0.06;
  let crownTop: number | undefined;
  for (let y = crownStart; y <= crownEnd; y += crownStep) {
    const values = crownOffsets.map((offset) => sample(hair, centerX + faceWidth * offset, y));
    if (values.filter((value) => value > 0.18).length >= 2 && values.reduce((sum, value) => sum + value, 0) / values.length > 0.12) {
      crownTop = y;
      break;
    }
  }
  if (crownTop !== undefined && crownTop > 0.04) {
    const crownRatio = (faceTop - crownTop) / faceHeight;
    // The base profile already builds a natural crown about 0.22 face-heights
    // above the forehead. Only add a restrained correction for the measured
    // silhouette; using the old 0.18/0.20 mapping stacked a second tall crown
    // on top of that base and made the whole head look stretched.
    if (crownRatio >= 0.12 && crownRatio <= 0.78) inferred.craniumHeight = clamp((crownRatio - 0.22) / 0.28, -1, 1);
  }

  // The union of hair and skin gives a rough visible silhouette around the
  // temples. Only trust it when hair actually supports the outer contour.
  const extentStep = Math.max(1 / maskWidth, faceWidth / 80);
  const extent = (direction: -1 | 1, y: number, hairAndSkin: boolean) => {
    let distance = 0, gap = 0;
    for (let offset = extentStep; offset <= faceWidth * 0.8; offset += extentStep) {
      const x = centerX + direction * offset;
      // Do not let maskAt's edge clamping turn a crop boundary into a false
      // continuation of the head or neck silhouette.
      if (x < 0.01 || x > 0.99) break;
      const confidence = hairAndSkin ? Math.max(sample(hair, x, y), sample(skin, x, y)) : sample(neckMask, x, y);
      if (confidence > 0.22) { distance = offset; gap = 0; }
      else {
        gap += extentStep;
        if (gap > faceWidth * 0.08) break;
      }
    }
    return distance;
  };

  const headWidthRatios: number[] = [];
  for (const fraction of [0.04, 0.10, 0.17, 0.24]) {
    const y = faceTop + faceHeight * fraction;
    const left = extent(-1, y, true), right = extent(1, y, true);
    const ratio = (left + right) / faceWidth;
    const hairSupport = Math.max(
      sample(hair, centerX - faceWidth * 0.52, y),
      sample(hair, centerX + faceWidth * 0.52, y),
    );
    if (ratio > 1.04 && hairSupport > 0.16) headWidthRatios.push(ratio);
  }
  if (headWidthRatios.length >= 2) {
    headWidthRatios.sort((a, b) => a - b);
    const middle = Math.floor(headWidthRatios.length / 2);
    const observedRatio = headWidthRatios.length % 2
      ? headWidthRatios[middle]
      : (headWidthRatios[middle - 1] + headWidthRatios[middle]) * 0.5;
    inferred.craniumWidth = clamp((observedRatio - 1.04) / 0.20, -1, 1);
  }

  // A neck estimate is used only when skin is visible below the chin and its
  // boundary is inside the crop; otherwise keep the safe procedural default.
  const neckStart = chinY + faceHeight * 0.035;
  const neckY = chinY + faceHeight * 0.10;
  if (neckY < 0.94 && sample(neckMask, centerX, neckY) > 0.3) {
    const left = extent(-1, neckY, false), right = extent(1, neckY, false);
    const ratio = (left + right) / faceWidth;
    if (ratio >= 0.24 && ratio <= 0.90) inferred.neckWidth = clamp((ratio - 0.62) / 0.12, -1, 1);

    if (neckStart < 0.94 && [-0.035, 0, 0.035].every((offset) => sample(neckMask, centerX + faceWidth * offset, neckStart) > 0.22)) {
      let lastSkinY = neckStart, gap = 0;
      const step = Math.max(1 / maskHeight, faceHeight / 160);
      for (let y = neckStart; y < 0.97; y += step) {
        const confidence = [-0.035, 0, 0.035].reduce((sum, offset) => sum + sample(neckMask, centerX + faceWidth * offset, y) / 3, 0);
        if (confidence > 0.24) { lastSkinY = y; gap = 0; }
        else {
          gap += step;
          if (gap > faceHeight * 0.06) break;
        }
      }
      if (lastSkinY < 0.93) {
        const visibleLength = (lastSkinY - chinY) / faceHeight;
        if (visibleLength >= 0.20 && visibleLength <= 0.62) inferred.neckLength = clamp((visibleLength - 0.34) / 0.18, -1, 1);
      }
    }
  }

  // A frontal photo cannot measure skull depth. Do not let a tall crown
  // automatically push the occiput backward; that made the side profile too
  // long. Use only a weak width prior for the unseen depth.
  inferred.craniumDepth = clamp(0.35 * (inferred.craniumWidth ?? 0), -1, 1);
  return inferred;
}

export function fitHead(template: HeadTemplate, anchors: Anchor[], analysis: Analysis, options: GenerationOptions = { occludedEyes: false }): FitResult {
  const observed = analysis.landmarks;
  if (observed.length !== 478 || observed.some((point) => point.some((v) => !Number.isFinite(v)))) throw new Error('Landmark không hợp lệ.');
  const landmarkWeights = landmarkVisibility(analysis, options);
  const visibleEyes = eyeVisibility(landmarkWeights);
  const byId = new Map(anchors.map((anchor) => [anchor.landmark, anchor]));
  const fitting = fittingLandmarks.map((id) => {
    const anchor = byId.get(id);
    if (!anchor || !template.triangles[anchor.triangle]) throw new Error(`Thiếu anchor ${id}.`);
    if (Math.abs(anchor.weights.reduce((a, b) => a + b, 0) - 1) > 1e-6) throw new Error('Barycentric weights không hợp lệ.');
    return { id, anchor };
  });
  const params: ShapeParams = Object.fromEntries(shapeControls.map(([key]) => [key, 0]));
  const expression: ShapeParams = {
    jawOpen: clamp(analysis.blendshapes.jawOpen ?? 0, 0, 1),
    smile: clamp(((analysis.blendshapes.mouthSmileLeft ?? 0) + (analysis.blendshapes.mouthSmileRight ?? 0)) / 2, 0, 1),
    blink: clamp(((analysis.blendshapes.eyeBlinkLeft ?? 0) + (analysis.blendshapes.eyeBlinkRight ?? 0)) / 2, 0, 1),
  };
  const expressionPrior = { ...expression };
  const eyeDistance = Math.hypot(observed[263][0] - observed[33][0], observed[263][1] - observed[33][1]);
  if (eyeDistance < 0.05) throw new Error('Hai mắt quá nhỏ hoặc bị che. Hãy chọn ảnh rõ hơn và gần chính diện.');
  const width = Math.hypot(template.positions[263][0] - template.positions[33][0], template.positions[263][1] - template.positions[33][1]);
  const camera: CameraFit = {
    rx: 0, ry: 0,
    rz: -Math.atan2(observed[263][1] - observed[33][1], observed[263][0] - observed[33][0]),
    scale: eyeDistance / width,
    tx: (observed[33][0] + observed[263][0]) / 2,
    ty: (observed[33][1] + observed[263][1]) / 2 + template.positions[33][1] * eyeDistance / width,
  };
  const anchorPosition = (anchor: Anchor): Point3 => {
    const triangle = template.triangles[anchor.triangle];
    const point: Point3 = [0, 0, 0];
    triangle.forEach((vertex, corner) => {
      const deformed = deformPoint(template.positions[vertex], template.parts[vertex], params, expression);
      for (let axis = 0; axis < 3; axis++) point[axis] += deformed[axis] * anchor.weights[corner];
    });
    return point;
  };
  const loss = () => {
    let value = 0, weights = 0;
    for (const { id, anchor } of fitting) {
      const projected = project(anchorPosition(anchor), camera);
      // Mouth/eyelid shape is less reliable as identity evidence during expression.
      const weight = (stableLandmarks.has(id) ? 2 : id === 13 || id === 14 ? 0.35 : 1) * landmarkWeights[id];
      const dx = (projected[0] - observed[id][0]) / eyeDistance;
      const dy = (projected[1] - observed[id][1]) / eyeDistance;
      value += weight * huber(Math.hypot(dx, dy)); weights += weight;
    }
    const prior = Object.values(params).reduce((sum, p) => sum + p * p, 0) * 0.000025;
    const expressionLoss = Object.entries(expression).reduce((sum, [key, p]) => sum + (p - expressionPrior[key]) ** 2, 0) * 0.0002;
    return value / weights + prior + expressionLoss;
  };
  let best = loss(), iterations = 0;
  const started = performance.now();
  // Identity basis bounds provide the bound term; symmetric Gaussian bases
  // provide symmetry and smoothness by construction. No per-vertex fitting.
  const optimize = (object: Record<string, number>, key: string, step: number, min: number, max: number) => {
    const original = object[key];
    let picked = original;
    for (const direction of [-1, 1]) {
      object[key] = clamp(original + direction * step, min, max);
      const candidate = loss();
      if (candidate < best) { best = candidate; picked = object[key]; }
    }
    object[key] = picked;
  };
  let stale = 0;
  for (let round = 0; round < 28; round++) {
    const before = best;
    const decay = round < 7 ? 1 : round < 16 ? 0.45 : 0.18;
    for (let repeat = 0; repeat < 2; repeat++) {
      optimize(camera, 'tx', eyeDistance * 0.02 * decay, -1, 2);
      optimize(camera, 'ty', eyeDistance * 0.02 * decay, -1, 2);
      optimize(camera, 'scale', eyeDistance / width * 0.025 * decay, 0.001, 0.2);
      for (const key of ['rx', 'ry', 'rz']) optimize(camera, key, 0.035 * decay, -0.75, 0.75);
    }
    for (const [key] of shapeControls) {
      if (key.startsWith('ear')) continue; // Not observable: preserve prior.
      if (visibleEyes < 0.45 && ['eyeSize', 'eyeOpening', 'eyeTilt'].includes(key)) continue;
      optimize(params, key, 0.15 * decay, -1, 1);
    }
    for (const key of Object.keys(expression)) optimize(expression, key, 0.1 * decay, 0, 1);
    iterations++;
    stale = before - best < 1e-9 ? stale + 1 : 0;
    if (stale >= 4 || performance.now() - started > 2400) break;
  }
  Object.assign(params, inferHeadGeometry(analysis));
  const projected = template.positions.slice(0, template.canonicalCount).map((point, vertex) => project(deformPoint(point, template.parts[vertex], params, expression), camera));
  const squared = fitting.reduce((sum, { id }) => sum + landmarkWeights[id] * ((projected[id][0] - observed[id][0]) ** 2 + (projected[id][1] - observed[id][1]) ** 2), 0);
  const normalizedError = Math.sqrt(squared / fitting.reduce((sum, { id }) => sum + landmarkWeights[id], 0)) / eyeDistance;
  const warnings: string[] = [];
  if (visibleEyes < 0.45) warnings.push('Vùng mắt bị che hoặc được đánh dấu có kính: giữ hình mắt mẫu, có thể chỉnh độ mở/nghiêng mắt.');
  if (fitting.filter(({ id }) => landmarkWeights[id] < 0.4).length > 5) warnings.push('Đã giảm ảnh hưởng của vùng có tóc/phụ kiện lên hình học; phần bị che dùng hình dạng mẫu.');
  if (Math.abs(camera.ry) > 0.35 || Math.abs(camera.rx) > 0.35) warnings.push('Ảnh nghiêng nhiều: vùng khuất dùng hình dạng mẫu. Nên thử ảnh gần chính diện.');
  if (expression.jawOpen > 0.25) warnings.push('Miệng mở: đầu xuất về trạng thái trung tính; texture môi có thể còn biểu cảm.');
  if (normalizedError > 0.08) warnings.push('Sai số khớp còn cao. Thử crop sát mặt, ảnh thẳng hoặc chỉnh các thanh hình học.');
  return { params, expression, camera, projected, normalizedError, iterations, landmarkWeights, warnings };
}
