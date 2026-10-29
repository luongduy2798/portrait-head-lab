import * as THREE from 'three';
import { expressionControls, expressionIntensityMultiplier, mouthTransform, updateExpressionBounds, type ExpressionName } from './expressions';
import type { ExpressionRigAsset } from './expression-rig';
import type { Point3 } from './types';

interface OralSurface {
  name: string;
  positions: Float32Array;
  colors: number[];
  indices: number[];
  deltas: Record<ExpressionName, Float32Array>;
}
interface ProjectedTriangle {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  cx: number; cy: number; cz: number;
  denominator: number;
}

/** Adapt the mobile oral-collision correction to separate mouth meshes and a
 * different face topology. Only overlapping front skin is indexed; samples in
 * the open aperture remain unobstructed. This runs at head creation, never on
 * expression clicks or strength input. */
function oralRecession(head: THREE.BufferGeometry, oral: OralSurface[], target: ExpressionName, gain: number) {
  const index = head.getIndex()!, position = head.getAttribute('position');
  const targetIndex = expressionControls.findIndex(([name]) => name === target);
  const delta = head.morphAttributes.position![targetIndex];
  const posed = oral.map((surface) => Float32Array.from(surface.positions, (value, i) => value + gain * surface.deltas[target][i]));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const points of posed) for (let i = 0; i < points.length; i += 3) {
    minX = Math.min(minX, points[i]); maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]); maxY = Math.max(maxY, points[i + 1]);
  }
  const width = maxX - minX, height = maxY - minY;
  if (width <= 1e-8 || height <= 1e-8) return 0;
  const gridSize = 24;
  const grid = Array.from({ length: gridSize * gridSize }, () => [] as ProjectedTriangle[]);
  const cellX = (x: number) => Math.max(0, Math.min(gridSize - 1, Math.floor((x - minX) / width * gridSize)));
  const cellY = (y: number) => Math.max(0, Math.min(gridSize - 1, Math.floor((y - minY) / height * gridSize)));
  const faceCount = head.groups[0]?.count ?? index.count;
  const point = (id: number, component: number) => position.getComponent(id, component) + gain * delta.getComponent(id, component);
  for (let offset = 0; offset < faceCount; offset += 3) {
    const a = index.getX(offset), b = index.getX(offset + 1), c = index.getX(offset + 2);
    const ax = point(a, 0), ay = point(a, 1), bx = point(b, 0), by = point(b, 1), cx = point(c, 0), cy = point(c, 1);
    const left = Math.min(ax, bx, cx), right = Math.max(ax, bx, cx);
    const bottom = Math.min(ay, by, cy), top = Math.max(ay, by, cy);
    if (right < minX || left > maxX || top < minY || bottom > maxY) continue;
    const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (denominator <= 1e-12) continue;
    const triangle = { ax, ay, az: point(a, 2), bx, by, bz: point(b, 2), cx, cy, cz: point(c, 2), denominator };
    for (let y = cellY(bottom); y <= cellY(top); y++) for (let x = cellX(left); x <= cellX(right); x++) grid[y * gridSize + x].push(triangle);
  }
  const clearance = Math.max(0.0001, width * 0.005);
  let recession = 0;
  const inspect = (x: number, y: number, z: number) => {
    let surface = -Infinity;
    for (const t of grid[cellY(y) * gridSize + cellX(x)]) {
      const u = ((t.by - t.cy) * (x - t.cx) + (t.cx - t.bx) * (y - t.cy)) / t.denominator;
      const v = ((t.cy - t.ay) * (x - t.cx) + (t.ax - t.cx) * (y - t.cy)) / t.denominator;
      if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
      surface = Math.max(surface, u * t.az + v * t.bz + (1 - u - v) * t.cz);
    }
    if (surface !== -Infinity) recession = Math.max(recession, z - surface + clearance);
  };
  for (const [surfaceIndex, surface] of oral.entries()) {
    const points = posed[surfaceIndex];
    for (let i = 0; i < points.length; i += 3) inspect(points[i], points[i + 1], points[i + 2]);
    for (let i = 0; i < surface.indices.length; i += 3) {
      const a = surface.indices[i] * 3, b = surface.indices[i + 1] * 3, c = surface.indices[i + 2] * 3;
      inspect((points[a] + points[b] + points[c]) / 3, (points[a + 1] + points[b + 1] + points[c + 1]) / 3, (points[a + 2] + points[b + 2] + points[c + 2]) / 3);
    }
  }
  return recession;
}

