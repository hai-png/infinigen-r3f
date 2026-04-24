/**
 * FruitTreeGenerator - Fruit-bearing trees
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../core/util/math/distributions';

export type FruitType = 'apple' | 'orange' | 'cherry' | 'peach' | 'pear';
export interface FruitTreeConfig {
  height: number;
  crownRadius: number;
  fruitCount: number;
  fruitType: FruitType;
}

export class FruitTreeGenerator extends BaseObjectGenerator<FruitTreeConfig> {
  getDefaultConfig(): FruitTreeConfig {
    return { height: 4.0, crownRadius: 2.0, fruitCount: 30, fruitType: 'apple' };
  }

  generate(config: Partial<FruitTreeConfig> = {}): THREE.Group {
    const fullConfig = { ...this.getDefaultConfig(), ...config };
    const rng = new SeededRandom(this.seed);
    const group = new THREE.Group();
    const trunk = this.createTrunk(fullConfig);
    group.add(trunk);
    const crown = this.createCrown(fullConfig, rng);
    crown.position.y = fullConfig.height * 0.6;
    group.add(crown);
    const fruits = this.createFruits(fullConfig, rng);
    fruits.position.y = fullConfig.height * 0.6;
    group.add(fruits);
    group.userData.tags = ['vegetation', 'tree', 'fruit', fullConfig.fruitType];
    return group;
  }

  private createTrunk(config: FruitTreeConfig): THREE.Mesh {
    const geom = new THREE.CylinderGeometry(0.15, 0.25, config.height * 0.6, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.y = config.height * 0.3;
    return mesh;
  }

  private createCrown(config: FruitTreeConfig, rng: SeededRandom): THREE.InstancedMesh {
    const geom = new THREE.SphereGeometry(0.25, 6, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2d5a1f });
    const mesh = new THREE.InstancedMesh(geom, mat, 150);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 150; i++) {
      const theta = rng.uniform(0, Math.PI * 2);
      const phi = Math.acos(2 * rng.uniform(0, 1) - 1);
      const r = rng.uniform(0.5, 1.0) * config.crownRadius;
      dummy.position.set(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
      dummy.scale.setScalar(rng.uniform(0.5, 1.0));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  private createFruits(config: FruitTreeConfig, rng: SeededRandom): THREE.InstancedMesh {
    const geom = new THREE.SphereGeometry(0.08, 8, 8);
    let color = 0xff0000;
    if (config.fruitType === 'orange') color = 0xffa500;
    else if (config.fruitType === 'cherry') color = 0x8b0000;
    else if (config.fruitType === 'peach') color = 0xffcba4;
    else if (config.fruitType === 'pear') color = 0xd4e157;
    const mat = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.InstancedMesh(geom, mat, config.fruitCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < config.fruitCount; i++) {
      const theta = rng.uniform(0, Math.PI * 2);
      const phi = Math.acos(2 * rng.uniform(0, 1) - 1);
      const r = rng.uniform(0.3, 0.9) * config.crownRadius;
      dummy.position.set(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
}
