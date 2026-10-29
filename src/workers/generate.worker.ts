/// <reference lib="webworker" />
import { fitHead } from '../core/fitter';
import { buildTexture } from '../core/texture';
import { sampleSkinColor } from '../core/appearance';
import type { Analysis, Anchor, GenerationOptions, HeadTemplate, Point3, SkinSample } from '../core/types';

self.onmessage = ({ data }: MessageEvent<{ template: HeadTemplate; anchors: Anchor[]; analysis: Analysis; pixels: Uint8ClampedArray; width: number; height: number; options: GenerationOptions }>) => {
  try {
    const { template, anchors, analysis, pixels, width, height, options } = data;
    self.postMessage({ type: 'progress', phase: 'Đang khớp hình dáng khuôn mặt…', progress: 0.52 });
    const fitStarted = performance.now();
    const fit = fitHead(template, anchors, analysis, options);
    const fittingTime = performance.now() - fitStarted;
    self.postMessage({ type: 'progress', phase: 'Đang lấy màu da từ vùng mặt rõ…', progress: 0.72 });
    const colorStarted = performance.now();
    const appearance = sampleSkinColor(analysis, pixels, width, height);
    const colorTime = performance.now() - colorStarted;
    if (appearance.warning) fit.warnings.push(appearance.warning);
    self.postMessage({ type: 'progress', phase: 'Đang hoàn thiện đầu và ảnh đối chiếu…', progress: 0.82 });
    const textureStarted = performance.now();
    let texture: { atlas: Uint8ClampedArray | null; atlasSize: number; scalpSkinMap: Float32Array | null; scalpSkinMapSize: number; rearSkinMap: Float32Array | null; rearSkinMapSize: number; projectedCoverage: number; skinDarkColor: Point3; skinLightColor: Point3; skinSamples: SkinSample[] } = {
      atlas: null, atlasSize: 1024, scalpSkinMap: null, scalpSkinMapSize: 512, rearSkinMap: null, rearSkinMapSize: 512, projectedCoverage: 0,
      skinDarkColor: [...appearance.color], skinLightColor: [...appearance.color], skinSamples: [],
    };
    try { texture = buildTexture(template, fit, analysis, pixels, width, height); }
    catch { fit.warnings.push('Không tạo được bản chiếu ảnh cũ để đối chiếu. Đầu dựng hình và màu da vẫn sử dụng được.'); }
    const transfer: Transferable[] = [];
    if (texture.atlas) transfer.push(texture.atlas.buffer);
    if (texture.scalpSkinMap) transfer.push(texture.scalpSkinMap.buffer);
    if (texture.rearSkinMap) transfer.push(texture.rearSkinMap.buffer);
    self.postMessage({ type: 'result', result: { ...texture, skinColor: appearance.color, fit, timings: { ...analysis.timings, fit: fittingTime, color: colorTime, texture: performance.now() - textureStarted } } }, { transfer });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Không thể dựng đầu 3D.' });
  }
};
