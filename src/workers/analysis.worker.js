/* Classic worker: MediaPipe's WASM loader uses importScripts. The host bundles
 * this worker; pinned assets use the configured host. Photos stay on-device. */
let detector, segmenter;
const emit = (phase, progress) => self.postMessage({ type: 'progress', phase, progress });
const fail = (code) => { const error = new Error(code); error.headCode = code; throw error; };
const bounds = (points) => ({
  left: Math.min(...points.map((p) => p.x)), right: Math.max(...points.map((p) => p.x)),
  top: Math.min(...points.map((p) => p.y)), bottom: Math.max(...points.map((p) => p.y)),
});
function detect(source) {
  const result = detector.detect(source);
  if (!result.faceLandmarks.length) fail('noFace');
  if (result.faceLandmarks.length !== 1) fail('multipleFaces');
  return result;
}
function cropPortrait(bitmap) {
  const landmarks = detect(bitmap).faceLandmarks[0];
  const box = bounds(landmarks), width = box.right - box.left, height = box.bottom - box.top;
  if (width * height < 0.035 || Math.min(width * bitmap.width, height * bitmap.height) < 64) fail('smallFace');
  const eye = (ids) => ids.reduce((p, id) => ({ x: p.x + landmarks[id].x / ids.length, y: p.y + landmarks[id].y / ids.length }), { x: 0, y: 0 });
  const left = eye([33, 133]), right = eye([362, 263]);
  const roll = Math.atan2((right.y - left.y) * bitmap.height, (right.x - left.x) * bitmap.width);
  const cosine = Math.cos(roll), sine = Math.sin(roll);
  const upright = bounds(landmarks.map((p) => {
    const x = p.x * bitmap.width, y = p.y * bitmap.height;
    return { x: cosine * x + sine * y, y: -sine * x + cosine * y };
  }));
  const faceWidth = upright.right - upright.left, faceHeight = upright.bottom - upright.top;
  const side = Math.max(faceWidth * 1.75, faceHeight * 1.9);
  const canvas = new OffscreenCanvas(1024, 1024), context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) fail('generation');
  context.fillStyle = '#808080'; context.fillRect(0, 0, 1024, 1024);
  context.translate(512, 512); context.scale(1024 / side, 1024 / side);
  context.translate(-(upright.left + upright.right) / 2, -(upright.top + upright.bottom) / 2 + faceHeight * 0.15);
  context.rotate(-roll); context.drawImage(bitmap, 0, 0); context.resetTransform();
  return canvas;
}
function copyPortrait(bitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) fail('generation');
  context.drawImage(bitmap, 0, 0);
  return canvas;
}
self.onmessage = async ({ data }) => {
  const bitmap = data.bitmap;
  let failureCode = 'assets';
  try {
    const timings = {}, cold = performance.now();
    emit('loadingModel', 0.04);
    if (!self.vision) importScripts(new URL('vision_bundle.js', data.assets.runtime).href);
    // FilesetResolver appends its own slash. Keep importScripts' directory URL,
    // but strip its trailing slash before resolving the WASM loader paths.
    const files = await vision.FilesetResolver.forVisionTasks(data.assets.runtime.replace(/\/+$/, ''));
    if (!detector) detector = await vision.FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: data.assets.landmarker, delegate: 'CPU' },
      runningMode: 'IMAGE', numFaces: 2, outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.55, minFacePresenceConfidence: 0.55,
    });
    if (!segmenter) segmenter = await vision.ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: data.assets.segmenter, delegate: 'CPU' },
      runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true,
    });
    timings.initialize = performance.now() - cold;
    failureCode = 'generation';
    emit('detecting', 0.15);
    const autoCrop = data.crop === 'auto';
    const detectedAt = performance.now(), crop = autoCrop ? cropPortrait(bitmap) : copyPortrait(bitmap);
    const result = detect(crop), landmarks = result.faceLandmarks[0].map(({ x, y, z }) => [x, y, z]);
    if (landmarks.length !== 478 || landmarks.some(([x, y, z]) => !Number.isFinite(x + y + z) || x < 0.005 || x > 0.995 || y < 0.005 || y > 0.995)) fail('landmarks');
    if (autoCrop) {
      const left = Math.abs(landmarks[4][0] - landmarks[234][0]), right = Math.abs(landmarks[454][0] - landmarks[4][0]);
      if (Math.min(left, right) / Math.max(left, right) < 0.45) fail('frontalFace');
    } else {
      const box = bounds(result.faceLandmarks[0]);
      if (box.right - box.left < 0.15 || box.bottom - box.top < 0.15) fail('smallFace');
    }
    timings.detect = performance.now() - detectedAt;
    emit('segmenting', 0.30);
    const segmentAt = performance.now(), segmentation = segmenter.segment(crop);
    let skin, bodySkin, hair, accessories, maskWidth, maskHeight;
    try {
      const masks = segmentation.confidenceMasks;
      if (!masks || masks.length !== 6) fail('assets');
      bodySkin = masks[2].getAsFloat32Array().slice(); skin = masks[3].getAsFloat32Array().slice();
      hair = masks[1].getAsFloat32Array().slice(); accessories = masks[5].getAsFloat32Array().slice();
      maskWidth = masks[3].width; maskHeight = masks[3].height;
    } finally { segmentation.close(); }
    timings.segment = performance.now() - segmentAt;
    const blendshapes = Object.fromEntries((result.faceBlendshapes[0]?.categories ?? []).map(({ categoryName, score }) => [categoryName, score]));
    const pixels = crop.getContext('2d').getImageData(0, 0, crop.width, crop.height).data;
    self.postMessage({ type: 'result', result: {
      analysis: { landmarks, blendshapes, skin, bodySkin, hair, accessories, maskWidth, maskHeight, timings },
      pixels, width: crop.width, height: crop.height,
    } }, [pixels.buffer, skin.buffer, bodySkin.buffer, hair.buffer, accessories.buffer]);
  } catch (error) {
    // DOMException.code is numeric; only our explicit string codes cross the boundary.
    self.postMessage({ type: 'error', code: typeof error?.headCode === 'string' ? error.headCode : failureCode });
  } finally { bitmap.close(); }
};
