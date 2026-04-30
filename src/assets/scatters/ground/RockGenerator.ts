/**
 * RockGenerator - Procedural rock scattering for terrain
 * 
 * Generates realistic rock distributions including:
 * - Boulders and large rocks
 * - Gravel and small stones
 * - Rock clusters and formations
 * - Erosion-based placement
 * 
 * Ported from: infinigen/scatter/ground/rock_generator.py
 */

import * as THREE from 'three';
import { NoiseUtils } from '../../../terrain/utils/NoiseUtils';

export interface RockConfig {
  seed: number;
  boulderDensity: number; // Large rocks per square km
  gravelDensity: number; // Small rocks per square meter
  clusterProbability: number; // Chance of rock clusters
  clusterSize: [number, number]; // Min/max rocks per cluster
  sizeVariation: number; // Size variation factor
  altitudeRange: [number, number]; // Valid altitude range
  slopePreference: number; // Preference for slopes (0=flat, 1=steep)
  erosionFactor: number; // How much erosion affects placement
  rockTypes: RockType[]; // Available rock types
}

export interface RockType {
  name: string;
  colorBase: THREE.Color;
  colorVariation: THREE.Color;
  roughness: number;
  metalness: number;
  scaleMin: number;
  scaleMax: number;
}

export interface RockInstance {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  type: RockType;
  isCluster: boolean;
  clusterId?: number;
}

const DEFAULT_ROCK_TYPES: RockType[] = [
  {
    name: 'granite',
    colorBase: new THREE.Color(0.6, 0.55, 0.5),
    colorVariation: new THREE.Color(0.1, 0.08, 0.06),
    roughness: 0.8,
    metalness: 0.1,
    scaleMin: 0.5,
    scaleMax: 3.0,
  },
  {
    name: 'limestone',
    colorBase: new THREE.Color(0.75, 0.73, 0.7),
    colorVariation: new THREE.Color(0.08, 0.07, 0.06),
    roughness: 0.7,
    metalness: 0.05,
    scaleMin: 0.3,
    scaleMax: 2.5,
  },
  {
    name: 'basalt',
    colorBase: new THREE.Color(0.25, 0.23, 0.22),
    colorVariation: new THREE.Color(0.05, 0.04, 0.04),
    roughness: 0.9,
    metalness: 0.15,
    scaleMin: 0.4,
    scaleMax: 2.0,
  },
  {
    name: 'sandstone',
    colorBase: new THREE.Color(0.76, 0.7, 0.5),
    colorVariation: new THREE.Color(0.1, 0.08, 0.05),
    roughness: 0.85,
    metalness: 0.05,
    scaleMin: 0.3,
    scaleMax: 2.5,
  },
];

export class RockGenerator {
  private config: RockConfig;
  private noise: NoiseUtils;

  constructor(config?: Partial<RockConfig>) {
    this.config = {
      seed: Math.random() * 10000,
      boulderDensity: 10, // per square km
      gravelDensity: 2, // per square meter
      clusterProbability: 0.3,
      clusterSize: [3, 8],
      sizeVariation: 0.4,
      altitudeRange: [-50, 3000],
      slopePreference: 0.5,
      erosionFactor: 0.6,
      rockTypes: DEFAULT_ROCK_TYPES,
      ...config,
    };

    this.noise = new NoiseUtils(this.config.seed);
  }

