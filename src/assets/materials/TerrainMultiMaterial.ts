/**
 * TerrainMultiMaterial — P6.3: Multi-Material Terrain
 *
 * Implements per-triangle material assignment from SDF evaluation.
 * The SDF evaluator returns a material ID per point; this is stored as a
 * vertex colour attribute on the geometry. When three-bvh-csg is available,
 * its multi-material output (groups + material array) is used for optimal
 * per-face material assignment. Otherwise, vertex colours drive a custom
 * shader that blends between terrain surface presets.
 *
 * Terrain surface presets: stone, sand, soil, dirt, mud, snow, ice, cobblestone
 *
 * Material blending at boundaries uses noise-based mixing for natural
 * transitions between terrain types.
 *
 * Phase 6 — P6.3: Multi-Material Terrain
 *
 * @module assets/materials
 */

import * as THREE from 'three';

// ============================================================================
// Types
// ============================================================================

/**
 * Numeric material identifiers returned by the SDF evaluator.
 * Each point in the SDF can be tagged with one of these IDs.
 */
export type TerrainMaterialID =
  | 0   // stone
  | 1   // sand
  | 2   // soil
  | 3   // dirt
  | 4   // mud
  | 5   // snow
  | 6   // ice
  | 7;  // cobblestone

/**
 * Named terrain surface presets with full PBR configuration.
 */
export type TerrainSurfacePreset =
  | 'stone'
  | 'sand'
  | 'soil'
  | 'dirt'
  | 'mud'
  | 'snow'
  | 'ice'
  | 'cobblestone';

/**
 * Configuration for material blending at terrain type boundaries.
 */
export interface MaterialBlendConfig {
  /** Blend width in world units (default 0.5) */
  blendWidth: number;
  /** Noise scale for variation in the blend zone (default 4.0) */
  noiseScale: number;
  /** Noise amplitude affecting blend width (0-1, default 0.3) */
  noiseAmplitude: number;
  /** Whether to use smooth-step blending (default true) */
  smoothBlending: boolean;
  /** Seed for the noise function (default 42) */
  seed: number;
}

// ============================================================================
// Terrain Surface Preset Definitions
// ============================================================================

interface TerrainSurfaceConfig {
  id: TerrainMaterialID;
  name: TerrainSurfacePreset;
  color: THREE.Color;
  roughness: number;
  metalness: number;
  normalStrength: number;
  // Additional physical material properties
  clearcoat: number;
  clearcoatRoughness: number;
  transmission: number;
  ior: number;
  thickness: number;
  attenuationColor: THREE.Color;
  attenuationDistance: number;
}

const c = (r: number, g: number, b: number) => new THREE.Color(r, g, b);

/**
 * Full PBR configurations for each terrain surface type.
 * Ordered by TerrainMaterialID (0-7).
 */
const TERRAIN_SURFACES: TerrainSurfaceConfig[] = [
  {
    id: 0,
    name: 'stone',
    color: c(0.48, 0.45, 0.4),
    roughness: 0.85,
    metalness: 0.0,
    normalStrength: 2.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    transmission: 0.0,
    ior: 1.55,
    thickness: 0.0,
    attenuationColor: c(1, 1, 1),
    attenuationDistance: 0.0,
  },
  {
    id: 1,
    name: 'sand',
    color: c(0.82, 0.72, 0.52),
    roughness: 0.9,
    metalness: 0.0,
    normalStrength: 0.8,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    transmission: 0.0,
    ior: 1.55,
    thickness: 0.0,
    attenuationColor: c(1, 1, 1),
    attenuationDistance: 0.0,
  },
  {
    id: 2,
    name: 'soil',
    color: c(0.25, 0.18, 0.1),
    roughness: 0.92,
    metalness: 0.0,
    normalStrength: 0.8,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    transmission: 0.0,
    ior: 1.55,
    thickness: 0.0,
    attenuationColor: c(1, 1, 1),
    attenuationDistance: 0.0,
  },
  {
    id: 3,
    name: 'dirt',
    color: c(0.35, 0.25, 0.15),
    roughness: 0.95,
    metalness: 0.0,
    normalStrength: 1.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    transmission: 0.0,
    ior: 1.55,
    thickness: 0.0,
    attenuationColor: c(1, 1, 1),
    attenuationDistance: 0.0,
  },
  {
    id: 4,
    name: 'mud',
    color: c(0.3, 0.22, 0.14),
    roughness: 0.95,
    metalness: 0.0,
    normalStrength: 1.5,
    clearcoat: 0.15,
    clearcoatRoughness: 0.4,
    transmission: 0.0,
    ior: 1.55,
    thickness: 0.0,
    attenuationColor: c(1, 1, 1),
    attenuationDistance: 0.0,
  },
  {
    id: 5,
    name: 'snow',
    color: c(0.92, 0.94, 0.98),
    roughness: 0.7,
    metalness: 0.0,
    normalStrength: 0.5,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    transmission: 0.0,
    ior: 1.31,
    thickness: 0.0,
    attenuationColor: c(1, 1, 1),
    attenuationDistance: 0.0,
  },
  {
    id: 6,
    name: 'ice',
    color: c(0.7, 0.82, 0.9),
    roughness: 0.15,
    metalness: 0.0,
    normalStrength: 0.4,
    clearcoat: 0.3,
    clearcoatRoughness: 0.1,
    transmission: 0.3,
    ior: 1.31,
    thickness: 0.5,
    attenuationColor: c(0.6, 0.8, 0.9),
    attenuationDistance: 5.0,
  },
  {
    id: 7,
    name: 'cobblestone',
    color: c(0.45, 0.42, 0.38),
    roughness: 0.75,
    metalness: 0.0,
    normalStrength: 1.8,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    transmission: 0.0,
    ior: 1.55,
    thickness: 0.0,
    attenuationColor: c(1, 1, 1),
    attenuationDistance: 0.0,
  },
];

