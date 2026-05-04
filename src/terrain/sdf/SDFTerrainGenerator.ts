/**
 * SDF Terrain Generator
 *
 * Generates terrain using 3D Signed Distance Fields instead of heightmaps.
 * This is the core approach used by the original Princeton Infinigen:
 * terrain is an implicit surface (SDF) extracted via Marching Cubes.
 *
 * Features:
 * - Base terrain from 3D noise density field
 * - Caves carved as tunnel SDFs (cylinders along noise-guided paths)
 * - Overhangs via SDF boolean difference with eroded shapes
 * - Arches via SDF union of torus sections
 * - All composed using SDF boolean operations, then extracted via extractIsosurface()
 */

import * as THREE from 'three';
import { SignedDistanceField, extractIsosurface, sdfBoolean, sdfSmoothUnion, sdfOffset } from './sdf-operations';
import { NoiseUtils } from '@/core/util/math/noise';
import { SeededRandom } from '../../core/util/MathUtils';
import {
  TerrainSurfaceShaderPipeline,
  TerrainSurfaceConfig,
  DEFAULT_TERRAIN_SURFACE_CONFIG,
} from '../gpu/TerrainSurfaceShaderPipeline';

/**
 * Configuration for SDF terrain generation
 */
export interface SDFTerrainConfig {
  /** Random seed for reproducibility */
  seed: number;
  /** World-space bounds of the terrain volume */
  bounds: THREE.Box3;
  /** Voxel resolution (size of each voxel in world units) */
  resolution: number;
  /** Base terrain amplitude */
  amplitude: number;
  /** Noise frequency for base terrain */
  frequency: number;
  /** Number of noise octaves for base terrain */
  octaves: number;
  /** Lacunarity for fbm */
  lacunarity: number;
  /** Persistence for fbm */
  persistence: number;
  /** Whether to add caves */
  enableCaves: boolean;
  /** Number of cave tunnels to generate */
  caveCount: number;
  /** Cave tunnel radius range */
  caveRadiusRange: [number, number];
  /** Whether to add overhangs */
  enableOverhangs: boolean;
  /** Overhang intensity (0-1) */
  overhangIntensity: number;
  /** Whether to add arches */
  enableArches: boolean;
  /** Number of arches to generate */
  archCount: number;
  /** Material color for the terrain mesh */
  color: number;
  /** Material roughness */
  roughness: number;
  /** Smooth blend factor for boolean unions */
  smoothBlend: number;
  /** Configuration for the GPU surface shader displacement pipeline */
  surfaceShader: TerrainSurfaceConfig;
}

/**
 * Default SDF terrain configuration
 */
export const DEFAULT_SDF_TERRAIN_CONFIG: Partial<SDFTerrainConfig> = {
  seed: 42,
  resolution: 0.5,
  amplitude: 8,
  frequency: 0.02,
  octaves: 6,
  lacunarity: 2.0,
  persistence: 0.5,
  enableCaves: true,
  caveCount: 5,
  caveRadiusRange: [1.0, 3.0],
  enableOverhangs: true,
  overhangIntensity: 0.5,
  enableArches: true,
  archCount: 3,
  color: 0x8b7355,
  roughness: 0.9,
  smoothBlend: 0.3,
  surfaceShader: { ...DEFAULT_TERRAIN_SURFACE_CONFIG },
};

/**
 * Represents a cave tunnel segment
 */
interface CaveTunnel {
  /** Start point of the tunnel in world space */
  start: THREE.Vector3;
  /** End point of the tunnel in world space */
  end: THREE.Vector3;
  /** Radius of the tunnel */
  radius: number;
}

/**
 * Represents an arch shape
 */
interface ArchShape {
  /** Center of the arch base */
  center: THREE.Vector3;
  /** Major radius (arch width / 2) */
  majorRadius: number;
  /** Minor radius (tube thickness) */
  minorRadius: number;
  /** Rotation around Y axis */
  rotation: number;
}

/**
 * SDF Terrain Generator
 *
 * Generates full 3D terrain with caves, overhangs, and arches
 * using the SDF + Marching Cubes pipeline.
 */
