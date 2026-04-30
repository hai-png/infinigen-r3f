/**
 * DeciduousGenerator - Broadleaf trees
 */
import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../core/util/math/index';
import { Noise3D } from '../../../../core/util/math/noise';

export type DeciduousType = 'oak' | 'maple' | 'birch' | 'willow' | 'ash';
export interface DeciduousConfig extends BaseGeneratorConfig {
  height: number;
  crownRadius: number;
  trunkThickness: number;
  treeType: DeciduousType;
  leafColor: number;
}

export class DeciduousGenerator extends BaseObjectGenerator<DeciduousConfig> {
  private noise = new Noise3D();
  getDefaultConfig(): DeciduousConfig {
    return { height: 8.0, crownRadius: 3.0, trunkThickness: 0.4, treeType: 'oak', leafColor: 0x2d5a1f };
  }

  generate(config: Partial<DeciduousConfig> = {}): THREE.Group {
    const fullConfig = { ...this.getDefaultConfig(), ...config };
    const rng = new SeededRandom(this.seed);
    const group = new THREE.Group();
    const trunk = this.createTrunk(fullConfig);
    group.add(trunk);
    const crown = this.createCrown(fullConfig, rng);
    crown.position.y = fullConfig.height * 0.7;
    group.add(crown);
    group.userData.tags = ['vegetation', 'tree', 'deciduous', fullConfig.treeType];
    return group;
  }

  private createTrunk(config: DeciduousConfig): THREE.Mesh {
    const geom = new THREE.CylinderGeometry(config.trunkThickness * 0.7, config.trunkThickness, config.height * 0.7, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.y = config.height * 0.35;
    return mesh;
  }

  private createCrown(config: DeciduousConfig, rng: SeededRandom): THREE.InstancedMesh {
    const geom = new THREE.SphereGeometry(0.3, 6, 6);
    const mat = new THREE.MeshStandardMaterial({ color: config.leafColor });
    const mesh = new THREE.InstancedMesh(geom, mat, 300);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 300; i++) {
      const theta = rng.uniform(0, Math.PI * 2);
      const phi = Math.acos(2 * rng.uniform(0, 1) - 1);
      const r = rng.uniform(0.5, 1.0) * config.crownRadius;
      dummy.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
      dummy.scale.setScalar(rng.uniform(0.5, 1.0));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
}
