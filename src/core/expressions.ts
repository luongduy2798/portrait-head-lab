import * as THREE from 'three';
import { clamp } from './shape';
import { lowerLipRim, upperLipRim } from './mouth';
import { outerLip } from './visibility';
import type { ExpressionRigAsset } from './expression-rig';
import type { Point3 } from './types';

export const expressionSet = 'faceverse-mobile-v1';
export const expressionControls = [
  ['unbothered', 'Unbothered'], ['locked_in', 'Locked in'], ['cracking_up', 'Cracking up'],
  ['full_panic', 'Full panic'], ['big_winner', 'Big winner'], ['spectacular_flop', 'Spectacular flop'],
] as const;
export const legacyExpressionControls = [
  ['happy', 'Vui'], ['sad', 'Buồn'], ['angry', 'Tức giận'],
  ['surprised', 'Ngạc nhiên'], ['fearful', 'Sợ hãi'], ['disgusted', 'Ghê tởm'],
] as const;
export type ExpressionName = typeof expressionControls[number][0];
export type ExpressionSelection = ExpressionName | typeof legacyExpressionControls[number][0] | 'neutral';
export const expressionIntensityMultiplier = 2;
const allExpressionNames = [...expressionControls, ...legacyExpressionControls].map(([name]) => name);
const profileCache = new WeakMap<THREE.Object3D, 'mobile' | 'legacy' | undefined>();

function profile(object?: THREE.Object3D): 'mobile' | 'legacy' | undefined {
  if (!object) return undefined;
  if (profileCache.has(object)) return profileCache.get(object);
  let mobile = false, legacy = false;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const dictionary = child.morphTargetDictionary;
    if (expressionControls.every(([name]) => dictionary?.[name] !== undefined)) mobile = true;
    if (legacyExpressionControls.every(([name]) => dictionary?.[name] !== undefined)) legacy = true;
  });
  const detected = mobile ? 'mobile' : legacy ? 'legacy' : undefined;
  profileCache.set(object, detected);
  return detected;
}

export function controlsForObject(object?: THREE.Object3D) {
  return profile(object) === 'legacy' ? legacyExpressionControls : expressionControls;
}

export function supportsExpressions(object?: THREE.Object3D): boolean { return profile(object) !== undefined; }

/** Include the full 2x preset range in culling bounds. Exact export bounds are
 * still measured from the active pose by Box3.setFromObject(..., true). */
export function updateExpressionBounds(geometry: THREE.BufferGeometry) {
  const base = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position') as THREE.BufferAttribute);
  const bounds = base.clone();
  for (const attribute of geometry.morphAttributes.position ?? []) {
    const delta = new THREE.Box3().setFromBufferAttribute(attribute as THREE.BufferAttribute);
    bounds.expandByPoint(base.min.clone().addScaledVector(delta.min, expressionIntensityMultiplier));
    bounds.expandByPoint(base.max.clone().addScaledVector(delta.max, expressionIntensityMultiplier));
  }
  geometry.boundingBox = bounds;
  geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
}

export function applyExpression(object: THREE.Object3D, selected: ExpressionSelection, strength: number) {
  const mobile = profile(object) === 'mobile';
  const controls = mobile ? expressionControls : legacyExpressionControls;
  const name = controls.some(([id]) => id === selected) ? selected : 'neutral';
  const amount = Number.isFinite(strength) ? clamp(strength, 0, 1) : 0;
  const gain = mobile ? expressionIntensityMultiplier : 1;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.morphTargetInfluences || !child.morphTargetDictionary) return;
    for (const id of allExpressionNames) {
      const index = child.morphTargetDictionary[id];
      if (index !== undefined) child.morphTargetInfluences[index] = id === name ? amount * gain : 0;
    }
  });
  object.userData.expressionSet = mobile ? expressionSet : 'legacy-six-v1';
  object.userData.expression = { name, strength: amount };
}

/** glTF may wrap the exported group in a scene. Prefer its normalized UI
 * metadata, including zero-weight Unbothered, over guessing from raw weights. */
