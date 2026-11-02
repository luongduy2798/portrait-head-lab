/// <reference lib="webworker" />
import { fitHead } from '../core/fitter.js';
import { buildTexture } from '../core/texture.js';
import { sampleSkinColor } from '../core/appearance.js';
import type { Analysis, Anchor, GenerationOptions, HeadTemplate, Point3, SkinSample } from '../core/types.js';

self.onmessage = ({ data }: MessageEvent<{ template: HeadTemplate; anchors: Anchor[]; analysis: Analysis; pixels: Uint8ClampedArray; width: number; height: number; options: GenerationOptions }>) => {
  try {
    const { template, anchors, analysis, pixels, width, height, options } = data;
    self.postMessage({ type: 'progress', phase: 'fitting', progress: 0.45 });
    const fitStarted = performance.now();
    const fit = fitHead(template, anchors, analysis, options);
    const fittingTime = performance.now() - fitStarted;
    self.postMessage({ type: 'progress', phase: 'texturing', progress: 0.60 });
    const colorStarted = performance.now();
    const appearance = sampleSkinColor(analysis, pixels, width, height);
    const colorTime = performance.now() - colorStarted;
    if (appearance.warning) fit.warnings.push(appearance.warning);
    self.postMessage({ type: 'progress', phase: 'texturing', progress: 0.65 });
    const textureStarted = performance.now();
    let texture: { atlas: Uint8ClampedArray | null; atlasSize: number; scalpSkinMap: Float32Array | null; scalpSkinMapSize: number; rearSkinMap: Float32Array | null; rearSkinMapSize: number; projectedCoverage: number; skinColor: Point3; skinDarkColor: Point3; skinLightColor: Point3; skinSamples: SkinSample[] } = {
      atlas: null, atlasSize: 1024, scalpSkinMap: null, scalpSkinMapSize: 512, rearSkinMap: null, rearSkinMapSize: 512, projectedCoverage: 0,
      skinColor: [...appearance.color], skinDarkColor: [...appearance.color], skinLightColor: [...appearance.color], skinSamples: [],
    };
    try { texture = buildTexture(template, fit, analysis, pixels, width, height); }
    catch { fit.warnings.push('Không tạo được texture từ ảnh. Đang hiển thị hình học với màu da ước lượng; chi tiết mắt/môi từ ảnh chưa được giữ.'); }
    const transfer: Transferable[] = [];
    if (texture.atlas) transfer.push(texture.atlas.buffer);
    if (texture.scalpSkinMap) transfer.push(texture.scalpSkinMap.buffer);
    if (texture.rearSkinMap) transfer.push(texture.rearSkinMap.buffer);
    self.postMessage({ type: 'result', result: { ...texture, fit, timings: { ...analysis.timings, fit: fittingTime, color: colorTime, texture: performance.now() - textureStarted } } }, { transfer });
  } catch {
    self.postMessage({ type: 'error', code: 'generation' });
  }
};
