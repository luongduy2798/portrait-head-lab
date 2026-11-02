import * as THREE from 'three';
import { HeadPipeline, loadTemplate } from './core/pipeline.js';
import { loadEarTemplate } from './core/ears.js';
import { loadExpressionRig } from './core/expression-rig.js';
import { createHead, disposeObject } from './core/mesh.js';
import { isPortraitHeadData, portraitHeadData } from './data.js';
import { HeadError } from './errors.js';
/** Rebuild a saved face using the same library-owned model/data contract. */
export async function restorePortraitHead(data, options = {}) {
    const signal = options.signal;
    signal?.throwIfAborted();
    if (!isPortraitHeadData(data))
        throw new HeadError('faceUnavailable');
    let loaded;
    try {
        loaded = await Promise.all([
            loadEarTemplate(options, signal), loadExpressionRig(options, signal), loadTemplate(options, signal),
        ]);
    }
    catch {
        signal?.throwIfAborted();
        throw new HeadError('assets');
    }
    signal?.throwIfAborted();
    const [ears, rig, { template }] = loaded;
    const result = {
        ...data.appearance,
        fit: {
            params: data.params, measurements: data.measurements, camera: data.camera,
            identity: data.identity,
            expression: {}, projected: [], normalizedError: 0, iterations: 0, landmarkWeights: [], warnings: [],
        },
        timings: {},
    };
    const captured = {};
    let root;
    try {
        root = createHead(template, ears, rig, result, result.fit.params, 'natural', 0.5, false, {
            openNeck: options.openNeck ?? false,
            onNeutralSurface(geometry, surface) {
                const position = geometry.getAttribute('position');
                captured.value = {
                    neutral: geometry.clone(), neckIndices: surface.neckRim ?? [],
                    landmarks: Array.from({ length: 468 }, (_, id) => [position.getX(id), position.getY(id), position.getZ(id)]),
                };
            },
        });
        signal?.throwIfAborted();
        const neutral = captured.value;
        if (!neutral || (options.openNeck && neutral.neckIndices.length < 3))
            throw new HeadError('generation');
        root.traverse((object) => {
            if (!(object instanceof THREE.Mesh))
                return;
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                material.userData = { ...material.userData };
                for (const key of ['photoAtlas', 'photoTexture', 'skinProjectionTexture', 'rearSkinTexture'])
                    delete material.userData[key];
            }
        });
        const ownedRoot = root;
        let disposed = false;
        return {
            data, root, ...neutral,
            skinColor: new THREE.Color().setRGB(result.skinColor[0] / 255, result.skinColor[1] / 255, result.skinColor[2] / 255, THREE.SRGBColorSpace).toArray(),
            dispose() {
                if (disposed)
                    return;
                disposed = true;
                disposeObject(ownedRoot);
                neutral.neutral.dispose();
            },
        };
    }
    catch (error) {
        if (root)
            disposeObject(root);
        captured.value?.neutral.dispose();
        throw error;
    }
}
/** Complete SDK session: assets, analysis, fitting, mesh creation and restore. */
export class PortraitHeadPipeline {
    pipeline;
    options;
    active;
    constructor(options = {}) {
        this.options = { ...options };
        this.pipeline = new HeadPipeline(this.options);
    }
    generate(source, options = {}) {
        return this.run(options.signal, async (signal) => {
            const { result } = await this.pipeline.generate(source, options.onProgress ?? (() => { }), {
                signal, crop: options.crop, occludedEyes: options.occludedEyes ?? false,
            });
            signal.throwIfAborted();
            return restorePortraitHead(portraitHeadData(result), { ...this.options, signal });
        });
    }
    restore(data, options = {}) {
        return this.run(options.signal, (signal) => restorePortraitHead(data, { ...this.options, signal }));
    }
    async run(signal, operation) {
        signal?.throwIfAborted();
        if (this.active)
            throw new HeadError('generation');
        const controller = new AbortController();
        this.active = controller;
        const abort = () => { if (this.active === controller)
            this.cancel(); };
        signal?.addEventListener('abort', abort, { once: true });
        try {
            const head = await operation(controller.signal);
            if (controller.signal.aborted) {
                head.dispose();
                controller.signal.throwIfAborted();
            }
            return head;
        }
        finally {
            signal?.removeEventListener('abort', abort);
            if (this.active === controller)
                this.active = undefined;
        }
    }
    cancel() {
        this.active?.abort();
        this.active = undefined;
        this.pipeline.cancel();
    }
    dispose() { this.cancel(); }
}
