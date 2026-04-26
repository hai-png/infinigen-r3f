import { Mesh } from 'three';
export class MouthGenerator {
    constructor(seed) {
        this.seed = seed;
    }
    generate(type, size) {
        const geometry = type === 'beak' ? new this.ConeGeometry(size * 0.5, size, 8) : new this.BoxGeometry(size, size * 0.5, size * 0.3);
        return new Mesh(geometry, new this.MeshStandardMaterial({ color: 0xFFD700 }));
    }
}
//# sourceMappingURL=MouthGenerator.js.map