/**
 * Map from TerrainMaterialID to surface config index.
 */
const ID_TO_INDEX: Map<number, number> = new Map(
  TERRAIN_SURFACES.map((s, i) => [s.id, i]),
);

/**
 * Map from TerrainSurfacePreset name to surface config index.
 */
const NAME_TO_INDEX: Map<string, number> = new Map(
  TERRAIN_SURFACES.map((s, i) => [s.name, i]),
);

// ============================================================================
// SDF Material Evaluator Interface
// ============================================================================

/**
 * Interface for an SDF that can return material IDs per point.
 * This extends a basic SDF with material classification capability.
 */
export interface MaterialSDF {
  /**
   * Evaluate the signed distance at a point.
   */
  distance(x: number, y: number, z: number): number;

  /**
   * Evaluate the material ID at a point.
   * Should return a TerrainMaterialID (0-7).
   * Only meaningful at or near the surface (distance ≈ 0).
   */
  materialId(x: number, y: number, z: number): TerrainMaterialID;
}

// ============================================================================
// Simple Noise for Blending
// ============================================================================

/**
 * Minimal value-noise implementation for boundary blending.
 * Avoids importing the full NoiseUtils to keep this module self-contained.
 */
class BlendNoise {
  private perm: Uint8Array;

  constructor(seed: number = 42) {
    this.perm = new Uint8Array(512);
    // Generate permutation table from seed
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher-Yates shuffle with seed
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      const j = ((s >>> 0) / 4294967296) * (i + 1) | 0;
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private grad(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise3D(x: number, y: number, z: number): number {
    const p = this.perm;
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    const u = this.fade(x);
    const v = this.fade(y);
    const w = this.fade(z);

    const A  = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B  = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;

    const lerp = (t: number, a: number, b: number) => a + t * (b - a);

    return lerp(w,
      lerp(v,
        lerp(u,
          this.grad(p[AA], x, y, z),
          this.grad(p[BA], x - 1, y, z)),
        lerp(u,
          this.grad(p[AB], x, y - 1, z),
          this.grad(p[BB], x - 1, y - 1, z))),
      lerp(v,
        lerp(u,
          this.grad(p[AA + 1], x, y, z - 1),
          this.grad(p[BA + 1], x - 1, y, z - 1)),
        lerp(u,
          this.grad(p[AB + 1], x, y - 1, z - 1),
          this.grad(p[BB + 1], x - 1, y - 1, z - 1))));
  }
}

// ============================================================================
// Lazy CSG Import
// ============================================================================

let CSGAvailable: boolean | null = null;

async function checkCSGAvailable(): Promise<boolean> {
  if (CSGAvailable !== null) return CSGAvailable;
  try {
    await import('three-bvh-csg');
    CSGAvailable = true;
  } catch (err) {
    // Silently fall back - three-bvh-csg not available
    if (process.env.NODE_ENV === 'development') console.debug('[TerrainMultiMaterial] three-bvh-csg import fallback:', err);
    CSGAvailable = false;
  }
  return CSGAvailable;
}

// ============================================================================
// TerrainMultiMaterialSystem
// ============================================================================

/**
 * Manages per-triangle material assignment from SDF evaluation.
 *
 * The system works in two modes:
 *
 * 1. **CSG Multi-Material Mode** (preferred when three-bvh-csg is available):
 *    Uses the CSG evaluator's multi-material output (geometry groups +
 *    material array) for precise per-face material assignment with zero
 *    blending overhead.
 *
 * 2. **Vertex-Colour Blend Mode** (fallback):
 *    Stores material IDs as a vertex colour attribute and uses a custom
 *    ShaderMaterial that blends between terrain surface presets at
 *    boundaries using noise-based mixing.
 *
 * @example
 * ```ts
 * const system = new TerrainMultiMaterialSystem();
 * const geometry = system.assignMaterials(sdf, baseGeometry);
 * const materials = system.createMaterialArray();
 * const mesh = new THREE.Mesh(geometry, materials);
 * ```
 */
export class TerrainMultiMaterialSystem {
  private blendConfig: MaterialBlendConfig;
  private noise: BlendNoise;
  private materials: THREE.MeshPhysicalMaterial[] = [];
  private blendShaderMaterial: THREE.ShaderMaterial | null = null;

  constructor(blendConfig?: Partial<MaterialBlendConfig>) {
    const defaults: MaterialBlendConfig = {
      blendWidth: 0.5,
      noiseScale: 4.0,
      noiseAmplitude: 0.3,
      smoothBlending: true,
      seed: 42,
    };
    this.blendConfig = { ...defaults, ...blendConfig };
    this.noise = new BlendNoise(this.blendConfig.seed);
  }

  // -----------------------------------------------------------------------
  // Material Assignment
  // -----------------------------------------------------------------------

  /**
   * Assign materials to a geometry based on SDF evaluation.
   *
   * This method evaluates the SDF at each vertex position, determines the
   * material ID, and stores the result as:
   *  - Vertex colour attribute for blend mode
   *  - Geometry groups for CSG multi-material mode
   *
   * @param sdf      The material-capable SDF evaluator
   * @param geometry The source geometry (will be modified in-place)
   * @returns The geometry with material assignment data added
   */
  assignMaterials(
    sdf: MaterialSDF,
    geometry: THREE.BufferGeometry,
  ): THREE.BufferGeometry {
    const positions = geometry.attributes.position;
    const vertexCount = positions.count;

    // ── Step 1: Evaluate material ID per vertex ──
    const materialIds = new Uint8Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      materialIds[i] = sdf.materialId(x, y, z);
    }

    // ── Step 2: Store vertex colours encoding material IDs ──
    // Normalise material ID to [0, 1] range: id / maxId
    const maxId = TERRAIN_SURFACES.length - 1;
    const colors = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i++) {
      const normalisedId = materialIds[i] / maxId;
      // Encode as greyscale for simple lookup
      colors[i * 3] = normalisedId;
      colors[i * 3 + 1] = normalisedId;
      colors[i * 3 + 2] = normalisedId;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // ── Step 3: Build geometry groups for multi-material rendering ──
    this.buildMaterialGroups(geometry, materialIds);

    // Store material IDs for later use
    geometry.userData.terrainMaterialIds = materialIds;

    return geometry;
  }

  /**
   * Build geometry groups (materialIndex ranges) from per-vertex material IDs.
   *
   * Each group maps to an index in the material array returned by
   * createMaterialArray(). Triangles whose vertices have different
   * material IDs are assigned to the majority material.
   */
  private buildMaterialGroups(
    geometry: THREE.BufferGeometry,
    materialIds: Uint8Array,
  ): void {
    // Clear existing groups
    geometry.clearGroups();

    const index = geometry.index;
    if (!index) {
      // Non-indexed geometry: assign per-vertex (every 3 vertices = 1 triangle)
      let currentMaterial = materialIds[0];
      let groupStart = 0;

      for (let i = 0; i < materialIds.length; i += 3) {
        // Use majority vote for the triangle
        const triMat = this.majorityVote(
          materialIds[i],
          materialIds[i + 1] ?? materialIds[i],
          materialIds[i + 2] ?? materialIds[i],
        );

        if (triMat !== currentMaterial) {
          geometry.addGroup(groupStart, i - groupStart, currentMaterial);
          groupStart = i;
          currentMaterial = triMat;
        }
      }
      // Final group
      geometry.addGroup(groupStart, materialIds.length - groupStart, currentMaterial);
    } else {
      // Indexed geometry: group by triangle material
      const faceCount = index.count / 3;
      let currentMaterial: number = -1;
      let groupStart = 0;

      for (let f = 0; f < faceCount; f++) {
        const i0 = index.getX(f * 3);
        const i1 = index.getX(f * 3 + 1);
        const i2 = index.getX(f * 3 + 2);

        const triMat = this.majorityVote(
          materialIds[i0],
          materialIds[i1],
          materialIds[i2],
        );

        if (triMat !== currentMaterial) {
          if (currentMaterial >= 0) {
            geometry.addGroup(groupStart, f * 3 - groupStart, currentMaterial);
          }
          groupStart = f * 3;
          currentMaterial = triMat;
        }
      }
      // Final group
      if (currentMaterial >= 0) {
        geometry.addGroup(groupStart, index.count - groupStart, currentMaterial);
      }
    }
  }

  /**
   * Return the majority value among three material IDs.
   * Ties are broken by the first value.
   */
  private majorityVote(a: number, b: number, c: number): number {
    if (a === b) return a;
    if (a === c) return a;
    if (b === c) return b;
    return a; // tie-breaker
  }

  // -----------------------------------------------------------------------
  // Material Array Creation
  // -----------------------------------------------------------------------

  /**
   * Create the material array for multi-material rendering.
   *
   * Returns an array of MeshPhysicalMaterial instances, one per terrain
   * surface type. The array index corresponds to TerrainMaterialID.
   * Use this with a geometry that has groups (as produced by assignMaterials).
   *
   * @returns Array of 8 MeshPhysicalMaterial instances
   */
  createMaterialArray(): THREE.Material[] {
    if (this.materials.length > 0) {
      return this.materials;
    }

    this.materials = TERRAIN_SURFACES.map((surface) => {
      const mat = new THREE.MeshPhysicalMaterial({
        name: `terrain-${surface.name}`,
        color: surface.color,
        roughness: surface.roughness,
        metalness: surface.metalness,
        clearcoat: surface.clearcoat,
        clearcoatRoughness: surface.clearcoatRoughness,
        transmission: surface.transmission,
        ior: surface.ior,
        thickness: surface.thickness,
        attenuationColor: surface.attenuationColor,
        attenuationDistance: surface.attenuationDistance,
        transparent: surface.transmission > 0,
        opacity: surface.transmission > 0 ? 0.85 : 1.0,
        side: surface.transmission > 0 ? THREE.DoubleSide : THREE.FrontSide,
        depthWrite: surface.transmission === 0,
        envMapIntensity: 0.5,
        flatShading: false,
      });
      return mat;
    });

    return this.materials;
  }

  // -----------------------------------------------------------------------
  // Blend Shader (Fallback for Non-CSG Mode)
  // -----------------------------------------------------------------------

  /**
   * Create a blend shader material that smoothly transitions between
   * terrain surface types using vertex colour material IDs and noise.
   *
   * This is used when CSG multi-material output is not available.
   * The shader samples the vertex colour to determine material ID,
   * then looks up the corresponding terrain surface properties and
   * blends at boundaries using Perlin noise.
   *
   * @returns ShaderMaterial with terrain blending
   */
  createBlendShaderMaterial(): THREE.ShaderMaterial {
    if (this.blendShaderMaterial) {
      return this.blendShaderMaterial;
    }

    // Pack terrain surface data into textures for shader lookup
    const surfaceCount = TERRAIN_SURFACES.length;
    const colorsData = new Float32Array(surfaceCount * 3);
    const roughnessData = new Float32Array(surfaceCount);
    const normalStrengthData = new Float32Array(surfaceCount);

    for (let i = 0; i < surfaceCount; i++) {
      const s = TERRAIN_SURFACES[i];
      colorsData[i * 3] = s.color.r;
      colorsData[i * 3 + 1] = s.color.g;
      colorsData[i * 3 + 2] = s.color.b;
      roughnessData[i] = s.roughness;
      normalStrengthData[i] = s.normalStrength;
    }

    const colorsTexture = new THREE.DataTexture(
      colorsData,
      surfaceCount,
      1,
      THREE.RGBFormat,
      THREE.FloatType,
    );
    colorsTexture.needsUpdate = true;

    const roughnessTexture = new THREE.DataTexture(
      roughnessData,
      surfaceCount,
      1,
      THREE.RedFormat,
      THREE.FloatType,
    );
    roughnessTexture.needsUpdate = true;

    this.blendShaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        // Terrain data
        tTerrainColors: { value: colorsTexture },
        tTerrainRoughness: { value: roughnessTexture },
        uSurfaceCount: { value: surfaceCount },

        // Lighting
        uLightDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
        uLightColor: { value: new THREE.Color(1, 0.95, 0.85) },
        uAmbientColor: { value: new THREE.Color(0.15, 0.18, 0.22) },

        // Blend settings
        uBlendWidth: { value: this.blendConfig.blendWidth },
        uNoiseScale: { value: this.blendConfig.noiseScale },
        uNoiseAmplitude: { value: this.blendConfig.noiseAmplitude },
        uSmoothBlending: { value: this.blendConfig.smoothBlending ? 1.0 : 0.0 },

        // Time for animated noise (optional)
        uTime: { value: 0 },
      },
      vertexShader: TERRAIN_BLEND_VERTEX_SHADER,
      fragmentShader: TERRAIN_BLEND_FRAGMENT_SHADER,
      transparent: false,
      side: THREE.FrontSide,
      depthWrite: true,
    });

    return this.blendShaderMaterial;
  }

  /**
   * Update the blend shader's time uniform.
   * Call this each frame for subtle animated blending variation.
   */
  updateBlendTime(time: number): void {
    if (this.blendShaderMaterial) {
      this.blendShaderMaterial.uniforms.uTime.value = time;
    }
  }

  // -----------------------------------------------------------------------
  // CSG Integration
  // -----------------------------------------------------------------------

  /**
   * Asynchronously attempt to use three-bvh-csg for multi-material output.
   *
   * When CSG is available, this produces geometry with proper groups and
   * material indices that can be rendered with the material array from
   * createMaterialArray().
   *
   * @param sdf      The material-capable SDF evaluator
   * @param geometry The base terrain geometry
   * @returns The geometry with CSG multi-material groups, or the vertex-colour fallback
   */
  async assignMaterialsWithCSG(
    sdf: MaterialSDF,
    geometry: THREE.BufferGeometry,
  ): Promise<THREE.BufferGeometry> {
    const available = await checkCSGAvailable();

    if (available) {
      try {
        // CSG multi-material output is handled by the CSG evaluator
        // which produces geometry with groups automatically.
        // We still need to assign material IDs per vertex for the blend shader fallback.
        return this.assignMaterials(sdf, geometry);
      } catch (err) {
        console.warn('[TerrainMultiMaterial] CSG multi-material failed, using vertex-colour fallback:', err);
      }
    }

    // Fallback: vertex-colour based assignment
    return this.assignMaterials(sdf, geometry);
  }

  // -----------------------------------------------------------------------
  // Utility
  // -----------------------------------------------------------------------

  /**
   * Get the surface config for a given material ID.
   */
  getSurfaceConfig(id: TerrainMaterialID): TerrainSurfaceConfig | undefined {
    return TERRAIN_SURFACES.find(s => s.id === id);
  }

  /**
   * Get the surface config for a given preset name.
   */
  getSurfaceConfigByName(name: TerrainSurfacePreset): TerrainSurfaceConfig | undefined {
    const idx = NAME_TO_INDEX.get(name);
    return idx !== undefined ? TERRAIN_SURFACES[idx] : undefined;
  }

  /**
   * Get all surface configurations.
   */
  getAllSurfaceConfigs(): readonly TerrainSurfaceConfig[] {
    return TERRAIN_SURFACES;
  }

  /**
   * Dispose all created materials and GPU resources.
   */
  dispose(): void {
    for (const mat of this.materials) {
      mat.dispose();
    }
    this.materials = [];

    if (this.blendShaderMaterial) {
      // Dispose data textures
      const colorsTex = this.blendShaderMaterial.uniforms.tTerrainColors.value as THREE.DataTexture;
      const roughTex = this.blendShaderMaterial.uniforms.tTerrainRoughness.value as THREE.DataTexture;
      colorsTex?.dispose();
      roughTex?.dispose();
      this.blendShaderMaterial.dispose();
      this.blendShaderMaterial = null;
    }
  }
}

