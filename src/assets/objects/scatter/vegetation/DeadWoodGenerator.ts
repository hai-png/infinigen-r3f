/**
 * DeadWoodGenerator - Fallen trees and branches
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../core/util/math/distributions';

export type DeadWoodType = 'fallen_log' | 'snag' | 'branch_pile' | 'stump';
export interface DeadWoodConfig {
  length: number;
  radius: number;
  woodType: DeadWoodType;
  decay: number;
}

export class DeadWoodGenerator extends BaseObjectGenerator<DeadWoodConfig> {
  getDefaultConfig(): DeadWoodConfig {
    return { length: 3.0, radius: 0.3, woodType: 'fallen_log', decay: 0.2 };
  }

  generate(config: Partial<DeadWoodConfig> = {}): THREE.Group {
    const fullConfig = { ...this.getDefaultConfig(), ...config };
    const rng = new SeededRandom(this.seed);
    const group = new THREE.Group();
    
    if (fullConfig.woodType === 'fallen_log') {
      const log = this.createLog(fullConfig, rng);
      group.add(log);
    } else if (fullConfig.woodType === 'snag') {
      const snag = this.createSnag(fullConfig, rng);
      group.add(snag);
    } else if (fullConfig.woodType === 'branch_pile') {
      for (let i = 0; i < 5; i++) {
        const branch = this.createBranch(fullConfig, rng);
        branch.position.set(rng.uniform(-0.5, 0.5), rng.uniform(0, 0.3), rng.uniform(-0.5, 0.5));
        group.add(branch);
      }
    } else if (fullConfig.woodType === 'stump') {
      const stump = this.createStump(fullConfig);
      group.add(stump);
    }
    
    group.userData.tags = ['vegetation', 'deadwood', fullConfig.woodType];
    return group;
  }

  private createLog(config: DeadWoodConfig, rng: SeededRandom): THREE.Mesh {
    const geom = new THREE.CylinderGeometry(config.radius * 0.8, config.radius, config.length, 8);
    const color = 0x6b4423 * (1 - config.decay * 0.3);
    const mat = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.z = Math.PI / 2;
    return mesh;
  }

  private createSnag(config: DeadWoodConfig, rng: SeededRandom): THREE.Mesh {
    const geom = new THREE.CylinderGeometry(config.radius * 0.5, config.radius * 1.2, config.length, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
    return new THREE.Mesh(geom, mat);
  }

  private createBranch(config: DeadWoodConfig, rng: SeededRandom): THREE.Mesh {
    const geom = new THREE.CylinderGeometry(0.05, 0.08, 1.0, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0x6b4423 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.set(rng.uniform(0, Math.PI), rng.uniform(0, Math.PI), rng.uniform(0, Math.PI));
    return mesh;
  }

  private createStump(config: DeadWoodConfig): THREE.Mesh {
    const geom = new THREE.CylinderGeometry(config.radius, config.radius * 1.1, config.length * 0.3, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
    return new THREE.Mesh(geom, mat);
  }
}
