# Portrait Head Lab

Thư viện **một ảnh → đầu trọc 3D → GLB**, chạy trong trình duyệt, kèm web demo xem 360°. Demo và repo `twa-moodlab-mobile` dùng chung source qua package local `@twa/portrait-head`; không copy core hoặc asset sang app. Không dùng server inference hoặc API trả phí. Tai tái sử dụng mesh trung tính FaceVerse đã có sẵn local; không chạy FaceVerse inference. Bề mặt mặt canonical giữ correspondence landmark/UV; profile sọ/cổ được cá nhân hóa từ mask tóc, da mặt/da cơ thể và các tham số khớp landmark (chiều dài/độ cao chỏm sọ, độ rộng hộp sọ/trán/thái dương và phần cổ nhìn thấy), rồi sinh bằng mesh thủ tục. Chiều sâu sọ phía sau vẫn là prior hình học vì một ảnh chính diện không đủ thông tin để khôi phục chính xác phần khuất; đây không phải scan 3D thật.

## Dùng thư viện

Package `@twa/portrait-head` cung cấp sẵn JavaScript ESM, typings, worker và asset runtime. App chỉ cài rồi gọi SDK; không khai báo biến `ML_`, thêm plugin Vite, copy asset hoặc compile source TypeScript của thư viện.

```ts
import { PortraitHeadPipeline } from '@twa/portrait-head';

const sdk = new PortraitHeadPipeline();
const head = await sdk.generate(file, { signal, onProgress });
scene.add(head.root);
// App có thể lưu head.data rồi gọi sdk.restore(data) để mở lại.
// Khi không còn dùng: head.dispose(); sdk.dispose();
```

- `src/`: source thuật toán, schema face và API SDK.
- `runtime/`: JS, typings, hai worker và 19 payload asset đã chuẩn bị, được package export trực tiếp.
- `portrait-head.config.js`: cấu hình asset/CDN thuộc thư viện. Giá trị mặc định rỗng dùng asset đóng gói, không yêu cầu public path của app.
- `assets/`: bản raw đã pin để quản lý nguồn/giấy phép và upload CDN sau này.
- `demo/`: package demo độc lập, có Vite/TypeScript, lockfile và lệnh chạy riêng.

Asset được đóng gói thành các payload gzip nạp khi cần, giải nén bằng tiện ích fflate đã có trong Three.js, kiểm tra byte count/SHA-256 rồi tạo Blob URL. Package không chứa thêm một bản raw của toàn bộ model; bản raw vẫn có sẵn trong repo. Worker đã là JavaScript, SDK tự quản lý vòng đời và thu hồi URL worker khi hủy/dispose. Không có inference API hoặc upload ảnh.

API đầy đủ: [hướng dẫn thư viện](docs/LIBRARY.md). App MoodLab dùng `file:../portrait-head-lab`; hai checkout cần đặt cạnh nhau khi dùng liên kết local. App chỉ giữ ghép body, skinning, wardrobe, UI, lưu dữ liệu theo tài khoản và luồng Save hiện có.

## Chạy demo

Demo dùng Node >= 22.12 và npm. Model và artifact SDK đã có sẵn trong repo.

```sh
cd /Users/luongnhatduy/Desktop/portrait-head-lab
npm ci --ignore-scripts
cd demo
npm ci --ignore-scripts --install-links=false
npm run dev
```

Mở **http://localhost:5187**. Chọn ảnh → crop → **Dựng đầu 3D** → xem 360°, đổi style/hình học/biểu cảm → tải GLB hoặc mở lại file. Demo dùng API cấp thấp của cùng SDK cho các công cụ chẩn đoán; không có pipeline thuật toán riêng.

## Cấu hình CDN của thư viện

Mặc định không cần CDN hoặc cấu hình ở app. Khi có CDN, upload nội dung `assets/` từ repo và đặt `assetBaseUrl` trong **`portrait-head.config.js` của thư viện** thành URL thư mục CDN có phiên bản, giữ nguyên tên file và thư mục. Cập nhật package thư viện cho các consumer; không đặt biến CDN trong từng app.

SDK vẫn kiểm tra checksum rồi cung cấp Blob URL cho worker. CDN cần cho phép CORS từ origin ứng dụng. Nếu host có CSP, cần cho phép Blob worker/script, kết nối Blob và WebAssembly; thêm origin CDN vào `connect-src` khi dùng CDN. Demo đã có các quyền Blob cần thiết. Chưa có upload hoặc deployment nào được thực hiện.

## Phát triển SDK

