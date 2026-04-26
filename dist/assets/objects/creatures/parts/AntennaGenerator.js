import { Group, Mesh } from 'three';
export class AntennaGenerator {
    constructor(seed) {
        this.seed = seed;
    }
    generate(type, length) {
        const antennas = new Group();
        const left = new Mesh(new this.CylinderGeometry(0.01, 0.01, length), new this.MeshStandardMaterial({ color: 0x333333 }));
        const right = left.clone();
        left.position.x = -0.05;
        right.position.x = 0.05;
        antennas.add(left, right);
        return antennas;
    }
}
//# sourceMappingURL=AntennaGenerator.js.map