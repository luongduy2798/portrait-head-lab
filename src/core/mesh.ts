import * as THREE from 'three';
import { clamp, deformPoint, styledParams } from './shape';
import type { EarTemplate } from './ears';
import { expressionControls, expressionPositions, type ExpressionName } from './expressions';
import { lowerLipRim, mouthSurfaceTriangles, upperLipRim } from './mouth';
import { createSkinField, type SkinColorField } from './skin';
import { smoothHeadSurface, type HeadSurface } from './subdivision';
import type { HeadPart, HeadResult, HeadTemplate, Point2, Point3, ShapeParams, Style } from './types';

const smoothstep = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const meters = (point: Point3): Point3 => point.map((value) => value * 0.01) as Point3;

/** Fair the coarse nape before subdivision. Constraining the face, crown and
 * neck base removes the long loft crease without projecting a finished mesh
 * onto a different surface or expanding the cap vertices. */
function relaxNapeCage(points: Point3[], triangles: [number, number, number][], canonicalCount: number, baseY: number, scale: number): Point3[] {
  const neighbors = points.map(() => new Set<number>());
  for (const [a, b, c] of triangles) {
    neighbors[a].add(b).add(c); neighbors[b].add(a).add(c); neighbors[c].add(a).add(b);
  }
  const weights = points.map((point, index) => index < canonicalCount ? 0
    : THREE.MathUtils.smootherstep(5 * scale - point[1], 0, 7 * scale)
      * THREE.MathUtils.smootherstep(point[1] - baseY, 0, 3 * scale));
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
    const angles = [Math.atan2(area, ab.dot(ac)), Math.atan2(area, -ab.dot(bc)), Math.atan2(area, ac.dot(bc))];
    for (const [corner, vertex] of [ia, ib, ic].entries()) {
      normals[vertex * 3] += normal.x * angles[corner];
      normals[vertex * 3 + 1] += normal.y * angles[corner];
      normals[vertex * 3 + 2] += normal.z * angles[corner];
    }
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
function buildNaturalHead(template: HeadTemplate, params: ShapeParams, expression?: ExpressionName): HeadSurface {
  const canonicalCount = template.canonicalCount;
  if (
    canonicalCount !== 468 || template.positions.length < canonicalCount ||
    template.uv.length < canonicalCount || template.triangles.length < template.faceTriangleCount ||
    template.boundary.length < 24 || template.faceTriangleCount !== 898
  ) throw new Error('Template mặt canonical không đủ dữ liệu để tự sinh mesh đầu–cổ.');

  const identity = template.positions.slice(0, canonicalCount).map((point) => deformPoint(point, 'face', params));
  const neutral = closeNeutralLips(identity);
  const facePositions = expression ? expressionPositions(neutral, identity, expression) : neutral;
  const positions = [...facePositions];
  const parts: HeadPart[] = Array(canonicalCount).fill('face');
  const uv: Point2[] = template.uv.slice(0, canonicalCount).map(([u, v]) => [u, v]);
  const triangles = mouthSurfaceTriangles(template.triangles.slice(0, template.faceTriangleCount));
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
  const profile = [
    [maxY, foreheadZ, minY, chinZ, 1, 1],
    [maxY + height * 0.10, foreheadZ - 1.1 * headScale, minY - height * 0.015, chinZ - 1.1 * headScale, 1.025, 0.90],
    [maxY + height * 0.18, foreheadZ - 4.1 * headScale, minY - height * 0.025, chinZ - 2.6 * headScale, 1.04, 0.68],
    [maxY + height * 0.20, -3.4 * headScale, minY - height * 0.045, chinZ - 3.7 * headScale, 1.01, 0.42],
    [maxY + height * 0.14, -7.2 * headScale, minY - height * 0.075, chinZ - 4.25 * headScale, 0.98, 0.20],
    [maxY - height * 0.02, -10.3 * headScale, minY - height * 0.10, chinZ - 4.4 * headScale, 0.90, 0.05],
    [maxY - height * 0.24, -11.2 * headScale, minY - height * 0.12, chinZ - 4.4 * headScale, 0.79, 0],
    [maxY - height * 0.54, -9.8 * headScale, minY - height * 0.14, chinZ - 4.3 * headScale, 0.68, 0],
    [maxY - height * 0.80, -7.65 * headScale, minY - height * 0.16, chinZ - 4.25 * headScale, 0.62, 0],
    [minY - height * 0.01, -7.1 * headScale, minY - height * 0.22, chinZ - 4.15 * headScale, 0.60, 0],
    [minY - height * 0.20, -7.2 * headScale, minY - height * 0.28, chinZ - 3.75 * headScale, 0.62, 0],
    [minY - height * 0.34, -7.7 * headScale, minY - height * 0.34, chinZ - 3.4 * headScale, 0.66, 0],
  ];

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
      const point: Point3 = [
        width * lateral + residual[0] * detail,
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

  return smoothHeadSurface({ positions: relaxNapeCage(positions, triangles, canonicalCount, lastProfile[0], headScale), parts, uv, triangles, skinFade, faceTriangleCount });
}

function applySkinColors(geometry: THREE.BufferGeometry, skinAt: SkinColorField) {
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  for (let vertex = 0; vertex < positions.count; vertex++) {
    colors.set(skinAt([positions.getX(vertex) * 100, positions.getY(vertex) * 100, positions.getZ(vertex) * 100]), vertex * 3);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

function addExpressionTargets(geometry: THREE.BufferGeometry, template: HeadTemplate, params: ShapeParams) {
  const basePosition = geometry.getAttribute('position'), baseNormal = geometry.getAttribute('normal');
  const positions: THREE.BufferAttribute[] = [], normals: THREE.BufferAttribute[] = [];
  for (const [name] of expressionControls) {
    const surface = buildNaturalHead(template, params, name);
    const target = new THREE.BufferGeometry();
    target.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions.flatMap(meters), 3));
    target.setIndex(surface.triangles.flat());
    computeSmoothNormals(target);
    const position = target.getAttribute('position'), normal = target.getAttribute('normal');
    const positionDelta = new Float32Array(position.count * 3), normalDelta = new Float32Array(position.count * 3);
    for (let id = 0; id < position.count; id++) {
      positionDelta.set([position.getX(id) - basePosition.getX(id), position.getY(id) - basePosition.getY(id), position.getZ(id) - basePosition.getZ(id)], id * 3);
      normalDelta.set([normal.getX(id) - baseNormal.getX(id), normal.getY(id) - baseNormal.getY(id), normal.getZ(id) - baseNormal.getZ(id)], id * 3);
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
  geometry.computeBoundingSphere();
}

function addMouthInterior(group: THREE.Group, head: THREE.BufferGeometry) {
  const index = head.getIndex()!, position = head.getAttribute('position');
  const edges = new Map<string, { a: number; b: number; count: number }>();
  for (let offset = 0; offset < index.count; offset += 3) for (let corner = 0; corner < 3; corner++) {
    const a = index.getX(offset + corner), b = index.getX(offset + (corner + 1) % 3);
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const edge = edges.get(key);
    if (edge) edge.count++;
    else edges.set(key, { a, b, count: 1 });
  }
  const boundary = new Map<number, number[]>();
  for (const { a, b, count } of edges.values()) if (count === 1) {
    boundary.set(a, [...boundary.get(a) ?? [], b]);
    boundary.set(b, [...boundary.get(b) ?? [], a]);
  }
  const rim = [13];
  let previous = -1, next = 13;
  do {
    const neighbors = boundary.get(next);
    if (!neighbors || neighbors.length !== 2) throw new Error('Không tìm được đường viền trong của môi.');
    const following = neighbors.find((id) => id !== previous)!;
    previous = next; next = following;
    if (next !== 13) rim.push(next);
  } while (next !== 13 && rim.length <= position.count);
  const ring = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, delta = false) => {
    const vertices = rim.map((id): Point3 => [attribute.getX(id), attribute.getY(id), attribute.getZ(id) - (delta ? 0 : 0.00005)]);
    const center = vertices.reduce((sum, point) => sum.map((value, axis) => value + point[axis] / vertices.length) as Point3, [0, 0, 0] as Point3);
    if (!delta) center[2] -= 0.01;
    return [...vertices, center].flat();
  };
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(ring(position), 3));
  geometry.setIndex(rim.flatMap((_, id) => [id, (id + 1) % rim.length, rim.length]));
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = head.morphAttributes.position!.map((attribute) => {
    const target = new THREE.Float32BufferAttribute(ring(attribute, true), 3);
    target.name = attribute.name;
    return target;
  });
  const interior = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x231312, side: THREE.DoubleSide }));
  interior.name = 'mouthInterior';
  group.add(interior);
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

