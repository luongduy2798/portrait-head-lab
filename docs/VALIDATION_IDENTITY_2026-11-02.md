# Đối chiếu hiệu chỉnh hình mặt — 02/11/2026

Phạm vi: Chrome 156.0.8078.79 trên macOS, phiên headless riêng, demo đang chạy tại `http://localhost:5187/`. Dùng pipeline/renderer của repo và bốn ảnh được người dùng chỉ định trong `/Users/luongnhatduy/Downloads/face-demo`. Ảnh, landmark, texture và các kết quả đối chiếu chỉ giữ trong RAM; không thêm ảnh vào repo, không tải GLB xuống đĩa và không gọi dịch vụ inference.

## Thay đổi được xem thử

- Khớp tổng thể có Z tương đối trọng số thấp; bổ sung trường hiệu chỉnh 468 đỉnh có regularization, không bắt hai bên mặt đối xứng hoàn toàn. Vùng bị che hoặc có biểu cảm lớn giảm trọng số.
- Giảm co hình mặt qua subdivision; các đỉnh cạnh mới vẫn dùng Loop. Cùng quy tắc áp dụng cho texture correspondence và morph.
- Bỏ khắc mí cố định và tăng tương phản nếp mí; giữ chi tiết trên vùng mí của ảnh nguồn. Chưa có tái dựng giải phẫu mí hoặc eyeball riêng.
- Dữ liệu lưu thêm `identity` tùy chọn và áp dụng lại khi restore. Thêm điều chỉnh độ đầy má, góc hàm và sống mũi trong demo.

## Quan sát và số đo

Xem chính diện trên cả bốn ảnh; xem thêm góc ¾ và Da phẳng trên Linh. Đối chiếu thị giác với đầu Linh của bản trước giữ trong phiên: độ mở mắt bớt bị ép mảnh sau khi bỏ nếp mí thủ tục. Mẫu có kính của Hiếu vẫn giữ gọng qua texture. Kết quả vẫn có khác biệt với ảnh ở khối mũi, phần sọ và màu/ánh sáng da; chưa xác nhận độ giống hoặc chiều sâu đúng.

Các số dưới đây là NME của cage trong **cùng lần fit mới**, trước/sau hiệu chỉnh cục bộ, chia cho khoảng cách hai đuôi mắt. Đây không phải điểm chất lượng, so sánh bản cũ/mới, phép đo mesh sau subdivision hay độ chính xác 3D.

| Ảnh | Khớp tổng thể | Sau hiệu chỉnh cục bộ |
| --- | ---: | ---: |
| `linh-le.png` | 2,90% | 0,94% |
| `hieu-pham.png` | 2,28% | 0,79% |
| `quan-nguyen.png` | 2,73% | 0,99% |
| `bach-nguyen.png` | 3,22% | 1,42% |

Ảnh Bách đang cười lớn: môi/texture khi đưa về trung tính vẫn có biến dạng rõ. Đã giảm ảnh hưởng của quan sát vùng miệng và hiển thị cảnh báo về giới hạn này; không coi là đã xử lý xong neutralization.

Với kết quả Bách ở bản cuối, `portraitHeadData()` → `restorePortraitHead()` giữ cùng số phần tử và sai khác lớn nhất bằng 0 trên buffer vị trí neutral so với dựng trực tiếp từ `HeadResult`. Record schema 1 thiếu `identity` vẫn được validator chấp nhận. Tọa độ position trên các mesh preview của mẫu này đều hữu hạn; điều đó không chứng minh topology, rig hoặc tự xuyên hợp lệ.

Đã chạy lại luồng chọn ảnh → Dựng đầu 3D trực tiếp trên giao diện demo với Linh sau khi cập nhật runtime: kết quả hiển thị, vùng báo lỗi trống và không ghi nhận `error`/`unhandledrejection` trong lần thao tác đó. Đây là kiểm tra cục bộ của một luồng, không phải xác nhận tương thích Chrome nói chung.

## Giới hạn còn lại

- Z của MediaPipe là dự đoán tương đối, không phải scan hoặc phép đo chiều cao mũi. Trọng số `depthConfidence` là heuristic, không phải xác suất chất lượng. Không hạ/nâng mũi theo suy đoán sắc tộc.
- Hõm má, nếp mí thật, profile mũi, sọ phía khuất và tách biểu cảm còn thiếu dữ kiện. Bộ bốn ảnh này không đủ để nghiệm thu production; cần ảnh đối chiếu đa góc/ground truth và đánh giá danh tính riêng.
- Chưa chạy test suite, build app/demo, lint, formatter, typecheck, deployment, browser matrix, benchmark, GLB round-trip hoặc toàn bộ tổ hợp style/slider/biểu cảm cho thay đổi này. `prepare:runtime` chỉ được dùng để cập nhật artifact SDK.
- Không bổ sung model hoặc asset. Giấy phép dữ liệu FaceVerse giữ trạng thái chưa xác minh như [nguồn asset hiện có](THIRD_PARTY_ASSETS.md); thay đổi thuật toán không giải quyết quyền phân phối model để production.
