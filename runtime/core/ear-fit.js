import { clamp } from './shape.js';
/** Measure only the visible skin silhouette outside the face. The detector
 * has no ear landmarks: these ratios cannot describe the helix or hidden ear. */
export function measureVisibleEars(analysis, template, camera) {
    const { maskWidth: width, maskHeight: height, landmarks, skin, bodySkin, hair, accessories } = analysis;
    if (width < 2 || height < 2 || skin.length < width * height || Math.abs(camera.ry) > 0.3 || Math.abs(camera.rx) > 0.3)
        return;
    const points = landmarks.map(([x, y]) => [x * width, y * height]);
    const roll = Math.atan2(points[263][1] - points[33][1], points[263][0] - points[33][0]);
    const cosine = Math.cos(roll), sine = Math.sin(roll);
    const local = points.map(([x, y]) => [x * cosine + y * sine, -x * sine + y * cosine]);
    const top = local[10][1], faceHeight = local[152][1] - top;
    const faceWidth = local[454][0] - local[234][0];
    if (faceWidth < 80 || faceHeight < 100)
        return;
    const outline = template.boundary.map((id) => local[id]);
    const sample = (mask, x, y) => mask?.[Math.round(y) * width + Math.round(x)] ?? 0;
    const edgeAt = (y, side) => {
        const crossings = [];
        for (let index = 0; index < outline.length; index++) {
            const a = outline[index], b = outline[(index + 1) % outline.length];
            if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y))
                crossings.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]));
        }
        return crossings.length < 2 ? undefined : side < 0 ? Math.min(...crossings) : Math.max(...crossings);
    };
    const ears = {};
    for (const side of [-1, 1]) {
        const rows = [];
        const step = 1 / 120;
        for (let fraction = 0.18; fraction <= 0.76; fraction += step) {
            const y = top + faceHeight * fraction, edge = edgeAt(y, side);
            let extent = 0, gap = 0, clipped = false;
            if (edge === undefined) {
                rows.push({ fraction, extent: 0, clipped: true });
                continue;
            }
            for (let distance = 1; distance <= faceWidth * 0.22; distance++) {
                const x = edge + side * distance;
                const imageX = x * cosine - y * sine, imageY = x * sine + y * cosine;
                if (imageX < 2 || imageX >= width - 2 || imageY < 2 || imageY >= height - 2) {
                    clipped = true;
                    break;
                }
                const confidence = Math.max(sample(skin, imageX, imageY), sample(bodySkin, imageX, imageY));
                if (confidence > 0.42 && sample(hair, imageX, imageY) < 0.3 && sample(accessories, imageX, imageY) < 0.3) {
                    extent = distance / faceWidth;
                    gap = 0;
                }
                else if (++gap > faceWidth * 0.015)
                    break;
            }
            rows.push({ fraction, extent, clipped });
        }
        // A compact protrusion with a top and bottom, not an unbounded temple,
        // neck, crop edge or isolated segmentation pixel. Bridge at most one row.
        const supported = rows.map((row) => row.extent >= 0.018 && !row.clipped);
        const runs = [];
        let run = [];
        for (let index = 0; index < rows.length; index++) {
            if (!rows[index].clipped && (supported[index] || (supported[index - 1] && supported[index + 1])))
                run.push(index);
            else if (run.length) {
                runs.push(run);
                run = [];
            }
        }
        if (run.length)
            runs.push(run);
        let best, bestArea = 0;
        for (const indices of runs) {
            const first = indices[0], last = indices[indices.length - 1];
            const span = (last - first + 1) * step;
            const center = (rows[first].fraction + rows[last].fraction) * 0.5;
            if (first === 0 || last === rows.length - 1 || span < 0.14 || span > 0.44 || center < 0.32 || center > 0.62)
                continue;
            if (rows[first - 1].clipped || rows[last + 1].clipped)
                continue;
            const extents = indices.map((index) => rows[index].extent).sort((a, b) => a - b);
            const outset = extents[Math.floor((extents.length - 1) * 0.9)];
            if (outset < 0.03 || outset > 0.18)
                continue;
            const area = extents.reduce((sum, value) => sum + value, 0);
            if (area <= bestArea)
                continue;
            bestArea = area;
            const pose = 1 - Math.max(Math.abs(camera.ry), Math.abs(camera.rx)) / 0.4;
            best = {
                centerFromForehead: center, heightToFace: span, outsetToFace: outset,
                confidence: clamp(0.8 * pose * Math.min(1, outset / 0.05), 0.2, 0.8),
            };
        }
        // Left/right follow the unmirrored image and the head's -X/+X names.
        if (best)
            ears[side < 0 ? 'left' : 'right'] = best;
    }
    return ears.left || ears.right ? ears : undefined;
}
