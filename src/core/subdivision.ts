import type { HeadPart, Point2, Point3 } from './types';

export interface HeadSurface {
  mouthRim?: number[];
  positions: Point3[];
  parts: HeadPart[];
  uv: Point2[];
  triangles: [number, number, number][];
  skinFade: number[];
  faceTriangleCount: number;
  photoPoints?: Point2[];
}

export interface SubdividedHeadFields {
  surface: HeadSurface;
  fields: Point3[][];
}

/** Refine geometry and photo correspondence with the same Loop weights.
 * UVs only subdivide the atlas domain; smoothing photo coordinates removes
 * the affine breaks that would otherwise bend glasses at cage edges. */
export function smoothHeadSurface(head: HeadSurface, passes = 3): HeadSurface {
  return smoothHeadSurfaceFields(head, [], passes).surface;
}

/** Subdivide several displacement fields together so they share the same
 * expensive edge/neighbor topology instead of rebuilding it for each morph. */
export function smoothHeadSurfaceFields(head: HeadSurface, fields: Point3[][], passes = 3): SubdividedHeadFields {
  let surface = head;
  let subdividedFields = fields;
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
    let nextVertex = surface.positions.length;
    for (const edge of edges.values()) edge.vertex = nextVertex++;
    const subdivideValues = <T extends Point2 | Point3>(values: T[]): T[] => {
      const result = values.map((_, index) => smoothVertex(values, index));
      for (const { a, b, opposite } of edges.values()) {
        const smoothEdge = values[a].map((value, axis) => {
          if (opposite.length !== 2) return (value + values[b][axis]) * 0.5;
          return 0.375 * (value + values[b][axis])
            + 0.125 * (values[opposite[0]][axis] + values[opposite[1]][axis]);
        }) as T;
        result.push(smoothEdge);
      }
      return result;
    };
    const positions = subdivideValues(surface.positions);
    subdividedFields = subdividedFields.map(subdivideValues);
    const photoPoints = surface.photoPoints ? subdivideValues(surface.photoPoints) : undefined;
    const parts = [...surface.parts], uv = [...surface.uv], skinFade = [...surface.skinFade];
    for (const { a, b } of edges.values()) {
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
    const mouthRim = surface.mouthRim?.flatMap((id, i, rim) => [id, edges.get(edgeKey(id, rim[(i + 1) % rim.length]))!.vertex]);
    surface = { positions, parts, uv, triangles, skinFade, photoPoints, mouthRim, faceTriangleCount: surface.faceTriangleCount * 4 };
  }
  return { surface, fields: subdividedFields };
}
