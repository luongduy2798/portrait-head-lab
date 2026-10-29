import './style.css';
import * as THREE from 'three';
import { PortraitCropper } from './core/cropper';
import { createHead, disposeObject, updateFlatAppearance } from './core/mesh';
import { loadEarTemplate, type EarTemplate } from './core/ears';
import { applyExpression, controlsForObject, expressionControls, readExpression, supportsExpressions, type ExpressionSelection } from './core/expressions';
import { loadExpressionRig, type ExpressionRigAsset } from './core/expression-rig';
import { HeadPipeline, loadTemplate } from './core/pipeline';
import { HeadViewer } from './core/viewer';
import { download, exportHead, inspectGLB } from './core/exporter';
import { manualKeys, shapeControls } from './core/shape';
import type { Analysis, HeadResult, HeadTemplate, ShapeParams, Style } from './core/types';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="header">
    <a class="brand" href="/" aria-label="Portrait Head Lab"><span class="brand-mark">p<span>h</span></span><span>Portrait <strong>Head Lab</strong><small>ẢNH CHÂN DUNG → ĐẦU 3D</small></span></a>
    <span class="local-badge"><i></i> Xử lý trên thiết bị</span>
    <span class="experiment">THỬ NGHIỆM / 01</span>
  </header>
  <main class="workspace">
    <aside class="sidebar">
      <div class="intro"><span class="eyebrow">BROWSER-ONLY · XỬ LÝ TẠI MÁY</span><h1>Một bức ảnh.<br>Một góc nhìn mới.</h1><p>Dựng đầu trọc 3D, xem từ mọi phía và tải về để so sánh độ giống.</p></div>
      <section class="source-section" aria-labelledby="source-title">
        <div class="section-title"><h2 id="source-title"><span>01</span> Ảnh nguồn</h2><button id="reset-crop" class="text-button" disabled>Căn lại</button></div>
        <div id="dropzone" class="portrait-frame">
          <canvas id="crop" aria-label="Ảnh crop; kéo để di chuyển ảnh" hidden></canvas>
          <label id="upload-prompt" for="portrait"><span class="upload-symbol">↥</span><strong>Chọn một ảnh chân dung</strong><span>hoặc thả ảnh vào đây</span><small>JPG, PNG, WebP · tối đa 25 MB</small></label>
          <span id="crop-hint" class="crop-hint" hidden>Kéo ảnh để căn khuôn mặt</span>
        </div>
        <input id="portrait" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" />
        <div class="source-actions"><label class="button secondary" for="portrait">Chọn ảnh</label><span id="filename">Ưu tiên ảnh thẳng, ánh sáng đều</span></div>
        <div class="crop-controls"><label>Thu phóng<input id="zoom" type="range" min="1" max="3" value="1" step="0.01" disabled /></label><label>Xoay ảnh<input id="rotate" type="range" min="-180" max="180" value="0" step="1" disabled /></label></div>
        <p class="helper">Giữ đủ trán, mắt và cằm trong khung. Tóc không được đưa lên đầu 3D; lông mày được giữ theo ảnh.</p>
        <button id="generate" class="button primary" disabled><span>Dựng đầu 3D</span><span aria-hidden="true">↗</span></button>
        <div id="progress-area" class="progress-area" hidden><div class="progress-label"><span id="phase">Đang chuẩn bị…</span><button id="cancel" class="text-button">Hủy</button></div><progress id="progress" max="1" value="0"></progress></div>
        <p id="error" class="error" role="alert" hidden></p>
      </section>
      <section class="shape-section" aria-labelledby="shape-title"><div class="section-title"><h2 id="shape-title"><span>02</span> Tinh chỉnh hình học</h2><button id="reset-shape" class="text-button" disabled>Khôi phục</button></div><div id="sliders"></div><p class="helper">Giữ hình dáng mặt riêng theo ảnh; sọ, gáy và cổ được tự sinh từ đường viền khuôn mặt. Phần khuất vẫn là ước lượng từ một ảnh.</p></section>
      <p class="privacy-note">Ảnh chỉ nằm trong bộ nhớ của tab này, không gửi lên backend. Mesh đầu–cổ được tạo trực tiếp trên thiết bị.</p>
    </aside>
    <div class="main-panel">
      <section class="preview-panel" aria-label="Xem trước đầu 3D">
        <div class="preview-top"><div><span class="eyebrow">KHÔNG GIAN XEM TRƯỚC</span><h2>Đầu 3D của bạn</h2></div><span id="model-status" class="status-pill">Template trung tính</span></div>
        <div id="viewer"></div><div class="stage-floor"></div>
        <div class="view-tools"><div class="segmented" aria-label="Góc nhìn"><button data-angle="front" class="active">Chính diện</button><button data-angle="quarter">Góc ¾</button><button data-angle="back">Phía sau</button></div><button id="spin" class="icon-button" aria-pressed="false" aria-label="Tự xoay đầu 3D">⟳</button></div>
        <div class="view-caption"><span>Y ↑ &nbsp; · &nbsp; +Z hướng trước &nbsp; · &nbsp; mét</span><span>Kéo để xoay · Cuộn để thu phóng</span></div>
      </section>
      <section class="style-bar" aria-label="Phong cách"><div><span class="eyebrow">PHONG CÁCH</span><div class="style-options"><button data-style="natural" class="active">Natural</button><button data-style="cartoon">Cartoon</button><button data-style="caricature">Caricature</button></div></div><label class="strength-control">Mức cách điệu<input id="strength" type="range" min="0" max="1" step="0.01" value="0.5" /></label><label class="check"><input id="flat" type="checkbox" /> Da phẳng</label><label class="check"><input id="wireframe" type="checkbox" /> Lưới mesh</label><p class="helper texture-note">Kính và chi tiết khuôn mặt được giữ từ ảnh nguồn qua UV.</p></section>
      <section class="expression-bar" aria-labelledby="expression-title"><div class="expression-heading"><h2 id="expression-title">Biểu cảm</h2><label class="strength-control" for="expression-strength">Mức độ <output id="expression-value">80%</output><input id="expression-strength" type="range" min="0" max="1" step="0.01" value="0.8" disabled /></label></div><div id="expression-options" class="style-options expression-options" role="group" aria-label="Chọn biểu cảm"><button data-expression="neutral" class="active" aria-pressed="true" disabled>Trung tính</button>${expressionControls.map(([name, label]) => `<button data-expression="${name}" aria-pressed="false" disabled>${label}</button>`).join('')}</div><p id="expression-hint" class="helper">Chọn biểu cảm rồi kéo mức độ để điều chỉnh.</p></section>
      <div class="export-bar"><p id="result-summary">Chọn ảnh để bắt đầu. Đang hiển thị đầu mẫu.</p><button id="screenshot" class="button secondary" disabled>Ảnh PNG</button><button id="export" class="button primary" disabled>Tải head.glb <span aria-hidden="true">↓</span></button><label class="button ghost" for="glb">Mở GLB</label><input id="glb" class="sr-only" type="file" accept=".glb" /></div>
      <details class="diagnostics"><summary>Chẩn đoán template & thời gian xử lý <span>+</span></summary><div class="diagnostic-content"><canvas id="overlay" width="512" height="512" aria-label="Landmark xanh là ảnh, cam là template tham chiếu"></canvas><div><p class="helper">Xanh: landmark ảnh · Cam: landmark template dùng để fit/texture. Sai số thấp không đồng nghĩa đã giống người thật.</p><div id="metrics">Chưa có dữ liệu. Thời gian được đo khi dựng từ ảnh.</div><button id="report" class="text-button" disabled>Tải số đo JSON (không chứa ảnh/landmark)</button></div></div></details>
      <section class="comparison"><div class="section-title"><h2><span>03</span> So sánh trong phiên</h2><button id="clear-history" class="text-button">Xóa ảnh so sánh</button></div><p class="helper">Giữ tối đa 5 cặp ảnh nguồn / kết quả. Chỉ trong tab hiện tại, không lưu xuống ổ đĩa.</p><div id="history"><p class="empty">Các kết quả dựng sẽ xuất hiện ở đây.</p></div></section>
    </div>
  </main>
  <footer>PORTRAIT HEAD LAB <span>Bản thử độc lập · Một ảnh không phải bản quét 3D</span></footer>
