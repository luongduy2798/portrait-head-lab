import type { HeadPart, Point2, Point3 } from './types';

export interface HeadSurface {
  positions: Point3[];
  parts: HeadPart[];
  uv: Point2[];
  triangles: [number, number, number][];
  skinFade: number[];
  faceTriangleCount: number;
  photoPoints?: Point2[];
}

/** Refine geometry and photo correspondence with the same Loop weights.
 * UVs only subdivide the atlas domain; smoothing photo coordinates removes
 * the affine breaks that would otherwise bend glasses at cage edges. */
export function smoothHeadSurface(head: HeadSurface, passes = 3): HeadSurface {
  let surface = head;
  const edgeKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;

  for (let pass = 0; pass < passes; pass++) {
    const neighbors = surface.positions.map(() => new Set<number>());
    const edges = new Map<string, { a: number; b: number; opposite: number[]; vertex: number }>();
    for (const triangle of surface.triangles) for (let corner = 0; corner < 3; corner++) {
      const a = triangle[corner], b = triangle[(corner + 1) % 3], opposite = triangle[(corner + 2) % 3];
      neighbors[a].add(b); neighbors[b].add(a);
      const key = edgeKey(a, b);
      const edge = edges.get(key);
      if (edge) edge.opposite.push(opposite);
      else edges.set(key, { a, b, opposite: [opposite], vertex: -1 });
    }
    const openNeighbors = surface.positions.map(() => [] as number[]);
    for (const { a, b, opposite } of edges.values()) if (opposite.length === 1) {
      openNeighbors[a].push(b); openNeighbors[b].push(a);
    }

    const smoothVertex = <T extends Point2 | Point3>(values: T[], index: number): T => {
      const point = values[index];
      if (neighbors[index].size < 2) return [...point] as T;
      const open = openNeighbors[index];
      const adjacent = open.length === 2 ? open : [...neighbors[index]];
      const count = adjacent.length;
      const beta = open.length === 2 ? 1 / 8 : (5 / 8 - (3 / 8 + Math.cos(2 * Math.PI / count) / 4) ** 2) / count;
      return point.map((value, axis) => {
        let total = 0;
        for (const id of adjacent) total += values[id][axis];
        return value * (1 - count * beta) + total * beta;
      }) as T;
    };
    const positions = surface.positions.map((_, index) => smoothVertex(surface.positions, index));
    const sourcePhotoPoints = surface.photoPoints;
    const photoPoints = sourcePhotoPoints?.map((_, index) => smoothVertex(sourcePhotoPoints, index));
    const parts = [...surface.parts], uv = [...surface.uv], skinFade = [...surface.skinFade];
    for (const edge of edges.values()) {
      const { a, b, opposite } = edge;
      const smoothEdge = <T extends Point2 | Point3>(values: T[]): T => values[a].map((value, axis) => {
        if (opposite.length !== 2) return (value + values[b][axis]) * 0.5;
        return 0.375 * (value + values[b][axis])
          + 0.125 * (values[opposite[0]][axis] + values[opposite[1]][axis]);
      }) as T;
      edge.vertex = positions.length;
      positions.push(smoothEdge(surface.positions));
      if (photoPoints && sourcePhotoPoints) photoPoints.push(smoothEdge(sourcePhotoPoints));
      parts.push(surface.parts[a] === surface.parts[b] ? surface.parts[a] : 'bridge');
      uv.push([(surface.uv[a][0] + surface.uv[b][0]) * 0.5, (surface.uv[a][1] + surface.uv[b][1]) * 0.5]);
      skinFade.push((surface.skinFade[a] + surface.skinFade[b]) * 0.5);
    }
    const triangles: [number, number, number][] = [];
    for (const [a, b, c] of surface.triangles) {
      const ab = edges.get(edgeKey(a, b))!.vertex;
      const bc = edges.get(edgeKey(b, c))!.vertex;
      const ca = edges.get(edgeKey(c, a))!.vertex;
      triangles.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    surface = { positions, parts, uv, triangles, skinFade, photoPoints, faceTriangleCount: surface.faceTriangleCount * 4 };
  }
  return surface;
}
