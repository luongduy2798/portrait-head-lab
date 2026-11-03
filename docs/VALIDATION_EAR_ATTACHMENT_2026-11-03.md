# Đối chiếu ghép tai — 03/11/2026

Biên bản này mô tả bản ghép tai trước phản hồi về cằm và các điểm gợn. Cách biến dạng tai và bóng đổ đã được sửa tiếp; xem [đối chiếu cằm/râu/tai](VALIDATION_CHIN_EAR_2026-11-03.md).

Chrome headless 156 trên macOS, phiên riêng tại `http://localhost:5187/`. Dùng pipeline/renderer của repo với `linh-le.png`, `bach-nguyen.png`, `hieu-pham.png` trong thư mục ảnh được người dùng chỉ định. Ảnh, mask, texture và đầu đối chiếu chỉ nằm trong RAM; không ghi ảnh/GLB ra đĩa hoặc gọi inference API.

## Thay đổi

- Chân tai giao cắt với tam giác của đầu **sau subdivision**, thay cho lưới nội suy từ cage thô. Lưới YZ chỉ tăng tốc chọn tam giác. Mép cắt chìm trong da, độ nhô được làm mịn riêng; tai dùng material đục thay cho lớp alpha không ghi depth ở chân tai.
- Quét phần da nhô ngoài đường viền mặt sau khử roll để ước lượng tâm, chiều cao và độ nhô từng bên. Loại đoạn quá nhỏ, chạm crop, tóc/phụ kiện và pose lớn; trộn số đo với tỷ lệ mẫu theo trọng số heuristic. Chưa suy ra giải phẫu tai hoặc phần bị che.
- Thêm điều khiển kích thước, độ cao, độ vểnh. `measurements.ears` tùy chọn được sao chép/validate/restore cùng dữ liệu đầu, giữ schema 1.
- Giữ nguyên model, asset, checksum và trạng thái giấy phép FaceVerse hiện có.

## Quan sát local

So sánh bản trước/sau trong cùng phiên với cùng kết quả fit mặt. Linh được xem chính diện, góc ¾ và phía sau; Bách được xem chính diện và cận cảnh góc nghiêng; Hiếu được xem góc ¾. Kích thước và vị trí tai đã thay đổi theo từng ảnh/từng bên; Hiếu có tai đặt thấp hơn, Linh có độ nhô nhỏ hơn. Đây là quan sát về tỷ lệ, chưa phải kết luận giống người thật. Cận cảnh Bách vẫn thấy gợn phía trước vành tai; nếp/hõm bên trong tiếp tục phụ thuộc mẫu FaceVerse.

Với **Hiếu ở trạng thái neutral**, dùng Three.js Raycaster độc lập bắn vào các mesh đầu thực sự hiển thị tại Y/Z của từng điểm mép cắt tai. Dấu dương là điểm nằm ngoài da; dấu âm là nằm trong da. Số đo theo phương ngang, không phải khoảng cách pháp tuyến:

| Bản | Tai -X | Tai +X |
| --- | --- | --- |
| Trước | 2/149 điểm ngoài da; lớn nhất +0,142 mm | 1/149 điểm ngoài da; lớn nhất +0,238 mm |
| Sau | 0/149 điểm ngoài da; khoảng -0,632 mm | 0/149 điểm ngoài da; khoảng -0,632 mm |

Không có ray bị hụt ở các điểm này. Đo điểm mép không chứng minh mọi tam giác giao nhau hợp lệ, mọi tổ hợp slider đều khít, hoặc mesh đã được nối thành một khối manifold.

Với cùng kết quả Hiếu, `portraitHeadData()` → `restorePortraitHead()` giữ nguyên buffer vị trí của từng tai: 13.851 phần tử mỗi tai, sai khác lớn nhất bằng 0. Dữ liệu số đo được sao chép sang object riêng; validator nhận record thiếu trường tai và từ chối số đo chiều cao NaN.

Sau khi cập nhật runtime cuối, đã thao tác trực tiếp trên demo: chọn ảnh Linh → Dựng đầu 3D → góc ¾ → chỉnh độ vểnh -0,3 → Khôi phục. Ba thanh chỉnh tai được bật, Khôi phục trả độ vểnh về 0; vùng báo lỗi trống và không ghi nhận `error`/`unhandledrejection` trong lượt thao tác này.

## Giới hạn

- Số đo silhouette có thể bị ảnh hưởng bởi tóc, che khuất, pose và lỗi segmentation; confidence không phải xác suất chính xác. Không dùng ảnh chính diện để khẳng định hình tai ở mặt sau hoặc nếp tai riêng.
- Tai vẫn là hai mesh riêng chồng giao với đầu, chưa union hoặc rig theo chuyển động tai. Màu lấy từ trường màu da; chưa có texture tai riêng theo ảnh.
- Chưa chạy test suite, build app/demo, lint, formatter, typecheck, deployment, GLB round-trip, browser matrix hoặc benchmark. `prepare:runtime` được dùng để cập nhật artifact SDK; việc này không xác nhận chất lượng hay hiệu năng.
- Đây là sửa lỗi ghép và bước điều chỉnh tỷ lệ theo ảnh, chưa phải nghiệm thu production.
