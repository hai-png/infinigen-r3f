/**
 * FlowerGenerator - Enhanced procedural flower generation
 *
 * Features:
 * - Petal arrangement: radial, bilateral, composite
 * - 6+ flower types: rose, daisy, tulip, lily, sunflower, orchid
 * - Stem with leaves
 * - Color variation per species
 * - Instanced field rendering
 *
 * All geometries use Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 */

import * as THREE from 'three';
import { SeededRandom } from '../../../../core/util/math/index';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

// ============================================================================
// Types
// ============================================================================

export type PetalArrangement = 'radial' | 'bilateral' | 'composite';
export type FlowerType = 'rose' | 'daisy' | 'tulip' | 'lily' | 'sunflower' | 'orchid' | 'mixed';

export interface FlowerPetalConfig {
  /** Petal length */
  length: number;
  /** Petal width */
  width: number;
  /** Number of petals */
  count: number;
  /** Petal curvature (0=flat, 1=strongly curved) */
  curvature: number;
  /** Arrangement pattern */
  arrangement: PetalArrangement;
  /** Layer count (e.g., roses have many layers) */
  layers: number;
}

export interface FlowerConfig {
  petalCount: number;
  petalLength: number;
  petalWidth: number;
  stemHeight: number;
  stemThickness: number;
  colorBase: THREE.Color;
  colorCenter: THREE.Color;
  colorStem: THREE.Color;
  leafCount: number;
  variety: FlowerType;
  count: number;
  spreadArea: { width: number; depth: number };
  density: number;
  petal: FlowerPetalConfig;
}

// ============================================================================
// Species Presets
// ============================================================================

export const FlowerSpeciesPresets: Record<FlowerType, Partial<FlowerConfig>> = {
  rose: {
    petal: {
      length: 0.08,
      width: 0.06,
      count: 20,
      curvature: 0.8,
      arrangement: 'radial',
      layers: 4,
    },
    colorBase: new THREE.Color(0xcc2244),
    colorCenter: new THREE.Color(0xffdd44),
    colorStem: new THREE.Color(0x2d5a1e),
    stemHeight: 0.35,
    leafCount: 3,
  },
  daisy: {
    petal: {
      length: 0.12,
      width: 0.03,
      count: 14,
      curvature: 0.1,
      arrangement: 'radial',
      layers: 1,
    },
    colorBase: new THREE.Color(0xffffff),
    colorCenter: new THREE.Color(0xffcc00),
    colorStem: new THREE.Color(0x3d7a2e),
    stemHeight: 0.3,
    leafCount: 2,
  },
  tulip: {
    petal: {
      length: 0.1,
      width: 0.05,
      count: 6,
      curvature: 0.6,
      arrangement: 'radial',
      layers: 1,
    },
    colorBase: new THREE.Color(0xff4488),
    colorCenter: new THREE.Color(0xffee88),
    colorStem: new THREE.Color(0x2d6a1e),
    stemHeight: 0.35,
    leafCount: 2,
  },
  lily: {
    petal: {
      length: 0.14,
      width: 0.04,
      count: 6,
      curvature: 0.3,
      arrangement: 'radial',
      layers: 1,
    },
    colorBase: new THREE.Color(0xffaacc),
    colorCenter: new THREE.Color(0xdd8844),
    colorStem: new THREE.Color(0x3d7a2e),
    stemHeight: 0.4,
    leafCount: 4,
  },
  sunflower: {
    petal: {
      length: 0.15,
      width: 0.035,
      count: 20,
      curvature: 0.05,
      arrangement: 'radial',
      layers: 1,
    },
    colorBase: new THREE.Color(0xffcc00),
    colorCenter: new THREE.Color(0x5a3a1a),
    colorStem: new THREE.Color(0x2d5a1e),
    stemHeight: 0.5,
    leafCount: 4,
  },
  orchid: {
    petal: {
      length: 0.1,
      width: 0.06,
      count: 5,
      curvature: 0.4,
      arrangement: 'bilateral',
      layers: 1,
    },
    colorBase: new THREE.Color(0xcc66ff),
    colorCenter: new THREE.Color(0xffaa44),
    colorStem: new THREE.Color(0x3d6a2e),
    stemHeight: 0.3,
    leafCount: 3,
  },
  mixed: {
    petal: {
      length: 0.1,
      width: 0.05,
      count: 8,
      curvature: 0.3,
      arrangement: 'radial',
      layers: 2,
    },
    colorBase: new THREE.Color(0xff69b4),
    colorCenter: new THREE.Color(0xffff00),
    colorStem: new THREE.Color(0x2d5a1e),
    stemHeight: 0.35,
    leafCount: 2,
  },
};

// ============================================================================
// FlowerGenerator
// ============================================================================

