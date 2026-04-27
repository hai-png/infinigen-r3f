/**
 * CliffGenerator - Procedural cliff and rock wall generation
 * 
 * Generates realistic cliff faces, rock walls, and vertical terrain features:
 * - Layered sedimentary rock formations
 * - Vertical fracture patterns
 * - Overhangs and ledges
 * - Erosion-based detailing
 * - Integration with RockGenerator for material consistency
 */

import * as THREE from 'three';
import { NoiseUtils } from '../../../terrain/utils/NoiseUtils';
import { RockGenerator, RockType, RockMaterial } from './RockGenerator';

// ============================================================================
// Type Definitions
// ============================================================================

export interface CliffConfig {
  // Dimensions
  width: number;
  height: number;
  depth: number;
  
  // Shape properties
  segments: number;
  layerCount: number;
  layerVariation: number;
  overhangAmount: number;
  
  // Fracture properties
  fractureDensity: number;
  fractureDepth: number;
  fractureWidth: number;
  
  // Erosion
  erosionIntensity: number;
  weatheringLevel: number;
  
  // Material
  rockType: RockType;
  layerColorVariation: boolean;
  
  // LOD
  useLOD: boolean;
  seed: number;
}

export interface CliffLayer {
  height: number;
  colorOffset: THREE.Color;
  roughnessOffset: number;
  displacementScale: number;
}

// ============================================================================
// CliffGenerator Class
// ============================================================================

export class CliffGenerator {
  private config: CliffConfig;
  private noise: NoiseUtils;
  private rockGenerator: RockGenerator;
  
  constructor(config: Partial<CliffConfig> = {}) {
    this.config = {
      width: 10,
      height: 20,
      depth: 5,
      segments: 4,
      layerCount: 5,
      layerVariation: 0.3,
      overhangAmount: 0.4,
      fractureDensity: 0.2,
      fractureDepth: 0.3,
      fractureWidth: 0.05,
      erosionIntensity: 0.5,
      weatheringLevel: 0.4,
      rockType: 'sandstone',
      layerColorVariation: true,
      useLOD: true,
      seed: Math.random() * 10000,
      ...config
    };
    
    this.noise = new NoiseUtils(this.config.seed);
    this.rockGenerator = new RockGenerator({
      seed: this.config.seed,
      rockType: this.config.rockType
    });
  }
  
  /**
   * Generate a cliff face mesh
   */
  generate(): THREE.Mesh {
    const geometry = this.createCliffGeometry();
    const material = this.createCliffMaterial();
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.cliffData = {
      width: this.config.width,
      height: this.config.height,
      layers: this.config.layerCount
    };
    
    return mesh;
  }
  
  /**
   * Create cliff geometry with layers and fractures
   */
  private createCliffGeometry(): THREE.BufferGeometry {
    // Start with a box geometry for the base cliff shape
    const geometry = new THREE.BoxGeometry(
      this.config.width,
      this.config.height,
      this.config.depth,
      this.config.segments * 2,
      this.config.segments * this.config.layerCount,
      this.config.segments
    );
    
    // Apply layer-based displacement
    this.applyLayers(geometry);
    
    // Add fractures
    if (this.config.fractureDensity > 0) {
      this.addFractures(geometry);
    }
    
    // Apply erosion
    if (this.config.erosionIntensity > 0) {
      this.applyErosion(geometry);
    }
    
    // Add overhangs
    if (this.config.overhangAmount > 0) {
      this.addOverhangs(geometry);
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }
  
  /**
   * Apply sedimentary layer pattern
   */
  private applyLayers(geometry: THREE.BufferGeometry): void {
    const positionAttribute = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    const layerHeight = this.config.height / this.config.layerCount;
    
    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i);
      
      // Determine which layer this vertex belongs to
      const layerIndex = Math.floor((vertex.y + this.config.height / 2) / layerHeight);
      const normalizedLayerY = ((vertex.y + this.config.height / 2) % layerHeight) / layerHeight;
      
      // Apply layer-specific displacement
      const layerNoise = this.noise.perlin2D(
        vertex.x * 0.1,
        vertex.z * 0.1
      );
      
      const displacement = 1 + layerNoise * this.config.layerVariation * 0.3;
      
      // Push vertices outward based on layer
      if (Math.abs(vertex.x) > this.config.width * 0.4 || 
          Math.abs(vertex.z) > this.config.depth * 0.4) {
        vertex.x *= displacement;
        vertex.z *= displacement;
      }
      
      positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
  }
  
  /**
   * Add vertical fracture patterns
   */
  private addFractures(geometry: THREE.BufferGeometry): void {
    const positionAttribute = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    
    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i);
      