export function createHead(template: HeadTemplate, ears: EarTemplate, result?: HeadResult, params: ShapeParams = {}, style: Style = 'natural', strength = 0.5, flat = false) {
  const group = new THREE.Group();
  group.name = 'headAsset';
  const effective = styledParams(params, style, strength);
  const generated = buildNaturalHead(template, effective);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(generated.positions.flatMap(meters), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(generated.uv.flat(), 2));

  const skin: [number, number, number] = result?.skinColor ?? [197, 159, 137];
  const skinAt = createSkinField(skin, result?.skinSamples ?? [], effective);
  applySkinColors(geometry, skinAt);
  geometry.setIndex(generated.triangles.flat());
  geometry.addGroup(0, generated.faceTriangleCount * 3, 0);
  geometry.addGroup(generated.faceTriangleCount * 3, (generated.triangles.length - generated.faceTriangleCount) * 3, 1);
  computeSmoothNormals(geometry);
  addExpressionTargets(geometry, template, effective);

  let texture: THREE.CanvasTexture | undefined;
  if (result && !flat) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = result.atlasSize;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Không tạo được texture.');
    context.putImageData(new ImageData(new Uint8ClampedArray(result.atlas), result.atlasSize, result.atlasSize), 0, 0);
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
  }
  const roughness = style === 'cartoon' ? 0.94 : 0.82;
  const faceMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: !texture, map: texture ?? null, roughness, metalness: 0, side: THREE.DoubleSide });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, [faceMaterial, skinMaterial]);
  mesh.name = 'proceduralHeadAndNeck';
  group.add(mesh);

  const halfWidth = Math.max(...template.boundary.map((id) => Math.abs(generated.positions[id][0])));
  addEars(group, mesh, ears, effective, skinMaterial, halfWidth, skinAt);
  addMouthInterior(group, geometry);
  group.userData = { generator: 'portrait-head-lab-procedural', schemaVersion: 1, units: 'metres', forward: '+Z', up: '+Y', style, shapeParams: { ...effective }, rigged: false };
  return group;
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
    }
  });
  textures.forEach((texture) => texture.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