function geometryWithTargets(positions: Float32Array, indices: number[], deltas: Record<ExpressionName, Float32Array>) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const baseNormal = geometry.getAttribute('normal');
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = [];
  geometry.morphAttributes.normal = [];
  const target = new THREE.BufferGeometry(); target.setIndex(geometry.getIndex());
  try {
    for (const [name] of expressionControls) {
      const delta = new THREE.BufferAttribute(deltas[name], 3); delta.name = name;
      target.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(positions, (value, i) => value + expressionIntensityMultiplier * deltas[name][i]), 3));
      target.computeVertexNormals();
      const normals = target.getAttribute('normal'), values = new Float32Array(positions.length);
      for (let i = 0; i < baseNormal.count; i++) values.set([
        (normals.getX(i) - baseNormal.getX(i)) / expressionIntensityMultiplier,
        (normals.getY(i) - baseNormal.getY(i)) / expressionIntensityMultiplier,
        (normals.getZ(i) - baseNormal.getZ(i)) / expressionIntensityMultiplier,
      ], i * 3);
      const normal = new THREE.BufferAttribute(values, 3); normal.name = name;
      geometry.morphAttributes.position.push(delta); geometry.morphAttributes.normal.push(normal);
    }
  } finally { target.dispose(); }
  updateExpressionBounds(geometry);
  return geometry;
}

function cavitySurface(head: THREE.BufferGeometry, rim: readonly number[], backZ: number) {
  const position = head.getAttribute('position');
  const neutral = rim.map((id) => new THREE.Vector3().fromBufferAttribute(position, id));
  const build = (points: THREE.Vector3[]) => {
    const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length);
    const width = Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x));
    const halfHeight = Math.max(width * 0.24, (Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y))) * 0.55);
    const vertices: number[] = [];
    for (const [row, depth] of [0, 0.16, 0.55, 1].entries()) {
      for (const [i, point] of points.entries()) {
        const theta = i / points.length * Math.PI * 2, radius = row === 3 ? 0.65 : 1.08;
        const ovalX = center.x - Math.cos(theta) * width * 0.5 * radius;
        const ovalY = center.y + Math.sin(theta) * halfHeight * radius;
        vertices.push(THREE.MathUtils.lerp(point.x, ovalX, depth), THREE.MathUtils.lerp(point.y, ovalY, depth), THREE.MathUtils.lerp(point.z - 0.00005, backZ, depth));
      }
    }
    vertices.push(center.x, center.y, backZ);
    return new Float32Array(vertices);
  };
  const positions = build(neutral), indices: number[] = [], colors: number[] = [];
  for (let row = 0; row < 3; row++) for (let i = 0; i < rim.length; i++) {
    const next = (i + 1) % rim.length, a = row * rim.length + i, b = row * rim.length + next;
    indices.push(a, b, a + rim.length, b, b + rim.length, a + rim.length);
  }
  for (let i = 0; i < rim.length; i++) indices.push(3 * rim.length + i, 3 * rim.length + (i + 1) % rim.length, 4 * rim.length);
  const frontColor = new THREE.Color('#653130'), rearColor = new THREE.Color('#17090a');
  for (let row = 0; row < 4; row++) {
    const color = frontColor.clone().lerp(rearColor, row / 3);
    for (let i = 0; i < rim.length; i++) colors.push(color.r, color.g, color.b);
  }
  colors.push(rearColor.r, rearColor.g, rearColor.b);
  const deltas = Object.fromEntries(expressionControls.map(([name], targetIndex) => {
    const attribute = head.morphAttributes.position![targetIndex];
    const target = build(neutral.map((point, i) => point.clone().addScaledVector(new THREE.Vector3().fromBufferAttribute(attribute, rim[i]), expressionIntensityMultiplier)));
    return [name, Float32Array.from(target, (value, i) => (value - positions[i]) / expressionIntensityMultiplier)];
  })) as Record<ExpressionName, Float32Array>;
  const geometry = geometryWithTargets(positions, indices, deltas);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