      // Only modify front/back faces significantly
      if (Math.abs(vertex.z) < this.config.depth * 0.3) continue;
      
      // Calculate fracture noise
      const fractureNoise = this.noise.perlin3D(
        vertex.x * this.config.fractureDensity * 2,
        vertex.y * 0.5,
        vertex.z * this.config.fractureDensity * 2
      );
      
      // Create fracture indentations
      if (fractureNoise < this.config.fractureDensity) {
        const fractureDepth = (1 - fractureNoise / this.config.fractureDensity) * 
                             this.config.fractureDepth;
        
        if (vertex.z > 0) {
          vertex.z -= fractureDepth * this.config.depth;
        } else {
          vertex.z += fractureDepth * this.config.depth;
        }
        
        positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
      }
    }
  }
  
  /**
   * Apply erosion effects
   */
  private applyErosion(geometry: THREE.BufferGeometry): void {
    const positionAttribute = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    
    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i);
      
      // More erosion at top and bottom
      const normalizedY = (vertex.y + this.config.height / 2) / this.config.height;
      const erosionFactor = Math.sin(normalizedY * Math.PI) * this.config.erosionIntensity;
      
      // Apply erosion noise
      const erosionNoise = this.noise.perlin2D(
        vertex.x * 0.2,
        vertex.z * 0.2
      );
      
      const totalErosion = erosionFactor * erosionNoise * 0.5;
      
      // Round edges
      if (Math.abs(vertex.x) > this.config.width * 0.3 || 
          Math.abs(vertex.z) > this.config.depth * 0.3) {
        vertex.x *= (1 - totalErosion * 0.3);
        vertex.z *= (1 - totalErosion * 0.3);
      }
      
      positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
  }
  
  /**
   * Add overhangs and ledges
   */
  private addOverhangs(geometry: THREE.BufferGeometry): void {
    const positionAttribute = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    
    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i);
      
      // Check if vertex is on a potential ledge height
      const normalizedY = (vertex.y + this.config.height / 2) / this.config.height;
      const ledgeNoise = this.noise.perlin2D(vertex.x * 0.15, vertex.z * 0.15);
      
      // Create overhangs at certain heights
      if (ledgeNoise > 0.6 && normalizedY > 0.2 && normalizedY < 0.9) {
        const overhangAmount = (ledgeNoise - 0.6) * this.config.overhangAmount;
        
        if (vertex.z > 0 && vertex.x > -this.config.width * 0.4 && vertex.x < this.config.width * 0.4) {
          vertex.z += overhangAmount * this.config.depth;
          vertex.y -= overhangAmount * 0.5; // Slight droop
        }
        
        positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
      }
    }
  }
  
  /**
   * Create cliff material with layer variation
   */
  private createCliffMaterial(): THREE.MeshStandardMaterial {
    const rockMaterial = this.rockGenerator.getConfig();
    const baseColor = rockMaterial.rockType === 'cliff' ? 
      new THREE.Color(0x555248) : 
      new THREE.Color(0x787255);
    
    // Add subtle color variation
    const variation = new THREE.Color(0.08, 0.07, 0.06);
    baseColor.r += (Math.random() - 0.5) * variation.r;
    baseColor.g += (Math.random() - 0.5) * variation.g;
    baseColor.b += (Math.random() - 0.5) * variation.b;
    
    return new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.95,
      metalness: 0.05,
      bumpScale: 0.05
    });
  }
  
  /**
   * Generate multiple cliff segments for larger formations
   */
  generateCliffFormation(count: number, spacing: number): THREE.Group {
    const group = new THREE.Group();
    
    for (let i = 0; i < count; i++) {
      const cliff = this.generate();
      
      // Position cliffs in a line or curve
      const x = i * spacing;
      const z = Math.sin(i * 0.3) * spacing * 0.3;
      const rotation = -Math.sin(i * 0.2) * 0.3;
      
      cliff.position.set(x, 0, z);
      cliff.rotation.y = rotation;
      
      group.add(cliff);
    }
    
    return group;
  }
  
  /**
   * Update configuration
   */
  setConfig(config: Partial<CliffConfig>): void {
    this.config = { ...this.config, ...config };
    this.noise = new NoiseUtils(this.config.seed);
    this.rockGenerator.setConfig({
      seed: this.config.seed,
      rockType: this.config.rockType
    });
  }
  
  /**
   * Get current configuration
   */
  getConfig(): CliffConfig {
    return { ...this.config };
  }
  
  /**
   * Dispose resources
   */
  dispose(): void {
    this.rockGenerator.dispose();
  }
}

export default CliffGenerator;
