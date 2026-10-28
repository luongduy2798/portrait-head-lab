# Portrait Head Lab

Repo thử nghiệm độc lập: **một ảnh → đầu trọc 3D → preview 360° → GLB**, chạy trong trình duyệt. Không tích hợp vào app hoặc sửa repo MoodLab. Không dùng server inference hoặc API trả phí. Tai tái sử dụng mesh trung tính FaceVerse đã có sẵn local; không chạy FaceVerse inference. Bề mặt mặt canonical giữ correspondence landmark/UV; sọ, gáy và cổ được tự sinh bằng mesh thủ tục dựa trên đường viền mặt và profile giải phẫu gần đúng. Phần khuất vẫn là ước lượng từ một ảnh, không phải scan 3D thật.

## Chạy local

Cần Node >= 22.12 và npm. Dependencies, model và WASM đã được chuẩn bị trong workspace này.

```sh
cd /Users/luongnhatduy/Desktop/portrait-head-lab
npm run dev
```

Mở **http://localhost:5187**. Chọn JPEG/PNG/WebP → kéo/zoom/xoay crop → **Dựng đầu 3D** → xem chính diện, ¾, sau → thử Natural/Cartoon/Caricature và chỉnh hình học → chọn một trong sáu biểu cảm, chỉnh mức độ → **Tải head.glb**. **Mở GLB** dùng để xem lại file đã tải. Khi export, ứng dụng cũng đọc lại GLB và đối chiếu bounds trước khi tải xuống.

Khi clone lại repo, chuẩn bị một lần:

```sh
npm ci --ignore-scripts
npm run assets
npm run assets:template
npm run dev
```

Tai cần file local `public/assets/faceverse/faceverse-neutral.glb` và checksum đúng như `docs/THIRD_PARTY_ASSETS.md`. File này đã có trong workspace, không nằm trong bước tải asset MediaPipe và không được tự tải từ CDN khi thiếu.

MediaPipe JS/WASM, canonical face và anchors được phục vụ từ `public/`. Sau khi tải trang, việc dựng mesh đầu–cổ chỉ dùng dữ liệu local và chạy trên thiết bị; không có request tới dịch vụ dựng mặt bên ngoài, không upload ảnh và không analytics.

## Có gì trong bản thử

- Crop và xoay, xử lý orientation ảnh; ảnh lớn được giảm còn tối đa 2048 px trước crop 1024 px.
- MediaPipe CPU/WASM trong classic worker: phát hiện 478 landmark, kiểm tra một mặt, mask tóc/da.
- Mesh đầu–cổ thủ tục: loft liền từ đường viền mặt qua đỉnh sọ, chẩm và gáy xuống đáy cổ; profile riêng cho vùng dưới cằm và cổ trước; cổ mở rộng về đáy; tai lấy hình học từ mesh FaceVerse trung tính local, cùng màu da theo ảnh.
- Anchor barycentric có phiên bản; 23 tham số hình học, tối ưu Huber 2D reprojection + prior, pose/camera và ba tham số biểu cảm riêng. Có bounds, early stop và time budget.
- Texture ảnh theo correspondence, kiểm tra hướng/độ sâu, mask tóc, giữ lông mày, blend ra màu da ở viền; vùng khuất không lặp khuôn mặt.
- Natural, Cartoon, Caricature; 8 thanh chỉnh mesh và da phẳng; thay style không cộng dồn biến dạng.
- Sáu biểu cảm vui/buồn/tức giận/ngạc nhiên/sợ hãi/ghê tởm, mức độ 0–100%, nút trung tính; GLB mở lại vẫn chỉnh được.
- GLB có morph targets, texture sRGB, đơn vị mét, Y lên, +Z trước; PNG; GLB re-import.
- So sánh tối đa 5 kết quả trong RAM; overlay landmark; thời gian theo bước và p50/p95 của phiên; tải số đo JSON không chứa ảnh/landmark.

## Trạng thái kiểm chứng

Đã chạy thử trên **Chrome 156 tại `http://localhost:8100/`**: xem chính diện/nghiêng/sau/góc thấp, dựng từ một ảnh mẫu, kiểm tra 57 tổ hợp hình học/phong cách, đổi slider/da phẳng và đối chiếu GLB mở lại với preview. Typecheck và production build đã qua. Chi tiết và giới hạn: [biên bản kiểm tra](docs/VALIDATION_2026-10-28.md).

Chưa kiểm tra Safari/Firefox, chưa có bộ ảnh 30–50 người hoặc blind test, chưa có kết luận độ giống hay benchmark đa thiết bị.

Tai FaceVerse local và sáu biểu cảm đã được đối chiếu trên ba ảnh, 24 mức biểu cảm, GLB xuất/mở lại và build/typecheck; phạm vi cùng giới hạn ghi trong [biên bản riêng](docs/VALIDATION_FACEVERSE_EXPRESSIONS_2026-10-28.md). Các số tổ hợp hình học ở biên bản cũ mô tả phiên bản trước thay đổi tai.

Template canonical MediaPipe cung cấp mặt, UV và anchors; mesh sọ/cổ là hình học thủ tục viết riêng; tai dùng mesh FaceVerse trung bình local, không phải identity basis học từ dữ liệu. Chất lượng phía nghiêng, tai, gáy và cổ cần kiểm tra trực quan trên nhiều ảnh; không khẳng định đây là mô hình giải phẫu chính xác hoặc mesh sẵn sàng rig.

Chi tiết: [kiến trúc và giới hạn](docs/PORTRAIT_HEAD_3D.md), [nguồn và giấy phép](docs/THIRD_PARTY_ASSETS.md), [kịch bản thử thủ công](docs/MANUAL_TEST.md).
