export const upperLipRim = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308];
export const lowerLipRim = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308];
const innerLip = new Set([...upperLipRim, ...lowerLipRim]);

/** Canonical includes a filled mouth. Leave this aperture open in the display
 * and atlas cages so expression targets separate the lips without stretching
 * a skin sheet across the opening. Fitter/template indices stay unchanged. */
export function mouthSurfaceTriangles(triangles: [number, number, number][]) {
  return triangles.filter((triangle) => !triangle.every((id) => innerLip.has(id)));
}
