import * as THREE from 'three';
import { clamp, deformPoint, styledParams } from './shape';
import type { EarTemplate } from './ears';
import { expressionControls, expressionIntensityMultiplier, expressionSet, retargetExpressionDeltas, updateExpressionBounds } from './expressions';
import type { ExpressionRigAsset } from './expression-rig';
import { addOralCavity } from './oral-cavity';
import { lowerLipRim, mouthSurfaceTriangles, upperLipRim } from './mouth';
import { createSkinField, type SkinColorField } from './skin';
import { smoothHeadSurface, smoothHeadSurfaceFields, type HeadSurface } from './subdivision';
import type { HeadMeasurements, HeadPart, HeadResult, HeadTemplate, Point2, Point3, ShapeParams, Style } from './types';

const smoothstep = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const meters = (point: Point3): Point3 => point.map((value) => value * 0.01) as Point3;

/** Fair the sparse crown-to-occiput guide after shape controls are applied.
 * Loop subdivision smooths the surface, but a sharp change between profile
 * rings can still leave a visible ridge along the skull silhouette. */
function fairCranialProfile(profile: number[][]): number[][] {
  const result = profile.map((row) => [...row]);
  for (let pass = 0; pass < 2; pass++) {
    const source = result.map((row) => [...row]);
    for (let index = 2; index <= 8; index++) {
      const strength = index === 2 || index === 8 ? 0.18 : 0.28;
      for (const axis of [0, 1]) {
        const neighborMean = (source[index - 1][axis] + source[index + 1][axis]) * 0.5;
        result[index][axis] = source[index][axis] + (neighborMean - source[index][axis]) * strength;
      }
    }
  }
  return result;
}

/** Fair the coarse nape before subdivision. Constraining the face, crown and
 * neck base removes the long loft crease without projecting a finished mesh
 * onto a different surface or expanding the cap vertices. */
function relaxNapeCage(points: Point3[], triangles: [number, number, number][], canonicalCount: number, baseY: number, scale: number): Point3[] {
  const neighbors = points.map(() => new Set<number>());
  for (const [a, b, c] of triangles) {
    neighbors[a].add(b).add(c); neighbors[b].add(a).add(c); neighbors[c].add(a).add(b);
  }
  const faceCenterZ = points.slice(0, canonicalCount).reduce((sum, point) => sum + point[2], 0) / canonicalCount;
  const weights = points.map((point, index) => {
    if (index < canonicalCount) return 0;
    const vertical = THREE.MathUtils.smootherstep(8 * scale - point[1], 0, 10 * scale)
      * THREE.MathUtils.smootherstep(point[1] - baseY, 0, 5 * scale);
    const posterior = THREE.MathUtils.smootherstep(faceCenterZ - point[2], 1.5 * scale, 8 * scale);
    return vertical * posterior;
  });
  let positions = points;
  for (let iteration = 0; iteration < 16; iteration++) {
    positions = positions.map((point, index): Point3 => {
      if (weights[index] === 0 || neighbors[index].size === 0) return point;
      const mean: Point3 = [0, 0, 0];
      for (const neighbor of neighbors[index]) for (let axis = 0; axis < 3; axis++) mean[axis] += positions[neighbor][axis];
      return point.map((value, axis) => lerp(value, mean[axis] / neighbors[index].size, 0.35 * weights[index])) as Point3;
    });
  }
  return positions;
}

/** Remove the canonical mouth aperture from the neutral head. Move nearby lip
 * rows with the inner rim so subdivision cannot pull a wide slit open again. */
function closeNeutralLips(positions: Point3[]): Point3[] {
  const upper = upperLipRim, lower = lowerLipRim;
  const sections = upper.map((id, index) => {
    const a = positions[id], b = positions[lower[index]];
    return { x: (a[0] + b[0]) * 0.5, y: (a[1] + b[1]) * 0.5, halfGap: Math.max(0, (a[1] - b[1]) * 0.5) };
  });
  return positions.map((point): Point3 => {
    const index = sections.findIndex((section) => section.x >= point[0]);
    if (index <= 0) return point;
    const a = sections[index - 1], b = sections[index];
    const t = clamp((point[0] - a.x) / Math.max(1e-6, b.x - a.x), 0, 1);
    const center = lerp(a.y, b.y, t), halfGap = lerp(a.halfGap, b.halfGap, t);
    const offset = point[1] - center;
    const falloff = Math.exp(-((Math.max(0, Math.abs(offset) - halfGap) / 1.5) ** 2));
    const closure = clamp(offset, -halfGap, halfGap) * falloff;
    return [point[0], point[1] - closure, point[2]];
  });
}

