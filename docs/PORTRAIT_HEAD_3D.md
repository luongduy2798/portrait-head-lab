# Cách hoạt động và giới hạn

## Luồng xử lý

`File → createImageBitmap (orientation) → crop canvas 1024 → analysis.worker.js (CPU/WASM) → generate.worker.ts (fit + texture) → Three.js → GLTFExporter → GLTFLoader → download`.

Ảnh chỉ được truyền giữa main thread/worker bằng ImageBitmap hoặc typed array. Template, landmark anchors và model MediaPipe được phục vụ từ repo; mesh đầu–cổ được tạo trực tiếp trong trình duyệt bằng hình học thủ tục. Không có inference API bên ngoài, backend hay analytics. Tai dùng vùng mesh trung tính FaceVerse đã có sẵn local, không chạy FaceVerse inference. Thông số shape chỉ nằm trong GLB được người dùng chủ động tải; ảnh crop/landmark không đi vào báo cáo số đo.

Ảnh so sánh tối đa 5 bộ giữ trong DOM/RAM. Xóa bằng **Xóa ảnh so sánh** hoặc đóng tab. Khi rời trang, worker/GPU/bitmap được giải phóng và ảnh so sánh/overlay được xóa. Không IndexedDB/localStorage cho ảnh.

## Template và anchors

`vendor/canonical_face_model.obj` là facial surface 468 đỉnh từ MediaPipe, pin commit trong `vendor/mediapipe-source.json`. Script `scripts/generate-template.mjs` tạo template schema v1 và barycentric anchors. Runtime chỉ dùng 468 đỉnh mặt cùng 898 tam giác đầu tiên; các vùng sọ/gáy/cổ được dựng mới bằng loft liền từ đường biên mặt xuống đáy cổ. Profile phía trên đi qua đỉnh sọ, chẩm và gáy; profile phía dưới tạo vùng dưới cằm rồi chuyển xuống cổ trước. Các vòng dùng chung đỉnh và normal, chỉ đóng mặt ở đáy cổ. Không dùng mesh đầu trung bình từ model bên ngoài.

Lưới preview/GLB dùng cage sọ/cổ thưa, cổ có tiết diện rộng và ba lượt Loop subdivision trên toàn bộ mặt–sọ–cổ. Không khóa các đỉnh trong mặt: chia nhỏ tuyến tính ở vùng bị khóa sẽ giữ nguyên các mảng phẳng. Normals cộng theo góc ở đỉnh để giảm chênh lệch shading giữa tam giác mặt và các vòng cổ; màu da chuyển liên tục theo vị trí thay vì đổi nhóm mẫu đột ngột theo từng đỉnh. UV được nội suy trong từng tam giác canonical, các nhóm vật liệu mặt/da được giữ. Template và anchors dùng cho fitter không thay đổi; làm mượt có dịch chuyển các đỉnh hiển thị so với cage dùng để fit. Chi phí xử lý và kích thước GLB sau chia nhỏ chưa được đo.

Khi dựng đầu trung tính, khe giữa hai viền môi trong của canonical được thu lại trước subdivision; các hàng môi gần đó dịch chuyển với falloff để hạn chế khe bị mở lại khi làm mượt. Thay đổi áp dụng chung cho preview và GLB, không sửa template/anchors nguồn. Ảnh há miệng vẫn có thể giữ răng hoặc bóng trong texture; đây chưa phải bước xóa biểu cảm khỏi ảnh.

Trước subdivision, vùng gáy được làm mềm trên cage bằng Laplacian có trọng số, neo mặt, đỉnh sọ và đáy cổ; không chiếu/nắn lưới hoàn thiện sang mặt ellipse khác. Đáy cổ có hai vòng đồng tâm để tách tâm quạt tam giác khỏi mép ngoài, tránh vết nhăn hướng tâm. Kết quả kiểm tra tại localhost:8100 được ghi riêng trong [biên bản ngày 28/10/2026](VALIDATION_2026-10-28.md); không suy rộng thành kiểm chứng browser matrix hoặc giải phẫu.

