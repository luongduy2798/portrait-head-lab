# Nguồn asset và giấy phép

Runtime dùng MediaPipe/Three.js, mặt canonical và sọ/cổ thủ tục. Model, JS/WASM, template, mesh tai, sáu preset và răng/lưỡi đã có sẵn trong `assets/`. Consumer tải cùng bộ file từ host ứng dụng hoặc CDN được cấu hình; không chạy FaceVerse inference, không tải basis/checkpoint và không gửi ảnh chân dung ra ngoài thiết bị.

| Asset | Nguồn / phiên bản | Giấy phép / bằng chứng |
| --- | --- | --- |
| Canonical face OBJ | `google-ai-edge/mediapipe`, commit pin trong `vendor/mediapipe-source.json` | Apache-2.0; nguyên văn tại `assets/licenses/mediapipe-apache-2.0.txt`; [source](https://github.com/google-ai-edge/mediapipe/blob/a908d668c730da128dfa8d9f6bd25d519d006692/mediapipe/modules/face_geometry/data/canonical_face_model.obj) |
| Face Landmarker bundle | `face_landmarker/float16/1/face_landmarker.task` | Apache-2.0; [BlazeFace model card](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf), [FaceMesh V2](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf), [Blendshape V2](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf) |
| Selfie Multiclass | `selfie_multiclass_256x256/float32/1` | Apache-2.0; [model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Multiclass%20Segmentation.pdf) |
| MediaPipe JS/WASM | Bộ file runtime đã chuẩn bị từ `@mediapipe/tasks-vision@0.10.35` | Apache-2.0; adapter CJS có sẵn trong `assets/runtime/vision_bundle.js` |
| Three.js, OrbitControls, GLTFExporter/Loader | `three@0.186.1` | MIT; `assets/licenses/three-mit.txt` |
| Head JSON/GLB và anchors | Output đã chuẩn bị từ canonical OBJ và generator tại baseline repo `9b8fb0355f628d56783e361f30ed3022fa70b710` | Derivative của MediaPipe: giữ attribution/Apache-2.0 cho phần kế thừa; phần thêm mới viết cho thử nghiệm nội bộ |
| Tai FaceVerse v4 | Vùng tai trích trong RAM từ `assets/faceverse/faceverse-neutral.glb` có sẵn; 1.170.660 byte, SHA-256 `0de714251964c2db70cdf1286dc5e9f899ce1dce9d78877ba58629de4b32b93f`; source commit `19c67cc4d7234b1ea7d55a185a2cb55fd49bb877` | Mesh local evaluation đã có trước lần sửa; `licenseVerified: false` cho dữ liệu model, không đổi thành MIT hoặc tự xác nhận quyền phân phối. MIT code upstream lưu tại `assets/licenses/faceverse-code-mit.txt`. |
| Preset và răng/lưỡi FaceVerse v4 | `assets/faceverse/expression-rig.json` đã trích sẵn; 988.658 byte, SHA-256 `803077628044a2a3ec70ed8c69ef5851bb8970765ebbd44e49914b489e33a709` | Dữ liệu nguồn được dùng cho thử nghiệm local theo ngoại lệ ngày 29/10/2026; `licenseVerified: false`, không xác nhận quyền phân phối dữ liệu model. |

Manifest dùng chung là **`asset-manifest.json`**; ghi file, nguồn, phiên bản, byte count, SHA-256 và giấy phép. Nguồn MediaPipe/template bổ sung tại **`assets/registry.json`**, nguồn FaceVerse tại **`assets/faceverse/manifest.json`**. Bộ FaceVerse runtime được giữ cùng các asset khác trong repo. Plugin chỉ phục vụ/đóng gói file đã pin, không sinh hoặc tải lại model. Loader tai và biểu cảm kiểm tra checksum trước khi dùng; thiếu/sai asset thì báo lỗi host/file.

Copyright canonical data/runtime/model: The MediaPipe Authors / Google, theo notices của upstream. Copyright Three.js: theo bản MIT được lưu kèm. Không đưa chân dung mẫu vào repo; người thử tự chọn ảnh có quyền dùng. Giấy phép thư viện không thay thế quyền đối với ảnh nguồn hoặc GLB chứa texture ảnh đó.

Tài liệu API chính thức: [FaceLandmarker Web](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js), [ImageSegmenter Web](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js), [GLTFExporter](https://threejs.org/docs/pages/GLTFExporter.html).

## FaceVerse local reference

Code upstream công bố MIT; model/checkpoint có điều khoản riêng chưa được xác minh trong metadata hiện tại. Gói biểu cảm đã được trích từ hai file nguồn sau tại `https://static.moodlab.dev/faceverse/`, không cần các file này để cài hoặc chạy thư viện:

- `basis.bin`: 48.667.900 byte; SHA-256 `9b23ad5d087f0d109e098f903c33a5e33da9807677f09f245829a77932c2693a`.
- `expression.bin`: 20.777.456 byte; SHA-256 `bd489640bdc41a2fefc5ac432c1a515eb8af7347f422b208c129ce4611d8ca31`.

Output giữ nguyên hệ số sáu preset từ worker của `twa-moodlab-mobile`, đổi trục và căn hàm/khoang miệng theo worker nguồn. Gói runtime chỉ chứa 468 landmark trung tính, sáu trường dịch chuyển và ba phần miệng có màu/morph. Nguồn, checksum output và checksum hệ số preset nằm trong `assets/faceverse/expression-rig-manifest.json`. Việc lưu sẵn asset hoặc cấu hình CDN không đổi `licenseVerified: false`; giấy phép code không được ghi nhận thành quyền phân phối dữ liệu model. Chưa upload asset tới CDN trong thay đổi này.

- [Code upstream, commit đã pin](https://github.com/LizhenWangT/FaceVerse_v4/tree/19c67cc4d7234b1ea7d55a185a2cb55fd49bb877).
- [LICENSE code upstream](https://github.com/LizhenWangT/FaceVerse_v4/blob/19c67cc4d7234b1ea7d55a185a2cb55fd49bb877/LICENSE).
- [README và hướng dẫn tải model](https://github.com/LizhenWangT/FaceVerse_v4/blob/19c67cc4d7234b1ea7d55a185a2cb55fd49bb877/README.md).