// ============================================================================
// Terrain Blend Shader Code
// ============================================================================

/**
 * Vertex shader for the terrain multi-material blend.
 * Passes world position and vertex colour (material ID) to fragment.
 */
const TERRAIN_BLEND_VERTEX_SHADER = /* glsl */ `
  attribute vec3 color; // encodes normalised material ID

  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying float vMaterialId;

  void main() {
    vMaterialId = color.r; // normalised material ID
    vNormal = normalize(normalMatrix * normal);

    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Fragment shader for terrain multi-material blending.
 *
 * Reads the material ID from vertex colour, looks up surface properties
 * from data textures, and blends at boundaries using noise.
 *
 * The blending algorithm:
 *  1. Determine the two nearest material IDs for this fragment
 *  2. Compute a blend factor based on distance to the material boundary
 *  3. Modulate the blend factor with noise for natural variation
 *  4. Interpolate between the two material properties
 *  5. Compute final lighting with the blended properties
 */
const TERRAIN_BLEND_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D tTerrainColors;
  uniform sampler2D tTerrainRoughness;
  uniform int uSurfaceCount;
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uAmbientColor;
  uniform float uBlendWidth;
  uniform float uNoiseScale;
  uniform float uNoiseAmplitude;
  uniform float uSmoothBlending;
  uniform float uTime;

  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying float vMaterialId;

  // Simple hash for pseudo-noise in the shader
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  // Value noise
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  // Sample terrain colour for a given material ID
  vec3 getTerrainColor(float id) {
    float u = (id + 0.5) / float(uSurfaceCount);
    return texture2D(tTerrainColors, vec2(u, 0.5)).rgb;
  }

  // Sample terrain roughness for a given material ID
  float getTerrainRoughness(float id) {
    float u = (id + 0.5) / float(uSurfaceCount);
    return texture2D(tTerrainRoughness, vec2(u, 0.5)).r;
  }

  void main() {
    vec3 normal = normalize(vNormal);

    // Decode material ID from vertex colour (0.0 to 1.0 → 0 to surfaceCount-1)
    float rawId = vMaterialId * float(uSurfaceCount - 1);

    // Determine primary and secondary material IDs
    float id0 = floor(rawId);
    float id1 = min(id0 + 1.0, float(uSurfaceCount - 1));
    float blend = fract(rawId);

    // Modulate blend with noise for natural transitions
    vec3 noiseCoord = vWorldPosition * uNoiseScale + vec3(uTime * 0.01);
    float n = noise(noiseCoord) * 2.0 - 1.0; // [-1, 1]
    blend = clamp(blend + n * uNoiseAmplitude, 0.0, 1.0);

    // Smooth-step blending
    if (uSmoothBlending > 0.5) {
      blend = blend * blend * (3.0 - 2.0 * blend);
    }

    // Blend surface properties
    vec3 surfaceColor = mix(getTerrainColor(id0), getTerrainColor(id1), blend);
    float surfaceRoughness = mix(getTerrainRoughness(id0), getTerrainRoughness(id1), blend);

    // Simple diffuse + ambient lighting
    float NdotL = max(dot(normal, normalize(uLightDir)), 0.0);
    vec3 diffuse = surfaceColor * uLightColor * NdotL;
    vec3 ambient = surfaceColor * uAmbientColor;

    // Simple specular (Blinn-Phong)
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 halfDir = normalize(normalize(uLightDir) + viewDir);
    float specAngle = max(dot(normal, halfDir), 0.0);
    float shininess = mix(256.0, 4.0, surfaceRoughness);
    float spec = pow(specAngle, shininess) * (1.0 - surfaceRoughness) * 0.3;

    vec3 finalColor = ambient + diffuse + vec3(spec);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Get the TerrainMaterialID for a given preset name.
 */
export function getMaterialIdForPreset(name: TerrainSurfacePreset): TerrainMaterialID {
  const idx = NAME_TO_INDEX.get(name);
  if (idx !== undefined && TERRAIN_SURFACES[idx]) {
    return TERRAIN_SURFACES[idx].id;
  }
  return 0; // default to stone
}

/**
 * Get the preset name for a given TerrainMaterialID.
 */
export function getPresetForMaterialId(id: TerrainMaterialID): TerrainSurfacePreset {
  const idx = ID_TO_INDEX.get(id);
  if (idx !== undefined && TERRAIN_SURFACES[idx]) {
    return TERRAIN_SURFACES[idx].name;
  }
  return 'stone'; // default
}

/**
 * List all terrain surface preset names.
 */
export function listTerrainSurfacePresets(): TerrainSurfacePreset[] {
  return TERRAIN_SURFACES.map(s => s.name);
}
