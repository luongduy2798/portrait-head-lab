import { clamp, deformPoint, rotate } from './shape';
import { createSkinField, linearToSrgb, srgbToLinear } from './skin';
import { smoothHeadSurface } from './subdivision';
import { mouthSurfaceTriangles } from './mouth';
import type { Analysis, FitResult, HeadTemplate, Point2, Point3, SkinSample } from './types';

type RasterPoint = [number, number];
function raster(points: RasterPoint[], width: number, height: number, visit: (x: number, y: number, a: number, b: number, c: number) => void) {
  const [[ax, ay], [bx, by], [cx, cy]] = points;
  const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(denominator) < 1e-8) return;
  const left = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const right = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
  const top = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const bottom = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const a = ((by - cy) * (x + 0.5 - cx) + (cx - bx) * (y + 0.5 - cy)) / denominator;
    const b = ((cy - ay) * (x + 0.5 - cx) + (ax - cx) * (y + 0.5 - cy)) / denominator;
    const c = 1 - a - b;
    if (a >= -1e-5 && b >= -1e-5 && c >= -1e-5) visit(x, y, a, b, c);
  }
}
function bilinear(array: ArrayLike<number>, width: number, height: number, x: number, y: number, channels = 1, channel = 0): number {
  x = clamp(x, 0, width - 1); y = clamp(y, 0, height - 1);
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const at = (px: number, py: number) => array[(Math.min(py, height - 1) * width + Math.min(px, width - 1)) * channels + channel];
  return (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
}
const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
function trimmedMean(values: number[], trim = 0.1) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * trim);
  const retained = sorted.slice(trimCount, Math.max(trimCount + 1, sorted.length - trimCount));
  return retained.reduce((sum, value) => sum + value, 0) / retained.length;
}
const luminance = (r: number, g: number, b: number) => r * 0.2126 + g * 0.7152 + b * 0.0722;
const feather = (low: number, high: number, value: number) => {
  const t = clamp((value - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
};

function depthVisibility(depth: Float32Array, size: number, x: number, y: number, z: number): number {
  x = clamp(x - 0.5, 0, size - 1); y = clamp(y - 0.5, 0, size - 1);
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  // Interpolate confidence, rather than raw depths: unfilled cells contain
  // -Infinity and must not create NaNs or square rejection edges in the atlas.
  const at = (px: number, py: number) => 1 - feather(0.15, 0.65, depth[Math.min(py, size - 1) * size + Math.min(px, size - 1)] - z);
  return (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy)
    + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
}

function boundaryDistance(point: Point2, boundary: Point2[]): number {
  let distance = Infinity;
  boundary.forEach((a, index) => {
    const b = boundary[(index + 1) % boundary.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / Math.max(1e-12, dx * dx + dy * dy), 0, 1);
    distance = Math.min(distance, Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy));
  });
  return distance;
}

/** Recover the refined face edge so the photo feather follows the actual UV
 * boundary produced by subdivision, not the coarser template polygon. */
function surfaceBoundaryLoop(triangles: [number, number, number][], startHint: number): number[] {
  const edges = new Map<string, { a: number; b: number; count: number }>();
  for (const [a, b, c] of triangles) for (const [from, to] of [[a, b], [b, c], [c, a]]) {
    const key = from < to ? `${from}:${to}` : `${to}:${from}`;
    const edge = edges.get(key);
    if (edge) edge.count++;
    else edges.set(key, { a: from, b: to, count: 1 });
  }
  const adjacent = new Map<number, number[]>();
  for (const { a, b, count } of edges.values()) {
    if (count !== 1) continue;
    adjacent.set(a, [...(adjacent.get(a) ?? []), b]);
    adjacent.set(b, [...(adjacent.get(b) ?? []), a]);
  }
  const first = adjacent.get(startHint);
  if (!first?.length) return [];
  const loop = [startHint];
  let previous = startHint, current = first[0];
  while (current !== startHint && loop.length <= adjacent.size) {
    loop.push(current);
    const next = (adjacent.get(current) ?? []).find((id) => id !== previous);
    if (next === undefined) return [];
    previous = current;
    current = next;
  }
  return current === startHint ? loop : [];
}

/** Low-frequency photo colour for a colour-only seam transition. Normalize
 * over the face outline to exclude background but retain observed shadows;
 * add image detail back separately rather than fading glasses with skin. */
function photoColorLayer(pixels: Uint8ClampedArray, width: number, height: number, faceDistance: Float32Array, analysis: Analysis, fallback: Point3) {
  const size = 128, layer = new Float32Array(size * size * 4);
  const maskSize = Math.sqrt(faceDistance.length);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = (y * size + x) * 4;
    for (const dy of [-0.3, 0, 0.3]) for (const dx of [-0.3, 0, 0.3]) {
      const u = (x + 0.5 + dx) / size, v = (y + 0.5 + dy) / size;
      const distance = bilinear(faceDistance, maskSize, maskSize, u * maskSize - 0.5, v * maskSize - 0.5);
      const observedSkin = bilinear(analysis.skin, analysis.maskWidth, analysis.maskHeight, u * analysis.maskWidth, v * analysis.maskHeight);
      const weight = feather(-4, -1, distance) * (distance >= 0 ? 1 : feather(0.05, 0.3, observedSkin)) / 9;
      for (let channel = 0; channel < 3; channel++) layer[offset + channel] += srgbToLinear(bilinear(pixels, width, height, u * width, v * height, 4, channel)) * weight;
      layer[offset + 3] += weight;
    }
  }
  const kernel = [1, 4, 6, 4, 1];
  let source = layer;
  for (const vertical of [false, true]) {
    const filtered = new Float32Array(layer.length);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) for (let channel = 0; channel < 4; channel++) {
      for (let tap = 0; tap < kernel.length; tap++) {
        const px = vertical ? x : clamp(x + tap - 2, 0, size - 1);
        const py = vertical ? clamp(y + tap - 2, 0, size - 1) : y;
        filtered[(y * size + x) * 4 + channel] += source[(py * size + px) * 4 + channel] * kernel[tap] / 16;
      }
    }
    source = filtered;
  }
  for (let offset = 0; offset < source.length; offset += 4) for (let channel = 0; channel < 3; channel++) {
    source[offset + channel] = source[offset + 3] > 1e-5 ? source[offset + channel] / source[offset + 3] : srgbToLinear(fallback[channel]);
  }
  return { pixels: source, size };
}

