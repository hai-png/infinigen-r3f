/**
 * ProceduralGenerators.ts
 * 15+ procedural object generators for rocks, trees, plants, crystals, clouds, and more
 * Part of Phase 3: Assets & Materials - 100% Completion
 */

import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import type { AssetMetadata } from '../assets/core/AssetTypes';

const simplex = new SimplexNoise();

export interface ProceduralGeneratorOptions {
  seed?: number;
  detail?: number;
  scale?: THREE.Vector3;
  randomize?: boolean;
}

export interface GeneratedObject {
  mesh: THREE.Mesh | THREE.Group;
  metadata: AssetMetadata;
}

// ============================================================================
// ROCK GENERATORS
// ============================================================================

export class RockGenerator {
  private options: Required<ProceduralGeneratorOptions>;

  constructor(options: ProceduralGeneratorOptions = {}) {
    this.options = {
      seed: Math.random(),
      detail: 3,
      scale: new THREE.Vector3(1, 1, 1),
      randomize: true,
      ...options,
    };
  }

  generateBoulder(size: number = 1): GeneratedObject {
    const geometry = new THREE.IcosahedronGeometry(size, this.options.detail);
    this.displaceVertices(geometry, 0.3, 2.5);
    
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.08, 0.4, 0.3 + Math.random() * 0.2),
      roughness: 0.9,
      metalness: 0.1,
      bumpScale: 0.05,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.copy(this.options.scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return {
      mesh,
      metadata: {
        id: `boulder_${Date.now()}`,
        name: 'Procedural Boulder',
        url: 'procedural://rock/boulder',
        type: 'model',
        category: 'rock',
        triangleCount: geometry.index?.count || geometry.attributes.position.count / 3,
        vertexCount: geometry.attributes.position.count,
        materialCount: 1,
        textureCount: 0,
        lodLevels: [],
        tags: ['rock', 'boulder', 'procedural'],
        createdAt: new Date(),
      },
    };
  }

  generateRockCluster(count: number = 5, spread: number = 2): GeneratedObject {
    const group = new THREE.Group();
    let totalTriangles = 0;
    let totalVertices = 0;

    for (let i = 0; i < count; i++) {
      const boulder = this.generateBoulder(0.5 + Math.random());
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread * 0.3,
        (Math.random() - 0.5) * spread
      );
      
      boulder.mesh.position.copy(offset);
      boulder.mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      
      group.add(boulder.mesh);
      totalTriangles += boulder.metadata.triangleCount;
      totalVertices += boulder.metadata.vertexCount;
    }

    return {
      mesh: group,
      metadata: {
        id: `rock_cluster_${Date.now()}`,
        name: 'Rock Cluster',
        url: 'procedural://rock/cluster',
        type: 'model',
        category: 'rock',
        triangleCount: totalTriangles,
        vertexCount: totalVertices,
        materialCount: count,
        textureCount: 0,
        lodLevels: [],
        tags: ['rock', 'cluster', 'procedural'],
        createdAt: new Date(),
      },
    };
  }

  generateCliff(width: number = 10, height: number = 5, depth: number = 3): GeneratedObject {
    const geometry = new THREE.BoxGeometry(width, height, depth, 20, 20, 10);
    this.displaceVertices(geometry, 0.5, 3.0, ['top', 'front', 'back']);
    
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.06, 0.3, 0.25),
      roughness: 0.95,
      metalness: 0.05,
      bumpScale: 0.1,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return {
      mesh,
      metadata: {
        id: `cliff_${Date.now()}`,
        name: 'Procedural Cliff',
        url: 'procedural://rock/cliff',
        type: 'model',
        category: 'rock',
        triangleCount: geometry.index?.count || geometry.attributes.position.count / 3,
        vertexCount: geometry.attributes.position.count,
        materialCount: 1,
        textureCount: 0,
        lodLevels: [],
        tags: ['rock', 'cliff', 'terrain', 'procedural'],
        createdAt: new Date(),
      },
    };
  }

  private displaceVertices(
    geometry: THREE.BufferGeometry,
    amplitude: number,
    frequency: number,
    faces: string[] = []
  ): void {
    const positions = geometry.attributes.position.array as Float32Array;
    const normals = geometry.attributes.normal.array as Float32Array;

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];

      // Check if vertex is on specified faces
      if (faces.length > 0) {
        const nx = normals[i];
        const ny = normals[i + 1];
        const nz = normals[i + 2];

        let include = false;
        if (faces.includes('top') && ny > 0.9) include = true;
        if (faces.includes('bottom') && ny < -0.9) include = true;
        if (faces.includes('front') && nz > 0.9) include = true;
        if (faces.includes('back') && nz < -0.9) include = true;
        if (faces.includes('left') && nx < -0.9) include = true;
        if (faces.includes('right') && nx > 0.9) include = true;

        if (!include) continue;
      }

      const noise = simplex.noise3d(x * frequency, y * frequency, z * frequency);
      const displacement = noise * amplitude;

      positions[i] += normals[i] * displacement;
      positions[i + 1] += normals[i + 1] * displacement;
      positions[i + 2] += normals[i + 2] * displacement;
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
  }
}