`;
const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => element<HTMLInputElement>(id);
const button = (id: string) => element<HTMLButtonElement>(id);
const cropper = new PortraitCropper(element<HTMLCanvasElement>('crop'));
const pipeline = new HeadPipeline();
let viewer: HeadViewer | undefined;
let template: HeadTemplate | undefined;
let ears: EarTemplate | undefined;
let expressionRig: ExpressionRigAsset | undefined;
let result: HeadResult | undefined;
let analysis: Analysis | undefined;
let params: ShapeParams = {};
let currentStyle: Style = 'natural';
let currentExpression: ExpressionSelection = 'neutral';
let hasPhoto = false, busy = false, exporting = false, imported = false;
let photoLoading = false, photoPickerOpen = false;
let renderTimer = 0;
let generationSequence = 0;
let generationAssets: Promise<void> | undefined;
const timings: Array<Record<string, number>> = [];
const history: Array<{ source: string; front: string; quarter: string; back: string; error: number }> = [];
let lifecycle = 0;

function showError(message?: string) { element('error').textContent = message ?? ''; element('error').hidden = !message; }
function setBusy(value: boolean) {
  busy = value;
  if (value) { window.clearTimeout(renderTimer); renderTimer = 0; }
  const locked = value || exporting || photoLoading;
  button('generate').disabled = locked || !hasPhoto || !viewer || !template;
  input('portrait').disabled = locked;
  input('glb').disabled = locked;
  for (const id of ['zoom', 'rotate']) input(id).disabled = locked || !hasPhoto;
  button('reset-crop').disabled = locked || !hasPhoto;
  element('crop').style.pointerEvents = locked ? 'none' : 'auto';
  element('progress-area').hidden = !value;
  for (const id of ['export', 'screenshot']) button(id).disabled = locked || !result && !imported || !viewer;
  document.querySelectorAll<HTMLInputElement | HTMLButtonElement>('[data-style], #strength, #flat, #sliders input, #reset-shape').forEach((control) => {
    control.disabled = control.id === 'strength'
      ? locked || imported || currentStyle === 'natural'
      : locked || imported || control.matches('#sliders input, #reset-shape') && !result;
  });
  updateExpressionControls();
}
function refreshMesh(fit = !viewer?.getHead(), previewOnly = false) {
  if (!template || !viewer || imported) return;
  const personalized = Boolean(result);
  const includeEars = personalized && Boolean(ears);
  const includeOralCavity = personalized && Boolean(expressionRig);
  const preserveExpression = currentExpression !== 'neutral' && Number(input('expression-strength').value) > 0;
  const includeExpressions = includeEars && includeOralCavity && (!previewOnly || preserveExpression);
  const head = createHead(template, ears, expressionRig, result, params, currentStyle, Number(input('strength').value), input('flat').checked, {
    includeEars, includeOralCavity, includeExpressions,
  });
  if (!expressionControls.some(([name]) => name === currentExpression)) currentExpression = 'neutral';
  if (supportsExpressions(head)) applyExpression(head, currentExpression, Number(input('expression-strength').value));
  viewer.setHead(head, fit);
  viewer.wireframe(input('wireframe').checked);
  updateExpressionControls();
}
function ensureGenerationAssets() {
  if (ears && expressionRig) return Promise.resolve();
  generationAssets ??= Promise.all([loadEarTemplate(), loadExpressionRig()]).then(([earTemplate, rig]) => {
    ears = earTemplate;
    expressionRig = rig;
  }).catch((error) => {
    generationAssets = undefined;
    throw error;
  });
  return generationAssets;
}
function updateExpressionControls() {
  const available = supportsExpressions(viewer?.getHead());
  const controls = controlsForObject(viewer?.getHead());
  const container = element('expression-options'), key = controls.map(([name]) => name).join(',');
  if (container.dataset.controls !== key) {
    container.innerHTML = '<button data-expression="neutral" aria-pressed="false">Trung tính</button>' + controls.map(([name, label]) => `<button data-expression="${name}" aria-pressed="false">${label}</button>`).join('');
    container.dataset.controls = key;
  }
  document.querySelectorAll<HTMLButtonElement>('[data-expression]').forEach((control) => {
    const active = control.dataset.expression === currentExpression;
    control.disabled = busy || exporting || photoLoading || !available;
    control.classList.toggle('active', active); control.setAttribute('aria-pressed', String(active));
  });
  input('expression-strength').disabled = busy || exporting || photoLoading || !available || currentExpression === 'neutral';
  element('expression-hint').textContent = imported && !available ? 'GLB này chưa có dữ liệu để chỉnh sáu biểu cảm.' : 'Chọn biểu cảm rồi kéo mức độ để điều chỉnh.';
}
element('expression-options').addEventListener('click', (event) => {
  const control = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-expression]') : null;
  if (!control || control.disabled) return;
  const head = viewer?.getHead();
  if (!head || busy || exporting || !supportsExpressions(head)) return;
  currentExpression = control.dataset.expression as ExpressionSelection;
  applyExpression(head, currentExpression, Number(input('expression-strength').value));
  viewer?.render();
  updateExpressionControls();
});
input('expression-strength').addEventListener('input', () => {
  const head = viewer?.getHead();
  if (!head || busy || exporting) return;
  element<HTMLOutputElement>('expression-value').value = `${Math.round(Number(input('expression-strength').value) * 100)}%`;
  applyExpression(head, currentExpression, Number(input('expression-strength').value));
  viewer?.render();
});
function vertexCount() {
  let count = 0;
  viewer?.getHead()?.traverse((child) => {
    if (child instanceof THREE.Mesh) count += child.geometry.getAttribute('position')?.count ?? 0;
  });
  return count;
}
function scheduleMesh(delay = 220, previewOnly = false) {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => {
    renderTimer = 0;
    refreshMesh(false, previewOnly);
  }, delay);
}

for (const key of manualKeys) {
  const title = shapeControls.find(([name]) => name === key)![1];
  const label = document.createElement('label'); label.className = 'shape-control';
  const caption = document.createElement('span'); caption.textContent = title;
  const value = document.createElement('output'); value.textContent = '0.00';
  const slider = document.createElement('input'); slider.type = 'range'; slider.min = '-1'; slider.max = '1'; slider.step = '0.01'; slider.value = '0'; slider.disabled = true; slider.dataset.key = key;
  slider.addEventListener('input', () => { params[key] = Number(slider.value); value.value = Number(slider.value).toFixed(2); scheduleMesh(220, true); });
  slider.addEventListener('change', () => scheduleMesh(0));
  label.append(caption, value, slider); element('sliders').append(label);
}
function updateSliders() {
  element('sliders').querySelectorAll<HTMLInputElement>('input').forEach((slider) => {
    slider.disabled = !result || imported; slider.value = String(params[slider.dataset.key!] ?? 0);
    slider.parentElement!.querySelector('output')!.value = Number(slider.value).toFixed(2);
  });
  button('reset-shape').disabled = !result || imported;
}
button('reset-shape').addEventListener('click', () => { if (result) { params = { ...result.fit.params }; updateSliders(); scheduleMesh(0); } });

async function selectPhoto(file?: File) {
  if (!file || busy || exporting || photoLoading) return;
  photoLoading = true;
  setBusy(busy);
  showError();
  try {
    if (!await cropper.load(file)) return;
    hasPhoto = true;
    element('crop').hidden = false; element('upload-prompt').hidden = true; element('crop-hint').hidden = false;
    element('filename').textContent = file.name;
    input('zoom').value = '1'; input('rotate').value = '0'; setBusy(false);
  } catch (error) { showError(error instanceof Error ? error.message : 'Không đọc được ảnh.'); }
  finally {
    photoLoading = false;
    photoPickerOpen = false;
    input('portrait').value = '';
    setBusy(busy);
  }
}
input('portrait').addEventListener('click', (event) => {
  if (photoPickerOpen || busy || exporting || photoLoading) { event.preventDefault(); return; }
  photoPickerOpen = true;
});
input('portrait').addEventListener('change', () => {
  photoPickerOpen = false;
  void selectPhoto(input('portrait').files?.[0]);
});
window.addEventListener('focus', () => { photoPickerOpen = false; });
const dropzone = element('dropzone');
dropzone.addEventListener('dragover', (event) => { event.preventDefault(); dropzone.classList.add('dragging'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
dropzone.addEventListener('drop', (event) => { event.preventDefault(); dropzone.classList.remove('dragging'); void selectPhoto(event.dataTransfer?.files[0]); });
for (const id of ['zoom', 'rotate']) input(id).addEventListener('input', () => cropper.transform(Number(input('zoom').value), Number(input('rotate').value)));
button('reset-crop').addEventListener('click', () => { cropper.reset(); input('zoom').value = '1'; input('rotate').value = '0'; });

function thumbnail(source: HTMLCanvasElement | string) {
  if (typeof source === 'string') return source;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 240;
  canvas.getContext('2d')!.drawImage(source, 0, 0, 240, 240); return canvas.toDataURL('image/jpeg', 0.8);
}
function renderHistory() {
  const container = element('history'); container.replaceChildren();
  history.forEach((item, index) => {
    const card = document.createElement('article'); card.className = 'comparison-card';
    const heading = document.createElement('p'); heading.textContent = `Kết quả ${index + 1} · NME ${(item.error * 100).toFixed(1)}%`;
    const pair = document.createElement('div'); pair.className = 'comparison-pair';
    for (const [url, caption] of [[item.source, 'Ảnh crop'], [item.front, 'Chính diện'], [item.quarter, 'Góc ¾'], [item.back, 'Phía sau']]) {
      const figure = document.createElement('figure'); const image = new Image(); image.src = url; image.alt = caption;
      const text = document.createElement('figcaption'); text.textContent = caption; figure.append(image, text); pair.append(figure);
    }
    card.append(heading, pair); container.append(card);
  });
}
function drawDiagnostics(crop: HTMLCanvasElement, detected: Analysis, generated: HeadResult) {
  const canvas = element<HTMLCanvasElement>('overlay'); const context = canvas.getContext('2d')!;
  context.drawImage(crop, 0, 0, canvas.width, canvas.height);
  for (const [points, color] of [[detected.landmarks, '#90f7c3'], [generated.fit.projected, '#ffaa68']] as const) {
    context.fillStyle = color;
    for (let i = 0; i < 468; i += 3) { const [x, y] = points[i]; context.beginPath(); context.arc(x * canvas.width, y * canvas.height, 1.5, 0, Math.PI * 2); context.fill(); }
  }
  const p = (key: string, percentile: number) => {
    const values = timings.map((entry) => entry[key]).filter(Number.isFinite).sort((a, b) => a - b);
    return values.length ? values[Math.min(values.length - 1, Math.ceil(percentile * values.length) - 1)].toFixed(0) : '—';
  };
  const labels: Record<string, string> = { initialize: 'Khởi tạo MediaPipe', detect: 'Landmark', segment: 'Tách tóc/da', fit: 'Khớp template tham chiếu', texture: 'Texture ảnh', warm: 'Xử lý (trừ khởi tạo)', total: 'Tổng' };
  element('metrics').innerHTML = `<div class="metric-highlight"><strong>${(generated.fit.normalizedError * 100).toFixed(2)}%</strong><span>NME / khoảng cách hai đuôi mắt<br>${generated.fit.iterations} vòng tối ưu · ${timings.length} lần dựng</span></div><table><thead><tr><th>Bước</th><th>Lần này</th><th>p50</th><th>p95</th></tr></thead><tbody>${Object.entries(labels).map(([key, label]) => `<tr><td>${label}</td><td>${generated.timings[key].toFixed(0)} ms</td><td>${p(key, 0.5)}</td><td>${p(key, 0.95)}</td></tr>`).join('')}</tbody></table><p class="helper">Số đo của phiên trên máy này; chưa phải benchmark đa thiết bị. Lần dựng đầu có tải/khởi tạo; warm chưa tính export và thời gian vẽ preview.</p>`;
  button('report').disabled = false;
}

button('generate').addEventListener('click', async () => {
  if (!viewer || busy || exporting || photoLoading) return;
  const token = lifecycle;
  const request = ++generationSequence;
  showError(); setBusy(true);
  try {
    if (!ears || !expressionRig) {
      element('phase').textContent = 'Đang tải tài nguyên 3D…';
      element<HTMLProgressElement>('progress').value = 0.04;
      await ensureGenerationAssets();
      if (token !== lifecycle || request !== generationSequence) return;
    }
    const crop = cropper.capture();
    const generated = await pipeline.generate(crop, ({ phase, progress }) => { element('phase').textContent = phase; element<HTMLProgressElement>('progress').value = progress; });
    if (token !== lifecycle || request !== generationSequence) return;
    result = generated.result; analysis = generated.analysis; template = generated.template;
    imported = false; params = { ...result.fit.params }; currentExpression = 'neutral';
    timings.push({ ...result.timings }); if (timings.length > 100) timings.shift();
    refreshMesh(true); updateSliders(); viewer.angle('front');
    const front = viewer.snapshot(240); viewer.angle('quarter'); const quarter = viewer.snapshot(240); viewer.angle('back'); const back = viewer.snapshot(240); viewer.angle('front');
    history.unshift({ source: thumbnail(crop), front, quarter, back, error: result.fit.normalizedError }); if (history.length > 5) history.pop(); renderHistory();
    element('model-status').textContent = 'Mặt gốc + sọ/tai/cổ';
    element('result-summary').textContent = `Đầu 3D · ${vertexCount().toLocaleString('vi')} đỉnh · ${(result.timings.total / 1000).toFixed(2)} giây xử lý ảnh · 6 biểu cảm`;
    drawDiagnostics(crop, analysis, result);
    if (result.fit.warnings.length) showError(result.fit.warnings.join(' '));
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) showError(error instanceof Error ? error.message : 'Không thể dựng đầu 3D.');
  } finally { if (request === generationSequence) setBusy(false); }
});
button('cancel').addEventListener('click', () => {
  ++generationSequence;
  pipeline.cancel();
  element('phase').textContent = 'Đã hủy';
  setBusy(false);
});

document.querySelectorAll<HTMLButtonElement>('[data-angle]').forEach((control) => control.addEventListener('click', () => {
  viewer?.angle(control.dataset.angle as 'front' | 'quarter' | 'back');
  document.querySelectorAll('[data-angle]').forEach((item) => item.classList.toggle('active', item === control));
}));
button('spin').addEventListener('click', () => { const enabled = button('spin').getAttribute('aria-pressed') !== 'true'; button('spin').setAttribute('aria-pressed', String(enabled)); viewer?.rotation(enabled); });
document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((control) => control.addEventListener('click', () => {
  if (imported) { showError('GLB đang mở đã được bake. Hãy dựng từ ảnh để đổi hình học.'); return; }
  const nextStyle = control.dataset.style as Style;
  if (nextStyle === currentStyle) return;
  currentStyle = nextStyle;
  document.querySelectorAll('[data-style]').forEach((item) => item.classList.toggle('active', item === control));
  input('strength').disabled = busy || exporting || photoLoading || imported || currentStyle === 'natural';
  scheduleMesh(0);
}));
input('strength').addEventListener('input', () => { if (currentStyle !== 'natural') scheduleMesh(220, true); });
input('strength').addEventListener('change', () => { if (currentStyle !== 'natural') scheduleMesh(0); });
input('flat').addEventListener('change', () => { updateFlatAppearance(viewer?.getHead(), input('flat').checked); viewer?.render(); });
input('wireframe').addEventListener('change', () => viewer?.wireframe(input('wireframe').checked));

button('export').addEventListener('click', async () => {
  const head = viewer?.getHead(); if (!head || exporting || busy) return;
  exporting = true; setBusy(false); showError();
  try {
    const started = performance.now();
    const data = await exportHead(head);
    const checked = await inspectGLB(data, head); disposeObject(checked.object);
    const elapsed = performance.now() - started;
    if (result) result.timings.export = elapsed;
    download(data, 'head.glb', 'model/gltf-binary');
    element('result-summary').textContent = `Đã xuất và đọc lại GLB · ${(data.byteLength / 1048576).toFixed(2)} MB · ${checked.stats.vertexCount.toLocaleString('vi')} đỉnh · ${elapsed.toFixed(0)} ms`;
  } catch (error) { showError(error instanceof Error ? error.message : 'Không xuất được GLB.'); }
  finally { exporting = false; setBusy(false); }
});
button('screenshot').addEventListener('click', () => {
  if (!viewer) return;
  const data = viewer.snapshot();
  const bytes = Uint8Array.from(atob(data.slice(data.indexOf(',') + 1)), (character) => character.charCodeAt(0));
  download(bytes.buffer, 'head-preview.png', 'image/png');
});
input('glb').addEventListener('change', async () => {
  const file = input('glb').files?.[0]; if (!file || !viewer || busy || exporting) return;
  if (file.size > 50 * 1048576) { showError('Hãy chọn GLB dưới 50 MB.'); input('glb').value = ''; return; }
  const token = lifecycle;
  exporting = true; setBusy(false);
  try {
    showError(); const loaded = await inspectGLB(await file.arrayBuffer());
    if (token !== lifecycle) { disposeObject(loaded.object); return; }
    imported = true; viewer.setHead(loaded.object); viewer.angle('front');
    const active = readExpression(loaded.object);
    currentExpression = active.name;
    input('expression-strength').value = String(active.strength);
    element<HTMLOutputElement>('expression-value').value = `${Math.round(active.strength * 100)}%`;
    updateSliders(); setBusy(false); element('model-status').textContent = 'GLB mở lại';
    element('result-summary').textContent = `GLB · ${loaded.stats.meshCount} mesh · ${loaded.stats.vertexCount.toLocaleString('vi')} đỉnh · ${loaded.stats.textured} vật liệu có texture`;
  } catch (error) { showError(error instanceof Error ? error.message : 'Không mở được GLB.'); }
  finally { exporting = false; input('glb').value = ''; setBusy(false); }
});
button('report').addEventListener('click', () => {
  const report = { app: 'portrait-head-lab/0.1.0', browser: navigator.userAgent, cpuThreads: navigator.hardwareConcurrency, sampleCount: timings.length, runs: timings, currentNormalizedError: result?.fit.normalizedError, currentStyle, note: 'Số đo của phiên này; không gồm ảnh, landmark hay thông số nhận dạng.' };
  download(JSON.stringify(report, null, 2), 'head-lab-metrics.json', 'application/json');
});
button('clear-history').addEventListener('click', () => { history.length = 0; renderHistory(); });
element('viewer').addEventListener('viewererror', (event) => showError((event as CustomEvent<string>).detail));

async function initialize() {
  const token = lifecycle;
  try {
    if (!window.Worker || !window.WebAssembly || !window.createImageBitmap || !window.OffscreenCanvas) throw new Error('Bản thử cần Worker, WebAssembly và OffscreenCanvas. Hãy dùng trình duyệt mới.');
    viewer = new HeadViewer(element('viewer'));
    const loaded = await loadTemplate();
    if (token !== lifecycle) return;
    template = loaded.template;
    // Show a lightweight head immediately; expensive ears and six expression
    // targets are only built after the user asks for a personalized head.
    refreshMesh(true, true);
    element('model-status').textContent = 'Mesh đầu–cổ tự sinh';
    element('result-summary').textContent = `Mesh mẫu xem nhanh · ${vertexCount().toLocaleString('vi')} đỉnh · chọn ảnh để cá nhân hóa`;
    setBusy(false);
  } catch (error) { showError(error instanceof Error ? error.message : 'Không khởi động được preview WebGL.'); }
}
void initialize();
window.addEventListener('pagehide', () => {
  ++lifecycle; ++generationSequence; pipeline.dispose(); cropper.dispose(); viewer?.dispose();
  window.clearTimeout(renderTimer); renderTimer = 0; history.length = 0; element('history').replaceChildren(); result = undefined; analysis = undefined;
  const overlay = element<HTMLCanvasElement>('overlay'); overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
});
window.addEventListener('pageshow', (event) => { if (event.persisted) window.location.reload(); });
