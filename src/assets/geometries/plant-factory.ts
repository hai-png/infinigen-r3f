/**
 * Plant Factory - Procedural plant geometry generation
 * 
 * Creates various plant geometries including ferns, flowers,
 * grass, shrubs, and trees.
 */

import * as THREE from 'three';

export interface PlantConfig {
  type: 'fern' | 'flower' | 'grass' | 'shrub' | 'tree' | 'bush';
  height: number;
  spread: number;
  detail: number;
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  seed: number;
}

export class SimplePlantFactory {
  private config: PlantConfig;

  constructor(config: Partial<PlantConfig> = {}) {
    this.config = {
      type: 'shrub',
      height: 0.5,
      spread: 0.3,
      detail: 1,
      season: 'summer',
      seed: 42,
      ...config,
    };
  }

  generate(config: Partial<PlantConfig> = {}): THREE.Group {
    const fullConfig = { ...this.config, ...config };
    const group = new THREE.Group();

    switch (fullConfig.type) {
      case 'fern':
        group.add(this.createFern(fullConfig));
        break;
      case 'flower':
        group.add(this.createFlower(fullConfig));
        break;
      case 'grass':
        group.add(this.createGrass(fullConfig));
        break;
      case 'shrub':
      default:
        group.add(this.createShrub(fullConfig));
        break;
    }

    return group;
  }

  private createFern(config: PlantConfig): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.ConeGeometry(config.spread, config.height, 8),
      new THREE.MeshStandardMaterial({ color: 0x2d5a1e })
    );
  }

  private createFlower(config: PlantConfig): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.SphereGeometry(config.spread, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xff69b4 })
    );
  }

  private createGrass(config: PlantConfig): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.ConeGeometry(config.spread * 0.1, config.height, 4),
      new THREE.MeshStandardMaterial({ color: 0x4a7c2e })
    );
  }

  private createShrub(config: PlantConfig): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.SphereGeometry(config.spread, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x2d5a1e })
    );
  }
}
