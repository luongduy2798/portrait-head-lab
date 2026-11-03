# Portrait Head Lab

Thư viện **một ảnh → đầu trọc 3D → GLB**, chạy trong trình duyệt, kèm web demo xem 360°. Demo và repo twa-moodlab-mobile dùng chung source qua package local @twa/portrait-head; không copy core hoặc asset sang app. Không dùng server inference hoặc API trả phí. Tai tái sử dụng mesh trung tính FaceVerse tải từ CDN; không chạy FaceVerse inference. Bề mặt mặt canonical giữ correspondence landmark/UV; profile sọ/cổ được cá nhân hóa từ mask tóc, da mặt/da cơ thể và các tham số khớp landmark (chiều dài/độ cao chỏm sọ, độ rộng hộp sọ/trán/thái dương và phần cổ nhìn thấy), rồi sinh bằng mesh thủ tục. Chiều sâu sọ phía sau vẫn là prior hình học vì một ảnh chính diện không đủ thông tin để khôi phục chính xác phần khuất; đây không phải scan 3D thật.

## Dùng thư viện

Package @twa/portrait-head cung cấp JavaScript ESM, typings, worker và manifest checksum; payload model/runtime được tải trực tiếp từ CDN. App chỉ cài rồi gọi SDK; không khai báo biến ML_, thêm plugin Vite, copy asset hoặc compile source TypeScript của thư viện.

```ts
import { PortraitHeadPipeline } from '@twa/portrait-head';

const sdk = new PortraitHeadPipeline();
const head = await sdk.generate(file, { signal, onProgress });
scene.add(head.root);
// App có thể lưu head.data rồi gọi sdk.restore(data) để mở lại.
// Khi không còn dùng: head.dispose(); sdk.dispose();
```

- `src/`: source thuật toán, schema face và API SDK.
- runtime/: JS, typings, hai worker và manifest checksum; không chứa payload model/WASM/GLB.
- portrait-head.config.js: cấu hình CDN thuộc thư viện, mặc định là https://static.moodlab.dev/portrait-head/.
- licenses/, asset-registry.json, provenance/: license và metadata nguồn/checksum; không chứa payload runtime.
- `demo/`: package demo độc lập, có Vite/TypeScript, lockfile và lệnh chạy riêng.

SDK tải 19 payload đã pin từ CDN, kiểm tra byte count/SHA-256 rồi tạo Blob URL cho worker và loader. Package không chứa bản local của model, WASM, template hoặc GLB; không có fallback local. Cần kết nối tới CDN và CORS cho phép origin ứng dụng. Worker đã là JavaScript, SDK tự quản lý vòng đời và thu hồi URL worker khi hủy/dispose. Không có inference API hoặc upload ảnh.

API đầy đủ: [hướng dẫn thư viện](docs/LIBRARY.md). App MoodLab dùng `file:../portrait-head-lab`; hai checkout cần đặt cạnh nhau khi dùng liên kết local. App chỉ giữ ghép body, skinning, wardrobe, UI, lưu dữ liệu theo tài khoản và luồng Save hiện có.

## Chạy demo

Demo dùng Node >= 22.12 và npm. Model/runtime được tải từ CDN khi chạy.

```sh
cd /Users/luongnhatduy/Desktop/portrait-head-lab
npm ci --ignore-scripts
cd demo
npm ci --ignore-scripts --install-links=false
npm run dev
```

Mở **http://localhost:5187**. Chọn ảnh → crop → **Dựng đầu 3D** → xem 360°, đổi style/hình học/biểu cảm → tải GLB hoặc mở lại file. Demo dùng API cấp thấp của cùng SDK cho các công cụ chẩn đoán; không có pipeline thuật toán riêng.

## Cấu hình CDN của thư viện

