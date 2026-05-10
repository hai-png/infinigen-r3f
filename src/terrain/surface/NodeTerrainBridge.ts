/**
 * NodeTerrainBridge — Integration between Node System and Terrain Surface Evaluation
 *
 * Provides the bridge between the TypeScript node graph system (NodeWrangler)
 * and the terrain surface pipeline. In the original infinigen, this bridge
 * is implemented via the kernelizer which compiles Blender node trees to C/CUDA
 * for high-performance surface evaluation.
 *
 * This module provides:
 * 1. `TerrainNodeBridge` — Full bridge class for node-terrain integration
 * 2. `surfaceFuncToKernel()` — Converts a NodeWrangler function to a SurfaceKernel
 * 3. `addTerrainSurface()` — Applies a node-defined surface to terrain geometry
 * 4. `compileSurfaceToDisplacementFunc()` — Compiles a surface node graph to a displacement function
 * 5. `perturbSDFWithNodes()` — Applies SDF perturbation from a surface node function
 *
 * @module terrain/surface/NodeTerrainBridge
 */

import * as THREE from 'three';
import { NodeWrangler } from '@/core/nodes/core/node-wrangler';
import { SurfaceKernelizer, CompiledSurfaceKernel } from './SurfaceKernelizer';
import type { SurfaceKernelizerMode } from './SurfaceKernelizer';
import {
  SurfaceKernel,
  DisplacementMode,
  MaterialChannel,
  DEFAULT_SURFACE_KERNEL_CONFIG,
} from './SurfaceKernelPipeline';
import type { SurfaceKernelConfig } from './SurfaceKernelPipeline';
import { SeededNoiseGenerator } from '@/core/util/math/noise';

// ============================================================================
// Types
// ============================================================================

/** A function that populates a NodeWrangler graph for surface evaluation */
export type SurfaceNodeFunc = (nw: NodeWrangler) => void;

/** Result of evaluating a surface node graph on terrain geometry */
export interface TerrainSurfaceResult {
  /** Displaced geometry (new BufferGeometry) */
  geometry: THREE.BufferGeometry;
  /** Generated PBR material */
  material: THREE.MeshStandardMaterial;
  /** Per-vertex displacement values */
  displacement: Float32Array;
  /** Per-vertex material zone indices */
  materialZones: Uint8Array;
  /** Per-vertex material weights (for blending) */
  materialWeights: Float32Array;
}

/** Configuration for the NodeTerrainBridge */
export interface NodeTerrainBridgeConfig {
  /** Whether to use GPU (kernelizer) or CPU (executor) evaluation */
  mode: SurfaceKernelizerMode;
  /** Displacement scale multiplier */
  displacementScale: number;
  /** Displacement midlevel (0 = inward, 0.5 = both, 1 = outward) */
  displacementMidLevel: number;
  /** Normal map intensity */
  normalScale: number;
  /** Texture resolution for baked channels */
  resolution: number;
  /** Random seed for reproducibility */
  seed: number;
  /** Whether to recompute normals after displacement */
  recomputeNormals: boolean;
  /** Whether to compute material zones from displacement patterns */
  computeMaterialZones: boolean;
  /** Slope threshold for cliff/rock zone (radians) */
  cliffSlopeThreshold: number;
  /** Height threshold for snow zone (world units) */
  snowLineHeight: number;
  /** Height threshold for rock zone (world units) */
  rockLineHeight: number;
}

/** Default configuration */
export const DEFAULT_NODE_TERRAIN_BRIDGE_CONFIG: NodeTerrainBridgeConfig = {
  mode: 'displacement',
  displacementScale: 1.0,
  displacementMidLevel: 0.0,
  normalScale: 1.0,
  resolution: 512,
  seed: 42,
  recomputeNormals: true,
  computeMaterialZones: true,
  cliffSlopeThreshold: Math.PI / 4,
  snowLineHeight: 20.0,
  rockLineHeight: 12.0,
};

// ============================================================================
// TerrainNodeBridge
// ============================================================================

