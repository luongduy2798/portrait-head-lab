import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { smoothHeadSurface } from './subdivision';
import type { Point3 } from './types';

export interface EarTemplate {
  positions: Point3[];
  triangles: [number, number, number][];
  rootWeights: number[];
  neighbors: number[][];
}

// Reuse the existing local evaluation asset; no model request leaves this origin.
const sourcePath = '/assets/faceverse/faceverse-neutral.glb';
const sourceSHA256 = '0de714251964c2db70cdf1286dc5e9f899ce1dce9d78877ba58629de4b32b93f';
let pending: Promise<EarTemplate> | undefined;

export function loadEarTemplate(): Promise<EarTemplate> {
  pending ??= (async () => {
    const response = await fetch(sourcePath, { cache: 'force-cache' });
    if (!response.ok) throw new Error('Thiếu mesh FaceVerse local để dựng tai.');
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const checksum = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
    if (checksum !== sourceSHA256) throw new Error('Checksum mesh tai FaceVerse không khớp phiên bản đã pin.');
    const { scene } = await new GLTFLoader().parseAsync(bytes, '');
    try {
      const mesh = scene.getObjectByName('FaceVerseNeutralHead');
      if (!(mesh instanceof THREE.Mesh)) throw new Error('Mesh FaceVerse local không có surface đầu.');
      const source = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex();
      if (!index || source.count !== 19546) throw new Error('Topology mesh tai FaceVerse không phù hợp.');
      // Keep the ear and its attachment skin. Cut edges stay in the root patch,
      // away from the authored helix, concha and lobule.
      const selected = Array.from({ length: source.count }, (_, id) => {
        const x = source.getX(id) * 100, y = source.getY(id) * 100, z = source.getZ(id) * 100;
        return x > 6.3 && y > -3.5 && y < 7 && z > -6.5 && z < 0.5;
      });
      const positions: Point3[] = [], triangles: [number, number, number][] = [];
      const remap = new Map<number, number>();
      const vertex = (id: number) => {
        let mapped = remap.get(id);
        if (mapped === undefined) {
          mapped = positions.length; remap.set(id, mapped);
          positions.push([source.getX(id) * 100, source.getY(id) * 100, source.getZ(id) * 100]);
        }
        return mapped;
      };
      for (let offset = 0; offset < index.count; offset += 3) {
        const ids = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
        if (ids.every((id) => selected[id])) triangles.push(ids.map(vertex) as [number, number, number]);
      }
      if (positions.length < 500 || triangles.length < 800) throw new Error('Vùng tai FaceVerse không đủ dữ liệu.');
      const neighbors = positions.map(() => new Set<number>());
      const edges = new Map<string, { a: number; b: number; count: number }>();
      for (const triangle of triangles) for (let corner = 0; corner < 3; corner++) {
        const a = triangle[corner], b = triangle[(corner + 1) % 3];
        neighbors[a].add(b); neighbors[b].add(a);
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        const edge = edges.get(key);
        if (edge) edge.count++;
        else edges.set(key, { a, b, count: 1 });
      }
      const distances = positions.map(() => Infinity), queue: number[] = [];
      for (const { a, b, count } of edges.values()) if (count === 1) for (const id of [a, b]) {
        if (distances[id] === 0) continue;
        distances[id] = 0; queue.push(id);
      }
      for (let next = 0; next < queue.length; next++) {
        const id = queue[next];
        for (const neighbor of neighbors[id]) if (distances[neighbor] > distances[id] + 1) {
          distances[neighbor] = distances[id] + 1; queue.push(neighbor);
        }
      }
      const surface = smoothHeadSurface({
        positions, triangles, parts: positions.map(() => 'ear'), uv: positions.map(() => [0, 0]),
        skinFade: distances.map((distance) => THREE.MathUtils.smoothstep(distance, 0, 6)), faceTriangleCount: 0,
      }, 1);
      const refinedNeighbors = surface.positions.map(() => new Set<number>());
      for (const [a, b, c] of surface.triangles) {
        refinedNeighbors[a].add(b).add(c); refinedNeighbors[b].add(a).add(c); refinedNeighbors[c].add(a).add(b);
      }
      return { positions: surface.positions, triangles: surface.triangles, rootWeights: surface.skinFade,
        neighbors: refinedNeighbors.map((adjacent) => [...adjacent]) };
    } finally {
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      });
    }
  })().catch((error) => { pending = undefined; throw error; });
  return pending;
}
