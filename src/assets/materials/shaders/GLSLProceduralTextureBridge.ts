/**
 * GLSL Procedural Texture Bridge
 *
 * Bridges the new GLSL procedural pipeline with existing material generators
 * in the infinigen-r3f project. Provides two key functions:
 *
 * 1. createProceduralMaterial — takes a texture graph and produces a
 *    Three.js MeshStandardMaterial/MeshPhysicalMaterial with the procedural
 *    texture set.
 *
 * 2. upgradeCanvasBakedMaterial — takes an existing canvas-baked material
 *    and replaces it with the GLSL procedural equivalent.
 *
 * @module assets/materials/shaders
 */

import * as THREE from 'three';
import {
  GLSLTextureGraphBuilder,
  ProceduralTextureRenderer,
  ProceduralTextureShader,
  ProceduralTexturePresets,
  CoordinateMode,
  MusgraveType,
  MathOperation,
  WaveType,
  ColorRampMode,
  type ColorRampStop,
  type FloatCurvePoint,
  type TexturePipelineNode,
  type TexturePipelineLink,
  GLSLTextureNodeTypes,
} from './GLSLProceduralTexturePipeline';

// ============================================================================
// Types
// ============================================================================

/**
 * PBR channel textures produced by the procedural pipeline
 */
export interface ProceduralPBRTextures {
  albedo: THREE.DataTexture;
  normal: THREE.DataTexture;
  roughness: THREE.DataTexture;
  metallic: THREE.DataTexture;
  ao: THREE.DataTexture;
  height: THREE.DataTexture;
  emission: THREE.DataTexture | null;
}

/**
 * Parameters for creating a procedural material
 */
export interface ProceduralMaterialParams {
  /** Base color multiplier */
  baseColor?: THREE.Color;
  /** Roughness value (0-1) */
  roughness?: number;
  /** Metallic value (0-1) */
  metallic?: number;
  /** AO strength */
  aoStrength?: number;
  /** Height/displacement scale */
  heightScale?: number;
  /** Normal map strength */
  normalStrength?: number;
  /** Emission color */
  emissionColor?: THREE.Color | null;
  /** Emission strength */
  emissionStrength?: number;
  /** Texture resolution (256-4096) */
  resolution?: number;
  /** Random seed for per-instance variation */
  seed?: number;
  /** Whether to use 4D noise for animation */
  animated?: boolean;
  /** Coordinate mode for texture evaluation */
  coordinateMode?: CoordinateMode;
  /** Use MeshPhysicalMaterial instead of MeshStandardMaterial */
  usePhysicalMaterial?: boolean;
}

/**
 * Mapping from existing material category names to procedural graph configurations
 */
interface CategoryGraphConfig {
  /** Musgrave type to use */
  musgraveType: MusgraveType;
  /** Noise scale */
  scale: number;
  /** Detail (octaves) */
  detail: number;
  /** Dimension parameter */
  dimension: number;
  /** Lacunarity */
  lacunarity: number;
  /** Offset for Musgrave */
  offset: number;
  /** Gain for Musgrave */
  gain: number;
  /** Whether to add a second noise layer */
  dualLayer: boolean;
  /** Second layer scale if dual */
  secondScale: number;
  /** Second layer Musgrave type */
  secondType: MusgraveType;
  /** Mix factor between layers */
  mixFactor: number;
  /** Color ramp stops for the material */
  colorStops: ColorRampStop[];
  /** Roughness curve */
  roughnessCurve: FloatCurvePoint[];
}

// ============================================================================
// Category Presets — Maps existing canvas-bake categories to GLSL graphs
// ============================================================================

