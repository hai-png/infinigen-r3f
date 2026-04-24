/**
 * FlowerGenerator - Flowering plants
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../core/util/math/distributions';
export class FlowerGenerator extends BaseObjectGenerator {
    getDefaultConfig() {
        return { petalCount: 8, petalSize: 0.05, stemHeight: 0.3, flowerType: 'daisy', color: 0xffffff };
    }
    generate(config = {}) {
        const fullConfig = { ...this.getDefaultConfig(), ...config };
        const rng = new SeededRandom(this.seed);
        const group = new THREE.Group();
        const stem = this.createStem(fullConfig);
        group.add(stem);
        const petals = this.createPetals(fullConfig, rng);
        petals.position.y = fullConfig.stemHeight;
        group.add(petals);
        const center = this.createCenter(fullConfig);
        center.position.y = fullConfig.stemHeight;
        group.add(center);
        group.userData.tags = ['vegetation', 'flower', fullConfig.flowerType];
        return group;
    }
    createStem(config) {
        const geom = new THREE.CylinderGeometry(0.01, 0.02, config.stemHeight, 8);
        const mat = new THREE.MeshStandardMaterial({ color: 0x2d5a1f });
        return new THREE.Mesh(geom, mat);
    }
    createPetals(config, rng) {
        const group = new THREE.Group();
        for (let i = 0; i < config.petalCount; i++) {
            const angle = (i / config.petalCount) * Math.PI * 2;
            const petal = new THREE.Mesh(new THREE.SphereGeometry(config.petalSize, 8, 8), new THREE.MeshStandardMaterial({ color: config.color }));
            petal.position.set(Math.cos(angle) * config.petalSize * 0.5, 0, Math.sin(angle) * config.petalSize * 0.5);
            petal.lookAt(new THREE.Vector3(0, 0, 0));
            group.add(petal);
        }
        return group;
    }
    createCenter(config) {
        const geom = new THREE.SphereGeometry(config.petalSize * 0.5, 8, 8);
        const color = config.flowerType === 'sunflower' ? 0x8b4513 : 0xffff00;
        const mat = new THREE.MeshStandardMaterial({ color });
        return new THREE.Mesh(geom, mat);
    }
}
//# sourceMappingURL=FlowerGenerator.js.map