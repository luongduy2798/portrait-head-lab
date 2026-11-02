# Portrait Head Lab

Thư viện **một ảnh → đầu trọc 3D → GLB**, chạy trong trình duyệt, kèm web demo xem 360°. Demo và repo `twa-moodlab-mobile` dùng chung source qua package local `@twa/portrait-head`; không copy core hoặc asset sang app. Không dùng server inference hoặc API trả phí. Tai tái sử dụng mesh trung tính FaceVerse đã có sẵn local; không chạy FaceVerse inference. Bề mặt mặt canonical giữ correspondence landmark/UV; profile sọ/cổ được cá nhân hóa từ mask tóc, da mặt/da cơ thể và các tham số khớp landmark (chiều dài/độ cao chỏm sọ, độ rộng hộp sọ/trán/thái dương và phần cổ nhìn thấy), rồi sinh bằng mesh thủ tục. Chiều sâu sọ phía sau vẫn là prior hình học vì một ảnh chính diện không đủ thông tin để khôi phục chính xác phần khuất; đây không phải scan 3D thật.

## Cấu trúc và dùng chung

- `src/`, `assets/`: core, hai worker, API TypeScript và một bộ asset chung ở root.
- `demo/`: package riêng cho web demo, có `package.json`, lockfile, Vite, TypeScript compiler và các lệnh chạy/build riêng; import thư viện qua `file:..`.
- `integrations/`: adapter host tùy chọn. Entry `@twa/portrait-head/vite` chỉ dùng khi ứng dụng chọn Vite; core không import adapter này.

API và tích hợp host: [hướng dẫn thư viện](docs/LIBRARY.md).
App dùng dependency `file:../portrait-head-lab`; hai repo cần đặt cạnh nhau và cài dependencies ở cả hai repo. Từ repo app chạy `npm install --ignore-scripts --install-links=false --no-audit --no-fund` một lần để tạo liên kết, rồi dùng lệnh dev hiện có. Sửa core trong package để demo và app cùng nhận thay đổi; tải lại trang để thay các worker đang chạy.

Package root chỉ khai báo Three.js cần cho core và bộ type phục vụ phát triển thư viện. Không có Vite, TypeScript compiler, workspace hoặc lệnh chạy demo ở root. Demo chỉ được cài khi cài riêng trong `demo/`; danh sách `files` của thư viện loại demo khỏi gói phân phối. Core export source TypeScript/ESM và dùng API trình duyệt; host tự chọn compiler/bundler.

Toàn bộ asset runtime đã có sẵn trong `assets/`; không có bước tải model, sinh template hoặc trích biểu cảm. Host phục vụ bộ file này hoặc cấu hình CDN. Adapter Vite tùy chọn phục vụ asset khi dev và mặc định đính kèm chúng khi build.

## Chạy demo

Demo dùng Node >= 22.12 và npm. Model, WASM, template và dữ liệu biểu cảm đã có sẵn trong repo.

```sh
cd /Users/luongnhatduy/Desktop/portrait-head-lab
npm ci --ignore-scripts
cd demo
npm ci --ignore-scripts --install-links=false
npm run dev
```

Mở **http://localhost:5187**. Chọn JPEG/PNG/WebP → kéo/zoom/xoay crop → **Dựng đầu 3D** → xem chính diện, ¾, sau → thử Natural/Cartoon/Caricature và chỉnh hình học → chọn một trong sáu biểu cảm, chỉnh mức độ → **Tải head.glb**. **Mở GLB** dùng để xem lại file đã tải. Khi export, ứng dụng cũng đọc lại GLB và đối chiếu bounds trước khi tải xuống.

`assets/` chứa bộ runtime hoàn chỉnh, gồm model MediaPipe, JS/WASM, template/anchors, mesh tai, rig sáu biểu cảm và răng/lưỡi. `asset-manifest.json` ghi nguồn, giấy phép, kích thước và SHA-256; plugin kiểm tra pin khi phục vụ hoặc đóng gói asset. Thiếu/sai file thì khôi phục đúng bản đã pin trong repo, không có lệnh generate hoặc tải model tự động.

## Dùng CDN sau này

Upload nội dung `assets/` lên một thư mục CDN có phiên bản, giữ nguyên tên file và cấu trúc thư mục. Consumer truyền URL thư mục đó vào `assetBaseUrl`; app MoodLab hỗ trợ biến `ML_PORTRAIT_HEAD_ASSET_BASE_URL`. Để trống biến này thì dùng asset đóng gói sẵn. Khi cấu hình CDN, app bỏ đính kèm bản asset local.

Hai worker được host bundle cùng mã ứng dụng; model và JS/WASM có thể ở CDN. CDN cần cho phép CORS từ origin ứng dụng và phục vụ `.wasm` với MIME `application/wasm`; CSP của host cần cho phép CDN ở `connect-src` và `script-src`. Không có thao tác upload CDN trong repo này.

Việc dựng đầu tiếp tục chạy trên thiết bị; request ra host asset chỉ tải file tĩnh, không upload ảnh hoặc gọi inference API. Metadata giấy phép FaceVerse giữ nguyên trạng thái chưa xác minh quyền phân phối dữ liệu model; nguồn và bằng chứng tại [THIRD_PARTY_ASSETS](docs/THIRD_PARTY_ASSETS.md).

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
