/**
 * Instance Scatter System for R3F/Three.js
 * Based on infinigen/core/placement/instance_scatter.py
 * 
 * Provides efficient instanced mesh scattering with density control
 */

import * as THREE from 'three';
import { AssetFactory, FactoryConfig, AssetParameters } from './factory';

export interface ScatterConfig extends FactoryConfig {
  density?: number;
  minDistance?: number;
  maxDistance?: number;
  alignToSurface?: boolean;
  randomRotation?: boolean;
  randomScale?: [number, number];
  usePOISSON?: boolean;
}

export interface ScatterPoint {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  instanceIndex: number;
}

export interface ScatterResult {
  points: ScatterPoint[];
  instances: THREE.InstancedMesh[];
  boundingBox: THREE.Box3;
}

/**
 * Poisson Disk Sampling implementation
 * Generates evenly distributed points with minimum distance constraint
 */
class PoissonDiskSampler {
  private width: number;
  private height: number;
  private radius: number;
  private k: number;
  private grid: Map<string, number>;
  private samples: Array<{ x: number; y: number }>;
  private active: number[];

  constructor(width: number, height: number, radius: number, k: number = 30) {
    this.width = width;
    this.height = height;
    this.radius = radius;
    this.k = k;
    this.grid = new Map();
    this.samples = [];
    this.active = [];
  }

  sample(): Array<{ x: number; y: number }> {
    const cellSize = this.radius / Math.sqrt(2);
    const gridWidth = Math.ceil(this.width / cellSize);
    const gridHeight = Math.ceil(this.height / cellSize);

    // Add initial sample
    this.addSample(
      Math.random() * this.width,
      Math.random() * this.height,
      gridWidth,
      cellSize
    );

    while (this.active.length > 0) {
      // Pick a random active sample
      const randIndex = Math.floor(Math.random() * this.active.length);
      const sampleIndex = this.active[randIndex];
      const sample = this.samples[sampleIndex];

      let found = false;
      for (let i = 0; i < this.k; i++) {
        // Generate point around sample
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random() * 3 + 1) * this.radius;
        const x = sample.x + Math.cos(angle) * r;
        const y = sample.y + Math.sin(angle) * r;

        // Check bounds and validity
        if (
          x >= 0 &&
          x < this.width &&
          y >= 0 &&
          y < this.height &&
          this.isValid(x, y, gridWidth, cellSize)
        ) {
          this.addSample(x, y, gridWidth, cellSize);
          found = true;
          break;
        }
      }

      if (!found) {
        this.active.splice(randIndex, 1);
      }
    }

    return this.samples;
  }

  private addSample(x: number, y: number, gridWidth: number, cellSize: number): void {
    const gridX = Math.floor(x / cellSize);
    const gridY = Math.floor(y / cellSize);
    const index = this.samples.length;

    this.samples.push({ x, y });
    this.active.push(index);
    this.grid.set(`${gridX},${gridY}`, index);
  }

  private isValid(
    x: number,
    y: number,
    gridWidth: number,
    cellSize: number
  ): boolean {
    const gridX = Math.floor(x / cellSize);
    const gridY = Math.floor(y / cellSize);

    // Check neighboring cells
    const startX = Math.max(0, gridX - 2);
    const endX = Math.min(gridWidth - 1, gridX + 2);
    const startY = Math.max(0, gridY - 2);
    const endY = Math.min(Math.ceil(this.height / cellSize) - 1, gridY + 2);

    for (let gx = startX; gx <= endX; gx++) {
      for (let gy = startY; gy <= endY; gy++) {
        const key = `${gx},${gy}`;
        const index = this.grid.get(key);
        if (index !== undefined) {
          const sample = this.samples[index];
          const dx = sample.x - x;
          const dy = sample.y - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < this.radius) {
            return false;
          }
        }
      }
    }

    return true;
  }
}

/**
 * Scatters instances across surfaces with density control
 */
export class InstanceScatter {
  private config: ScatterConfig;
  private rng: () => number;
  private factories: AssetFactory[];

