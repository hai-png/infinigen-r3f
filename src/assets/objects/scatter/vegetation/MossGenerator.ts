/**
 * MossGenerator - Moss and lichen patches
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../core/util/math/distributions';
import { Noise3D } from '../../../../core/util/math/noise';

export type MossType = 'sheet' | 'clump' | 'lichen';
export interface MossConfig {
  patchSize: number;
  density: number;
  height: number;
  mossType: MossType;
  color: number;
}

export class MossGenerator extends BaseObjectGenerator<MossConfig> {
  private noise = new Noise3D();
  getDefaultConfig(): MossConfig {
    return { patchSize: 0.5, density: 100, height: 0.02, mossType: 'sheet', color: 0x4a7c23 };
  }

  generate(config: Partial<MossConfig> = {}): THREE.Group {
    const fullConfig = { ...this.getDefaultConfig(), ...config };
    const rng = new SeededRandom(this.seed);
    const group = new THREE.Group();
    const mesh = this.createMossPatch(fullConfig, rng);
    group.add(mesh);
    group.userData.tags = ['vegetation', 'moss', fullConfig.mossType];
    return group;
  }

  private createMossPatch(config: MossConfig, rng: SeededRandom): THREE.InstancedMesh {
    const geom = new THREE.PlaneGeometry(0.05, 0.05);
    const mat = new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.9 });
    const mesh = new THREE.InstancedMesh(geom, mat, config.density);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < config.density; i++) {
      const x = rng.uniform(-config.patchSize, config.patchSize);
      const z = rng.uniform(-config.patchSize, config.patchSize);
      const y = this.noise.perlin(x * 2, z * 2, 0) * config.height;
      dummy.position.set(x, y, z);
      dummy.rotation.set(Math.PI / 2 + rng.uniform(-0.2, 0.2), 0, rng.uniform(0, Math.PI * 2));
      dummy.scale.setScalar(0.5 + rng.uniform(0, 0.5));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
}
