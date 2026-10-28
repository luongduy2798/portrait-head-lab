import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { disposeObject } from './mesh';

export class HeadViewer {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.005, 10);
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private observer: ResizeObserver;
  private frame = 0;
  private object?: THREE.Object3D;
  private target = new THREE.Vector3(0, -0.022, -0.01);
  private viewDistance = 0.58;
  private viewRadius = 0.16;
  private currentAngle: 'front' | 'quarter' | 'back' = 'front';
  private turn = 0;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.domElement.setAttribute('aria-label', 'Đầu 3D; kéo chuột để xoay, cuộn để phóng to');
    this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      container.dispatchEvent(new CustomEvent('viewererror', { detail: 'Mất bộ nhớ đồ họa. Hãy tải lại trang và thử ảnh nhỏ hơn.' }));
    });
    container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.23; this.controls.maxDistance = 1.2;
    this.scene.add(new THREE.HemisphereLight(0xf8f4ff, 0x44465b, 2.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(-0.3, 0.4, 0.6); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xbed1ff, 1.1); fill.position.set(0.3, 0.15, -0.4); this.scene.add(fill);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container);
    this.angle('front'); this.resize(); this.animate();
  }
  private resize() {
    const width = Math.max(1, this.container.clientWidth), height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
  }
  private animate = () => {
    this.frame = requestAnimationFrame(this.animate);
    this.controls.autoRotate = this.turn !== 0;
    this.controls.autoRotateSpeed = this.turn;
    this.controls.update(); this.renderer.render(this.scene, this.camera);
  };
  setHead(object: THREE.Object3D, fit = true) {
    if (this.object) { this.scene.remove(this.object); disposeObject(this.object); }
    this.object = object; this.scene.add(object);
    if (fit) {
      this.fitHead(object);
      this.angle(this.currentAngle);
    }
  }
  getHead() { return this.object; }
  private fitHead(object: THREE.Object3D) {
    object.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(object, true);
    if (bounds.isEmpty()) return;
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = size.length() * 0.5;
    if (![...size.toArray(), ...center.toArray(), radius].every(Number.isFinite) || radius <= 0) return;

    this.target.copy(center);
    this.target.y -= size.y * 0.035;
    this.viewRadius = radius;
    this.viewDistance = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * 1.08;
    this.controls.minDistance = Math.max(radius * 0.25, 0.005);
    this.controls.maxDistance = Math.max(this.viewDistance * 8, radius * 12);
    this.camera.near = Math.max(radius / 1000, 0.0001);
    this.camera.far = Math.max(10, this.viewDistance + radius * 20);
    this.camera.updateProjectionMatrix();
  }
  angle(angle: 'front' | 'quarter' | 'back') {
    this.currentAngle = angle;
    const theta = angle === 'front' ? 0 : angle === 'quarter' ? Math.PI / 4 : Math.PI;
    this.camera.position.set(this.target.x + Math.sin(theta) * this.viewDistance, this.target.y + this.viewRadius * 0.12, this.target.z + Math.cos(theta) * this.viewDistance);
    this.controls.target.copy(this.target); this.camera.lookAt(this.target); this.controls.update();
  }
  rotation(enabled: boolean) { this.turn = enabled ? 0.8 : 0; }
  wireframe(enabled: boolean) {
    this.object?.traverse((child) => {
      if (child instanceof THREE.Mesh) for (const material of Array.isArray(child.material) ? child.material : [child.material]) (material as THREE.MeshStandardMaterial).wireframe = enabled;
    });
  }
  snapshot(size?: number) {
    this.renderer.render(this.scene, this.camera);
    if (size) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      const source = this.renderer.domElement;
      const scale = Math.min(size / source.width, size / source.height);
      canvas.getContext('2d')!.drawImage(source, (size - source.width * scale) / 2, (size - source.height * scale) / 2, source.width * scale, source.height * scale);
      return canvas.toDataURL('image/png');
    }
    return this.renderer.domElement.toDataURL('image/png');
  }
  dispose() {
    cancelAnimationFrame(this.frame); this.observer.disconnect(); this.controls.dispose();
    if (this.object) disposeObject(this.object);
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