export function addOralCavity(group: THREE.Group, head: THREE.BufferGeometry, rig: ExpressionRigAsset, rim: readonly number[], identity: Point3[]) {
  if (rim.length < 20) throw new Error('Thiếu đường viền môi để dựng khoang miệng.');
  const position = head.getAttribute('position');
  // Use exactly the face's jaw differential, rather than deriving another
  // scale/rotation from landmarks already shifted by lip closure and Loop.
  const transform = mouthTransform(rig.landmarks, identity);
  const sourceCenter = new THREE.Vector3(...rig.landmarks[13]).add(new THREE.Vector3(...rig.landmarks[14])).multiplyScalar(0.5).applyMatrix4(transform);
  // Head vertices are stored in metres while the transformed rig is in
  // centimetres. Average the two lip landmarks first, then convert metres to
  // centimetres; omitting the average doubles the target centre and shifts the
  // oral assembly below the chin.
  const targetCenter = new THREE.Vector3().fromBufferAttribute(position, 13)
    .add(new THREE.Vector3().fromBufferAttribute(position, 14)).multiplyScalar(50);
  transform.setPosition(new THREE.Vector3().setFromMatrixPosition(transform).add(targetCenter).sub(sourceCenter));
  const linear = new THREE.Matrix3().setFromMatrix4(transform);
  const color = new THREE.Color();
  const oral: OralSurface[] = rig.oral.map((surface) => ({
    name: surface.name,
    positions: new Float32Array(surface.positions.flatMap((point) => new THREE.Vector3(...point).applyMatrix4(transform).multiplyScalar(0.01).toArray())),
    colors: surface.colors.flatMap((value) => color.setRGB(...value, THREE.SRGBColorSpace).toArray()),
    indices: surface.triangles.flat(),
    deltas: Object.fromEntries(expressionControls.map(([name], targetIndex) => {
      const anchor = surface.name === 'upperTeeth' ? 13 : 14;
      const sourceMotion = new THREE.Vector3(...rig.deltas[name][anchor]).applyMatrix3(linear).multiplyScalar(0.01);
      const lipMotion = new THREE.Vector3().fromBufferAttribute(head.morphAttributes.position![targetIndex], anchor);
      const alignment = lipMotion.sub(sourceMotion);
      // Loop changes the final lip displacement slightly. Keep the upper arch
      // with the upper lip, and the lower arch/tongue with the lower lip, while
      // retaining each component's native articulated shape.
      return [name, new Float32Array(surface.deltas[name].flatMap((delta) =>
        new THREE.Vector3(...delta).applyMatrix3(linear).multiplyScalar(0.01).add(alignment).toArray()))];
    })) as Record<ExpressionName, Float32Array>,
  }));
  const neutralInset = oralRecession(head, oral, 'unbothered', 0);
  for (const surface of oral) for (let i = 2; i < surface.positions.length; i += 3) surface.positions[i] -= neutralInset;
  for (const [name] of expressionControls) {
    if (name === 'unbothered') continue;
    let insetPerUnit = 0;
    for (const fraction of [0.25, 0.5, 0.75, 1]) {
      const gain = fraction * expressionIntensityMultiplier;
      insetPerUnit = Math.max(insetPerUnit, oralRecession(head, oral, name, gain) / gain);
    }
    for (const surface of oral) for (let i = 2; i < surface.deltas[name].length; i += 3) surface.deltas[name][i] -= insetPerUnit;
  }
  let backZ = Math.min(position.getZ(13), position.getZ(14)) - Math.abs(position.getX(291) - position.getX(61)) * 0.65;
  for (const surface of oral) for (let i = 2; i < surface.positions.length; i += 3) {
    for (const [name] of expressionControls) backZ = Math.min(backZ, surface.positions[i] + expressionIntensityMultiplier * surface.deltas[name][i] - 0.002);
  }
  const mouth = new THREE.Group(); mouth.name = 'oralCavity';
  const wall = new THREE.Mesh(cavitySurface(head, rim, backZ), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, side: THREE.DoubleSide }));
  wall.name = 'mouthInterior'; mouth.add(wall);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, side: THREE.DoubleSide });
  for (const surface of oral) {
    const geometry = geometryWithTargets(surface.positions, surface.indices, surface.deltas);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(surface.colors, 3));
    const mesh = new THREE.Mesh(geometry, material); mesh.name = surface.name;
    mesh.userData.source = 'FaceVerse v4 oral geometry and mobile presets; local evaluation';
    mouth.add(mesh);
  }
  group.add(mouth);
}