export class SDFTerrainGenerator {
  private config: SDFTerrainConfig;
  private rng: SeededRandom;
  private noise: NoiseUtils;
  private surfaceShaderPipeline: TerrainSurfaceShaderPipeline | null = null;

  constructor(config: Partial<SDFTerrainConfig> = {}) {
    this.config = { ...DEFAULT_SDF_TERRAIN_CONFIG, ...config } as SDFTerrainConfig;

    // Ensure bounds are set
    if (!this.config.bounds) {
      this.config.bounds = new THREE.Box3(
        new THREE.Vector3(-50, -10, -50),
        new THREE.Vector3(50, 30, 50)
      );
    }

    // Ensure surface shader config is set
    if (!this.config.surfaceShader) {
      this.config.surfaceShader = { ...DEFAULT_TERRAIN_SURFACE_CONFIG };
    }

    this.rng = new SeededRandom(this.config.seed);
    this.noise = new NoiseUtils(this.config.seed);

    // Create the surface shader pipeline (initialization is deferred to generate())
    if (this.config.surfaceShader.enabled) {
      this.surfaceShaderPipeline = new TerrainSurfaceShaderPipeline(this.config.surfaceShader);
    }
  }

  /**
   * Generate the SDF terrain as a THREE.Group containing the mesh.
   *
   * This is the synchronous generation path. It uses CPU-only surface
   * displacement (if the surface shader pipeline is enabled). For GPU
   * acceleration, use `generateAsync()` instead.
   */
  public generate(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'SDFTerrain';

    const sdf = this.buildSDF();

    // Extract isosurface via marching cubes
    let geometry = extractIsosurface(sdf, 0);

    if (geometry.attributes.position.count === 0) {
      console.warn('SDFTerrainGenerator: extractIsosurface produced empty geometry');
      return group;
    }

    // Apply surface shader displacement (CPU fallback since this is sync)
    if (this.surfaceShaderPipeline && this.config.surfaceShader.enabled) {
      try {
        geometry = this.surfaceShaderPipeline.computeDisplacementCPU(geometry, sdf);
        console.log('SDFTerrainGenerator: Applied CPU surface shader displacement');
      } catch (err) {
        console.warn('SDFTerrainGenerator: Surface shader displacement failed, using original geometry:', err);
      }
    }

    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      color: this.config.color,
      roughness: this.config.roughness,
      metalness: 0.0,
      side: THREE.DoubleSide,
      flatShading: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'SDFTerrainMesh';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    return group;
  }

  /**
   * Generate the SDF terrain with GPU-accelerated surface displacement.
   *
   * This async method initializes the WebGPU pipeline (if available) and
   * runs the WGSL compute shader for surface displacement. Falls back to
   * CPU computation if WebGPU is not available.
   *
   * @param device - Optional pre-existing GPUDevice
   * @returns THREE.Group with the terrain mesh
   */
  public async generateAsync(device?: GPUDevice): Promise<THREE.Group> {
    const group = new THREE.Group();
    group.name = 'SDFTerrain';

    const sdf = this.buildSDF();

    // Extract isosurface via marching cubes
    let geometry = extractIsosurface(sdf, 0);

    if (geometry.attributes.position.count === 0) {
      console.warn('SDFTerrainGenerator: extractIsosurface produced empty geometry');
      return group;
    }

    // Apply surface shader displacement (GPU if available, CPU fallback)
    if (this.surfaceShaderPipeline && this.config.surfaceShader.enabled) {
      try {
        // Initialize the pipeline (only does work on first call)
        await this.surfaceShaderPipeline.initialize(device);

        geometry = await this.surfaceShaderPipeline.computeDisplacement(geometry, sdf);

        const gpuUsed = this.surfaceShaderPipeline.isGPUAvailable() ? 'GPU' : 'CPU';
        console.log(`SDFTerrainGenerator: Applied ${gpuUsed} surface shader displacement`);
      } catch (err) {
        console.warn('SDFTerrainGenerator: Surface shader displacement failed, using original geometry:', err);
      }
    }

    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      color: this.config.color,
      roughness: this.config.roughness,
      metalness: 0.0,
      side: THREE.DoubleSide,
      flatShading: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'SDFTerrainMesh';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    return group;
  }

