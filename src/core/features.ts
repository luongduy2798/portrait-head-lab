import * as THREE from 'three';
import { clamp } from './shape';
import { browContours, eyeContours, outerLip } from './visibility';
import type { HeadPart, HeadTemplate, PaletteOverrides, Point2, Point3 } from './types';

export interface FacePalette {
  skin: THREE.Color; lips: THREE.Color; brows: THREE.Color;
  iris: THREE.Color; pupil: THREE.Color; sclera: THREE.Color;
}
export function createPalette(skin: Point3, overrides: PaletteOverrides = {}): FacePalette {
  const color = overrides.skin ? new THREE.Color(overrides.skin) : new THREE.Color().setRGB(skin[0] / 255, skin[1] / 255, skin[2] / 255, THREE.SRGBColorSpace);
  const srgb = color.clone().convertLinearToSRGB();
  const lips = new THREE.Color().setRGB(clamp(srgb.r * 0.84 + 0.035, 0, 1), srgb.g * 0.69, srgb.b * 0.73 + 0.012, THREE.SRGBColorSpace);
  return { skin: color, lips, brows: new THREE.Color(overrides.brows ?? '#38291f'), iris: new THREE.Color(overrides.eyes ?? '#59402c'), pupil: new THREE.Color('#141310'), sclera: new THREE.Color('#eee9df') };
}

function inside(point: Point2, polygon: Point2[]) {
  let value = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) value = !value;
  }
  return value;
}

/** The existing lip surface already has sculpted geometry and six morphs.
 * Give it an authored colour instead of projecting lips from the portrait. */
export function colorFaceDetails(geometry: THREE.BufferGeometry, template: HeadTemplate, parts: HeadPart[], palette: FacePalette) {
  const uv = geometry.getAttribute('uv'), colors = geometry.getAttribute('color');
  const outline = outerLip.map((id) => template.uv[id]);
  for (let id = 0; id < uv.count; id++) {
    if (parts[id] !== 'face') continue;
    if (inside([uv.getX(id), uv.getY(id)], outline)) colors.setXYZ(id, palette.lips.r, palette.lips.g, palette.lips.b);
  }
  colors.needsUpdate = true;
}

interface FeatureSurface { name: string; geometry: THREE.BufferGeometry; material: 'eye' | 'skin' | 'brow' }
function grid(columns: number, rows: number, offset = 0, reverse = false) {
  const indices: number[] = [];
  for (let x = 0; x < columns; x++) for (let y = 0; y < rows; y++) {
    const a = offset + x * (rows + 1) + y, b = a + rows + 1;
    indices.push(...(reverse ? [a, b, a + 1, b, b + 1, a + 1] : [a, a + 1, b, b, a + 1, b + 1]));
  }
  return indices;
}
function surface(points: THREE.Vector3[], indices: number[], colors?: number[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap((point) => [point.x, point.y, point.z]), 3));
  if (colors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); return geometry;
}

