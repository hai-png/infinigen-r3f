/**
 * Infinigen R3F Port - Moss Scatter Generator
 * Procedural moss scattering on terrain and rock surfaces
 * 
 * Based on original InfiniGen implementation from Princeton VL
 */

import * as THREE from 'three';
import { InstancedMesh } from 'three';
import { SimplexNoise } from '../util/MathUtils';

export interface MossInstance {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: THREE.Vector3;
  density: number;
}

export interface MossScatterParams {
  density: number;
  minSpacing: number;
  baseScale: number;
  scaleRandomness: number;
  moistureThreshold: number;
  shadePreference: number;
  slopeThreshold: number;
  coverage: number;
  seed?: number;
}

export class MossScatterGenerator {
  private noise: SimplexNoise;
  private params: MossScatterParams;

  constructor(params: Partial<MossScatterParams> = {}) {
    this.params = {
      density: 20000, // instances per unit area
      minSpacing: 0.005,
      baseScale: 1.0,
      scaleRandomness: 0.5,
      moistureThreshold: 0.4,
      shadePreference: 0.5,
      slopeThreshold: 0.9,
      coverage: 0.7,
      seed: Math.random() * 10000,
      ...params,
    };

    this.noise = new SimplexNoise(this.params.seed);
  }

  /**
   * Generate moss instances on surface
   */
  generate(
    geometry: THREE.BufferGeometry,
    moistureMap?: THREE.DataTexture,
    shadeMap?: THREE.DataTexture
  ): MossInstance[] {
    const instances: MossInstance[] = [];
    const positions = geometry.attributes.position.array as Float32Array;
    const normals = geometry.attributes.normal?.array as Float32Array;
    
    if (!positions || positions.length === 0) {
      return instances;
    }

    const vertexCount = positions.length / 3;
    const validVertices: number[] = [];

    // Filter vertices based on environmental factors
    for (let i = 0; i < vertexCount; i++) {
      const idx = i * 3;
      const x = positions[idx];
      const y = positions[idx + 1];
      const z = positions[idx + 2];

      // Check slope - moss prefers flatter or gently sloped surfaces
      if (normals) {
        const nx = normals[idx];
        const ny = normals[idx + 1];
        const nz = normals[idx + 2];
        const slope = Math.sqrt(nx * nx + ny * ny);
        
        if (slope > this.params.slopeThreshold) {
          continue;
        }
      }

      // Check moisture - moss needs moisture
      if (moistureMap) {
        const moisture = this.sampleTexture(moistureMap, x, z);
        if (moisture < this.params.moistureThreshold) {
          continue;
        }
      }

      // Check shade - moss prefers shaded areas
      if (shadeMap) {
        const shade = this.sampleTexture(shadeMap, x, z);
        if (shade < this.params.shadePreference) {
          continue;
        }
      }

      // Apply coverage probability
      if (Math.random() > this.params.coverage) {
        continue;
      }

      validVertices.push(i);
    }

    // Calculate target instance count based on density and area
    const boundingBox = new THREE.Box3();
    const tempVec = new THREE.Vector3();
    
    for (let i = 0; i < vertexCount; i++) {
      const idx = i * 3;
      tempVec.set(positions[idx], positions[idx + 1], positions[idx + 2]);
      boundingBox.expandByPoint(tempVec);
    }

    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    const surfaceArea = size.x * size.z; // Approximate surface area
    const targetCount = Math.floor(surfaceArea * this.params.density / 10000);
    const sampleCount = Math.min(targetCount, validVertices.length);

    // Sample moss instances
    const sampledIndices = this.reservoirSample(validVertices, sampleCount);

    // Enforce minimum spacing
    const selectedIndices = this.enforceMinSpacing(sampledIndices, positions);

    for (const vertexIdx of selectedIndices) {
      const idx = vertexIdx * 3;
      const position = new THREE.Vector3(
        positions[idx],
        positions[idx + 1] + 0.001, // Slight offset to prevent z-fighting
        positions[idx + 2]
      );

      // Calculate orientation from normal
      let up: THREE.Vector3;
      if (normals) {
        up = new THREE.Vector3(
          normals[idx],
          normals[idx + 1],
          normals[idx + 2]
        ).normalize();
      } else {
        up = new THREE.Vector3(0, 1, 0);
      }

      // Create rotation quaternion
      const rotation = new THREE.Quaternion();
      rotation.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);

      // Randomize scale with noise
      const noiseValue = this.noise.noise3D(
        position.x * 2,
        position.y * 2,
        position.z * 2
      );
      
      const scaleMultiplier = 1.0 + noiseValue * this.params.scaleRandomness;
      const scale = new THREE.Vector3(
        this.params.baseScale * scaleMultiplier,
        this.params.baseScale * 0.2 * scaleMultiplier, // Flatter in Y
        this.params.baseScale * scaleMultiplier
      );

      // Calculate local density based on nearby instances
      const density = this.calculateLocalDensity(position, instances);

      instances.push({
        position,
        rotation,
        scale,
        density,
      });
    }

