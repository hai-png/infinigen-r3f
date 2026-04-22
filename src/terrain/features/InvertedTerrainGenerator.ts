/**
 * Infinigen R3F Port - Inverted Terrain Generator
 * Upside-Down Mountains and Hanging Terrain Features
 *
 * Based on: infinigen/terrain/elements/upsidedown_mountains.py
 * 
 * Generates hanging terrain features from ceilings, inverted erosion patterns,
 * and stalactite formations for cave and underground scenes.
 */

import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  InstancedMesh,
  Matrix4,
  Vector3,
  Color,
  Box3,
} from 'three';
import * as THREE from 'three';
import { SeededRandom } from '../../util/MathUtils';
import { TerrainConfig } from './core/TerrainGenerator';

export interface InvertedTerrainConfig extends TerrainConfig {
  /** Maximum depth of hanging features (default: 5) */
  hangDepth: number;
  /** Density of stalactite formations (0-1, default: 0.3) */
  stalactiteDensity: number;
  /** Frequency of noise for base shape (default: 0.005) */
  frequency: number;
  /** Randomness factor for variation (0-1, default: 0.2) */
  randomness: number;
  /** Number of octaves for noise perturbation (default: 9) */
  perturbOctaves: number;
  /** Frequency multiplier for perturbation (default: 1) */
  perturbFreq: number;
  /** Scale of perturbation (default: 0.2) */
  perturbScale: number;
  /** Minimum height above ground (default: 5) */
  floatingHeight: number;
  /** Enable warped variations (default: false) */
  useWarped: boolean;
}

export class InvertedTerrainGenerator {
  private config: InvertedTerrainConfig;
  private rng: SeededRandom;

  constructor(config: Partial<InvertedTerrainConfig> = {}) {
    this.config = {
      hangDepth: 5,
      stalactiteDensity: 0.3,
      frequency: 0.005,
      randomness: 0.2,
      perturbOctaves: 9,
      perturbFreq: 1,
      perturbScale: 0.2,
      floatingHeight: 5,
      useWarped: false,
      ...config,
    };
    this.rng = new SeededRandom(Math.floor(Math.random() * 1000000));
  }

