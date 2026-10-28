import type { Analysis, Anchor, GenerationOptions, HeadResult, HeadTemplate } from './types';

export interface Progress { phase: string; progress: number }
let assets: Promise<{ template: HeadTemplate; anchors: Anchor[] }> | undefined;
const isNumericTuple = (value: unknown, size: number): value is number[] =>
  Array.isArray(value) && value.length === size && value.every((item) => typeof item === 'number' && Number.isFinite(item));
const hasValidIndices = (values: unknown, limit: number) =>
  Array.isArray(values) && values.every((value) => Number.isInteger(value) && value >= 0 && value < limit);
class AssetLoadError extends Error {}

async function loadJSON(path: string) {
  let response: Response;
  try {
    response = await fetch(path, { cache: 'force-cache' });
  } catch {
    throw new AssetLoadError(`Không truy cập được asset ${path}. Kiểm tra URL, kết nối và CORS nếu dùng CDN.`);
  }
  if (!response.ok) throw new AssetLoadError(`Không tải được asset ${path} (HTTP ${response.status}). Kiểm tra URL/CDN hoặc chạy lệnh chuẩn bị asset phù hợp.`);
  return response.json();
}

function validateTemplateAssets(template: any, map: any, templateUrl: string): { template: HeadTemplate; anchors: Anchor[] } {
  const vertexCount = Array.isArray(template.positions) ? template.positions.length : 0;
  if (
    template.schemaVersion !== 1 ||
    map.schemaVersion !== 1 ||
    template.canonicalCount !== 468 ||
    !Array.isArray(map.anchors) || map.anchors.length !== 468 ||
    vertexCount < 468 || vertexCount > 25000 ||
    !Array.isArray(template.positions) || !template.positions.every((point: unknown) => isNumericTuple(point, 3)) ||
    template.parts?.length !== template.positions.length ||
    !Array.isArray(template.parts) || !template.parts.every((part: unknown) => typeof part === 'string' && ['face', 'cranium', 'ear', 'neck', 'bridge'].includes(part)) ||
    !Array.isArray(template.uv) || template.uv.length !== vertexCount || !template.uv.every((point: unknown) => isNumericTuple(point, 2)) ||
    !Array.isArray(template.triangles) || template.triangles.length < 898 || template.triangles.length > 50000 ||
    !template.triangles.every((triangle: unknown) => isNumericTuple(triangle, 3) && triangle.every((id) => Number.isInteger(id) && id >= 0 && id < vertexCount)) ||
    template.faceTriangleCount !== 898 ||
    !hasValidIndices(template.boundary, vertexCount) || template.boundary.length !== 36 ||
    !map.anchors.every((anchor: Anchor, index: number) => anchor?.landmark === index && Number.isInteger(anchor.triangle) && anchor.triangle >= 0 && anchor.triangle < 898 && isNumericTuple(anchor.weights, 3) && anchor.weights.every((weight) => weight >= -1e-4 && weight <= 1.0001) && Math.abs(anchor.weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-3)
  ) throw new Error(`Phiên bản template/anchor không phù hợp (${templateUrl}). Kiểm tra schema và nguồn asset.`);
  return { template: template as HeadTemplate, anchors: map.anchors as Anchor[] };
}

export function loadTemplate() {
  assets ??= (async () => {
    const templateUrl = '/assets/head-template.json';
    const anchorsUrl = '/assets/landmark-anchors.json';
    const [template, map] = await Promise.all([loadJSON(templateUrl), loadJSON(anchorsUrl)]);
    return validateTemplateAssets(template, map, templateUrl);
  })().catch((error) => { assets = undefined; throw error; });
  return assets;
}

export class HeadPipeline {
  private analyzer?: Worker;
  private generator?: Worker;
  private activeReject?: (error: Error) => void;
  private sequence = 0;
  private busy = false;

  async generate(canvas: HTMLCanvasElement, onProgress: (progress: Progress) => void, options: GenerationOptions = { occludedEyes: false }): Promise<{ result: HeadResult; analysis: Analysis; template: HeadTemplate }> {
    if (this.busy) throw new Error('Đang xử lý ảnh khác.');
    this.busy = true;
    const token = ++this.sequence;
    const start = performance.now();
    try {
      const { template, anchors } = await loadTemplate();
      if (token !== this.sequence) throw new DOMException('Đã hủy', 'AbortError');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Trình duyệt không hỗ trợ canvas 2D.');
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const bitmap = await createImageBitmap(canvas);
      if (token !== this.sequence) { bitmap.close(); throw new DOMException('Đã hủy', 'AbortError'); }
      this.analyzer ??= new Worker('/analysis.worker.js');
      const analysis = await this.request<Analysis>(this.analyzer, { bitmap }, [bitmap], 'analysis', onProgress);
      if (token !== this.sequence) throw new DOMException('Đã hủy', 'AbortError');
      this.generator ??= new Worker(new URL('../workers/generate.worker.ts', import.meta.url), { type: 'module' });
      // Keep mask arrays locally for diagnostics; transfer only the photo pixels.
      const result = await this.request<HeadResult>(this.generator, { template, anchors, analysis, pixels, width: canvas.width, height: canvas.height, options }, [pixels.buffer], 'result', onProgress);
      result.timings.total = performance.now() - start;
      result.timings.warm = result.timings.total - result.timings.initialize;
      onProgress({ phase: 'Đã dựng mesh đầu–cổ tự sinh', progress: 1 });
      return { result, analysis, template };
    } finally {
      if (token === this.sequence) { this.busy = false; this.activeReject = undefined; }
    }
  }

  private request<T>(worker: Worker, payload: unknown, transfer: Transferable[], resultKey: string, onProgress: (progress: Progress) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null;
        this.activeReject = undefined;
      };
      this.activeReject = (error) => { cleanup(); reject(error); };
      worker.onmessage = ({ data }) => {
        if (data.type === 'progress') { onProgress(data); return; }
        cleanup();
        if (data.type === 'error') reject(new Error(data.message));
        else resolve(data[resultKey] as T);
      };
      worker.onerror = () => { cleanup(); reject(new Error('Worker không khởi động được. Cần trình duyệt có Worker, OffscreenCanvas và WebAssembly; thử Chrome/Edge mới hoặc tải lại trang.')); };
      worker.onmessageerror = () => { cleanup(); reject(new Error('Không chuyển được dữ liệu giữa các worker.')); };
      try { worker.postMessage(payload, transfer); } catch (error) { cleanup(); reject(error); }
    });
  }

  cancel() {
    ++this.sequence;
    this.activeReject?.(new DOMException('Đã hủy', 'AbortError'));
    this.analyzer?.terminate(); this.generator?.terminate();
    this.analyzer = undefined; this.generator = undefined; this.busy = false;
  }
  dispose() { this.cancel(); }
}