Map lưu **triangle ID + barycentric weights** của từng landmark trên chính surface canonical nguồn, không lấy index từ một mesh không tương ứng. Landmark 468–477 là iris và không được coi là vertex của template 468. Fitter kiểm tra schema, anchor presence và tổng weights. Sọ và gáy dùng các vòng lưới theo đường biên mặt; tai là mesh thủ tục riêng được cắm nhẹ vào hai bên sọ. Đây là mesh phục vụ preview/GLB thử nghiệm, chưa phải mesh manifold đã xác minh để in 3D hoặc rigging. Mắt và các chi tiết nhìn thấy được giữ qua surface/texture mặt canonical; chưa có eyeballs/mí rig riêng.

Tai lấy hình học từ mesh FaceVerse v4 trung tính local, qua checksum và một lượt Loop refinement. Runtime giữ vùng tai cùng da chân tai, đặt theo surface sọ đã fit bằng lưới raycast; phần relief sâu nhất được nén theo chiều ngang để hõm tai không chìm trong sọ khác hình dạng. Chân tai pha alpha về bề mặt đầu; phần vành/hõm dùng material đục riêng. Cùng hàm màu da, roughness với sọ/cổ, giữ vertex alpha khi xuất GLB. Đây là tai trung bình được đặt vừa đầu, không phải tai của riêng người trong ảnh; không boolean union hoặc đảm bảo mesh kín để in 3D. Kết quả mới ghi trong [biên bản FaceVerse và biểu cảm](VALIDATION_FACEVERSE_EXPRESSIONS_2026-10-28.md); [biên bản tai thủ tục trước đó](VALIDATION_EARS_2026-10-28.md) chỉ mô tả bản cũ.

Template JSON đơn vị centimetre để giữ kích thước canonical. Preview, neutral GLB và GLB xuất nhân 0.01 để chuyển sang mét. Y lên, +Z hướng mặt trước, origin gần giữa khuôn mặt; không tự căn rig MoodLab.

23 shape controls được định nghĩa tại `src/core/shape.ts`. Các delta dùng điểm neutral bất biến, falloff Gaussian và symmetry. Giới hạn [-1,1]; sọ bám theo đường viền mặt nhưng chỉ nhận biến dạng nhẹ để tránh kéo méo vùng mặt. Ear size/height giữ prior khi auto fit vì không có landmark tai. Chưa có learned shape basis; chưa có đảm bảo mọi tổ hợp slider không tự xuyên mesh.

## Fit

Weak-perspective camera + Euler pose + translation. Khởi tạo từ khoảng cách hai đuôi mắt/roll. Bounded coordinate descent tối đa 28 vòng hoặc khoảng 2.4 giây tính riêng fit; early stop sau 4 vòng không cải thiện. Landmark loss Huber, chia theo interocular width; prior tham số và prior biểu cảm. Các Gaussian bases bảo đảm trơn và đối xứng theo cấu trúc; không kéo từng đỉnh để khớp landmark. MediaPipe z không được coi là mét hoặc sao chép thành shape cuối.

Jaw open, smile, blink là nuisance expression với prior từ blendshapes. Ba nuisance expression của fitter không được dùng làm sáu preset hiển thị; đầu mặc định vẫn trung tính. GLB hiện giữ sáu morph target hiển thị và mức biểu cảm người dùng chọn. Bóc biểu cảm này chỉ là xấp xỉ; ảnh cười/há miệng vẫn có thể làm fit/texture không trung tính. Hình học mũi theo chiều sâu vẫn phụ thuộc prior và suy đoán từ pose một ảnh.

NME được tính RMS của landmark 2D đã chiếu, chuẩn hóa theo khoảng cách landmark 33↔263. Đây là metric khớp vị trí, không đo nhận diện danh tính. Sliders thay đổi mesh sau fit nên overlay/NME mô tả lần auto fit, không tái đo theo slider.

## Texture

