import { Mesh, ConeGeometry, BoxGeometry, MeshStandardMaterial } from 'three';
export class MouthGenerator {
    constructor(seed) {
        this.seed = seed;
    }
    generate(type, size) {
        const geometry = type === 'beak' ? new ConeGeometry(size * 0.5, size, 8) : new BoxGeometry(size, size * 0.5, size * 0.3);
        return new Mesh(geometry, new MeshStandardMaterial({ color: 0xFFD700 }));
    }
}
export const BeakGenerator = MouthGenerator;
//# sourceMappingURL=MouthGenerator.js.map