  constructor(config: ScatterConfig = {}, factories: AssetFactory[] = []) {
    this.config = {
      density: 1.0,
      minDistance: 0.5,
      maxDistance: 10.0,
      alignToSurface: true,
      randomRotation: true,
      randomScale: [0.8, 1.2],
      usePOISSON: true,
      ...config,
    };

    this.factories = factories;
    
    // Initialize seeded RNG
    const seed = config.seed ?? Math.floor(Math.random() * 1e9);
    this.rng = this.createSeededRandom(seed);
  }

  /**
   * Scatter instances on a surface geometry
   */
  scatter(
    geometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    count?: number
  ): ScatterResult {
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    
    if (!positions || positions.count === 0) {
      throw new Error('Geometry has no positions');
    }

    // Calculate target count based on density
    const targetCount = count ?? Math.floor(positions.count * (this.config.density ?? 1.0));
    
    // Generate scatter points
    const points = this.generateScatterPoints(geometry, targetCount);
    
    // Create instanced meshes for each factory type
    const instances: THREE.InstancedMesh[] = [];
    
    if (this.factories.length > 0) {
      // Distribute points among factories
      const pointsPerFactory = Math.ceil(points.length / this.factories.length);
      
      for (let i = 0; i < this.factories.length; i++) {
        const factory = this.factories[i];
        const factoryPoints = points.slice(i * pointsPerFactory, (i + 1) * pointsPerFactory);
        
        if (factoryPoints.length === 0) continue;
        
        // Create placeholder or asset for this factory
        const mesh = this.createInstancedMesh(factory, factoryPoints.length, material);
        
        // Position instances
        for (let j = 0; j < factoryPoints.length; j++) {
          const point = factoryPoints[j];
          this.positionInstance(mesh, j, point);
        }
        
        instances.push(mesh);
      }
    } else {
      // Create simple instanced mesh with basic geometry
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.5),
        Array.isArray(material) ? material[0] : material,
        points.length
      );
      
      for (let i = 0; i < points.length; i++) {
        this.positionInstance(mesh, i, points[i]);
      }
      