SDK mặc định dùng CDN https://static.moodlab.dev/portrait-head/; không cần upload asset hoặc cấu hình trong app. Jenkins chọn templates/.env.dev hoặc .env.prod, sau đó npm run build sinh portrait-head.config.js cho package. Có thể override ML_PORTRAIT_HEAD_ASSET_BASE_URL ở môi trường build hoặc assetBaseUrl trong constructor; không đặt biến CDN trong từng app.

SDK kiểm tra checksum rồi cung cấp Blob URL cho worker. CDN cần cho phép CORS từ origin ứng dụng. Nếu host có CSP, cần cho phép Blob worker/script, kết nối Blob và WebAssembly; thêm origin CDN vào connect-src. Không có fallback nếu CDN lỗi hoặc checksum không khớp.

## Phát triển SDK

Runtime JavaScript/typings/worker được chuẩn bị sẵn để consumer dùng ngay. Sau khi sửa source SDK hoặc manifest checksum, maintainer chạy npm run prepare:runtime để cập nhật code và metadata; script không đọc hoặc đóng gói payload local. npm run build cấu hình CDN từ environment rồi chuẩn bị runtime. TypeScript/esbuild ở root chỉ là devDependency của công cụ đóng gói SDK; Vite vẫn chỉ ở demo. Gói phân phối loại source tooling và demo.

Metadata giấy phép FaceVerse giữ nguyên trạng thái chưa xác minh quyền phân phối model; nguồn và bằng chứng tại [THIRD_PARTY_ASSETS](docs/THIRD_PARTY_ASSETS.md).

## Có gì trong bản thử

- Crop và xoay, xử lý orientation ảnh; ảnh lớn được giảm còn tối đa 2048 px trước crop 1024 px.
- MediaPipe CPU/WASM trong classic worker: phát hiện 478 landmark, kiểm tra một mặt, mask tóc/da.
- Mesh đầu–cổ thủ tục: loft liền từ đường viền mặt qua đỉnh sọ, chẩm và gáy xuống đáy cổ; profile riêng cho vùng dưới cằm và cổ trước; cổ mở rộng về đáy; tai lấy hình học từ mesh FaceVerse trung tính trên CDN, cùng màu da theo ảnh.
- Chân tai bám vào surface đầu sau subdivision, mép cắt chìm trong da và dùng material đục. Kích thước, độ cao và độ vểnh từng bên nhận số đo phần da tai nhìn thấy trong ảnh gần chính diện; nếp và hõm tai vẫn là hình dạng mẫu.
- Đường chuyển tiếp hàm–cổ riêng để tránh gập viền hàm và kéo thêm dải da dưới cằm. Texture râu đi qua một dải hẹp ở mép hàm; vùng này không bị hòa màu về da trán. Tai giữ khối vành/hõm, uốn vùng chân tai bằng trường dịch chuyển trơn và làm mịn sau ghép.
- Anchor barycentric có phiên bản; khớp pose/camera và tham số tổng thể bằng Huber 2D cùng chiều sâu tương đối có trọng số thấp hơn. Hiệu chỉnh cục bộ 468 đỉnh theo từng ảnh, có regularization, giới hạn dịch chuyển và giảm ảnh hưởng vùng bị che; số vòng cố định để không phụ thuộc tốc độ máy.
- Làm mịn có giữ đường viền mặt, mũi và độ mở mắt; giữ texture mí thật, không đắp nếp mí với độ cao cố định. Dữ liệu đầu mới lưu trường biến dạng riêng để dựng lại và đổi style không mất hình dạng đã khớp.
- Texture ảnh theo correspondence, kiểm tra hướng/độ sâu, mask tóc, giữ lông mày, blend ra màu da ở viền; vùng khuất không lặp khuôn mặt.
- Natural, Cartoon, Caricature; các thanh chỉnh mặt/tai và da phẳng; thay style không cộng dồn biến dạng.
- Sáu preset theo mobile: Unbothered, Locked in, Cracking up, Full panic, Big winner, Spectacular flop. Delta FaceVerse chuyển sang cage mặt hiện tại; mức độ 0–100% tương ứng trọng số 0–2, nút trung tính đặt weights về 0.
- Khoang miệng có thành và mặt phía sau; răng trên, răng dưới và lưỡi FaceVerse có morph đồng bộ. GLB lưu bộ preset và mức điều khiển; GLB cũ vẫn dùng bộ sáu cảm xúc cũ.
- GLB có morph targets, texture sRGB, đơn vị mét, Y lên, +Z trước; PNG; GLB re-import.
- So sánh tối đa 5 kết quả trong RAM; overlay landmark; thời gian theo bước và p50/p95 của phiên; tải số đo JSON không chứa ảnh/landmark.