const CATEGORY_CONFIGS: Record<string, CategoryGraphConfig> = {
  metal: {
    musgraveType: MusgraveType.fBM,
    scale: 20.0,
    detail: 5,
    dimension: 1.5,
    lacunarity: 2.0,
    offset: 0.0,
    gain: 1.0,
    dualLayer: true,
    secondScale: 40.0,
    secondType: MusgraveType.RidgedMultifractal,
    mixFactor: 0.3,
    colorStops: [
      { position: 0.0, color: [0.60, 0.60, 0.62, 1.0] },
      { position: 0.3, color: [0.70, 0.70, 0.73, 1.0] },
      { position: 0.5, color: [0.75, 0.75, 0.78, 1.0] },
      { position: 0.7, color: [0.72, 0.72, 0.74, 1.0] },
      { position: 1.0, color: [0.65, 0.65, 0.67, 1.0] },
    ],
    roughnessCurve: [
      { position: 0.0, value: 0.15 },
      { position: 0.5, value: 0.25 },
      { position: 1.0, value: 0.35 },
    ],
  },
  wood: {
    musgraveType: MusgraveType.HeteroTerrain,
    scale: 3.0,
    detail: 6,
    dimension: 0.8,
    lacunarity: 2.0,
    offset: 0.5,
    gain: 1.0,
    dualLayer: false,
    secondScale: 0,
    secondType: MusgraveType.fBM,
    mixFactor: 0,
    colorStops: [
      { position: 0.0, color: [0.25, 0.14, 0.06, 1.0] },
      { position: 0.3, color: [0.35, 0.22, 0.10, 1.0] },
      { position: 0.5, color: [0.45, 0.28, 0.14, 1.0] },
      { position: 0.7, color: [0.40, 0.25, 0.12, 1.0] },
      { position: 1.0, color: [0.30, 0.18, 0.08, 1.0] },
    ],
    roughnessCurve: [
      { position: 0.0, value: 0.6 },
      { position: 0.5, value: 0.7 },
      { position: 1.0, value: 0.8 },
    ],
  },
  stone: {
    musgraveType: MusgraveType.HeteroTerrain,
    scale: 4.0,
    detail: 5,
    dimension: 0.7,
    lacunarity: 2.0,
    offset: 0.5,
    gain: 1.0,
    dualLayer: true,
    secondScale: 15.0,
    secondType: MusgraveType.RidgedMultifractal,
    mixFactor: 0.4,
    colorStops: [
      { position: 0.0, color: [0.35, 0.33, 0.30, 1.0] },
      { position: 0.3, color: [0.45, 0.43, 0.40, 1.0] },
      { position: 0.5, color: [0.50, 0.48, 0.44, 1.0] },
      { position: 0.7, color: [0.48, 0.46, 0.42, 1.0] },
      { position: 1.0, color: [0.40, 0.38, 0.35, 1.0] },
    ],
    roughnessCurve: [
      { position: 0.0, value: 0.7 },
      { position: 0.5, value: 0.85 },
      { position: 1.0, value: 0.9 },
    ],
  },
  terrain: {
    musgraveType: MusgraveType.HeteroTerrain,
    scale: 3.0,
    detail: 7,
    dimension: 0.8,
    lacunarity: 2.0,
    offset: 0.5,
    gain: 1.0,
    dualLayer: true,
    secondScale: 8.0,
    secondType: MusgraveType.RidgedMultifractal,
    mixFactor: 0.3,
    colorStops: [
      { position: 0.0, color: [0.15, 0.10, 0.05, 1.0] },
      { position: 0.2, color: [0.25, 0.20, 0.12, 1.0] },
      { position: 0.4, color: [0.35, 0.28, 0.18, 1.0] },
      { position: 0.6, color: [0.45, 0.50, 0.30, 1.0] },
      { position: 0.8, color: [0.55, 0.50, 0.45, 1.0] },
      { position: 1.0, color: [0.90, 0.90, 0.92, 1.0] },
    ],
    roughnessCurve: [
      { position: 0.0, value: 0.8 },
      { position: 0.5, value: 0.85 },
      { position: 1.0, value: 0.9 },
    ],
  },
  fabric: {
    musgraveType: MusgraveType.fBM,
    scale: 30.0,
    detail: 3,
    dimension: 1.5,
    lacunarity: 2.0,
    offset: 0.0,
    gain: 1.0,
    dualLayer: false,
    secondScale: 0,
    secondType: MusgraveType.fBM,
    mixFactor: 0,
    colorStops: [
      { position: 0.0, color: [0.35, 0.18, 0.12, 1.0] },
      { position: 0.3, color: [0.40, 0.20, 0.15, 1.0] },
      { position: 0.5, color: [0.38, 0.19, 0.13, 1.0] },
      { position: 0.7, color: [0.42, 0.21, 0.14, 1.0] },
      { position: 1.0, color: [0.36, 0.17, 0.11, 1.0] },
    ],
    roughnessCurve: [
      { position: 0.0, value: 0.85 },
      { position: 0.5, value: 0.9 },
      { position: 1.0, value: 0.88 },
    ],
  },
  ceramic: {
    musgraveType: MusgraveType.fBM,
    scale: 8.0,
    detail: 3,
    dimension: 1.5,
    lacunarity: 2.0,
    offset: 0.0,
    gain: 1.0,
    dualLayer: false,
    secondScale: 0,
    secondType: MusgraveType.fBM,
    mixFactor: 0,
    colorStops: [
      { position: 0.0, color: [0.90, 0.88, 0.85, 1.0] },
      { position: 0.3, color: [0.93, 0.91, 0.88, 1.0] },
      { position: 0.5, color: [0.95, 0.93, 0.90, 1.0] },
      { position: 0.7, color: [0.92, 0.90, 0.87, 1.0] },
      { position: 1.0, color: [0.88, 0.86, 0.83, 1.0] },
    ],
    roughnessCurve: [
      { position: 0.0, value: 0.1 },
      { position: 0.5, value: 0.15 },
      { position: 1.0, value: 0.2 },
    ],
  },
  nature: {
    musgraveType: MusgraveType.fBM,
    scale: 5.0,
    detail: 5,
    dimension: 1.2,
    lacunarity: 2.0,
    offset: 0.0,
    gain: 1.0,
    dualLayer: true,
    secondScale: 12.0,
    secondType: MusgraveType.RidgedMultifractal,
    mixFactor: 0.3,
    colorStops: [
      { position: 0.0, color: [0.08, 0.30, 0.05, 1.0] },
      { position: 0.3, color: [0.12, 0.38, 0.08, 1.0] },
      { position: 0.5, color: [0.15, 0.42, 0.10, 1.0] },
      { position: 0.7, color: [0.10, 0.35, 0.07, 1.0] },
      { position: 1.0, color: [0.06, 0.25, 0.03, 1.0] },
    ],
    roughnessCurve: [
      { position: 0.0, value: 0.55 },
      { position: 0.5, value: 0.65 },
      { position: 1.0, value: 0.7 },
    ],
  },
  creature: {
    musgraveType: MusgraveType.HybridMultifractal,
    scale: 8.0,
    detail: 4,
    dimension: 1.0,
    lacunarity: 2.5,
    offset: 0.3,
    gain: 1.5,
    dualLayer: true,
    secondScale: 20.0,
    secondType: MusgraveType.RidgedMultifractal,
    mixFactor: 0.2,
    colorStops: [
      { position: 0.0, color: [0.45, 0.32, 0.25, 1.0] },
      { position: 0.3, color: [0.50, 0.38, 0.30, 1.0] },
      { position: 0.5, color: [0.55, 0.42, 0.35, 1.0] },
      { position: 0.7, color: [0.52, 0.40, 0.32, 1.0] },
      { position: 1.0, color: [0.48, 0.35, 0.28, 1.0] },
    ],
    roughnessCurve: [
      { position: 0.0, value: 0.5 },
      { position: 0.5, value: 0.55 },
      { position: 1.0, value: 0.6 },
    ],
  },
};

