export class PortraitCropper {
  private bitmap?: ImageBitmap;
  private zoom = 1;
  private rotation = 0;
  private offset = { x: 0, y: 0 };
  private pointer?: { id: number; x: number; y: number };
  private version = 0;

  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = canvas.height = 768;
    canvas.addEventListener('pointerdown', (event) => {
      if (!this.bitmap) return;
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.pointer || this.pointer.id !== event.pointerId) return;
      const ratio = canvas.width / canvas.getBoundingClientRect().width;
      this.offset.x += (event.clientX - this.pointer.x) * ratio;
      this.offset.y += (event.clientY - this.pointer.y) * ratio;
      this.pointer.x = event.clientX; this.pointer.y = event.clientY;
      this.draw();
    });
    const release = () => { this.pointer = undefined; };
    canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
  }
  async load(file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Hãy chọn ảnh JPEG, PNG hoặc WebP.');
    if (file.size > 25 * 1024 * 1024) throw new Error('Ảnh quá lớn. Hãy chọn ảnh dưới 25 MB.');
    const version = ++this.version;
    let bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (Math.max(bitmap.width, bitmap.height) > 2048) {
      const scale = 2048 / Math.max(bitmap.width, bitmap.height);
      const resized = await createImageBitmap(bitmap, { resizeWidth: Math.round(bitmap.width * scale), resizeHeight: Math.round(bitmap.height * scale), resizeQuality: 'high' });
      bitmap.close(); bitmap = resized;
    }
    if (version !== this.version) { bitmap.close(); return false; }
    this.bitmap?.close(); this.bitmap = bitmap; this.reset(); return true;
  }
  reset() { this.zoom = 1; this.rotation = 0; this.offset = { x: 0, y: 0 }; this.draw(); }
  transform(zoom: number, rotation: number) { this.zoom = zoom; this.rotation = rotation; this.draw(); }
  private draw() {
    const context = this.canvas.getContext('2d');
    if (!context) return;
    const side = this.canvas.width;
    context.fillStyle = '#24252b'; context.fillRect(0, 0, side, side);
    if (!this.bitmap) return;
    const scale = Math.max(side / this.bitmap.width, side / this.bitmap.height) * this.zoom;
    context.save(); context.translate(side / 2 + this.offset.x, side / 2 + this.offset.y);
    context.rotate(this.rotation * Math.PI / 180); context.scale(scale, scale);
    context.drawImage(this.bitmap, -this.bitmap.width / 2, -this.bitmap.height / 2); context.restore();
  }
  capture() {
    if (!this.bitmap) throw new Error('Hãy chọn ảnh trước.');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Không tạo được ảnh crop.');
    context.drawImage(this.canvas, 0, 0, 1024, 1024); return canvas;
  }
  dispose() { ++this.version; this.bitmap?.close(); this.bitmap = undefined; this.draw(); }
}