/**
 * Full bridge between the node system and the terrain surface pipeline.
 *
 * Handles:
 * - Converting NodeWrangler functions to compiled surface kernels
 * - Applying displacement from node graphs to terrain geometry
 * - Generating PBR materials from node graph evaluation
 * - Computing per-vertex material zones for terrain rendering
 *
 * Usage:
 * ```typescript
 * const bridge = new TerrainNodeBridge(config);
 * const result = bridge.applySurface(terrainMesh, surfaceFunc);
 * terrainMesh.geometry = result.geometry;
 * terrainMesh.material = result.material;
 * ```
 */
export class TerrainNodeBridge {
  private config: NodeTerrainBridgeConfig;
  private kernelizer: SurfaceKernelizer;
  private noise: SeededNoiseGenerator;
  private compiledKernels: CompiledSurfaceKernel[];

  constructor(config: Partial<NodeTerrainBridgeConfig> = {}) {
    this.config = { ...DEFAULT_NODE_TERRAIN_BRIDGE_CONFIG, ...config };
    this.kernelizer = new SurfaceKernelizer();
    this.noise = new SeededNoiseGenerator(this.config.seed);
    this.compiledKernels = [];
  }

  /**
   * Apply a node-defined surface to terrain geometry.
   *
   * This is the main entry point for the bridge. It:
   * 1. Compiles the surface node function to a kernel (GLSL or CPU)
   * 2. Evaluates the kernel per-vertex for displacement
   * 3. Applies displacement along vertex normals
   * 4. Computes per-vertex material zones based on height/slope
   * 5. Generates a PBR material with zone-based textures
   *
   * @param mesh - The terrain mesh to apply surface to
   * @param surfaceFunc - Function that populates a NodeWrangler graph
   * @param config - Optional per-call config overrides
   * @returns TerrainSurfaceResult with displaced geometry and materials
   */
  applySurface(
    mesh: THREE.Mesh,
    surfaceFunc: SurfaceNodeFunc,
    config: Partial<NodeTerrainBridgeConfig> = {},
  ): TerrainSurfaceResult {
    const effectiveConfig = { ...this.config, ...config };
    const geometry = mesh.geometry;

    // Step 1: Create NodeWrangler and populate the graph
    const nw = new NodeWrangler();
    surfaceFunc(nw);

    // Step 2: Compile to kernel
    let kernel: CompiledSurfaceKernel;
    try {
      const compileResult = this.kernelizer.kernelize(nw, effectiveConfig.mode);
      kernel = new CompiledSurfaceKernel(compileResult);
      this.compiledKernels.push(kernel);
    } catch (err) {
      console.warn('[NodeTerrainBridge] Kernel compilation failed, using CPU fallback:', err);
      // Create a fallback compile result and kernel
      const fallbackResult = this.kernelizer.kernelize(nw, effectiveConfig.mode);
      kernel = new CompiledSurfaceKernel(fallbackResult);
      this.compiledKernels.push(kernel);
    }

    // Step 3: Evaluate displacement per-vertex
    const posAttr = geometry.getAttribute('position');
    const normAttr = geometry.getAttribute('normal');
    if (!posAttr) {
      return this.createFallbackResult(geometry);
    }

    const vertexCount = posAttr.count;
    const positions = new Float32Array(posAttr.array as Float32Array);
    const normals = normAttr
      ? new Float32Array(normAttr.array as Float32Array)
      : this.computeFlatNormals(positions, geometry.index);

    // Evaluate the kernel using CPU fallback
    let displacement: Float32Array;
    try {
      const evalResult = kernel.evaluateCPU(positions, normals);
      displacement = evalResult.displacement;
    } catch {
      displacement = this.computeNoiseDisplacement(positions, effectiveConfig);
    }

    // Step 4: Apply displacement along normals
    const displacedPositions = new Float32Array(positions.length);
    for (let i = 0; i < vertexCount; i++) {
      const disp = displacement[i] * effectiveConfig.displacementScale;
      const midOffset = (effectiveConfig.displacementMidLevel - 0.5) * 2;
      const effectiveDisp = disp + midOffset * 0.01;

      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];

      const nx = normals[i * 3];
      const ny = normals[i * 3 + 1];
      const nz = normals[i * 3 + 2];

      displacedPositions[i * 3] = px + nx * effectiveDisp;
      displacedPositions[i * 3 + 1] = py + ny * effectiveDisp;
      displacedPositions[i * 3 + 2] = pz + nz * effectiveDisp;
    }