function buildFeatures(points: THREE.Vector3[], palette: FacePalette): FeatureSurface[] {
  const result: FeatureSurface[] = [];
  const curve = (ids: readonly number[]) => new THREE.CatmullRomCurve3(ids.map((id) => points[id].clone()), false, 'centripetal');
  eyeContours.forEach(({ upper, lower }, eye) => {
    const top = curve(upper), bottom = curve(lower);
    const center = top.getPoint(0.5).add(bottom.getPoint(0.5)).multiplyScalar(0.5);
    const irisRadius = points[upper[0]].distanceTo(points[upper[upper.length - 1]]) * 0.205;
    const columns = 48, rows = 16, vertices: THREE.Vector3[] = [], colors: number[] = [];
    for (const back of [false, true]) for (let col = 0; col <= columns; col++) {
      const t = col / columns, a = top.getPoint(t), b = bottom.getPoint(t);
      for (let row = 0; row <= rows; row++) {
        const v = row / rows;
        const point = a.clone().lerp(b, v);
        point.z += 0.0002 + Math.sin(t * Math.PI) * Math.sin(v * Math.PI) * (back ? -0.006 : 0.0016);
        const radius = Math.hypot(point.x - center.x, point.y - center.y) / Math.max(0.0001, irisRadius);
        const color = palette.sclera.clone();
        if (!back && radius < 1.04) {
          const angle = Math.atan2(point.y - center.y, point.x - center.x);
          const iris = palette.iris.clone().multiplyScalar((0.88 + Math.sin(angle * 37 + radius * 18) * 0.08) * (radius > 0.86 ? 0.58 : 1));
          color.lerp(iris, clamp((1.04 - radius) / 0.07, 0, 1));
          color.lerp(palette.pupil, clamp((0.47 - radius) / 0.07, 0, 1));
        }
        vertices.push(point); colors.push(color.r, color.g, color.b);
      }
    }
    result.push({ name: `eye-${eye}`, material: 'eye', geometry: surface(vertices, [...grid(columns, rows), ...grid(columns, rows, (columns + 1) * (rows + 1), true)], colors) });
    for (const [name, contour, radius] of [['upper', upper, 0.00042], ['lower', lower, 0.0003]] as const) {
      const rim = new THREE.CatmullRomCurve3(contour.map((id) => points[id].clone().add(new THREE.Vector3(0, 0, 0.00025))), false, 'centripetal');
      result.push({ name: `eyelid-${eye}-${name}`, material: 'skin', geometry: new THREE.TubeGeometry(rim, 40, radius, 6, false) });
    }
  });
  browContours.forEach(({ upper, lower }, brow) => {
    const top = curve(upper), bottom = curve(lower), vertices: THREE.Vector3[] = [];
    const columns = 32, rows = 4;
    for (let col = 0; col <= columns; col++) {
      const t = col / columns, a = top.getPoint(t), b = bottom.getPoint(t), center = a.clone().lerp(b, 0.5);
      const taper = 0.35 + Math.sin(t * Math.PI) * 0.65;
      for (let row = 0; row <= rows; row++) {
        const v = row / rows;
        const point = a.clone().lerp(b, v).sub(center).multiplyScalar(0.68 * taper).add(center);
        point.z += 0.0004 + Math.sin(v * Math.PI) * 0.00035;
        vertices.push(point);
      }
    }
    result.push({ name: `brow-${brow}`, material: 'brow', geometry: surface(vertices, grid(columns, rows)) });
  });
  return result;
}

/** Build details from the smoothed head's landmarks, then author matching
 * targets from its actual expression deltas. No portrait pixels are used. */
export function createFaceDetails(head: THREE.BufferGeometry, palette: FacePalette) {
  const position = head.getAttribute('position');
  const basePoints = Array.from({ length: 468 }, (_, id) => new THREE.Vector3().fromBufferAttribute(position, id));
  const base = buildFeatures(basePoints, palette);
  for (const attribute of head.morphAttributes.position ?? []) {
    const targetPoints = basePoints.map((point, id) => point.clone().add(new THREE.Vector3().fromBufferAttribute(attribute, id)));
    const targets = buildFeatures(targetPoints, palette);
    targets.forEach((target, index) => {
      const geometry = base[index].geometry;
      for (const key of ['position', 'normal'] as const) {
        const source = geometry.getAttribute(key), destination = target.geometry.getAttribute(key);
        const values = new Float32Array(source.count * 3);
        for (let id = 0; id < source.count; id++) values.set([destination.getX(id) - source.getX(id), destination.getY(id) - source.getY(id), destination.getZ(id) - source.getZ(id)], id * 3);
        const delta = new THREE.Float32BufferAttribute(values, 3); delta.name = attribute.name;
        (geometry.morphAttributes[key] ??= []).push(delta);
      }
      geometry.morphTargetsRelative = true;
      target.geometry.dispose();
    });
  }
  const materials = {
    eye: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, side: THREE.DoubleSide }),
    skin: new THREE.MeshStandardMaterial({ color: palette.skin, roughness: 0.85 }),
    brow: new THREE.MeshStandardMaterial({ color: palette.brows, roughness: 1, side: THREE.DoubleSide }),
  };
  const group = new THREE.Group(); group.name = 'facialFeatures';
  for (const item of base) {
    const mesh = new THREE.Mesh(item.geometry, materials[item.material]); mesh.name = item.name; group.add(mesh);
  }
  return group;
}
