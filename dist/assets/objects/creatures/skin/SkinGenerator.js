import { MeshStandardMaterial } from 'three';
export class SkinGenerator {
    constructor(seed) {
        this.seed = seed;
    }
    generateFur(color, length) {
        return new MeshStandardMaterial({ color, roughness: 0.8 });
    }
    generateScales(color, pattern) {
        return new MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 });
    }
    generateFeathers(color, pattern) {
        return new MeshStandardMaterial({ color, roughness: 0.6 });
    }
    generateSmoothSkin(color) {
        return new MeshStandardMaterial({ color, roughness: 0.3 });
    }
}
//# sourceMappingURL=SkinGenerator.js.map