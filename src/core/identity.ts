import { clamp, deformPoint, rotate } from './shape.js';
import { eyeContours } from './visibility.js';
import type { Analysis, CameraFit, FaceIdentity, HeadTemplate, Point3, ShapeParams } from './types.js';

/** MediaPipe Z is relative, points away from the camera and uses the X scale.
 * It is a learned estimate, not measured depth. Degenerate estimates must not
 * flatten the face or determine pose. */
export function relativeDepthConfidence(analysis: Analysis) {
  const points = analysis.landmarks;
  const width = Math.hypot(points[263][0] - points[33][0], points[263][1] - points[33][1]);
  const depths = points.slice(0, 468).map((point) => point[2]).sort((a, b) => a - b);
  const spread = (depths[444] - depths[23]) / Math.max(width, 1e-6);
  return clamp((spread - 0.08) / 0.25, 0, 1) * clamp((2.5 - spread) / 0.75, 0, 1);
}

function unrotate([x, y, z]: Point3, camera: CameraFit): Point3 {
  const x1 = x * Math.cos(camera.rz) + y * Math.sin(camera.rz);
  const y1 = -x * Math.sin(camera.rz) + y * Math.cos(camera.rz);
  const x2 = x1 * Math.cos(camera.ry) - z * Math.sin(camera.ry);
  const z2 = x1 * Math.sin(camera.ry) + z * Math.cos(camera.ry);
  return [x2, y1 * Math.cos(camera.rx) + z2 * Math.sin(camera.rx), -y1 * Math.sin(camera.rx) + z2 * Math.cos(camera.rx)];
}

/** Apply the same neutral correction to rendering, texture visibility and
 * restore. Sliders/styles always start from the template plus this field. */
export function facePositions(template: HeadTemplate, params: ShapeParams, identity?: FaceIdentity, expression: ShapeParams = {}): Point3[] {
  return template.positions.slice(0, template.canonicalCount).map((point, id) => {
    const shaped = deformPoint(point, 'face', params, expression);
    const delta = identity?.deltas[id];
    return delta ? shaped.map((value, axis) => value + delta[axis]) as Point3 : shaped;
  });
}

/** Retain the measured contour, nasal planes and eyelid aperture through
 * refinement. The weights also apply to photo correspondence and morphs. */
export function faceDetailWeights(template: HeadTemplate) {
  const features = new Set([
    ...template.boundary,
    ...eyeContours.flatMap(({ upper, lower }) => [...upper, ...lower]),
    1, 2, 4, 5, 6, 19, 94, 97, 98, 168, 195, 326, 327,
  ]);
  return Array.from({ length: template.canonicalCount }, (_, id) => features.has(id) ? 0.55 : 0.2);
}

/** Fit a regularized displacement field after the coarse pose/shape solve.
 * Smooth the corrections, not the face itself: observed cheek hollows and
 * jaw angles can survive without forcing left/right symmetry. */
export function fitFaceIdentity(template: HeadTemplate, analysis: Analysis, params: ShapeParams, expression: ShapeParams, camera: CameraFit, landmarkWeights: number[]): FaceIdentity {
  const base = facePositions(template, params, undefined, expression).map((point) => rotate(point, camera));
  const count = template.canonicalCount;
  const neighbors = base.map(() => new Set<number>());
  const normals = base.map((): Point3 => [0, 0, 0]);
  for (const [a, b, c] of template.triangles.slice(0, template.faceTriangleCount)) {
    neighbors[a].add(b).add(c); neighbors[b].add(a).add(c); neighbors[c].add(a).add(b);
    const ab = base[b].map((value, axis) => value - base[a][axis]);
    const ac = base[c].map((value, axis) => value - base[a][axis]);
    const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    for (const id of [a, b, c]) for (let axis = 0; axis < 3; axis++) normals[id][axis] += normal[axis];
  }
  const smile = clamp(((expression.smile ?? 0) - 0.35) / 0.65, 0, 1);
  const jaw = clamp(((expression.jawOpen ?? 0) - 0.25) / 0.75, 0, 1);
  const blink = clamp(((expression.blink ?? 0) - 0.55) / 0.45, 0, 1);
  const confidence = landmarkWeights.map((weight, id) => {
    const [x, y] = template.positions[id];
    // The nuisance expression model is only approximate. A broad grin or
    // closed eye is not reliable neutral-identity evidence in that region.
    const mouth = Math.exp(-((x / 3.8) ** 2) - (((y + 4.3) / 2.3) ** 2));
    const lowerFace = Math.exp(-(((y + 7) / 3.5) ** 2));
    const eye = Math.exp(-(((Math.abs(x) - 3.15) / 1.8) ** 2) - (((y - 2.5) / 1.3) ** 2));
    const expressionRisk = Math.max(smile * mouth, jaw * lowerFace, blink * eye);
    return clamp((weight - 0.2) / 0.8, 0, 1) ** 2 * (1 - 0.85 * expressionRisk);
  });
  const depthConfidence = relativeDepthConfidence(analysis)
    * clamp(1 - Math.max(Math.abs(camera.rx), Math.abs(camera.ry)) / 0.9, 0.15, 1);
  // Align the arbitrary detector depth origin with visible, non-nasal points.
  // Do not rescale Z to the template nose: that would restore its bias.
  const references = [33, 133, 263, 362, 50, 101, 280, 330, 10, 152];
  let origin = 0, total = 0;
  for (const id of references) {
    const weight = confidence[id];
    origin += (base[id][2] + analysis.landmarks[id][2] / camera.scale) * weight;
    total += weight;
  }
  if (total < 1e-6) return { version: 1, deltas: base.map(() => [0, 0, 0]), depthConfidence: 0 };
  origin /= total;
  const faceWidth = Math.hypot(...template.positions[263].map((v, axis) => v - template.positions[33][axis]));
  const limits = [faceWidth * 0.18, faceWidth * 0.18, faceWidth * 0.24];
  const targets = base.map((point, id): Point3 => {
    const [x, y, z] = analysis.landmarks[id];
    return [(x - camera.tx) / camera.scale - point[0], (camera.ty - y) / camera.scale - point[1], -z / camera.scale + origin - point[2]];
  });
  const dataWeights = targets.map((delta, id): Point3 => {
    const normal = normals[id];
    const front = clamp(normal[2] / Math.max(1e-6, Math.hypot(...normal)) / 0.5, 0, 1);
    return delta.map((value, axis) => {
      const reliability = confidence[id] * (axis === 2 ? depthConfidence * front * 0.55 : 1);
      return reliability / (1 + (Math.abs(value) / limits[axis]) ** 4);
    }) as Point3;
  });
  let field: Point3[] = Array.from({ length: count }, () => [0, 0, 0]);
  // Fixed iterations keep reconstruction independent of device timing.
  for (let iteration = 0; iteration < 24; iteration++) {
    field = field.map((_, id): Point3 => [0, 1, 2].map((axis) => {
      let mean = 0;
      for (const neighbor of neighbors[id]) mean += field[neighbor][axis];
      mean /= Math.max(1, neighbors[id].size);
      const data = dataWeights[id][axis];
      const smooth = axis === 2 ? 0.6 : 0.4;
      const prior = (axis === 2 ? 0.12 : 0.015) + (1 - confidence[id]) * 0.8;
      return clamp((data * clamp(targets[id][axis], -limits[axis], limits[axis]) + smooth * mean) / (data + smooth + prior), -limits[axis], limits[axis]);
    }) as Point3);
  }
  return { version: 1, deltas: field.map((delta) => unrotate(delta, camera)), depthConfidence };
}