## Trạng thái kiểm chứng

Thay đổi ngày 03/11/2026 sửa tiếp cằm, mép râu và bề mặt tai sau phản hồi cận cảnh; xem [biên bản cằm/râu/tai](docs/VALIDATION_CHIN_EAR_2026-11-03.md). [Biên bản ghép tai trước đó](docs/VALIDATION_EAR_ATTACHMENT_2026-11-03.md) mô tả bước thêm số đo tai theo ảnh. Chưa xác nhận tái dựng đúng hình dạng tai riêng hoặc chất lượng production.

Thay đổi ngày 02/11/2026 bổ sung hiệu chỉnh hình mặt và bỏ nếp mí thủ tục. Chiều sâu MediaPipe vẫn là dự đoán, không phải phép đo mũi/má; phần sọ phía khuất vẫn là prior. Đây chưa phải xác nhận production hoặc tái dựng chính xác danh tính. Phạm vi xem thử local được ghi tại [biên bản hiệu chỉnh mặt](docs/VALIDATION_IDENTITY_2026-11-02.md).

Đã tách thư viện dùng chung và demo, hợp nhất worker hỗ trợ crop thủ công/tự động, chuyển app sang liên kết local. **Chưa chạy test, build, lint, formatter, typecheck hoặc nghiệm thu browser cho lần tách này**. Các kết quả bên dưới thuộc phiên bản trước, không xác nhận chất lượng hoặc hiệu năng của phiên bản hiện tại.

Đã chạy thử trên **Chrome 156 tại `http://localhost:8100/`**: xem chính diện/nghiêng/sau/góc thấp, dựng từ một ảnh mẫu, kiểm tra 57 tổ hợp hình học/phong cách, đổi slider/da phẳng và đối chiếu GLB mở lại với preview. Typecheck và production build đã qua. Chi tiết và giới hạn: [biên bản kiểm tra](docs/VALIDATION_2026-10-28.md).

Chưa kiểm tra Safari/Firefox, chưa có bộ ảnh 30–50 người hoặc blind test, chưa có kết luận độ giống hay benchmark đa thiết bị.

Tai FaceVerse local và bộ sáu biểu cảm thủ tục trước đây từng được đối chiếu trên ba ảnh, 24 mức biểu cảm, GLB xuất/mở lại và build/typecheck; phạm vi cùng giới hạn ghi trong [biên bản riêng](docs/VALIDATION_FACEVERSE_EXPRESSIONS_2026-10-28.md). Các số tổ hợp hình học ở biên bản cũ mô tả phiên bản trước thay đổi tai.

Template canonical MediaPipe cung cấp mặt, UV và anchors; mesh sọ/cổ là hình học thủ tục viết riêng; tai dùng mesh FaceVerse trung bình local, không phải identity basis học từ dữ liệu. Chất lượng phía nghiêng, tai, gáy và cổ cần kiểm tra trực quan trên nhiều ảnh; không khẳng định đây là mô hình giải phẫu chính xác hoặc mesh sẵn sàng rig.

Chi tiết: [kiến trúc và giới hạn](docs/PORTRAIT_HEAD_3D.md), [nguồn và giấy phép](docs/THIRD_PARTY_ASSETS.md), [kịch bản thử thủ công](docs/MANUAL_TEST.md).
