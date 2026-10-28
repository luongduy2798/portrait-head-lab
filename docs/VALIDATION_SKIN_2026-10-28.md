# Kiểm tra viền da ngày 28/10/2026

Kiểm tra theo yêu cầu với `http://localhost:8100/`, hai ảnh local `images (9).jpeg` và `72993_v9_bb.jpg`, crop mặc định, Natural, trên Chrome Headless 156.0.8078.48/macOS qua CDP. Giữ camera, ánh sáng và loại vật liệu của ứng dụng; phóng gần khi xem. Ảnh và GLB không gửi tới dịch vụ bên ngoài; ảnh kiểm tra chỉ lưu tạm ngoài repo.

Bản sửa trước đã bị người dùng phản hồi là giảm chất lượng chính diện và làm mất kính. Ghi nhận build/GLB qua ở bản cũ không phải xác nhận chất lượng hình ảnh. Kết quả dưới đây áp dụng cho bản đã bỏ blur/correction và sửa cách tiếp màu.

## Lỗi tái hiện và thay đổi

- Mask skin/erosion và vùng bảo vệ mắt quá hẹp làm loại gọng kính; blur và feather quá rộng làm mất chi tiết chính diện.
- Dùng viền mặt nguồn và vùng bảo vệ liên tục phủ cả hai mắt/gọng/sống kính; bỏ blur và luminance correction. Giảm kiểm tra độ sâu theo prior khi nguồn gần chính diện.
- Màu sọ/cổ cũ bị pha về median khi xa mặt. Nay giữ mẫu riêng từng landmark, loại mắt/kính khỏi palette, nội suy màu theo chiều cao/trái-phải và tiếp màu ra sau đầu với kernel rộng.
- Mặt và phần còn lại dùng cùng hàm màu nền, giữ khác biệt màu trán/hàm quan sát trong ảnh; không sửa lighting để che lệch màu.

## Quan sát và kiểm tra

- Tải mới trang, chọn file → Dựng đầu 3D cho cả hai ảnh; không ghi nhận lỗi JavaScript hay lỗi ứng dụng trong lượt cuối.
- Ảnh có kính: gọng và tròng hiện lại ở góc chính diện; xem thêm góc ¾. Kính vẫn là texture trên mặt, chưa phải accessory 3D.
- Ảnh còn lại: giữ chi tiết ảnh chính diện; xem hai phía ¾ và sau. Sọ, tai, cổ vẫn là màu nội suy; bóng/chói gốc có thể còn lộ tại vùng chuyển tiếp.
- So sánh màu nền atlas với vertex colors tại 36 đỉnh biên mặt: sai khác trung bình mỗi kênh khoảng 0,68/255 cho ảnh kính và 1,00/255 cho ảnh còn lại. Đây là kiểm tra nối màu vật liệu, không phải phép đo độ thật của toàn bộ da.
- Màu 62.918 đỉnh hữu hạn và trong [0,1] ở cả hai trường hợp.
- GLB export/re-import trong RAM: ảnh kính 4.377.684 byte; ảnh còn lại 4.390.476 byte. Mỗi file có 4 mesh, 1 vật liệu texture, 3 mesh vertex colors; bounds qua đối chiếu với preview theo ngưỡng 0,1 mm. Chưa đối chiếu pixel render GLB nhập lại.
- `npm run build` gồm `tsc --noEmit` và Vite production build: qua; còn cảnh báo bundle lớn hơn 500 kB.

## Giới hạn

Hai ảnh, một browser và một máy; chưa có kết luận cho mọi khuôn mặt, Safari/Firefox hoặc bộ ảnh đa góc. Bóng sáng, phản chiếu, nếp nhăn và râu trong ảnh vẫn hiện trên mặt; phần da khuất chưa có chi tiết thật. Không khẳng định đã khớp hoàn toàn màu/chất liệu toàn đầu, đạt chất lượng scan hoặc qua benchmark đa thiết bị.

## Bổ sung trường hợp gọng kính dày

Ảnh `541539897_3122536477922780_7397788569813273634_n.jpg` tái hiện mất gọng phía dưới và cắt góc trên ở bản trước: vùng giữ kính chỉ theo mí mắt nên quá hẹp, còn mask tóc loại một phần góc trên của gọng.

- Vùng bảo vệ texture mở theo lông mày và má trên khi có dấu hiệu sống kính tối liên tục; trong dải mở rộng chỉ giữ các pixel gọng tối, tránh giữ nhầm nền. Mốc lọc tóc lùi một khoảng nhỏ sát lông mày khi có gọng tối để không cắt góc gọng. Vùng loại mắt khi lấy mẫu da giữ nguyên để không đổi palette sọ/cổ.
- Tải mới trang và dựng bằng file gốc trên cùng Chrome/localhost:8100: gọng trên/dưới hiện liền ở chính diện; xem thêm góc ¾. Không ghi nhận lỗi JavaScript trong lượt này.
- Dựng lại `72993_v9_bb.jpg` ở chính diện và `images (9).jpeg` ở góc ¾ để đối chiếu với hai trường hợp trước.
- `npm run build` gồm typecheck và production build qua; vẫn có cảnh báo bundle lớn hơn 500 kB.
- GLB xuất/đọc lại trong RAM: 4.233.044 byte, 4 mesh, 1 vật liệu texture, 3 mesh có vertex colors; bounds khớp preview theo kiểm tra 0,1 mm của ứng dụng. Kính vẫn là texture, chưa có hình học kính riêng. Quy tắc mở rộng ưu tiên gọng tối; chưa kiểm chứng mọi màu/kiểu kính.