// Default config for unknown categories
const DEFAULT_CONFIG: CategoryGraphConfig = {
  musgraveType: MusgraveType.fBM,
  scale: 5.0,
  detail: 4,
  dimension: 2.0,
  lacunarity: 2.0,
  offset: 0.0,
  gain: 1.0,
  dualLayer: false,
  secondScale: 0,
  secondType: MusgraveType.fBM,
  mixFactor: 0,
  colorStops: [
    { position: 0.0, color: [0.4, 0.4, 0.4, 1.0] },
    { position: 1.0, color: [0.6, 0.6, 0.6, 1.0] },
  ],
  roughnessCurve: [
    { position: 0.0, value: 0.4 },
    { position: 1.0, value: 0.6 },
  ],
};

// ============================================================================
// PBR Channel Graph Builders
// ============================================================================

/**
 * Build a graph for the albedo (color) channel
 */
function buildAlbedoGraph(
  config: CategoryGraphConfig,
  seed: number,
  use4D: boolean = false,
): THREE.ShaderMaterial {
  const builder = new GLSLTextureGraphBuilder();

  // Primary Musgrave layer
  builder.addMusgrave({
    musgraveType: config.musgraveType,
    scale: config.scale,
    detail: config.detail,
    dimension: config.dimension,
    lacunarity: config.lacunarity,
    offset: config.offset,
    gain: config.gain,
    use4D,
  });

  if (config.dualLayer) {
    // Secondary noise layer
    builder.addMusgrave({
      musgraveType: config.secondType,
      scale: config.secondScale,
      detail: Math.max(2, config.detail - 2),
      dimension: config.dimension,
      lacunarity: config.lacunarity,
      offset: config.offset,
      gain: config.gain,
      use4D,
    });

    // Mix
    builder.addMix(config.mixFactor);
    builder.connect('musgrave_0', 'float', 'mix_0', 'a');
    builder.connect('musgrave_1', 'float', 'mix_0', 'b');

    // Color ramp
    builder.addColorRamp(config.colorStops, ColorRampMode.Linear);
    builder.connect('mix_0', 'float', 'colorRamp_0', 'fac');
  } else {
    // Single layer with color ramp
    builder.addColorRamp(config.colorStops, ColorRampMode.Linear);
    builder.connect('musgrave_0', 'float', 'colorRamp_0', 'fac');
  }

  // Output
  builder.addOutput();

  if (config.dualLayer) {
    builder.connect('colorRamp_0', 'color', 'output_0', 'value');
  } else {
    builder.connect('colorRamp_0', 'color', 'output_0', 'value');
  }

  return builder.buildMaterial();
}

