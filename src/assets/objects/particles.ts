/**
 * InfiniGen R3F Port - Particle System Assets
 *
 * Generates particle-based assets including raindrops, dust motes,
 * snowflakes, and other small atmospheric elements.
 *
 * Based on original InfiniGen particles.py implementation
 *
 * @module assets/objects/particles
 */

import * as THREE from 'three';
import { Vector3 } from '../../math/vector';
import { GeometryUtils } from '../../utils/geometry';

// ============================================================================
// Type Definitions
// ============================================================================

export type ParticleType = 'raindrop' | 'dustmote' | 'snowflake' | 'lichen' | 'moss' | 'pineNeedle';

export interface ParticleConfig {
  type: ParticleType;
  size: number;
  sizeVariation: number;
  detail: number;
}

// ============================================================================
// Raindrop Factory
// ============================================================================

export class RaindropFactory {
  private config: ParticleConfig;
  
  constructor(config?: Partial<ParticleConfig>) {
    this.config = {
      type: 'raindrop',
      size: 0.01,
      sizeVariation: 0.3,
      detail: 5,
      ...config,
    };
  }
  
  /**
   * Create a single raindrop mesh
   */
  public create(): THREE.BufferGeometry {
    const radius = this.config.size * (0.7 + Math.random() * this.config.sizeVariation);
    
    // Start with icosphere
    const geometry = new THREE.IcosahedronGeometry(radius, this.config.detail);
    
    // Deform to teardrop shape
    const positions = geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Stretch vertically
      positions[i + 1] = y * 1.3;
      
      // Taper at bottom
      const normalizedY = (y + radius) / (2 * radius);
      const taperFactor = 0.7 + 0.3 * normalizedY;
      positions[i] = x * taperFactor;
      positions[i + 2] = z * taperFactor;
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create instanced raindrops
   */
  public createInstanced(count: number, material: THREE.Material): THREE.InstancedMesh {
    const geometry = this.create();
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    
    const dummy = new THREE.Object3D();
    
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 10;
      const y = (Math.random() - 0.5) * 10;
      const z = (Math.random() - 0.5) * 10;
      
      dummy.position.set(x, y, z);
      
      const scale = 0.7 + Math.random() * this.config.sizeVariation;
      dummy.scale.set(scale, scale, scale);
      
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
  
  /**
   * Create glass-like material for raindrops
   */
  public createMaterial(): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.0,
      transmission: 1.0,
      thickness: 0.5,
      envMapIntensity: 1.5,
      clearcoat: 1.0,
      clearcoatRoughness: 0.0,
      transparent: true,
      opacity: 0.9,
    });
  }
}

// ============================================================================
// Dust Mote Factory
// ============================================================================

export class DustMoteFactory {
  private config: ParticleConfig;
  
  constructor(config?: Partial<ParticleConfig>) {
    this.config = {
      type: 'dustmote',
      size: 0.001,
      sizeVariation: 0.8,
      detail: 2,
      ...config,
    };
  }
  
  /**
   * Create a single dust mote mesh
   */
  public create(): THREE.BufferGeometry {
    const radius = this.config.size * (0.5 + Math.random() * this.config.sizeVariation);
    return new THREE.IcosahedronGeometry(radius, this.config.detail);
  }
  
  /**
   * Create instanced dust motes
   */
  public createInstanced(count: number, material: THREE.Material): THREE.InstancedMesh {
    const geometry = this.create();
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    
    const dummy = new THREE.Object3D();
    
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 20;
      const y = (Math.random() - 0.5) * 20;
      const z = (Math.random() - 0.5) * 20;
      
      dummy.position.set(x, y, z);
      
      const scale = 0.5 + Math.random() * this.config.sizeVariation;
      dummy.scale.set(scale, scale, scale);
      
      dummy.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
  
  /**
   * Create dirt-like material for dust motes
   */
  public createMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x8B7355,
      roughness: 0.9,
      metalness: 0.0,
    });
  }
}

// ============================================================================
// Snowflake Factory
// ============================================================================

export class SnowflakeFactory {
  private config: ParticleConfig;
  
  constructor(config?: Partial<ParticleConfig>) {
    this.config = {
      type: 'snowflake',
      size: 0.003,
      sizeVariation: 0.5,
      detail: 6, // vertices for hexagonal shape
      ...config,
    };
  }
  
