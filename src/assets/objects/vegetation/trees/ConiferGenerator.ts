/**
 * ConiferGenerator - Pine, fir, spruce trees: straight trunk + cone-shaped branch layers
 * All geometries in Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 */
import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../core/util/math/index';

export type ConiferType = 'pine' | 'fir' | 'spruce' | 'cedar' | 'redwood';
export interface ConiferConfig extends BaseGeneratorConfig {
  height: number;
  baseRadius: number;
  tierCount: number;
  coniferType: ConiferType;
  leafColor: number;
}

export class ConiferGenerator extends BaseObjectGenerator<ConiferConfig> {
  getDefaultConfig(): ConiferConfig {
    return { height: 6.0, baseRadius: 1.5, tierCount: 8, coniferType: 'pine', leafColor: 0x1a472a };
  }

  generate(config: Partial<ConiferConfig> = {}): THREE.Group {
    const fullConfig = { ...this.getDefaultConfig(), ...config };
    const rng = new SeededRandom(this.seed);
    const group = new THREE.Group();

    // Straight trunk
    const trunk = this.createTrunk(fullConfig);
    group.add(trunk);

    // Cone-shaped branch layers — each tier is a cone that gets smaller toward the top
    for (let i = 0; i < fullConfig.tierCount; i++) {
      const tier = this.createTier(fullConfig, i, rng);
      group.add(tier);
    }

    group.userData.tags = ['vegetation', 'tree', 'conifer', fullConfig.coniferType];
    return group;
  }

  private createTrunk(config: ConiferConfig): THREE.Mesh {
    const geom = new THREE.CylinderGeometry(0.15, config.baseRadius * 0.25, config.height, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9, metalness: 0.0 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.y = config.height * 0.5;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Create a cone-shaped tier of branches.
   * Lower tiers are wider, upper tiers are narrower, creating a classic conifer silhouette.
   */
  private createTier(config: ConiferConfig, index: number, rng: SeededRandom): THREE.Mesh {
    const t = index / config.tierCount;
    const y = config.height * (0.15 + t * 0.85);
    // Radius shrinks linearly toward the top
    const radius = Math.max(0.15, config.baseRadius * (1.0 - t * 0.85) + rng.uniform(-0.08, 0.08));
    const tierHeight = (config.height / config.tierCount) * 1.6;
    const geom = new THREE.ConeGeometry(radius, tierHeight, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: config.leafColor,
      roughness: 0.7,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.y = y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}
