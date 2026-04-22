/**
 * Boulder Factory - Procedural rock/boulder generation
 * Ported from: infinigen/assets/rocks/boulder.py
 * 
 * Generates realistic boulders using displacement maps and procedural noise
 */

import { AssetFactory, FactoryConfig } from '../../placement/factory';
import * as THREE from 'three';

export interface BoulderConfig extends FactoryConfig {
  /** Base radius of the boulder */
  radius: number;
  /** Displacement scale for surface detail */
  displacementScale: number;
  /** Number of noise octaves for detail */
  noiseOctaves: number;
  /** Noise lacunarity (frequency multiplier per octave) */
  noiseLacunarity: number;
  /** Noise gain (amplitude multiplier per octave) */
  noiseGain: number;
  /** Roughness of the surface */
  roughness: number;
  /** Color variation */
  colorVariation: number;
  /** Whether to add moss/vegetation patches */
  enableMoss: boolean;
  /** Moss coverage (0-1) */
  mossCoverage: number;
}

const DEFAULT_BOULDER_CONFIG: BoulderConfig = {
  seed: Math.random(),
  radius: 1.0,
  displacementScale: 0.3,
  noiseOctaves: 4,
  noiseLacunarity: 2.0,
  noiseGain: 0.5,
  roughness: 0.8,
  colorVariation: 0.2,
  enableMoss: false,
  mossCoverage: 0.15,
};

/**
 * BoulderFactory - Generates procedural boulder meshes
 */
export class BoulderFactory extends AssetFactory<BoulderConfig> {
  protected defaultConfig: BoulderConfig = DEFAULT_BOULDER_CONFIG;
  
  public readonly assetType = 'boulder';
  public readonly tags = ['rock', 'natural', 'static'];

  constructor(config?: Partial<BoulderConfig>) {
    super(config);
  }

  /**
   * Generate a boulder mesh with procedural displacement
   */
  async generateAsset(config?: Partial<BoulderConfig>): Promise<THREE.Mesh> {
    const finalConfig = this.mergeConfig(config);
    this.setSeed(finalConfig.seed);

    // Create base icosphere for uniform triangulation
    const geometry = this.createBaseSphere(finalConfig.radius);
    
    // Apply displacement based on noise
    this.applyDisplacement(geometry, finalConfig);
    
    // Add color variation via vertex colors
    this.applyVertexColors(geometry, finalConfig);

    // Create material
    const material = this.createMaterial(finalConfig);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // Store metadata
    mesh.userData.factoryType = 'boulder';
    mesh.userData.seed = finalConfig.seed;
    mesh.userData.config = finalConfig;

    return mesh;
  }

  /**
   * Create multiple boulders with variations
   */
  async generateCollection(
    count: number,
    config?: Partial<BoulderConfig>
  ): Promise<THREE.Mesh[]> {
    const boulders: THREE.Mesh[] = [];
    
    for (let i = 0; i < count; i++) {
      const variation = {
        ...config,
        seed: this.randomInt(0, 1000000),
        radius: config?.radius ?? 1.0 * (0.8 + this.random() * 0.4),
        displacementScale: (config?.displacementScale ?? 0.3) * (0.7 + this.random() * 0.6),
      };
      
      const boulder = await this.generateAsset(variation);
      boulders.push(boulder);
    }

    return boulders;
  }

  /**
   * Create instanced boulders for performance
   */
  async generateInstanced(
    count: number,
    positions: THREE.Vector3[],
    config?: Partial<BoulderConfig>
  ): Promise<THREE.InstancedMesh> {
    const finalConfig = this.mergeConfig(config);
    const prototype = await this.generateAsset(finalConfig);
    
    const instancedMesh = new THREE.InstancedMesh(
      prototype.geometry,
      prototype.material,
      count
    );

    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    
    for (let i = 0; i < count; i++) {
      const position = positions[i] || new THREE.Vector3(
        this.randomRange(-10, 10),
        0,
        this.randomRange(-10, 10)
      );

      dummy.position.copy(position);
      dummy.rotation.set(
        this.randomRange(0, Math.PI * 2),
        this.randomRange(0, Math.PI * 2),
        this.randomRange(0, Math.PI * 2)
      );
      
      const scale = 0.8 + this.random() * 0.4;
      dummy.scale.setScalar(scale);
      
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    
    // Clean up prototype
    prototype.geometry.dispose();
    if (Array.isArray(prototype.material)) {
      prototype.material.forEach(m => m.dispose());
    } else {
      prototype.material.dispose();
    }

    return instancedMesh;
  }

  /**
   * Create base icosphere geometry
   */
  protected createBaseSphere(radius: number): THREE.IcosahedronGeometry {
    // Use detail level 3 for good balance of vertices and performance
    const detail = 3;
    return new THREE.IcosahedronGeometry(radius, detail);
  }

  /**
   * Apply noise-based displacement to geometry vertices
   */
  protected applyDisplacement(
    geometry: THREE.IcosahedronGeometry,
    config: BoulderConfig
  ): void {
    const positionAttribute = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    
    // Simplex-like noise function (placeholder - should use simplex-noise library)
    const noise = (x: number, y: number, z: number): number => {
      let value = 0;
      let amplitude = 1;
      let frequency = 1;
      let maxValue = 0;
      
      for (let i = 0; i < config.noiseOctaves; i++) {
        value += this.hashNoise(x * frequency, y * frequency, z * frequency) * amplitude;
        maxValue += amplitude;
        amplitude *= config.noiseGain;
        frequency *= config.noiseLacunarity;
      }
      
      return value / maxValue;
    };

    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i);
      
      // Normalize vertex for spherical coordinates
      const normal = vertex.clone().normalize();
      
      // Calculate noise at vertex position
      const noiseValue = noise(
        vertex.x * 0.5,
        vertex.y * 0.5,
        vertex.z * 0.5
      );
      
      // Apply displacement along normal
      const displacement = 1 + noiseValue * config.displacementScale;
      vertex.multiplyScalar(displacement);
      
      positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    geometry.computeVertexNormals();
    positionAttribute.needsUpdate = true;
  }

  /**
   * Apply vertex colors for natural variation
   */
  protected applyVertexColors(
    geometry: THREE.IcosahedronGeometry,
    config: BoulderConfig
  ): void {
    const positionAttribute = geometry.attributes.position;
    const count = positionAttribute.count;
    
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();
    
    // Base rock color (gray-brown)
    const baseColor = new THREE.Color(0x8B8680);
    
    for (let i = 0; i < count; i++) {
      // Add variation
      const variation = config.colorVariation * (this.random() - 0.5);
      color.copy(baseColor);
      color.r += variation;
      color.g += variation;
      color.b += variation;
      
      // Clamp values
      color.clamp();
      
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  /**
   * Create physically-based material for boulder
   */
  protected createMaterial(config: BoulderConfig): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: config.roughness,
      metalness: 0.0,
      side: THREE.FrontSide,
      flatShading: false,
    });

    return material;
  }

  /**
   * Simple hash-based noise function (placeholder for simplex-noise)
   */
  protected hashNoise(x: number, y: number, z: number): number {
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 45.543) * 43758.5453;
    return n - Math.floor(n);
  }
}

export default BoulderFactory;