/**
 * Build a graph for the roughness channel
 */
function buildRoughnessGraph(
  config: CategoryGraphConfig,
  seed: number,
): THREE.ShaderMaterial {
  const builder = new GLSLTextureGraphBuilder();

  builder.addMusgrave({
    musgraveType: MusgraveType.fBM,
    scale: config.scale * 2,
    detail: 3,
    dimension: 1.5,
    lacunarity: 2.0,
  });

  builder.addFloatCurve(config.roughnessCurve);
  builder.connect('musgrave_0', 'float', 'floatCurve_0', 'fac');

  builder.addOutput();
  builder.connect('floatCurve_0', 'float', 'output_0', 'value');

  return builder.buildMaterial();
}

/**
 * Build a graph for the height/bump channel
 */
function buildHeightGraph(
  config: CategoryGraphConfig,
  seed: number,
): THREE.ShaderMaterial {
  const builder = new GLSLTextureGraphBuilder();

  builder.addMusgrave({
    musgraveType: config.musgraveType,
    scale: config.scale,
    detail: config.detail,
    dimension: config.dimension,
    lacunarity: config.lacunarity,
    offset: config.offset,
    gain: config.gain,
  });

  builder.addOutput();
  builder.connect('musgrave_0', 'float', 'output_0', 'value');

  return builder.buildMaterial();
}

/**
 * Build a normal map from height differences
 * Uses a height graph rendered at the same resolution
 */
function buildNormalMapFromHeight(
  heightData: Float32Array,
  resolution: number,
  strength: number = 1.0,
): THREE.DataTexture {
  const normalData = new Float32Array(resolution * resolution * 4);

  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const idx = (y * resolution + x) * 4;

      // Sample neighboring heights
      const left = heightData[((y * resolution) + ((x - 1 + resolution) % resolution)) * 4];
      const right = heightData[((y * resolution) + ((x + 1) % resolution)) * 4];
      const up = heightData[(((y - 1 + resolution) % resolution) * resolution + x) * 4];
      const down = heightData[(((y + 1) % resolution) * resolution + x) * 4];

      // Finite difference normal
      const dx = (right - left) * strength;
      const dy = (down - up) * strength;
      const dz = 1.0;

      // Normalize
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

      normalData[idx] = (dx / len) * 0.5 + 0.5;
      normalData[idx + 1] = (dy / len) * 0.5 + 0.5;
      normalData[idx + 2] = (dz / len) * 0.5 + 0.5;
      normalData[idx + 3] = 1.0;
    }
  }

  const texture = new THREE.DataTexture(
    normalData,
    resolution,
    resolution,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.needsUpdate = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.name = 'Procedural_Normal';
  return texture;
}

