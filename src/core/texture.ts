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
      if (!inEyeSampling(x, y) && mask(analysis.skin, x, y) > 0.72 && mask(analysis.hair, x, y) < 0.25 && luma > 12 && luma < 238) {
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
  const diffuseLow = orderedLight[Math.floor(orderedLight.length * 0.2)].light;
  const diffuseHigh = orderedLight[Math.floor(orderedLight.length * 0.65)].light;
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
      if (skin <= 0.72 || hair >= 0.25 || luma <= Math.max(28, skinLuma * 0.55) || luma >= 238) continue;
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
  const boundary = template.boundary.map((id) => template.uv[id]);
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
      if (px >= 0 && py >= 0 && px < width && py < height) {
        const z = depths[0] * a + depths[1] * b + depths[2] * c;
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
        const base = skinColors[tri[0]][channel] * a + skinColors[tri[1]][channel] * b + skinColors[tri[2]][channel] * c;
        const source = detailAlpha > 0 ? srgbToLinear(photo(px, py, channel)) : base;
        const low = bilinear(colorLayer.pixels, colorLayer.size, colorLayer.size, px / width * colorLayer.size - 0.5, py / height * colorLayer.size - 0.5, 4, channel);
        atlas[index + channel] = linearToSrgb(base * (1 - alpha) + low * alpha + (source - low) * detailAlpha);
      }
      covered[y * size + x] = 1;
      if (alpha > 0.01) painted++;
    });
  }
  if (painted < size * size * 0.02) throw new Error('Vùng mặt dùng được quá ít. Hãy chọn ảnh gần chính diện, không che mặt.');
  padAtlas(atlas, covered, size);
  return { atlas, atlasSize: size, skinColor, skinDarkColor, skinLightColor, skinSamples, projectedCoverage: painted / (size * size) };
}