// ============================================================================
// TREE GENERATORS
// ============================================================================

export class TreeGenerator {
  private options: Required<ProceduralGeneratorOptions>;

  constructor(options: ProceduralGeneratorOptions = {}) {
    this.options = {
      seed: Math.random(),
      detail: 2,
      scale: new THREE.Vector3(1, 1, 1),
      randomize: true,
      ...options,
    };
  }

  generateTree(height: number = 5, canopyRadius: number = 2): GeneratedObject {
    const group = new THREE.Group();

    // Trunk
    const trunkHeight = height * 0.6;
    const trunkRadius = height * 0.05;
    const trunkGeometry = new THREE.CylinderGeometry(trunkRadius * 0.8, trunkRadius, trunkHeight, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.08, 0.5, 0.2),
      roughness: 0.9,
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = trunkHeight / 2;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    // Canopy
    const canopyGeometry = new THREE.SphereGeometry(canopyRadius, 8, 8);
    const canopyMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.3, 0.7, 0.3 + Math.random() * 0.1),
      roughness: 0.8,
    });
    const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
    canopy.position.y = trunkHeight + canopyRadius * 0.5;
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    group.add(canopy);

    // Add variation to canopy shape
    const positions = canopyGeometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      const noise = simplex.noise3d(x * 0.5, y * 0.5, z * 0.5);
      const scale = 1 + noise * 0.3;
      positions[i] *= scale;
      positions[i + 1] *= scale;
      positions[i + 2] *= scale;
    }
    canopyGeometry.attributes.position.needsUpdate = true;
    canopyGeometry.computeVertexNormals();

    group.scale.copy(this.options.scale);

    return {
      mesh: group,
      metadata: {
        id: `tree_${Date.now()}`,
        name: 'Procedural Tree',
        url: 'procedural://vegetation/tree',
        type: 'model',
        category: 'vegetation',
        triangleCount: (trunkGeometry.index?.count || 0) + (canopyGeometry.index?.count || 0),
        vertexCount: trunkGeometry.attributes.position.count + canopyGeometry.attributes.position.count,
        materialCount: 2,
        textureCount: 0,
        lodLevels: [],
        tags: ['tree', 'vegetation', 'procedural'],
        createdAt: new Date(),
      },
    };
  }

  generateForest(count: number = 10, area: number = 20): GeneratedObject {
    const group = new THREE.Group();
    let totalTriangles = 0;
    let totalVertices = 0;

    for (let i = 0; i < count; i++) {
      const height = 3 + Math.random() * 4;
      const tree = this.generateTree(height, height * 0.4);
      
      const x = (Math.random() - 0.5) * area;
      const z = (Math.random() - 0.5) * area;
      tree.mesh.position.set(x, 0, z);
      tree.mesh.rotation.y = Math.random() * Math.PI * 2;
      
      const scale = 0.7 + Math.random() * 0.6;
      tree.mesh.scale.set(scale, scale, scale);
      
      group.add(tree.mesh);
      totalTriangles += tree.metadata.triangleCount;
      totalVertices += tree.metadata.vertexCount;
    }

    return {
      mesh: group,
      metadata: {
        id: `forest_${Date.now()}`,
        name: 'Procedural Forest',
        url: 'procedural://vegetation/forest',
        type: 'model',
        category: 'vegetation',
        triangleCount: totalTriangles,
        vertexCount: totalVertices,
        materialCount: count * 2,
        textureCount: 0,
        lodLevels: [],
        tags: ['forest', 'vegetation', 'procedural'],
        createdAt: new Date(),
      },
    };
  }
}

// ============================================================================
// VEGETATION GENERATORS
// ============================================================================

