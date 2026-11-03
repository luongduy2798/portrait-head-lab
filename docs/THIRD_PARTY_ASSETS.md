# Nguồn asset và giấy phép

Runtime dùng MediaPipe/Three.js, mặt canonical và sọ/cổ thủ tục. Model, JS/WASM, template, mesh tai, sáu preset và răng/lưỡi được tải trực tiếp từ CDN https://static.moodlab.dev/portrait-head/. asset-manifest.json pin byte count/SHA-256/nguồn/giấy phép; SDK kiểm tra dữ liệu trước khi tạo Blob URL. Các bản nhị phân legacy còn trong assets/ không được runtime hoặc package tham chiếu và đang chờ xóa. Không chạy FaceVerse inference, không tải basis/checkpoint trong runtime và không gửi ảnh chân dung ra ngoài thiết bị.

| Asset | Nguồn / phiên bản | Giấy phép / bằng chứng |
| --- | --- | --- |
| Canonical face OBJ | `google-ai-edge/mediapipe`, commit pin trong `vendor/mediapipe-source.json` | Apache-2.0; nguyên văn tại `licenses/mediapipe-apache-2.0.txt`; [source](https://github.com/google-ai-edge/mediapipe/blob/a908d668c730da128dfa8d9f6bd25d519d006692/mediapipe/modules/face_geometry/data/canonical_face_model.obj) |
| Face Landmarker bundle | `face_landmarker/float16/1/face_landmarker.task` | Apache-2.0; [BlazeFace model card](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf), [FaceMesh V2](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf), [Blendshape V2](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf) |
| Selfie Multiclass | `selfie_multiclass_256x256/float32/1` | Apache-2.0; [model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Multiclass%20Segmentation.pdf) |
| MediaPipe JS/WASM | Bộ file runtime đã chuẩn bị từ `@mediapipe/tasks-vision@0.10.35`, phục vụ từ CDN | Apache-2.0; checksum và nguồn trong `asset-manifest.json` |
| Three.js, OrbitControls, GLTFExporter/Loader | `three@0.186.1` | MIT; `licenses/three-mit.txt` |
| fflate | fflate `0.8.2` được vendored trong Three.js; không còn dùng để giải nén payload runtime sau khi chuyển CDN-only | MIT; bản license được giữ tại `licenses/fflate-mit.txt`; nguồn `https://raw.githubusercontent.com/101arrowz/fflate/v0.8.2/LICENSE`; SHA-256 notice `805f6cb28bb8b6d3a0badd83c93bccd9671fa01a3b4b92b7042b0743325ac243` |
| Head JSON/GLB và anchors | Output đã chuẩn bị từ canonical OBJ và generator tại baseline repo `9b8fb0355f628d56783e361f30ed3022fa70b710` | Derivative của MediaPipe: giữ attribution/Apache-2.0 cho phần kế thừa; phần thêm mới viết cho thử nghiệm nội bộ |
| Tai FaceVerse v4 | Mesh trung tính tải từ CDN; 1.170.660 byte, SHA-256 `0de714251964c2db70cdf1286dc5e9f899ce1dce9d78877ba58629de4b32b93f`; source commit `19c67cc4d7234b1ea7d55a185a2cb55fd49bb877` | `licenseVerified: false` cho dữ liệu model; không đổi thành MIT hoặc tự xác nhận quyền phân phối. MIT code upstream lưu tại `licenses/faceverse-code-mit.txt`. |
| Preset và răng/lưỡi FaceVerse v4 | `faceverse/expression-rig.json` tải từ CDN; 988.658 byte, SHA-256 `803077628044a2a3ec70ed8c69ef5851bb8970765ebbd44e49914b489e33a709` | Dữ liệu nguồn được dùng cho thử nghiệm local theo ngoại lệ ngày 29/10/2026; `licenseVerified: false`, không xác nhận quyền phân phối dữ liệu model. |

Manifest runtime là **`asset-manifest.json`**; ghi path CDN, nguồn, phiên bản, byte count, SHA-256 và giấy phép. Registry nguồn MediaPipe/template nằm tại **`asset-registry.json`**; provenance FaceVerse được giữ tại **`provenance/faceverse/`**. Tool chuẩn bị artifact SDK chỉ sinh JavaScript/declarations/worker và checksum metadata; không đọc, nén hoặc đóng gói payload local. SDK kiểm tra mọi asset trước khi tạo Blob URL. `runtime/manifest.json` ghi version, checksum manifest và source của artifact. License dạng văn bản được giữ trong `licenses/` và gói phân phối.

Copyright canonical data/runtime/model: The MediaPipe Authors / Google, theo notices của upstream. Copyright Three.js: theo bản MIT được lưu kèm. Không đưa chân dung mẫu vào repo; người thử tự chọn ảnh có quyền dùng. Giấy phép thư viện không thay thế quyền đối với ảnh nguồn hoặc GLB chứa texture ảnh đó.

Tài liệu API chính thức: [FaceLandmarker Web](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js), [ImageSegmenter Web](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js), [GLTFExporter](https://threejs.org/docs/pages/GLTFExporter.html).

## FaceVerse local reference

Code upstream công bố MIT; model/checkpoint có điều khoản riêng chưa được xác minh trong metadata hiện tại. Hai file nguồn dùng để trích xuất gói biểu cảm được ghi bằng checksum trong `provenance/faceverse/expression-rig-manifest.json`; các file nguồn không được tải khi cài hoặc chạy thư viện:

- `basis.bin`: 48.667.900 byte; SHA-256 `9b23ad5d087f0d109e098f903c33a5e33da9807677f09f245829a77932c2693a`.
- `expression.bin`: 20.777.456 byte; SHA-256 `bd489640bdc41a2fefc5ac432c1a515eb8af7347f422b208c129ce4611d8ca31`.

Output giữ nguyên hệ số sáu preset từ worker của `twa-moodlab-mobile`, đổi trục và căn hàm/khoang miệng theo worker nguồn. Runtime chỉ tải các payload đã chuẩn bị theo path tương đối `faceverse/...` bên dưới CDN base `https://static.moodlab.dev/portrait-head/`; không gọi CDN gốc FaceVerse. Nguồn, checksum output và checksum hệ số preset nằm trong `provenance/faceverse/expression-rig-manifest.json`. URL nguồn cũ trong provenance chỉ phục vụ truy vết lịch sử, không phải endpoint runtime. Việc chuyển host không làm thay đổi `licenseVerified: false`; giấy phép code không được ghi nhận thành quyền phân phối dữ liệu model. Chỉ dùng theo trạng thái quyền dữ liệu đã ghi trong provenance; không suy diễn quyền phân phối từ việc URL truy cập được.

- [Code upstream, commit đã pin](https://github.com/LizhenWangT/FaceVerse_v4/tree/19c67cc4d7234b1ea7d55a185a2cb55fd49bb877).
- [LICENSE code upstream](https://github.com/LizhenWangT/FaceVerse_v4/blob/19c67cc4d7234b1ea7d55a185a2cb55fd49bb877/LICENSE).
- [README và hướng dẫn tải model](https://github.com/LizhenWangT/FaceVerse_v4/blob/19c67cc4d7234b1ea7d55a185a2cb55fd49bb877/README.md).
