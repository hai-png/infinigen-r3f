/**
 * Infinigen R3F Port - Mushroom Scatter Generator
 * Procedural mushroom scattering on terrain surfaces
 * 
 * Based on original InfiniGen implementation from Princeton VL
 */

import * as THREE from 'three';
import { InstancedMesh } from 'three';
import { SimplexNoise } from '../util/MathUtils';

export interface MushroomInstance {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: THREE.Vector3;
  type: 'small' | 'medium' | 'large' | 'cluster';
}

export interface MushroomScatterParams {
  count: number;
  minSize: number;
  maxSize: number;
  density: number;
  moistureThreshold: number;
  shadePreference: number;
  clusterProbability: number;
  maxSlope: number;
  excludeDistance: number;
  seed?: number;
}

export class MushroomScatterGenerator {
  private noise: SimplexNoise;
  private params: MushroomScatterParams;

  constructor(params: Partial<MushroomScatterParams> = {}) {
    this.params = {
      count: 50,
      minSize: 0.1,
      maxSize: 0.5,
      density: 0.7,
      moistureThreshold: 0.3,
      shadePreference: 0.6,
      clusterProbability: 0.3,
      maxSlope: 0.8,
      excludeDistance: 0.3,
      seed: Math.random() * 10000,
      ...params,
    };

    this.noise = new SimplexNoise(this.params.seed);
  }