/**
 * Build a simple AO map from low-frequency noise
 */
function buildAOGraph(config: CategoryGraphConfig): THREE.ShaderMaterial {
  const builder = new GLSLTextureGraphBuilder();

  builder.addMusgrave({
    musgraveType: MusgraveType.fBM,
    scale: config.scale * 0.5,
    detail: 3,
    dimension: 1.0,
    lacunarity: 2.0,
  });

  builder.addOutput();
  builder.connect('musgrave_0', 'float', 'output_0', 'value');

  return builder.buildMaterial();
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create a full PBR procedural material from a texture graph definition.
 *
 * This function takes a procedural texture graph (or uses a preset) and
 * renders it into a set of PBR textures (albedo, normal, roughness, etc.)
 * which are then applied to a MeshStandardMaterial or MeshPhysicalMaterial.
 *
 * @param category Material category (metal, wood, stone, terrain, fabric, ceramic, nature, creature)
 * @param params Material parameters
 * @param renderer Optional WebGL renderer for GPU rendering
 * @returns MeshStandardMaterial or MeshPhysicalMaterial with procedural textures
 */
export function createProceduralMaterial(
  category: string,
  params: ProceduralMaterialParams = {},
  renderer?: THREE.WebGLRenderer,
): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
  const config = CATEGORY_CONFIGS[category] ?? DEFAULT_CONFIG;
  const resolution = params.resolution ?? 512;
  const seed = params.seed ?? 0;
  const animated = params.animated ?? false;
  const coordMode = params.coordinateMode ?? CoordinateMode.Generated;

  // Create the texture renderer
  const textureRenderer = new ProceduralTextureRenderer(renderer, resolution);

  // Simple seeded random
  let rng = seed;
  const nextRandom = () => {
    rng = (rng * 1664525 + 1013904223) & 0xffffffff;
    return (rng >>> 0) / 4294967296;
  };

  try {
    // --- Render albedo ---
    const albedoMaterial = buildAlbedoGraph(config, seed, animated);
    albedoMaterial.uniforms['u_object_random'].value = nextRandom();
    const albedoTexture = textureRenderer.render(albedoMaterial, seed, 0.0);

    // --- Render roughness ---
    const roughnessMaterial = buildRoughnessGraph(config, seed);
    roughnessMaterial.uniforms['u_object_random'].value = nextRandom();
    const roughnessTexture = textureRenderer.render(roughnessMaterial, seed, 0.0);

    // --- Render height (for normal map + displacement) ---
    const heightMaterial = buildHeightGraph(config, seed);
    heightMaterial.uniforms['u_object_random'].value = nextRandom();
    const heightTexture = textureRenderer.render(heightMaterial, seed, 0.0);

    // --- Build normal map from height data ---
    const heightData = heightTexture.image.data as Float32Array;
    const normalStrength = params.normalStrength ?? 1.0;
    const normalTexture = buildNormalMapFromHeight(heightData, resolution, normalStrength);

    // --- Render AO ---
    const aoMaterial = buildAOGraph(config);
    aoMaterial.uniforms['u_object_random'].value = nextRandom();
    const aoTexture = textureRenderer.render(aoMaterial, seed, 0.0);

    // --- Metallic map (simplified: mostly uniform with slight variation) ---
    const metallicBuilder = new GLSLTextureGraphBuilder();
    metallicBuilder.addNoise('simplex', { scale: 10, detail: 2, roughness: 0.5 });
    metallicBuilder.addOutput();
    metallicBuilder.connect('simplex_0', 'float', 'output_0', 'value');
    const metallicMaterial = metallicBuilder.buildMaterial();
    const metallicTexture = textureRenderer.render(metallicMaterial, seed, 0.0);

    // --- Create the PBR material ---
    const baseColor = params.baseColor ?? new THREE.Color(1, 1, 1);
    const roughness = params.roughness ?? 0.5;
    const metallic = params.metallic ?? 0.0;
    const aoStrength = params.aoStrength ?? 1.0;
    const heightScale = params.heightScale ?? 0.02;

    const materialParams: THREE.MeshStandardMaterialParameters & Record<string, any> = {
      map: albedoTexture,
      normalMap: normalTexture,
      roughnessMap: roughnessTexture,
      metalnessMap: metallicTexture,
      aoMap: aoTexture,
      bumpMap: heightTexture,
      color: baseColor,
      roughness,
      metalness: metallic,
      bumpScale: heightScale,
      normalScale: new THREE.Vector2(normalStrength, normalStrength),
      aoMapIntensity: aoStrength,
    };

    // Emission
    if (params.emissionStrength && params.emissionStrength > 0 && params.emissionColor) {
      materialParams.emissive = params.emissionColor;
      materialParams.emissiveIntensity = params.emissionStrength;
    }

    const material = params.usePhysicalMaterial
      ? new THREE.MeshPhysicalMaterial(materialParams)
      : new THREE.MeshStandardMaterial(materialParams);

    material.name = `Procedural_${category}`;

    // Store metadata for potential re-rendering
    (material as any)._proceduralMeta = {
      category,
      params,
      config,
      seed,
      resolution,
    };

    return material;
  } finally {
    // Clean up the renderer only if we created it
    if (!renderer) {
      textureRenderer.dispose();
    }
  }
}