  /**
   * Generate rock instances over terrain
   */
  generate(
    positions: THREE.Vector3[],
    normals: THREE.Vector3[],
    heights: Float32Array,
    resolution: number,
    worldSize: number,
    erosionMap?: Float32Array
  ): RockInstance[] {
    const instances: RockInstance[] = [];
    const totalArea = worldSize * worldSize;
    const areaKm2 = totalArea / 1_000_000;

    // Calculate expected counts
    const expectedBoulders = Math.floor(this.config.boulderDensity * areaKm2);
    const expectedGravel = Math.floor(this.config.gravelDensity * totalArea);

    // Generate boulders
    for (let i = 0; i < expectedBoulders; i++) {
      const instance = this.generateBoulder(
        positions,
        normals,
        heights,
        resolution,
        worldSize,
        erosionMap
      );
      if (instance) {
        instances.push(instance);
      }
    }

    // Generate gravel
    const gravelInstances = this.generateGravel(
      positions,
      normals,
      heights,
      resolution,
      worldSize,
      erosionMap
    );
    instances.push(...gravelInstances);

    // Generate rock clusters
    const clusterInstances = this.generateClusters(
      positions,
      normals,
      heights,
      resolution,
      worldSize,
      erosionMap
    );
    instances.push(...clusterInstances);

    return instances;
  }

  /**
   * Generate a single boulder
   */
  private generateBoulder(
    positions: THREE.Vector3[],
    normals: THREE.Vector3[],
    heights: Float32Array,
    resolution: number,
    worldSize: number,
    erosionMap?: Float32Array
  ): RockInstance | null {
    // Random sample position
    const gridX = Math.floor(Math.random() * resolution);
    const gridZ = Math.floor(Math.random() * resolution);

    if (gridX >= resolution || gridZ >= resolution) return null;

    const idx = gridZ * resolution + gridX;
    const height = heights[idx];

    // Check altitude range
    if (height < this.config.altitudeRange[0] ||
        height > this.config.altitudeRange[1]) {
      return null;
    }

    // Get world position
    const worldX = (gridX / resolution) * worldSize - worldSize / 2;
    const worldZ = (gridZ / resolution) * worldSize - worldSize / 2;

    // Find nearest position
    const posIndex = this.findNearestPosition(worldX, worldZ, positions);
    if (posIndex === -1) return null;

    const position = positions[posIndex];
    const normal = normals[posIndex];

    // Check slope preference
    const slope = Math.acos(normal.y);
    const slopePreference = this.evaluateSlopePreference(slope);
    if (Math.random() > slopePreference) return null;

    // Consider erosion factor
    if (erosionMap) {
      const erosion = erosionMap[idx];
      if (erosion > 0.7 && Math.random() > 0.3) {
        // High erosion areas have fewer exposed rocks
        return null;
      }
    }

    // Select rock type
    const rockType = this.selectRockType(worldX, worldZ, height);

    // Calculate size with variation
    const baseScale = THREE.MathUtils.lerp(
      rockType.scaleMin,
      rockType.scaleMax,
      this.noise.perlin2D(worldX * 0.01, worldZ * 0.01) * 0.5 + 0.5
    );

    const variation = 1 + (Math.random() - 0.5) * this.config.sizeVariation;
    const scale = baseScale * variation;

    // Calculate rotation
    const rotation = this.calculateRotation(normal);

    return {
      position: position.clone(),
      rotation,
      scale: new THREE.Vector3(scale, scale * 0.6, scale),
      type: rockType,
      isCluster: false,
    };
  }