/** Extend atlas colours past its UV outline so filtering cannot expose fill. */
function padAtlas(atlas: Uint8ClampedArray, covered: Uint8Array, size: number) {
  let frontier: number[] = [];
  const neighbors = (index: number) => [
    index % size > 0 ? index - 1 : -1, index % size < size - 1 ? index + 1 : -1,
    index >= size ? index - size : -1, index < size * (size - 1) ? index + size : -1,
  ];
  for (let index = 0; index < covered.length; index++) {
    if (!covered[index]) continue;
    if ((index % size > 0 && !covered[index - 1]) || (index % size < size - 1 && !covered[index + 1])
      || (index >= size && !covered[index - size]) || (index < size * (size - 1) && !covered[index + size])) frontier.push(index);
  }
  for (let pass = 0; pass < 6 && frontier.length; pass++) {
    const nextFrontier: number[] = [];
    for (const index of frontier) for (const next of neighbors(index)) {
      if (next < 0 || covered[next]) continue;
      for (let channel = 0; channel < 3; channel++) atlas[next * 4 + channel] = atlas[index * 4 + channel];
      covered[next] = 1;
      nextFrontier.push(next);
    }
    frontier = nextFrontier;
  }
}

/** Build unseen-skin texture from a real, central forehead crop. The extended
 * UV map contains nearest-pixel fills which become streaks when tiled. */