  /**
   * Generate mushroom instances on terrain
   */
  generate(
    terrainGeometry: THREE.BufferGeometry,
    moistureMap?: THREE.DataTexture,
    shadeMap?: THREE.DataTexture
  ): MushroomInstance[] {
    const instances: MushroomInstance[] = [];
    const positions = terrainGeometry.attributes.position.array as Float32Array;
    const normals = terrainGeometry.attributes.normal?.array as Float32Array;
    
    if (!positions || positions.length === 0) {
      return instances;
    }

    const vertexCount = positions.length / 3;
    const validVertices: number[] = [];

    // Filter vertices based on slope, moisture, and shade
    for (let i = 0; i < vertexCount; i++) {
      const idx = i * 3;
      const x = positions[idx];
      const y = positions[idx + 1];
      const z = positions[idx + 2];

      // Check slope
      if (normals) {
        const nx = normals[idx];
        const ny = normals[idx + 1];
        const nz = normals[idx + 2];
        const slope = Math.sqrt(nx * nx + ny * ny);
        
        if (slope > this.params.maxSlope) {
          continue;
        }
      }

      // Check moisture
      if (moistureMap) {
        const moisture = this.sampleTexture(moistureMap, x, z);
        if (moisture < this.params.moistureThreshold) {
          continue;
        }
      }

      // Check shade preference
      if (shadeMap) {
        const shade = this.sampleTexture(shadeMap, x, z);
        if (shade < this.params.shadePreference) {
          continue;
        }
      }

      validVertices.push(i);
    }

    // Sample mushrooms from valid vertices
    const sampleCount = Math.min(this.params.count, validVertices.length);
    const sampledIndices = this.reservoirSample(validVertices, sampleCount);

    for (const vertexIdx of sampledIndices) {
      const idx = vertexIdx * 3;
      const position = new THREE.Vector3(
        positions[idx],
        positions[idx + 1],
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

      // Randomize size
      const size = this.lerp(
        this.params.minSize,
        this.params.maxSize,
        this.noise.noise3D(position.x * 0.5, position.y * 0.5, position.z * 0.5) * 0.5 + 0.5
      );

      const scale = new THREE.Vector3(size, size, size);

      // Determine type
      const typeRoll = Math.random();
      let type: MushroomInstance['type'] = 'small';
      if (typeRoll > 0.9 && this.params.clusterProbability > 0) {
        type = 'cluster';
      } else if (typeRoll > 0.7) {
        type = 'large';
      } else if (typeRoll > 0.4) {
        type = 'medium';
      }

      instances.push({
        position,
        rotation,
        scale,
        type,
      });
    }

    // Add clusters
    if (this.params.clusterProbability > 0) {
      this.addClusters(instances, terrainGeometry);
    }

    return instances;
  }

  /**
   * Create instanced mesh for rendering
   */
  createInstancedMesh(
    instances: MushroomInstance[],
    mushroomGeometries: Map<string, THREE.BufferGeometry>,
    material: THREE.Material
  ): InstancedMesh {
    const totalInstances = instances.reduce((acc, inst) => {
      return acc + (inst.type === 'cluster' ? 5 : 1);
    }, 0);

    const mesh = new InstancedMesh(
      mushroomGeometries.get('small')!,
      material,
      totalInstances
    );

    let instanceIndex = 0;

    for (const inst of instances) {
      const geometryType = inst.type === 'cluster' ? 'small' : inst.type;
      const geometry = mushroomGeometries.get(geometryType) || mushroomGeometries.get('small')!;

      if (inst.type === 'cluster') {
        // Create cluster of 5 mushrooms
        for (let i = 0; i < 5; i++) {
          const offset = new THREE.Vector3(
            (Math.random() - 0.5) * 0.3,
            0,
            (Math.random() - 0.5) * 0.3
          );
          
          const position = inst.position.clone().add(offset);
          const scale = inst.scale.clone().multiplyScalar(0.5 + Math.random() * 0.5);
          
          const matrix = new THREE.Matrix4();
          matrix.compose(position, inst.rotation, scale);
          mesh.setMatrixAt(instanceIndex++, matrix);
        }
      } else {
        const matrix = new THREE.Matrix4();
        matrix.compose(inst.position, inst.rotation, inst.scale);
        mesh.setMatrixAt(instanceIndex++, matrix);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  /**
   * Generate procedural mushroom geometry
   */
  static createMushroomGeometry(type: 'small' | 'medium' | 'large'): THREE.BufferGeometry {
    const geometries: Map<string, THREE.BufferGeometry> = new Map();

    // Stem
    const stemHeight = type === 'large' ? 0.3 : type === 'medium' ? 0.2 : 0.1;
    const stemRadius = type === 'large' ? 0.05 : type === 'medium' ? 0.03 : 0.02;

    const stemGeometry = new THREE.CylinderGeometry(
      stemRadius * 0.8,
      stemRadius,
      stemHeight,
      8
    );
    stemGeometry.translate(0, stemHeight / 2, 0);

    // Cap
    const capRadius = type === 'large' ? 0.15 : type === 'medium' ? 0.1 : 0.05;
    const capGeometry = new THREE.SphereGeometry(capRadius, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    capGeometry.translate(0, stemHeight, 0);

    // Merge geometries
    const mergedGeometry = this.mergeGeometries([stemGeometry, capGeometry]);
    mergedGeometry.computeVertexNormals();

    geometries.set(type, mergedGeometry);

    // Cleanup
    stemGeometry.dispose();
    capGeometry.dispose();

    return mergedGeometry;
  }

  /**
   * Get all mushroom geometries
   */
  static getAllGeometries(): Map<string, THREE.BufferGeometry> {
    const geometries = new Map<string, THREE.BufferGeometry>();
    geometries.set('small', this.createMushroomGeometry('small'));
    geometries.set('medium', this.createMushroomGeometry('medium'));
    geometries.set('large', this.createMushroomGeometry('large'));
    return geometries;
  }

  private addClusters(
    instances: MushroomInstance[],
    terrainGeometry: THREE.BufferGeometry
  ): void {
    const numClusters = Math.floor(instances.length * this.params.clusterProbability * 0.2);
    const positions = terrainGeometry.attributes.position.array as Float32Array;

    for (let i = 0; i < numClusters; i++) {
      // Find existing mushroom to cluster around
      const baseIndex = Math.floor(Math.random() * instances.length);
      const base = instances[baseIndex];

      // Add 3-5 mushrooms around it
      const clusterSize = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < clusterSize; j++) {
        const angle = (j / clusterSize) * Math.PI * 2;
        const radius = 0.1 + Math.random() * 0.15;
        
        const offsetX = Math.cos(angle) * radius;
        const offsetZ = Math.sin(angle) * radius;

        // Find height at new position (simplified)
        const newPosition = base.position.clone();
        newPosition.x += offsetX;
        newPosition.z += offsetZ;

        const rotation = base.rotation.clone();
        const scale = base.scale.clone().multiplyScalar(0.6 + Math.random() * 0.4);

        instances.push({
          position: newPosition,
          rotation,
          scale,
          type: 'small',
        });
      }
    }
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

  private lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t;
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

  private static mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    return THREE.BufferGeometryUtils ? 
      THREE.BufferGeometryUtils.mergeGeometries(geometries) :
      this.simpleMergeGeometries(geometries);
  }

  private static simpleMergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    const mergedGeometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const normals: number[] = [];

    for (const geo of geometries) {
      const pos = geo.attributes.position.array as Float32Array;
      const norm = geo.attributes.normal?.array as Float32Array;

      positions.push(...Array.from(pos));
      if (norm) {
        normals.push(...Array.from(norm));
      }
    }

    mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (normals.length > 0) {
      mergedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    }

    return mergedGeometry;
  }
}

export default MushroomScatterGenerator;