  /**
   * Generate gravel (small rocks)
   */
  private generateGravel(
    positions: THREE.Vector3[],
    normals: THREE.Vector3[],
    heights: Float32Array,
    resolution: number,
    worldSize: number,
    erosionMap?: Float32Array
  ): RockInstance[] {
    const instances: RockInstance[] = [];
    const sampleInterval = Math.max(1, Math.floor(resolution / 100));

    for (let z = 0; z < resolution; z += sampleInterval) {
      for (let x = 0; x < resolution; x += sampleInterval) {
        const idx = z * resolution + x;
        const height = heights[idx];

        if (height < this.config.altitudeRange[0] ||
            height > this.config.altitudeRange[1]) {
          continue;
        }

        // Use noise for gravel distribution
        const worldX = (x / resolution) * worldSize - worldSize / 2;
        const worldZ = (z / resolution) * worldSize - worldSize / 2;

        const noiseValue = this.noise.perlin2D(worldX * 0.05, worldZ * 0.05);
        
        // Gravel density varies with noise
        const localDensity = this.config.gravelDensity * (0.5 + noiseValue);
        const numGravel = Math.floor(localDensity * sampleInterval * sampleInterval);

        for (let g = 0; g < numGravel; g++) {
          const offsetX = Math.random() * sampleInterval;
          const offsetZ = Math.random() * sampleInterval;
          
          const sampleX = Math.min(resolution - 1, x + offsetX);
          const sampleZ = Math.min(resolution - 1, z + offsetZ);
          
          const sampleIdx = Math.floor(sampleZ) * resolution + Math.floor(sampleX);
          const sampleHeight = heights[sampleIdx];

          if (sampleHeight < this.config.altitudeRange[0] ||
              sampleHeight > this.config.altitudeRange[1]) {
            continue;
          }

          const sampleWorldX = (sampleX / resolution) * worldSize - worldSize / 2;
          const sampleWorldZ = (sampleZ / resolution) * worldSize - worldSize / 2;

          const posIndex = this.findNearestPosition(sampleWorldX, sampleWorldZ, positions);
          if (posIndex === -1) continue;

          const position = positions[posIndex];
          const normal = normals[posIndex];

          const rockType = this.selectRockType(sampleWorldX, sampleWorldZ, sampleHeight);
          const scale = THREE.MathUtils.lerp(0.05, 0.3, Math.random());

          const rotation = this.calculateRotation(normal);

          instances.push({
            position: position.clone(),
            rotation,
            scale: new THREE.Vector3(scale, scale * 0.5, scale),
            type: rockType,
            isCluster: false,
          });
        }
      }
    }

    return instances;
  }

  /**
   * Generate rock clusters
   */
  private generateClusters(
    positions: THREE.Vector3[],
    normals: THREE.Vector3[],
    heights: Float32Array,
    resolution: number,
    worldSize: number,
    erosionMap?: Float32Array
  ): RockInstance[] {
    const instances: RockInstance[] = [];
    const numClusters = Math.floor(
      this.config.boulderDensity * 0.1 * this.config.clusterProbability
    );

    let clusterId = 0;

    for (let c = 0; c < numClusters; c++) {
      // Find cluster center
      const centerX = Math.floor(Math.random() * resolution);
      const centerZ = Math.floor(Math.random() * resolution);
      const centerIdx = centerZ * resolution + centerX;

      const centerHeight = heights[centerIdx];
      if (centerHeight < this.config.altitudeRange[0] ||
          centerHeight > this.config.altitudeRange[1]) {
        continue;
      }

      const worldCenterX = (centerX / resolution) * worldSize - worldSize / 2;
      const worldCenterZ = (centerZ / resolution) * worldSize - worldSize / 2;

      const posIndex = this.findNearestPosition(worldCenterX, worldCenterZ, positions);
      if (posIndex === -1) continue;

      const centerPosition = positions[posIndex];
      const centerNormal = normals[posIndex];

      // Determine cluster size
      const clusterSize = Math.floor(
        THREE.MathUtils.lerp(
          this.config.clusterSize[0],
          this.config.clusterSize[1],
          Math.random()
        )
      );

      // Select rock type for cluster
      const rockType = this.selectRockType(worldCenterX, worldCenterZ, centerHeight);

      // Generate rocks in cluster
      for (let r = 0; r < clusterSize; r++) {
        // Offset from center
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 3;
        const offsetX = Math.cos(angle) * radius;
        const offsetZ = Math.sin(angle) * radius;

        const sampleX = Math.floor(centerX + offsetX);
        const sampleZ = Math.floor(centerZ + offsetZ);

        if (sampleX < 0 || sampleX >= resolution ||
            sampleZ < 0 || sampleZ >= resolution) {
          continue;
        }

        const sampleIdx = sampleZ * resolution + sampleX;
        const sampleHeight = heights[sampleIdx];

        if (sampleHeight < this.config.altitudeRange[0] ||
            sampleHeight > this.config.altitudeRange[1]) {
          continue;
        }

        const sampleWorldX = (sampleX / resolution) * worldSize - worldSize / 2;
        const sampleWorldZ = (sampleZ / resolution) * worldSize - worldSize / 2;

        const samplePosIndex = this.findNearestPosition(
          sampleWorldX, sampleWorldZ, positions
        );
        if (samplePosIndex === -1) continue;

        const position = positions[samplePosIndex];
        const normal = normals[samplePosIndex];

        const scale = THREE.MathUtils.lerp(
          rockType.scaleMin * 0.5,
          rockType.scaleMax * 0.8,
          Math.random()
        );

        const rotation = this.calculateRotation(normal);

        instances.push({
          position: position.clone(),
          rotation,
          scale: new THREE.Vector3(scale, scale * 0.6, scale),
          type: rockType,
          isCluster: true,
          clusterId,
        });
      }

      clusterId++;
    }

    return instances;
  }