  /**
   * Build the composite SDF volume with all terrain features.
   */
  public buildSDF(): SignedDistanceField {
    const { bounds, resolution } = this.config;

    // Create the base SDF
    const sdf = new SignedDistanceField({ resolution, bounds, maxDistance: 1e6 });

    // 1. Fill base terrain density from 3D noise
    this.fillBaseTerrain(sdf);

    // 2. Carve caves (boolean difference with tunnel SDFs)
    if (this.config.enableCaves) {
      this.carveCaves(sdf);
    }

    // 3. Add overhangs (SDF boolean difference with eroded shapes)
    if (this.config.enableOverhangs) {
      this.addOverhangs(sdf);
    }

    // 4. Add arches (SDF union of torus sections)
    if (this.config.enableArches) {
      this.addArches(sdf);
    }

    return sdf;
  }

  /**
   * Fill the base terrain as a 3D density field using noise.
   *
   * The SDF value at each voxel is:
   *   density = heightAtPoint - point.y
   *
   * Where heightAtPoint is computed from 2D fbm noise.
   * Points below the surface have negative density (inside),
   * points above have positive density (outside).
   *
   * We also add a 3D noise perturbation for natural-looking variation
   * that enables overhang-like features even before explicit overhang carving.
   */
  private fillBaseTerrain(sdf: SignedDistanceField): void {
    const { amplitude, frequency, octaves, lacunarity, persistence, bounds } = this.config;
    const size = bounds.getSize(new THREE.Vector3());

    for (let gz = 0; gz < sdf.gridSize[2]; gz++) {
      for (let gy = 0; gy < sdf.gridSize[1]; gy++) {
        for (let gx = 0; gx < sdf.gridSize[0]; gx++) {
          const pos = sdf.getPosition(gx, gy, gz);

          // Normalized coordinates for noise sampling
          const nx = (pos.x - bounds.min.x) / size.x;
          const nz = (pos.z - bounds.min.z) / size.z;

          // Compute terrain height at this (x,z) using fbm
          let height = 0;
          let amp = amplitude;
          let freq = frequency;
          for (let i = 0; i < octaves; i++) {
            height += this.noise.fbm(
              nx / freq + this.config.seed * 0.1,
              nz / freq + this.config.seed * 0.1,
              0,
              1 // single octave per layer, we handle octaves manually
            ) * amp;
            amp *= persistence;
            freq /= lacunarity;
          }

          // Center height around the middle of the Y bounds
          const baseHeight = bounds.min.y + size.y * 0.3;
          const surfaceY = baseHeight + height;

          // 3D noise perturbation for natural variation (enables minor overhangs)
          const perturbation3D = this.noise.fbm(
            nx * 3.0 + 100,
            (pos.y - bounds.min.y) / size.y * 3.0 + 100,
            nz * 3.0 + 100,
            3
          ) * amplitude * 0.15;

          // SDF = surface height - point height (negative = inside solid)
          const density = (surfaceY + perturbation3D) - pos.y;

          sdf.setValueAtGrid(gx, gy, gz, density);
        }
      }
    }
  }

  /**
   * Carve cave tunnels by subtracting cylindrical SDFs.
   *
   * Each cave is a series of connected segments following a noise-guided path.
   * The SDF of a cylinder segment is computed as:
   *   d = distance_from_line_segment - radius
   *
   * We subtract these from the terrain SDF (boolean difference).
   */
  private carveCaves(sdf: SignedDistanceField): void {
    const { bounds, caveCount, caveRadiusRange } = this.config;
    const size = bounds.getSize(new THREE.Vector3());

    const tunnels = this.generateCaveTunnels(bounds, size);

    for (const tunnel of tunnels) {
      this.carveTunnel(sdf, tunnel);
    }
  }