  /**
   * Create a single snowflake mesh (hexagonal plate)
   */
  public create(): THREE.BufferGeometry {
    const radius = this.config.size * (0.7 + Math.random() * this.config.sizeVariation);
    
    // Create hexagonal plate
    const geometry = new THREE.CircleGeometry(radius, 6);
    
    // Add some variation to vertices for natural look
    const positions = geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      
      // Add slight random displacement
      const noise = (Math.random() - 0.5) * 0.1 * radius;
      positions[i] = x + noise;
      positions[i + 1] = y + noise;
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create instanced snowflakes
   */
  public createInstanced(count: number, material: THREE.Material): THREE.InstancedMesh {
    const geometry = this.create();
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    
    const dummy = new THREE.Object3D();
    
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 30;
      const y = (Math.random() - 0.5) * 30;
      const z = (Math.random() - 0.5) * 30;
      
      dummy.position.set(x, y, z);
      
      const scale = 0.7 + Math.random() * this.config.sizeVariation;
      dummy.scale.set(scale, scale, scale * 0.1); // Flat
      
      dummy.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
  
  /**
   * Create snow-like material with subsurface scattering effect
   */
  public createMaterial(): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.0,
      transmission: 0.3,
      thickness: 0.1,
      specularIntensity: 0.5,
      clearcoat: 0.3,
      transparent: true,
      opacity: 0.9,
    });
  }
}

// ============================================================================
// Lichen Particle Factory
// ============================================================================

export class LichenFactory {
  private config: ParticleConfig;
  
  constructor(config?: Partial<ParticleConfig>) {
    this.config = {
      type: 'lichen',
      size: 0.02,
      sizeVariation: 0.4,
      detail: 3,
      ...config,
    };
  }
  
  /**
   * Create a single lichen patch
   */
  public create(): THREE.BufferGeometry {
    const size = this.config.size * (0.8 + Math.random() * this.config.sizeVariation);
    
    // Create irregular blob shape
    const geometry = new THREE.CircleGeometry(size, 8);
    const positions = geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const dist = Math.sqrt(x * x + y * y);
      const angle = Math.atan2(y, x);
      
      // Add organic variation
      const variation = 0.8 + 0.4 * Math.sin(angle * 4) * Math.cos(angle * 3);
      positions[i] = x * variation;
      positions[i + 1] = y * variation;
      positions[i + 2] = (Math.random() - 0.5) * size * 0.2; // Height variation
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create instanced lichen patches
   */
  public createInstanced(count: number, material: THREE.Material): THREE.InstancedMesh {
    const geometry = this.create();
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    
    const dummy = new THREE.Object3D();
    
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 10;
      const y = (Math.random() - 0.5) * 10;
      const z = (Math.random() - 0.5) * 10;
      
      dummy.position.set(x, y, z);
      
      const scale = 0.8 + Math.random() * this.config.sizeVariation;
      dummy.scale.set(scale, scale, 0.1);
      
      dummy.rotation.set(
        Math.PI / 2 + (Math.random() - 0.5) * 0.2,
        Math.random() * Math.PI * 2,
        0
      );
      
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
  
  /**
   * Create lichen material
   */
  public createMaterial(color: number = 0x8FBC8F): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.9,
      metalness: 0.0,
      bumpScale: 0.01,
    });
  }
}

// ============================================================================
// Moss Particle Factory
// ============================================================================

export class MossFactory {
  private config: ParticleConfig;
  
  constructor(config?: Partial<ParticleConfig>) {
    this.config = {
      type: 'moss',
      size: 0.015,
      sizeVariation: 0.5,
      detail: 4,
      ...config,
    };
  }
  
