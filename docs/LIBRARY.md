# @twa/portrait-head

Package private, browser-only, export source TypeScript/ESM. Core nằm ở root,
không import Vite, Node.js hoặc mã demo. `demo/` là package riêng có dependency,
lockfile và toolchain riêng, không phải workspace tự cài cùng thư viện.
Demo và MoodLab dùng một source; không có bước build thư viện, copy core hoặc publish.

Runtime dùng peer `three@0.186.1`; root chỉ giữ Three.js và type của nó cho phát triển
core. Vite và TypeScript compiler nằm trong `demo/`. `files` của package chỉ gồm
core, asset, metadata, tài liệu API và adapter tích hợp tùy chọn; không chứa demo.

## Kết nối

Trong repo sibling, khai báo dependency:

```json
"@twa/portrait-head": "file:../portrait-head-lab"
```

Cài dependencies ở repo thư viện trước (`npm ci --ignore-scripts` tại root), rồi
`npm install --ignore-scripts --install-links=false --no-audit --no-fund` tại app.
`install-links=false` giữ symlink tới source. Cài lại sau khi thay đường dẫn/package metadata;
sửa source không cần cài lại. Cả hai checkout cần tồn tại khi cài/chạy/build app.

Chỉ cài thư viện không cài demo hoặc toolchain của demo. Khi muốn mở demo, cài và
chạy riêng trong `demo/`: `npm ci --ignore-scripts --install-links=false`, rồi
`npm run dev`. `build` và `preview` cũng chạy tại thư mục demo.

## Host và bundler

Host cần xử lý source TypeScript/ESM và cú pháp Worker chuẩn
`new Worker(new URL(..., import.meta.url))`; analysis worker giữ kiểu classic để
MediaPipe dùng `importScripts`, generation worker dùng module. Host chịu trách nhiệm
bundle hai worker và phục vụ `assets/` tại `assetBaseUrl`. Core không tự cài hoặc
gọi Vite; tích hợp với bundler ngoài Vite chưa được kiểm chứng trong thay đổi này.

Với host dùng Vite, có thể chọn entry riêng:

```ts
import { portraitHeadAssets } from '@twa/portrait-head/vite';

// Thêm vào plugins của Vite; đường dẫn tương đối với config.base.
portraitHeadAssets({ basePath: 'assets/portrait-head/' });
```

Plugin phục vụ bộ asset đã có sẵn trong package, theo allowlist và checksum trong
`asset-manifest.json`. Cả classic analysis worker và module generation worker được
Vite của host bundle từ source cùng mã ứng dụng. Adapter ở `integrations/` giữ allowlist filesystem của Vite,
thêm source của package vào allowlist, dedupe `three` và loại package khỏi prebundle.
MediaPipe `0.10.35`, Three.js peer `0.186.1`; consumer phải dùng cùng Three.js.
Adapter dùng Node built-ins, không kéo Vite vào dependency của thư viện. Host sử
dụng phiên bản Vite của chính host; import core không nạp adapter này.

Mặc định build đính kèm asset đã chuẩn bị; dev phục vụ trực tiếp cùng bộ file.
Không có lệnh chuẩn bị asset, không cần package MediaPipe trong node_modules để chạy.

Để dùng CDN, upload nội dung `assets/` và giữ nguyên cấu trúc, đặt `assetBaseUrl`
thành URL thư mục CDN có phiên bản. Dùng `portraitHeadAssets({ emitAssets: false })`
để bỏ đính kèm bản asset local. Worker vẫn được bundle cùng app, không lấy Worker
entry từ CDN. CDN cần CORS cho origin ứng dụng, MIME WASM và CSP phù hợp.
MoodLab nhận URL qua `ML_PORTRAIT_HEAD_ASSET_BASE_URL`; để trống dùng asset local.

## API trình duyệt

```ts
import {
  HeadPipeline, loadEarTemplate, loadExpressionRig, createHead, disposeObject,
} from '@twa/portrait-head';

const assets = {
  assetBaseUrl: new URL('/assets/portrait-head/', location.origin).href,
};
const pipeline = new HeadPipeline(assets);
const controller = new AbortController();
const { result, template } = await pipeline.generate(fileOrCanvas, onProgress, {
  signal: controller.signal,
  occludedEyes: false,
});
const [ears, rig] = await Promise.all([
  loadEarTemplate(assets, controller.signal), loadExpressionRig(assets, controller.signal),
]);
const head = createHead(template, ears, rig, result, result.fit.params);
// Khi không còn dùng:
disposeObject(head);
pipeline.dispose();
```

- `File` tự căn mặt/xoay và crop 1024 px trong classic analysis worker; decode giới hạn
  cạnh dài 2048 px. Canvas đã crop giữ nguyên kích thước và không tự crop lại.
  `crop: 'auto' | 'none'` cho phép chỉ định rõ hành vi.
- `Progress.phase`: `loadingModel`, `detecting`, `segmenting`, `fitting`, `texturing`;
  `progress` thuộc khoảng 0–1. Consumer tự dịch nhãn.
- Lỗi pipeline dùng `HeadError` với mã ổn định; hủy dùng `AbortError`.
  `cancel()`/`dispose()` dừng worker của phiên; phiên khác vẫn tải được model dùng chung.
- `loadTemplate(assets, signal?)`, `loadEarTemplate`, `loadExpressionRig` cache theo
  URL và chỉ cache dữ liệu model, không cache ảnh/landmark của người dùng.
- `createHead` mặc định đóng đáy cổ. Body adapter dùng `openNeck: true` và
  `onNeutralSurface` trong đối số options cuối; geometry cung cấp `_portraitVertex`
  để giữ correspondence khi tách UV. Callback cần clone geometry nếu giữ lại, và tự dispose bản clone.
- Public exports gồm type dữ liệu, điều khiển shape/biểu cảm, `computeSmoothNormals`,
  `exportHead` và `inspectGLB`. UI, cropper, viewer, download thuộc consumer.

Schema lưu face, IndexedDB, body/wardrobe, tối ưu avatar và Save/backend thuộc app.
Baseline dữ liệu cũ giữ provenance `9b8fb0355f628d56783e361f30ed3022fa70b710`;
thay cách import không đổi schema hoặc làm mất khả năng khôi phục face đã lưu.

Model, JS/WASM, template, anchors và rig FaceVerse đã chuẩn bị sẵn trong `assets/`.
Chỉ cài dependencies rồi dùng thư viện; không sinh lại dữ liệu trong triển khai.
Nguồn, quyền sử dụng và giới hạn: [THIRD_PARTY_ASSETS](THIRD_PARTY_ASSETS.md).
Chưa chạy kiểm chứng build/typecheck/browser cho lần tách package này.