  /**
   * Generate inverted terrain for a given area
   * @param area - Bounding box defining the generation area
   * @param seed - Optional seed for reproducibility
   */
  generate(area: Box3, seed?: number): Mesh {
    if (seed !== undefined) {
      this.rng = new SeededRandom(seed);
    }

    const width = area.max.x - area.min.x;
    const depth = area.max.z - area.min.z;
    const centerX = (area.min.x + area.max.x) / 2;
    const centerZ = (area.min.z + area.max.z) / 2;
    const ceilingY = area.max.y;

    // Generate base inverted mesh
    const geometry = this.generateInvertedSurface(width, depth, centerX, centerZ, ceilingY);
    
    // Apply inverted erosion
    this.applyInvertedErosion(geometry);

    // Create material (should be configured externally)
    const material = this.createInvertedMaterial();

    const mesh = new Mesh(geometry, material);
    mesh.position.set(0, 0, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  /**
   * Generate hanging stalactite formations
   * @param area - Area to populate with stalactites
   * @param count - Number of stalactite clusters
   */
  generateStalactites(area: Box3, count: number = 50): InstancedMesh {
    const stalactiteGeometry = this.createStalactiteGeometry();
    const material = this.createStalactiteMaterial();
    
    const instancedMesh = new InstancedMesh(stalactiteGeometry, material, count);
    instancedMesh.instanceMatrix.setUsage(3); // DynamicDrawUsage

    const dummy = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();

    for (let i = 0; i < count; i++) {
      // Random position on ceiling
      position.x = this.rng.range(area.min.x, area.max.x);
      position.z = this.rng.range(area.min.z, area.max.z);
      position.y = ceilingY - this.rng.range(0.5, 2);

      // Random scale variation
      const size = this.rng.range(0.3, 1.5);
      scale.set(size, this.rng.range(1, 3) * size, size);

      dummy.setPosition(position);
      dummy.scale(scale);
      instancedMesh.setMatrixAt(i, dummy);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return instancedMesh;
  }

  /**
   * Generate inverted mountain peaks hanging from ceiling
   */
  generateInvertedPeaks(area: Box3, peakCount: number = 10): THREE.Group {
    const group = new THREE.Group();
    
    for (let i = 0; i < peakCount; i++) {
      const peak = this.createInvertedPeak();
      
      // Position on ceiling
      peak.position.x = this.rng.range(area.min.x, area.max.x);
      peak.position.z = this.rng.range(area.min.z, area.max.z);
      peak.position.y = area.max.y;
      
      // Random rotation
      peak.rotation.y = this.rng.range(0, Math.PI * 2);
      
      // Scale variation
      const scale = this.rng.range(0.5, 2);
      peak.scale.set(scale, scale, scale);
      
      group.add(peak);
    }

    return group;
  }

  /**
   * Private: Generate inverted surface geometry
   */
  private generateInvertedSurface(
    width: number,
    depth: number,
    centerX: number,
    centerZ: number,
    ceilingY: number
  ): BufferGeometry {
    const segments = 64;
    const geometry = new BufferGeometry();
    
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    const dx = width / segments;
    const dz = depth / segments;

    for (let i = 0; i <= segments; i++) {
      for (let j = 0; j <= segments; j++) {
        const x = centerX - width / 2 + i * dx;
        const z = centerZ - depth / 2 + j * dz;
        
        // Calculate inverted height using noise
        let height = this.calculateInvertedHeight(x, z, ceilingY);
        
        // Apply randomness
        if (this.config.randomness > 0) {
          height += this.rng.gaussian(0, this.config.randomness * this.config.hangDepth);
        }

        vertices.push(x, height, z);
        
        // Calculate normal (simplified)
        normals.push(0, -1, 0);
        
        // UV coordinates
        uvs.push(i / segments, j / segments);
      }
    }

    // Generate indices
    const indices: number[] = [];
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < segments; j++) {
        const a = i * (segments + 1) + j;
        const b = a + 1;
        const c = a + (segments + 1);
        const d = c + 1;

        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    return geometry;
  }

  /**
   * Private: Calculate inverted height at position
   */
  private calculateInvertedHeight(x: number, z: number, ceilingY: number): number {
    const freq = this.config.frequency;
    let height = 0;

    // Multi-octave noise for natural variation
    let amplitude = 1;
    let frequency = freq;
    
    for (let i = 0; i < this.config.perturbOctaves; i++) {
      const nx = x * frequency;
      const nz = z * frequency;
      
      // Simple noise approximation (replace with proper noise function)
      const noise = this.simpleNoise(nx, nz);
      
      height += noise * amplitude;
      
      amplitude *= this.config.perturbScale;
      frequency *= this.config.perturbFreq;
    }

    // Normalize and apply hang depth
    height = ceilingY - (height * this.config.hangDepth);
    
    // Ensure minimum floating height
    const minY = ceilingY - this.config.hangDepth;
    return Math.max(minY, height);
  }

  /**
   * Private: Apply inverted erosion patterns
   */
  private applyInvertedErosion(geometry: BufferGeometry): void {
    const positions = geometry.getAttribute('position') as Float32BufferAttribute;
    const vertices = positions.array;

    // Simulate water dripping erosion (inverted)
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const y = vertices[i + 1];
      const z = vertices[i + 2];

      // Erosion based on position and noise
      const erosion = this.calculateInvertedErosion(x, y, z);
      vertices[i + 1] -= erosion;
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  /**
   * Private: Calculate erosion amount
   */
  private calculateInvertedErosion(x: number, y: number, z: number): number {
    // Simplified erosion model
    const noise = this.simpleNoise(x * 0.1, z * 0.1);
    return Math.max(0, noise * 0.5);
  }

  /**
   * Private: Create stalactite geometry
   */
  private createStalactiteGeometry(): BufferGeometry {
    const geometry = new BufferGeometry();
    const segments = 8;
    const height = 2;
    const radius = 0.5;

    const vertices: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    // Top cap
    vertices.push(0, 0, 0);
    normals.push(0, -1, 0);

    // Cone body
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;

      vertices.push(x, 0, z);
      normals.push(Math.cos(theta), 0, Math.sin(theta));

      const tipY = -height;
      vertices.push(x * 0.1, tipY, z * 0.1);
      normals.push(Math.cos(theta) * 0.5, -0.866, Math.sin(theta) * 0.5);
    }

    // Generate indices for cone
    for (let i = 1; i <= segments; i++) {
      const a = 0;
      const b = i * 2 - 1;
      const c = i * 2 + 1;
      
      if (i <= segments) {
        indices.push(a, b, c % (segments * 2 + 1) || 1);
      }
    }

    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);

    return geometry;
  }

  /**
   * Private: Create inverted mountain peak
   */
  private createInvertedPeak(): Mesh {
    const geometry = new BufferGeometry();
    const segments = 6;
    const height = this.rng.range(3, 8);
    const baseRadius = this.rng.range(2, 5);

    const vertices: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    // Tip at origin (will be positioned at ceiling)
    vertices.push(0, 0, 0);
    normals.push(0, -1, 0);

    // Base ring
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const x = Math.cos(theta) * baseRadius;
      const z = Math.sin(theta) * baseRadius;

      vertices.push(x, -height, z);
      
      // Normal pointing outward and down
      const nx = Math.cos(theta);
      const nz = Math.sin(theta);
      normals.push(nx, -0.3, nz);
    }

    // Indices for triangles
    for (let i = 0; i < segments; i++) {
      const a = 0;
      const b = i + 1;
      const c = ((i + 1) % segments) + 1;

      indices.push(a, b, c);
    }

    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);

    const material = this.createInvertedMaterial();
    return new Mesh(geometry, material);
  }

  /**
   * Private: Create material for inverted terrain
   */
  private createInvertedMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x4a4a4a,
      roughness: 0.9,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Private: Create material for stalactites
   */
  private createStalactiteMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.7,
      metalness: 0.0,
    });
  }

  /**
   * Private: Simple noise function (placeholder - should use proper noise library)
   */
  private simpleNoise(x: number, y: number): number {
    // Simplified value noise
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    
    x -= Math.floor(x);
    y -= Math.floor(y);

    const u = this.fade(x);
    const v = this.fade(y);

    const A = this.rng.hash(X) + Y;
    const B = this.rng.hash(X + 1) + Y;

    return this.lerp(v,
      this.lerp(u, this.rng.hash(A), this.rng.hash(B)),
      this.lerp(u, this.rng.hash(A + 1), this.rng.hash(B + 1))
    );
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }
}

// Re-export for convenience
export { InvertedTerrainGenerator as UpsidedownMountains };
