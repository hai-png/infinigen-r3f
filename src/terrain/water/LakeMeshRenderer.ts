/**
 * LakeMeshRenderer - Generates visible lake water surfaces
 *
 * Creates flat circular/irregular water surfaces at specified altitude with:
 * - Noise-based shoreline for natural lake shapes
 * - Gentle wave displacement
 * - Depth-based color gradient
 * - Fresnel-based reflection
 * - Subsurface scattering approximation (green/blue tint in shallow areas)
 * - Support for multiple lakes per scene
 *
 * Uses THREE.MeshPhysicalMaterial for realistic water rendering.
 */

import * as THREE from 'three';
import { NoiseUtils } from '@/core/util/math/noise';
import { createCanvas } from '@/assets/utils/CanvasUtils';

// ============================================================================
// Configuration
// ============================================================================

export interface LakeMeshConfig {
  /** Default water altitude (Y position) when not specified per-lake */
  defaultAltitude: number;
  /** Lake surface resolution (vertices per side) (default 64) */
  resolution: number;
  /** Wave amplitude (default 0.08) */
  waveAmplitude: number;
  /** Wave frequency (default 0.3) */
  waveFrequency: number;
  /** Wave speed (default 0.5) */
  waveSpeed: number;
  /** Deep water color (default dark blue) */
  deepColor: THREE.Color;
  /** Shallow water color (default light turquoise) */
  shallowColor: THREE.Color;
  /** SSS tint color for shallow areas (default green-blue) */
  sssColor: THREE.Color;
  /** Shoreline noise scale (default 0.02) */
  shorelineNoiseScale: number;
  /** Shoreline noise amplitude (default 0.15) */
  shorelineNoiseAmplitude: number;
  /** Normal map resolution (default 256) */
  normalMapResolution: number;
}

export interface LakeDefinition {
  /** Center X position */
  centerX: number;
  /** Center Z position */
  centerZ: number;
  /** Base radius of the lake */
  radius: number;
  /** Water surface altitude (Y position) */
  altitude: number;
  /** Optional seed for this lake's shoreline noise */
  seed?: number;
}

// ============================================================================
// LakeMeshRenderer
// ============================================================================

export class LakeMeshRenderer {
  private config: LakeMeshConfig;
  private noise: NoiseUtils;
  private time: number = 0;
  private group: THREE.Group;
  private materials: THREE.MeshPhysicalMaterial[] = [];
  private lakeData: {
    definition: LakeDefinition;
    mesh: THREE.Mesh;
    geometry: THREE.BufferGeometry;
  }[] = [];
  private normalMap: THREE.CanvasTexture | null = null;

  constructor(config: Partial<LakeMeshConfig> = {}) {
    this.config = {
      defaultAltitude: 0,
      resolution: 64,
      waveAmplitude: 0.08,
      waveFrequency: 0.3,
      waveSpeed: 0.5,
      deepColor: new THREE.Color(0x0a2f4c),
      shallowColor: new THREE.Color(0x3cb8a0),
      sssColor: new THREE.Color(0x20aa70),
      shorelineNoiseScale: 0.02,
      shorelineNoiseAmplitude: 0.15,
      normalMapResolution: 256,
      ...config,
    };
    this.noise = new NoiseUtils(42);
    this.group = new THREE.Group();
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Build meshes for an array of lake definitions.
   * Returns a Three.js Group containing all lake water surfaces.
   */
  buildMeshes(lakes: LakeDefinition[]): THREE.Group {
    // Clear previous meshes
    this.dispose();

    // Generate normal map
    this.normalMap = this.createLakeNormalMap();

    for (const lakeDef of lakes) {
      const mesh = this.buildSingleLake(lakeDef);
      this.group.add(mesh);
    }

    return this.group;
  }

  /**
   * Advance wave animation. Call from useFrame.
   */
  update(dt: number): void {
    this.time += dt;

    // Animate gentle wave displacement on each lake
    for (const lake of this.lakeData) {
      const { definition, geometry } = lake;
      const positions = geometry.attributes.position as THREE.BufferAttribute;
      const baseAltitude = definition.altitude;

      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);

        // Gentle wave displacement
        const wave1 = Math.sin(
          x * this.config.waveFrequency + this.time * this.config.waveSpeed
        ) * this.config.waveAmplitude;
        const wave2 = Math.sin(
          z * this.config.waveFrequency * 1.3 + this.time * this.config.waveSpeed * 0.7
        ) * this.config.waveAmplitude * 0.5;
        const wave3 = Math.sin(
          (x + z) * this.config.waveFrequency * 0.7 + this.time * this.config.waveSpeed * 1.2
        ) * this.config.waveAmplitude * 0.3;

        positions.setY(i, baseAltitude + wave1 + wave2 + wave3);
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
    }
  }

