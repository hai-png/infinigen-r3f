/**
 * GrassGenerator - Procedural grass varieties with wind animation and LOD
 * 
 * Ported from Infinigen's grass generation system
 * Generates multiple grass species with parametric controls for blade shape, density, and growth patterns
 */

import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../math/distributions';
import { Noise3D } from '../../../../math/noise';

export type GrassSpecies = 'rye' | 'fescue' | 'bermuda' | 'kentucky_bluegrass' | 'st_augustine' | 'zoysia';
export type GrassStyle = 'natural' | 'manicured' | 'wild' | 'dry';

export interface GrassConfig {
  // Dimensions
  height: number;
  density: number;
  bladeWidth: number;
  bladeCount: number;
  
  // Species selection
  species: GrassSpecies;
  style: GrassStyle;
  
  // Growth parameters
  curvature: number;
  twist: number;
  variation: number;
  
  // Wind animation
  windStrength: number;
  windFrequency: number;
  
  // LOD
  lodDistance: number[];
}

export class GrassGenerator extends BaseObjectGenerator<GrassConfig> {
  private noise: Noise3D;
  
  constructor() {
    super();
    this.noise = new Noise3D();
  }

  getDefaultConfig(): GrassConfig {
    return {
      height: 0.3,
      density: 100,
      bladeWidth: 0.02,
      bladeCount: 50,
      species: 'rye',
      style: 'natural',
      curvature: 0.3,
      twist: 0.1,
      variation: 0.2,
      windStrength: 0.5,
      windFrequency: 1.0,
      lodDistance: [5, 15, 30]
    };
  }

  generate(config: Partial<GrassConfig> = {}): THREE.Group {
    const fullConfig = { ...this.getDefaultConfig(), ...config };
    const rng = new SeededRandom(this.seed);
    
    const group = new THREE.Group();
    
    // Generate grass blades based on species
    const blades = this.generateBlades(fullConfig, rng);
    group.add(blades);
    
    // Add collision mesh
    const collisionMesh = this.createCollisionMesh(fullConfig);
    group.userData.collisionMesh = collisionMesh;
    
    // Tag for scattering system
    group.userData.tags = ['vegetation', 'grass', fullConfig.species];
    group.userData.bbox = this.calculateBoundingBox(fullConfig);
    
    return group;
  }

  private generateBlades(config: GrassConfig, rng: SeededRandom): THREE.InstancedMesh {
    const { bladeCount, height, bladeWidth, species, style } = config;
    
    // Create single blade geometry
    const bladeGeometry = this.createBladeGeometry(config, rng);
    
    // Material based on species and style
    const material = this.createGrassMaterial(config, rng);
    
    // Instanced mesh for performance
    const instancedMesh = new THREE.InstancedMesh(bladeGeometry, material, bladeCount);
    
    const dummy = new THREE.Object3D();
    
    for (let i = 0; i < bladeCount; i++) {
      const x = rng.uniform(-1, 1) * config.density * 0.01;
      const z = rng.uniform(-1, 1) * config.density * 0.01;
      const y = 0;
      
      dummy.position.set(x, y, z);
      
      // Random rotation around Y axis
      dummy.rotation.y = rng.uniform(0, Math.PI * 2);
      
      // Scale variation
      const scale = 1 + rng.uniform(-config.variation, config.variation);
      dummy.scale.set(scale, scale, scale);
      
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }
    
    instancedMesh.instanceMatrix.needsUpdate = true;
    
    return instancedMesh;
  }

  private createBladeGeometry(config: GrassConfig, rng: SeededRandom): THREE.PlaneGeometry {
    const { height, bladeWidth, curvature, species } = config;
    
    // Higher segment count for curved blades
    const segments = 8;
    const geometry = new THREE.PlaneGeometry(bladeWidth, height, 2, segments);
    
    // Apply curvature to vertices
    const positions = geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const normalizedY = y / height;
      
      // Apply curvature based on species
      let curveOffset = 0;
      switch (species) {
        case 'fescue':
          curveOffset = Math.sin(normalizedY * Math.PI) * curvature * 0.1;
          break;
        case 'bermuda':
          curveOffset = normalizedY * normalizedY * curvature * 0.15;
          break;
        default:
          curveOffset = normalizedY * curvature * 0.05;
      }
      
      positions[i] += curveOffset;
      
      // Add twist
      const twistAngle = normalizedY * config.twist * (rng.next() > 0.5 ? 1 : -1);
      const x = positions[i];
      positions[i] = x * Math.cos(twistAngle);
      positions[i + 2] = x * Math.sin(twistAngle);
    }
    
    geometry.computeVertexNormals();
    
    return geometry;
  }

  private createGrassMaterial(config: GrassConfig, rng: SeededRandom): THREE.MeshStandardMaterial {
    const { species, style } = config;
    
    // Base colors by species
    let baseColor: THREE.Color;
    switch (species) {
      case 'bermuda':
        baseColor = new THREE.Color(0x4a7c23);
        break;
      case 'st_augustine':
        baseColor = new THREE.Color(0x3d6b1e);
        break;
      case 'zoysia':
        baseColor = new THREE.Color(0x5a8f3a);
        break;
      default:
        baseColor = new THREE.Color(0x4d8c2a);
    }
    
    // Adjust color based on style
    if (style === 'dry') {
      baseColor.lerp(new THREE.Color(0x8b7355), 0.3);
    } else if (style === 'manicured') {
      baseColor.multiplyScalar(1.1);
    }
    
    return new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.8,
      metalness: 0.0,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.5
    });
  }

  private createCollisionMesh(config: GrassConfig): THREE.Box3 {
    const extent = config.density * 0.01;
    return new THREE.Box3(
      new THREE.Vector3(-extent, 0, -extent),
      new THREE.Vector3(extent, config.height, extent)
    );
  }

  private calculateBoundingBox(config: GrassConfig): BBox {
    const extent = config.density * 0.01;
    return {
      min: [-extent, 0, -extent],
      max: [extent, config.height, extent]
    };
  }

  getWindAnimationParams(config: GrassConfig): { strength: number; frequency: number } {
    return {
      strength: config.windStrength,
      frequency: config.windFrequency
    };
  }
}
