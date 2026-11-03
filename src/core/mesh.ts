import * as THREE from 'three';
import { clamp, rotate, styledParams } from './shape.js';
import { faceDetailWeights, facePositions } from './identity.js';
import type { EarTemplate } from './ears.js';
import { expressionControls, expressionIntensityMultiplier, expressionSet, retargetExpressionDeltas, updateExpressionBounds } from './expressions.js';
import type { ExpressionRigAsset } from './expression-rig.js';
import { addOralCavity } from './oral-cavity.js';
import { lowerLipRim, mouthSurfaceTriangles, upperLipRim } from './mouth.js';
import { createSkinField, linearToSrgb, srgbToLinear, type SkinColorField } from './skin.js';
import { smoothHeadSurface, smoothHeadSurfaceFields, type HeadSurface } from './subdivision.js';
import { createSideSurfaceSampler } from './side-surface.js';
import { jawTransition } from './jaw.js';
import type { FaceIdentity, HeadMeasurements, HeadPart, HeadResult, HeadTemplate, Point2, Point3, ShapeParams, Style } from './types.js';

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
    // Fair the throat-facing profile too. Previously only the back-of-skull
    // coordinates were relaxed, leaving the front neck to pinch between rings.
    for (let index = 1; index <= 10; index++) {
      const strength = index <= 3 ? 0.12 : index === 10 ? 0.18 : 0.28;
      for (const axis of [2, 3]) {
        const neighborMean = (source[index - 1][axis] + source[index + 1][axis]) * 0.5;
        result[index][axis] = source[index][axis] + (neighborMean - source[index][axis]) * strength;
      }
    }
  }
  return result;
}