export function readExpression(object: THREE.Object3D): { name: ExpressionSelection; strength: number } {
  const controls = controlsForObject(object), mobile = profile(object) === 'mobile';
  let saved: { name: ExpressionSelection; strength: number } | undefined;
  object.traverse((child) => {
    const value = child.userData.expression;
    if (!saved && child.userData.expressionSet === (mobile ? expressionSet : 'legacy-six-v1') &&
      value && (value.name === 'neutral' || controls.some(([name]) => name === value.name)) &&
      typeof value.strength === 'number' && Number.isFinite(value.strength)) {
      saved = { name: value.name, strength: clamp(value.strength, 0, 1) };
    }
  });
  if (saved) return saved;
  let name: ExpressionSelection = 'neutral', maximum = 0;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    for (const [id] of controls) {
      const index = child.morphTargetDictionary?.[id];
      const value = index === undefined ? 0 : child.morphTargetInfluences?.[index] ?? 0;
      if (Number.isFinite(value) && value > maximum) { maximum = value; name = id; }
    }
  });
  return { name, strength: clamp(maximum / (mobile ? expressionIntensityMultiplier : 1), 0, 1) };
}

function facialFrame(points: readonly Point3[]) {
  const p = (id: number) => new THREE.Vector3(...points[id]);
  const x = p(263).sub(p(33)), y = p(10).sub(p(152));
  const width = x.length(), height = y.length();
  x.normalize(); y.addScaledVector(x, -y.dot(x)).normalize();
  const z = x.clone().cross(y).normalize(); y.copy(z).cross(x);
  return { basis: new THREE.Matrix3().set(x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z), width, height };
}

const retargetCache = new WeakMap<ExpressionRigAsset, Array<{ key: string; deltas: Record<ExpressionName, Point3[]> }>>();
const retargetTopologyCache = new WeakMap<ExpressionRigAsset, {
  key: string;
  source: THREE.Vector3[];
  neighbors: Set<number>[];
  sourceNormals: THREE.Vector3[];
}>();

/** A common resting mouth frame places the dental arches and tongue. The same
 * transform is used on every source pose, preserving native jaw alignment. */
export function mouthTransform(source: readonly Point3[], target: readonly Point3[]) {
  const frame = (points: readonly Point3[]) => {
    const p = (id: number) => new THREE.Vector3(...points[id]);
    const x = p(291).sub(p(61)), y = p(2).sub(p(152));
    const width = Math.max(1e-4, x.length());
    x.normalize(); y.addScaledVector(x, -y.dot(x));
    const height = Math.max(1e-4, y.length()); y.normalize();
    const z = x.clone().cross(y).normalize(); y.copy(z).cross(x);
    const origin = p(13).add(p(14)).multiplyScalar(0.5);
    return new THREE.Matrix4().makeBasis(x, y, z)
      .scale(new THREE.Vector3(width, height, Math.sqrt(width * height))).setPosition(origin);
  };
  return frame(target).multiply(frame(source).invert());
}

/** Fit a local affine differential from each canonical one-ring. Its normal
 * constraint supplies depth where surface neighbors alone are nearly planar.
 * No face geometry from FaceVerse replaces the fitted identity. */