export class FlowerGenerator {
  private materialCache: Map<string, THREE.MeshStandardMaterial>;

  constructor() {
    this.materialCache = new Map();
  }

  /**
   * Generate a single flower mesh: stem + petals + center
   */
  generateFlower(config: Partial<FlowerConfig> = {}, seed: number = 12345): THREE.Group {
    const rng = new SeededRandom(seed);

    // Merge with species preset
    const speciesDefaults = FlowerSpeciesPresets[config.variety ?? 'daisy'] ?? {};
    const finalConfig: FlowerConfig = {
      petalCount: 8,
      petalLength: 0.15,
      petalWidth: 0.08,
      stemHeight: 0.4 + rng.uniform(0, 0.2),
      stemThickness: 0.02,
      colorBase: new THREE.Color(0xffffff),
      colorCenter: new THREE.Color(0xffdd00),
      colorStem: new THREE.Color(0x2d5a1e),
      leafCount: 2,
      variety: 'daisy',
      count: 1,
      spreadArea: { width: 1, depth: 1 },
      density: 1.0,
      petal: {
        length: 0.12,
        width: 0.04,
        count: 8,
        curvature: 0.2,
        arrangement: 'radial',
        layers: 1,
      },
      ...speciesDefaults,
      ...config,
    };

    const group = new THREE.Group();

    // Stem
    const stem = this.createStem(finalConfig, rng);
    group.add(stem);

    // Leaves on stem
    for (let i = 0; i < finalConfig.leafCount; i++) {
      const leaf = this.createLeaf(finalConfig, (i + 1) / (finalConfig.leafCount + 1), rng);
      group.add(leaf);
    }

    // Flower head (petals + center)
    const flowerHead = this.createFlowerHead(finalConfig, rng);
    flowerHead.position.y = finalConfig.stemHeight;
    group.add(flowerHead);

    group.userData.tags = ['vegetation', 'flower', finalConfig.variety];
    return group;
  }

  /**
   * Generate flower field with instanced rendering
   */
  generateFlowerField(config: Partial<FlowerConfig> = {}, seed: number = 12345): THREE.InstancedMesh {
    const rng = new SeededRandom(seed);
    const finalConfig: FlowerConfig = {
      petalCount: 6,
      petalLength: 0.12,
      petalWidth: 0.06,
      stemHeight: 0.35,
      stemThickness: 0.015,
      colorBase: new THREE.Color(0xff69b4),
      colorCenter: new THREE.Color(0xffff00),
      colorStem: new THREE.Color(0x2d5a1e),
      leafCount: 2,
      variety: 'mixed',
      count: 200,
      spreadArea: { width: 10, depth: 10 },
      density: 0.6,
      petal: {
        length: 0.1,
        width: 0.03,
        count: 8,
        curvature: 0.2,
        arrangement: 'radial',
        layers: 1,
      },
      ...config,
    };

    const baseGeometry = this.createSimpleFlowerGeometry(finalConfig);
    const material = this.getFlowerMaterial(finalConfig);

    const instancedMesh = new THREE.InstancedMesh(baseGeometry, material, finalConfig.count);
    const dummy = new THREE.Object3D();
    let instanceIndex = 0;

    for (let i = 0; i < finalConfig.count && instanceIndex < finalConfig.count; i++) {
      if (rng.next() > finalConfig.density) continue;

      const x = (rng.next() - 0.5) * finalConfig.spreadArea.width;
      const z = (rng.next() - 0.5) * finalConfig.spreadArea.depth;
      const scale = 0.8 + rng.uniform(0, 0.4);

      dummy.position.set(x, 0, z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.y = rng.uniform(0, Math.PI * 2);
      dummy.updateMatrix();

      instancedMesh.setMatrixAt(instanceIndex++, dummy.matrix);

      // Color variation
      const color = finalConfig.colorBase.clone();
      color.offsetHSL(rng.uniform(-0.05, 0.05), rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1));
      instancedMesh.setColorAt(instanceIndex - 1, color);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
    return instancedMesh;
  }

  // ------------------------------------------------------------------
  // Stem
  // ------------------------------------------------------------------

  private createStem(config: FlowerConfig, rng: SeededRandom): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(config.stemThickness * 0.7, config.stemThickness, config.stemHeight, 6);
    const material = new THREE.MeshStandardMaterial({ color: config.colorStem, roughness: 0.7, metalness: 0.0 });
    const stem = new THREE.Mesh(geometry, material);
    stem.position.y = config.stemHeight / 2;
    stem.castShadow = true;
    return stem;
  }

