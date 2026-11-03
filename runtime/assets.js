import config from '../portrait-head.config.js';
import { preparedAssetInfo } from './prepared-assets.js';
import { HeadError } from './errors.js';
const assets = new Map();
let simdSupport;
/** CDN files become verified Blob URLs before being passed to browser workers. */
export function headAssetURL(options, path) {
    const base = (options.assetBaseUrl ?? config.assetBaseUrl).trim();
    const key = `${base}\n${path}`;
    let pending = assets.get(key);
    if (!pending) {
        pending = (async () => {
            const asset = preparedAssetInfo(path);
            if (!base)
                throw new HeadError('assets');
            const response = await fetch(new URL(path, base.replace(/\/?$/, '/')), { cache: 'force-cache' });
            if (!response.ok)
                throw new HeadError('assets');
            const bytes = new Uint8Array(await response.arrayBuffer());
            const digest = await crypto.subtle.digest('SHA-256', bytes.buffer);
            const sha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
            if (bytes.byteLength !== asset.bytes || sha256 !== asset.sha256)
                throw new HeadError('assets');
            return URL.createObjectURL(new Blob([bytes.buffer], { type: asset.mime }));
        })().catch(() => { assets.delete(key); throw new HeadError('assets'); });
        assets.set(key, pending);
    }
    return pending;
}
export async function headWorkerAssets(options) {
    // The same SIMD probe used by the pinned MediaPipe 0.10.35 FilesetResolver.
    simdSupport ??= WebAssembly.instantiate(new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
        10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
    ])).then(() => true, () => false);
    const runtime = await simdSupport ? 'vision_wasm_internal' : 'vision_wasm_nosimd_internal';
    const [bundle, landmarker, segmenter, loader, binary] = await Promise.all([
        headAssetURL(options, 'runtime/vision_bundle.js'),
        headAssetURL(options, 'face_landmarker.task'),
        headAssetURL(options, 'selfie_multiclass.tflite'),
        headAssetURL(options, `runtime/${runtime}.js`),
        headAssetURL(options, `runtime/${runtime}.wasm`),
    ]);
    return {
        bundle, landmarker, segmenter,
        files: { wasmLoaderPath: loader, wasmBinaryPath: binary },
    };
}
/** A session can stop waiting without aborting another session's shared assets. */
export function waitForHeadAssets(pending, signal) {
    if (!signal)
        return pending;
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const abort = () => {
            signal.removeEventListener('abort', abort);
            reject(new DOMException('Aborted', 'AbortError'));
        };
        signal.addEventListener('abort', abort, { once: true });
        pending.then((value) => { signal.removeEventListener('abort', abort); resolve(value); }, (error) => { signal.removeEventListener('abort', abort); reject(error); });
    });
}