Skin median lấy từ cheek/nose samples có skin confidence cao, đồng thời tính hai dải màu tối/sáng từ quantile luminance. Các mẫu da được giữ riêng tại từng landmark trên má, thái dương, trán và hai bên hàm, thay vì gộp thành sáu màu trung bình. Loại vùng mắt/kính khỏi mẫu da và giảm nhiễm râu; bỏ mẫu không đủ da tin cậy. Một hàm màu da trong không gian linear được dùng chung cho nền atlas, vertex colors trên sọ, tai và cổ. Hàm nội suy theo chiều cao và bên trái/phải, không giảm độ tin cậy theo chiều sâu hoặc pha về median khi ra sau đầu. Kernel rộng giảm các đốm màu cục bộ. Khi bật da phẳng, mặt cũng dùng hàm màu này. Vùng khuất chưa có chi tiết da thật.

Atlas 1024 lấy tọa độ ảnh theo landmark correspondence. Mask nguồn dựa trên đường viền mặt quan sát, feather ngắn bằng distance field 256; segmentation loại nền ở ngoài vùng mắt/kính. Vùng bảo vệ mắt/kính phủ cả hai mắt, sống kính và gọng, không chỉ hai ellipse nhỏ. Tóc chỉ bị loại phía trên lông mày. Viền UV chuyển tiếp hẹp hơn trong vùng kính. Với ảnh gần chính diện, không dùng prior độ sâu/pháp tuyến để loại các chi tiết mắt hoặc kính; kiểm tra che khuất được tăng dần khi pose nguồn nghiêng. Tam giác không lấy được ảnh vẫn nhận nền màu da theo vị trí; atlas được nới màu ra ngoài biên UV sáu pixel. Pha ảnh với da nền trong không gian linear. Mặt–sọ–tai–cổ dùng cùng roughness; GLB giữ atlas và vertex colors này.

Tọa độ ảnh và surface dùng để bake atlas được làm mượt bằng ba lượt Loop cùng hàm với mesh hiển thị. Vùng mặt dùng biên hở khi bake, còn mesh hiển thị nối liền sọ; feather xử lý viền ngoài. Đã đối chiếu `images (9).jpeg` và ảnh có kính `72993_v9_bb.jpg` trên Chrome tại localhost:8100; phạm vi và giới hạn ghi trong [biên bản da ngày 28/10/2026](VALIDATION_SKIN_2026-10-28.md). Chưa có bộ ảnh lớn hoặc đo hiệu năng đa thiết bị.

Bỏ local luminance correction và blur atlas vì gây mất nét, thay đổi màu và làm nhòe kính. Texture dùng màu ảnh nguồn; bóng sáng, phản chiếu và biểu cảm trong ảnh vẫn có thể còn trên mặt. Màu vùng khuất là nội suy, không phải delighting vật lý hoặc scan. Texture theo correspondence chưa giải quyết hoàn toàn yaw lớn và vùng tự che; nên dùng ảnh gần chính diện.

Natural giữ shape fit; Cartoon tăng mắt/má nhẹ và giảm mũi, đổi roughness; Caricature tăng 5 lệch shape lớn nhất với clamp. Đây là stylization hình học đơn giản, chưa phải shader/phong cách cartoon đã được art-direct. Da phẳng bỏ photo texture, có ích để phân biệt likeness đến từ geometry hay texture.

## Sáu biểu cảm hiển thị

Unbothered, Locked in, Cracking up, Full panic, Big winner và Spectacular flop dùng đúng hệ số FaceVerse từ worker mobile. Bước `assets:expressions` trích sẵn sáu trường dịch chuyển tại 468 landmark từ basis đã pin; runtime không chạy ResNet/FaceVerse inference. Delta được chuyển bằng khung affine cục bộ trên one-ring canonical sang cage đã fit identity, có ràng buộc pháp tuyến và fallback căn tương đồng khi suy biến; sau đó chia nhỏ cùng topology với đầu trung tính. Chuyển động hàm lan giảm dần vào ba vòng cổ sát mặt. Hình học sọ và tham số identity vẫn thuộc pipeline hiện tại.

Mức độ 0–100% tương ứng trọng số 0–2 như mobile; Unbothered là pose nghỉ, nút Trung tính đặt mọi weights về 0. Thay đổi mức độ chỉ cập nhật morph influences. Đổi hình học/style dựng lại targets nhưng giữ lựa chọn hiện tại; dựng từ ảnh mới trở về trung tính. Bounds culling bao cả mức 2×, không dùng làm số đo hình dạng ở pose hiện tại.

