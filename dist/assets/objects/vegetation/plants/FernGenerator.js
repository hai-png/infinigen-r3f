/**
 * FernGenerator - Procedural fern species with fronds and pinnae
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../core/util/math/distributions';
export class FernGenerator extends BaseObjectGenerator {
    getDefaultConfig() {
        return {
            frondCount: 12,
            frondLength: 0.4,
            pinnaePerFrond: 20,
            curvature: 0.5,
            species: 'boston',
            size: 1.0
        };
    }
    generate(config = {}) {
        const fullConfig = { ...this.getDefaultConfig(), ...config };
        const rng = new SeededRandom(this.seed);
        const group = new THREE.Group();
        // Generate fronds
        for (let i = 0; i < fullConfig.frondCount; i++) {
            const frond = this.createFrond(fullConfig, rng, i);
            group.add(frond);
        }
        group.userData.tags = ['vegetation', 'fern', fullConfig.species];
        return group;
    }
    createFrond(config, rng, index) {
        const frondGroup = new THREE.Group();
        const angle = (index / config.frondCount) * Math.PI * 2;
        const radius = 0.05;
        frondGroup.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        frondGroup.rotation.y = -angle;
        // Create rachis (central stem)
        const rachis = this.createRachis(config, rng);
        frondGroup.add(rachis);
        // Create pinnae (leaflets)
        for (let i = 0; i < config.pinnaePerFrond; i++) {
            const pinna = this.createPinna(config, rng, i);
            const t = i / config.pinnaePerFrond;
            pinna.position.set(0, t * config.frondLength, 0);
            pinna.rotation.z = Math.PI / 2 + t * 0.2;
            frondGroup.add(pinna);
        }
        return frondGroup;
    }
    createRachis(config, rng) {
        const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, config.frondLength * 0.5, 0),
            new THREE.Vector3(0, config.frondLength, config.curvature * 0.2)
        ]);
        const geometry = new THREE.TubeGeometry(curve, 16, 0.01, 4, false);
        const material = new THREE.MeshStandardMaterial({ color: 0x2d5a1f });
        return new THREE.Mesh(geometry, material);
    }
    createPinna(config, rng, index) {
        const length = 0.08 * (1 - index / config.pinnaePerFrond * 0.5);
        const width = 0.02;
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.quadraticCurveTo(length * 0.5, width, length, 0);
        shape.quadraticCurveTo(length * 0.5, -width, 0, 0);
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.001, bevelEnabled: false });
        const material = new THREE.MeshStandardMaterial({ color: 0x3d7a2f, side: THREE.DoubleSide });
        return new THREE.Mesh(geometry, material);
    }
}
//# sourceMappingURL=FernGenerator.js.map