/** Fair the coarse nape before subdivision. Paired smoothing steps retain
 * the occipital volume instead of pulling the rear silhouette into a line.
 * The face, crown and neck base remain constrained. */
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
  for (let cycle = 0; cycle < 6; cycle++) for (const factor of [0.35, -0.36]) {
    positions = positions.map((point, index): Point3 => {
      if (weights[index] === 0 || neighbors[index].size === 0) return point;
      const mean: Point3 = [0, 0, 0];
      for (const neighbor of neighbors[index]) for (let axis = 0; axis < 3; axis++) mean[axis] += positions[neighbor][axis];
      return point.map((value, axis) => lerp(value, mean[axis] / neighbors[index].size, factor * weights[index])) as Point3;
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
export function computeSmoothNormals(geometry: THREE.BufferGeometry) {
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

function buildNaturalHead(template: HeadTemplate, params: ShapeParams, measurements?: HeadMeasurements, includeOralCavity = true, openNeck = false, correction?: FaceIdentity): NaturalHead {
  const canonicalCount = template.canonicalCount;
  if (
    canonicalCount !== 468 || template.positions.length < canonicalCount ||
    template.uv.length < canonicalCount || template.triangles.length < template.faceTriangleCount ||
    template.boundary.length < 24 || template.faceTriangleCount !== 898
  ) throw new Error('Template mặt canonical không đủ dữ liệu để tự sinh mesh đầu–cổ.');

  const identity = facePositions(template, params, correction);
  const neutral = closeNeutralLips(identity);
  const positions = [...neutral];
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

  const boundaryPoints = boundary.map((id) => neutral[id]);
  const halfWidth = Math.max(...boundaryPoints.map((point) => Math.abs(point[0])));
  const minY = Math.min(...boundaryPoints.map((point) => point[1]));
  const maxY = Math.max(...boundaryPoints.map((point) => point[1]));
  const height = maxY - minY;
  const centerY = (minY + maxY) * 0.5;
  const headScale = halfWidth / 7.743095;
  const foreheadZ = neutral[10][2], chinZ = neutral[152][2];

  // Upper midline: forehead -> crown -> occiput -> nape -> neck base.
  // Lower midline: chin -> submental plane -> throat -> neck base.
  // Rows contain upper-y/z, lower-y/z, width relative to the face, and the
  // remaining face-contour detail. Dimensions follow the fitted face once.
  const profileBase = [
    [maxY, foreheadZ, minY, chinZ, 1, 1],
    [maxY + height * 0.11, foreheadZ - 0.95 * headScale, minY - height * 0.002, chinZ - 0.65 * headScale, 1.00, 0.90],
    [maxY + height * 0.19, foreheadZ - 3.65 * headScale, minY + height * 0.02, chinZ - 1.35 * headScale, 0.96, 0.68],
    [maxY + height * 0.22, -4.9 * headScale, minY + height * 0.045, chinZ - 2.25 * headScale, 0.91, 0.42],
    [maxY + height * 0.20, -6.85 * headScale, minY + height * 0.05, chinZ - 3.1 * headScale, 0.88, 0.20],
    [maxY + height * 0.08, -10.3 * headScale, minY + height * 0.025, chinZ - 3.7 * headScale, 0.81, 0.05],
    [maxY - height * 0.18, -11.5 * headScale, minY - height * 0.025, chinZ - 4.0 * headScale, 0.71, 0],
    [maxY - height * 0.47, -10.1 * headScale, minY - height * 0.08, chinZ - 4.15 * headScale, 0.65, 0],
    [maxY - height * 0.75, -7.65 * headScale, minY - height * 0.15, chinZ - 4.05 * headScale, 0.61, 0],
    [minY - height * 0.02, -6.75 * headScale, minY - height * 0.21, chinZ - 3.85 * headScale, 0.60, 0],
    [minY - height * 0.15, -6.85 * headScale, minY - height * 0.26, chinZ - 3.5 * headScale, 0.59, 0],
    [minY - height * 0.30, -7.3 * headScale, minY - height * 0.30, chinZ - 3.2 * headScale, 0.60, 0],
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
  const jaw = jawTransition(template, neutral);
  // Subdivide a sparse control cage instead of freezing dozens of narrow
  // interpolated rows: those rows retained folds along the throat and nape.
  for (let row = 1; row < profile.length; row++) {
    const [upperY, upperZ, lowerY, lowerZ, widthScale, detail] = profile[row];
    const width = halfWidth * widthScale;
    const ring = contour.map(({ lateral, vertical, residual }, index) => {
      const measuredScale = measuredContourScale(vertical, measurements);
      // The crown rises behind the forehead, but the lower jaw must not
      // follow that upward path. Carry its own edge down/in toward the neck;
      // otherwise the first loft rows fold back into a second jaw outline.
      const jawWeight = 1 - smoothstep((vertical - 0.08) / 0.48);
      const jawY = lowerY + (boundaryPoints[index][1] - minY) * detail;
      const point: Point3 = [
        width * lateral * measuredScale + residual[0] * detail,
        lerp(lerp(lowerY, upperY, vertical) + residual[1] * detail, jawY, jawWeight),
        lerp(lowerZ, upperZ, vertical) + residual[2] * detail,
      ];
      const part: HeadPart = row === 1 ? 'bridge' : row >= 8 || (vertical < 0.2 && row >= 4) ? 'neck' : 'cranium';
      return addVertex(point, part, row === 1 ? jaw.outerUv[index] : [index / boundary.length, 1 - row / (profile.length - 1)], smoothstep(row / 2));
    });
    connectRings(previousRing, ring);
    previousRing = ring;
  }

  // Only the neck base is capped. Head and neck share all transition vertices
  // and normals; there is no hidden neck lid or intersecting skull underside.
  const lastProfile = profile[profile.length - 1];
  const bottomZ = (lastProfile[1] + lastProfile[3]) * 0.5;
  const baseRing = previousRing;
  if (!openNeck) {
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
  }

  const mouthRim = [...upperLipRim, ...lowerLipRim.slice(1, -1).reverse()];
  const detailWeights = correction ? [
    ...faceDetailWeights(template),
    ...positions.slice(canonicalCount).map(() => 0),
  ] : undefined;
  const cage: HeadSurface = { positions: relaxNapeCage(positions, triangles, canonicalCount, lastProfile[0], headScale), parts, uv, triangles, skinFade, detailWeights, faceTriangleCount, mouthRim, neckRim: openNeck ? baseRing : undefined };
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

function createSkinProjectionTexture(colors: Float32Array, size: number) {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = linearToSrgb(colors[offset]);
    pixels[offset + 1] = linearToSrgb(colors[offset + 1]);
    pixels[offset + 2] = linearToSrgb(colors[offset + 2]);
    pixels[offset + 3] = 255;
  }
  return createPhotoTexture(pixels, size);
}

function sampleLinearTexture(pixels: ArrayLike<number>, size: number, uv: Point2, isSrgb: boolean): Point3 {
  const x = clamp(uv[0] * size - 0.5, 0, size - 1);
  const y = clamp((1 - uv[1]) * size - 0.5, 0, size - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(size - 1, x0 + 1), y1 = Math.min(size - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  return [0, 1, 2].map((channel) => {
    const at = (px: number, py: number) => {
      const value = pixels[(py * size + px) * 4 + channel];
      return isSrgb ? srgbToLinear(value) : value;
    };
    return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy)
      + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
  }) as Point3;
}

/** Match the face edge to the generated skin with a smooth colour gain.
 * Multiplication preserves local texture contrast; the input atlas stays
 * unchanged so rebuilding geometry cannot accumulate colour corrections. */
function stitchScalpBoundary(
  skinMap: Float32Array,
  skinSize: number,
  faceAtlas: Uint8ClampedArray,
  faceSize: number,
  skinUvs: Float32Array,
  faceUvs: Point2[],
  boundary: number[],
  positions: Point3[],
  minimumY: number,
) {
  const stitched = faceAtlas.slice();
  if (boundary.length < 2) return stitched;
  // Only the broad colour correction uses a smaller grid. Source detail is
  // sampled and retained at the original atlas resolution.
  const correctionSize = Math.min(faceSize, 256);
  const faceBestWeight = new Float32Array(correctionSize * correctionSize);
  const correction = new Float32Array(correctionSize * correctionSize * 4);
  const faceBoundarySamples: { u: number; v: number; faceU: number; faceV: number }[] = [];
  const minFaceV = 0.12;

  const paint = (u: number, v: number, faceU: number, faceV: number) => {
    if (faceU < 0 || faceU > 1 || faceV < 0 || faceV > 1) return;
    if (v >= minFaceV) faceBoundarySamples.push({ u, v, faceU, faceV });
  };

  for (let index = 0; index < boundary.length; index++) {
    const a = boundary[index];
    const b = boundary[(index + 1) % boundary.length];
    // Never recolour the beard/jaw edge to match forehead skin. The narrow
    // jaw atlas apron carries the edge outward instead.
    if (Math.min(positions[a][1], positions[b][1]) < minimumY) continue;
    let u0 = skinUvs[a * 2], u1 = skinUvs[b * 2];
    const v0 = skinUvs[a * 2 + 1], v1 = skinUvs[b * 2 + 1];
    if (u1 - u0 > 0.5) u1 -= 1;
    else if (u1 - u0 < -0.5) u1 += 1;
    const faceA = faceUvs[a], faceB = faceUvs[b];
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(u1 - u0) * skinSize, Math.abs(v1 - v0) * skinSize)));
    for (let step = 0; step < steps; step++) {
      const t = step / steps;
      paint(
        ((u0 + (u1 - u0) * t) % 1 + 1) % 1,
        v0 + (v1 - v0) * t,
        faceA[0] + (faceB[0] - faceA[0]) * t,
        faceA[1] + (faceB[1] - faceA[1]) * t,
      );
    }
  }

  // Average neighbouring log gains instead of switching to a single winning
  // boundary sample. This keeps the correction smooth along the seam too.
  for (const sample of faceBoundarySamples) {
    const color = sampleLinearTexture(skinMap, skinSize, [sample.u, sample.v], false);
    const faceColor = sampleLinearTexture(faceAtlas, faceSize, [sample.faceU, sample.faceV], true);
    const logGain = color.map((value, channel) => Math.log(clamp(value / Math.max(faceColor[channel], 1e-5), 0.5, 2)));
    // Equivalent to 72–120 pixels on a 1024 atlas, at every atlas resolution.
    const faceRadius = (sample.v > 0.76 ? 120 : sample.v > 0.46 ? 100 : 72) * correctionSize / 1024;
    const radius = Math.ceil(faceRadius);
    const centerX = sample.faceU * correctionSize - 0.5;
    const centerY = (1 - sample.faceV) * correctionSize - 0.5;
    const baseX = Math.round(centerX), baseY = Math.round(centerY);
    for (let dy = -radius; dy <= radius; dy++) {
      const y = baseY + dy;
      if (y < 0 || y >= correctionSize) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const distance = Math.hypot(baseX + dx - centerX, y - centerY);
        if (distance >= faceRadius) continue;
        const t = clamp(1 - distance / faceRadius, 0, 1);
        const weight = t * t * (3 - 2 * t);
        const x = baseX + dx;
        if (x < 0 || x >= correctionSize) continue;
        const index = y * correctionSize + x;
        faceBestWeight[index] = Math.max(faceBestWeight[index], weight);
        for (let channel = 0; channel < 3; channel++) correction[index * 4 + channel] += logGain[channel] * weight;
        correction[index * 4 + 3] += weight;
      }
    }
  }
  for (let index = 0; index < faceBestWeight.length; index++) {
    const offset = index * 4;
    const totalWeight = correction[offset + 3];
    if (totalWeight <= 0) continue;
    for (let channel = 0; channel < 3; channel++) correction[offset + channel] *= faceBestWeight[index] / totalWeight;
  }
  for (let y = 0; y < faceSize; y++) for (let x = 0; x < faceSize; x++) {
    const gain = sampleLinearTexture(correction, correctionSize, [(x + 0.5) / faceSize, 1 - (y + 0.5) / faceSize], false);
    if (gain.every((value) => value === 0)) continue;
    const offset = (y * faceSize + x) * 4;
    for (let channel = 0; channel < 3; channel++) {
      const original = srgbToLinear(faceAtlas[offset + channel]);
      stitched[offset + channel] = linearToSrgb(original * Math.exp(gain[channel]));
    }
  }
  return stitched;
}

/** Recover the actual outer loop after subdivision. The original template
 * boundary omits the edge vertices inserted by Loop subdivision, which leaves
 * the skin-map correction misaligned with the rendered forehead seam. */
function faceBoundaryLoop(triangles: [number, number, number][], startHint: number) {
  const edges = new Map<string, { a: number; b: number; count: number }>();
  for (const triangle of triangles) {
    for (const [a, b] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const edge = edges.get(key);
      if (edge) edge.count++;
      else edges.set(key, { a, b, count: 1 });
    }
  }
  const adjacent = new Map<number, number[]>();
  for (const { a, b, count } of edges.values()) {
    if (count !== 1) continue;
    adjacent.set(a, [...(adjacent.get(a) ?? []), b]);
    adjacent.set(b, [...(adjacent.get(b) ?? []), a]);
  }
  const firstNeighbors = adjacent.get(startHint);
  if (!firstNeighbors?.length) return [];
  const loop = [startHint];
  let previous = startHint, current = firstNeighbors[0];
  while (current !== startHint && loop.length <= adjacent.size) {
    loop.push(current);
    const neighbors = adjacent.get(current) ?? [];
    const next = neighbors.find((id) => id !== previous);
    if (next === undefined) return [];
    previous = current;
    current = next;
  }
  return current === startHint ? loop : [];
}

/** Duplicate triangles that cross the cylindrical UV seam and unwrap their U
 * coordinates. Shared vertices cannot carry both sides of a texture seam. */
function createUnwrappedSkinGeometry(source: THREE.BufferGeometry, indices: number[], uvs: Float32Array) {
  const position = source.getAttribute('position') as THREE.BufferAttribute;
  const normal = source.getAttribute('normal') as THREE.BufferAttribute;
  const color = source.getAttribute('color') as THREE.BufferAttribute;
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], outputUvs: number[] = [];
  const sourceVertex = source.getAttribute('_portraitVertex');
  const sourceVertices: number[] = [];
  const morphs = (Object.entries(source.morphAttributes) as [keyof typeof source.morphAttributes, THREE.BufferAttribute[]][]).map(([name, attributes]) => ({
    name,
    attributes,
    values: attributes.map(() => [] as number[]),
  }));
  const append = (attribute: THREE.BufferAttribute, id: number, target: number[]) => {
    const offset = id * attribute.itemSize;
    for (let channel = 0; channel < attribute.itemSize; channel++) target.push(attribute.array[offset + channel] as number);
  };

  for (let offset = 0; offset < indices.length; offset += 3) {
    const triangle = indices.slice(offset, offset + 3);
    const triangleU = triangle.map((id) => uvs[id * 2]);
    if (Math.max(...triangleU) - Math.min(...triangleU) > 0.5) {
      for (let corner = 0; corner < triangleU.length; corner++) if (triangleU[corner] < 0.5) triangleU[corner] += 1;
    }
    for (let corner = 0; corner < 3; corner++) {
      const id = triangle[corner];
      append(position, id, positions);
      append(normal, id, normals);
      append(color, id, colors);
      outputUvs.push(triangleU[corner], uvs[id * 2 + 1]);
      if (sourceVertex) sourceVertices.push(sourceVertex.getX(id));
      for (const morph of morphs) for (let morphIndex = 0; morphIndex < morph.attributes.length; morphIndex++) {
        append(morph.attributes[morphIndex], id, morph.values[morphIndex]);
      }
    }
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(outputUvs, 2));
  if (sourceVertex) result.setAttribute('_portraitVertex', new THREE.Uint32BufferAttribute(sourceVertices, 1));
  for (const morph of morphs) {
    result.morphAttributes[morph.name] = morph.values.map((values, index) => {
      const attribute = new THREE.Float32BufferAttribute(values, morph.attributes[index].itemSize);
      attribute.name = morph.attributes[index].name;
      return attribute;
    });
  }
  result.morphTargetsRelative = source.morphTargetsRelative;
  result.boundingBox = source.boundingBox?.clone() ?? null;
  result.boundingSphere = source.boundingSphere?.clone() ?? null;
  if (!result.boundingBox) result.computeBoundingBox();
  if (!result.boundingSphere) result.computeBoundingSphere();
  return result;
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

function addEars(group: THREE.Group, surface: HeadSurface, headNormals: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, source: EarTemplate, params: ShapeParams, material: THREE.Material, halfWidth: number, skinAt: SkinColorField, measurements?: HeadMeasurements) {
  const headScale = clamp(halfWidth / 9.2, 0.7, 1.1);
  const size = 1 + 0.25 * clamp(params.earSize ?? 0, -1, 1);
  const faceHeight = surface.positions[10][1] - surface.positions[152][1];
  const faceWidth = surface.positions[454][0] - surface.positions[234][0];
  const sampleHead = createSideSurfaceSampler(surface, headNormals);
  const pinna = source.pinnaWeights ?? source.rootWeights;
  const collarDistance = source.positions.map(() => Infinity), queue: number[] = [];
  pinna.forEach((weight, id) => { if (weight > 0.8) { collarDistance[id] = 0; queue.push(id); } });
  for (let next = 0; next < queue.length; next++) {
    const id = queue[next];
    for (const neighbor of source.neighbors[id]) if (collarDistance[neighbor] > collarDistance[id] + 1) {
      collarDistance[neighbor] = collarDistance[id] + 1; queue.push(neighbor);
    }
  }
  for (const side of [-1, 1] as const) {
    const observed = measurements?.ears?.[side < 0 ? 'left' : 'right'];
    const confidence = clamp(observed?.confidence ?? 0, 0, 0.8);
    const brow = surface.positions[side < 0 ? 70 : 300], cheek = surface.positions[side < 0 ? 234 : 454];
    const priorCenter = (brow[1] + surface.positions[2][1]) * 0.5;
    const centerY = lerp(priorCenter, observed ? surface.positions[10][1] - observed.centerFromForehead * faceHeight : priorCenter, confidence)
      + 0.9 * clamp(params.earHeight ?? 0, -1, 1);
    // Source pinna spans about 6.27 cm vertically. The visible silhouette is
    // a partial observation, so blend it with the head-scaled prior per side.
    const scale = lerp(headScale, observed ? clamp(observed.heightToFace * faceHeight / 6.27, headScale * 0.65, headScale * 1.3) : headScale, confidence) * size;
    const centerZ = cheek[2] - 1.2 * headScale;
    const anchor = sampleHead(side, centerY, centerZ);
    if (!anchor) continue;
    const roots = source.positions.map(([, y, z]) => {
      const targetY = centerY + (y - 1.6) * scale, targetZ = centerZ + (z + 2.6) * scale;
      // Extreme manual edits may move the skin patch beyond the skull. Bring
      // it back toward its valid anchor; never invent a floating width fallback.
      for (let fraction = 1; fraction > 0.1; fraction *= 0.8) {
        const hit = sampleHead(side, lerp(centerY, targetY, fraction), lerp(centerZ, targetZ, fraction));
        if (hit) return hit;
      }
      return anchor;
    });
    // Fit one affine pinna, not thousands of independent skull offsets. The
    // latter sheared the concha/helix and made corrugations along the tragus.
    // Move the whole pinna just far enough out to clear the actual skull;
    // only the attachment skin is allowed to deform to the head.
    const placement = (lateral: number) => {
      let origin = -Infinity;
      source.positions.forEach(([x], id) => {
        if (pinna[id] > 0.8) origin = Math.max(origin, Math.abs(roots[id].point[0]) - (x - 8.1) * lateral + 0.10 * headScale);
      });
      if (!Number.isFinite(origin)) origin = Math.abs(anchor.point[0]);
      let outside = 0;
      source.positions.forEach(([x], id) => {
        if (pinna[id] > 0.95) outside = Math.max(outside, origin + (x - 8.1) * lateral);
      });
      return { origin, outside };
    };
    let lateralScale = scale * 0.65;
    if (observed) {
      // Match how far skin protrudes beyond this side's face contour, rather
      // than treating every person as the same prominent neutral ear.
      const edgeX = Math.abs(cheek[0]);
      const desiredX = edgeX + observed.outsetToFace * faceWidth;
      let low = scale * 0.2, high = scale;
      for (let pass = 0; pass < 12; pass++) {
        const middle = (low + high) * 0.5;
        if (placement(middle).outside > desiredX) high = middle;
        else low = middle;
      }
      lateralScale = lerp(lateralScale, (low + high) * 0.5, confidence);
    }
    lateralScale *= 1 + 0.5 * clamp(params.earOutset ?? 0, -1, 1);
    const { origin } = placement(lateralScale);
    const inset = 0.08 * headScale;
    const native = source.positions.map(([x, y, z]): Point3 => [side * (origin + (x - 8.1) * lateralScale), centerY + (y - 1.6) * scale, centerZ + (z + 2.6) * scale]);
    const collarWidth = 10;
    const fixedSkin = source.rootWeights.map((weight, id) => weight < 0.05 || collarDistance[id] >= collarWidth);
    const seated = roots.map(({ point }): Point3 => [point[0] - side * inset, point[1], point[2]]);
    const collarBlend = collarDistance.map((distance) => 1 - THREE.MathUtils.smootherstep(distance, 0, collarWidth));
    let relief = new Float64Array(native.length * 3);
    native.forEach((point, id) => {
      if (pinna[id] <= 0.8) return;
      for (let axis = 0; axis < 3; axis++) relief[id * 3 + axis] = point[axis] - seated[id][axis];
    });
    let nextRelief = relief.slice();
    // Rebuild the collar from the head surface and a harmonic relief field.
    // Diffusing displacement over the original patch retained its skin folds
    // as lumps. Only the authored cartilage supplies relief here; the outer
    // collar fades tangentially below the head, hiding its cut boundary.
    for (let pass = 0; pass < 160; pass++) {
      for (let id = 0; id < native.length; id++) {
        if (fixedSkin[id] || pinna[id] > 0.8) continue;
        const adjacent = source.neighbors[id];
        if (!adjacent.length) continue;
        for (let axis = 0; axis < 3; axis++) {
          let mean = 0;
          for (const neighbor of adjacent) mean += relief[neighbor * 3 + axis] / adjacent.length;
          nextRelief[id * 3 + axis] = mean;
        }
      }
      [relief, nextRelief] = [nextRelief, relief];
    }
    const positions = seated.map((point, id) => {
      // Keep the affine pinna intact. Placement already clears the head;
      // per-vertex collision pushes after smoothing reintroduced ridges.
      if (pinna[id] > 0.8) return meters(native[id]);
      return meters(point.map((value, axis) => value + relief[id * 3 + axis] * collarBlend[id]) as Point3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.flat(), 3));
    geometry.setIndex(source.triangles.flatMap(([a, b, c]) => side < 0 ? [a, c, b] : [a, b, c]));
    computeSmoothNormals(geometry);
    const normals = geometry.getAttribute('normal'), normal = new THREE.Vector3();
    for (let id = 0; id < normals.count; id++) {
      const skinWeight = fixedSkin[id] ? 1 : 1 - collarBlend[id];
      normal.fromBufferAttribute(normals, id).lerp(new THREE.Vector3(...roots[id].normal), skinWeight).normalize();
      normals.setXYZ(id, normal.x, normal.y, normal.z);
    }
    applySkinColors(geometry, skinAt);
    const ear = new THREE.Mesh(geometry, material);
    ear.name = side < 0 ? 'leftEar' : 'rightEar';
    ear.userData.source = 'FaceVerse v4 neutral mean ear, local evaluation asset';
    group.add(ear);
  }
}

export interface HeadBuildOptions {
  /** Keep the generated neck open for the mobile body adapter. */
  openNeck?: boolean;
  onNeutralSurface?: (geometry: THREE.BufferGeometry, surface: HeadSurface) => void;
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
  const natural = buildNaturalHead(template, effective, result?.fit.measurements, includeOralCavity, options.openNeck, result?.fit.identity);
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
  // Vertex colours are the fallback for flat mode or missing texture. The
  // forehead-derived maps cover the scalp, rear skull and nape without wrapping
  // recognizable facial features around the head.
  const skinAt = createSkinField(skin, result?.skinSamples ?? [], effective);
  applySkinColors(geometry, skinAt);
  geometry.setIndex(generated.triangles.flat());
  geometry.addGroup(0, generated.faceTriangleCount * 3, 0);
  geometry.addGroup(generated.faceTriangleCount * 3, (generated.triangles.length - generated.faceTriangleCount) * 3, 1);
  computeSmoothNormals(geometry);
  if (includeExpressions && rig) addExpressionTargets(geometry, generated, deltaSurfaces);
  if (options.onNeutralSurface) {
    geometry.setAttribute('_portraitVertex', new THREE.Uint32BufferAttribute(Array.from({ length: generated.positions.length }, (_, id) => id), 1));
    options.onNeutralSurface(geometry, generated);
  }

  let minY = Infinity, maxY = -Infinity;
  for (const point of generated.positions) {
    minY = Math.min(minY, point[1]);
    maxY = Math.max(maxY, point[1]);
  }
  const rearUvs = new Float32Array(generated.positions.length * 2);
  generated.positions.forEach((point, id) => {
    // One cylindrical map follows the head surface from forehead to nape.
    // Its seam sits at the back of the skull, away from the face and throat.
    const angle = Math.atan2(point[0], point[2]);
    rearUvs[id * 2] = (angle / (Math.PI * 2) + 1.5) % 1;
    rearUvs[id * 2 + 1] = clamp((point[1] - minY) / Math.max(1e-6, maxY - minY), 0, 1);
  });

  const faceBoundary = faceBoundaryLoop(generated.triangles.slice(0, generated.faceTriangleCount), template.boundary[0]);
  const faceAtlas = result?.rearSkinMap && result.atlas
    ? stitchScalpBoundary(result.rearSkinMap, result.rearSkinMapSize, result.atlas, result.atlasSize,
      rearUvs, generated.uv, faceBoundary.length ? faceBoundary : template.boundary, generated.positions, generated.positions[2][1])
    : result?.atlas;
  let texture: THREE.CanvasTexture | undefined;
  if (result && faceAtlas && !flat) texture = createPhotoTexture(faceAtlas, result.atlasSize);
  const scalpTexture = result?.rearSkinMap
    ? createSkinProjectionTexture(result.rearSkinMap, result.rearSkinMapSize)
    : undefined;
  const rearSkinTexture = scalpTexture;
  if (scalpTexture) {
    scalpTexture.wrapS = THREE.RepeatWrapping;
    scalpTexture.needsUpdate = true;
  }
  const roughness = style === 'cartoon' ? 0.94 : 0.82;
  const faceMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: flat || !texture, map: flat ? null : texture ?? null, roughness, metalness: 0, side: THREE.DoubleSide });
  if (result && faceAtlas) faceMaterial.userData.photoAtlas = { pixels: faceAtlas, size: result.atlasSize };
  if (texture) faceMaterial.userData.photoTexture = texture;
  const skinProjectionMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: flat || !scalpTexture,
    map: flat ? null : scalpTexture ?? null,
    roughness,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  if (scalpTexture) skinProjectionMaterial.userData.skinProjectionTexture = scalpTexture;
  const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness, metalness: 0, side: THREE.DoubleSide });
  const rearSkinMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: flat || !rearSkinTexture,
    map: flat ? null : rearSkinTexture ?? null,
    roughness,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  if (rearSkinTexture) {
    rearSkinTexture.wrapS = THREE.RepeatWrapping;
    rearSkinTexture.needsUpdate = true;
    rearSkinMaterial.userData.rearSkinTexture = rearSkinTexture;
  }

  // The face keeps its photo atlas. Every generated scalp, rear and neck
  // triangle shares one forehead-skin tile with cylindrical UVs; stitching
  // that tile to the face atlas removes the hard material boundary.
  const faceGeometry = geometry.clone();
  faceGeometry.clearGroups();
  faceGeometry.setIndex(generated.triangles.slice(0, generated.faceTriangleCount).flat());

  const skinGeometry = geometry.clone();
  skinGeometry.clearGroups();
  skinGeometry.setAttribute('uv', new THREE.BufferAttribute(rearUvs, 2));

  const projectedIndices: number[] = [], solidIndices: number[] = [], jawIndices: number[] = [];
  for (const triangle of generated.triangles.slice(generated.faceTriangleCount)) {
    if (triangle.every((id) => generated.skinFade[id] <= 0.500001)
      && triangle.some((id) => generated.positions[id][1] < generated.positions[2][1])) {
      jawIndices.push(...triangle); continue;
    }
    const cameraDepth = result
      ? triangle.reduce((sum, id) => sum + rotate(generated.positions[id], result.fit.camera)[2], 0) / 3
      : -Infinity;
    const scalpTriangle = triangle.filter((id) => generated.parts[id] === 'cranium' || generated.parts[id] === 'bridge').length >= 2;
    // Keep the front-facing scalp on the same forehead-derived tile as the
    // rear skull and neck. The cylindrical UVs prevent stretched image edges.
    if (result?.rearSkinMap && cameraDepth > -3.5 && scalpTriangle) projectedIndices.push(...triangle);
    else solidIndices.push(...triangle);
  }
  skinGeometry.setIndex(projectedIndices);
  faceGeometry.setIndex([...generated.triangles.slice(0, generated.faceTriangleCount).flat(), ...jawIndices]);

  const rearGeometry = createUnwrappedSkinGeometry(geometry, solidIndices, rearUvs);

  const faceMesh = new THREE.Mesh(faceGeometry, faceMaterial);
  faceMesh.name = 'proceduralHeadAndNeck';
  group.add(faceMesh);
  const skinMesh = new THREE.Mesh(skinGeometry, skinProjectionMaterial);
  skinMesh.name = 'proceduralHeadSkin';
  group.add(skinMesh);
  const rearMesh = new THREE.Mesh(rearGeometry, rearSkinMaterial);
  rearMesh.name = 'proceduralHeadRearSkin';
  group.add(rearMesh);

  const halfWidth = Math.max(...template.boundary.map((id) => Math.abs(generated.positions[id][0])));
  if (includeEars && ears) {
    addEars(group, generated, geometry.getAttribute('normal'), ears, effective, skinMaterial, halfWidth, skinAt, result?.fit.measurements);
  }
  if (includeOralCavity && rig) addOralCavity(group, geometry, rig, generated.mouthRim!, natural.identity);
  geometry.dispose();
  group.userData = { generator: 'portrait-head-lab-procedural', schemaVersion: 1, expressionSet: includeExpressions && rig ? expressionSet : undefined, units: 'metres', forward: '+Z', up: '+Y', style, shapeParams: { ...effective }, headMeasurements: result?.fit.measurements, rigged: false };
  return group;
}

