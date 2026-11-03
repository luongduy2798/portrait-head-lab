/** Exact lateral intersection with the rendered neutral head. A YZ grid
 * limits triangle candidates without approximating their positions or normals.
 * Units are canonical centimetres, like HeadSurface and the ear template. */
export function createSideSurfaceSampler(surface, normals) {
    const { positions, triangles } = surface;
    let minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [, y, z] of positions) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
    }
    const cell = 0.6;
    const rows = Math.ceil((maxY - minY) / cell) + 1;
    const columns = Math.ceil((maxZ - minZ) / cell) + 1;
    const bins = Array.from({ length: rows * columns }, () => []);
    const rowAt = (y) => Math.max(0, Math.min(rows - 1, Math.floor((y - minY) / cell)));
    const columnAt = (z) => Math.max(0, Math.min(columns - 1, Math.floor((z - minZ) / cell)));
    triangles.forEach((indices, id) => {
        const a = positions[indices[0]], b = positions[indices[1]], c = positions[indices[2]];
        const fromY = rowAt(Math.min(a[1], b[1], c[1]));
        const toY = rowAt(Math.max(a[1], b[1], c[1]));
        const fromZ = columnAt(Math.min(a[2], b[2], c[2]));
        const toZ = columnAt(Math.max(a[2], b[2], c[2]));
        for (let row = fromY; row <= toY; row++)
            for (let column = fromZ; column <= toZ; column++)
                bins[row * columns + column].push(id);
    });
    return (side, y, z) => {
        if (y < minY || y > maxY || z < minZ || z > maxZ)
            return;
        let outside = -Infinity, result;
        for (const id of bins[rowAt(y) * columns + columnAt(z)]) {
            const indices = triangles[id];
            const a = positions[indices[0]], b = positions[indices[1]], c = positions[indices[2]];
            const denominator = (b[2] - c[2]) * (a[1] - c[1]) + (c[1] - b[1]) * (a[2] - c[2]);
            if (Math.abs(denominator) < 1e-12)
                continue;
            const wa = ((b[2] - c[2]) * (y - c[1]) + (c[1] - b[1]) * (z - c[2])) / denominator;
            const wb = ((c[2] - a[2]) * (y - c[1]) + (a[1] - c[1]) * (z - c[2])) / denominator;
            const wc = 1 - wa - wb;
            if (Math.min(wa, wb, wc) < -1e-7)
                continue;
            const x = a[0] * wa + b[0] * wb + c[0] * wc;
            if (side * x <= outside || side * x < 0)
                continue;
            outside = side * x;
            const normal = [0, 0, 0];
            for (const [corner, weight] of [wa, wb, wc].entries()) {
                const vertex = indices[corner];
                normal[0] += normals.getX(vertex) * weight;
                normal[1] += normals.getY(vertex) * weight;
                normal[2] += normals.getZ(vertex) * weight;
            }
            const length = Math.hypot(...normal);
            result = { point: [x, y, z], normal: length > 1e-8 ? normal.map((value) => value / length) : [side, 0, 0] };
        }
        return result;
    };
}
