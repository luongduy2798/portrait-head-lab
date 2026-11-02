import { clamp, deformPoint } from './shape.js';
export function srgbToLinear(value) {
    const color = clamp(value / 255, 0, 1);
    return color <= 0.04045 ? color / 12.92 : ((color + 0.055) / 1.055) ** 2.4;
}
export function linearToSrgb(value) {
    const color = clamp(value, 0, 1);
    return 255 * (color <= 0.0031308 ? color * 12.92 : 1.055 * color ** (1 / 2.4) - 0.055);
}
/** Use the detected diffuse tone over unseen skin. Nearby clean samples add
 * modest variation; a forehead highlight must not colour the whole skull. */
export function createSkinField(skin, samples, params) {
    const base = skin.map(srgbToLinear);
    const light = (color) => color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
    const baseLight = Math.max(1e-6, light(base));
    const spatialSamples = samples.map((sample) => ({
        region: sample.region,
        position: deformPoint(sample.position, 'face', params),
        color: sample.color.map(srgbToLinear),
    })).filter((sample) => light(sample.color) >= baseLight * 0.45 && light(sample.color) <= baseLight * 1.65);
    const averageColor = (regionSamples) => {
        if (!regionSamples.length)
            return [...base];
        return [0, 1, 2].map((channel) => regionSamples.reduce((sum, sample) => sum + sample.color[channel], 0) / regionSamples.length);
    };
    const leftSamples = spatialSamples.filter((sample) => sample.region === 'left-cheek' || sample.region === 'left-temple');
    const rightSamples = spatialSamples.filter((sample) => sample.region === 'right-cheek' || sample.region === 'right-temple');
    const foreheadSamples = spatialSamples.filter((sample) => sample.region === 'forehead');
    const jawSamples = spatialSamples.filter((sample) => sample.region === 'jaw');
    const leftColor = averageColor(leftSamples), rightColor = averageColor(rightSamples);
    const foreheadColor = averageColor(foreheadSamples), jawColor = averageColor(jawSamples);
    const faceHalfWidth = Math.max(7.7, ...spatialSamples.map((sample) => Math.abs(sample.position[0])));
    const foreheadY = foreheadSamples.length
        ? foreheadSamples.reduce((sum, sample) => sum + sample.position[1], 0) / foreheadSamples.length
        : 7;
    const jawY = jawSamples.length
        ? jawSamples.reduce((sum, sample) => sum + sample.position[1], 0) / jawSamples.length
        : -8;
    const smoothstep = (value) => {
        const t = clamp(value, 0, 1);
        return t * t * (3 - 2 * t);
    };
    return (point) => {
        if (!spatialSamples.length)
            return [...base];
        // Continue the five observed face regions across unseen skin. Keep these
        // broad colour shifts restrained so source-photo lighting is not painted
        // onto the whole head, while the crown and neck no longer stay flat.
        const sideMix = smoothstep(0.5 + point[0] / (faceHalfWidth * 2));
        const sideColor = leftColor.map((value, channel) => value * (1 - sideMix) + rightColor[channel] * sideMix);
        // Side samples can contain camera-light falloff. Keep their influence low
        // so they add subtle pigment variation without painting the shadow onto
        // the generated cheek, ear, skull or neck.
        let regional = base.map((value, channel) => value * 0.88 + sideColor[channel] * 0.12);
        const crownMix = smoothstep((point[1] - foreheadY - 0.3) / (faceHalfWidth * 0.55)) * 0.55;
        regional = regional.map((value, channel) => value * (1 - crownMix) + foreheadColor[channel] * crownMix);
        const neckMix = smoothstep((-point[1] + jawY - 0.3) / (faceHalfWidth * 0.55)) * 0.35;
        regional = regional.map((value, channel) => value * (1 - neckMix) + jawColor[channel] * neckMix);
        const weighted = [0, 0, 0];
        let totalWeight = 0, nearest = Infinity;
        for (const sample of spatialSamples) {
            const distanceSquared = point.reduce((sum, value, axis) => sum + (value - sample.position[axis]) ** 2, 0);
            nearest = Math.min(nearest, distanceSquared);
            const weight = 1 / (distanceSquared + 4) ** 2;
            totalWeight += weight;
            for (let channel = 0; channel < 3; channel++)
                weighted[channel] += sample.color[channel] * weight;
        }
        const local = 0.12 * Math.exp(-nearest / 16);
        return weighted.map((value, channel) => regional[channel] * (1 - local) + value / totalWeight * local);
    };
}
