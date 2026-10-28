# Kiểm chứng thay đổi tai — 28/10/2026

Đây là biên bản của bản tai thủ tục cũ. Runtime hiện dùng tai FaceVerse local; xem [biên bản mới](VALIDATION_FACEVERSE_EXPRESSIONS_2026-10-28.md).

## Phạm vi

Kiểm tra tại `http://localhost:8100/` bằng Chrome headless trên máy phát triển. Ảnh chính: `72993_v9_bb.jpg`; đối chiếu thêm `541539897_3122536477922780_7397788569813273634_n.jpg` và `images (9).jpeg` do người dùng cung cấp. Ảnh chỉ xử lý trong phiên trình duyệt local, không đưa vào repo hoặc gửi đến dịch vụ inference.

Tai cũ gần như nằm trong mặt phẳng hướng ra trước, phần lớn bị sọ che nên nhìn nghiêng thành một thanh mỏng. Thay đổi chỉ nằm ở hình học tai và cách đặt tai trong `src/core/mesh.ts`: hướng ra ngoài, thêm relief vành/hõm/gờ/dái, đóng mặt sau bằng vòng biên chung và lấy vị trí chân tai trên surface đầu thực tế. Không đổi texture, màu da, vật liệu hoặc ánh sáng trong lần sửa này.

## Kết quả

- `npm run build` hoàn tất, gồm `tsc --noEmit` và Vite production build. Còn cảnh báo kích thước bundle trên 500 kB.
- Quan sát chính diện, góc ¾ hai bên, phía sau và cận cảnh nhìn nghiêng trong quá trình chỉnh. Bản cuối đã đối chiếu chính diện/cận cảnh với ảnh chính, chính diện với gọng kính dày và góc ¾ với ảnh da tối. Hõm và vành tai hiện thành hình khối; kính dày vẫn giữ gọng đen trong ảnh đối chiếu.
- Kiểm tra hình học bản cuối trên 14 tổ hợp, tổng 28 tai: neutral, fit từ ảnh chính, hai đầu khoảng ear size/height, face width/length, hai tổ hợp cực trị và hai style cartoon/caricature. Tọa độ, màu, normals hữu hạn; normals đơn vị; không có tam giác suy biến; mỗi cạnh có đúng hai mặt với chiều ngược nhau; thể tích có dấu dương.
- Khoảng cách giữa cặp đỉnh mặt trước/sau theo trục relief dương tại các đỉnh bên trong được kiểm tra (nhỏ nhất khoảng 0,82 mm). Điểm giữa chân tai phía trước nằm trong đầu ở các trường hợp này; điểm vành sau được kiểm tra nằm ngoài đầu. Đây là kiểm tra điểm mẫu, chưa chứng minh không tự xuyên ở mọi vị trí/tổ hợp slider.
- GLB của ảnh chính xuất và mở lại được: 4.519.004 byte, 4 mesh, tổng 125.704 đỉnh theo bộ đọc GLB, 1 mesh có texture. Mỗi tai có 3.010 đỉnh và giữ vertex colors. Bounds nằm trong sai số cho phép 0,1 mm. So sánh ảnh render trước/sau mở lại có sai khác RGB trung bình khoảng 0,35/255, lớn nhất 55/255; hai ảnh không giống tuyệt đối từng pixel.
- Không ghi nhận lỗi JavaScript trong phiên đối chiếu GLB.

## Nguồn và giới hạn

Hình học tai được viết bằng code trong repo, không tải thêm model hoặc texture. Tên và bố cục các phần tai tham khảo [NIH Elements of Morphology — Ear anatomy](https://elementsofmorphology.nih.gov/anatomy-ear.shtml). Không có asset bên thứ ba mới cần pin/checksum.

Tai vẫn là hình dạng tổng quát, chưa tái dựng đặc điểm tai riêng trong ảnh. Hai tai là các mesh kín riêng giao với đầu, chưa thành một khối union để in 3D. Kết quả chỉ áp dụng cho các ảnh, tổ hợp tham số và trình duyệt đã nêu; chưa kiểm chứng browser matrix, rigging hoặc mọi trường hợp tự xuyên.
