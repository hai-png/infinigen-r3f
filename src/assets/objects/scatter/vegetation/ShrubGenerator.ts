/**
 * ShrubGenerator - Bushes and shrubs
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../math/distributions';
import { Noise3D } from '../../../../math/noise';

export type ShrubType = 'boxwood' | 'hydrangea' | 'lavender' | 'juniper' | 'rhododendron';
export interface ShrubConfig {
  width: number;
  height: number;
  density: number;
  shrubType: ShrubType;
  leafColor: number;
}

export class ShrubGenerator extends BaseObjectGenerator<ShrubConfig> {
  private noise = new Noise3D();
  getDefaultConfig(): ShrubConfig {
    return { width: 0.5, height: 0.4, density: 200, shrubType: 'boxwood', leafColor: 0x2d5a1f };
  }

  generate(config: Partial<ShrubConfig> = {}): THREE.Group {
    const fullConfig = { ...this.getDefaultConfig(), ...config };
    const rng = new SeededRandom(this.seed);
    const group = new THREE.Group();
    const foliage = this.createFoliage(fullConfig, rng);
    group.add(foliage);
    group.userData.tags = ['vegetation', 'shrub', fullConfig.shrubType];
    return group;
  }

  private createFoliage(config: ShrubConfig, rng: SeededRandom): THREE.InstancedMesh {
    const geom = new THREE.SphereGeometry(0.03, 6, 6);
    const mat = new THREE.MeshStandardMaterial({ color: config.leafColor });
    const mesh = new THREE.InstancedMesh(geom, mat, config.density);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < config.density; i++) {
      const theta = rng.uniform(0, Math.PI * 2);
      const phi = Math.acos(2 * rng.uniform(0, 1) - 1);
      const r = rng.uniform(0.3, 1.0);
      const x = r * config.width * 0.5 * Math.sin(phi) * Math.cos(theta);
      const y = r * config.height * Math.cos(phi);
      const z = r * config.width * 0.5 * Math.sin(phi) * Math.sin(theta);
      dummy.position.set(x, y + config.height * 0.5, z);
      dummy.scale.setScalar(0.5 + rng.uniform(0, 0.5));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
}