export function updateFlatAppearance(object: THREE.Object3D | undefined, flat: boolean) {
  object?.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child.name === 'proceduralHeadAndNeck') {
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
      return;
    }
    if (child.name === 'proceduralHeadSkin') {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const projection = materials[0] as THREE.MeshStandardMaterial;
      const texture = projection.userData.skinProjectionTexture as THREE.Texture | undefined;
      projection.map = flat ? null : texture ?? null;
      projection.vertexColors = flat || !texture;
      projection.needsUpdate = true;
    }
    if (child.name === 'proceduralHeadRearSkin') {
      const material = (Array.isArray(child.material) ? child.material[0] : child.material) as THREE.MeshStandardMaterial;
      const texture = material.userData.rearSkinTexture as THREE.Texture | undefined;
      material.map = flat ? null : texture ?? null;
      material.vertexColors = flat || !texture;
      material.needsUpdate = true;
    }
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
      const skinProjectionTexture = material.userData.skinProjectionTexture;
      if (skinProjectionTexture instanceof THREE.Texture) textures.add(skinProjectionTexture);
      const rearSkinTexture = material.userData.rearSkinTexture;
      if (rearSkinTexture instanceof THREE.Texture) textures.add(rearSkinTexture);
    }
  });
  textures.forEach((texture) => texture.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
