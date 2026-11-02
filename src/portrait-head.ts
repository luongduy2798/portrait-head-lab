import * as THREE from 'three';
import type { HeadAssetOptions } from './assets.js';
import { HeadPipeline, loadTemplate, type Progress } from './core/pipeline.js';
import { loadEarTemplate } from './core/ears.js';
import { loadExpressionRig } from './core/expression-rig.js';
import { createHead, disposeObject } from './core/mesh.js';
import type { Point3 } from './core/types.js';
import { isPortraitHeadData, portraitHeadData, type PortraitHeadData } from './data.js';
import { HeadError } from './errors.js';

export interface PortraitHead {
  data: PortraitHeadData;
  root: THREE.Group;
  neutral: THREE.BufferGeometry;
  landmarks: Point3[];
  neckIndices: number[];
  skinColor: number[];
  dispose(): void;
}

export interface PortraitHeadOptions extends HeadAssetOptions {
  /** A body adapter can request an open neck; standalone heads stay closed. */
  openNeck?: boolean;
}

export interface PortraitHeadGenerateOptions {
  signal?: AbortSignal;
  onProgress?: (progress: Progress) => void;
  crop?: 'auto' | 'none';
  occludedEyes?: boolean;
}

export interface PortraitHeadRestoreOptions extends PortraitHeadOptions {
  signal?: AbortSignal;
}

/** Rebuild a saved face using the same library-owned model/data contract. */
export async function restorePortraitHead(data: PortraitHeadData, options: PortraitHeadRestoreOptions = {}): Promise<PortraitHead> {
  const signal = options.signal;
  signal?.throwIfAborted();
  if (!isPortraitHeadData(data)) throw new HeadError('faceUnavailable');
  let loaded: [Awaited<ReturnType<typeof loadEarTemplate>>, Awaited<ReturnType<typeof loadExpressionRig>>, Awaited<ReturnType<typeof loadTemplate>>];
  try {
    loaded = await Promise.all([
      loadEarTemplate(options, signal), loadExpressionRig(options, signal), loadTemplate(options, signal),
    ]);
  } catch {
    signal?.throwIfAborted();
    throw new HeadError('assets');
  }
  signal?.throwIfAborted();
  const [ears, rig, { template }] = loaded;
  const result = {
    ...data.appearance,
    fit: {
      params: data.params, measurements: data.measurements, camera: data.camera,
      expression: {}, projected: [], normalizedError: 0, iterations: 0, landmarkWeights: [], warnings: [],
    },
    timings: {},
  };
  const captured: { value?: Pick<PortraitHead, 'neutral' | 'landmarks' | 'neckIndices'> } = {};
  let root: THREE.Group | undefined;
  try {
    root = createHead(template, ears, rig, result, result.fit.params, 'natural', 0.5, false, {
      openNeck: options.openNeck ?? false,
      onNeutralSurface(geometry, surface) {
        const position = geometry.getAttribute('position');
        captured.value = {
          neutral: geometry.clone(), neckIndices: surface.neckRim ?? [],
          landmarks: Array.from({ length: 468 }, (_, id): Point3 => [position.getX(id), position.getY(id), position.getZ(id)]),
        };
      },
    });
    signal?.throwIfAborted();
    const neutral = captured.value;
    if (!neutral || (options.openNeck && neutral.neckIndices.length < 3)) throw new HeadError('generation');
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.userData = { ...material.userData };
        for (const key of ['photoAtlas', 'photoTexture', 'skinProjectionTexture', 'rearSkinTexture']) delete material.userData[key];
      }
    });
    const ownedRoot = root;
    let disposed = false;
    return {
      data, root, ...neutral,
      skinColor: new THREE.Color().setRGB(result.skinColor[0] / 255, result.skinColor[1] / 255, result.skinColor[2] / 255, THREE.SRGBColorSpace).toArray(),
      dispose() {
        if (disposed) return;
        disposed = true;
        disposeObject(ownedRoot); neutral.neutral.dispose();
      },
    };
  } catch (error) {
    if (root) disposeObject(root);
    captured.value?.neutral.dispose();
    throw error;
  }
}

/** Complete SDK session: assets, analysis, fitting, mesh creation and restore. */
export class PortraitHeadPipeline {
  private readonly pipeline: HeadPipeline;
  private readonly options: PortraitHeadOptions;
  private active?: AbortController;

  constructor(options: PortraitHeadOptions = {}) {
    this.options = { ...options };
    this.pipeline = new HeadPipeline(this.options);
  }

  generate(source: File | HTMLCanvasElement, options: PortraitHeadGenerateOptions = {}): Promise<PortraitHead> {
    return this.run(options.signal, async (signal) => {
      const { result } = await this.pipeline.generate(source, options.onProgress ?? (() => {}), {
        signal, crop: options.crop, occludedEyes: options.occludedEyes ?? false,
      });
      signal.throwIfAborted();
      return restorePortraitHead(portraitHeadData(result), { ...this.options, signal });
    });
  }

  restore(data: PortraitHeadData, options: { signal?: AbortSignal } = {}): Promise<PortraitHead> {
    return this.run(options.signal, (signal) => restorePortraitHead(data, { ...this.options, signal }));
  }

  private async run(signal: AbortSignal | undefined, operation: (signal: AbortSignal) => Promise<PortraitHead>): Promise<PortraitHead> {
    signal?.throwIfAborted();
    if (this.active) throw new HeadError('generation');
    const controller = new AbortController();
    this.active = controller;
    const abort = () => { if (this.active === controller) this.cancel(); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const head = await operation(controller.signal);
      if (controller.signal.aborted) { head.dispose(); controller.signal.throwIfAborted(); }
      return head;
    }
    finally {
      signal?.removeEventListener('abort', abort);
      if (this.active === controller) this.active = undefined;
    }
  }

  cancel() {
    this.active?.abort(); this.active = undefined;
    this.pipeline.cancel();
  }
  dispose() { this.cancel(); }
}
