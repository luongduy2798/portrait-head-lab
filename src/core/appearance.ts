import { clamp } from './shape';
import { maskAt } from './visibility';
import type { Analysis, Point3 } from './types';

export const skinColorHex = (color: Point3) => `#${color.map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
const luma = ([r, g, b]: Point3) => r * 0.2126 + g * 0.7152 + b * 0.0722;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Estimate a single skin material, without retaining photo lighting patches. */
export function sampleSkinColor(analysis: Analysis, pixels: Uint8ClampedArray, width: number, height: number) {
  const samples: Point3[] = [];
  const faceWidth = Math.abs(analysis.landmarks[454][0] - analysis.landmarks[234][0]);
  const radius = Math.max(2, Math.round(faceWidth * width * 0.025));
  const add = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const u = x / width, v = y / height;
    if (maskAt(analysis.skin, analysis, u, v) < 0.72 || maskAt(analysis.hair, analysis, u, v) > 0.12 || maskAt(analysis.accessories, analysis, u, v) > 0.12) return;
    const index = (Math.floor(y) * width + Math.floor(x)) * 4;
    const color: Point3 = [pixels[index], pixels[index + 1], pixels[index + 2]];
    if (luma(color) > 18 && luma(color) < 244 && Math.max(...color) < 253) samples.push(color);
  };
  for (const id of [50, 101, 205, 206, 207, 280, 330, 425, 426, 427, 18]) {
    const [u, v] = analysis.landmarks[id];
    const step = Math.max(1, Math.round(radius / 3));
    for (let dy = -radius; dy <= radius; dy += step) for (let dx = -radius; dx <= radius; dx += step) add(u * width + dx, v * height + dy);
  }
  if (samples.length < 16) {
    const top = analysis.landmarks[2][1], bottom = analysis.landmarks[152][1];
    const left = Math.min(analysis.landmarks[234][0], analysis.landmarks[454][0]);
    const right = Math.max(analysis.landmarks[234][0], analysis.landmarks[454][0]);
    for (let y = top * height; y < bottom * height; y += 5) for (let x = left * width; x < right * width; x += 5) add(x, y);
  }
  if (samples.length < 8) return { color: [197, 159, 137] as Point3, warning: 'Không lấy được đủ vùng da rõ. Đang dùng màu da mẫu; có thể chỉnh màu bên dưới.' };
  const center = median(samples.map(luma));
  const diffuse = samples.filter((color) => Math.abs(luma(color) - center) < Math.max(12, center * 0.22));
  const accepted = diffuse.length >= 8 ? diffuse : samples;
  return { color: [0, 1, 2].map((channel) => Math.round(median(accepted.map((color) => color[channel])))) as Point3 };
}