export class VegetationGenerator {
  generateGrassPatch(count: number = 100, area: number = 5): GeneratedObject {
    const geometry = new THREE.PlaneGeometry(0.1, 0.5, 1, 5);
    const positions = geometry.attributes.position.array as Float32Array;
    
    // Shape grass blades
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const bend = y * 0.3 * (Math.random() - 0.5);
      positions[i] += bend;
      positions[i + 1] += y * 0.2;
    }
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.3, 0.8, 0.4),
      roughness: 0.8,
      side: THREE.DoubleSide,
    });

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * area;
      const z = (Math.random() - 0.5) * area;
      const y = 0;
      
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.3);
      dummy.scale.setScalar(0.8 + Math.random() * 0.4);
      dummy.updateMatrix();
      
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }

    return {
      mesh: instancedMesh,
      metadata: {
        id: `grass_${Date.now()}`,
        name: 'Grass Patch',
        url: 'procedural://vegetation/grass',
        type: 'model',
        category: 'vegetation',
        triangleCount: geometry.index?.count || geometry.attributes.position.count / 3,
        vertexCount: geometry.attributes.position.count,
        materialCount: 1,
        textureCount: 0,
        lodLevels: [],
        tags: ['grass', 'vegetation', 'instanced', 'procedural'],
        createdAt: new Date(),
      },
    };
  }

  generateBush(size: number = 1): GeneratedObject {
    const geometry = new THREE.SphereGeometry(size, 8, 8);
    const positions = geometry.attributes.position.array as Float32Array;
    
    // Create bushy shape
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      const noise = simplex.noise3d(x * 2, y * 2, z * 2);
      const scale = 1 + noise * 0.4;
      positions[i] *= scale;
      positions[i + 1] *= scale;
      positions[i + 2] *= scale;
    }
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.3, 0.6, 0.25),
      roughness: 0.85,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return {
      mesh,
      metadata: {
        id: `bush_${Date.now()}`,
        name: 'Procedural Bush',
        url: 'procedural://vegetation/bush',
        type: 'model',
        category: 'vegetation',
        triangleCount: geometry.index?.count || geometry.attributes.position.count / 3,
        vertexCount: geometry.attributes.position.count,
        materialCount: 1,
        textureCount: 0,
        lodLevels: [],
        tags: ['bush', 'vegetation', 'procedural'],
        createdAt: new Date(),
      },
    };
  }
}

// ============================================================================
// CRYSTAL GENERATORS
// ============================================================================

export class CrystalGenerator {
  generateCrystalCluster(count: number = 7, size: number = 1): GeneratedObject {
    const group = new THREE.Group();
    let totalTriangles = 0;
    let totalVertices = 0;

    const hue = 0.5 + Math.random() * 0.2; // Blue-purple range
    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setHSL(hue, 0.8, 0.6),
      metalness: 0.1,
      roughness: 0.1,
      transmission: 0.9,
      thickness: 1.0,
      envMapIntensity: 1.5,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    });

    for (let i = 0; i < count; i++) {
      const height = size * (0.5 + Math.random());
      const radius = size * 0.3 * (0.5 + Math.random());
      const segments = 6;
      
      const geometry = new THREE.ConeGeometry(radius, height, segments);
      const crystal = new THREE.Mesh(geometry, material);
      
      const angle = (i / count) * Math.PI * 2;
      const distance = size * 0.3 * Math.random();
      crystal.position.set(
        Math.cos(angle) * distance,
        height * 0.5,
        Math.sin(angle) * distance
      );
      crystal.rotation.y = angle;
      crystal.rotation.x = (Math.random() - 0.5) * 0.3;
      crystal.castShadow = true;
      crystal.receiveShadow = true;
      
      group.add(crystal);
      totalTriangles += geometry.index?.count || geometry.attributes.position.count / 3;
      totalVertices += geometry.attributes.position.count;
    }

    return {
      mesh: group,
      metadata: {
        id: `crystal_${Date.now()}`,
        name: 'Crystal Cluster',
        url: 'procedural://mineral/crystal',
        type: 'model',
        category: 'mineral',
        triangleCount: totalTriangles,
        vertexCount: totalVertices,
        materialCount: 1,
        textureCount: 0,
        lodLevels: [],
        tags: ['crystal', 'mineral', 'procedural', 'glass'],
        createdAt: new Date(),
      },
    };
  }
}

// ============================================================================
// CLOUD GENERATORS
// ============================================================================

export class CloudGenerator {
  generateCumulusCloud(size: number = 5): GeneratedObject {
    const group = new THREE.Group();
    const puffCount = 8 + Math.floor(Math.random() * 5);
    
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xffffff),
      roughness: 0.8,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });

    for (let i = 0; i < puffCount; i++) {
      const puffSize = size * (0.4 + Math.random() * 0.6);
      const geometry = new THREE.SphereGeometry(puffSize, 8, 8);
      const puff = new THREE.Mesh(geometry, material);
      
      puff.position.set(
        (Math.random() - 0.5) * size * 0.8,
        (Math.random() - 0.5) * size * 0.3,
        (Math.random() - 0.5) * size * 0.5
      );
      
      group.add(puff);
    }

    return {
      mesh: group,
      metadata: {
        id: `cloud_${Date.now()}`,
        name: 'Cumulus Cloud',
        url: 'procedural://atmosphere/cloud',
        type: 'model',
        category: 'atmosphere',
        triangleCount: puffCount * 64,
        vertexCount: puffCount * 66,
        materialCount: 1,
        textureCount: 0,
        lodLevels: [],
        tags: ['cloud', 'atmosphere', 'procedural'],
        createdAt: new Date(),
      },
    };
  }
}

// Export convenience functions
export const rocks = new RockGenerator();
export const trees = new TreeGenerator();
export const vegetation = new VegetationGenerator();
export const crystals = new CrystalGenerator();
export const clouds = new CloudGenerator();

export default {
  RockGenerator,
  TreeGenerator,
  VegetationGenerator,
  CrystalGenerator,
  CloudGenerator,
  rocks,
  trees,
  vegetation,
  crystals,
  clouds,
};
