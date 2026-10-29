# Kịch bản thử — chưa thực hiện

Không có kết quả pass trong tài liệu này. Chỉ chạy các kiểm tra tự động khi sư tổ yêu cầu rõ.

Chạy `npm run dev` và mở `http://localhost:5187`. Mesh đầu–cổ được tạo trực tiếp từ template canonical cục bộ; không cần tải model đầu 3D từ CDN.

1. Xác nhận trang chỉ tải asset cùng origin; không có request tới FaceVerse/MoodLab CDN. Đầu mẫu phải có mặt, sọ, hai tai và cổ. Xem front/¾/back, bật lưới mesh, kiểm tra vùng nối mặt–sọ và hàm–cổ.
2. Chọn ít nhất 5 ảnh được phép dùng có mặt/mũi/hàm khác nhau. Crop, thử ảnh xoay/zoom. So sánh các mesh bằng **Da phẳng** để không nhầm texture với khác biệt hình học.
3. Xem texture mắt/lông mày/môi; thử tóc mái, da sáng/tối, kính và ảnh cười. Sau đầu không được có mặt lặp; ghi artifact ở thái dương/viền trán/ears.
4. Thử ảnh không mặt, hai mặt, mặt quá nhỏ, profile, ảnh bị cắt và ảnh >25 MB. Phải báo lỗi có thể sửa, không phát đầu generic rồi giả đã fit.
5. Dựng, hủy ở bước phân tích và khớp, chọn ảnh khác rồi dựng lại. Model cũ không bị tác vụ đã hủy ghi đè. Nút Hủy không chờ fit xong.
6. Thử 3 styles, sliders, reset, đổi style nhiều lần. Đổi qua lại phải khôi phục cùng hình học, không tích lũy deformation.
7. Export từng style, mở GLB đã tải và so hình học/texture/orientation với preview. Dùng PNG front/¾/back để đối chiếu. Bật wireframe trước export, file xuất vẫn là vật liệu bình thường.
   Với mỗi preset mobile (Unbothered, Locked in, Cracking up, Full panic, Big winner, Spectacular flop), kéo mức độ 0/50/100%, về trung tính, đổi shape/style rồi xuất ở mức khác 0. Đối chiếu với mobile ở góc chính diện/¾/nghiêng; Big winner phải giữ nét bất đối xứng. Xem răng trên/dưới, lưỡi và thành khoang miệng khi há; chú ý xuyên môi/cằm ở Locked in 100%. Thử thay độ rộng miệng/hàm và bật Da phẳng.
   Mở lại GLB phải giữ preset và đúng mức UI (ví dụ 65% vẫn là 65%, dù morph weight là 1,3), tiếp tục đổi preset được. Thử riêng Unbothered ở 0%, 80% và 100% để xác nhận giữ lựa chọn qua metadata. GLB sáu cảm xúc cũ phải hiện đúng bộ Vui/Buồn/Tức giận/Ngạc nhiên/Sợ hãi/Ghê tởm với mức 0–1; GLB không có đủ bộ target phải khóa nút.
   Khi chọn preset hoặc kéo mức độ, không có request tải basis, giải mã rig, subdivision hoặc dựng lại khoang miệng. Kiểm tra thời gian dựng hình sau khi thay shape riêng với độ phản hồi của nút biểu cảm; chưa có benchmark xác nhận.
8. Sau lần dựng đầu, tắt mạng và dựng tiếp trong tab còn mở. Dev server/static files phải có sẵn; không đánh đồng với offline reload toàn app.
9. Dựng 20 lần, xóa ảnh so sánh, đóng trang; xem DevTools Memory/GPU, đảm bảo không tăng không giới hạn. Chưa có con số peak memory.
10. Ghi rõ OS/CPU/RAM/browser, lần cold riêng, ít nhất 10 warm runs, tải số đo JSON. p50/p95 ít mẫu chỉ tham khảo. Thử Chrome/Edge/Firefox/Safari mới; chưa có browser nào được xác nhận pass.

Đánh giá likeness cần 30–50 ảnh có quyền dùng và người chấm: front/¾, Natural/Cartoon riêng. Không dùng NME thay blind test. Ưu tiên kiểm tra mặt béo/gầy, hàm rộng/hẹp, ảnh có kính và độ tự nhiên của gáy/cổ ở góc nghiêng.

Nếu được yêu cầu kiểm tra kỹ thuật, script `npm run build` chạy TypeScript + Vite. Chưa thêm unit test chỉ để mô phỏng implementation; các kiểm tra có giá trị tiếp theo là synthetic fitting với pose biết trước, occlusion/UV raster, bounds GLB round-trip và cancel race trên browser thật.
