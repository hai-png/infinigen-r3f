import { Mesh, ConeGeometry, CylinderGeometry, MeshStandardMaterial } from 'three';
export class TailGenerator {
    constructor(seed) {
        this.seed = seed;
    }
    generate(type, length) {
        const geometry = type === 'bushy' ? new ConeGeometry(length * 0.15, length, 8) : new CylinderGeometry(length * 0.05, length * 0.02, length);
        return new Mesh(geometry, new MeshStandardMaterial({ color: 0x8B4513 }));
    }
}
//# sourceMappingURL=TailGenerator.js.map