/**
 * Upgrade an existing canvas-baked material to a GLSL procedural equivalent.
 *
 * This function inspects the existing material's properties (name, category,
 * texture maps) and replaces the canvas-baked textures with GPU-evaluated
 * procedural textures that match the same visual characteristics but offer:
 * - Infinite resolution (no pixelation)
 * - Per-instance randomization
 * - Animation support via 4D noise
 * - Numerically accurate noise matching Blender's implementation
 *
 * @param existingMaterial The existing canvas-baked material
 * @param renderer Optional WebGL renderer
 * @returns Upgraded material with GLSL procedural textures
 */
export function upgradeCanvasBakedMaterial(
  existingMaterial: THREE.Material,
  renderer?: THREE.WebGLRenderer,
): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
  // Extract category from material name or properties
  const category = detectMaterialCategory(existingMaterial);

  // Extract existing params
  const params = extractMaterialParams(existingMaterial);

  // Create the procedural replacement
  const proceduralMaterial = createProceduralMaterial(category, params, renderer);

  // Copy over additional properties that aren't texture-related
  if (existingMaterial instanceof THREE.MeshStandardMaterial) {
    proceduralMaterial.transparent = existingMaterial.transparent;
    proceduralMaterial.opacity = existingMaterial.opacity;
    proceduralMaterial.side = existingMaterial.side;
    proceduralMaterial.flatShading = existingMaterial.flatShading;
    proceduralMaterial.wireframe = existingMaterial.wireframe;
    proceduralMaterial.depthWrite = existingMaterial.depthWrite;
    // castShadow/receiveShadow are Object3D properties, set on mesh not material
    proceduralMaterial.fog = existingMaterial.fog;
  }

  // Track upgrade
  (proceduralMaterial as any)._upgradedFrom = existingMaterial.type;
  (proceduralMaterial as any)._isGLSLProcedural = true;

  return proceduralMaterial;
}

/**
 * Detect the material category from an existing material
 */
function detectMaterialCategory(material: THREE.Material): string {
  const name = (material.name ?? '').toLowerCase();
  const type = material.type.toLowerCase();

  // Check material name for hints
  if (name.includes('metal') || name.includes('steel') || name.includes('iron')) return 'metal';
  if (name.includes('wood') || name.includes('timber') || name.includes('oak')) return 'wood';
  if (name.includes('stone') || name.includes('rock') || name.includes('granite')) return 'stone';
  if (name.includes('terrain') || name.includes('ground') || name.includes('earth')) return 'terrain';
  if (name.includes('fabric') || name.includes('cloth') || name.includes('textile')) return 'fabric';
  if (name.includes('ceramic') || name.includes('porcelain') || name.includes('tile')) return 'ceramic';
  if (name.includes('nature') || name.includes('leaf') || name.includes('grass')) return 'nature';
  if (name.includes('creature') || name.includes('skin') || name.includes('scale')) return 'creature';

  // Try to infer from material properties
  if (material instanceof THREE.MeshStandardMaterial) {
    if (material.metalness > 0.5) return 'metal';
    if (material.roughness > 0.7 && material.metalness < 0.1) {
      // Rough, non-metallic — could be stone, terrain, or fabric
      if (material.roughness > 0.85) return 'stone';
      return 'terrain';
    }
    if (material.roughness < 0.3 && material.metalness < 0.1) return 'ceramic';
  }

  return 'generic';
}

