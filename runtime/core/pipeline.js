import { headAssetURL, headWorkerAssets, waitForHeadAssets } from '../assets.js';
import { HeadError, isHeadErrorCode } from '../errors.js';
import analysisWorkerSource from '../../runtime/workers/analysis-source.js';
import generationWorkerSource from '../../runtime/workers/generation-source.js';
const cachedAssets = new Map();
const isNumericTuple = (value, size) => Array.isArray(value) && value.length === size && value.every((item) => typeof item === 'number' && Number.isFinite(item));
const hasValidIndices = (values, limit) => Array.isArray(values) && values.every((value) => Number.isInteger(value) && value >= 0 && value < limit);
async function loadJSON(path) {
    try {
        const response = await fetch(path, { cache: 'force-cache' });
        if (!response.ok)
            throw new HeadError('assets');
        return await response.json();
    }
    catch {
        throw new HeadError('assets');
    }
}
export async function loadTemplate(options = {}, signal) {
    signal?.throwIfAborted();
    const templateUrl = await waitForHeadAssets(headAssetURL(options, 'head-template.json'), signal);
    let pending = cachedAssets.get(templateUrl);
    if (!pending) {
        pending = (async () => {
            const [template, map] = await Promise.all([
                loadJSON(templateUrl), headAssetURL(options, 'landmark-anchors.json').then(loadJSON),
            ]);
            if (!template || typeof template !== 'object' || !map || typeof map !== 'object')
                throw new HeadError('assets');
            const count = Array.isArray(template.positions) ? template.positions.length : 0;
            if (template.schemaVersion !== 1 || map.schemaVersion !== 1 || template.canonicalCount !== 468 ||
                !Array.isArray(map.anchors) || map.anchors.length !== 468 || count < 468 || count > 25000 ||
                !template.positions.every((point) => isNumericTuple(point, 3)) ||
                !Array.isArray(template.parts) || template.parts.length !== count ||
                !template.parts.every((part) => typeof part === 'string' && ['face', 'cranium', 'ear', 'neck', 'bridge'].includes(part)) ||
                !Array.isArray(template.uv) || template.uv.length !== count || !template.uv.every((point) => isNumericTuple(point, 2)) ||
                !Array.isArray(template.triangles) || template.triangles.length < 898 || template.triangles.length > 50000 ||
                !template.triangles.every((triangle) => isNumericTuple(triangle, 3) && triangle.every((id) => Number.isInteger(id) && id >= 0 && id < count)) ||
                template.faceTriangleCount !== 898 || !hasValidIndices(template.boundary, count) || template.boundary.length !== 36 ||
                !map.anchors.every((anchor, index) => anchor?.landmark === index && Number.isInteger(anchor.triangle) && anchor.triangle >= 0 && anchor.triangle < 898 && isNumericTuple(anchor.weights, 3) && anchor.weights.every((weight) => weight >= -1e-4 && weight <= 1.0001) && Math.abs(anchor.weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-3))
                throw new HeadError('assets');
            return { template: template, anchors: map.anchors };
        })().catch((error) => { cachedAssets.delete(templateUrl); throw error; });
        cachedAssets.set(templateUrl, pending);
    }
    return waitForHeadAssets(pending, signal);
}
/** Each session owns its worker pair; only immutable model data is shared. */
export class HeadPipeline {
    analyzer;
    generator;
    activeReject;
    activeController;
    sequence = 0;
    busy = false;
    workerURLs = new Set();
    assets;
    constructor(options = {}) { this.assets = { ...options }; }
    async generate(source, onProgress, options = { occludedEyes: false }) {
        options.signal?.throwIfAborted();
        if (this.busy)
            throw new HeadError('generation');
        this.busy = true;
        const token = ++this.sequence;
        const controller = new AbortController();
        this.activeController = controller;
        const abort = () => { if (token === this.sequence)
            this.cancel(); };
        options.signal?.addEventListener('abort', abort, { once: true });
        const check = () => {
            controller.signal.throwIfAborted();
            if (token !== this.sequence)
                throw new DOMException('Aborted', 'AbortError');
        };
        let bitmap;
        const started = performance.now();
        try {
            const { template, anchors } = await loadTemplate(this.assets, controller.signal);
            check();
            const isFile = source instanceof File;
            try {
                bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
            }
            catch {
                check();
                throw new HeadError('invalidImage');
            }
            check();
            const ratio = isFile ? Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height)) : 1;
            if (ratio < 1) {
                const resized = await createImageBitmap(bitmap, {
                    resizeWidth: Math.max(1, Math.round(bitmap.width * ratio)),
                    resizeHeight: Math.max(1, Math.round(bitmap.height * ratio)), resizeQuality: 'high',
                });
                bitmap.close();
                bitmap = resized;
                check();
            }
            const workerAssets = await waitForHeadAssets(headWorkerAssets(this.assets), controller.signal);
            check();
            this.analyzer ??= this.createWorker(analysisWorkerSource);
            const photo = await this.request(this.analyzer, {
                bitmap, assets: workerAssets, crop: options.crop ?? (isFile ? 'auto' : 'none'),
            }, [bitmap], onProgress);
            bitmap = undefined;
            check();
            this.generator ??= this.createWorker(generationWorkerSource);
            const result = await this.request(this.generator, {
                template, anchors, ...photo, options: { occludedEyes: options.occludedEyes },
            }, [photo.pixels.buffer], onProgress);
            check();
            result.timings.total = performance.now() - started;
            result.timings.warm = result.timings.total - result.timings.initialize;
            return { result, analysis: photo.analysis, template };
        }
        finally {
            bitmap?.close();
            options.signal?.removeEventListener('abort', abort);
            if (token === this.sequence) {
                this.busy = false;
                this.activeReject = undefined;
                this.activeController = undefined;
            }
        }
    }
    createWorker(source) {
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
            const worker = new Worker(url);
            this.workerURLs.add(url);
            return worker;
        }
        catch {
            URL.revokeObjectURL(url);
            throw new HeadError('assets');
        }
    }
    request(worker, payload, transfer, onProgress) {
        return new Promise((resolve, reject) => {
            const cleanup = () => {
                worker.onmessage = null;
                worker.onerror = null;
                worker.onmessageerror = null;
                this.activeReject = undefined;
            };
            this.activeReject = (error) => { cleanup(); reject(error); };
            worker.onmessage = ({ data }) => {
                if (data.type === 'progress') {
                    onProgress(data);
                    return;
                }
                cleanup();
                if (data.type === 'error')
                    reject(new HeadError(isHeadErrorCode(data.code) ? data.code : 'generation'));
                else if (data.type === 'result')
                    resolve(data.result);
                else
                    reject(new HeadError('generation'));
            };
            worker.onerror = () => { cleanup(); reject(new HeadError('assets')); };
            worker.onmessageerror = () => { cleanup(); reject(new HeadError('generation')); };
            try {
                worker.postMessage(payload, transfer);
            }
            catch (error) {
                cleanup();
                reject(error);
            }
        });
    }
    cancel() {
        ++this.sequence;
        this.activeController?.abort();
        this.activeController = undefined;
        this.activeReject?.(new DOMException('Aborted', 'AbortError'));
        this.analyzer?.terminate();
        this.generator?.terminate();
        this.workerURLs.forEach((url) => URL.revokeObjectURL(url));
        this.workerURLs.clear();
        this.analyzer = undefined;
        this.generator = undefined;
        this.busy = false;
    }
    dispose() { this.cancel(); }
}
