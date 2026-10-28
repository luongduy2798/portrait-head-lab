# Kiểm tra gáy–cổ ngày 28/10/2026

Chạy trên `http://localhost:8100/`, macOS, Chrome/156.0.8078.48 qua Chrome DevTools Protocol. Giữ nguyên camera, ánh sáng và vật liệu của `HeadViewer`; không thay shader để che nếp gãy.

## Thay đổi đã đối chiếu

- Bỏ phép chiếu/nắn gáy sau subdivision gây phồng và biến dạng cổ.
- Làm mềm cage vùng gáy trước subdivision, neo mặt/đỉnh sọ/đáy cổ.
- Thêm hai vòng đồng tâm ở đáy cổ để loại vết nhăn từ quạt tam giác.
- Giữ camera khi đổi slider/phong cách bằng callback animation frame đúng kiểu.
- Khi xuất GLB, giữ tai ở dạng một material và bỏ `COLOR_0` khỏi primitive không dùng vertex colors, tránh mất tai hoặc nhuộm màu mặt hai lần.
- Cho phép `blob:` trong `connect-src` để GLTFLoader đọc texture nhúng local bằng ImageBitmap; không thêm nguồn mạng bên ngoài.

## Kết quả

| Kiểm tra | Kết quả quan sát |
| --- | --- |
| Typecheck | `node_modules/.bin/tsc --noEmit` qua |
| Production build | `node_modules/.bin/vite build` qua; còn cảnh báo bundle JS lớn hơn 500 kB |
| Hình học | 57 tổ hợp: neutral, 8 slider ở hai cực, hai tổ hợp mặt hẹp/dài và rộng/ngắn, trên Natural/Cartoon/Caricature; tọa độ hữu hạn, normals đơn vị, thể tích có dấu hướng ra ngoài |
| Topology | Ba trường hợp neutral theo ba style: mỗi cạnh có hai tam giác ngược hướng; không có cạnh hở trên mesh mặt–sọ–cổ |
| Trực quan | Chính diện, hai phía nghiêng, sau, góc thấp; thêm tổ hợp hẹp/dài, rộng/ngắn và Caricature. Ảnh chụp mới không còn khối phồng do phép chiếu và vết nhăn quanh mép đáy cổ |
| Dựng từ ảnh | Chọn ảnh PNG → crop mặc định → Dựng đầu 3D thành công; không có lỗi JavaScript được ghi nhận trong lượt dựng |
| Điều khiển | 7 lượt đổi style, faceWidth và da phẳng: không lỗi, camera giữ nguyên, texture bật/tắt đúng |
| GLB từ ảnh | 4 mesh sau import, 1 material có texture, bounds khớp preview trong ngưỡng 0,1 mm của ứng dụng; file kiểm tra 4.112.984 byte, chỉ xử lý trong RAM |
| Ảnh GLB so preview | Cùng camera/ánh sáng, 1000×1000 px: sai khác trung bình 0,0090255 trên thang kênh 0–255; không yêu cầu ảnh giống từng pixel |

Ảnh đối chiếu và harness dùng trong phiên nằm tại `/tmp/portrait-head-lab-review/` và `/tmp/phl-*.js`, `/tmp/phl-browser.mjs`. Đây là artifact kiểm tra local, không phải asset được ứng dụng tải. Dữ liệu tổng hợp của mesh kiểm tra: 59.842 đỉnh, 119.680 tam giác, chưa gồm tai.

## Ảnh mẫu và giới hạn

Ảnh `astronaut.png` của scikit-image **v0.25.2**, chỉ tải vào `/tmp/phl-astronaut.png`, không thêm vào repo hoặc gửi ảnh tới backend. [Nguồn phiên bản cố định](https://raw.githubusercontent.com/scikit-image/scikit-image/v0.25.2/skimage/data/astronaut.png); [tài liệu nguồn/giấy phép](https://scikit-image.org/docs/0.25.x/api/skimage.data.html#skimage.data.astronaut) ghi ảnh NASA được phát hành public domain. SHA-256: `88431cd9653ccd539741b555fb0a46b61558b301d4110412b5bc28b5e3ea6cb5`.

Đây là một trình duyệt trên một máy và một ảnh thật. Chưa kiểm tra Safari/Firefox/mobile, chưa đo hiệu năng đa thiết bị, chưa kiểm tra tự giao nhau của mọi tổ hợp shape, chưa xác nhận độ giống danh tính hoặc tính đúng giải phẫu. Không coi kết quả là nghiệm thu rigging/in 3D.