  private createLeaf(config: FlowerConfig, heightRatio: number, rng: SeededRandom): THREE.Mesh {
    const leafLength = config.stemThickness * 6;
    const leafWidth = config.stemThickness * 3;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(leafWidth, leafLength * 0.5, 0, leafLength);
    shape.quadraticCurveTo(-leafWidth, leafLength * 0.5, 0, 0);
    const geometry = new THREE.ShapeGeometry(shape, 4);
    const material = new THREE.MeshStandardMaterial({ color: config.colorStem, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide });
    const leaf = new THREE.Mesh(geometry, material);
    leaf.position.y = config.stemHeight * heightRatio;
    leaf.rotation.z = Math.PI / 3 * (rng.boolean() ? 1 : -1);
    leaf.rotation.y = rng.uniform(0, Math.PI * 2);
    return leaf;
  }

  // ------------------------------------------------------------------
  // Flower Head
  // ------------------------------------------------------------------

  private createFlowerHead(config: FlowerConfig, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const petalConfig = config.petal;

    switch (petalConfig.arrangement) {
      case 'radial':
        this.createRadialPetals(group, config, rng);
        break;
      case 'bilateral':
        this.createBilateralPetals(group, config, rng);
        break;
      case 'composite':
        this.createCompositePetals(group, config, rng);
        break;
    }

    // Center disc/sphere
    this.createFlowerCenter(group, config, rng);

    return group;
  }