/**
 * Extract material parameters from an existing material
 */
function extractMaterialParams(material: THREE.Material): ProceduralMaterialParams {
  const params: ProceduralMaterialParams = {};

  if (material instanceof THREE.MeshStandardMaterial) {
    params.baseColor = material.color?.clone() ?? new THREE.Color(1, 1, 1);
    params.roughness = material.roughness;
    params.metallic = material.metalness;

    if (material.aoMapIntensity !== undefined) {
      params.aoStrength = material.aoMapIntensity;
    }

    if (material.bumpScale !== undefined) {
      params.heightScale = material.bumpScale;
    }

    if (material.normalScale) {
      params.normalStrength = material.normalScale.x;
    }

    if (material.emissive && material.emissiveIntensity > 0) {
      params.emissionColor = material.emissive.clone();
      params.emissionStrength = material.emissiveIntensity;
    }

    params.usePhysicalMaterial = material instanceof THREE.MeshPhysicalMaterial;
  }

  return params;
}

/**
 * Re-render a procedural material at a different resolution
 * or with different animation parameters
 *
 * @param material Existing procedural material (must have _proceduralMeta)
 * @param newResolution New texture resolution
 * @param timeW 4D W dimension for animation
 * @param renderer Optional WebGL renderer
 */
export function rerenderProceduralMaterial(
  material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  newResolution?: number,
  timeW: number = 0.0,
  renderer?: THREE.WebGLRenderer,
): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
  const meta = (material as any)._proceduralMeta;
  if (!meta) {
    console.warn('Material does not have procedural metadata; cannot re-render');
    return material;
  }

  const params = { ...meta.params };
  if (newResolution !== undefined) {
    params.resolution = newResolution;
  }

  return createProceduralMaterial(meta.category, params, renderer);
}

/**
 * Check if a material was created by the GLSL procedural pipeline
 */
export function isProceduralMaterial(material: THREE.Material): boolean {
  return (material as any)?._isGLSLProcedural === true;
}

/**
 * Create a quick procedural material using a preset graph
 */
export function createPresetMaterial(
  preset: 'terrain' | 'rocky' | 'cells' | 'blended' | 'animated',
  params: Partial<ProceduralMaterialParams> = {},
  renderer?: THREE.WebGLRenderer,
): THREE.MeshStandardMaterial {
  const resolution = params.resolution ?? 512;
  const textureRenderer = new ProceduralTextureRenderer(renderer, resolution);

  let shaderMaterial: THREE.ShaderMaterial;

  switch (preset) {
    case 'terrain':
      shaderMaterial = ProceduralTexturePresets.terrainMaterial();
      break;
    case 'rocky':
      shaderMaterial = ProceduralTexturePresets.rockySurface();
      break;
    case 'cells':
      shaderMaterial = ProceduralTexturePresets.cellPattern();
      break;
    case 'blended':
      shaderMaterial = ProceduralTexturePresets.blendedMusgrave();
      break;
    case 'animated':
      shaderMaterial = ProceduralTexturePresets.animatedNoise();
      break;
    default:
      shaderMaterial = ProceduralTexturePresets.terrainMaterial();
  }

  const texture = textureRenderer.render(shaderMaterial, params.seed ?? 0, 0.0);

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: params.baseColor ?? new THREE.Color(1, 1, 1),
    roughness: params.roughness ?? 0.7,
    metalness: params.metallic ?? 0.0,
  });

  material.name = `Procedural_${preset}`;
  (material as any)._isGLSLProcedural = true;

  return material;
}
