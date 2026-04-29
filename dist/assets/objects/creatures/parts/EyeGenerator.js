import { Group, Mesh, SphereGeometry, MeshStandardMaterial } from 'three';
export class EyeGenerator {
    constructor(seed) {
        this.seed = seed;
    }
    generate(type, count, size) {
        const eyes = new Group();
        for (let i = 0; i < count; i++) {
            const eye = new Mesh(new SphereGeometry(size), new MeshStandardMaterial({ color: 0x000000 }));
            eye.position.set(i === 0 ? -size : size, 0, size * 0.8);
            eyes.add(eye);
        }
        return eyes;
    }
}
//# sourceMappingURL=EyeGenerator.js.map