  /**
   * Get the group containing all lake meshes
   */
  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Check if a world position is inside any lake
   */
  isPositionInLake(x: number, z: number): LakeDefinition | null {
    for (const lake of this.lakeData) {
      const def = lake.definition;
      const dx = x - def.centerX;
      const dz = z - def.centerZ;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Account for shoreline noise
      const noiseVal = this.noise.perlin2D(
        x * this.config.shorelineNoiseScale,
        z * this.config.shorelineNoiseScale
      );
      const effectiveRadius = def.radius * (1.0 + noiseVal * this.config.shorelineNoiseAmplitude);

      if (dist < effectiveRadius) {
        return def;
      }
    }
    return null;
  }

  /**
   * Get water level at a position, or null if not in a lake
   */
  getWaterLevelAt(x: number, z: number): number | null {
    const lake = this.isPositionInLake(x, z);
    if (lake) {
      return lake.altitude;
    }
    return null;
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    for (const lake of this.lakeData) {
      lake.geometry.dispose();
    }
    for (const mat of this.materials) {
      mat.dispose();
    }
    if (this.normalMap) {
      this.normalMap.dispose();
      this.normalMap = null;
    }
    this.lakeData = [];
    this.materials = [];
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
  }

  // ------------------------------------------------------------------
  // Lake Geometry
  // ------------------------------------------------------------------

  /**
   * Build a single lake mesh from definition
   */
  private buildSingleLake(lakeDef: LakeDefinition): THREE.Mesh {
    const res = this.config.resolution;
    const { centerX, centerZ, radius, altitude } = lakeDef;
    const seed = lakeDef.seed ?? 42;
    const lakeNoise = new NoiseUtils(seed);

    // Create a disc geometry with noise-based shoreline
    const geometry = new THREE.CircleGeometry(radius, res);
    geometry.rotateX(-Math.PI / 2);

    // Apply shoreline deformation and depth-based vertex colors
    const positions = geometry.attributes.position as THREE.BufferAttribute;
    const colorArray = new Float32Array(positions.count * 3);

    for (let i = 0; i < positions.count; i++) {
      let x = positions.getX(i);
      let z = positions.getZ(i);

      // Offset to world position
      const worldX = x + centerX;
      const worldZ = z + centerZ;

      // Noise-based shoreline deformation
      const shoreNoise = lakeNoise.perlin2D(
        worldX * this.config.shorelineNoiseScale,
        worldZ * this.config.shorelineNoiseScale
      );
      const shoreOffset = shoreNoise * radius * this.config.shorelineNoiseAmplitude;

      // Distance from center relative to deformed radius
      const dist = Math.sqrt(x * x + z * z);
      const effectiveRadius = radius + shoreOffset;

      // Cull vertices outside the deformed shoreline
      if (dist > effectiveRadius && dist > 0.001) {
        // Push them to the shoreline edge
        const scale = effectiveRadius / dist;
        x *= scale;
        z *= scale;
      }

      positions.setX(i, x);
      positions.setZ(i, z);
      positions.setY(i, altitude);

      // Depth factor (0 = edge/shallow, 1 = center/deep)
      const normalizedDist = Math.min(dist / Math.max(radius, 0.001), 1.0);
      const depthFactor = 1.0 - normalizedDist;

      // Vertex color: blend between shallow and deep with SSS in shallow areas
      const sssAmount = (1.0 - depthFactor) * 0.4; // More SSS near edges
      const r = this.config.shallowColor.r + (this.config.deepColor.r - this.config.shallowColor.r) * depthFactor
                + this.config.sssColor.r * sssAmount;
      const g = this.config.shallowColor.g + (this.config.deepColor.g - this.config.shallowColor.g) * depthFactor
                + this.config.sssColor.g * sssAmount;
      const b = this.config.shallowColor.b + (this.config.deepColor.b - this.config.shallowColor.b) * depthFactor
                + this.config.sssColor.b * sssAmount;

      colorArray[i * 3] = Math.min(r, 1);
      colorArray[i * 3 + 1] = Math.min(g, 1);
      colorArray[i * 3 + 2] = Math.min(b, 1);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorArray, 3));
    geometry.computeVertexNormals();

