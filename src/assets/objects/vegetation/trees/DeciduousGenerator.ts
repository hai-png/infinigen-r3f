/**
 * DeciduousGenerator - Broadleaf trees with trunk + recursive branching + leafy canopy
 * All geometries in Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 */
import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../core/util/math/index';

export type DeciduousType = 'oak' | 'maple' | 'birch' | 'willow' | 'ash';
export interface DeciduousConfig extends BaseGeneratorConfig {
  height: number;
  crownRadius: number;
  trunkThickness: number;
  treeType: DeciduousType;
  leafColor: number;
  branchCount: number;
  maxRecursion: number;
}

export class DeciduousGenerator extends BaseObjectGenerator<DeciduousConfig> {
  getDefaultConfig(): DeciduousConfig {
    return { height: 8.0, crownRadius: 3.0, trunkThickness: 0.4, treeType: 'oak', leafColor: 0x2d5a1f, branchCount: 6, maxRecursion: 2 };
  }

  generate(config: Partial<DeciduousConfig> = {}): THREE.Group {
    const fullConfig = { ...this.getDefaultConfig(), ...config };
    const rng = new SeededRandom(this.seed);
    const group = new THREE.Group();

    // Trunk
    const trunk = this.createTrunk(fullConfig);
    group.add(trunk);

    // Recursive branches
    const branches = this.createBranchesRecursive(fullConfig, rng, fullConfig.height * 0.6, 0, fullConfig.maxRecursion);
    group.add(branches);

    // Leafy canopy — sphere cluster
    const crown = this.createCrown(fullConfig, rng);
    crown.position.y = fullConfig.height * 0.75;
    group.add(crown);

    group.userData.tags = ['vegetation', 'tree', 'deciduous', fullConfig.treeType];
    return group;
  }

  private createTrunk(config: DeciduousConfig): THREE.Mesh {
    const geom = new THREE.CylinderGeometry(config.trunkThickness * 0.7, config.trunkThickness, config.height * 0.7, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9, metalness: 0.0 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.y = config.height * 0.35;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Recursive branch generation — each branch can spawn sub-branches
   */
  private createBranchesRecursive(
    config: DeciduousConfig,
    rng: SeededRandom,
    baseY: number,
    depth: number,
    maxDepth: number
  ): THREE.Group {
    const group = new THREE.Group();
    const count = depth === 0 ? config.branchCount : Math.max(2, config.branchCount - depth * 2);

    for (let i = 0; i < count; i++) {
      const angle = rng.uniform(0, Math.PI * 2);
      const lengthScale = 1.0 / (depth + 1);
      const length = rng.uniform(1.0, 2.5) * lengthScale;
      const radius = rng.uniform(0.05, 0.15) * lengthScale;
      const droop = rng.uniform(-0.4, -0.1);

      const branchGeom = new THREE.CylinderGeometry(radius * 0.5, radius, length, 6);
      const branchMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9, metalness: 0.0 });
      const branch = new THREE.Mesh(branchGeom, branchMat);

      const elevation = baseY + rng.uniform(-config.height * 0.1, config.height * 0.1);
      branch.position.set(0, elevation, 0);
      branch.rotation.y = angle;
      branch.rotation.z = rng.uniform(0.3, 0.8) * (rng.boolean() ? 1 : -1);
      branch.rotation.x = droop;
      branch.castShadow = true;
      group.add(branch);

      // Recurse — spawn sub-branches from the tip of this branch
      if (depth < maxDepth) {
        const subBranches = this.createBranchesRecursive(
          config, rng,
          elevation + length * 0.5,
          depth + 1,
          maxDepth
        );
        group.add(subBranches);
      }
    }

    return group;
  }

  /**
   * Leafy canopy as a cluster of spheres (InstancedMesh)
   */
  private createCrown(config: DeciduousConfig, rng: SeededRandom): THREE.InstancedMesh {
    const geom = new THREE.SphereGeometry(0.35, 6, 6);
    const mat = new THREE.MeshStandardMaterial({ color: config.leafColor, roughness: 0.6, metalness: 0.0 });
    const count = 250;
    const mesh = new THREE.InstancedMesh(geom, mat, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const theta = rng.uniform(0, Math.PI * 2);
      const phi = Math.acos(2 * rng.next() - 1);
      const r = rng.uniform(0.3, 1.0) * config.crownRadius;
      dummy.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
      dummy.scale.setScalar(rng.uniform(0.5, 1.2));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}
