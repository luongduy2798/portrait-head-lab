import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeObject } from './mesh';
import { expressionControls, updateExpressionBounds } from './expressions';

export async function exportHead(object: THREE.Object3D) {
  // Export identity/style geometry, expression targets and the active weights.
  const clone = object.clone(true);
  clone.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const copyMaterial = (material: THREE.Material) => {
      const next = material.clone() as THREE.MeshStandardMaterial; next.wireframe = false;
      return next;
    };
    // A material array requires geometry groups. Keep single-material ears
    // single-material so the exporter does not omit their ungrouped meshes.
    child.material = Array.isArray(child.material) ? child.material.map(copyMaterial) : copyMaterial(child.material);
  });
  try {
    const exporter = new GLTFExporter();
    exporter.register(() => ({
      writeMesh(mesh, definition) {
        const primitives = definition.primitives as Array<{ attributes: Record<string, number> }>;
        primitives.forEach((primitive, index) => {
          const material = Array.isArray(mesh.material)
            ? mesh.material[mesh.geometry.groups[index].materialIndex ?? 0] : mesh.material;
          // glTF always applies COLOR_0. The photo material ignores vertex
          // colors in Three.js, so exporting them would tint the face twice.
          if (!material.vertexColors) {
            primitive.attributes = { ...primitive.attributes };
            delete primitive.attributes.COLOR_0;
          }
        });
      },
    }));
    const data = await exporter.parseAsync(clone, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
    if (!(data instanceof ArrayBuffer)) throw new Error('Không nhận được GLB binary.');
    return data;
  } finally {
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
    });
  }
}

export async function inspectGLB(data: ArrayBuffer, expected?: THREE.Object3D) {
  const imported = await new GLTFLoader().parseAsync(data, '');
  let meshCount = 0, vertexCount = 0, textured = 0;
  const box = new THREE.Box3().setFromObject(imported.scene, true);
  imported.scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (expressionControls.every(([name]) => child.morphTargetDictionary?.[name] !== undefined)) updateExpressionBounds(child.geometry);
    meshCount++; vertexCount += child.geometry.getAttribute('position').count;
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) if ((material as THREE.MeshStandardMaterial).map) textured++;
  });
  if (meshCount === 0 || vertexCount === 0 || box.isEmpty()) { disposeObject(imported.scene); throw new Error('GLB không chứa mesh đầu.'); }
  if (expected) {
    // Compare the active pose. Cached geometry bounds include every possible
    // morph and glTF can split the head into several material primitives.
    const reference = new THREE.Box3().setFromObject(expected, true);
    if (reference.min.distanceTo(box.min) > 0.0001 || reference.max.distanceTo(box.max) > 0.0001) {
      disposeObject(imported.scene); throw new Error('Bounds GLB không khớp preview.');
    }
  }
  return { object: imported.scene, stats: { meshCount, vertexCount, textured } };
}

export function download(data: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
