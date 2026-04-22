/**
 * TerrainGenerator.ts
 * 
 * Main terrain generation system integrating SDF, constraints, surfaces, and mesher
 * Based on Infinigen's terrain generation pipeline
 */

import { Vector3, BufferGeometry, BufferAttribute } from 'three';
import { SDF, SDFPrimitive } from '../sdf/SDF';
import { ConstraintSystem, ConstraintType } from '../constraints/ConstraintSystem';
import { SurfaceKernel, surfaceKernelRegistry, SurfaceOutput } from '../surface/SurfaceKernel';
import { Mesher, MarchingCubesMesher } from '../mesher/Mesher';
import { LODMesher } from '../mesher/LODMesher';

export interface TerrainConfig {
  worldSize: number;
  verticalScale: number;
  resolution: number;
  enableLOD: boolean;
  lodLevels: number;
  useGPU: boolean;
  seed: number;
}

export interface BiomeBlend {
  biomeId: string;
  weight: number;
  surface: SurfaceKernel<any>;
  params: Record<string, any>;
}

export class TerrainGenerator {
  private config: TerrainConfig;
  private sdf: SDF;
  private constraints: ConstraintSystem;
  private mesher: Mesher;
  private surfaceKernels: Map<string, SurfaceKernel<any>> = new Map();
  private biomeBlends: BiomeBlend[] = [];

  constructor(config?: Partial<TerrainConfig>) {
    this.config = {
      worldSize: 1000,
      verticalScale: 100,
      resolution: 128,
      enableLOD: true,
      lodLevels: 3,
      useGPU: true,
      seed: Math.floor(Math.random() * 1000000),
      ...config,
    };

    this.sdf = new SDF(this.config.seed);
    this.constraints = new ConstraintSystem();
    
    if (this.config.enableLOD) {
      this.mesher = new LODMesher({
        levels: this.config.lodLevels,
        useGPU: this.config.useGPU,
      });
    } else {
      this.mesher = new MarchingCubesMesher({
        resolution: this.config.resolution,
        useGPU: this.config.useGPU,
      });
    }

    this.registerDefaultSurfaces();
  }

  private registerDefaultSurfaces(): void {
    const defaultSurfaces = ['dirt', 'snow', 'stone', 'sand', 'ice', 'mud'];
    
    for (const name of defaultSurfaces) {
      const KernelClass = surfaceKernelRegistry.get(name);
      if (KernelClass) {
        const instance = new KernelClass();
        this.surfaceKernels.set(name, instance);
      }
    }
  }

  addSurface(name: string, weight: number, params?: Record<string, any>): void {
    let kernel = this.surfaceKernels.get(name);
    
    if (!kernel) {
      const KernelClass = surfaceKernelRegistry.get(name);
      if (!KernelClass) {
        throw new Error(`Unknown surface kernel: ${name}`);
      }
      kernel = new KernelClass();
      this.surfaceKernels.set(name, kernel);
    }

    if (params) {
      kernel.updateParams(params);
    }

    this.biomeBlends.push({
      biomeId: name,
      weight,
      surface: kernel,
      params: params || {},
    });
  }

  clearSurfaces(): void {
    this.biomeBlends = [];
  }

  addSDFPrimitive(
    type: SDFPrimitive,
    transform?: { position?: Vector3; rotation?: Vector3; scale?: Vector3 },
    operation: 'union' | 'intersection' | 'difference' = 'union'
  ): void {
    const primitive = this.sdf.createPrimitive(type);
    
    if (transform) {
      if (transform.position) primitive.setPosition(transform.position);
      if (transform.scale) primitive.setScale(transform.scale);
      if (transform.rotation) primitive.setRotation(transform.rotation);
    }

    switch (operation) {
      case 'union':
        this.sdf.union(primitive);
        break;
      case 'intersection':
        this.sdf.intersection(primitive);
        break;
      case 'difference':
        this.sdf.difference(primitive);
        break;
    }
  }

  addConstraint(type: ConstraintType, params: Record<string, any>, weight: number = 1.0): void {
    this.constraints.addConstraint(type, params, weight);
  }

  setElevationRange(minElev: number, maxElev: number, weight: number = 1.0): void {
    this.constraints.addConstraint('elevation', { min: minElev, max: maxElev }, weight);
  }

  setSlopeRange(minSlope: number, maxSlope: number, weight: number = 1.0): void {
    this.constraints.addConstraint('slope', { min: minSlope, max: maxSlope }, weight);
  }

  generate(): BufferGeometry {
    console.log('Generating terrain...');
    console.log(`  World size: ${this.config.worldSize}m`);
    console.log(`  Resolution: ${this.config.resolution}`);
    console.log(`  Surfaces: ${this.biomeBlends.length}`);
    console.log(`  Constraints: ${this.constraints.getConstraints().length}`);

    const voxels = this.buildVoxelGrid();
    this.applyConstraints(voxels);
    const geometry = this.mesher.generate(voxels, {
      worldSize: this.config.worldSize,
      verticalScale: this.config.verticalScale,
    });
    this.applySurfaces(geometry);

    console.log('Terrain generation complete!');
    console.log(`  Vertices: ${geometry.attributes.position.count}`);

    return geometry;
  }