18 tam giác lấp bên trong viền môi canonical được bỏ khỏi cage hiển thị và cage bake atlas, giữ template/anchors fitter nguyên vẹn. Đường viền môi được truyền qua các lượt subdivision để dựng thành khoang miệng và mặt phía sau. Ba phần răng trên, răng dưới, lưỡi lấy từ FaceVerse và đặt theo cùng khung miệng trung tính (khóe môi, tâm môi, trục mũi–cằm); cùng phép biến đổi áp dụng lên mọi morph. Bước dựng geometry điều chỉnh độ lùi phần miệng bằng skin projection tại neutral và các mức 25/50/75/100% của từng preset; không thực hiện trong render loop. Các phần có position/normal morph và màu riêng, được xuất cùng đầu. Đây vẫn chưa phải muscle/skeleton rig. Texture vẫn chứa ánh sáng và biểu cảm ảnh nguồn, kính trong ảnh cũng đi theo surface; kết quả khác mobile do topology và cách texture khác nhau.

GLB giữ position/normal morph targets, tên và weights hiện tại, cùng `expressionSet` và `{ name, strength }` với strength là mức UI 0–1, tách khỏi trọng số 0–2. Khi mở lại file, metadata được ưu tiên để giữ cả lựa chọn Unbothered ở mức 0; nếu thiếu metadata thì suy ra từ weights theo đúng hệ số của bộ target. Bộ sáu cảm xúc cũ được nhận diện riêng và dùng hệ số 1, không đổi tên sang preset mobile; GLB không đủ bộ target thì khóa nút. Kiểm tra bounds xuất/mở lại dùng vị trí đỉnh ở pose hiện tại, tránh so bounds bao mọi target giữa các material primitives khác nhau.

Gói local đã được chuẩn bị; thay đổi preset/khoang miệng này chưa được nghiệm thu render, hiệu năng, GLB round-trip hoặc chạy test/build/typecheck. Không áp dụng kết quả kiểm tra bản thủ tục cũ cho bản mới.

## Worker, cancel và tài nguyên

MediaPipe 0.10.35 phân phối CJS/ESM. Adapter offline bọc CJS exports trong classic worker, giữ importScripts cho WASM loader; không sửa thuật toán ML. CPU được chọn rõ; không yêu cầu WebGPU. Worker analysis được giữ cho warm path; fit/texture ở worker module riêng. Cancel terminate cả worker, lần sau khởi tạo lại. Sequence guard chặn commit tác vụ bị hủy trong lúc asset/bitmap đang tải.

Model/template được load lại khi khởi tạo bị lỗi. Mỗi lần generate tạo geometry riêng; viewer dispose geometry/material/texture cũ. Gallery chỉ giữ thumbnail, không giữ nhiều head GPU. Chưa chạy thử lặp 20 ảnh để xác nhận không leak.

## Số đo và phạm vi hoàn thành

Diagnostics đo initialize, detect, segment, fit, texture, total. Warm = total trừ initialize, vẫn có overhead crop transfer/static template lần đầu. Export được đo khi bấm tải. p50/p95 chỉ mô tả các lần trong phiên; sample ít không đại diện thiết bị khác. Báo cáo không có peak memory hoặc tổng tải cold browser; các mục này chưa được đo.

- M0: có template full head/GLB, mapping, provenance; cần xem thực tế normals và cân chỉnh tai/skull.
- M1: có code upload/crop/detect/fit/preview/export; chưa xác minh chạy trên browser.
- M2: có texture/mask/visibility/illumination/overlay; chưa xác minh likeness và artifact bằng bộ ảnh.
- M3: có style và sliders; chưa kiểm chứng export trực quan từng style.
- M4: có công cụ đo và checklist; chưa chạy test, benchmark, browser matrix, memory test hoặc blind test.

Không đánh dấu các milestone đạt nghiệm thu trước khi chạy thực tế. Không tích hợp avatar body/accessories/animation, không sửa project mobile, không có rig/FBX/server persistence.