  private createRadialPetals(group: THREE.Group, config: FlowerConfig, rng: SeededRandom): void {
    const petalConfig = config.petal;
    const petalMaterial = new THREE.MeshStandardMaterial({
      color: config.colorBase.clone(),
      roughness: 0.4,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    for (let layer = 0; layer < petalConfig.layers; layer++) {
      const layerScale = 1 - layer * 0.2;
      const layerTilt = Math.PI / 4 + layer * 0.15;

      for (let i = 0; i < petalConfig.count; i++) {
        const angle = (i / petalConfig.count) * Math.PI * 2;
        const petalShape = this.createPetalShape(
          petalConfig.length * layerScale,
          petalConfig.width * layerScale,
          config.variety,
          rng
        );

        const petal = new THREE.Mesh(petalShape, petalMaterial);
        petal.rotation.y = angle;
        petal.rotation.x = layerTilt;
        petal.position.y = layer * 0.005;

        group.add(petal);
      }
    }
  }

  private createBilateralPetals(group: THREE.Group, config: FlowerConfig, rng: SeededRandom): void {
    const petalConfig = config.petal;
    const petalMaterial = new THREE.MeshStandardMaterial({
      color: config.colorBase.clone(),
      roughness: 0.4,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    // Orchid-like: 3 petals up, 2 sepals down, 1 lip
    const upperCount = 3;
    const lowerCount = 2;

    for (let i = 0; i < upperCount; i++) {
      const angle = (i / upperCount) * Math.PI - Math.PI / 2;
      const petalShape = this.createPetalShape(
        petalConfig.length, petalConfig.width * 0.8, config.variety, rng
      );
      const petal = new THREE.Mesh(petalShape, petalMaterial);
      petal.rotation.y = angle;
      petal.rotation.x = Math.PI / 3;
      group.add(petal);
    }

    for (let i = 0; i < lowerCount; i++) {
      const angle = (i / lowerCount) * Math.PI + Math.PI / 4;
      const petalShape = this.createPetalShape(
        petalConfig.length * 0.8, petalConfig.width, config.variety, rng
      );
      const petal = new THREE.Mesh(petalShape, petalMaterial);
      petal.rotation.y = angle;
      petal.rotation.x = Math.PI / 4;
      group.add(petal);
    }

    // Lip petal (orchid)
    const lipMaterial = new THREE.MeshStandardMaterial({
      color: config.colorCenter.clone(),
      roughness: 0.4,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const lipShape = this.createPetalShape(
      petalConfig.length * 1.2, petalConfig.width * 1.5, 'orchid', rng
    );
    const lip = new THREE.Mesh(lipShape, lipMaterial);
    lip.rotation.y = Math.PI;
    lip.rotation.x = Math.PI / 6;
    group.add(lip);
  }

  private createCompositePetals(group: THREE.Group, config: FlowerConfig, rng: SeededRandom): void {
    // Sunflower-like: outer ray florets + inner disc florets
    this.createRadialPetals(group, config, rng);

    // Inner disc florets (small dots)
    const discMaterial = new THREE.MeshStandardMaterial({
      color: config.colorCenter,
      roughness: 0.7,
      metalness: 0.0,
    });

    const discRadius = config.petal.width * 1.5;
    const floretCount = 20;
    for (let i = 0; i < floretCount; i++) {
      const angle = rng.uniform(0, Math.PI * 2);
      const r = rng.uniform(0, discRadius);
      const floretGeo = new THREE.SphereGeometry(0.005, 4, 3);
      const floret = new THREE.Mesh(floretGeo, discMaterial);
      floret.position.set(Math.cos(angle) * r, 0.01, Math.sin(angle) * r);
      group.add(floret);
    }
  }

  private createPetalShape(
    length: number,
    width: number,
    variety: string,
    rng: SeededRandom
  ): THREE.BufferGeometry {
    const shape = new THREE.Shape();

    switch (variety) {
      case 'rose': {
        // Rounded, cupped petal
        shape.moveTo(0, 0);
        shape.bezierCurveTo(width * 0.8, length * 0.2, width * 0.6, length * 0.6, 0, length);
        shape.bezierCurveTo(-width * 0.6, length * 0.6, -width * 0.8, length * 0.2, 0, 0);
        break;
      }
      case 'tulip': {
        // Elongated cupped petal
        shape.moveTo(0, 0);
        shape.quadraticCurveTo(width * 0.5, length * 0.3, width * 0.3, length * 0.7);
        shape.quadraticCurveTo(width * 0.1, length, 0, length * 1.05);
        shape.quadraticCurveTo(-width * 0.1, length, -width * 0.3, length * 0.7);
        shape.quadraticCurveTo(-width * 0.5, length * 0.3, 0, 0);
        break;
      }
      case 'lily': {
        // Long, pointed petal
        shape.moveTo(0, 0);
        shape.quadraticCurveTo(width * 0.6, length * 0.4, width * 0.2, length * 0.8);
        shape.lineTo(0, length);
        shape.lineTo(-width * 0.2, length * 0.8);
        shape.quadraticCurveTo(-width * 0.6, length * 0.4, 0, 0);
        break;
      }
      case 'orchid': {
        // Broad, rounded petal
        shape.moveTo(0, 0);
        shape.bezierCurveTo(width, length * 0.2, width * 0.8, length * 0.7, 0, length);
        shape.bezierCurveTo(-width * 0.8, length * 0.7, -width, length * 0.2, 0, 0);
        break;
      }
      default: {
        // Default: simple elliptical petal (daisy/sunflower)
        shape.moveTo(0, 0);
        shape.quadraticCurveTo(width, length * 0.5, 0, length);
        shape.quadraticCurveTo(-width, length * 0.5, 0, 0);
        break;
      }
    }

    const geometry = new THREE.ShapeGeometry(shape, 4);

    // Add slight curvature
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      const t = y / length;
      positions.setZ(i, Math.sin(t * Math.PI) * 0.01 * rng.uniform(0.5, 1.5));
    }
    geometry.computeVertexNormals();

    return geometry;
  }

  private createFlowerCenter(group: THREE.Group, config: FlowerConfig, rng: SeededRandom): void {
    const centerSize = config.petal.width * (config.variety === 'sunflower' ? 2.5 : 1.5);

    if (config.variety === 'sunflower') {
      // Flat disc for sunflower
      const discGeo = new THREE.CylinderGeometry(centerSize, centerSize, 0.01, 12);
      const discMat = new THREE.MeshStandardMaterial({ color: config.colorCenter, roughness: 0.8 });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.position.y = 0.005;
      group.add(disc);
    } else {
      // Sphere center
      const centerGeo = new THREE.SphereGeometry(centerSize, 8, 8);
      const centerMat = new THREE.MeshStandardMaterial({ color: config.colorCenter, roughness: 0.8 });
      const center = new THREE.Mesh(centerGeo, centerMat);
      group.add(center);
    }
  }

  // ------------------------------------------------------------------
  // Simple geometry for instanced field
  // ------------------------------------------------------------------

  private createSimpleFlowerGeometry(config: FlowerConfig): THREE.BufferGeometry {
    const stemGeo = new THREE.CylinderGeometry(config.stemThickness * 0.7, config.stemThickness, config.stemHeight, 6);
    const headGeo = new THREE.SphereGeometry(config.petalLength, 8, 8);
    headGeo.translate(0, config.stemHeight, 0);

    // Merge stem and head using canonical GeometryPipeline
    return GeometryPipeline.mergeGeometries([stemGeo, headGeo]);
  }

  private getFlowerMaterial(config: FlowerConfig): THREE.MeshStandardMaterial {
    const cacheKey = `flower-${config.colorBase.getHex()}-${config.variety}`;
    if (this.materialCache.has(cacheKey)) return this.materialCache.get(cacheKey)!;
    const material = new THREE.MeshStandardMaterial({ color: config.colorBase.clone(), roughness: 0.5, metalness: 0.0 });
    this.materialCache.set(cacheKey, material);
    return material;
  }

  dispose(): void {
    this.materialCache.forEach((material) => material.dispose());
    this.materialCache.clear();
  }
}