  private buildVoxelGrid(): Float32Array {
    const resolution = this.config.resolution;
    const voxels = new Float32Array(resolution * resolution * resolution);
    const halfSize = this.config.worldSize / 2;
    const step = this.config.worldSize / resolution;

    for (let z = 0; z < resolution; z++) {
      for (let y = 0; y < resolution; y++) {
        for (let x = 0; x < resolution; x++) {
          const px = x * step - halfSize;
          const py = y * step - halfSize;
          const pz = z * step - halfSize;
          const dist = this.sdf.evaluate(new Vector3(px, py, pz));
          const index = x + y * resolution + z * resolution * resolution;
          voxels[index] = dist;
        }
      }
    }

    return voxels;
  }

  private applyConstraints(voxels: Float32Array): void {
    const constraints = this.constraints.getConstraints();
    if (constraints.length === 0) return;

    const resolution = this.config.resolution;
    const step = this.config.worldSize / resolution;
    const halfSize = this.config.worldSize / 2;

    for (let z = 0; z < resolution; z++) {
      for (let y = 0; y < resolution; y++) {
        for (let x = 0; x < resolution; x++) {
          const px = x * step - halfSize;
          const py = y * step - halfSize;
          const pz = z * step - halfSize;
          const position = new Vector3(px, py, pz);
          const normal = this.calculateNormal(voxels, x, y, z, resolution, step);

          let modification = 0;
          for (const constraint of constraints) {
            const value = this.constraints.evaluateConstraint(constraint, position, normal);
            modification += value * constraint.weight;
          }

          const index = x + y * resolution + z * resolution * resolution;
          voxels[index] += modification;
        }
      }
    }
  }

  private calculateNormal(
    voxels: Float32Array,
    x: number,
    y: number,
    z: number,
    resolution: number,
    step: number
  ): Vector3 {
    const getVoxel = (xi: number, yi: number, zi: number): number => {
      if (xi < 0 || xi >= resolution || yi < 0 || yi >= resolution || zi < 0 || zi >= resolution) {
        return 1000;
      }
      return voxels[xi + yi * resolution + zi * resolution * resolution];
    };

    const dx = getVoxel(x + 1, y, z) - getVoxel(x - 1, y, z);
    const dy = getVoxel(x, y + 1, z) - getVoxel(x, y - 1, z);
    const dz = getVoxel(x, y, z + 1) - getVoxel(x, y, z - 1);

    return new Vector3(dx, dy, dz).normalize();
  }

  private applySurfaces(geometry: BufferGeometry): void {
    if (this.biomeBlends.length === 0) {
      const dirtSurface = this.surfaceKernels.get('dirt');
      if (dirtSurface) {
        this.applySingleSurface(geometry, dirtSurface);
      }
      return;
    }

    const totalWeight = this.biomeBlends.reduce((sum, b) => sum + b.weight, 0);
    const normalizedBlends = this.biomeBlends.map(b => ({
      ...b,
      normalizedWeight: b.weight / totalWeight,
    }));

    const positions = geometry.attributes.position.array as Float32Array;
    const normals = geometry.attributes.normal.array as Float32Array;
    const colors = new Float32Array(positions.length);
    const roughness = new Float32Array(positions.length / 3);
    const metallic = new Float32Array(positions.length / 3);

    for (let i = 0; i < positions.length; i += 3) {
      const position = new Vector3(positions[i], positions[i + 1], positions[i + 2]);
      const normal = new Vector3(normals[i], normals[i + 1], normals[i + 2]);

      let finalColor = new Vector3(0, 0, 0);
      let finalRoughness = 0;
      let finalMetallic = 0;

      for (const blend of normalizedBlends) {
        const output = blend.surface.evaluate(position, normal) as SurfaceOutput;
        
        finalColor.add(output.color.clone().multiplyScalar(blend.normalizedWeight));
        finalRoughness += output.roughness * blend.normalizedWeight;
        finalMetallic += output.metallic * blend.normalizedWeight;
      }

      colors[i] = finalColor.x;
      colors[i + 1] = finalColor.y;
      colors[i + 2] = finalColor.z;
      roughness[i / 3] = finalRoughness;
      metallic[i / 3] = finalMetallic;
    }

    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.setAttribute('roughness', new BufferAttribute(roughness, 1));
    geometry.setAttribute('metallic', new BufferAttribute(metallic, 1));
  }

  private applySingleSurface(geometry: BufferGeometry, surface: SurfaceKernel<any>): void {
    const positions = geometry.attributes.position.array as Float32Array;
    const normals = geometry.attributes.normal.array as Float32Array;
    const colors = new Float32Array(positions.length);

    for (let i = 0; i < positions.length; i += 3) {
      const position = new Vector3(positions[i], positions[i + 1], positions[i + 2]);
      const normal = new Vector3(normals[i], normals[i + 1], normals[i + 2]);
      const output = surface.evaluate(position, normal) as SurfaceOutput;

      colors[i] = output.color.x;
      colors[i + 1] = output.color.y;
      colors[i + 2] = output.color.z;
    }

    geometry.setAttribute('color', new BufferAttribute(colors, 3));
  }

  getConfig(): TerrainConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<TerrainConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getAvailableSurfaces(): string[] {
    return Array.from(this.surfaceKernels.keys());
  }
}
