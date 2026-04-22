/**
 * RockGenerator - Rock formations
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../math/distributions';
import { Noise3D } from '../../../../math/noise';

export type RockType = 'boulder' | 'gravel' | 'cliff' | 'stones';
export interface RockConfig {
  size: number;
  count: number;
  rockType: RockType;
  roughness: number;
}

export class RockGenerator extends BaseObjectGenerator<RockConfig> {
  private noise = new Noise3D();
  getDefaultConfig(): RockConfig {
    return { size: 0.5, count: 50, rockType: 'boulder', roughness: 0.8 };
  }

  generate(config: Partial<RockConfig> = {}): THREE.Group {
    const fullConfig = { ...this.getDefaultConfig(), ...config };
    const rng = new SeededRandom(this.seed);
    const group = new THREE.Group();
    
    if (fullConfig.rockType === 'boulder') {
      for (let i = 0; i < fullConfig.count; i++) {
        const boulder = this.createBoulder(fullConfig, rng);
        boulder.position.set(rng.uniform(-2, 2), 0, rng.uniform(-2, 2));
        group.add(boulder);
      }
    } else if (fullConfig.rockType === 'gravel') {
      group.add(this.createGravel(fullConfig, rng));
    }
    
    group.userData.tags = ['ground', 'rock', fullConfig.rockType];
    return group;
  }

  private createBoulder(config: RockConfig, rng: SeededRandom): THREE.Mesh {
    const geom = new THREE.DodecahedronGeometry(config.size, 1);
    const positions = geom.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += this.noise.perlin(positions[i] * 2, positions[i+1] * 2, positions[i+2] * 2) * config.roughness * 0.2;
      positions[i+1] += this.noise.perlin(positions[i+1] * 2, positions[i+2] * 2, positions[i] * 2) * config.roughness * 0.2;
      positions[i+2] += this.noise.perlin(positions[i+2] * 2, positions[i] * 2, positions[i+1] * 2) * config.roughness * 0.2;
    }
    geom.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x696969, roughness: 0.9 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.set(rng.uniform(0, Math.PI), rng.uniform(0, Math.PI), rng.uniform(0, Math.PI));
    return mesh;
  }

  private createGravel(config: RockConfig, rng: SeededRandom): THREE.InstancedMesh {
    const geom = new THREE.DodecahedronGeometry(0.05, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x808080 });
    const mesh = new THREE.InstancedMesh(geom, mat, config.count * 10);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < config.count * 10; i++) {
      dummy.position.set(rng.uniform(-2, 2), 0.02, rng.uniform(-2, 2));
      dummy.scale.setScalar(rng.uniform(0.5, 1.0));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
}
