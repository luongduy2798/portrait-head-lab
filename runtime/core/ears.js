import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { smoothHeadSurface } from './subdivision.js';
import { headAssetURL, waitForHeadAssets } from '../assets.js';
import { HeadError } from '../errors.js';
// The prepared FaceVerse asset is pinned regardless of its configured host.
const sourceSHA256 = '0de714251964c2db70cdf1286dc5e9f899ce1dce9d78877ba58629de4b32b93f';
const pendingAssets = new Map();
export async function loadEarTemplate(options = {}, signal) {
    signal?.throwIfAborted();
    const sourcePath = await waitForHeadAssets(headAssetURL(options, 'faceverse/faceverse-neutral.glb'), signal);
    let pending = pendingAssets.get(sourcePath);
    pending ??= (async () => {
        const response = await fetch(sourcePath, { cache: 'force-cache' });
        if (!response.ok)
            throw new Error('Không tải được asset tai FaceVerse. Kiểm tra assetBaseUrl và file trên host.');
        const bytes = await response.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const checksum = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
        if (checksum !== sourceSHA256)
            throw new Error('Checksum mesh tai FaceVerse không khớp phiên bản đã pin.');
        const { scene } = await new GLTFLoader().parseAsync(bytes, '');
        try {
            const mesh = scene.getObjectByName('FaceVerseNeutralHead');
            if (!(mesh instanceof THREE.Mesh))
                throw new Error('Mesh FaceVerse local không có surface đầu.');
            const source = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex();
            if (!index || source.count !== 19546)
                throw new Error('Topology mesh tai FaceVerse không phù hợp.');
            // Keep the ear and its attachment skin. Cut edges stay in the root patch,
            // away from the authored helix, concha and lobule.
            const selected = Array.from({ length: source.count }, (_, id) => {
                const x = source.getX(id) * 100, y = source.getY(id) * 100, z = source.getZ(id) * 100;
                return x > 6.3 && y > -3.5 && y < 7 && z > -6.5 && z < 0.5;
            });
            const positions = [], triangles = [];
            const remap = new Map();
            const vertex = (id) => {
                let mapped = remap.get(id);
                if (mapped === undefined) {
                    mapped = positions.length;
                    remap.set(id, mapped);
                    positions.push([source.getX(id) * 100, source.getY(id) * 100, source.getZ(id) * 100]);
                }
                return mapped;
            };
            for (let offset = 0; offset < index.count; offset += 3) {
                const ids = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
                if (ids.every((id) => selected[id]))
                    triangles.push(ids.map(vertex));
            }
            if (positions.length < 500 || triangles.length < 800)
                throw new Error('Vùng tai FaceVerse không đủ dữ liệu.');
            const neighbors = positions.map(() => new Set());
            const edges = new Map();
            for (const triangle of triangles)
                for (let corner = 0; corner < 3; corner++) {
                    const a = triangle[corner], b = triangle[(corner + 1) % 3];
                    neighbors[a].add(b);
                    neighbors[b].add(a);
                    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
                    const edge = edges.get(key);
                    if (edge)
                        edge.count++;
                    else
                        edges.set(key, { a, b, count: 1 });
                }
            const distances = positions.map(() => Infinity), queue = [];
            for (const { a, b, count } of edges.values())
                if (count === 1)
                    for (const id of [a, b]) {
                        if (distances[id] === 0)
                            continue;
                        distances[id] = 0;
                        queue.push(id);
                    }
            for (let next = 0; next < queue.length; next++) {
                const id = queue[next];
                for (const neighbor of neighbors[id])
                    if (distances[neighbor] > distances[id] + 1) {
                        distances[neighbor] = distances[id] + 1;
                        queue.push(neighbor);
                    }
            }
            const surface = smoothHeadSurface({
                positions, triangles, parts: positions.map(() => 'ear'), uv: positions.map(() => [0, 0]),
                skinFade: distances.map((distance) => THREE.MathUtils.smoothstep(distance, 0, 6)), faceTriangleCount: 0,
            }, 1);
            const refinedNeighbors = surface.positions.map(() => new Set());
            for (const [a, b, c] of surface.triangles) {
                refinedNeighbors[a].add(b).add(c);
                refinedNeighbors[b].add(a).add(c);
                refinedNeighbors[c].add(a).add(b);
            }
            const adjacent = refinedNeighbors.map((neighbors) => [...neighbors]);
            // Enclose the authored pinna in its lateral plane, including the low
            // concha inside the rim. Relief-only masks split its folds into islands
            // and deform alternate strips of the tragus when fitting the skin.
            const outline = surface.positions.filter(([x], id) => x > 8.5 && surface.skinFade[id] > 0.99)
                .map(([, y, z]) => [y, z]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
            const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
            const chain = (points) => {
                const hull = [];
                for (const point of points) {
                    while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0)
                        hull.pop();
                    hull.push(point);
                }
                return hull.slice(0, -1);
            };
            const hull = [...chain(outline), ...chain([...outline].reverse())];
            const pinnaWeights = surface.positions.map(([x, y, z], id) => {
                let inside = true, distance = Infinity;
                for (let edge = 0; edge < hull.length; edge++) {
                    const a = hull[edge], b = hull[(edge + 1) % hull.length];
                    if (cross(a, b, [y, z]) < -1e-8)
                        inside = false;
                    const dy = b[0] - a[0], dz = b[1] - a[1];
                    const t = THREE.MathUtils.clamp(((y - a[0]) * dy + (z - a[1]) * dz) / Math.max(1e-10, dy * dy + dz * dz), 0, 1);
                    distance = Math.min(distance, Math.hypot(y - a[0] - t * dy, z - a[1] - t * dz));
                }
                return surface.skinFade[id] * THREE.MathUtils.smoothstep(x, 7.5, 7.95)
                    * (inside ? 1 : 1 - THREE.MathUtils.smoothstep(distance, 0.05, 0.35));
            });
            return { positions: surface.positions, triangles: surface.triangles, rootWeights: surface.skinFade,
                neighbors: adjacent, pinnaWeights };
        }
        finally {
            scene.traverse((object) => {
                if (!(object instanceof THREE.Mesh))
                    return;
                object.geometry.dispose();
                for (const material of Array.isArray(object.material) ? object.material : [object.material])
                    material.dispose();
            });
        }
    })().catch(() => { pendingAssets.delete(sourcePath); throw new HeadError('assets'); });
    pendingAssets.set(sourcePath, pending);
    return waitForHeadAssets(pending, signal);
}