  /**
   * Generate random cave tunnel paths.
   * Each tunnel follows a noise-guided path through the volume.
   */
  private generateCaveTunnels(bounds: THREE.Box3, size: THREE.Vector3): CaveTunnel[] {
    const tunnels: CaveTunnel[] = [];

    for (let i = 0; i < this.config.caveCount; i++) {
      // Start point: random position in the lower half of the volume
      const startX = bounds.min.x + this.rng.next() * size.x;
      const startY = bounds.min.y + this.rng.next() * size.y * 0.4 + size.y * 0.1;
      const startZ = bounds.min.z + this.rng.next() * size.z;
      const start = new THREE.Vector3(startX, startY, startZ);

      // End point: offset from start, guided by noise
      const tunnelLength = this.rng.nextFloat(10, 40);
      const angle = this.rng.next() * Math.PI * 2;
      const pitch = this.rng.nextFloat(-0.3, 0.3);
      const endX = startX + Math.cos(angle) * tunnelLength;
      const endY = startY + pitch * tunnelLength;
      const endZ = startZ + Math.sin(angle) * tunnelLength;
      const end = new THREE.Vector3(endX, endY, endZ);

      const radius = this.rng.nextFloat(this.config.caveRadiusRange[0], this.config.caveRadiusRange[1]);

      tunnels.push({ start, end, radius });

      // Add branching segments for more complex cave networks
      const branchCount = this.rng.nextInt(1, 3);
      for (let b = 0; b < branchCount; b++) {
        const t = this.rng.nextFloat(0.2, 0.8);
        const branchStart = new THREE.Vector3().lerpVectors(start, end, t);
        const branchAngle = angle + this.rng.nextFloat(-Math.PI / 2, Math.PI / 2);
        const branchLength = this.rng.nextFloat(5, 20);
        const branchEnd = new THREE.Vector3(
          branchStart.x + Math.cos(branchAngle) * branchLength,
          branchStart.y + this.rng.nextFloat(-3, 3),
          branchStart.z + Math.sin(branchAngle) * branchLength
        );
        const branchRadius = radius * this.rng.nextFloat(0.5, 0.9);

        tunnels.push({ start: branchStart, end: branchEnd, radius: branchRadius });
      }
    }

    return tunnels;
  }

  /**
   * Carve a single tunnel (cylinder segment) from the SDF.
   * Uses boolean difference: terrain = terrain - tunnel
   */
  private carveTunnel(sdf: SignedDistanceField, tunnel: CaveTunnel): void {
    const { start, end, radius } = tunnel;
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    direction.normalize();

    for (let gz = 0; gz < sdf.gridSize[2]; gz++) {
      for (let gy = 0; gy < sdf.gridSize[1]; gy++) {
        for (let gx = 0; gx < sdf.gridSize[0]; gx++) {
          // Only process voxels within approximate range of the tunnel
          const pos = sdf.getPosition(gx, gy, gz);
          const distToSegment = this.distanceToLineSegment(pos, start, end);

          // Early out if too far from tunnel to affect SDF
          if (distToSegment > radius + sdf.resolution * 2) continue;

          // SDF of a capped cylinder (tunnel)
          const tunnelSDF = this.cylinderSDF(pos, start, direction, length, radius);

          // Boolean difference: terrain - tunnel
          const currentVal = sdf.getValueAtGrid(gx, gy, gz);
          const newVal = Math.max(currentVal, -tunnelSDF);
          sdf.setValueAtGrid(gx, gy, gz, newVal);
        }
      }
    }
  }

  /**
   * Compute SDF of a capped cylinder (capsule-like shape without rounded ends).
   */
  private cylinderSDF(
    point: THREE.Vector3,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    length: number,
    radius: number
  ): number {
    // Project point onto cylinder axis
    const ap = new THREE.Vector3().subVectors(point, origin);
    const t = ap.dot(direction);

    // Clamp to cylinder length
    const tc = Math.max(0, Math.min(length, t));

    // Closest point on cylinder axis
    const closest = origin.clone().add(direction.clone().multiplyScalar(tc));

    // Distance from axis
    const distFromAxis = point.distanceTo(closest) - radius;

    // Distance along axis beyond caps
    const distAlongAxis = Math.max(0, -t, t - length);

    // Combined SDF (capped cylinder)
    if (distFromAxis < 0 && distAlongAxis === 0) {
      // Inside the cylinder
      return Math.max(distFromAxis, -distAlongAxis);
    }
    return Math.sqrt(distFromAxis * distFromAxis + distAlongAxis * distAlongAxis);
  }

