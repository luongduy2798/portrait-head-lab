# @twa/portrait-head

SDK trình duyệt cung cấp JavaScript ESM và typings đã chuẩn bị tại `runtime/`.
Runtime chỉ dùng peer `three@0.186.1`. App không cần compiler của thư viện, plugin
Vite, biến môi trường CDN, public asset path hoặc bước chuẩn bị model.

## Cài và dùng

Với checkout sibling, khai báo `"@twa/portrait-head": "file:../portrait-head-lab"`
rồi cài dependency như app hiện tại. Hai checkout cần tồn tại khi dùng symlink.
Bản cài dùng các artifact đã có; không chạy prepare/build tại consumer.

```ts
import { PortraitHeadPipeline, HeadError } from '@twa/portrait-head';

const sdk = new PortraitHeadPipeline();
const head = await sdk.generate(fileOrCanvas, {
  signal: controller.signal,
  onProgress: ({ phase, progress }) => updateProgress(phase, progress),
});
scene.add(head.root);
const savedFace = head.data; // Lưu trong kho dữ liệu do app quản lý nếu cần.
head.dispose();
const restored = await sdk.restore(savedFace, { signal: controller.signal });
restored.dispose();
sdk.dispose();
```

- `generate` tự chuẩn bị model/worker, phân tích ảnh, fit, texture và dựng mesh.
- `File` tự căn/xoay và crop 1024 px; canvas đã crop giữ nguyên. Có thể chỉ định
  `crop: 'auto' | 'none'`, `occludedEyes` trong options của `generate`.
- `restore` dựng lại đầu từ `PortraitHeadData`, không đọc ảnh hoặc chạy nhận diện.
- Kết quả có `root`, `data`, geometry `neutral`, landmark trung tính, `neckIndices`,
  `skinColor` và `dispose()`. `new PortraitHeadPipeline({ openNeck: true })` dành cho
  adapter ghép body; mặc định đầu độc lập có đáy cổ kín.
- `cancel()`/`dispose()` hủy cả phân tích lẫn khôi phục và thu hồi Blob URL worker.
  Head đã trả về thuộc caller; caller gọi `head.dispose()` khi không dùng.
- `HeadError.code` gồm lỗi ảnh/mặt/model/generation và `faceUnavailable` cho dữ
  liệu lưu không hợp lệ. Hủy trả `AbortError`. Consumer tự dịch thông báo UI.
- `Progress.phase`: `loadingModel`, `detecting`, `segmenting`, `fitting`, `texturing`;
  `progress` thuộc khoảng 0–1.

Schema face v1 và provenance baseline `9b8fb0355f628d56783e361f30ed3022fa70b710`
được giữ để đọc dữ liệu đã lưu. SDK export `PortraitHeadData`, `isPortraitHeadData`
và `portraitHeadData`; app không tự định nghĩa lại schema/validator. Kho IndexedDB,
tài khoản, thumbnail và luồng Save/backend vẫn do app quản lý.

## Asset, worker và CDN

Mặc định SDK dùng 19 payload model/runtime đã pin trong package, nạp khi cần,
giải nén gzip bằng fflate từ Three.js, kiểm tra SHA-256/byte count rồi tạo Blob URL.
Worker JavaScript đã đóng gói cùng SDK và được tạo bằng Blob. Không yêu cầu host
transpile TypeScript, bundle Worker entry hay phục vụ một thư mục public riêng.
Các bundler ngoài Vite chưa được kiểm chứng thực tế; SDK không có Vite dependency.

Cấu hình CDN thuộc **`portrait-head.config.js` ở root thư viện**. Để trống
`assetBaseUrl` dùng payload đóng gói. Khi có CDN, upload bản raw từ `assets/` của
repo, giữ cấu trúc và đặt URL thư mục có phiên bản vào file cấu hình thư viện.
Không cần biến `ML_PORTRAIT_HEAD_ASSET_BASE_URL` hoặc thay cấu hình trong app.
`assetBaseUrl` trong constructor chỉ là override nâng cao, không bắt buộc.

CSP của host cần cho phép `worker-src blob:`, `script-src blob:` và WebAssembly,
`connect-src blob:`; khi dùng CDN thêm origin CDN vào `connect-src` và bật CORS trên
CDN. Ảnh/landmark chỉ qua bộ nhớ và worker trên thiết bị, không gửi tới CDN.
Cache asset dùng chung chỉ giữ model đã pin, không giữ ảnh hay dữ liệu face.

Nguồn và giấy phép: [THIRD_PARTY_ASSETS](THIRD_PARTY_ASSETS.md). Việc đóng gói không
đổi trạng thái `licenseVerified: false` của dữ liệu FaceVerse.

## API nâng cao và demo

Dữ liệu `PortraitHeadData` schema 1 có thêm trường tùy chọn `identity` phiên bản 1: 468 vector hiệu chỉnh trung tính theo centimetre canonical và trọng số chiều sâu. Đây là biến dạng đã fit, không phải landmark detector hay pixel nguồn. `portraitHeadData()` sao chép trường này và `restorePortraitHead()` áp dụng lại cùng tham số/texture. Record cũ thiếu trường vẫn dùng đường dựng theo tham số; record có trường sai phiên bản/kích thước/giá trị bị từ chối. Bỏ nếp mí thủ tục áp dụng cả khi dựng lại record cũ. Preview và GLB dùng cùng hình học đã hiệu chỉnh.

`measurements.ears` là trường tùy chọn cho `left`/`right` theo phía trái/phải của ảnh chưa lật (-X/+X của đầu). Mỗi bên chỉ lưu tỷ lệ tâm tai từ trán, chiều cao/phần nhô ra so với mặt và trọng số tin cậy heuristic; không lưu mask hoặc landmark tai. SDK sao chép riêng từng bên khi tạo dữ liệu lưu và dùng lại các tỷ lệ khi restore. Record cũ thiếu trường dùng tỷ lệ mẫu theo đầu; record có giá trị sai kiểu hoặc ngoài khoảng bị từ chối. `earSize`, `earHeight`, `earOutset` điều chỉnh thêm quanh kết quả này. Đường ghép mới áp dụng cả record cũ khi dựng lại; GLB đã bake phải được tạo lại.

Demo ở `demo/` có package/toolchain riêng và dùng các public API cấp thấp
`HeadPipeline`, `loadTemplate`, `loadEarTemplate`, `loadExpressionRig`, `createHead`,
shape/expression controls, `exportHead`, `inspectGLB` để giữ công cụ chẩn đoán.
Các loader và pipeline đều có cấu hình mặc định của SDK. Runtime app thông thường
chỉ cần `PortraitHeadPipeline` và dữ liệu kết quả.

## Cập nhật artifact khi phát triển thư viện

Sau khi sửa source hoặc pin asset, maintainer chạy `npm run prepare:runtime` tại
root. Công cụ dev-only dùng TypeScript/esbuild để chuẩn bị JS/declarations/worker
và nén asset hiện có; không tải model, inference, kiểm thử, deployment hoặc build
app/demo. Artifact được giữ sẵn trong repo để consumer không chạy công cụ này.
Source tooling và demo không nằm trong gói phân phối. Vite chỉ nằm trong demo.
Chưa chạy test, build app/demo, lint, typecheck dự án hoặc browser validation cho
thay đổi SDK này. Việc tạo artifact không xác nhận khả năng chạy hoặc hiệu năng.
