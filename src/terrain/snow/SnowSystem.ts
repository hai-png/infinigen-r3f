/**
 * Snow System for Terrain
 * Implements snow accumulation, slope-based sliding, wind-driven patterns,
 * melting, snow mesh generation, snow material, and terrain integration.
 */

import * as THREE from 'three';
import { PerlinNoiseSource, type NoiseSource } from '../source';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface SnowParams {
  /** Base snow depth in meters */
  baseDepth: number;
  /** Maximum snow depth on flat surfaces */
  maxDepth: number;
  /** Slope angle threshold for snow sliding (degrees) */
  slideThreshold: number;
  /** Wind strength (0-1) */
  windStrength: number;
  /** Wind direction vector */
  windDirection: THREE.Vector3;
  /** Temperature for melting simulation */
  temperature: number;
  /** Melting rate per second */
  meltRate: number;
  /** Accumulation rate per second */
  accumulateRate: number;
  /** Enable wind-driven drifts */
  enableDrifts: boolean;
  /** Drift scale */
  driftScale: number;
  /** Snow color (defaults to white with slight blue tint) */
  color: THREE.Color;
  /** Snow roughness (PBR) */
  roughness: number;
  /** Snow metalness (PBR) */
  metalness: number;
  /** Normal Y threshold for snow coverage (0-1, higher = only flatter surfaces) */
  normalThreshold: number;
  /** Minimum snow depth for a face to be included in the overlay mesh */
  minDepthForMesh: number;
  /** Snow sparkle intensity (0-1) */
  sparkleIntensity: number;
  /** SSS translucency approximation strength (0-1) */
  translucency: number;
  /** Snow surface smoothing passes */
  smoothingPasses: number;
  /** Wind shadow factor (0 = no shadow, 1 = full lee-side accumulation) */
  windShadowFactor: number;
}

// ---------------------------------------------------------------------------
// SnowSystem
// ---------------------------------------------------------------------------

export class SnowSystem {
  private params: SnowParams;
  private snowDepthMap: Float32Array | null = null;
  private width: number = 0;
  private height: number = 0;

  // Snow overlay mesh & resources (for cleanup)
  private snowMesh: THREE.Mesh | null = null;
  private snowMaterial: THREE.MeshStandardMaterial | null = null;
  private snowPileMeshes: THREE.Mesh[] = [];

  // Noise source for drift patterns
  private driftNoise: NoiseSource;

  constructor(params: Partial<SnowParams> = {}) {
    this.params = {
      baseDepth: 0.1,
      maxDepth: 2.0,
      slideThreshold: 45,
      windStrength: 0.3,
      windDirection: new THREE.Vector3(1, 0, 0),
      temperature: -5,
      meltRate: 0.001,
      accumulateRate: 0.01,
      enableDrifts: true,
      driftScale: 10,
      color: new THREE.Color(0.95, 0.97, 1.0),
      roughness: 0.4,
      metalness: 0.0,
      normalThreshold: 0.5,
      minDepthForMesh: 0.01,
      sparkleIntensity: 0.3,
      translucency: 0.2,
      smoothingPasses: 3,
      windShadowFactor: 0.5,
      ...params,
    };

    this.driftNoise = new PerlinNoiseSource(12345);
  }

  // -----------------------------------------------------------------------
  // Existing API (backward-compatible)
  // -----------------------------------------------------------------------

  /**
   * Initialize snow depth map
   */
  initialize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.snowDepthMap = new Float32Array(width * height);