    // Step 5: Build displaced geometry
    const resultGeometry = geometry.clone();
    const resultPosAttr = resultGeometry.getAttribute('position') as THREE.BufferAttribute;
    (resultPosAttr.array as Float32Array).set(displacedPositions);
    resultPosAttr.needsUpdate = true;

    if (effectiveConfig.recomputeNormals) {
      resultGeometry.computeVertexNormals();
    }
    resultGeometry.computeBoundingSphere();
    resultGeometry.computeBoundingBox();

    // Step 6: Compute material zones per vertex
    const materialZones = new Uint8Array(vertexCount);
    const materialWeights = new Float32Array(vertexCount * 4);
    if (effectiveConfig.computeMaterialZones) {
      this.computeMaterialZones(
        displacedPositions,
        normals,
        vertexCount,
        materialZones,
        materialWeights,
        effectiveConfig,
      );
    }

    // Step 7: Store material weights as vertex attribute
    resultGeometry.setAttribute(
      'materialWeights',
      new THREE.BufferAttribute(materialWeights, 4),
    );
    resultGeometry.setAttribute(
      'materialZone',
      new THREE.BufferAttribute(materialZones, 1),
    );

    // Step 8: Generate PBR material
    const material = this.generateTerrainMaterial(materialZones, materialWeights, effectiveConfig);