/** Corner-angle weighting avoids letting the largest triangles dominate the
 * shading where the facial mesh joins the differently spaced loft rings. */
function computeSmoothNormals(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position'), index = geometry.getIndex();
  if (!index) throw new Error('Lưới đầu cần chỉ mục để tính pháp tuyến liền mạch.');
  const normals = new Float32Array(position.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), bc = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let offset = 0; offset < index.count; offset += 3) {
    const ia = index.getX(offset), ib = index.getX(offset + 1), ic = index.getX(offset + 2);
    a.fromBufferAttribute(position, ia); b.fromBufferAttribute(position, ib); c.fromBufferAttribute(position, ic);
    ab.subVectors(b, a); ac.subVectors(c, a); bc.subVectors(c, b);
    normal.crossVectors(ab, ac);
    const area = normal.length();
    if (area < 1e-14) continue;
    normal.multiplyScalar(1 / area);
    const angleA = Math.atan2(area, ab.dot(ac));
    const angleB = Math.atan2(area, -ab.dot(bc));
    const angleC = Math.atan2(area, ac.dot(bc));
    const offsetA = ia * 3, offsetB = ib * 3, offsetC = ic * 3;
    normals[offsetA] += normal.x * angleA;
    normals[offsetA + 1] += normal.y * angleA;
    normals[offsetA + 2] += normal.z * angleA;
    normals[offsetB] += normal.x * angleB;
    normals[offsetB + 1] += normal.y * angleB;
    normals[offsetB + 2] += normal.z * angleB;
    normals[offsetC] += normal.x * angleC;
    normals[offsetC + 1] += normal.y * angleC;
    normals[offsetC + 2] += normal.z * angleC;
  }
  for (let vertex = 0; vertex < position.count; vertex++) {
    const offset = vertex * 3;
    const length = Math.hypot(normals[offset], normals[offset + 1], normals[offset + 2]);
    if (length > 0) for (let axis = 0; axis < 3; axis++) normals[offset + axis] /= length;
  }
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
}

/**
 * Build the head from the original 468-point face surface. The skull is a
 * continuous loft from the face boundary over the crown and occiput to the
 * neck base. Separate upper/lower profiles describe the nape and throat;
 * the jaw transitions into the neck instead of closing into a spherical cap.
 */
interface NaturalHead {
  identity: Point3[];
  neutral: Point3[];
  cage: HeadSurface;
}

function measuredContourScale(vertical: number, measurements?: HeadMeasurements): number {
  if (!measurements) return 1;
  const profile = [
    [0, measurements.chinScale],
    [0.08, measurements.lowerJawScale],
    [0.18, measurements.jawScale],
    [0.48, measurements.cheekScale],
    [0.66, 1],
    [0.92, measurements.foreheadScale],
    [1, measurements.foreheadScale],
  ] as const;
  for (let index = 1; index < profile.length; index++) {
    const [end, endScale] = profile[index];
    if (vertical <= end) {
      const [start, startScale] = profile[index - 1];
      return lerp(startScale, endScale, clamp((vertical - start) / (end - start), 0, 1));
    }
  }
  return measurements.foreheadScale;
}

