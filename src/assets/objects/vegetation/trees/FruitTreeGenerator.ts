/**
 * FruitTreeGenerator - Fruit-bearing trees: trunk + recursive branching + canopy + fruit spheres
 * All geometries in Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 */
import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../core/util/math/index';

export type FruitType = 'apple' | 'orange' | 'cherry' | 'peach' | 'pear';
export interface FruitTreeConfig extends BaseGeneratorConfig {
  height: number;
  crownRadius: number;
  fruitCount: number;
  fruitType: FruitType;
  leafColor: number;
  maxRecursion: number;
}

const FRUIT_COLORS: Record<FruitType, number> = {
  apple: 0xff0000,
  orange: 0xffa500,
  cherry: 0x8b0000,
  peach: 0xffcba4,
  pear: 0xd4e157,
};

export class FruitTreeGenerator extends BaseObjectGenerator<FruitTreeConfig> {
  getDefaultConfig(): FruitTreeConfig {
    return { height: 4.0, crownRadius: 2.0, fruitCount: 30, fruitType: 'apple', leafColor: 0x2d5a1f, maxRecursion: 2 };
  }

  generate(config: Partial<FruitTreeConfig> = {}): THREE.Group {
    const fullConfig = { ...this.getDefaultConfig(), ...config };
    const rng = new SeededRandom(this.seed);
    const group = new THREE.Group();

    // Trunk
    const trunk = this.createTrunk(fullConfig);
    group.add(trunk);

    // Recursive branches (like deciduous)
    const branches = this.createBranchesRecursive(fullConfig, rng, fullConfig.height * 0.4, 0);
    group.add(branches);

    // Leafy crown
    const crown = this.createCrown(fullConfig, rng);
    crown.position.y = fullConfig.height * 0.65;
    group.add(crown);

    // Fruits
    const fruits = this.createFruits(fullConfig, rng);
    fruits.position.y = fullConfig.height * 0.65;
    group.add(fruits);

    group.userData.tags = ['vegetation', 'tree', 'fruit', fullConfig.fruitType];
    return group;
  }

  private createTrunk(config: FruitTreeConfig): THREE.Mesh {
    const geom = new THREE.CylinderGeometry(0.12, 0.22, config.height * 0.6, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9, metalness: 0.0 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.y = config.height * 0.3;
    mesh.castShadow = true;
    return mesh;
  }

  /**
   * Recursive branch generation
   */
  private createBranchesRecursive(
    config: FruitTreeConfig,
    rng: SeededRandom,
    baseY: number,
    depth: number
  ): THREE.Group {
    const group = new THREE.Group();
    const count = depth === 0 ? rng.nextInt(4, 7) : Math.max(2, rng.nextInt(1, 3));

    for (let i = 0; i < count; i++) {
      const angle = rng.uniform(0, Math.PI * 2);
      const lengthScale = 1.0 / (depth + 1);
      const length = rng.uniform(0.6, 1.8) * lengthScale;
      const radius = rng.uniform(0.03, 0.1) * lengthScale;
      const geom = new THREE.CylinderGeometry(radius * 0.5, radius, length, 6);
      const mat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9, metalness: 0.0 });
      const branch = new THREE.Mesh(geom, mat);
      const elev = baseY + rng.uniform(-config.height * 0.08, config.height * 0.08);
      branch.position.set(0, elev, 0);
      branch.rotation.y = angle;
      branch.rotation.z = rng.uniform(0.3, 0.7) * (rng.boolean() ? 1 : -1);
      branch.castShadow = true;
      group.add(branch);

      if (depth < config.maxRecursion) {
        const sub = this.createBranchesRecursive(config, rng, elev + length * 0.4, depth + 1);
        group.add(sub);
      }
    }
    return group;
  }

  private createCrown(config: FruitTreeConfig, rng: SeededRandom): THREE.InstancedMesh {
    const geom = new THREE.SphereGeometry(0.3, 6, 6);
    const mat = new THREE.MeshStandardMaterial({ color: config.leafColor, roughness: 0.6, metalness: 0.0 });
    const mesh = new THREE.InstancedMesh(geom, mat, 180);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 180; i++) {
      const theta = rng.uniform(0, Math.PI * 2);
      const phi = Math.acos(2 * rng.next() - 1);
      const r = rng.uniform(0.3, 1.0) * config.crownRadius;
      dummy.position.set(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
      dummy.scale.setScalar(rng.uniform(0.5, 1.2));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    return mesh;
  }

  private createFruits(config: FruitTreeConfig, rng: SeededRandom): THREE.InstancedMesh {
    const geom = new THREE.SphereGeometry(0.08, 8, 8);
    const color = FRUIT_COLORS[config.fruitType] || 0xff0000;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1 });
    const mesh = new THREE.InstancedMesh(geom, mat, config.fruitCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < config.fruitCount; i++) {
      const theta = rng.uniform(0, Math.PI * 2);
      const phi = Math.acos(2 * rng.next() - 1);
      const r = rng.uniform(0.3, 0.9) * config.crownRadius;
      dummy.position.set(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
}