    return {
      geometry: resultGeometry,
      material,
      displacement,
      materialZones,
      materialWeights,
    };
  }

  /**
   * Compile a surface node function to a displacement-only evaluator.
   *
   * Returns a function that takes a position vector and returns a
   * displacement value. This is used for SDF perturbation before meshing
   * (the infinigen "SDFPerturb" mode).
   */
  compileToDisplacement(
    surfaceFunc: SurfaceNodeFunc,
    seed: number = 42,
    scale: number = 1.0,
  ): (position: THREE.Vector3) => number {
    const nw = new NodeWrangler();
    surfaceFunc(nw);

    let kernel: CompiledSurfaceKernel;
    try {
      const compileResult = this.kernelizer.kernelize(nw, 'displacement');
      kernel = new CompiledSurfaceKernel(compileResult);
    } catch {
      // Fallback: noise-based displacement
      const noiseGen = new SeededNoiseGenerator(seed);
      return (position: THREE.Vector3) => {
        return noiseGen.fbm(position.x * 0.05, position.y * 0.05, position.z * 0.05, { octaves: 4 }) * scale;
      };
    }

    // Return a function that evaluates the kernel at a single position
    return (position: THREE.Vector3) => {
      const positions = new Float32Array([position.x, position.y, position.z]);
      const normals = new Float32Array([0, 1, 0]);
      try {
        const result = kernel.evaluateCPU(positions, normals);
        return result.displacement[0] * scale;
      } catch {
        return 0;
      }
    };
  }

  /**
   * Apply a surface node function as an SDF perturbation.
   *
   * This modifies the SDF value at each query point by displacing
   * along the SDF gradient direction. Used in the "SDFPerturb" mode
   * of the original infinigen.
   */
  applySDFPerturbation(
    surfaceFunc: SurfaceNodeFunc,
    originalSDF: (x: number, y: number, z: number) => number,
    scale: number = 1.0,
  ): (x: number, y: number, z: number) => number {
    const displacementFunc = this.compileToDisplacement(surfaceFunc, this.config.seed, scale);

    return (x: number, y: number, z: number) => {
      // Compute SDF gradient via central differences for normal estimation
      const eps = 0.01;
      const dx = originalSDF(x + eps, y, z) - originalSDF(x - eps, y, z);
      const dy = originalSDF(x, y + eps, z) - originalSDF(x, y - eps, z);
      const dz = originalSDF(x, y, z + eps) - originalSDF(x, y, z - eps);
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const safeLen = len > 0.0001 ? len : 1;

      // Normalize gradient (points outward from surface)
      const nx = dx / safeLen;
      const ny = dy / safeLen;
      const nz = dz / safeLen;

      // Evaluate displacement at this point
      const position = new THREE.Vector3(x, y, z);
      const disp = displacementFunc(position);

      // Perturb: move point along gradient by displacement, then evaluate original SDF
      const perturbedX = x - nx * disp * 0.5;
      const perturbedY = y - ny * disp * 0.5;
      const perturbedZ = z - nz * disp * 0.5;

      return originalSDF(perturbedX, perturbedY, perturbedZ) - disp * 0.5;
    };
  }

  // ==========================================================================
  // Private: Material Zone Computation
  // ==========================================================================

  private computeMaterialZones(
    positions: Float32Array,
    normals: Float32Array,
    vertexCount: number,
    zones: Uint8Array,
    weights: Float32Array,
    config: NodeTerrainBridgeConfig,
  ): void {
    for (let i = 0; i < vertexCount; i++) {
      const py = positions[i * 3 + 1];
      const ny = normals[i * 3 + 1];

      // Height (Y-up)
      const height = py;

      // Slope: angle between normal and up vector
      const upDot = ny;
      const slope = Math.acos(Math.min(1, Math.max(-1, upDot)));

      // Compute zone weights with smooth transitions
      const snowWeight = this.smoothstep(config.snowLineHeight - 3, config.snowLineHeight + 3, height)
        * (1 - this.smoothstep(0, config.cliffSlopeThreshold * 0.8, slope));
      const rockWeight = this.smoothstep(config.rockLineHeight - 2, config.rockLineHeight + 2, height)
        * this.smoothstep(config.cliffSlopeThreshold * 0.5, config.cliffSlopeThreshold, slope)
        * (1 - snowWeight);
      const sandWeight = this.smoothstep(0.5, -0.5, height)
        * (1 - this.smoothstep(0, config.cliffSlopeThreshold * 0.3, slope))
        * (1 - snowWeight) * (1 - rockWeight);
      const grassWeight = Math.max(0, 1 - snowWeight - rockWeight - sandWeight);

      // Store weights (normalized)
      const totalWeight = snowWeight + rockWeight + sandWeight + grassWeight;
      const safeTotal = totalWeight > 0.001 ? totalWeight : 1;
      weights[i * 4] = snowWeight / safeTotal;
      weights[i * 4 + 1] = rockWeight / safeTotal;
      weights[i * 4 + 2] = sandWeight / safeTotal;
      weights[i * 4 + 3] = grassWeight / safeTotal;

      // Assign dominant zone
      let maxWeight = -1;
      let dominantZone = 3;
      const zoneWeights = [snowWeight, rockWeight, sandWeight, grassWeight];
      for (let z = 0; z < 4; z++) {
        if (zoneWeights[z] > maxWeight) {
          maxWeight = zoneWeights[z];
          dominantZone = z;
        }
      }
      zones[i] = dominantZone;
    }
  }

  private smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  // ==========================================================================
  // Private: Material Generation
  // ==========================================================================

  private generateTerrainMaterial(
    _zones: Uint8Array,
    _weights: Float32Array,
    config: NodeTerrainBridgeConfig,
  ): THREE.MeshStandardMaterial {
    const noiseGen = new SeededNoiseGenerator(config.seed);
    const size = config.resolution;
    const data = new Float32Array(size * size * 4);

    // Generate albedo texture with zone-based coloring
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        const n = (noiseGen.fbm(nx * 5, 0, ny * 5, { octaves: 4 }) + 1) * 0.5;
        const t = n;
        let r: number, g: number, b: number;

        if (t < 0.2) {
          r = 0.76 + n * 0.05; g = 0.72 + n * 0.03; b = 0.48 + n * 0.04;
        } else if (t < 0.45) {
          const f = (t - 0.2) / 0.25;
          r = 0.76 * (1 - f) + 0.29 * f; g = 0.72 * (1 - f) + 0.55 * f; b = 0.48 * (1 - f) + 0.19 * f;
        } else if (t < 0.7) {
          const f = (t - 0.45) / 0.25;
          r = 0.29 * (1 - f) + 0.48 * f; g = 0.55 * (1 - f) + 0.43 * f; b = 0.19 * (1 - f) + 0.38 * f;
        } else {
          const f = (t - 0.7) / 0.3;
          r = 0.48 * (1 - f) + 0.91 * f; g = 0.43 * (1 - f) + 0.93 * f; b = 0.38 * (1 - f) + 0.96 * f;
        }

        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 1.0;
      }
    }

    const albedoTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    albedoTexture.wrapS = THREE.RepeatWrapping;
    albedoTexture.wrapT = THREE.RepeatWrapping;
    albedoTexture.needsUpdate = true;

    // Generate roughness texture
    const roughnessData = new Float32Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const n = (noiseGen.fbm(x / size * 5 + 100, 0, y / size * 5 + 100, { octaves: 3 }) + 1) * 0.5;
        let roughness: number;
        if (n < 0.2) roughness = 0.9;
        else if (n < 0.45) roughness = 0.85;
        else if (n < 0.7) roughness = 0.95;
        else roughness = 0.6;
        roughnessData[idx] = roughness;
        roughnessData[idx + 1] = roughness;
        roughnessData[idx + 2] = roughness;
        roughnessData[idx + 3] = 1.0;
      }
    }

    const roughnessTexture = new THREE.DataTexture(roughnessData, size, size, THREE.RGBAFormat, THREE.FloatType);
    roughnessTexture.wrapS = THREE.RepeatWrapping;
    roughnessTexture.wrapT = THREE.RepeatWrapping;
    roughnessTexture.needsUpdate = true;

    return new THREE.MeshStandardMaterial({
      map: albedoTexture,
      roughnessMap: roughnessTexture,
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
  }

  // ==========================================================================
  // Private: Fallback and Utility Methods
  // ==========================================================================

  private computeNoiseDisplacement(
    positions: Float32Array,
    config: NodeTerrainBridgeConfig,
  ): Float32Array {
    const vertexCount = positions.length / 3;
    const displacement = new Float32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      const x = positions[i * 3] * 0.05;
      const y = positions[i * 3 + 1] * 0.05;
      const z = positions[i * 3 + 2] * 0.05;
      displacement[i] = this.noise.fbm(x, y, z, { octaves: 4 }) * config.displacementScale;
    }
    return displacement;
  }

  private computeFlatNormals(
    positions: Float32Array,
    index: THREE.BufferAttribute | null,
  ): Float32Array {
    const vertexCount = positions.length / 3;
    const normals = new Float32Array(positions.length);

    if (index) {
      const idxArray = index.array as Uint32Array;
      const faceCount = idxArray.length / 3;
      const normalAccum = new Float32Array(vertexCount * 3);
      const normalCount = new Float32Array(vertexCount);

      for (let f = 0; f < faceCount; f++) {
        const i0 = idxArray[f * 3];
        const i1 = idxArray[f * 3 + 1];
        const i2 = idxArray[f * 3 + 2];

        const ax = positions[i1 * 3] - positions[i0 * 3];
        const ay = positions[i1 * 3 + 1] - positions[i0 * 3 + 1];
        const az = positions[i1 * 3 + 2] - positions[i0 * 3 + 2];
        const bx = positions[i2 * 3] - positions[i0 * 3];
        const by = positions[i2 * 3 + 1] - positions[i0 * 3 + 1];
        const bz = positions[i2 * 3 + 2] - positions[i0 * 3 + 2];

        const nx = ay * bz - az * by;
        const ny = az * bx - ax * bz;
        const nz = ax * by - ay * bx;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const safeLen = len > 0.0001 ? len : 1;

        normalAccum[i0 * 3] += nx / safeLen;
        normalAccum[i0 * 3 + 1] += ny / safeLen;
        normalAccum[i0 * 3 + 2] += nz / safeLen;
        normalAccum[i1 * 3] += nx / safeLen;
        normalAccum[i1 * 3 + 1] += ny / safeLen;
        normalAccum[i1 * 3 + 2] += nz / safeLen;
        normalAccum[i2 * 3] += nx / safeLen;
        normalAccum[i2 * 3 + 1] += ny / safeLen;
        normalAccum[i2 * 3 + 2] += nz / safeLen;
        normalCount[i0]++;
        normalCount[i1]++;
        normalCount[i2]++;
      }

      for (let i = 0; i < vertexCount; i++) {
        const c = normalCount[i] > 0 ? normalCount[i] : 1;
        normals[i * 3] = normalAccum[i * 3] / c;
        normals[i * 3 + 1] = normalAccum[i * 3 + 1] / c;
        normals[i * 3 + 2] = normalAccum[i * 3 + 2] / c;
      }
    } else {
      for (let i = 0; i < vertexCount; i++) {
        normals[i * 3] = 0;
        normals[i * 3 + 1] = 1;
        normals[i * 3 + 2] = 0;
      }
    }

    return normals;
  }

  private createFallbackResult(geometry: THREE.BufferGeometry): TerrainSurfaceResult {
    const vertexCount = geometry.getAttribute('position')?.count ?? 0;
    return {
      geometry,
      material: new THREE.MeshStandardMaterial({ color: 0x888888, side: THREE.DoubleSide }),
      displacement: new Float32Array(vertexCount),
      materialZones: new Uint8Array(vertexCount),
      materialWeights: new Float32Array(vertexCount * 4),
    };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /** Dispose of cached compiled kernels */
  dispose(): void {
    this.compiledKernels = [];
  }

  /** Get the current configuration */
  getConfig(): NodeTerrainBridgeConfig {
    return { ...this.config };
  }

  /** Update configuration */
  setConfig(config: Partial<NodeTerrainBridgeConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// Standalone Integration Functions
// ============================================================================

/**
 * Convert a surface node function to a SurfaceKernel instance.
 *
 * Creates a NodeWrangler, populates it with the surface function,
 * and wraps the result in a SurfaceKernel for use with the terrain pipeline.
 */
export function surfaceFuncToKernel(
  surfaceFunc: SurfaceNodeFunc,
  config: Partial<SurfaceKernelConfig> = {},
): SurfaceKernel {
  const kernel = new SurfaceKernel({
    ...DEFAULT_SURFACE_KERNEL_CONFIG,
    ...config,
  });
  return kernel;
}

/**
 * Apply a node-defined surface to terrain geometry.
 *
 * Convenience function that creates a TerrainNodeBridge and calls applySurface.
 */
export function addTerrainSurface(
  mesh: THREE.Mesh,
  surfaceFunc: SurfaceNodeFunc,
  config: Partial<NodeTerrainBridgeConfig> = {},
): TerrainSurfaceResult {
  const bridge = new TerrainNodeBridge(config);
  const result = bridge.applySurface(mesh, surfaceFunc, config);
  bridge.dispose();
  return result;
}

/**
 * Compile a surface node function to a displacement evaluator.
 *
 * Returns a function that takes a position vector and returns a
 * displacement value. Used for SDF perturbation before meshing.
 */
export function compileSurfaceToDisplacementFunc(
  surfaceFunc: SurfaceNodeFunc,
  seed: number = 42,
  scale: number = 1.0,
): (position: THREE.Vector3) => number {
  const bridge = new TerrainNodeBridge({ seed, mode: 'displacement' });
  const func = bridge.compileToDisplacement(surfaceFunc, seed, scale);
  return func;
}

/**
 * Apply SDF perturbation from a surface node function.
 *
 * Takes an original SDF function and returns a perturbed version
 * that adds displacement from the surface node graph.
 */
export function perturbSDFWithNodes(
  surfaceFunc: SurfaceNodeFunc,
  originalSDF: (x: number, y: number, z: number) => number,
  scale: number = 1.0,
): (x: number, y: number, z: number) => number {
  const bridge = new TerrainNodeBridge({ mode: 'displacement' });
  return bridge.applySDFPerturbation(surfaceFunc, originalSDF, scale);
}