function buildNaturalHead(template: HeadTemplate, params: ShapeParams, measurements?: HeadMeasurements, includeOralCavity = true): NaturalHead {
  const canonicalCount = template.canonicalCount;
  if (
    canonicalCount !== 468 || template.positions.length < canonicalCount ||
    template.uv.length < canonicalCount || template.triangles.length < template.faceTriangleCount ||
    template.boundary.length < 24 || template.faceTriangleCount !== 898
  ) throw new Error('Template mặt canonical không đủ dữ liệu để tự sinh mesh đầu–cổ.');

  const identity = template.positions.slice(0, canonicalCount).map((point) => deformPoint(point, 'face', params));
  const neutral = closeNeutralLips(identity);
  const facePositions = neutral;
  const positions = [...facePositions];
  const parts: HeadPart[] = Array(canonicalCount).fill('face');
  const uv: Point2[] = template.uv.slice(0, canonicalCount).map(([u, v]) => [u, v]);
  const triangles = includeOralCavity
    ? mouthSurfaceTriangles(template.triangles.slice(0, template.faceTriangleCount))
    : template.triangles.slice(0, template.faceTriangleCount);
  const faceTriangleCount = triangles.length;
  const skinFade = Array(canonicalCount).fill(0) as number[];
  const boundary = template.boundary;
  const first = boundary[0], second = boundary[1];
  const faceUsesForward = template.triangles.slice(0, template.faceTriangleCount).some((triangle) =>
    triangle.some((vertex, index) => vertex === first && triangle[(index + 1) % 3] === second),
  );

  const addVertex = (point: Point3, part: HeadPart, tex: Point2, fade: number) => {
    const id = positions.length;
    positions.push(point); parts.push(part); uv.push(tex); skinFade.push(fade);
    return id;
  };
  const connectRings = (aRing: number[], bRing: number[]) => {
    for (let index = 0; index < aRing.length; index++) {
      const next = (index + 1) % aRing.length;
      const a = aRing[index], b = aRing[next], c = bRing[index], d = bRing[next];
      if (faceUsesForward) triangles.push([b, a, c], [b, c, d]);
      else triangles.push([a, b, c], [b, d, c]);
    }
  };

  const boundaryPoints = boundary.map((id) => facePositions[id]);
  const halfWidth = Math.max(...boundaryPoints.map((point) => Math.abs(point[0])));
  const minY = Math.min(...boundaryPoints.map((point) => point[1]));
  const maxY = Math.max(...boundaryPoints.map((point) => point[1]));
  const height = maxY - minY;
  const centerY = (minY + maxY) * 0.5;
  const headScale = halfWidth / 7.743095;
  const foreheadZ = facePositions[10][2], chinZ = facePositions[152][2];

  // Upper midline: forehead -> crown -> occiput -> nape -> neck base.
  // Lower midline: chin -> submental plane -> throat -> neck base.
  // Rows contain upper-y/z, lower-y/z, width relative to the face, and the
  // remaining face-contour detail. Dimensions follow the fitted face once.
  const profileBase = [
    [maxY, foreheadZ, minY, chinZ, 1, 1],
    [maxY + height * 0.11, foreheadZ - 0.95 * headScale, minY - height * 0.015, chinZ - 1.1 * headScale, 1.00, 0.90],
    [maxY + height * 0.19, foreheadZ - 3.65 * headScale, minY - height * 0.025, chinZ - 2.6 * headScale, 0.96, 0.68],
    [maxY + height * 0.22, -4.9 * headScale, minY - height * 0.045, chinZ - 3.7 * headScale, 0.91, 0.42],
    [maxY + height * 0.20, -6.85 * headScale, minY - height * 0.075, chinZ - 4.25 * headScale, 0.88, 0.20],
    [maxY + height * 0.06, -9.7 * headScale, minY - height * 0.10, chinZ - 4.4 * headScale, 0.81, 0.05],
    [maxY - height * 0.20, -10.7 * headScale, minY - height * 0.12, chinZ - 4.4 * headScale, 0.71, 0],
    [maxY - height * 0.50, -9.35 * headScale, minY - height * 0.14, chinZ - 4.3 * headScale, 0.65, 0],
    [maxY - height * 0.80, -7.3 * headScale, minY - height * 0.16, chinZ - 4.25 * headScale, 0.59, 0],
    [minY - height * 0.01, -6.75 * headScale, minY - height * 0.18, chinZ - 4.15 * headScale, 0.58, 0],
    [minY - height * 0.15, -6.85 * headScale, minY - height * 0.23, chinZ - 3.75 * headScale, 0.56, 0],
    [minY - height * 0.28, -7.3 * headScale, minY - height * 0.28, chinZ - 3.4 * headScale, 0.58, 0],
  ];
  const parameter = (key: string) => clamp(params[key] ?? 0, -1, 1);
  // Spread crown-height adjustment from the forehead slope to the apex rather
  // than concentrating it at one high point, which creates a bulbous dome.
  const crownWeights = [0, 0.42, 0.82, 0.95, 0.82, 0.55, 0.25, 0.08, 0, 0, 0, 0];
  const widthWeights = [0, 0.35, 0.7, 1, 1, 0.9, 0.75, 0.45, 0.1, 0, 0, 0];
  const foreheadWidthWeights = [0, 0.2, 0.7, 1, 0.65, 0.3, 0.1, 0, 0, 0, 0, 0];
  const templeWidthWeights = [0, 0.05, 0.35, 0.8, 1, 0.8, 0.45, 0.15, 0, 0, 0, 0];
  const depthWeights = [0, 0.1, 0.35, 0.65, 0.9, 1, 1, 0.75, 0.35, 0.1, 0, 0];
  const neckWeights = [0, 0, 0, 0, 0, 0, 0, 0.1, 0.45, 0.85, 1, 1];
  const neckLengthWeights = [0, 0, 0, 0, 0, 0, 0, 0.05, 0.2, 0.55, 0.85, 1];
  const crownHeight = parameter('craniumHeight'), craniumWidth = parameter('craniumWidth');
  const craniumDepth = parameter('craniumDepth'), neckWidth = parameter('neckWidth'), neckLength = parameter('neckLength');
  const foreheadWidth = parameter('foreheadWidth'), templeWidth = parameter('templeWidth');
  const profile = fairCranialProfile(profileBase.map(([upperY, upperZ, lowerY, lowerZ, widthScale, detail], index) => {
    const neckOffset = height * 0.12 * neckLength * neckLengthWeights[index];
    const skullWidth = 1
      + 0.06 * craniumWidth * widthWeights[index]
      + 0.03 * foreheadWidth * foreheadWidthWeights[index]
      + 0.04 * templeWidth * templeWidthWeights[index];
    return [
      upperY + height * 0.14 * crownHeight * crownWeights[index] - neckOffset,
      upperZ - headScale * 1.8 * craniumDepth * depthWeights[index],
      lowerY - neckOffset,
      lowerZ,
      widthScale * skullWidth * (1 + 0.08 * neckWidth * neckWeights[index]) * (1 - 0.08 * neckWeights[index]),
      detail,
    ];
  }));

  // The same ordered contour becomes an inclined neck opening: forehead
  // vertices reach the nape, chin vertices reach the front of the throat.
  // Residuals preserve the exact facial outline before fading to rounder
  // skull/neck sections, including when the face/jaw sliders change.
  const contour = boundaryPoints.map((source) => {
    const angle = Math.atan2(source[0] / halfWidth, (source[1] - centerY) / (height * 0.5));
    const lateral = Math.sin(angle), vertical = (Math.cos(angle) + 1) * 0.5;
    return {
      lateral, vertical,
      residual: [
        source[0] - halfWidth * lateral,
        source[1] - lerp(minY, maxY, vertical),
        source[2] - lerp(chinZ, foreheadZ, vertical),
      ] as Point3,
    };
  });
  let previousRing = boundary.slice();
  // Subdivide a sparse control cage instead of freezing dozens of narrow
  // interpolated rows: those rows retained folds along the throat and nape.
  for (let row = 1; row < profile.length; row++) {
    const [upperY, upperZ, lowerY, lowerZ, widthScale, detail] = profile[row];
    const width = halfWidth * widthScale;
    const ring = contour.map(({ lateral, vertical, residual }, index) => {
      const measuredScale = measuredContourScale(vertical, measurements);
      const point: Point3 = [
        width * lateral * measuredScale + residual[0] * detail,
        lerp(lowerY, upperY, vertical) + residual[1] * detail,
        lerp(lowerZ, upperZ, vertical) + residual[2] * detail,
      ];
      const part: HeadPart = row === 1 ? 'bridge' : row >= 8 || (vertical < 0.2 && row >= 4) ? 'neck' : 'cranium';
      return addVertex(point, part, [index / boundary.length, 1 - row / (profile.length - 1)], smoothstep(row / 2));
    });
    connectRings(previousRing, ring);
    previousRing = ring;
  }

  // Only the neck base is capped. Head and neck share all transition vertices
  // and normals; there is no hidden neck lid or intersecting skull underside.
  const lastProfile = profile[profile.length - 1];
  const bottomZ = (lastProfile[1] + lastProfile[3]) * 0.5;
  const baseRing = previousRing;
  // Concentric cap rings isolate the high-valence centre from the neck rim;
  // a direct fan made radial dents along the visible bottom edge after Loop.
  for (const radius of [0.65, 0.3]) {
    const ring = baseRing.map((id, index) => addVertex([
      positions[id][0] * radius, lastProfile[0], bottomZ + (positions[id][2] - bottomZ) * radius,
    ], 'neck', [index / boundary.length, 0], 1));
    connectRings(previousRing, ring);
    previousRing = ring;
  }
  const bottomCenter = addVertex([0, lastProfile[0], bottomZ], 'neck', [0.5, 0], 1);
  for (let index = 0; index < previousRing.length; index++) {
    const next = (index + 1) % previousRing.length;
    triangles.push(faceUsesForward
      ? [previousRing[next], previousRing[index], bottomCenter]
      : [previousRing[index], previousRing[next], bottomCenter]);
  }

  const mouthRim = [...upperLipRim, ...lowerLipRim.slice(1, -1).reverse()];
  const cage: HeadSurface = { positions: relaxNapeCage(positions, triangles, canonicalCount, lastProfile[0], headScale), parts, uv, triangles, skinFade, faceTriangleCount, mouthRim };
  return { identity, neutral, cage };
}

