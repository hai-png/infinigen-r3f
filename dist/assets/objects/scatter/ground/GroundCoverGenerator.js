/**
 * GroundCoverGenerator - Leaves, twigs, pebbles
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../core/util/math/index';
export class GroundCoverGenerator extends BaseObjectGenerator {
    getDefaultConfig() {
        return { coverage: 1.0, density: 500, coverType: 'mixed', color: 0x8b7355 };
    }
    generate(config = {}) {
        const fullConfig = { ...this.getDefaultConfig(), ...config };
        const rng = new SeededRandom(this.seed);
        const group = new THREE.Group();
        if (fullConfig.coverType === 'leaves' || fullConfig.coverType === 'mixed') {
            group.add(this.createLeaves(fullConfig, rng));
        }
        if (fullConfig.coverType === 'twigs' || fullConfig.coverType === 'mixed') {
            group.add(this.createTwigs(fullConfig, rng));
        }
        if (fullConfig.coverType === 'pebbles' || fullConfig.coverType === 'mixed') {
            group.add(this.createPebbles(fullConfig, rng));
        }
        group.userData.tags = ['groundcover', fullConfig.coverType];
        return group;
    }
    createLeaves(config, rng) {
        const geom = new THREE.PlaneGeometry(0.05, 0.05);
        const mat = new THREE.MeshStandardMaterial({ color: config.color, side: THREE.DoubleSide });
        const mesh = new THREE.InstancedMesh(geom, mat, config.density);
        const dummy = new THREE.Object3D();
        for (let i = 0; i < config.density; i++) {
            dummy.position.set(rng.uniform(-1, 1), 0.01, rng.uniform(-1, 1));
            dummy.rotation.set(Math.PI / 2, 0, rng.uniform(0, Math.PI * 2));
            dummy.scale.setScalar(rng.uniform(0.5, 1.0));
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        return mesh;
    }
    createTwigs(config, rng) {
        const geom = new THREE.CylinderGeometry(0.01, 0.01, 0.2, 4);
        const mat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
        const mesh = new THREE.InstancedMesh(geom, mat, config.density / 2);
        const dummy = new THREE.Object3D();
        for (let i = 0; i < config.density / 2; i++) {
            dummy.position.set(rng.uniform(-1, 1), 0.02, rng.uniform(-1, 1));
            dummy.rotation.set(rng.uniform(0, Math.PI), rng.uniform(0, Math.PI), rng.uniform(0, Math.PI));
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        return mesh;
    }
    createPebbles(config, rng) {
        const geom = new THREE.SphereGeometry(0.03, 6, 6);
        const mat = new THREE.MeshStandardMaterial({ color: 0x808080 });
        const mesh = new THREE.InstancedMesh(geom, mat, config.density / 3);
        const dummy = new THREE.Object3D();
        for (let i = 0; i < config.density / 3; i++) {
            dummy.position.set(rng.uniform(-1, 1), 0.015, rng.uniform(-1, 1));
            dummy.scale.setScalar(rng.uniform(0.5, 1.0));
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        return mesh;
    }
}
//# sourceMappingURL=GroundCoverGenerator.js.map