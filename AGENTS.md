# Hướng dẫn cho repo thử nghiệm

- Trao đổi tiếng Việt, xưng đồ nhi, gọi người dùng là sư tổ.
- Repo độc lập để thử portrait → 3D head. Không sửa, tích hợp hoặc thay asset trong `twa-moodlab-mobile` khi chưa được yêu cầu.
- Không chạy test, build, lint, formatter, typecheck, deployment hoặc CI trừ khi sư tổ yêu cầu rõ. Việc chuẩn bị asset không phải kiểm thử.
- Không upload ảnh/landmark/texture/GLB tới backend. Không thêm analytics hoặc inference API. Ảnh chỉ giữ trong bộ nhớ phiên, GLB chỉ tải local theo thao tác người dùng.
- Pin versions, ghi nguồn/giấy phép/checksum của model và asset. Không thêm template/model không rõ quyền sử dụng.
- Không tuyên bố đã pass chất lượng, tương thích browser hay hiệu năng trước khi có kiểm chứng thực tế.