    // Create material
    const material = this.createLakeMaterial();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(centerX, 0, centerZ); // X/Z offset handled in geometry
    mesh.renderOrder = 997;
    mesh.frustumCulled = false;

    this.lakeData.push({ definition: lakeDef, mesh, geometry });
    this.materials.push(material);

    return mesh;
  }

  // ------------------------------------------------------------------
  // Material
  // ------------------------------------------------------------------

  /**
   * Create lake water material with Fresnel, SSS approximation
   */
  private createLakeMaterial(): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x1a6b8a),
      transparent: true,
      opacity: 0.88,
      roughness: 0.1,
      metalness: 0.05,
      transmission: 0.7,
      thickness: 1.0,
      ior: 1.33,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      envMapIntensity: 2.0,
      vertexColors: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    if (this.normalMap) {
      material.normalMap = this.normalMap;
      material.normalScale = new THREE.Vector2(0.2, 0.2);
    }

    this.materials.push(material);
    return material;
  }

  /**
   * Create a gentle wave normal map for lake surfaces
   */
  private createLakeNormalMap(): THREE.CanvasTexture | null {
    try {
      const canvas = createCanvas();
      const res = this.config.normalMapResolution;
      canvas.width = res;
      canvas.height = res;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const imageData = ctx.createImageData(res, res);
      const data = imageData.data;

      for (let y = 0; y < res; y++) {
        for (let x = 0; x < res; x++) {
          const idx = (y * res + x) * 4;

          // Gentle, multi-frequency wave pattern
          const n1 = this.noise.perlin2D(x * 0.03, y * 0.03);
          const n2 = this.noise.perlin2D(x * 0.08 + 100, y * 0.08 + 100) * 0.5;
          const combined = n1 + n2;

          const nx = combined * 0.5 + 0.5;
          const ny = this.noise.perlin2D(x * 0.04 + 50, y * 0.04 + 50) * 0.5 + 0.5;

          data[idx] = Math.floor(nx * 255);
          data[idx + 1] = Math.floor(ny * 255);
          data[idx + 2] = 255;
          data[idx + 3] = 255;
        }
      }

      ctx.putImageData(imageData, 0, 0);

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(3, 3);

      return texture;
    } catch (err) {
      // Expected fallback in rendering pipeline
      if (process.env.NODE_ENV === 'development') console.debug('[LakeMeshRenderer] caustic texture creation fallback:', err);
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Configuration
  // ------------------------------------------------------------------

  updateConfig(partial: Partial<LakeMeshConfig>): void {
    Object.assign(this.config, partial);
  }

  getConfig(): LakeMeshConfig {
    return { ...this.config };
  }
}