      instances.push(mesh);
    }

    // Calculate bounding box
    const boundingBox = new THREE.Box3();
    for (const point of points) {
      boundingBox.expandByPoint(point.position);
    }

    return {
      points,
      instances,
      boundingBox,
    };
  }

  /**
   * Generate scatter points on geometry
   */
  private generateScatterPoints(
    geometry: THREE.BufferGeometry,
    count: number
  ): ScatterPoint[] {
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const points: ScatterPoint[] = [];

    if (this.config.usePOISSON && this.config.minDistance) {
      // Use Poisson disk sampling for better distribution
      points = this.poissonScatter(geometry, count);
    } else {
      // Simple random sampling
      for (let i = 0; i < count; i++) {
        const faceIndex = Math.floor(this.rng() * (positions.count / 3));
        const vertexIndex = faceIndex * 3 + Math.floor(this.rng() * 3);

        const position = new THREE.Vector3(
          positions.getX(vertexIndex),
          positions.getY(vertexIndex),
          positions.getZ(vertexIndex)
        );

        const normal = normals
          ? new THREE.Vector3(
              normals.getX(vertexIndex),
              normals.getY(vertexIndex),
              normals.getZ(vertexIndex)
            )
          : new THREE.Vector3(0, 1, 0);

        points.push(this.createScatterPoint(position, normal, i));
      }
    }

    return points;
  }

  /**
   * Poisson disk sampling on 3D surface (approximated via UV mapping)
   */
  private poissonScatter(
    geometry: THREE.BufferGeometry,
    count: number
  ): ScatterPoint[] {
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const uvs = geometry.attributes.uv;
    
    // Estimate UV bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    if (uvs) {
      for (let i = 0; i < uvs.count; i++) {
        const u = uvs.getX(i);
        const v = uvs.getY(i);
        minX = Math.min(minX, u);
        minY = Math.min(minY, v);
        maxX = Math.max(maxX, u);
        maxY = Math.max(maxY, v);
      }
    } else {
      // Fallback to position-based sampling
      minX = 0;
      minY = 0;
      maxX = 1;
      maxY = 1;
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const radius = Math.sqrt((width * height) / count) * (this.config.minDistance ?? 0.5);

    const sampler = new PoissonDiskSampler(width, height, radius, 30);
    const samples = sampler.sample();

    const points: ScatterPoint[] = [];
    const maxSamples = Math.min(samples.length, count);

    for (let i = 0; i < maxSamples; i++) {
      const sample = samples[i];
      
      // Find closest vertex to UV coordinate
      let bestDist = Infinity;
      let bestIndex = -1;

      if (uvs) {
        for (let j = 0; j < uvs.count; j++) {
          const u = uvs.getX(j);
          const v = uvs.getY(j);
          const du = u - sample.x;
          const dv = v - sample.y;
          const dist = du * du + dv * dv;
          
          if (dist < bestDist) {
            bestDist = dist;
            bestIndex = j;
          }
        }
      } else {
        bestIndex = Math.floor(this.rng() * positions.count);
      }

      if (bestIndex >= 0) {
        const position = new THREE.Vector3(
          positions.getX(bestIndex),
          positions.getY(bestIndex),
          positions.getZ(bestIndex)
        );

        const normal = normals
          ? new THREE.Vector3(
              normals.getX(bestIndex),
              normals.getY(bestIndex),
              normals.getZ(bestIndex)
            )
          : new THREE.Vector3(0, 1, 0);

        points.push(this.createScatterPoint(position, normal, i));
      }
    }

    return points;
  }

  /**
   * Create a scatter point with transformations
   */
  private createScatterPoint(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    index: number
  ): ScatterPoint {
    const rotation = new THREE.Euler();
    const scale = new THREE.Vector3();

    // Random rotation
    if (this.config.randomRotation) {
      rotation.set(
        this.rng() * Math.PI * 2,
        this.rng() * Math.PI * 2,
        this.rng() * Math.PI * 2
      );
    }

    // Align to surface normal if enabled
    if (this.config.alignToSurface) {
      const up = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normal);
      rotation.setFromQuaternion(quaternion);
    }

    // Random scale
    const [minScale, maxScale] = this.config.randomScale ?? [1, 1];
    const s = minScale + this.rng() * (maxScale - minScale);
    scale.set(s, s, s);

    return {
      position,
      normal,
      rotation,
      scale,
      instanceIndex: index,
    };
  }

  /**
   * Position an instance in the instanced mesh
   */
  private positionInstance(
    mesh: THREE.InstancedMesh,
    index: number,
    point: ScatterPoint
  ): void {
    const matrix = new THREE.Matrix4();
    
    matrix.compose(point.position, new THREE.Quaternion().setFromEuler(point.rotation), point.scale);
    
    mesh.setMatrixAt(index, matrix);
  }

  /**
   * Create instanced mesh from factory
   */
  private createInstancedMesh(
    factory: AssetFactory,
    count: number,
    material: THREE.Material | THREE.Material[]
  ): THREE.InstancedMesh {
    // Create placeholder geometry
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mat = Array.isArray(material) ? material[0] : material;
    
    return new THREE.InstancedMesh(geometry, mat, count);
  }

  /**
   * Create seeded random function
   */
  private createSeededRandom(seed: number): () => number {
    let state = seed >>> 0;
    
    return () => {
      state = Math.imul(state ^ (state >>> 15), state | 1);
      state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
      return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Update instance transforms dynamically
   */
  updateInstances(
    mesh: THREE.InstancedMesh,
    points: ScatterPoint[],
    indices?: number[]
  ): void {
    const updateIndices = indices ?? points.map((_, i) => i);
    
    for (const index of updateIndices) {
      if (index < points.length) {
        this.positionInstance(mesh, index, points[index]);
      }
    }
    
    mesh.instanceMatrix.needsUpdate = true;
  }
}

export default InstanceScatter;