  /**
   * Create a single moss clump
   */
  public create(): THREE.BufferGeometry {
    const size = this.config.size * (0.7 + Math.random() * this.config.sizeVariation);
    
    // Create tufted geometry
    const geometry = new THREE.ConeGeometry(size * 0.5, size, 6, 1, true);
    const positions = geometry.attributes.position.array as Float32Array;
    
    // Add randomness to simulate moss fibers
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += (Math.random() - 0.5) * size * 0.3;
      positions[i + 1] += (Math.random() - 0.5) * size * 0.3;
      positions[i + 2] += (Math.random() - 0.5) * size * 0.3;
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create instanced moss clumps
   */
  public createInstanced(count: number, material: THREE.Material): THREE.InstancedMesh {
    const geometry = this.create();
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    
    const dummy = new THREE.Object3D();
    
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 10;
      const y = (Math.random() - 0.5) * 10;
      const z = (Math.random() - 0.5) * 10;
      
      dummy.position.set(x, y, z);
      
      const scale = 0.7 + Math.random() * this.config.sizeVariation;
      dummy.scale.set(scale, scale, scale);
      
      dummy.rotation.set(
        (Math.random() - 0.5) * 0.3,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.3
      );
      
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
  
  /**
   * Create moss material
   */
  public createMaterial(color: number = 0x228B22): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.95,
      metalness: 0.0,
    });
  }
}

// ============================================================================
// Pine Needle Factory
// ============================================================================

export class PineNeedleFactory {
  private config: ParticleConfig;
  
  constructor(config?: Partial<ParticleConfig>) {
    this.config = {
      type: 'pineNeedle',
      size: 0.08,
      sizeVariation: 0.3,
      detail: 3,
      ...config,
    };
  }
  
  /**
   * Create a single pine needle
   */
  public create(): THREE.BufferGeometry {
    const length = this.config.size * (0.8 + Math.random() * this.config.sizeVariation);
    const radius = length * 0.05;
    
    // Create elongated capsule-like shape
    const geometry = new THREE.CapsuleGeometry(radius, length * 0.8, 4, 8);
    
    // Taper the ends
    const positions = geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const normalizedY = Math.abs(y) / (length * 0.5);
      const taperFactor = 1 - 0.7 * normalizedY * normalizedY;
      
      positions[i] *= taperFactor;
      positions[i + 2] *= taperFactor;
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create instanced pine needles
   */
  public createInstanced(count: number, material: THREE.Material): THREE.InstancedMesh {
    const geometry = this.create();
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    
    const dummy = new THREE.Object3D();
    
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 10;
      const y = (Math.random() - 0.5) * 10;
      const z = (Math.random() - 0.5) * 10;
      
      dummy.position.set(x, y, z);
      
      const scale = 0.8 + Math.random() * this.config.sizeVariation;
      dummy.scale.set(scale, scale, scale);
      
      dummy.rotation.set(
        (Math.random() - 0.5) * Math.PI,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * Math.PI
      );
      
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
  
  /**
   * Create pine needle material
   */
  public createMaterial(color: number = 0x2E8B57): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.7,
      metalness: 0.0,
    });
  }
}

// ============================================================================
// Particle System Manager
// ============================================================================

export class ParticleAssetManager {
  private raindropFactory: RaindropFactory;
  private dustMoteFactory: DustMoteFactory;
  private snowflakeFactory: SnowflakeFactory;
  private lichenFactory: LichenFactory;
  private mossFactory: MossFactory;
  private pineNeedleFactory: PineNeedleFactory;
  
  constructor() {
    this.raindropFactory = new RaindropFactory();
    this.dustMoteFactory = new DustMoteFactory();
    this.snowflakeFactory = new SnowflakeFactory();
    this.lichenFactory = new LichenFactory();
    this.mossFactory = new MossFactory();
    this.pineNeedleFactory = new PineNeedleFactory();
  }
  
  /**
   * Get factory by particle type
   */
  public getFactory(type: ParticleType) {
    switch (type) {
      case 'raindrop':
        return this.raindropFactory;
      case 'dustmote':
        return this.dustMoteFactory;
      case 'snowflake':
        return this.snowflakeFactory;
      case 'lichen':
        return this.lichenFactory;
      case 'moss':
        return this.mossFactory;
      case 'pineNeedle':
        return this.pineNeedleFactory;
      default:
        throw new Error(`Unknown particle type: ${type}`);
    }
  }
  
  /**
   * Create particle system of specified type
   */
  public createParticleSystem(
    type: ParticleType,
    count: number
  ): { mesh: THREE.InstancedMesh; material: THREE.Material } {
    const factory: any = this.getFactory(type);
    const material = factory.createMaterial();
    const mesh = factory.createInstanced(count, material);
    
    return { mesh, material };
  }
}

export default ParticleAssetManager;
