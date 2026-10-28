/* MediaPipe is loaded as a classic worker so its WASM importScripts stays valid.
 * All URLs are same-origin static assets. No portrait is sent over the network. */
importScripts('/vendor/mediapipe/vision_bundle.js');
let detector, segmenter;
const emit = (phase, progress) => self.postMessage({ type: 'progress', phase, progress });
self.onmessage = async ({ data }) => {
  const bitmap = data.bitmap;
  try {
    const timings = {};
    const cold = performance.now();
    emit('Đang tải bộ nhận diện trên máy…', 0.08);
    const files = await vision.FilesetResolver.forVisionTasks('/vendor/mediapipe');
    if (!detector) detector = await vision.FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/assets/face_landmarker.task', delegate: 'CPU' },
      runningMode: 'IMAGE', numFaces: 2, outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.55, minFacePresenceConfidence: 0.55,
    });
    if (!segmenter) segmenter = await vision.ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/assets/selfie_multiclass.tflite', delegate: 'CPU' },
      runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true,
    });
    timings.initialize = performance.now() - cold;
    emit('Đang tìm khuôn mặt…', 0.22);
    const detectionStarted = performance.now();
    const result = detector.detect(bitmap);
    timings.detect = performance.now() - detectionStarted;
    if (result.faceLandmarks.length === 0) throw new Error('Không tìm thấy mặt. Hãy chọn ảnh rõ mặt và crop lại.');
    if (result.faceLandmarks.length > 1) throw new Error('Có nhiều khuôn mặt. Hãy crop để chỉ còn một người.');
    const landmarks = result.faceLandmarks[0].map(({ x, y, z }) => [x, y, z]);
    const xs = landmarks.map((point) => point[0]), ys = landmarks.map((point) => point[1]);
    const faceWidth = Math.max(...xs) - Math.min(...xs);
    const faceHeight = Math.max(...ys) - Math.min(...ys);
    if (faceWidth < 0.15 || faceHeight < 0.15 || landmarks.some(([x, y, z]) => !Number.isFinite(x + y + z) || x < 0.005 || x > 0.995 || y < 0.005 || y > 0.995)) {
      throw new Error('Khuôn mặt quá nhỏ hoặc bị cắt sát mép. Hãy chỉnh crop cho rõ toàn bộ mặt.');
    }
    emit('Đang tách tóc và vùng da…', 0.34);
    const segmentStarted = performance.now();
    const segmentation = segmenter.segment(bitmap);
    let skin, hair, accessories, maskWidth, maskHeight;
    try {
      const masks = segmentation.confidenceMasks;
      if (!masks || masks.length !== 6) throw new Error('Không đọc được mask tóc/da. Hãy tải lại bộ model.');
      skin = masks[3].getAsFloat32Array().slice();
      hair = masks[1].getAsFloat32Array().slice();
      accessories = masks[5].getAsFloat32Array().slice();
      maskWidth = masks[3].width; maskHeight = masks[3].height;
    } finally { segmentation.close(); }
    timings.segment = performance.now() - segmentStarted;
    const blendshapes = Object.fromEntries((result.faceBlendshapes[0]?.categories ?? []).map(({ categoryName, score }) => [categoryName, score]));
    self.postMessage({ type: 'result', analysis: { landmarks, blendshapes, skin, hair, accessories, maskWidth, maskHeight, timings } }, [skin.buffer, hair.buffer, accessories.buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Không thể phân tích ảnh.' });
  } finally { bitmap.close(); }
};