export function retargetExpressionDeltas(rig: ExpressionRigAsset, identity: Point3[], triangles: [number, number, number][]) {
  const topologyKey = triangles.map((triangle) => triangle.join(',')).join(';');
  const key = `${identity.map((point) => point.join(',')).join(';')}|${topologyKey}`;
  const cached = retargetCache.get(rig);
  const cachedIndex = cached?.findIndex((entry) => entry.key === key) ?? -1;
  if (cached && cachedIndex >= 0) {
    const [entry] = cached.splice(cachedIndex, 1);
    cached.unshift(entry);
    return entry.deltas;
  }
  let topology = retargetTopologyCache.get(rig);
  if (!topology || topology.key !== topologyKey) {
    const source = rig.landmarks.map((point) => new THREE.Vector3(...point));
    const neighbors = source.map(() => new Set<number>());
    const sourceNormals = source.map(() => new THREE.Vector3());
    const normal = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
    for (const [i, j, k] of triangles) {
      neighbors[i].add(j).add(k); neighbors[j].add(i).add(k); neighbors[k].add(i).add(j);
      normal.crossVectors(a.subVectors(source[j], source[i]), b.subVectors(source[k], source[i]));
      for (const id of [i, j, k]) sourceNormals[id].add(normal);
    }
    topology = { key: topologyKey, source, neighbors, sourceNormals };
    retargetTopologyCache.set(rig, topology);
  }
  const { source, neighbors, sourceNormals } = topology;
  const destination = identity.map((point) => new THREE.Vector3(...point));
  const targetNormals = source.map(() => new THREE.Vector3());
  const normal = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (const [i, j, k] of triangles) {
    normal.crossVectors(a.subVectors(destination[j], destination[i]), b.subVectors(destination[k], destination[i]));
    for (const id of [i, j, k]) targetNormals[id].add(normal);
  }
  const from = facialFrame(rig.landmarks), to = facialFrame(identity);
  const scale = Math.sqrt(to.width * to.height / Math.max(1e-8, from.width * from.height));
  const fallback = to.basis.clone().multiply(from.basis.clone().transpose()).multiplyScalar(scale);
  const outer = (values: number[], u: THREE.Vector3, v: THREE.Vector3, weight = 1) => {
    const x = u.toArray(), y = v.toArray();
    for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) values[row * 3 + column] += x[row] * y[column] * weight;
  };
  const transforms = source.map((point, id) => {
    const covariance = Array(9).fill(0) as number[], cross = Array(9).fill(0) as number[];
    let distance = 0;
    for (const neighbor of neighbors[id]) {
      a.subVectors(source[neighbor], point); b.subVectors(destination[neighbor], destination[id]);
      outer(covariance, a, a); outer(cross, b, a); distance += a.lengthSq();
    }
    const n = sourceNormals[id].clone().normalize(), m = targetNormals[id].clone().normalize();
    if (distance < 1e-10 || n.lengthSq() < 0.5 || m.lengthSq() < 0.5) return fallback;
    outer(covariance, n, n, distance * 0.25); outer(cross, m, n, distance * 0.25 * scale);
    const matrix = new THREE.Matrix3().fromArray(covariance).transpose();
    if (Math.abs(matrix.determinant()) < 1e-10) return fallback;
    const transform = new THREE.Matrix3().fromArray(cross).transpose().multiply(matrix.invert());
    const lengths = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
      .map((axis) => axis.applyMatrix3(transform).length() / scale);
    return lengths.every((value) => Number.isFinite(value) && value > 0.25 && value < 4) && transform.determinant() > 0 ? transform : fallback;
  });
  // Per-vertex affine frames can disagree sharply between the inner/outer
  // lips. A wide smile then folds a thin lip row into a projecting shelf.
  // Share the dental/jaw frame across the lips and mandible, fading into the
  // local facial frames above the mouth. Keep adjacent lip rows coherent too.
  const mouthLinear = new THREE.Matrix3().setFromMatrix4(mouthTransform(rig.landmarks, identity));
  const lipDistances = source.map(() => Infinity), queue = [...new Set([...upperLipRim, ...lowerLipRim, ...outerLip])];
  for (const id of queue) lipDistances[id] = 0;
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (lipDistances[id] >= 3) continue;
    for (const neighbor of neighbors[id]) if (lipDistances[neighbor] > lipDistances[id] + 1) {
      lipDistances[neighbor] = lipDistances[id] + 1; queue.push(neighbor);
    }
  }
  const mouthY = (source[13].y + source[14].y) * 0.5;
  const upperHeight = Math.max(1e-4, source[2].y - mouthY);
  const mouthWeights = source.map((point, id) => Math.max(
    1 - THREE.MathUtils.smootherstep(point.y, mouthY + upperHeight * 0.15, source[2].y),
    lipDistances[id] <= 1 ? 1 : lipDistances[id] === 2 ? 0.75 : lipDistances[id] === 3 ? 0.25 : 0,
  ));
  const deltas = Object.fromEntries(expressionControls.map(([name]) => [name,
    rig.deltas[name].map((delta, id): Point3 => {
      const local = new THREE.Vector3(...delta).applyMatrix3(transforms[id]);
      const mouth = new THREE.Vector3(...delta).applyMatrix3(mouthLinear);
      return local.lerp(mouth, mouthWeights[id]).toArray() as Point3;
    }),
  ])) as Record<ExpressionName, Point3[]>;
  const entries = cached ?? [];
  entries.unshift({ key, deltas });
  if (entries.length > 2) entries.length = 2;
  retargetCache.set(rig, entries);
  return deltas;
}