  /**
   * Add overhangs by applying 3D noise-based erosion.
   *
   * Overhangs are created by subtracting eroded shapes from the terrain.
   * We use 3D noise to identify regions where material should be removed
   * to create overhanging rock formations.
   */
  private addOverhangs(sdf: SignedDistanceField): void {
    const { bounds, overhangIntensity } = this.config;
    const size = bounds.getSize(new THREE.Vector3());

    // Create a separate SDF for the overhang erosion pattern
    const erosionSDF = new SignedDistanceField({
      resolution: sdf.resolution,
      bounds: sdf.bounds,
      maxDistance: 1e6,
    });

    for (let gz = 0; gz < sdf.gridSize[2]; gz++) {
      for (let gy = 0; gy < sdf.gridSize[1]; gy++) {
        for (let gx = 0; gx < sdf.gridSize[0]; gx++) {
          const pos = sdf.getPosition(gx, gy, gz);

          const nx = (pos.x - bounds.min.x) / size.x;
          const ny = (pos.y - bounds.min.y) / size.y;
          const nz = (pos.z - bounds.min.z) / size.z;

          // Use ridged multifractal noise for sharp overhang features
          // Only apply in the upper half of the terrain where overhangs make sense
          const terrainVal = sdf.getValueAtGrid(gx, gy, gz);

          // Only modify near-surface voxels
          if (terrainVal > 3 || terrainVal < -3) {
            erosionSDF.setValueAtGrid(gx, gy, gz, 1e6);
            continue;
          }

          // 3D noise for overhang pattern - only active where terrain is near surface
          const overhangNoise = this.noise.fbm(
            nx * 4.0 + 200,
            ny * 4.0 + 200,
            nz * 4.0 + 200,
            4
          );

          // Create overhang pattern: subtract material where noise is high
          // and we're slightly above the base surface (overhang effect)
          const overhangThreshold = 0.15 * overhangIntensity;
          if (overhangNoise > overhangThreshold && terrainVal < 0) {
            // Erode: push the surface outward (add material outside)
            // This creates overhangs because we're eating into the solid
            const erosionAmount = (overhangNoise - overhangThreshold) * 5.0 * overhangIntensity;
            erosionSDF.setValueAtGrid(gx, gy, gz, -erosionAmount);
          } else {
            erosionSDF.setValueAtGrid(gx, gy, gz, 1e6);
          }
        }
      }
    }

    // Apply boolean difference: terrain = terrain - erosion
    for (let gz = 0; gz < sdf.gridSize[2]; gz++) {
      for (let gy = 0; gy < sdf.gridSize[1]; gy++) {
        for (let gx = 0; gx < sdf.gridSize[0]; gx++) {
          const terrainVal = sdf.getValueAtGrid(gx, gy, gz);
          const erosionVal = erosionSDF.getValueAtGrid(gx, gy, gz);
          // Boolean difference: max(terrain, -erosion)
          sdf.setValueAtGrid(gx, gy, gz, Math.max(terrainVal, -erosionVal));
        }
      }
    }
  }

  /**
   * Add natural stone arches using SDF union of torus sections.
   *
   * A torus SDF is: d = (length(vec2(length(p.xz) - R, p.y)) - r)
   * where R is the major radius and r is the minor radius.
   * We use half-torus sections (arches) positioned near the terrain surface.
   */
  private addArches(sdf: SignedDistanceField): void {
    const { bounds, archCount } = this.config;
    const size = bounds.getSize(new THREE.Vector3());

    const arches = this.generateArchPositions(bounds, size);

    for (const arch of arches) {
      this.addArchSDF(sdf, arch);
    }
  }

