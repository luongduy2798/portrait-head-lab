# Nguồn asset và giấy phép

Runtime dùng MediaPipe/Three.js, mặt canonical và sọ/cổ thủ tục. Tai lấy từ **mesh trung tính FaceVerse v4 đã có sẵn trong workspace**; sáu preset và răng/lưỡi đọc từ gói FaceVerse được trích trong bước chuẩn bị asset. Tất cả được phục vụ cùng origin; trình duyệt không chạy FaceVerse inference hoặc tải basis/network từ CDN. Ảnh chân dung không gửi ra ngoài thiết bị.

| Asset | Nguồn / phiên bản | Giấy phép / bằng chứng |
| --- | --- | --- |
| Canonical face OBJ | `google-ai-edge/mediapipe`, commit pin trong `vendor/mediapipe-source.json` | Apache-2.0; nguyên văn tại `licenses/mediapipe-apache-2.0.txt`; [source](https://github.com/google-ai-edge/mediapipe/blob/a908d668c730da128dfa8d9f6bd25d519d006692/mediapipe/modules/face_geometry/data/canonical_face_model.obj) |
| Face Landmarker bundle | `face_landmarker/float16/1/face_landmarker.task` | Apache-2.0; [BlazeFace model card](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf), [FaceMesh V2](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf), [Blendshape V2](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf) |
| Selfie Multiclass | `selfie_multiclass_256x256/float32/1` | Apache-2.0; [model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Multiclass%20Segmentation.pdf) |
| MediaPipe JS/WASM | `@mediapipe/tasks-vision@0.10.35` | Apache-2.0, adapter CJS classic-worker ghi trong script; không thay inference |
| Three.js, OrbitControls, GLTFExporter/Loader | `three@0.186.1` | MIT; `licenses/three-mit.txt` |
| Head JSON/GLB và anchors | Generated từ canonical OBJ + script hộp sọ/tai của repo | Derivative của MediaPipe: giữ attribution/Apache-2.0 cho phần kế thừa; phần thêm mới viết cho thử nghiệm nội bộ |
| Tai FaceVerse v4 | Vùng tai trích trong RAM từ `public/assets/faceverse/faceverse-neutral.glb` có sẵn; 1.170.660 byte, SHA-256 `0de714251964c2db70cdf1286dc5e9f899ce1dce9d78877ba58629de4b32b93f`; source commit `19c67cc4d7234b1ea7d55a185a2cb55fd49bb877` | Mesh local evaluation đã có trước lần sửa; `licenseVerified: false` cho dữ liệu model, không đổi thành MIT hoặc tự xác nhận quyền phân phối. MIT code upstream lưu tại `licenses/faceverse-code-mit.txt`. |
| Preset và răng/lưỡi FaceVerse v4 | `scripts/prepare-expressions.mjs` → `public/assets/faceverse/expression-rig.json`; 988.658 byte, SHA-256 `803077628044a2a3ec70ed8c69ef5851bb8970765ebbd44e49914b489e33a709` | Ngoại lệ dùng basis cho thử nghiệm local được người dùng cho phép ngày 29/10/2026; `licenseVerified: false`, không xác nhận quyền phân phối dữ liệu model. |

Nguồn, version và checksum MediaPipe/template nằm tại **`public/assets/registry.json`**. `npm run assets` từ chối checksum model đổi nếu đã có registry; WASM/JS copy từ package pin. `npm run assets:template` tạo lại template canonical/GLB. Nguồn mesh FaceVerse local nằm tại **`public/assets/faceverse/manifest.json`**, thư mục này bị `.gitignore` loại trừ. `src/core/ears.ts` kiểm tra SHA-256 GLB trước khi dùng; không tải thêm model khi thiếu file.

Copyright canonical data/runtime/model: The MediaPipe Authors / Google, theo notices của upstream. Copyright Three.js: theo bản MIT được lưu kèm. Không đưa chân dung mẫu vào repo; người thử tự chọn ảnh có quyền dùng. Giấy phép thư viện không thay thế quyền đối với ảnh nguồn hoặc GLB chứa texture ảnh đó.

Tài liệu API chính thức: [FaceLandmarker Web](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js), [ImageSegmenter Web](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js), [GLTFExporter](https://threejs.org/docs/pages/GLTFExporter.html).

## FaceVerse local reference

Code upstream công bố MIT; README yêu cầu tải model/checkpoint riêng. Bản ghi nguồn model trong workspace vẫn đánh dấu điều khoản dữ liệu chưa được xác minh riêng. Theo ngoại lệ người dùng đã cho phép cho thử nghiệm local, `npm run assets:expressions` được tải và cache hai file sau từ `https://static.moodlab.dev/faceverse/`:

- `basis.bin`: 48.667.900 byte; SHA-256 `9b23ad5d087f0d109e098f903c33a5e33da9807677f09f245829a77932c2693a`.
- `expression.bin`: 20.777.456 byte; SHA-256 `bd489640bdc41a2fefc5ac432c1a515eb8af7347f422b208c129ce4611d8ca31`.

Script kiểm tra checksum trước khi trích, giữ nguyên hệ số sáu preset từ worker của `twa-moodlab-mobile`, đổi trục và căn hàm/khoang miệng giống worker nguồn. Gói runtime chỉ có 468 landmark trung tính, sáu trường dịch chuyển và ba phần miệng có màu/morph; không chứa toàn bộ identity/expression basis hoặc ONNX. Nguồn, checksum output và checksum hệ số preset nằm trong `expression-rig-manifest.json`, cùng thư mục asset local bị gitignore. Runtime kiểm tra checksum và schema trước khi dùng; thiếu asset thì báo lỗi chuẩn bị, không tự tải basis. Không upload dữ liệu hay công bố gói này lên CDN. Không coi giấy phép code là bằng chứng đã xác minh giấy phép dữ liệu model.

- [Code upstream, commit đã pin](https://github.com/LizhenWangT/FaceVerse_v4/tree/19c67cc4d7234b1ea7d55a185a2cb55fd49bb877).
- [LICENSE code upstream](https://github.com/LizhenWangT/FaceVerse_v4/blob/19c67cc4d7234b1ea7d55a185a2cb55fd49bb877/LICENSE).
- [README và hướng dẫn tải model](https://github.com/LizhenWangT/FaceVerse_v4/blob/19c67cc4d7234b1ea7d55a185a2cb55fd49bb877/README.md).
