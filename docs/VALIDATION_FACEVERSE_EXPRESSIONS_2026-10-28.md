# Tai FaceVerse local và sáu biểu cảm — 28/10/2026

## Thay đổi

- Thay tai thủ tục bằng vùng tai của GLB FaceVerse trung tính đã có sẵn trong workspace. Kiểm tra SHA-256 trước khi đọc; không tải model mới hoặc gọi inference bên ngoài.
- Một lượt Loop refinement; raycast theo bề mặt sọ để đặt tai; nén relief sâu nhất theo chiều ngang để hõm không bị sọ lấp. Chân tai có vertex alpha, phần pinna đục tách thành group riêng; dùng cùng hàm màu da/roughness với sọ và cổ. Đây là ghép các surface giao nhau, không phải boolean union.
- Sáu morph target thủ tục: vui, buồn, tức giận, ngạc nhiên, sợ hãi và ghê tởm. Nút chọn độc lập, mức độ 0–100%, nút trung tính. Đây không phải expression basis của FaceVerse.
- Bỏ 18 tam giác lấp trong viền môi ở cage hiển thị/bake atlas; template và anchor của fitter giữ nguyên. Mặt trong miệng bám vòng môi và có cùng morph target; không dùng khối cầu có thể xuyên cằm.
- GLB giữ tên target, position/normal deltas và weights. Kiểm tra bounds theo pose hiện tại khi xuất/mở lại; UI nhận lại biểu cảm và mức độ đã lưu.

## Kiểm chứng thực tế

Chrome 156 headless trên máy phát triển, `http://localhost:8100/`. Ba ảnh local do người dùng cung cấp: `72993_v9_bb.jpg`, `541539897_3122536477922780_7397788569813273634_n.jpg`, `images (9).jpeg`. Không lưu ảnh hoặc GLB thử vào repo.

- Quan sát tai cận cảnh/nghiêng và góc ¾ trên ảnh chính; xem GLB mở lại ở góc ¾. Đối chiếu chính diện ảnh kính gọng dày: gọng đen vẫn hiện đầy đủ trong ảnh kiểm tra. Đối chiếu góc ¾ trên ảnh da tối.
- Bấm cả sáu nút, kiểm tra weights trên mặt và mặt trong miệng ở bốn mức 0/25/50/100%: 24 trường hợp. Chỉ target được chọn có weight; mức 0 render trùng ảnh trung tính trong phiên. Các nút cập nhật `aria-pressed` đúng.
- Đổi face width, chuyển Cartoon rồi về Natural vẫn giữ biểu cảm/mức đã chọn. Nạp GLB trung tính cũ không có morph: toàn bộ nút biểu cảm được khóa đúng.
- Ảnh ghép sáu biểu cảm ở mức 80% được chụp từ renderer, kiểm tra trực quan với ảnh có kính mảnh và ảnh không kính.
- Position/color/morph buffers hữu hạn; màu và alpha trong [0,1], số đỉnh morph khớp geometry. Phiên kiểm tra không ghi nhận lỗi JavaScript hoặc resource khác origin.
- Xuất GLB ở biểu cảm ngạc nhiên 65%, đối chiếu bounds rồi nạp qua input **Mở GLB**: giữ đúng biểu cảm và mức 65%; tiếp tục chọn vui/trung tính được. File thử 13.246.424 byte, 7 mesh, tổng 137.319 đỉnh theo loader (material primitives có thể dùng lại cùng buffer), 1 mesh có texture. Hai mesh nguồn có morph là đầu và trong miệng; mỗi tai preview có 4.617 đỉnh.
- Render trước/sau mở lại ở cùng camera có sai khác RGB trung bình khoảng 0,46/255, lớn nhất 71/255; không khẳng định giống tuyệt đối từng pixel.
- `npm run build` hoàn tất gồm `tsc --noEmit` và Vite production build. Còn cảnh báo bundle lớn hơn 500 kB.

## Giới hạn

Tai là hình học trung bình FaceVerse được điều chỉnh để đặt trên sọ thủ tục, không tái dựng tai riêng của người trong ảnh. Mép ghép dùng alpha nên không phải topology kín dùng để in 3D; khi phóng rất gần vẫn có thể thấy chuyển tiếp. Sáu biểu cảm là biến dạng cage có giới hạn; texture nguồn, kính, bóng sáng và biểu cảm chụp sẵn vẫn đi theo surface. Chưa có răng/lưỡi, facial rig hoặc expression basis học từ dữ liệu. Chưa chạy browser matrix, đánh giá nhiều danh tính hay mọi tổ hợp shape.

Nguồn/checksum và tình trạng giấy phép model local được giữ trong [bảng nguồn asset](THIRD_PARTY_ASSETS.md). Không đánh dấu điều khoản model-data đã được xác minh. Biên bản tai thủ tục trước đó không áp dụng cho topology mới.