function buildRearSkinMap(
  pixels: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  foreheadRect: { left: number; right: number; top: number; bottom: number },
  size: number,
  base: Point3,
  skinSamples: SkinSample[],
) {
  const rectWidth = Math.max(1, foreheadRect.right - foreheadRect.left);
  const rectHeight = Math.max(1, foreheadRect.bottom - foreheadRect.top);
  const patchSide = clamp(Math.round(Math.min(rectWidth, rectHeight) * 0.72), 32, Math.min(imageWidth - 2, imageHeight - 2));
  const centerX = (foreheadRect.left + foreheadRect.right) * 0.5;
  const centerY = (foreheadRect.top + foreheadRect.bottom) * 0.5;
  const left = clamp(centerX - patchSide * 0.5, 0, imageWidth - patchSide);
  const top = clamp(centerY - patchSide * 0.5, 0, imageHeight - patchSide);
  const patchSize = Math.max(32, Math.ceil(patchSide));
  const patch = new Float32Array(patchSize * patchSize * 4);
  for (let y = 0; y < patchSize; y++) for (let x = 0; x < patchSize; x++) {
    const sourceX = left + patchSide * (x + 0.5) / patchSize;
    const sourceY = top + patchSide * (y + 0.5) / patchSize;
    const offset = (y * patchSize + x) * 4;
    for (let channel = 0; channel < 3; channel++) {
      patch[offset + channel] = srgbToLinear(bilinear(pixels, imageWidth, imageHeight, sourceX, sourceY, 4, channel));
    }
    patch[offset + 3] = 1;
  }

  const averageRegion = (regions: SkinSample['region'][]): Point3 => {
    const samples = skinSamples.filter((sample) => regions.includes(sample.region));
    if (!samples.length) return [...base];
    return [0, 1, 2].map((channel) => samples.reduce(
      (sum, sample) => sum + srgbToLinear(sample.color[channel]), 0,
    ) / samples.length) as Point3;
  };
  const foreheadTone = averageRegion(['forehead']);
  const templeTone = averageRegion(['left-temple', 'right-temple']);
  const cheekTone = averageRegion(['left-cheek', 'right-cheek']);
  const jawTone = averageRegion(['jaw']);
  const smooth = (low: number, high: number, value: number) => {
    const t = clamp((value - low) / (high - low), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const mixColor = (a: Point3, b: Point3, weight: number): Point3 =>
    a.map((value, channel) => value * (1 - weight) + b[channel] * weight) as Point3;
  const toneAt = (u: number, v: number): Point3 => {
    let front = mixColor(jawTone, cheekTone, smooth(0.2, 0.48, v));
    front = mixColor(front, foreheadTone, smooth(0.62, 0.82, v));
    let side = mixColor(jawTone, cheekTone, smooth(0.2, 0.44, v));
    side = mixColor(side, templeTone, smooth(0.42, 0.68, v));
    side = mixColor(side, foreheadTone, smooth(0.74, 0.92, v) * 0.25);
    const frontness = smooth(0, 1, clamp(1 - Math.abs(u - 0.5) * 4, 0, 1));
    return mixColor(side, front, frontness);
  };

  // Remove broad forehead highlights/shadows before tiling. Keeping only the
  // high-frequency residual preserves real skin texture without repeating the
  // bright specular stripe across the crown and nape.
  const reflect = (coordinate: number, length: number) => {
    const period = length * 2;
    const wrapped = ((coordinate % period) + period) % period;
    return wrapped < length ? wrapped : period - 1 - wrapped;
  };
  // Remove lighting gradients but keep fine pore detail at its source scale.
  const blurRadius = clamp(Math.round(patchSize * 0.1), 3, 8);
  const windowSize = blurRadius * 2 + 1;
  const horizontal = new Float32Array(patch.length), blurred = new Float32Array(patch.length);
  for (let y = 0; y < patchSize; y++) for (let x = 0; x < patchSize; x++) for (let channel = 0; channel < 3; channel++) {
    let sum = 0;
    for (let tap = -blurRadius; tap <= blurRadius; tap++) sum += patch[(y * patchSize + reflect(x + tap, patchSize)) * 4 + channel];
    horizontal[(y * patchSize + x) * 4 + channel] = sum / windowSize;
  }
  for (let y = 0; y < patchSize; y++) for (let x = 0; x < patchSize; x++) for (let channel = 0; channel < 3; channel++) {
    let sum = 0;
    for (let tap = -blurRadius; tap <= blurRadius; tap++) sum += horizontal[(reflect(y + tap, patchSize) * patchSize + x) * 4 + channel];
    blurred[(y * patchSize + x) * 4 + channel] = sum / windowSize;
  }
  const rearSkinMap = new Float32Array(size * size * 4);
  // A single continuous crop avoids the vertical seams caused by tiled rows
  // and columns; subtle detail is preferable to a repeated pore pattern.
  const repeatsX = 1;
  // Use one vertical pass. Repeating a small forehead crop in rows creates
  // visible horizontal bands across the crown and down the neck.
  const repeatsY = 1;
  const tileWidth = size / repeatsX, tileHeight = size / repeatsY;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const tileX = Math.floor(x / tileWidth), tileY = Math.floor(y / tileHeight);
    const localX = (x + 0.5 - tileX * tileWidth) / tileWidth;
    const localY = (y + 0.5 - tileY * tileHeight) / tileHeight;
    const sampleX = tileX % 2 === 0 ? localX : 1 - localX;
    const sampleY = tileY % 2 === 0 ? localY : 1 - localY;
    const targetOffset = (y * size + x) * 4;
    const regionalTone = toneAt((x + 0.5) / size, 1 - (y + 0.5) / size);
    for (let channel = 0; channel < 3; channel++) {
      const sample = bilinear(patch, patchSize, patchSize, sampleX * patchSize - 0.5, sampleY * patchSize - 0.5, 4, channel);
      const lowFrequency = bilinear(blurred, patchSize, patchSize, sampleX * patchSize - 0.5, sampleY * patchSize - 0.5, 4, channel);
      // Keep the forehead's real pore texture visible on the unseen skull.
      // Do not reintroduce low-frequency forehead lighting: it tiled into
      // orange patches on the crown and bright vertical folds down the neck.
      const detail = clamp(sample - lowFrequency, -0.012, 0.012);
      rearSkinMap[targetOffset + channel] = clamp(regionalTone[channel] + detail * 0.12, 0, 1);
    }
    rearSkinMap[targetOffset + 3] = 1;
  }

  // The cylindrical map wraps horizontally. Blend both sides into a common
  // skin tone so the back-of-head UV seam cannot become a vertical stripe.
  const original = rearSkinMap.slice();
  const blendWidth = Math.max(8, Math.round(size * 0.045));
  for (let y = 0; y < size; y++) for (let x = 0; x < blendWidth; x++) {
    const t = x / blendWidth, weight = t * t * (3 - 2 * t);
    const leftOffset = (y * size + x) * 4;
    const rightOffset = (y * size + size - 1 - x) * 4;
    const leftInner = (y * size + blendWidth) * 4;
    const rightInner = (y * size + size - 1 - blendWidth) * 4;
    for (let channel = 0; channel < 3; channel++) {
      const edgeColor = (original[leftOffset + channel] + original[rightOffset + channel]) * 0.5;
      rearSkinMap[leftOffset + channel] = edgeColor * (1 - weight) + original[leftInner + channel] * weight;
      rearSkinMap[rightOffset + channel] = edgeColor * (1 - weight) + original[rightInner + channel] * weight;
    }
  }
  return rearSkinMap;
}

/** Extend a selected set of clean photo-skin pixels into nearby unseen areas.
 * Callers choose the source region; the same soft falloff keeps the extension
 * from turning into a hard-edged stamp when projected onto the generated head. */
function buildExtendedSkinMap(
  size: number,
  base: Point3,
  isClean: (u: number, v: number) => boolean,
  sample: (u: number, v: number) => Point3,
  extensionRadius = 64,
) {
  const map = new Float32Array(size * size * 4);
  const distance = new Int16Array(size * size).fill(-1);
  const queue = new Int32Array(size * size);
  let queueEnd = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size, v = (y + 0.5) / size;
    const offset = (y * size + x) * 4;
    const clean = isClean(u, v);
    const color = clean ? sample(u, v) : base;
    map[offset] = color[0]; map[offset + 1] = color[1]; map[offset + 2] = color[2]; map[offset + 3] = 1;
    if (!clean) continue;
    const index = y * size + x;
    distance[index] = 0;
    queue[queueEnd++] = index;
  }
  for (let read = 0; read < queueEnd; read++) {
    const index = queue[read], depth = distance[index];
    if (depth >= extensionRadius) continue;
    const x = index % size, y = Math.floor(index / size);
    const neighbors = [x > 0 ? index - 1 : -1, x + 1 < size ? index + 1 : -1,
      y > 0 ? index - size : -1, y + 1 < size ? index + size : -1];
    for (const next of neighbors) {
      if (next < 0 || distance[next] >= 0) continue;
      distance[next] = depth + 1;
      map.set(map.subarray(index * 4, index * 4 + 4), next * 4);
      queue[queueEnd++] = next;
    }
  }
  for (let index = 0; index < distance.length; index++) {
    const depth = distance[index];
    if (depth < 0) continue;
    const t = clamp((depth - 1) / (extensionRadius - 1), 0, 1);
    const fade = 1 - t * t * (3 - 2 * t);
    const offset = index * 4;
    for (let channel = 0; channel < 3; channel++) map[offset + channel] = map[offset + channel] * fade + base[channel] * (1 - fade);
  }
  return { map, distance };
}