  /**
   * Generate random arch positions near the terrain surface.
   */
  private generateArchPositions(bounds: THREE.Box3, size: THREE.Vector3): ArchShape[] {
    const arches: ArchShape[] = [];

    for (let i = 0; i < this.config.archCount; i++) {
      // Position arch near the terrain surface
      const centerX = bounds.min.x + this.rng.nextFloat(0.2, 0.8) * size.x;
      const centerZ = bounds.min.z + this.rng.nextFloat(0.2, 0.8) * size.z;

      // Estimate terrain height at this position using noise
      const nx = (centerX - bounds.min.x) / size.x;
      const nz = (centerZ - bounds.min.z) / size.z;
      let estimatedHeight = 0;
      let amp = this.config.amplitude;
      let freq = this.config.frequency;
      for (let j = 0; j < this.config.octaves; j++) {
        estimatedHeight += this.noise.fbm(nx / freq + this.config.seed * 0.1, nz / freq + this.config.seed * 0.1, 0, 1) * amp;
        amp *= this.config.persistence;
        freq /= this.config.lacunarity;
      }
      const surfaceY = bounds.min.y + size.y * 0.3 + estimatedHeight;

      const center = new THREE.Vector3(centerX, surfaceY, centerZ);
      const majorRadius = this.rng.nextFloat(3, 8);
      const minorRadius = this.rng.nextFloat(0.5, 2.0);
      const rotation = this.rng.next() * Math.PI;

      arches.push({ center, majorRadius, minorRadius, rotation });
    }

    return arches;
  }

  /**
   * Add a single arch (half-torus) SDF to the terrain via boolean union.
   */
  private addArchSDF(sdf: SignedDistanceField, arch: ArchShape): void {
    const { center, majorRadius, minorRadius, rotation } = arch;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);

    for (let gz = 0; gz < sdf.gridSize[2]; gz++) {
      for (let gy = 0; gy < sdf.gridSize[1]; gy++) {
        for (let gx = 0; gx < sdf.gridSize[0]; gx++) {
          const pos = sdf.getPosition(gx, gy, gz);

          // Only process voxels within approximate range of the arch
          const distToCenter = pos.distanceTo(center);
          if (distToCenter > majorRadius + minorRadius + sdf.resolution * 2) continue;

          // Transform to arch-local coordinates
          const localX = pos.x - center.x;
          const localY = pos.y - center.y;
          const localZ = pos.z - center.z;

          // Rotate around Y axis
          const rotX = localX * cosR + localZ * sinR;
          const rotZ = -localX * sinR + localZ * cosR;

          // Torus SDF: only keep the upper half (arch shape)
          // Standard torus: d = length(vec2(length(p.xz) - R, p.y)) - r
          const distFromAxis = Math.sqrt(rotX * rotX + rotZ * rotZ);
          const torusDist = Math.sqrt(
            (distFromAxis - majorRadius) * (distFromAxis - majorRadius) +
            localY * localY
          ) - minorRadius;

          // Only keep the arch (upper half of torus: y > center)
          // This is achieved by intersecting with a half-space
          const halfSpace = -localY; // y > 0 in local space
          const archDist = Math.max(torusDist, halfSpace);

          // Smooth boolean union with terrain
          const currentVal = sdf.getValueAtGrid(gx, gy, gz);
          const blended = this.smoothMin(currentVal, archDist, this.config.smoothBlend);
          sdf.setValueAtGrid(gx, gy, gz, blended);
        }
      }
    }
  }

  /**
   * Smooth minimum (for smooth boolean union).
   * polynomial smooth min from Inigo Quilez:
   * https://iquilezles.org/articles/smin/
   */
  private smoothMin(a: number, b: number, k: number): number {
    if (k <= 0) return Math.min(a, b);
    const h = Math.max(0, Math.min(1, (b - a + k) / (2 * k)));
    return b + (a - b) * h - k * h * (1 - h);
  }

  /**
   * Get the surface shader pipeline instance (for external configuration).
   */
  public getSurfaceShaderPipeline(): TerrainSurfaceShaderPipeline | null {
    return this.surfaceShaderPipeline;
  }

  /**
   * Dispose of GPU resources held by the surface shader pipeline.
   */
  public dispose(): void {
    if (this.surfaceShaderPipeline) {
      this.surfaceShaderPipeline.dispose();
    }
  }

  /**
   * Compute distance from a point to a line segment.
   */
  private distanceToLineSegment(
    point: THREE.Vector3,
    a: THREE.Vector3,
    b: THREE.Vector3
  ): number {
    const ab = new THREE.Vector3().subVectors(b, a);
    const ap = new THREE.Vector3().subVectors(point, a);
    const t = ap.dot(ab) / Math.max(ab.lengthSq(), 1e-10);
    const tc = Math.max(0, Math.min(1, t));
    const closest = a.clone().add(ab.multiplyScalar(tc));
    return point.distanceTo(closest);
  }
}