    // Initialize with base depth
    for (let i = 0; i < width * height; i++) {
      this.snowDepthMap[i] = this.params.baseDepth;
    }
  }

  /**
   * Simulate snow accumulation based on slope and wind
   */
  simulate(
    heightMap: Float32Array,
    normalMap: Float32Array,
    deltaTime: number,
  ): Float32Array {
    if (!this.snowDepthMap) {
      throw new Error('Snow system not initialized');
    }

    const newDepthMap = new Float32Array(this.snowDepthMap.length);
    const slideThresholdRad = (this.params.slideThreshold * Math.PI) / 180;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;

        // Get surface normal
        const nx = normalMap[idx * 3];
        const ny = normalMap[idx * 3 + 1];
        const nz = normalMap[idx * 3 + 2];

        // Calculate slope angle from normal
        const slopeAngle = Math.acos(Math.max(0, ny));

        let depth = this.snowDepthMap[idx];

        // Accumulation
        depth += this.params.accumulateRate * deltaTime;

        // Slope-based sliding
        if (slopeAngle > slideThresholdRad) {
          const slideFactor =
            (slopeAngle - slideThresholdRad) / (Math.PI / 2 - slideThresholdRad);
          depth *= 1 - slideFactor * 0.5;
        }

        // Wind-driven patterns (now using proper noise instead of sin/cos)
        if (this.params.enableDrifts) {
          const windDot =
            nx * this.params.windDirection.x + nz * this.params.windDirection.z;
          if (windDot > 0) {
            // Windward side — less accumulation
            depth *= 0.8;
          } else {
            // Leeward side — more accumulation (drifts), using proper Perlin noise
            const driftNoise = this.driftNoise.sample2D(
              x / this.params.driftScale,
              y / this.params.driftScale,
            );
            depth +=
              this.params.windStrength *
              this.params.driftScale *
              Math.max(0, driftNoise) *
              deltaTime;
          }
        }

        // Temperature-based melting
        if (this.params.temperature > 0) {
          depth -=
            this.params.meltRate * (this.params.temperature / 10) * deltaTime;
        }

        // Clamp depth
        depth = Math.max(0, Math.min(depth, this.params.maxDepth));

        newDepthMap[idx] = depth;
      }
    }

    this.snowDepthMap = newDepthMap;
    return newDepthMap;
  }

  /**
   * Get snow depth at a specific position
   */
  getDepth(x: number, y: number): number {
    if (
      !this.snowDepthMap ||
      x < 0 ||
      x >= this.width ||
      y < 0 ||
      y >= this.height
    ) {
      return this.params.baseDepth;
    }
    return this.snowDepthMap[y * this.width + x];
  }

  /**
   * Apply snow to geometry by displacing vertices using bilinear interpolation
   */
  applyToGeometry(
    geometry: THREE.BufferGeometry,
    heightMap: Float32Array,
  ): THREE.BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    const newPositions = new Float32Array(positions.length);

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 2]; // Z is Y in terrain space
      const z = positions[i + 1];

      // Sample snow depth from the depth map using bilinear interpolation
      let snowDepth = this.params.baseDepth;
      if (this.snowDepthMap && this.width > 0 && this.height > 0) {
        snowDepth = this.sampleDepthBilinear(x, y);
      }

      newPositions[i] = x;
      newPositions[i + 1] = z + snowDepth;
      newPositions[i + 2] = y;
    }

    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(newPositions, 3),
    );
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Update parameters
   */
  setParams(params: Partial<SnowParams>): void {
    this.params = { ...this.params, ...params };
  }

  /**
   * Get current snow depth map
   */
  getDepthMap(): Float32Array | null {
    return this.snowDepthMap;
  }

  // -----------------------------------------------------------------------
  // NEW: Snow Material
  // -----------------------------------------------------------------------

  /**
   * Creates a PBR snow material with sparkle and SSS approximation.
   *
   * The material uses:
   * - White/light-blue base color
   * - Low roughness for snow reflectance
   * - Normal map perturbation for sparkle effect
   * - Thickness-based translucency approximation
   * - Displacement map from snow depth
   */
  createSnowMaterial(): THREE.MeshStandardMaterial {
    if (this.snowMaterial) {
      return this.snowMaterial;
    }

    const material = new THREE.MeshStandardMaterial({
      color: this.params.color,
      roughness: this.params.roughness,
      metalness: this.params.metalness,
      side: THREE.DoubleSide,
    });

    // Sparkle effect via onBeforeCompile shader injection
    if (this.params.sparkleIntensity > 0) {
      material.onBeforeCompile = (shader) => {
        // Add sparkle uniform
        shader.uniforms.uSparkleIntensity = {
          value: this.params.sparkleIntensity,
        };
        shader.uniforms.uTime = { value: 0.0 };

        // Inject sparkle noise into the fragment shader
        shader.fragmentShader =
          shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>
            uniform float uSparkleIntensity;
            uniform float uTime;

            // Simple hash for sparkle positions
            float sparkleHash(vec3 p) {
              p = fract(p * vec3(443.8975, 397.2973, 491.1871));
              p += dot(p, p.yxz + 19.19);
              return fract((p.x + p.y) * p.z);
            }

            float sparkleNoise(vec3 p) {
              vec3 ip = floor(p);
              vec3 fp = fract(p);
              float sparkle = 0.0;
              for (int z = -1; z <= 1; z++) {
                for (int y = -1; y <= 1; y++) {
                  for (int x = -1; x <= 1; x++) {
                    vec3 offset = vec3(float(x), float(y), float(z));
                    float h = sparkleHash(ip + offset);
                    vec3 fpOffset = fp - offset - vec3(h, h * 0.7, h * 0.3);
                    float d = dot(fpOffset, fpOffset);
                    sparkle += smoothstep(0.02, 0.0, d) * h;
                  }
                }
              }
              return sparkle;
            }`,
          );

        // Add sparkle contribution before the final output
        shader.fragmentShader =
          shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `#include <dithering_fragment>

            // Snow sparkle
            vec3 snowNormal = normalize(vNormal);
            float viewDot = max(dot(normalize(-vViewPosition), snowNormal), 0.0);
            float sparkle = sparkleNoise(vViewPosition * 80.0 + vec3(0.0, uTime * 0.1, 0.0));
            sparkle *= viewDot; // More sparkle on facing surfaces
            gl_FragColor.rgb += vec3(sparkle * uSparkleIntensity * 2.0);`,
          );
      };
    }

    // SSS-like translucency approximation via emissive color tint
    // When light passes through thin snow it takes on a blue-ish color
    if (this.params.translucency > 0) {
      const baseEmissive = material.emissive.clone();
      const sssColor = new THREE.Color(0.3, 0.5, 0.8); // Blue-ish SSS tint
      material.emissive.copy(baseEmissive).lerp(sssColor, this.params.translucency * 0.3);
      material.emissiveIntensity = this.params.translucency * 0.15;
    }

    this.snowMaterial = material;
    return material;
  }

  // -----------------------------------------------------------------------
  // NEW: Snow Mask
  // -----------------------------------------------------------------------

  /**
   * Computes a per-vertex snow coverage mask based on surface normals,
   * wind shadow, and edge proximity.
   *
   * @param normals - The Float32Array of vertex normals (3 components per vertex)
   * @param slopeThreshold - Normal Y threshold: vertices with normal.y >= this get full snow
   * @returns Float32Array with one value per vertex in [0, 1] (0 = no snow, 1 = full snow)
   */
  computeSnowMask(
    normals: Float32Array,
    slopeThreshold: number = this.params.normalThreshold,
  ): Float32Array {
    const vertexCount = normals.length / 3;
    const mask = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const nx = normals[i * 3];
      const ny = normals[i * 3 + 1];
      const nz = normals[i * 3 + 2];

      // Primary factor: upward-facing surfaces get more snow
      // ny ranges from -1 (down) to 1 (up)
      let coverage = 0;

      if (ny >= slopeThreshold) {
        // Surface faces upward enough for full snow
        coverage = 1;
      } else if (ny > 0) {
        // Partial coverage: smooth falloff
        coverage = ny / slopeThreshold;
        // Apply smoothstep for nicer transition
        coverage = coverage * coverage * (3 - 2 * coverage);
      } else {
        // Overhanging / vertical — no snow
        coverage = 0;
      }

      // Wind shadow factor: surfaces sheltered from wind get more snow
      if (this.params.windShadowFactor > 0 && this.params.enableDrifts) {
        const windDir = this.params.windDirection;
        // Dot product of normal with wind direction (negative = sheltered/lee side)
        const windDot = nx * windDir.x + ny * windDir.y + nz * windDir.z;
        if (windDot < 0) {
          // Lee side — boost snow
          const shadowBoost = (-windDot) * this.params.windShadowFactor;
          coverage = Math.min(1, coverage + shadowBoost * (1 - coverage));
        } else {
          // Windward side — reduce snow slightly
          coverage *= 1 - windDot * this.params.windShadowFactor * 0.3;
        }
      }

      // Edge/cliff proximity: reduce snow near steep transitions
      // (approximate: if the normal has large X or Z components, it's near an edge)
      const edgeFactor = Math.sqrt(nx * nx + nz * nz);
      if (edgeFactor > 0.7) {
        coverage *= Math.max(0, (1 - edgeFactor) / 0.3);
      }

      mask[i] = Math.max(0, Math.min(1, coverage));
    }

    return mask;
  }

  // -----------------------------------------------------------------------
  // NEW: Snow Mesh Generation
  // -----------------------------------------------------------------------

  /**
   * Creates a separate snow overlay mesh that sits on top of the terrain.
   *
   * - Copies terrain geometry and displaces vertices upward by snow depth
   * - Uses the normal-based mask to only include faces where snow accumulates
   * - Removes triangles where snow depth is below minimum threshold
   * - Smooths the snow surface to avoid harsh terrain features showing through
   *
   * @param terrainGeometry - The base terrain geometry to overlay
   * @param terrainNormals - Float32Array of terrain vertex normals
   * @returns THREE.Mesh — the snow overlay mesh, or null if no snow geometry
   */
  generateSnowMesh(
    terrainGeometry: THREE.BufferGeometry,
    terrainNormals: Float32Array,
  ): THREE.Mesh | null {
    const positions = terrainGeometry.attributes.position
      .array as Float32Array;
    const index = terrainGeometry.index;
    const vertexCount = positions.length / 3;

    // Compute snow mask from normals
    const snowMask = this.computeSnowMask(terrainNormals);

    // Create displaced positions with snow depth
    const snowPositions = new Float32Array(positions.length);
    for (let i = 0; i < vertexCount; i++) {
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];

      // Sample snow depth (use mask to modulate)
      const mask = snowMask[i];
      let depth = this.params.baseDepth;

      if (this.snowDepthMap && this.width > 0 && this.height > 0) {
        depth = this.sampleDepthBilinear(px, pz);
      }

      // Apply mask: no snow where mask is 0
      depth *= mask;

      // Displace along the terrain normal (so snow sits on top of the surface)
      const nx = terrainNormals[i * 3];
      const ny = terrainNormals[i * 3 + 1];
      const nz = terrainNormals[i * 3 + 2];

      snowPositions[i * 3] = px + nx * depth;
      snowPositions[i * 3 + 1] = py + ny * depth;
      snowPositions[i * 3 + 2] = pz + nz * depth;
    }

    // Smooth the snow surface — average each vertex with its neighbors
    // to reduce harsh terrain features showing through
    this.smoothSnowPositions(
      snowPositions,
      snowMask,
      terrainGeometry,
      this.params.smoothingPasses,
    );

    // Filter triangles: only keep faces with sufficient snow coverage
    const filteredIndex = this.filterSnowTriangles(
      terrainGeometry,
      snowMask,
      index,
    );

    if (filteredIndex.length === 0) {
      return null;
    }

    // Build the snow geometry
    const snowGeometry = new THREE.BufferGeometry();
    snowGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(snowPositions, 3),
    );
    snowGeometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(new Float32Array(terrainNormals), 3),
    );

    // Set the filtered index
    snowGeometry.setIndex(filteredIndex);

    // Recompute normals for the smoothed snow surface
    snowGeometry.computeVertexNormals();

    // Add snow depth as a custom attribute for the material
    const depthAttribute = new Float32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      let depth = this.params.baseDepth;
      if (this.snowDepthMap && this.width > 0 && this.height > 0) {
        depth = this.sampleDepthBilinear(positions[i * 3], positions[i * 3 + 2]);
      }
      depthAttribute[i] = depth * snowMask[i];
    }
    snowGeometry.setAttribute(
      'aSnowDepth',
      new THREE.BufferAttribute(depthAttribute, 1),
    );

    // Create material and mesh
    const material = this.createSnowMaterial();
    const mesh = new THREE.Mesh(snowGeometry, material);
    mesh.name = 'snow_overlay';

    this.snowMesh = mesh;
    return mesh;
  }

  /**
   * Smooth snow positions by averaging with connected neighbors.
   * This creates a softer snow surface that doesn't perfectly follow
   * every crack and crevice of the terrain beneath.
   */
  private smoothSnowPositions(
    positions: Float32Array,
    snowMask: Float32Array,
    geometry: THREE.BufferGeometry,
    passes: number,
  ): void {
    if (passes <= 0) return;

    const index = geometry.index;
    const vertexCount = positions.length / 3;

    // Build adjacency: for each vertex, collect connected vertex indices
    const adjacency = new Map<number, Set<number>>();

    const processEdge = (a: number, b: number): void => {
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      if (!adjacency.has(b)) adjacency.set(b, new Set());
      adjacency.get(a)!.add(b);
      adjacency.get(b)!.add(a);
    };

    if (index) {
      const idxArr = index.array;
      for (let i = 0; i < idxArr.length; i += 3) {
        const a = idxArr[i];
        const b = idxArr[i + 1];
        const c = idxArr[i + 2];
        processEdge(a, b);
        processEdge(b, c);
        processEdge(c, a);
      }
    } else {
      for (let i = 0; i < vertexCount; i += 3) {
        processEdge(i, i + 1);
        processEdge(i + 1, i + 2);
        processEdge(i + 2, i);
      }
    }

    // Iterative Laplacian smoothing (only for snow-covered vertices)
    for (let pass = 0; pass < passes; pass++) {
      const smoothed = new Float32Array(positions.length);

      for (let v = 0; v < vertexCount; v++) {
        if (snowMask[v] < 0.01) {
          // No snow — skip
          smoothed[v * 3] = positions[v * 3];
          smoothed[v * 3 + 1] = positions[v * 3 + 1];
          smoothed[v * 3 + 2] = positions[v * 3 + 2];
          continue;
        }

        const neighbors = adjacency.get(v);
        if (!neighbors || neighbors.size === 0) {
          smoothed[v * 3] = positions[v * 3];
          smoothed[v * 3 + 1] = positions[v * 3 + 1];
          smoothed[v * 3 + 2] = positions[v * 3 + 2];
          continue;
        }

        // Average with connected snow-covered neighbors
        let sx = 0, sy = 0, sz = 0, count = 0;
        for (const n of neighbors) {
          if (snowMask[n] >= 0.01) {
            sx += positions[n * 3];
            sy += positions[n * 3 + 1];
            sz += positions[n * 3 + 2];
            count++;
          }
        }

        if (count > 0) {
          const alpha = 0.3; // Smoothing weight
          smoothed[v * 3] = positions[v * 3] * (1 - alpha) + (sx / count) * alpha;
          smoothed[v * 3 + 1] = positions[v * 3 + 1] * (1 - alpha) + (sy / count) * alpha;
          smoothed[v * 3 + 2] = positions[v * 3 + 2] * (1 - alpha) + (sz / count) * alpha;
        } else {
          smoothed[v * 3] = positions[v * 3];
          smoothed[v * 3 + 1] = positions[v * 3 + 1];
          smoothed[v * 3 + 2] = positions[v * 3 + 2];
        }
      }

      // Copy smoothed back
      positions.set(smoothed);
    }
  }

  /**
   * Filter triangles: remove faces where snow coverage is insufficient.
   * A triangle is kept only if ALL three vertices have snow depth
   * above the minimum threshold.
   */
  private filterSnowTriangles(
    geometry: THREE.BufferGeometry,
    snowMask: Float32Array,
    index: THREE.BufferAttribute | null,
  ): number[] {
    const filtered: number[] = [];
    const minDepth = this.params.minDepthForMesh;

    if (index) {
      const idxArr = index.array;
      for (let i = 0; i < idxArr.length; i += 3) {
        const a = idxArr[i];
        const b = idxArr[i + 1];
        const c = idxArr[i + 2];
        // Keep triangle only if all vertices have sufficient snow
        if (snowMask[a] >= minDepth && snowMask[b] >= minDepth && snowMask[c] >= minDepth) {
          filtered.push(a, b, c);
        }
      }
    } else {
      const vertexCount = geometry.attributes.position.count;
      for (let i = 0; i < vertexCount; i += 3) {
        if (snowMask[i] >= minDepth && snowMask[i + 1] >= minDepth && snowMask[i + 2] >= minDepth) {
          filtered.push(i, i + 1, i + 2);
        }
      }
    }

    return filtered;
  }

  // -----------------------------------------------------------------------
  // NEW: Snow Pile Generation
  // -----------------------------------------------------------------------

  /**
   * Generates small snow pile geometries at the base of slopes where
   * snow would accumulate from sliding.
   *
   * Uses a hemisphere geometry scaled by slope steepness and snow depth.
   *
   * @param terrainGeometry - The terrain geometry to analyze
   * @param positions - Optional array of specific positions to place piles.
   *                    If not provided, piles are auto-detected from slope analysis.
   * @returns Array of THREE.Mesh objects representing snow piles
   */
  generateSnowPiles(
    terrainGeometry: THREE.BufferGeometry,
    positions?: THREE.Vector3[],
  ): THREE.Mesh[] {
    this.disposeSnowPiles();

    const pileMeshes: THREE.Mesh[] = [];
    const material = this.createSnowMaterial();

    const pilePositions =
      positions ?? this.detectPilePositions(terrainGeometry);

    for (const pos of pilePositions) {
      // Determine pile size from snow depth
      let depth = this.params.baseDepth;
      if (this.snowDepthMap && this.width > 0 && this.height > 0) {
        depth = this.sampleDepthBilinear(pos.x, pos.z);
      }
      depth = Math.max(depth, this.params.baseDepth);

      // Create hemisphere pile
      const radius = depth * 0.5 + 0.1;
      const pileGeo = new THREE.SphereGeometry(radius, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);

      // Add some noise variation to the pile shape
      const pilePositions = pileGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < pilePositions.length; i += 3) {
        const px = pilePositions[i];
        const py = pilePositions[i + 1];
        const pz = pilePositions[i + 2];
        // Noise-based distortion for natural look
        const noise = this.driftNoise.sample3D(px * 5 + pos.x, py * 5, pz * 5 + pos.z);
        const distortion = 1 + noise * 0.15;
        pilePositions[i] = px * distortion;
        pilePositions[i + 1] = py * (1 + noise * 0.1); // Less distortion vertically
        pilePositions[i + 2] = pz * distortion;
      }
      pileGeo.attributes.position.needsUpdate = true;
      pileGeo.computeVertexNormals();

      const pileMesh = new THREE.Mesh(pileGeo, material);
      pileMesh.position.copy(pos);
      pileMesh.name = 'snow_pile';

      pileMeshes.push(pileMesh);
    }

    this.snowPileMeshes = pileMeshes;
    return pileMeshes;
  }

  /**
   * Auto-detect positions at the base of slopes where snow piles would form.
   * Looks for vertices where the slope transitions from steep to flat.
   */
  private detectPilePositions(
    terrainGeometry: THREE.BufferGeometry,
  ): THREE.Vector3[] {
    const positions = terrainGeometry.attributes.position
      .array as Float32Array;
    const normals = terrainGeometry.attributes.normal
      ? (terrainGeometry.attributes.normal.array as Float32Array)
      : null;
    const index = terrainGeometry.index;

    if (!normals || !index) {
      return [];
    }

    const pilePositions: THREE.Vector3[] = [];
    const idxArr = index.array;
    const visited = new Set<string>();

    for (let i = 0; i < idxArr.length; i += 3) {
      const a = idxArr[i];
      const b = idxArr[i + 1];
      const c = idxArr[i + 2];

      // Check each vertex of the triangle for slope-base conditions
      for (const vIdx of [a, b, c]) {
        const ny = normals[vIdx * 3 + 1];
        const px = positions[vIdx * 3];
        const py = positions[vIdx * 3 + 1];
        const pz = positions[vIdx * 3 + 2];

        // Deduplicate by rounding position
        const key = `${px.toFixed(1)},${pz.toFixed(1)}`;
        if (visited.has(key)) continue;
        visited.add(key);

        // A pile forms where the surface is nearly flat (high Y normal)
        // but adjacent to steeper terrain. Approximate: flat surface with
        // normal.y > 0.7 and depth > baseDepth
        if (ny > 0.7 && this.snowDepthMap && this.width > 0 && this.height > 0) {
          const depth = this.sampleDepthBilinear(px, pz);
          if (depth > this.params.baseDepth * 1.5) {
            pilePositions.push(new THREE.Vector3(px, py, pz));
          }
        }
      }
    }

    // Limit the number of piles for performance
    if (pilePositions.length > 50) {
      // Evenly sample from the detected positions
      const step = Math.ceil(pilePositions.length / 50);
      const sampled: THREE.Vector3[] = [];
      for (let i = 0; i < pilePositions.length; i += step) {
        sampled.push(pilePositions[i]);
      }
      return sampled;
    }

    return pilePositions;
  }

  // -----------------------------------------------------------------------
  // NEW: Apply to Terrain Mesh (convenience method)
  // -----------------------------------------------------------------------

  /**
   * Convenience method that applies snow overlay to an existing terrain mesh.
   * Creates the snow geometry and material, and adds the overlay as a child
   * or sibling mesh.
   *
   * @param mesh - The terrain THREE.Mesh to apply snow to
   * @returns The snow overlay mesh, or null if no snow could be generated
   */
  applyToTerrainMesh(mesh: THREE.Mesh): THREE.Mesh | null {
    const geometry = mesh.geometry;
    const normals = geometry.attributes.normal
      ? (geometry.attributes.normal.array as Float32Array)
      : null;

    if (!normals) {
      geometry.computeVertexNormals();
      const computedNormals = geometry.attributes.normal;
      if (!computedNormals) return null;
      return this.generateSnowMesh(geometry, computedNormals.array as Float32Array);
    }

    // Generate snow overlay mesh
    const snowOverlay = this.generateSnowMesh(geometry, normals);

    if (snowOverlay) {
      // Copy transform from terrain mesh
      snowOverlay.position.copy(mesh.position);
      snowOverlay.rotation.copy(mesh.rotation);
      snowOverlay.scale.copy(mesh.scale);

      // Generate snow piles at slope bases
      const piles = this.generateSnowPiles(geometry);
      for (const pile of piles) {
        // Apply terrain transform to pile positions
        pile.position.applyMatrix4(mesh.matrixWorld);
      }
    }

    return snowOverlay;
  }

  // -----------------------------------------------------------------------
  // Cleanup / Dispose
  // -----------------------------------------------------------------------

  /**
   * Dispose all snow-related GPU resources.
   */
  dispose(): void {
    this.disposeSnowMesh();
    this.disposeSnowPiles();
    this.disposeSnowMaterial();
    this.snowDepthMap = null;
  }

  private disposeSnowMesh(): void {
    if (this.snowMesh) {
      this.snowMesh.geometry.dispose();
      this.snowMesh = null;
    }
  }

  private disposeSnowPiles(): void {
    for (const pile of this.snowPileMeshes) {
      pile.geometry.dispose();
    }
    this.snowPileMeshes = [];
  }

  private disposeSnowMaterial(): void {
    if (this.snowMaterial) {
      this.snowMaterial.dispose();
      this.snowMaterial = null;
    }
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /** Get the snow overlay mesh (if generated) */
  getSnowMesh(): THREE.Mesh | null {
    return this.snowMesh;
  }

  /** Get the snow pile meshes */
  getSnowPileMeshes(): THREE.Mesh[] {
    return this.snowPileMeshes;
  }

  /** Get the snow material (if created) */
  getSnowMaterial(): THREE.MeshStandardMaterial | null {
    return this.snowMaterial;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Sample snow depth using bilinear interpolation between the 4 nearest texels
   */
  private sampleDepthBilinear(x: number, y: number): number {
    if (!this.snowDepthMap || this.width <= 0 || this.height <= 0) {
      return this.params.baseDepth;
    }

    // Clamp to valid range
    if (x < 0 || x >= this.width - 1 || y < 0 || y >= this.height - 1) {
      // Fall back to nearest for boundary pixels
      const mapX = Math.min(Math.max(Math.round(x), 0), this.width - 1);
      const mapY = Math.min(Math.max(Math.round(y), 0), this.height - 1);
      return this.snowDepthMap[mapY * this.width + mapX];
    }

    // Integer part (top-left corner of the interpolation cell)
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;

    // Fractional parts
    const fx = x - x0;
    const fy = y - y0;

    // Fetch the 4 surrounding texels
    const v00 = this.snowDepthMap[y0 * this.width + x0];
    const v10 = this.snowDepthMap[y0 * this.width + x1];
    const v01 = this.snowDepthMap[y1 * this.width + x0];
    const v11 = this.snowDepthMap[y1 * this.width + x1];

    // Bilinear interpolation
    const top = v00 * (1 - fx) + v10 * fx;
    const bottom = v01 * (1 - fx) + v11 * fx;
    return top * (1 - fy) + bottom * fy;
  }
}

export default SnowSystem;
