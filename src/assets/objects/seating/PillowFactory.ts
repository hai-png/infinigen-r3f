/**
 * PillowFactory - Procedural pillow generator
 *
 * Ported from Infinigen's PillowFactory (Princeton VL)
 * Generates varied pillow shapes with configurable seams and materials
 */

import * as THREE from 'three';
import { AssetFactory } from '../../utils/AssetFactory';
import { SeededRandom, weightedSample } from '../../../core/util/math/index';

export interface PillowConfig {
  // Shape parameters
  shape: 'square' | 'rectangle' | 'circle' | 'torus';
  width: number;
  size: number;
  thickness: number;
  bevelWidth: number;
  extrudeThickness: number;
  
  // Seam parameters
  hasSeam: boolean;
  seamRadius: number;
}

export interface PillowResult {
  mesh: THREE.Mesh;
  config: PillowConfig;
  material: THREE.Material;
}

/**
 * Procedural pillow generator with multiple shape options
 */
export class PillowFactory extends AssetFactory<PillowConfig, PillowResult> {
  protected readonly shapes = ['square', 'rectangle', 'circle', 'torus'] as const;
  protected readonly shapeWeights = [4, 4, 1, 1];

  constructor(seed?: number) {
    super(seed);
  }

  getDefaultConfig(): PillowConfig {
    return this.generateConfig();
  }

  generate(config?: Partial<PillowConfig>): PillowResult {
    const mergedConfig = { ...this.getDefaultConfig(), ...config };
    return this.create(mergedConfig);
  }

  /**
   * Generate random pillow configuration
   */
  generateConfig(): PillowConfig {
    const rng = new SeededRandom(this.seed);
    
    const shape = weightedSample(this.shapes, rng, this.shapeWeights);
    const width = rng.uniform(0.4, 0.7);
    const size = shape === 'square' 
      ? width 
      : width * rng.logUniform(0.6, 0.8);
    
    return {
      shape,
      width,
      size,
      thickness: rng.logUniform(0.006, 0.008),
      bevelWidth: rng.uniform(0.02, 0.05),
      extrudeThickness: rng.uniform() < 0.5 
        ? rng.logUniform(0.006, 0.008) * rng.logUniform(1, 8) 
        : 0,
      hasSeam: rng.uniform() < 0.3 && shape !== 'torus',
      seamRadius: rng.uniform(0.01, 0.02),
    };
  }

  /**
   * Create pillow from configuration
   */
  create(config: PillowConfig): PillowResult {
    let geometry: THREE.BufferGeometry;

    switch (config.shape) {
      case 'circle':
        geometry = this.createCircleGeometry(config);
        break;
      case 'torus':
        geometry = this.createTorusGeometry(config);
        break;
      case 'rectangle':
        geometry = this.createRectangleGeometry(config);
        break;
      default: // square
        geometry = this.createSquareGeometry(config);
    }

    const material = this.createFabricMaterial();
    const mesh = new THREE.Mesh(geometry, material);

    return {
      mesh,
      config,
      material,
    };
  }

  /**
   * Create square pillow geometry
   */
  protected createSquareGeometry(config: PillowConfig): THREE.BufferGeometry {
    const geometry = new THREE.BoxGeometry(
      config.width + config.bevelWidth * 2,
      config.thickness + config.extrudeThickness,
      config.size + config.bevelWidth * 2,
      8, 1, 8
    );

    // Add bevel effect by modifying vertices
    this.applyBevel(geometry, config.bevelWidth);

    // Add seam if requested
    if (config.hasSeam) {
      this.addSeam(geometry, config);
    }

    return geometry;
  }

  /**
   * Create rectangle pillow geometry
   */
  protected createRectangleGeometry(config: PillowConfig): THREE.BufferGeometry {
    return this.createSquareGeometry(config);
  }

  /**
   * Create circle pillow geometry
   */
  protected createCircleGeometry(config: PillowConfig): THREE.BufferGeometry {
    const radius = config.width / 2;
    const segments = 64;

    // Create circular shape using cylinder with very low height
    const geometry = new THREE.CylinderGeometry(
      radius,
      radius,
      config.thickness + config.extrudeThickness,
      segments,
      1,
      false
    );

    // Rotate to lie flat
    geometry.rotateX(Math.PI / 2);

    if (config.hasSeam) {
      this.addSeam(geometry, config);
    }

    return geometry;
  }

  /**
   * Create torus (donut) pillow geometry
   */
  protected createTorusGeometry(config: PillowConfig): THREE.BufferGeometry {
    const outerRadius = config.width / 2;
    const innerRadius = outerRadius * this.rng.uniform(0.2, 0.4);
    const tubeRadius = (outerRadius - innerRadius) / 2;

    const geometry = new THREE.TorusGeometry(
      (outerRadius + innerRadius) / 2,
      tubeRadius,
      32,
      64
    );

    return geometry;
  }

  /**
   * Apply bevel effect to geometry edges
   */
  protected applyBevel(geometry: THREE.BufferGeometry, bevelWidth: number): void {
    const positionAttribute = geometry.attributes.position;
    const positions = positionAttribute.array as Float32Array;

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];

      // Soften corners based on distance from center
      const dist = Math.sqrt(x * x + z * z);
      const maxDist = Math.max(Math.abs(x), Math.abs(z));
      
      if (maxDist > bevelWidth * 0.5) {
        const factor = 1 - (bevelWidth / maxDist) * 0.3;
        positions[i] = x * factor;
        positions[i + 2] = z * factor;
      }
    }

    positionAttribute.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  /**
   * Add seam detail to pillow
   */
  protected addSeam(geometry: THREE.BufferGeometry, config: PillowConfig): void {
    // For a more advanced implementation, we could add a separate seam mesh
    // or modify the UV mapping to include seam texture details
    // This is a placeholder for future enhancement
  }

  /**
   * Create fabric material for pillow
   */
  protected createFabricMaterial(): THREE.MeshStandardMaterial {
    const colors = [
      0xFFFFFF, 0xF5F5DC, 0xE6E6FA, 0xFFB6C1, 
      0xADD8E6, 0x90EE90, 0xFFD700, 0xFFA07A
    ];
    
    return new THREE.MeshStandardMaterial({
      color: colors[Math.floor(this.rng.uniform() * colors.length)],
      roughness: 0.8,
      metalness: 0.0,
    });
  }
}