export function buildTexture(template: HeadTemplate, fit: FitResult, analysis: Analysis, pixels: Uint8ClampedArray, width: number, height: number, size = 1024) {
  const mask = (values: Float32Array, x: number, y: number) => bilinear(values, analysis.maskWidth, analysis.maskHeight, x / width * analysis.maskWidth, y / height * analysis.maskHeight);
  const photo = (x: number, y: number, channel: number) => bilinear(pixels, width, height, x, y, 4, channel);
  const colors: number[][] = [[], [], []];
  const pixelSkinSamples: { color: [number, number, number]; light: number; saturation: number }[] = [];
  // Cheek/nose samples avoid hair, brows, lips, highlights and strong shadows.
  const regions = [50, 101, 117, 118, 205, 280, 330, 346, 347, 425, 4, 127, 234, 356, 454, 108, 337, 67, 297];
  const eyeDistance = Math.hypot(
    (analysis.landmarks[33][0] - analysis.landmarks[263][0]) * width,
    (analysis.landmarks[33][1] - analysis.landmarks[263][1]) * height,
  );
  const frontalCenterX = (analysis.landmarks[33][0] + analysis.landmarks[263][0]) * width * 0.5;
  const frontalSampleHalfWidth = eyeDistance * 1.3;
  const sampleRadius = clamp(Math.round(eyeDistance * 0.09), 5, 18);
  // The observed face outline includes glasses, eyebrows and facial hair.
  // Semantic skin segmentation must not punch holes through those details.
  const confidenceSize = 256, sourceDistance = new Float32Array(confidenceSize * confidenceSize);
  const outsideDistance = new Float32Array(sourceDistance.length);
  const outline = template.boundary.map((id) => analysis.landmarks[id]);
  const browY = Math.min(analysis.landmarks[70][1], analysis.landmarks[300][1]);
  const eyeLeft = Math.min(analysis.landmarks[33][0], analysis.landmarks[263][0]) * width - eyeDistance * 0.12;
  const eyeRight = Math.max(analysis.landmarks[33][0], analysis.landmarks[263][0]) * width + eyeDistance * 0.12;
  const eyeTop = browY * height - eyeDistance * 0.12;
  const eyeBottom = Math.max(analysis.landmarks[145][1], analysis.landmarks[374][1]) * height + eyeDistance * 0.12;
  const inEyeSampling = (x: number, y: number) => x >= eyeLeft && x <= eyeRight && y >= eyeTop && y <= eyeBottom;
  // Thick frames extend beyond the eyelids. Protect the full brow-to-cheek
  // region while keeping the existing skin-sampling exclusion unchanged.
  const eyewearLeft = Math.min(analysis.landmarks[70][0] * width, eyeLeft) - eyeDistance * 0.18;
  const eyewearRight = Math.max(analysis.landmarks[300][0] * width, eyeRight) + eyeDistance * 0.18;
  const eyewearTop = Math.max(eyeTop, browY * height - eyeDistance * 0.02);
  const eyewearBottom = Math.max(eyeBottom, ...[117, 118, 346, 347].map((id) => analysis.landmarks[id][1] * height)) + eyeDistance * 0.18;
  const inEyewear = (x: number, y: number) => x >= eyewearLeft && x <= eyewearRight && y >= eyewearTop && y <= eyewearBottom;
  const eyeDetails = [[33, 133, 145, 70], [263, 362, 374, 300]].map(([outer, inner, lower, brow]) => ({
    x: (analysis.landmarks[outer][0] + analysis.landmarks[inner][0]) * width * 0.5,
    y: (analysis.landmarks[brow][1] + analysis.landmarks[lower][1]) * height * 0.5,
    rx: Math.abs(analysis.landmarks[outer][0] - analysis.landmarks[inner][0]) * width * 0.72,
    ry: Math.max(eyeDistance * 0.1, Math.abs(analysis.landmarks[brow][1] - analysis.landmarks[lower][1]) * height * 0.72),
  }));
  const inEyeDetails = (x: number, y: number) => eyeDetails.some((eye) => ((x - eye.x) / eye.rx) ** 2 + ((y - eye.y) / eye.ry) ** 2 <= 1);
  const noseX = analysis.landmarks[4][0] * width, noseY = analysis.landmarks[4][1] * height;
  const mouthX = (analysis.landmarks[61][0] + analysis.landmarks[291][0]) * width * 0.5;
  const mouthYCenter = (analysis.landmarks[13][1] + analysis.landmarks[14][1]) * height * 0.5;
  const mouthRadiusX = Math.abs(analysis.landmarks[61][0] - analysis.landmarks[291][0]) * width * 0.65;
  const featurePreserveWeight = (x: number, y: number) => {
    const eyeWeight = Math.max(...eyeDetails.map((eye) => 1 - feather(0.72, 1.2,
      Math.hypot((x - eye.x) / eye.rx, (y - eye.y) / eye.ry))));
    const noseWeight = 1 - feather(0.72, 1.2, Math.hypot(
      (x - noseX) / (eyeDistance * 0.28), (y - noseY) / (eyeDistance * 0.4),
    ));
    const mouthWeight = 1 - feather(0.72, 1.2, Math.hypot(
      (x - mouthX) / mouthRadiusX, (y - mouthYCenter) / (eyeDistance * 0.22),
    ));
    return Math.max(eyeWeight, noseWeight, mouthWeight);
  };
  const foreheadLeft = analysis.landmarks[127][0] * width - eyeDistance * 0.02;
  const foreheadRight = analysis.landmarks[356][0] * width + eyeDistance * 0.02;
  const foreheadTop = analysis.landmarks[10][1] * height;
  const foreheadBottom = browY * height - eyeDistance * 0.06;
  const inForehead = (x: number, y: number) => x >= foreheadLeft && x <= foreheadRight
    && y >= foreheadTop && y <= foreheadBottom && !inEyeSampling(x, y) && !inEyeDetails(x, y);
  for (let y = 0; y < confidenceSize; y++) for (let x = 0; x < confidenceSize; x++) {
    const u = (x + 0.5) / confidenceSize, v = (y + 0.5) / confidenceSize;
    let inside = false;
    for (let index = 0, previous = outline.length - 1; index < outline.length; previous = index++) {
      const a = outline[index], b = outline[previous];
      if ((a[1] > v) !== (b[1] > v) && u < (b[0] - a[0]) * (v - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    sourceDistance[y * confidenceSize + x] = inside ? confidenceSize : 0;
    outsideDistance[y * confidenceSize + x] = inside ? 0 : confidenceSize;
  }
  for (const distance of [sourceDistance, outsideDistance]) {
  for (let y = 0; y < confidenceSize; y++) for (let x = 0; x < confidenceSize; x++) {
    const index = y * confidenceSize + x;
    if (x > 0) distance[index] = Math.min(distance[index], distance[index - 1] + 1);
    if (y > 0) distance[index] = Math.min(distance[index], distance[index - confidenceSize] + 1);
  }
  for (let y = confidenceSize - 1; y >= 0; y--) for (let x = confidenceSize - 1; x >= 0; x--) {
    const index = y * confidenceSize + x;
    if (x < confidenceSize - 1) distance[index] = Math.min(distance[index], distance[index + 1] + 1);
    if (y < confidenceSize - 1) distance[index] = Math.min(distance[index], distance[index + confidenceSize] + 1);
  }
  }
  // A smoothed correspondence can lie a few source pixels outside the raw
  // landmark polygon while still sampling real skin or a glasses temple.
  // Keep a signed margin; clamping every exterior sample to zero cut whole
  // triangles from the strongly foreshortened sides of the face.
  for (let index = 0; index < sourceDistance.length; index++) {
    if (sourceDistance[index] === 0) sourceDistance[index] = -outsideDistance[index];
  }
  for (const id of regions) {
    const [u, v] = analysis.landmarks[id];
    for (let dy = -sampleRadius; dy <= sampleRadius; dy += 2) for (let dx = -sampleRadius; dx <= sampleRadius; dx += 2) {
      const x = u * width + dx, y = v * height + dy;
      const color = [0, 1, 2].map((c) => photo(x, y, c));
      const luma = luminance(color[0], color[1], color[2]);
      // Estimate pigment from the visible frontal face, not the dark outer
      // cheek/temple pixels where the source photo's side lighting falls off.
      if (Math.abs(x - frontalCenterX) <= frontalSampleHalfWidth
        && !inEyeSampling(x, y) && mask(analysis.skin, x, y) > 0.72
        && mask(analysis.hair, x, y) < 0.25 && luma > 12 && luma < 238) {
        color.forEach((value, c) => colors[c].push(value));
        const saturation = (Math.max(...color) - Math.min(...color)) / Math.max(1, ...color);
        pixelSkinSamples.push({ color: color as [number, number, number], light: luma, saturation });
      }
    }
  }
  if (colors[0].length < 8) throw new Error('Không đủ vùng da rõ để tạo texture. Thử ảnh sáng đều, không bị tóc/khẩu trang che mặt.');
  const orderedLight = [...pixelSkinSamples].sort((a, b) => a.light - b.light);
  const orderedSaturation = pixelSkinSamples.map((sample) => sample.saturation).sort((a, b) => a - b);
  const quantile = (values: number[], fraction: number) => values[Math.min(values.length - 1, Math.floor(values.length * fraction))];
  const diffuseLow = orderedLight[Math.floor(orderedLight.length * 0.28)].light;
  const diffuseHigh = orderedLight[Math.floor(orderedLight.length * 0.62)].light;
  const minimumSaturation = quantile(orderedSaturation, 0.7) * 0.85;
  // Specular skin is brighter and less saturated; neutral dark hair/frames
  // are not a pigment estimate either. Keep observed midtone skin pixels.
  const diffuse = pixelSkinSamples.filter((sample) => sample.light >= diffuseLow && sample.light <= diffuseHigh && sample.saturation >= minimumSaturation);
  const skinColor = [0, 1, 2].map((channel) => diffuse.length >= 8
    ? trimmedMean(diffuse.map((sample) => sample.color[channel])) : median(colors[channel])) as Point3;
  const skinLuma = luminance(...skinColor);
  const skinSaturation = (Math.max(...skinColor) - Math.min(...skinColor)) / Math.max(1, ...skinColor);
  // Estimate the usable shadow/highlight palette from actual skin pixels, not
  // from a generic skin-tone table. Quantile bands ignore isolated extremes.
  const sortedSamples = [...pixelSkinSamples].sort((a, b) => a.light - b.light);
  const averageBand = (start: number, end: number): [number, number, number] => {
    const first = Math.floor(sortedSamples.length * start), last = Math.max(first + 1, Math.ceil(sortedSamples.length * end));
    const band = sortedSamples.slice(first, last);
    return [0, 1, 2].map((channel) => band.reduce((sum, sample) => sum + sample.color[channel], 0) / band.length) as [number, number, number];
  };
  const skinDarkColor = averageBand(0.18, 0.42);
  const skinLightColor = averageBand(0.58, 0.82);
  // Keep colour samples tied to canonical 3D positions. The renderer uses
  // their spatial relationship to continue left/right illumination over the
  // temples, ears, crown and neck instead of inventing a fixed side-light.
  const sampleRegions: { region: SkinSample['region']; ids: number[] }[] = [
    { region: 'left-cheek', ids: [117, 101, 118, 205] },
    { region: 'right-cheek', ids: [346, 330, 347, 425] },
    { region: 'left-temple', ids: [127, 162, 54, 234] },
    { region: 'right-temple', ids: [356, 389, 284, 454] },
    { region: 'forehead', ids: [10, 151, 9, 108, 337, 109, 338, 67, 297] },
    { region: 'jaw', ids: [172, 136, 397, 365] },
  ];
  const skinSamples: SkinSample[] = sampleRegions.flatMap(({ region, ids }) => ids.flatMap((id): SkinSample[] => {
    const channels: number[][] = [[], [], []];
    const [u, v] = analysis.landmarks[id];
    for (let dy = -sampleRadius; dy <= sampleRadius; dy += 2) for (let dx = -sampleRadius; dx <= sampleRadius; dx += 2) {
      const x = u * width + dx, y = v * height + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (inEyeSampling(x, y)) continue;
      const color = [0, 1, 2].map((channel) => photo(x, y, channel));
      const luma = luminance(color[0], color[1], color[2]);
      const skin = mask(analysis.skin, x, y), hair = mask(analysis.hair, x, y);
      // Ignore broad source-photo shadows when building the spatial skin
      // palette. They are lighting, not a pigment difference to bake onto a
      // cheek that must remain readable as the 3D head turns.
      if (skin <= 0.72 || hair >= 0.25 || luma <= Math.max(28, skinLuma * 0.78) || luma >= 238) continue;
      // Dark, nearly neutral beard pixels can be labelled as face skin.
      // Do not let them turn the neck grey when extending the skin palette.
      const saturation = (Math.max(...color) - Math.min(...color)) / Math.max(1, ...color);
      if (luma < skinLuma * 0.85 && saturation < skinSaturation * 0.6) continue;
      color.forEach((value, channel) => channels[channel].push(value));
    }
    if (channels.some((channel) => channel.length < 8)) return [];
    const color = channels.map((channel) => trimmedMean(channel)) as Point3;
    return [{ region, position: template.positions[id], color }];
  }));
  const skinAt = createSkinField(skinColor, skinSamples, fit.params);
  const colorLayer = photoColorLayer(pixels, width, height, sourceDistance, analysis, skinColor);
  const mouthY = analysis.landmarks[13][1] * height;
  const beardLeft = analysis.landmarks[61][0] * width - eyeDistance * 0.2;
  const beardRight = analysis.landmarks[291][0] * width + eyeDistance * 0.2;
  // Keep a general clean-skin map for face-seam blending, but derive the actual
  // scalp/rear texture only from the clean forehead: it has the most consistent
  // skin tone and avoids tiling cheeks, eyes or other facial details onto the head.
  const skinColorMapSize = 512;
  const foreheadSamples = skinSamples.filter((sample) => sample.region === 'forehead').map((sample) => sample.color);
  const foreheadTone = [0, 1, 2].map((channel) => foreheadSamples.length
    ? trimmedMean(foreheadSamples.map((color) => color[channel]), 0.2)
    : skinColor[channel]) as Point3;
  // The unseen head should inherit the forehead's real pigment and texture,
  // while the measured diffuse face tone keeps highlights from bleaching it.
  const fallbackLinear = [0, 1, 2].map((channel) =>
    srgbToLinear(skinColor[channel]) * 0.75 + srgbToLinear(foreheadTone[channel]) * 0.25,
  ) as Point3;
  const sampleSkin = (u: number, v: number): Point3 => [0, 1, 2].map((channel) => srgbToLinear(photo(u * width, v * height, channel))) as Point3;
  const isCleanSkin = (u: number, v: number) => {
    const px = u * width, py = v * height;
    const faceInset = bilinear(sourceDistance, confidenceSize, confidenceSize, u * confidenceSize - 0.5, v * confidenceSize - 0.5);
    const skinConfidence = mask(analysis.skin, px, py), hairConfidence = mask(analysis.hair, px, py);
    return faceInset >= -24 && skinConfidence > 0.72 && hairConfidence < 0.25
      && !inEyeSampling(px, py) && !inEyeDetails(px, py);
  };
  const faceSeamMap = buildExtendedSkinMap(skinColorMapSize, fallbackLinear, isCleanSkin, sampleSkin);
  const foreheadMap = buildExtendedSkinMap(skinColorMapSize, fallbackLinear,
    (u, v) => isCleanSkin(u, v) && inForehead(u * width, v * height), sampleSkin, 112);
  const skinColorMap = faceSeamMap.map;
  const hasForeheadSkin = foreheadMap.distance.some((distance) => distance === 0);
  const scalpSkinMap = hasForeheadSkin ? foreheadMap.map : faceSeamMap.map;
  const rearSkinMap = buildRearSkinMap(pixels, width, height, {
    left: foreheadLeft + eyeDistance * 0.08,
    right: foreheadRight - eyeDistance * 0.08,
    top: foreheadTop + eyeDistance * 0.04,
    bottom: foreheadBottom - eyeDistance * 0.04,
  }, skinColorMapSize, fallbackLinear, skinSamples);
  const atlas = new Uint8ClampedArray(size * size * 4);
  const covered = new Uint8Array(size * size);
  for (let i = 0; i < atlas.length; i += 4) {
    atlas[i] = skinColor[0]; atlas[i + 1] = skinColor[1]; atlas[i + 2] = skinColor[2]; atlas[i + 3] = 255;
  }
  // Bake against the same refinement as the rendered face, including the
  // source-photo coordinates. A coarse affine bake on a rounded mesh creates
  // visible kinks wherever a glasses frame crosses an original triangle edge.
  const faceTriangles = mouthSurfaceTriangles(template.triangles.slice(0, template.faceTriangleCount));
  const surface = smoothHeadSurface({
    positions: template.positions.slice(0, template.canonicalCount)
      .map((point) => deformPoint(point, 'face', fit.params, fit.expression)),
    photoPoints: analysis.landmarks.slice(0, template.canonicalCount).map(([x, y]): Point2 => [x * width, y * height]),
    uv: template.uv.slice(0, template.canonicalCount),
    parts: Array(template.canonicalCount).fill('face'),
    triangles: faceTriangles,
    skinFade: Array(template.canonicalCount).fill(0),
    faceTriangleCount: faceTriangles.length,
  });
  const posed = surface.positions.map((point) => rotate(point, fit.camera)), photoPoints = surface.photoPoints!;
  const boundaryIds = surfaceBoundaryLoop(surface.triangles.slice(0, surface.faceTriangleCount), template.boundary[0]);
  const boundary = (boundaryIds.length ? boundaryIds : template.boundary).map((id) => surface.uv[id]);
  const distances = surface.uv.map((point) => boundaryDistance(point, boundary));
  const skinColors = surface.positions.map(skinAt);
  const normals = surface.positions.map((): Point3 => [0, 0, 0]);
  const depthSize = 384, depth = new Float32Array(depthSize * depthSize).fill(-Infinity);
  for (let i = 0; i < surface.faceTriangleCount; i++) {
    const tri = surface.triangles[i];
    const [a, b, c] = tri.map((vertex) => posed[vertex]);
    const ab = b.map((value, axis) => value - a[axis]), ac = c.map((value, axis) => value - a[axis]);
    const normal: Point3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    for (const vertex of tri) for (let axis = 0; axis < 3; axis++) normals[vertex][axis] += normal[axis];
    if (normal[2] <= 0) continue;
    raster(tri.map((vertex): RasterPoint => [photoPoints[vertex][0] / width * depthSize, photoPoints[vertex][1] / height * depthSize]), depthSize, depthSize, (x, y, wa, wb, wc) => {
      const z = a[2] * wa + b[2] * wb + c[2] * wc;
      const index = y * depthSize + x;
      depth[index] = Math.max(depth[index], z);
    });
  }
  const visibility = normals.map((normal) => feather(0.05, 0.4, normal[2] / Math.max(1e-12, Math.hypot(...normal))));
  const oblique = feather(0.25, 0.6, Math.abs(fit.camera.ry));
  let painted = 0;
  for (let i = 0; i < surface.faceTriangleCount; i++) {
    const tri = surface.triangles[i];
    const points = tri.map((vertex) => photoPoints[vertex]);
    const depths = tri.map((vertex) => posed[vertex][2]);
    raster(tri.map((vertex): RasterPoint => [surface.uv[vertex][0] * size, (1 - surface.uv[vertex][1]) * size]), size, size, (x, y, a, b, c) => {
      const px = points[0][0] * a + points[1][0] * b + points[2][0] * c;
      const py = points[0][1] * a + points[1][1] * b + points[2][1] * c;
      const distance = distances[tri[0]] * a + distances[tri[1]] * b + distances[tri[2]] * c;
      let alpha = 0, detailAlpha = 0;
      const z = depths[0] * a + depths[1] * b + depths[2] * c;
      if (px >= 0 && py >= 0 && px < width && py < height) {
        const depthConfidence = 1 - oblique * (1 - depthVisibility(depth, depthSize, px / width * depthSize, py / height * depthSize, z));
        const sourceInset = bilinear(sourceDistance, confidenceSize, confidenceSize, px / width * confidenceSize - 0.5, py / height * confidenceSize - 0.5);
        let eyewear = inEyeDetails(px, py);
        if (!eyewear && inEyewear(px, py)) {
          // The glasses rim is often thicker than the eye landmarks, so the
          // eye ellipses alone leave parts of the frame under the skin blend.
          // Compare at several scales: a single nearby sample can still land
          // inside a thick black rim and incorrectly classify it as skin.
          const red = photo(px, py, 0), green = photo(px, py, 1), blue = photo(px, py, 2);
          const light = luminance(red, green, blue);
          let surroundingMin = Infinity, surroundingMax = -Infinity;
          for (const distance of [0.035, 0.055, 0.075].map((scale) => eyeDistance * scale)) {
            for (const [dx, dy] of [[-distance, 0], [distance, 0], [0, -distance], [0, distance]]) {
              const neighbor = luminance(photo(px + dx, py + dy, 0), photo(px + dx, py + dy, 1), photo(px + dx, py + dy, 2));
              surroundingMin = Math.min(surroundingMin, neighbor);
              surroundingMax = Math.max(surroundingMax, neighbor);
            }
          }
          const darkRim = light < skinLuma * 0.8
            && surroundingMax - light > Math.max(8, skinLuma * 0.07)
            && green <= Math.max(red, blue) + 12;
          // Keep small neutral reflections on glossy black frames too; these
          // are lost if only dark pixels bypass the skin-colour blend.
          const brightReflection = light > skinLuma * 1.18
            && light - surroundingMin > Math.max(12, skinLuma * 0.09)
            && (Math.max(red, green, blue) - Math.min(red, green, blue)) / Math.max(1, red, green, blue) < 0.35;
          eyewear = darkRim || brightReflection;
        }
        // The geometric face outline already excludes the background. Skin
        // semantics must not erase makeup, dark skin or a thin glasses arm.
        const beard = py >= mouthY - eyeDistance * 0.1 && px >= beardLeft && px <= beardRight;
        const hairConfidence = eyewear || beard ? 1 : 1 - feather(0.15, 0.65, mask(analysis.hair, px, py));
        const skinConfidence = eyewear || beard ? 1 : feather(0.01, 0.12, mask(analysis.skin, px, py));
        const sourceConfidence = feather(-4, -1, sourceInset) * hairConfidence * skinConfidence;
        const viewConfidence = 1 - oblique * (1 - (visibility[tri[0]] * a + visibility[tri[1]] * b + visibility[tri[2]] * c));
        const detailEdge = feather(0.00025, eyewear ? 0.003 : 0.012, distance);
        const edgeConfidence = eyewear ? detailEdge : feather(0.002, 0.075, distance);
        alpha = edgeConfidence * viewConfidence * depthConfidence * sourceConfidence;
        detailAlpha = detailEdge * viewConfidence * depthConfidence * sourceConfidence;
      }
      const index = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const fieldBase = skinColors[tri[0]][channel] * a + skinColors[tri[1]][channel] * b + skinColors[tri[2]][channel] * c;
        const projectedBase = bilinear(skinColorMap, skinColorMapSize, skinColorMapSize,
          px / width * skinColorMapSize - 0.5, py / height * skinColorMapSize - 0.5, 4, channel);
        const seamMix = (1 - feather(0.002, 0.06, distance)) * feather(-8, -1, z);
        const base = fieldBase * (1 - seamMix) + projectedBase * seamMix;
        const source = detailAlpha > 0 ? srgbToLinear(photo(px, py, channel)) : base;
        const low = bilinear(colorLayer.pixels, colorLayer.size, colorLayer.size, px / width * colorLayer.size - 0.5, py / height * colorLayer.size - 0.5, 4, channel);
        // Replace low-frequency illumination with the frontal diffuse skin
        // field, then restore only high-frequency photo detail (pores, makeup,
        // brows, eyes and lips). This prevents a dark source-photo cheek from
        // becoming an almost-black patch on a freely rotating 3D head.
        // Blend feature protection softly; hard masks around eyes or mouth
        // create abrupt patches where source lighting suddenly returns.
        const featureWeight = featurePreserveWeight(px, py);
        const relightStrength = 0.78 * (1 - featureWeight);
        const detailStrength = 0.32 + 0.68 * featureWeight;
        const relit = base * relightStrength + low * (1 - relightStrength);
        atlas[index + channel] = linearToSrgb(
          base * (1 - alpha) + relit * alpha + (source - low) * detailAlpha * detailStrength,
        );
      }
      covered[y * size + x] = 1;
      if (alpha > 0.01) painted++;
    });
  }
  if (painted < size * size * 0.02) throw new Error('Vùng mặt dùng được quá ít. Hãy chọn ảnh gần chính diện, không che mặt.');
  padAtlas(atlas, covered, size);
  return { atlas, atlasSize: size, scalpSkinMap, scalpSkinMapSize: skinColorMapSize, rearSkinMap, rearSkinMapSize: skinColorMapSize, skinColor, skinDarkColor, skinLightColor, skinSamples, projectedCoverage: painted / (size * size) };
}
