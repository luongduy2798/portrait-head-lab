import { clamp, deformPoint, project, shapeControls } from './shape';
import { eyeVisibility, landmarkVisibility } from './visibility';
import type { Analysis, Anchor, CameraFit, FitResult, GenerationOptions, HeadTemplate, Point3, ShapeParams } from './types';

const fittingLandmarks = [10, 21, 54, 67, 103, 109, 127, 162, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454, 356, 389, 251, 284, 332, 297, 338, 33, 133, 159, 145, 263, 362, 386, 374, 70, 63, 105, 66, 107, 336, 296, 334, 293, 300, 1, 2, 4, 5, 6, 98, 327, 168, 195, 61, 291, 0, 17, 13, 14, 78, 308, 50, 280, 101, 330];
const stableLandmarks = new Set([33, 133, 263, 362, 1, 2, 4, 5, 6, 98, 327, 168, 195]);
const huber = (residual: number) => residual < 0.025 ? residual * residual / 2 : 0.025 * (residual - 0.0125);

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