    return instances;
  }

  /**
   * Create instanced mesh for rendering moss patches
   */
  createInstancedMesh(
    instances: MossInstance[],
    mossGeometry: THREE.BufferGeometry,
    material: THREE.Material
  ): InstancedMesh {
    const mesh = new InstancedMesh(mossGeometry, material, instances.length);

    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      const matrix = new THREE.Matrix4();
      matrix.compose(inst.position, inst.rotation, inst.scale);
      mesh.setMatrixAt(i, matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  /**
   * Generate procedural moss patch geometry
   */
  static createMossGeometry(): THREE.BufferGeometry {
    // Create irregular blob shape for moss patch
    const geometry = new THREE.CircleGeometry(0.05, 8);
    
    // Displace vertices to create organic shape
    const positions = geometry.attributes.position.array as Float32Array;
    const noise = new SimplexNoise(Math.random() * 10000);
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const distortion = noise.noise2D(x * 10, y * 10) * 0.02;
      const scale = 1.0 + distortion;
      
      positions[i] *= scale;
      positions[i + 1] *= scale;
    }

    // Add slight height variation
    geometry.translate(0, 0, 0);
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Create moss material with transparency
   */
  static createMossMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.25 + Math.random() * 0.05, 0.6, 0.3 + Math.random() * 0.1),
      roughness: 0.9,
      metalness: 0.0,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
  }

  private enforceMinSpacing(indices: number[], positions: Float32Array): number[] {
    const result: number[] = [];
    const selectedPositions: THREE.Vector3[] = [];

    for (const idx of indices) {
      const posIdx = idx * 3;
      const position = new THREE.Vector3(
        positions[posIdx],
        positions[posIdx + 1],
        positions[posIdx + 2]
      );

      // Check distance to all previously selected positions
      let tooClose = false;
      for (const selected of selectedPositions) {
        if (position.distanceTo(selected) < this.params.minSpacing) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        result.push(idx);
        selectedPositions.push(position);
      }
    }

    return result;
  }

  private calculateLocalDensity(
    position: THREE.Vector3,
    instances: MossInstance[]
  ): number {
    let count = 0;
    const radius = 0.1;

    for (const inst of instances) {
      if (inst.position.distanceTo(position) < radius) {
        count++;
      }
    }

    return count / (Math.PI * radius * radius);
  }

  private reservoirSample<T>(array: T[], k: number): T[] {
    const result = array.slice(0, k);
    for (let i = k; i < array.length; i++) {
      const j = Math.floor(Math.random() * (i + 1));
      if (j < k) {
        result[j] = array[i];
      }
    }
    return result;
  }

  private sampleTexture(texture: THREE.DataTexture, x: number, z: number): number {
    const image = texture.image;
    if (!image) return 0.5;

    const u = ((x % 100) + 100) % 100 / 100;
    const v = ((z % 100) + 100) % 100 / 100;

    const px = Math.floor(u * image.width);
    const py = Math.floor(v * image.height);
    const idx = (py * image.width + px) * 4;

    const data = image.data;
    return data[idx] / 255;
  }
}

export default MossScatterGenerator;