Runtime đã chuẩn bị sẵn để consumer dùng ngay. Sau khi sửa source SDK hoặc thay asset pin, người phát triển thư viện chạy `npm run prepare:runtime` để cập nhật JS, typings, worker và payload. Đây là đóng gói artifact của SDK, không phải bước triển khai tại app, không tải model hay chạy kiểm thử. TypeScript/esbuild ở root chỉ là devDependency của công cụ đóng gói SDK; Vite vẫn chỉ ở demo. Gói phân phối loại source tooling và demo.

Metadata giấy phép FaceVerse giữ nguyên trạng thái chưa xác minh quyền phân phối model; nguồn và bằng chứng tại [THIRD_PARTY_ASSETS](docs/THIRD_PARTY_ASSETS.md).

## Có gì trong bản thử

- Crop và xoay, xử lý orientation ảnh; ảnh lớn được giảm còn tối đa 2048 px trước crop 1024 px.
- MediaPipe CPU/WASM trong classic worker: phát hiện 478 landmark, kiểm tra một mặt, mask tóc/da.
- Mesh đầu–cổ thủ tục: loft liền từ đường viền mặt qua đỉnh sọ, chẩm và gáy xuống đáy cổ; profile riêng cho vùng dưới cằm và cổ trước; cổ mở rộng về đáy; tai lấy hình học từ mesh FaceVerse trung tính local, cùng màu da theo ảnh.
- Anchor barycentric có phiên bản; 23 tham số hình học, tối ưu Huber 2D reprojection + prior, pose/camera và ba tham số biểu cảm riêng. Có bounds, early stop và time budget.
- Texture ảnh theo correspondence, kiểm tra hướng/độ sâu, mask tóc, giữ lông mày, blend ra màu da ở viền; vùng khuất không lặp khuôn mặt.
- Natural, Cartoon, Caricature; 8 thanh chỉnh mesh và da phẳng; thay style không cộng dồn biến dạng.
- Sáu preset theo mobile: Unbothered, Locked in, Cracking up, Full panic, Big winner, Spectacular flop. Delta FaceVerse chuyển sang cage mặt hiện tại; mức độ 0–100% tương ứng trọng số 0–2, nút trung tính đặt weights về 0.
- Khoang miệng có thành và mặt phía sau; răng trên, răng dưới và lưỡi FaceVerse có morph đồng bộ. GLB lưu bộ preset và mức điều khiển; GLB cũ vẫn dùng bộ sáu cảm xúc cũ.
- GLB có morph targets, texture sRGB, đơn vị mét, Y lên, +Z trước; PNG; GLB re-import.
- So sánh tối đa 5 kết quả trong RAM; overlay landmark; thời gian theo bước và p50/p95 của phiên; tải số đo JSON không chứa ảnh/landmark.

## Trạng thái kiểm chứng

Đã tách thư viện dùng chung và demo, hợp nhất worker hỗ trợ crop thủ công/tự động, chuyển app sang liên kết local. **Chưa chạy test, build, lint, formatter, typecheck hoặc nghiệm thu browser cho lần tách này**. Các kết quả bên dưới thuộc phiên bản trước, không xác nhận chất lượng hoặc hiệu năng của phiên bản hiện tại.

Đã chạy thử trên **Chrome 156 tại `http://localhost:8100/`**: xem chính diện/nghiêng/sau/góc thấp, dựng từ một ảnh mẫu, kiểm tra 57 tổ hợp hình học/phong cách, đổi slider/da phẳng và đối chiếu GLB mở lại với preview. Typecheck và production build đã qua. Chi tiết và giới hạn: [biên bản kiểm tra](docs/VALIDATION_2026-10-28.md).

Chưa kiểm tra Safari/Firefox, chưa có bộ ảnh 30–50 người hoặc blind test, chưa có kết luận độ giống hay benchmark đa thiết bị.

Tai FaceVerse local và bộ sáu biểu cảm thủ tục trước đây từng được đối chiếu trên ba ảnh, 24 mức biểu cảm, GLB xuất/mở lại và build/typecheck; phạm vi cùng giới hạn ghi trong [biên bản riêng](docs/VALIDATION_FACEVERSE_EXPRESSIONS_2026-10-28.md). Các số tổ hợp hình học ở biên bản cũ mô tả phiên bản trước thay đổi tai.

Template canonical MediaPipe cung cấp mặt, UV và anchors; mesh sọ/cổ là hình học thủ tục viết riêng; tai dùng mesh FaceVerse trung bình local, không phải identity basis học từ dữ liệu. Chất lượng phía nghiêng, tai, gáy và cổ cần kiểm tra trực quan trên nhiều ảnh; không khẳng định đây là mô hình giải phẫu chính xác hoặc mesh sẵn sàng rig.

Chi tiết: [kiến trúc và giới hạn](docs/PORTRAIT_HEAD_3D.md), [nguồn và giấy phép](docs/THIRD_PARTY_ASSETS.md), [kịch bản thử thủ công](docs/MANUAL_TEST.md).