  /**
   * Evaluate slope preference score
   */
  private evaluateSlopePreference(slope: number): number {
    // Convert slope preference to weight
    // 0 = prefer flat, 1 = prefer steep
    const normalizedSlope = slope / (Math.PI / 2);
    
    if (this.config.slopePreference < 0.5) {
      // Prefer flatter areas
      return 1 - normalizedSlope * (1 - this.config.slopePreference * 2);
    } else {
      // Prefer steeper areas
      return normalizedSlope * (this.config.slopePreference * 2 - 1);
    }
  }

  /**
   * Select rock type based on position and height
   */
  private selectRockType(
    x: number,
    z: number,
    height: number
  ): RockType {
    // Use noise to determine rock type distribution
    const noiseValue = this.noise.perlin2D(x * 0.001, z * 0.001);
    
    // Height-based selection
    if (height > 2000) {
      // High altitude: more granite
      return this.config.rockTypes[0];
    } else if (height < 100) {
      // Low altitude: more sandstone/limestone
      return this.config.rockTypes[Math.floor(noiseValue * 2) + 1];
    } else {
      // Mid altitude: mixed
      const index = Math.floor(noiseValue * this.config.rockTypes.length);
      return this.config.rockTypes[index % this.config.rockTypes.length];
    }
  }

  /**
   * Calculate rotation aligned with surface normal
   */
  private calculateRotation(normal: THREE.Vector3): THREE.Euler {
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(up, normal);
    const euler = new THREE.Euler().setFromQuaternion(quaternion);

    // Add random rotation around normal
    euler.z += Math.random() * Math.PI * 2;

    // Add slight tilt for natural look
    euler.x += (Math.random() - 0.5) * 0.2;
    euler.y += (Math.random() - 0.5) * 0.2;

    return euler;
  }

  /**
   * Find nearest position from array
   */
  private findNearestPosition(
    x: number,
    z: number,
    positions: THREE.Vector3[]
  ): number {
    let minDist = Infinity;
    let nearestIndex = -1;

    for (let i = 0; i < positions.length; i++) {
      const dx = positions[i].x - x;
      const dz = positions[i].z - z;
      const dist = dx * dx + dz * dz;

      if (dist < minDist) {
        minDist = dist;
        nearestIndex = i;
      }
    }

    return minDist < 2.0 ? nearestIndex : -1;
  }

  /**
   * Create instanced mesh for rendering
   */
  createInstancedMesh(
    instances: RockInstance[],
    geometry: THREE.BufferGeometry,
    material: THREE.Material
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
    const matrix = new THREE.Matrix4();

    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i];

      matrix.makeRotationFromEuler(instance.rotation);
      matrix.scale(instance.scale);
      matrix.setPosition(instance.position);

      mesh.setMatrixAt(i, matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RockConfig>): void {
    this.config = { ...this.config, ...config };
    this.noise = new NoiseUtils(this.config.seed);
  }

  /**
   * Get current configuration
   */
  getConfig(): RockConfig {
    return { ...this.config };
  }
}

export default RockGenerator;
