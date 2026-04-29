/**
 * ConiferGenerator - Pine, fir, spruce trees
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
export class ConiferGenerator extends BaseObjectGenerator {
    getDefaultConfig() {
        return { height: 6.0, baseRadius: 1.5, tierCount: 8, coniferType: 'pine' };
    }
    generate(config = {}) {
        const fullConfig = { ...this.getDefaultConfig(), ...config };
        const group = new THREE.Group();
        const trunk = this.createTrunk(fullConfig);
        group.add(trunk);
        for (let i = 0; i < fullConfig.tierCount; i++) {
            const tier = this.createTier(fullConfig, i);
            group.add(tier);
        }
        group.userData.tags = ['vegetation', 'tree', 'conifer', fullConfig.coniferType];
        return group;
    }
    createTrunk(config) {
        const geom = new THREE.CylinderGeometry(0.2, config.baseRadius * 0.3, config.height * 0.4, 8);
        const mat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.y = config.height * 0.2;
        return mesh;
    }
    createTier(config, index) {
        const t = index / config.tierCount;
        const y = config.height * (0.3 + t * 0.7);
        const radius = config.baseRadius * (1 - t) * 1.2;
        const height = config.height / config.tierCount * 1.5;
        const geom = new THREE.ConeGeometry(radius, height, 8);
        const mat = new THREE.MeshStandardMaterial({ color: 0x1a472a });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.y = y;
        return mesh;
    }
}
//# sourceMappingURL=ConiferGenerator.js.map