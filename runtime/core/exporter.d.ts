import * as THREE from 'three';
export declare function exportHead(object: THREE.Object3D): Promise<ArrayBuffer>;
export declare function inspectGLB(data: ArrayBuffer, expected?: THREE.Object3D): Promise<{
    object: THREE.Group<THREE.Object3DEventMap>;
    stats: {
        meshCount: number;
        vertexCount: number;
        textured: number;
    };
}>;
