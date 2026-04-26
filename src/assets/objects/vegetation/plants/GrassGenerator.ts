import * as THREE from 'three';
import { NoiseUtils } from '../../../utils/NoiseUtils';

/**
 * GrassGenerator - Procedural grass field generation with instanced rendering
 * 
 * Features:
 * - Multiple grass varieties (fine, coarse, mixed)
 * - Wind animation support
 * - Color variation for natural appearance
 * - Optimized for large-scale terrain coverage
 * 
 * @module vegetation/plants
 */
export interface GrassConfig {
  bladeHeight: number;
  bladeWidth: number;
  density: number;
  colorBase: THREE.Color;
  colorVariation: THREE.Color;
  windAmplitude: number;
  windFrequency: number;
  count: number;
  spreadArea: { width: number; depth: number };
  variety: 'fine' | 'coarse' | 'mixed';
}

/**
 * Generates grass blades optimized for instanced rendering
 */
export class GrassGenerator {
  private noiseUtils: NoiseUtils;
  private materialCache: Map<string, THREE.MeshStandardMaterial>;

  constructor() {
    this.noiseUtils = new NoiseUtils();
    this.materialCache = new Map();
  }

  /**
   * Generate instanced grass field
   */
  generateGrassField(config: Partial<GrassConfig> = {}): THREE.InstancedMesh {
    const finalConfig: GrassConfig = {
      bladeHeight: 0.3 + Math.random() * 0.2,
      bladeWidth: 0.02 + Math.random() * 0.01,
      density: 0.7,
      colorBase: new THREE.Color(0x4a7c23),
      colorVariation: new THREE.Color(0x3d6b1f),
      windAmplitude: 0.05,
      windFrequency: 0.5,
      count: 1000,
      spreadArea: { width: 10, depth: 10 },
      variety: 'mixed',
      ...config,
    };

    const baseGeometry = this.createGrassBladeGeometry(finalConfig);
    const material = this.getGrassMaterial(finalConfig);

    const instancedMesh = new THREE.InstancedMesh(baseGeometry, material, finalConfig.count);
    const dummy = new THREE.Object3D();
    let instanceIndex = 0;

    for (let i = 0; i < finalConfig.count && instanceIndex < finalConfig.count; i++) {
      const x = (Math.random() - 0.5) * finalConfig.spreadArea.width;
      const z = (Math.random() - 0.5) * finalConfig.spreadArea.depth;

      if (Math.random() > finalConfig.density) continue;

      const heightVariation = 0.7 + Math.random() * 0.6;
      const scale = finalConfig.bladeWidth * heightVariation;

      dummy.position.set(x, 0, z);
      dummy.scale.set(scale, heightVariation, scale);
      dummy.rotation.y = Math.random() * Math.PI * 2;
      
      // Slight lean for natural look
      dummy.rotation.x = (Math.random() - 0.5) * 0.2;
      dummy.rotation.z = (Math.random() - 0.5) * 0.2;
      
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(instanceIndex++, dummy.matrix);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return instancedMesh;
  }

  /**
   * Create grass blade geometry
   */
  private createGrassBladeGeometry(config: GrassConfig): THREE.BufferGeometry {
    const geometry = new THREE.PlaneGeometry(config.bladeWidth, config.bladeHeight, 1, 3);
    const positions = geometry.attributes.position.array as Float32Array;

    // Taper the blade (narrower at top)
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const t = (y + config.bladeHeight / 2) / config.bladeHeight; // 0 at bottom, 1 at top
      
      // Taper factor - narrower at tip
      const taper = 0.3 + 0.7 * (1 - t);
      positions[i] *= taper;

      // Add slight curve
      if (y > 0) {
        positions[i + 2] = Math.sin(t * Math.PI) * config.bladeWidth * 0.3;
      }
    }

    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Get grass material with optional gradient
   */
  private getGrassMaterial(config: GrassConfig): THREE.MeshStandardMaterial {
    const cacheKey = `grass-${config.colorBase.getHex()}-${config.variety}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey)!;
    }

    const material = new THREE.MeshStandardMaterial({
      color: config.colorBase.clone(),
      roughness: 0.8,
      metalness: 0.0,
      side: THREE.DoubleSide,
      flatShading: false,
    });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Generate grass clumps for more natural distribution
   */
  generateGrassClumps(config: Partial<GrassConfig> & { 
    clumpCount: number;
    clumpSize: number;
  }): THREE.Group {
    const group = new THREE.Group();
    const clumpConfig = {
      bladeHeight: 0.35,
      bladeWidth: 0.025,
      density: 0.9,
      colorBase: new THREE.Color(0x508025),
      colorVariation: new THREE.Color(0x407020),
      windAmplitude: 0.06,
      windFrequency: 0.6,
      count: 50,
      spreadArea: { width: 1, depth: 1 },
      variety: 'mixed' as const,
      clumpCount: 20,
      clumpSize: 0.5,
      ...config,
    };

    for (let i = 0; i < clumpConfig.clumpCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * clumpConfig.clumpSize;
      
      const clump = this.generateGrassField({
        count: clumpConfig.count,
        spreadArea: { 
          width: clumpConfig.clumpSize, 
          depth: clumpConfig.clumpSize 
        },
        bladeHeight: clumpConfig.bladeHeight * (0.8 + Math.random() * 0.4),
        density: clumpConfig.density,
        colorBase: clumpConfig.colorBase.clone(),
      });

      clump.position.set(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      );

      group.add(clump);
    }

    return group;
  }

  /**
   * Generate tall grass varieties
   */
  generateTallGrass(config: Partial<GrassConfig> = {}): THREE.InstancedMesh {
    return this.generateGrassField({
      bladeHeight: 0.6 + Math.random() * 0.4,
      bladeWidth: 0.03 + Math.random() * 0.015,
      density: 0.5,
      colorBase: new THREE.Color(0x6b8e3a),
      variety: 'coarse',
      ...config,
    });
  }

  /**
   * Clear material cache
   */
  dispose(): void {
    this.materialCache.forEach((material) => material.dispose());
    this.materialCache.clear();
  }
}
