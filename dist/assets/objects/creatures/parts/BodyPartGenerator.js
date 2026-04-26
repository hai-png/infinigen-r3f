import { Mesh } from 'three';
export class BodyPartGenerator {
    constructor(seed) {
        this.seed = seed;
    }
    generateHead(size) { return new Mesh(new this.SphereGeometry(size), new this.MeshStandardMaterial({ color: 0xff0000 })); }
    generateTorso(size) { return new Mesh(new this.BoxGeometry(size, size * 1.5, size * 0.8), new this.MeshStandardMaterial({ color: 0xff0000 })); }
    generateLimb(type, size) { return new Mesh(new this.CylinderGeometry(size * 0.1, size * 0.08, size), new this.MeshStandardMaterial({ color: 0xff0000 })); }
}
//# sourceMappingURL=BodyPartGenerator.js.map