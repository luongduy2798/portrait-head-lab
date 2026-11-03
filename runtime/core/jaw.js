import { clamp } from './shape.js';
/** A narrow atlas apron for the first row behind the observed jaw. It shares
 * the facial UV edge; the outer edge fades to generated skin, not to backdrop. */
export function jawTransition(template, positions) {
    const boundary = template.boundary;
    const center = boundary.reduce((sum, id) => [sum[0] + template.uv[id][0] / boundary.length,
        sum[1] + template.uv[id][1] / boundary.length], [0, 0]);
    const outerUv = boundary.map((id, index) => {
        const a = template.uv[boundary[(index + boundary.length - 1) % boundary.length]];
        const b = template.uv[boundary[(index + 1) % boundary.length]];
        const uv = template.uv[id];
        let nx = b[1] - a[1], ny = a[0] - b[0];
        if (nx * (uv[0] - center[0]) + ny * (uv[1] - center[1]) < 0) {
            nx *= -1;
            ny *= -1;
        }
        const length = Math.max(1e-6, Math.hypot(nx, ny));
        return [clamp(uv[0] + nx / length * 0.022, 0.001, 0.999), clamp(uv[1] + ny / length * 0.022, 0.001, 0.999)];
    });
    const top = positions[2][1], span = Math.max(1, (top - positions[152][1]) * 0.25);
    const weights = boundary.map((id) => {
        const t = clamp((top - positions[id][1]) / span, 0, 1);
        return t * t * (3 - 2 * t);
    });
    return { outerUv, weights };
}