function applySkinColors(geometry: THREE.BufferGeometry, skinAt: SkinColorField) {
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  for (let vertex = 0; vertex < positions.count; vertex++) {
    colors.set(skinAt([positions.getX(vertex) * 100, positions.getY(vertex) * 100, positions.getZ(vertex) * 100]), vertex * 3);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

function createPhotoTexture(atlas: Uint8ClampedArray, size: number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  context.putImageData(new ImageData(new Uint8ClampedArray(atlas), size, size), 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function buildExpressionCages(natural: NaturalHead, rig: ExpressionRigAsset, boundary: number[]) {
  const faceDeltas = retargetExpressionDeltas(rig, natural.identity, natural.cage.triangles.slice(0, natural.cage.faceTriangleCount));
  const mouthY = (natural.neutral[13][1] + natural.neutral[14][1]) * 0.5;
  return expressionControls.map(([name]) => {
    const deltaCage = natural.cage.positions.map((): Point3 => [0, 0, 0]);
    for (let id = 0; id < natural.identity.length; id++) {
      deltaCage[id] = faceDeltas[name][id];
    }
    // Continue only the moving lower jaw into the adjacent throat rings.
    // Upper skull vertices retain their identity positions for every pose.
    for (const [row, falloff] of [0.65, 0.3, 0.1].entries()) {
      for (const [index, id] of boundary.entries()) {
        const jaw = THREE.MathUtils.smoothstep(mouthY + 0.5 - natural.neutral[id][1], 0, 2);
        deltaCage[natural.identity.length + row * boundary.length + index] = faceDeltas[name][id].map((value) => value * falloff * jaw) as Point3;
      }
    }
    return deltaCage;
  });
}

function addExpressionTargets(geometry: THREE.BufferGeometry, surface: HeadSurface, deltaSurfaces: Point3[][]) {
  const basePosition = geometry.getAttribute('position'), baseNormal = geometry.getAttribute('normal');
  const positions: THREE.BufferAttribute[] = [], normals: THREE.BufferAttribute[] = [];
  for (const [targetIndex, [name]] of expressionControls.entries()) {
    const deltaSurface = deltaSurfaces[targetIndex];
    const targetPositions = new Float32Array(surface.positions.length * 3);
    for (let id = 0; id < surface.positions.length; id++) {
      const offset = id * 3, point = surface.positions[id], delta = deltaSurface[id];
      targetPositions[offset] = (point[0] + expressionIntensityMultiplier * delta[0]) * 0.01;
      targetPositions[offset + 1] = (point[1] + expressionIntensityMultiplier * delta[1]) * 0.01;
      targetPositions[offset + 2] = (point[2] + expressionIntensityMultiplier * delta[2]) * 0.01;
    }
    const target = new THREE.BufferGeometry();
    target.setAttribute('position', new THREE.BufferAttribute(targetPositions, 3));
    target.setIndex(geometry.getIndex());
    computeSmoothNormals(target);
    const position = target.getAttribute('position'), normal = target.getAttribute('normal');
    const positionDelta = new Float32Array(position.count * 3), normalDelta = new Float32Array(position.count * 3);
    for (let id = 0; id < position.count; id++) {
      const offset = id * 3;
      positionDelta[offset] = (position.getX(id) - basePosition.getX(id)) / expressionIntensityMultiplier;
      positionDelta[offset + 1] = (position.getY(id) - basePosition.getY(id)) / expressionIntensityMultiplier;
      positionDelta[offset + 2] = (position.getZ(id) - basePosition.getZ(id)) / expressionIntensityMultiplier;
      // Bake normals at the actual maximum. Extrapolating 1x normals at a 2x
      // weight can turn the thin lip rims black even when positions are valid.
      normalDelta[offset] = (normal.getX(id) - baseNormal.getX(id)) / expressionIntensityMultiplier;
      normalDelta[offset + 1] = (normal.getY(id) - baseNormal.getY(id)) / expressionIntensityMultiplier;
      normalDelta[offset + 2] = (normal.getZ(id) - baseNormal.getZ(id)) / expressionIntensityMultiplier;
    }
    const positionAttribute = new THREE.Float32BufferAttribute(positionDelta, 3);
    const normalAttribute = new THREE.Float32BufferAttribute(normalDelta, 3);
    positionAttribute.name = normalAttribute.name = name;
    positions.push(positionAttribute); normals.push(normalAttribute);
    target.dispose();
  }
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = positions;
  geometry.morphAttributes.normal = normals;
  updateExpressionBounds(geometry);
}

function addEars(group: THREE.Group, head: THREE.Mesh, source: EarTemplate, params: ShapeParams, material: THREE.Material, halfWidth: number, skinAt: SkinColorField) {
  const headScale = clamp(halfWidth / 9.2, 0.7, 1.1);
  const scale = headScale * (1 + 0.25 * clamp(params.earSize ?? 0, -1, 1));
  const centerY = 0.55 + 0.9 * clamp(params.earHeight ?? 0, -1, 1);
  const depth = -1.25 * headScale;
  const raycaster = new THREE.Raycaster();
  head.updateMatrixWorld(true);
  for (const side of [-1, 1] as const) {
    const sourceYs = Array.from({ length: 10 }, (_, index) => -3.5 + index * 10.5 / 9);
    const sourceZs = Array.from({ length: 10 }, (_, index) => -6.5 + index * 7 / 9);
    const ys = sourceYs.map((y) => centerY + (y - 1.6) * scale);
    const zs = sourceZs.map((z) => z * scale + depth);
    const roots = ys.map((y) => zs.map((z) => {
      raycaster.ray.origin.set(side * (halfWidth + 10) * 0.01, y * 0.01, z * 0.01);
      raycaster.ray.direction.set(-side, 0, 0);
      const hit = raycaster.intersectObject(head, false)[0];
      return { x: hit ? Math.abs(hit.point.x) * 100 : halfWidth, normal: hit?.normal?.clone() ?? new THREE.Vector3(side, 0, 0) };
    }));
    const geometry = new THREE.BufferGeometry();
    const opacity: number[] = [];
    const headNormals: THREE.Vector3[] = [], anatomy: number[] = [];
    let positions = source.positions.map(([x, y, z], id) => {
      const row = clamp(Math.floor((y + 3.5) / 10.5 * 9), 0, 8);
      const column = clamp(Math.floor((z + 6.5) / 7 * 9), 0, 8);
      const ty = (y - sourceYs[row]) / (sourceYs[row + 1] - sourceYs[row]);
      const tz = (z - sourceZs[column]) / (sourceZs[column + 1] - sourceZs[column]);
      let root = lerp(lerp(roots[row][column].x, roots[row][column + 1].x, tz),
        lerp(roots[row + 1][column].x, roots[row + 1][column + 1].x, tz), ty);
      const headNormal = roots[row][column].normal.clone().lerp(roots[row][column + 1].normal, tz)
        .lerp(roots[row + 1][column].normal.clone().lerp(roots[row + 1][column + 1].normal, tz), ty).normalize();
      // Fit the source attachment skin to the head, retaining the pinna's
      // authored folds. Compress only its deepest lateral relief to keep the
      // concha outside this head's different skull shape.
      if (source.rootWeights[id] === 0) {
        raycaster.ray.origin.set(side * (halfWidth + 10) * 0.01, (centerY + (y - 1.6) * scale) * 0.01, (z * scale + depth) * 0.01);
        raycaster.ray.direction.set(-side, 0, 0);
        const hit = raycaster.intersectObject(head, false)[0];
        if (hit) { root = Math.abs(hit.point.x) * 100; if (hit.normal) headNormal.copy(hit.normal); }
      }
      const attachment = source.rootWeights[id]
        * smoothstep((y + 2.6) / 1.1) * smoothstep((6 - y) / 1)
        * smoothstep((z + 5.4) / 1) * smoothstep((0.7 - z) / 1.2);
      const relief = 0.1 + 0.45 * Math.log1p(Math.exp((x - 9) / 0.45));
      const outset = lerp(-0.12, relief, attachment) * scale;
      // Preserve the pinna and the recessed bowl; only fair low-relief skin
      // at the attachment. Its normals meet the sampled skull tangentially.
      const bowl = Math.exp(-(((y - 1.5) / 1.8) ** 4) - (((z + 2.6) / 1.05) ** 4));
      anatomy.push(Math.max(smoothstep((outset / scale - 0.1) / 0.5), bowl));
      headNormals.push(headNormal);
      // Fade attachment skin into the skull to hide the cut patch boundary.
      // Keep the pinna opaque so its overlapping folds still write depth.
      opacity.push(smoothstep((y + 2.3) / 0.6) * smoothstep((5.3 - y) / 0.6)
        * smoothstep((z + 4.7) / 0.6) * smoothstep((-0.2 - z) / 0.6) * source.rootWeights[id]);
      return meters([side * (root + outset), centerY + (y - 1.6) * scale, z * scale + depth]);
    });
    for (let pass = 0; pass < 12; pass++) {
      const previous = positions;
      positions = previous.map((point, id): Point3 => {
        const weight = source.rootWeights[id] === 0 ? 0 : (1 - anatomy[id]) * 0.45;
        const adjacent = source.neighbors[id];
        if (weight < 1e-5 || !adjacent.length) return point;
        const mean: Point3 = [0, 0, 0];
        for (const neighbor of adjacent) for (let axis = 0; axis < 3; axis++) mean[axis] += previous[neighbor][axis] / adjacent.length;
        return point.map((value, axis) => lerp(value, mean[axis], weight)) as Point3;
      });
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.flat(), 3));
    const opaque: number[] = [], blended: number[] = [];
    for (const [a, b, c] of source.triangles) {
      const indices = side < 0 ? [a, c, b] : [a, b, c];
      (Math.min(opacity[a], opacity[b], opacity[c]) > 0.999 ? opaque : blended).push(...indices);
    }
    geometry.setIndex([...opaque, ...blended]);
    geometry.addGroup(0, opaque.length, 0);
    geometry.addGroup(opaque.length, blended.length, 1);
    computeSmoothNormals(geometry);
    const normals = geometry.getAttribute('normal'), normal = new THREE.Vector3();
    for (let id = 0; id < normals.count; id++) {
      normal.fromBufferAttribute(normals, id).lerp(headNormals[id], 1 - anatomy[id]).normalize();
      normals.setXYZ(id, normal.x, normal.y, normal.z);
    }
    applySkinColors(geometry, skinAt);
    const color = geometry.getAttribute('color');
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(opacity.flatMap((alpha, id) => [color.getX(id), color.getY(id), color.getZ(id), alpha]), 4));
    const attachmentMaterial = material.clone();
    attachmentMaterial.transparent = true; attachmentMaterial.depthWrite = false;
    const ear = new THREE.Mesh(geometry, [material, attachmentMaterial]);
    ear.name = side < 0 ? 'leftEar' : 'rightEar';
    ear.userData.source = 'FaceVerse v4 neutral mean ear, local evaluation asset';
    group.add(ear);
  }
}

export interface HeadBuildOptions {
  includeExpressions?: boolean;
  includeEars?: boolean;
  includeOralCavity?: boolean;
}

export function createHead(template: HeadTemplate, ears?: EarTemplate, rig?: ExpressionRigAsset, result?: HeadResult, params: ShapeParams = {}, style: Style = 'natural', strength = 0.5, flat = false, options: HeadBuildOptions = {}) {
  const group = new THREE.Group();
  group.name = 'headAsset';
  const effective = styledParams(params, style, strength);
  const includeExpressions = options.includeExpressions ?? Boolean(rig);
  const includeEars = options.includeEars ?? Boolean(ears);
  const includeOralCavity = options.includeOralCavity ?? Boolean(rig);
  const natural = buildNaturalHead(template, effective, result?.fit.measurements, includeOralCavity);
  let generated: HeadSurface;
  let deltaSurfaces: Point3[][] = [];
  if (includeExpressions && rig) {
    // Geometry and all six morph fields share one subdivision pass/topology.
    const subdivided = smoothHeadSurfaceFields(natural.cage, buildExpressionCages(natural, rig, template.boundary));
    generated = subdivided.surface;
    deltaSurfaces = subdivided.fields;
  } else {
    generated = smoothHeadSurface(natural.cage);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(generated.positions.flatMap(meters), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(generated.uv.flat(), 2));

  const skin: [number, number, number] = result?.skinColor ?? [197, 159, 137];
  // The generated cranium, nape, neck and ears share one diffuse skin tone.
  // Face-region samples remain useful for painting the photo atlas, but using
  // them here copied local photo highlights/shadows onto otherwise unseen skin.
  const skinAt = createSkinField(skin, [], effective);
  applySkinColors(geometry, skinAt);
  geometry.setIndex(generated.triangles.flat());
  geometry.addGroup(0, generated.faceTriangleCount * 3, 0);
  geometry.addGroup(generated.faceTriangleCount * 3, (generated.triangles.length - generated.faceTriangleCount) * 3, 1);
  computeSmoothNormals(geometry);
  if (includeExpressions && rig) addExpressionTargets(geometry, generated, deltaSurfaces);

  let texture: THREE.CanvasTexture | undefined;
  if (result?.atlas && !flat) texture = createPhotoTexture(result.atlas, result.atlasSize);
  const roughness = style === 'cartoon' ? 0.94 : 0.82;
  const faceMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: flat || !texture, map: flat ? null : texture ?? null, roughness, metalness: 0, side: THREE.DoubleSide });
  if (result?.atlas) faceMaterial.userData.photoAtlas = { pixels: result.atlas, size: result.atlasSize };
  if (texture) faceMaterial.userData.photoTexture = texture;
  const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, [faceMaterial, skinMaterial]);
  mesh.name = 'proceduralHeadAndNeck';
  group.add(mesh);

  const halfWidth = Math.max(...template.boundary.map((id) => Math.abs(generated.positions[id][0])));
  if (includeEars && ears) {
    // Ear fitting only needs the control cage. Raycasting against the refined
    // render mesh multiplies triangle tests by the Loop subdivision factor.
    const fitGeometry = new THREE.BufferGeometry();
    fitGeometry.setAttribute('position', new THREE.Float32BufferAttribute(natural.cage.positions.flatMap(meters), 3));
    fitGeometry.setIndex(natural.cage.triangles.flat());
    fitGeometry.computeVertexNormals();
    const fitMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const fitSurface = new THREE.Mesh(fitGeometry, fitMaterial);
    fitSurface.updateMatrixWorld(true);
    addEars(group, fitSurface, ears, effective, skinMaterial, halfWidth, skinAt);
    fitGeometry.dispose(); fitMaterial.dispose();
  }
  if (includeOralCavity && rig) addOralCavity(group, geometry, rig, generated.mouthRim!, natural.identity);
  group.userData = { generator: 'portrait-head-lab-procedural', schemaVersion: 1, expressionSet: includeExpressions && rig ? expressionSet : undefined, units: 'metres', forward: '+Z', up: '+Y', style, shapeParams: { ...effective }, headMeasurements: result?.fit.measurements, rigged: false };
  return group;
}

export function updateFlatAppearance(object: THREE.Object3D | undefined, flat: boolean) {
  object?.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || child.name !== 'proceduralHeadAndNeck') return;
    const material = (Array.isArray(child.material) ? child.material[0] : child.material) as THREE.MeshStandardMaterial;
    let texture = material.userData.photoTexture as THREE.Texture | undefined;
    const atlas = material.userData.photoAtlas as { pixels: Uint8ClampedArray; size: number } | undefined;
    if (!flat && !texture && atlas) {
      texture = createPhotoTexture(atlas.pixels, atlas.size);
      if (texture) material.userData.photoTexture = texture;
    }
    material.map = flat ? null : texture ?? null;
    material.vertexColors = flat || !texture;
    material.needsUpdate = true;
  });
}

export function disposeObject(object: THREE.Object3D) {
  const textures = new Set<THREE.Texture>(), geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    geometries.add(child.geometry);
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      materials.add(material);
      const mapped = material as THREE.MeshStandardMaterial;
      if (mapped.map) textures.add(mapped.map);
      const photoTexture = material.userData.photoTexture;
      if (photoTexture instanceof THREE.Texture) textures.add(photoTexture);
    }
  });
  textures.forEach((texture) => texture.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
