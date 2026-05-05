/**
 * PerInstanceMaterialRandomization.ts
 *
 * Systematically wires the GLSL procedural pipeline to AssetFactory generators,
 * providing ObjectInfo.Random equivalent using instanced attributes for per-instance
 * color/roughness/normal variation.
 *
 * Architecture:
 * 1. MaterialRandomizationConfig — per-asset-type randomization settings
 * 2. PRESET_RANDOMIZATION_CONFIGS — pre-built configs for common asset types
 * 3. InstanceRandomAttribute — describes a per-instance attribute for InstancedMesh
 * 4. PerInstanceRandomizer — generates deterministic per-instance attribute arrays
 * 5. InstancedMaterialBuilder — creates ShaderMaterial that reads per-instance attributes
 * 6. randomizeInstancedMesh — one-call convenience integration helper
 *
 * Key insight: In Three.js, InstancedMesh supports per-instance attributes via
 * `InstancedBufferAttribute` on the geometry. For ShaderMaterial, the vertex shader
 * reads these instance attributes and passes them as varyings to the fragment shader,
 * which applies color/roughness/metalness/normal variation per instance.
 *
 * @module assets/materials/PerInstanceMaterialRandomization
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// 1. MaterialRandomizationConfig
// ============================================================================

/**
 * Per-asset-type randomization settings that control the range of material
 * property variation across instances.
 *
 * All ranges are [min, max] pairs. The randomizer generates a value within
 * each range for every instance using a seeded PRNG, ensuring deterministic
 * results for the same seed.
 *
 * This is the R3F equivalent of Infinigen's `ObjectInfo.Random` — instead of
 * providing a single random seed per object, we pre-compute the per-instance
 * material shifts and store them as GPU instance attributes for efficient
 * batched rendering.
 */
export interface MaterialRandomizationConfig {
  /** Min/max hue shift in HSV space (default [-0.05, 0.05]). Positive = clockwise on hue wheel. */
  hueShiftRange: [number, number];

  /** Min/max saturation shift in HSV space (default [-0.03, 0.03]). */
  saturationShiftRange: [number, number];

  /** Min/max brightness/value shift in HSV space (default [-0.05, 0.05]). */
  valueShiftRange: [number, number];

  /** Min/max roughness shift (default [-0.1, 0.1]). Affects specular highlights. */
  roughnessShiftRange: [number, number];

  /** Min/max metalness shift (default [-0.05, 0.05]). Affects dielectric/metallic blend. */
  metalnessShiftRange: [number, number];

  /** Min/max normal map intensity variation (default [-0.1, 0.1]). Scales normal perturbation. */
  normalStrengthRange: [number, number];

  /** Min/max texture scale variation (default [-0.1, 0.1]). Multiplies UV coordinates. */
  scaleRange: [number, number];

  /** Per-instance seed offset for noise variation. Added to instance index before hashing. */
  seedOffset: number;
}

/**
 * Default randomization config with minimal variation.
 * Suitable as a fallback or for asset types where variation is undesirable.
 */
export const DEFAULT_RANDOMIZATION_CONFIG: MaterialRandomizationConfig = {
  hueShiftRange: [-0.05, 0.05],
  saturationShiftRange: [-0.03, 0.03],
  valueShiftRange: [-0.05, 0.05],
  roughnessShiftRange: [-0.1, 0.1],
  metalnessShiftRange: [-0.05, 0.05],
  normalStrengthRange: [-0.1, 0.1],
  scaleRange: [-0.1, 0.1],
  seedOffset: 0,
};

// ============================================================================
// 2. PRESET_RANDOMIZATION_CONFIGS
// ============================================================================

/**
 * Pre-built randomization configs for common asset types.
 * These match the visual diversity observed in Infinigen's procedural generation
 * where ObjectInfo.Random drives per-instance variation in material node trees.
 *
 * Usage: `PRESET_RANDOMIZATION_CONFIGS['tree']` or `PRESET_RANDOMIZATION_CONFIGS.tree`
 */
export const PRESET_RANDOMIZATION_CONFIGS: Record<string, MaterialRandomizationConfig> = {
  /**
   * Tree — moderate hue/saturation variation (bark color varies between trees).
   * Bark can range from light grey-brown to deep reddish-brown.
   */
  tree: {
    hueShiftRange: [-0.06, 0.06],
    saturationShiftRange: [-0.08, 0.08],
    valueShiftRange: [-0.1, 0.1],
    roughnessShiftRange: [-0.15, 0.15],
    metalnessShiftRange: [-0.02, 0.02],
    normalStrengthRange: [-0.15, 0.15],
    scaleRange: [-0.05, 0.05],
    seedOffset: 100,
  },

  /**
   * Rock — high roughness variation (weathering differs per rock).
   * Color varies but within a narrow earthy palette.
   */
  rock: {
    hueShiftRange: [-0.03, 0.03],
    saturationShiftRange: [-0.05, 0.05],
    valueShiftRange: [-0.12, 0.12],
    roughnessShiftRange: [-0.25, 0.25],
    metalnessShiftRange: [-0.03, 0.03],
    normalStrengthRange: [-0.2, 0.2],
    scaleRange: [-0.15, 0.15],
    seedOffset: 200,
  },

  /**
   * Grass — high hue variation across the green spectrum.
   * Individual grass clumps can range from yellow-green to blue-green.
   */
  grass: {
    hueShiftRange: [-0.1, 0.1],
    saturationShiftRange: [-0.1, 0.1],
    valueShiftRange: [-0.08, 0.08],
    roughnessShiftRange: [-0.05, 0.05],
    metalnessShiftRange: [-0.01, 0.01],
    normalStrengthRange: [-0.05, 0.05],
    scaleRange: [-0.05, 0.05],
    seedOffset: 300,
  },

  /**
   * Creature — low variation for skin/coat consistency.
   * Biological materials need subtle variation to avoid looking broken.
   */
  creature: {
    hueShiftRange: [-0.02, 0.02],
    saturationShiftRange: [-0.02, 0.02],
    valueShiftRange: [-0.03, 0.03],
    roughnessShiftRange: [-0.05, 0.05],
    metalnessShiftRange: [-0.02, 0.02],
    normalStrengthRange: [-0.05, 0.05],
    scaleRange: [-0.02, 0.02],
    seedOffset: 400,
  },

  /**
   * Water — minimal variation. Water surfaces should remain largely uniform.
   * Only subtle roughness changes for foam/turbulence variation.
   */
  water: {
    hueShiftRange: [-0.01, 0.01],
    saturationShiftRange: [-0.01, 0.01],
    valueShiftRange: [-0.02, 0.02],
    roughnessShiftRange: [-0.03, 0.03],
    metalnessShiftRange: [-0.01, 0.01],
    normalStrengthRange: [-0.05, 0.05],
    scaleRange: [-0.02, 0.02],
    seedOffset: 500,
  },

  /**
   * Fabric — high hue variation (textiles come in many colors).
   * Roughness varies with weave tightness; metalness stays near zero.
   */
  fabric: {
    hueShiftRange: [-0.15, 0.15],
    saturationShiftRange: [-0.1, 0.1],
    valueShiftRange: [-0.1, 0.1],
    roughnessShiftRange: [-0.15, 0.15],
    metalnessShiftRange: [-0.01, 0.01],
    normalStrengthRange: [-0.08, 0.08],
    scaleRange: [-0.03, 0.03],
    seedOffset: 600,
  },

  /**
   * Wood — moderate grain variation (species and aging differ per plank).
   * Hue shifts are warmer (amber/red); roughness varies with finish.
   */
  wood: {
    hueShiftRange: [-0.04, 0.04],
    saturationShiftRange: [-0.06, 0.06],
    valueShiftRange: [-0.08, 0.08],
    roughnessShiftRange: [-0.12, 0.12],
    metalnessShiftRange: [-0.02, 0.02],
    normalStrengthRange: [-0.1, 0.1],
    scaleRange: [-0.08, 0.08],
    seedOffset: 700,
  },

  /**
   * Metal — roughness/metalness variation (polishing, patina, oxidation).
   * Color stays relatively consistent; surface quality varies.
   */
  metal: {
    hueShiftRange: [-0.02, 0.02],
    saturationShiftRange: [-0.03, 0.03],
    valueShiftRange: [-0.05, 0.05],
    roughnessShiftRange: [-0.2, 0.2],
    metalnessShiftRange: [-0.15, 0.15],
    normalStrengthRange: [-0.15, 0.15],
    scaleRange: [-0.03, 0.03],
    seedOffset: 800,
  },
};

// ============================================================================
// 3. InstanceRandomAttribute
// ============================================================================

/**
 * Describes a per-instance attribute that will be added to an InstancedMesh's
 * geometry as an `InstancedBufferAttribute`. Each instance gets its own value(s)
 * which the vertex/fragment shader can read to vary appearance.
 *
 * Example attributes:
 * - `instanceHueShift` (size 1) — per-instance hue offset
 * - `instanceColorShift` (size 3) — per-instance HSV shift packed as vec3
 * - `instanceRoughnessMetalness` (size 2) — per-instance roughness+metalness shifts
 */
export interface InstanceRandomAttribute {
  /** Attribute name that will appear in the geometry's attribute map and GLSL. */
  name: string;

  /** Component count per instance (1 = float, 2 = vec2, 3 = vec3, 4 = vec4). */
  size: number;

  /** Per-instance values. Length = instanceCount * size. */
  data: Float32Array;
}

// ============================================================================
// 4. PerInstanceRandomizer
// ============================================================================

/**
 * Generates deterministic per-instance material randomization attributes.
 *
 * This class is the R3F equivalent of Infinigen's `ObjectInfo.Random` node,
 * which provides per-object random values that drive material variation in
 * Blender's shader node trees. Instead of computing random values at shader
 * time (which isn't possible in WebGL for instanced rendering without a
 * data texture), we pre-compute them on the CPU and upload as instance
 * attributes.
 *
 * The randomizer is fully deterministic: the same config + seed always
 * produces the same attribute arrays, enabling reproducible scene generation.
 *
 * @example
 * ```ts
 * const config = PRESET_RANDOMIZATION_CONFIGS.tree;
 * const randomizer = new PerInstanceRandomizer(config, 42);
 * const attrs = randomizer.generateInstanceAttributes(100);
 * // attrs contains hueShift, satShift, valueShift, roughnessShift, etc.
 * ```
 */
export class PerInstanceRandomizer {
  private readonly config: MaterialRandomizationConfig;
  private readonly seed: number;

  /**
   * @param config — Per-asset-type randomization settings
   * @param seed — Master seed for deterministic generation
   */
  constructor(config: MaterialRandomizationConfig, seed: number) {
    this.config = { ...DEFAULT_RANDOMIZATION_CONFIG, ...config };
    this.seed = seed;
  }

  /**
   * Generates random attribute arrays for all instances.
   *
   * Produces the following attributes:
   * - `instanceHueShift` (size 1) — hue offset per instance
   * - `instanceSatShift` (size 1) — saturation offset per instance
   * - `instanceValueShift` (size 1) — brightness offset per instance
   * - `instanceRoughnessShift` (size 1) — roughness offset per instance
   * - `instanceMetalnessShift` (size 1) — metalness offset per instance
   * - `instanceNormalStrength` (size 1) — normal map intensity scale per instance
   * - `instanceScale` (size 1) — texture scale multiplier per instance
   * - `instanceColorShift` (size 3) — packed HSV shift as vec3 for convenience
   * - `instanceRoughnessMetalness` (size 2) — packed roughness+metalness as vec2
   *
   * @param instanceCount — Number of instances to generate attributes for
   * @returns Array of InstanceRandomAttribute objects
   */
  generateInstanceAttributes(instanceCount: number): InstanceRandomAttribute[] {
    const rng = new SeededRandom(this.seed + this.config.seedOffset);

    const hueShift = new Float32Array(instanceCount);
    const satShift = new Float32Array(instanceCount);
    const valueShift = new Float32Array(instanceCount);
    const roughnessShift = new Float32Array(instanceCount);
    const metalnessShift = new Float32Array(instanceCount);
    const normalStrength = new Float32Array(instanceCount);
    const scale = new Float32Array(instanceCount);
    const colorShift = new Float32Array(instanceCount * 3);
    const roughnessMetalness = new Float32Array(instanceCount * 2);

    const [hMin, hMax] = this.config.hueShiftRange;
    const [sMin, sMax] = this.config.saturationShiftRange;
    const [vMin, vMax] = this.config.valueShiftRange;
    const [rMin, rMax] = this.config.roughnessShiftRange;
    const [mMin, mMax] = this.config.metalnessShiftRange;
    const [nMin, nMax] = this.config.normalStrengthRange;
    const [scMin, scMax] = this.config.scaleRange;

    for (let i = 0; i < instanceCount; i++) {
      const h = rng.nextFloat(hMin, hMax);
      const s = rng.nextFloat(sMin, sMax);
      const v = rng.nextFloat(vMin, vMax);
      const r = rng.nextFloat(rMin, rMax);
      const m = rng.nextFloat(mMin, mMax);
      const n = rng.nextFloat(nMin, nMax);
      const sc = rng.nextFloat(scMin, scMax);

      hueShift[i] = h;
      satShift[i] = s;
      valueShift[i] = v;
      roughnessShift[i] = r;
      metalnessShift[i] = m;
      normalStrength[i] = n;
      scale[i] = sc;

      // Packed vec3: HSV shift
      colorShift[i * 3] = h;
      colorShift[i * 3 + 1] = s;
      colorShift[i * 3 + 2] = v;

      // Packed vec2: roughness + metalness
      roughnessMetalness[i * 2] = r;
      roughnessMetalness[i * 2 + 1] = m;
    }

    return [
      { name: 'instanceHueShift', size: 1, data: hueShift },
      { name: 'instanceSatShift', size: 1, data: satShift },
      { name: 'instanceValueShift', size: 1, data: valueShift },
      { name: 'instanceRoughnessShift', size: 1, data: roughnessShift },
      { name: 'instanceMetalnessShift', size: 1, data: metalnessShift },
      { name: 'instanceNormalStrength', size: 1, data: normalStrength },
      { name: 'instanceScale', size: 1, data: scale },
      { name: 'instanceColorShift', size: 3, data: colorShift },
      { name: 'instanceRoughnessMetalness', size: 2, data: roughnessMetalness },
    ];
  }

  /**
   * Adds per-instance attributes to an InstancedMesh's geometry.
   *
   * Each attribute is stored as an `InstancedBufferAttribute` on the mesh's
   * geometry. The shader can then read these attributes using the `instance`
   * qualifier (GLSL 3.0) or via Three.js's built-in instancing support.
   *
   * @param mesh — The InstancedMesh to apply attributes to
   */
  applyToInstancedMesh(mesh: THREE.InstancedMesh): void {
    const instanceCount = mesh.count;
    const attributes = this.generateInstanceAttributes(instanceCount);
    const geometry = mesh.geometry;

    for (const attr of attributes) {
      const instancedAttr = new THREE.InstancedBufferAttribute(attr.data, attr.size);
      instancedAttr.setUsage(THREE.DynamicDrawUsage);

      // Remove existing attribute with the same name if present
      if (geometry.hasAttribute(attr.name)) {
        geometry.deleteAttribute(attr.name);
      }

      geometry.setAttribute(attr.name, instancedAttr);
    }

    // Ensure the geometry knows about the new attributes
    geometry.computeBoundingSphere();
  }

  /**
   * Returns GLSL code declaring per-instance attributes for custom shaders.
   *
   * This preamble should be injected into the vertex shader before `main()`.
   * It declares all per-instance attributes so the shader can read them and
   * pass them as varyings to the fragment shader.
   *
   * @returns GLSL string with attribute declarations
   */
  generateShaderPreamble(): string {
    return /* glsl */ `
// ============================================================================
// Per-Instance Material Randomization Attributes
// Auto-generated by PerInstanceRandomizer
// ============================================================================
attribute float instanceHueShift;
attribute float instanceSatShift;
attribute float instanceValueShift;
attribute float instanceRoughnessShift;
attribute float instanceMetalnessShift;
attribute float instanceNormalStrength;
attribute float instanceScale;
attribute vec3 instanceColorShift;
attribute vec2 instanceRoughnessMetalness;
`;
  }

  /**
   * Returns GLSL varying declarations for passing instance data to fragment shader.
   *
   * Should be added to both vertex and fragment shaders.
   *
   * @returns GLSL string with varying declarations
   */
  generateVaryingDeclarations(): string {
    return /* glsl */ `
// Per-instance material randomization varyings
varying float vInstanceHueShift;
varying float vInstanceSatShift;
varying float vInstanceValueShift;
varying float vInstanceRoughnessShift;
varying float vInstanceMetalnessShift;
varying float vInstanceNormalStrength;
varying float vInstanceScale;
`;
  }

  /**
   * Returns GLSL code for the vertex shader that passes instance attributes
   * to varyings. Should be placed inside `main()` in the vertex shader.
   *
   * @returns GLSL string with varying assignments
   */
  generateVertexPassThrough(): string {
    return /* glsl */ `
  // Pass per-instance material randomization to fragment shader
  vInstanceHueShift = instanceHueShift;
  vInstanceSatShift = instanceSatShift;
  vInstanceValueShift = instanceValueShift;
  vInstanceRoughnessShift = instanceRoughnessShift;
  vInstanceMetalnessShift = instanceMetalnessShift;
  vInstanceNormalStrength = instanceNormalStrength;
  vInstanceScale = instanceScale;
`;
  }

  /**
   * Returns GLSL code for applying per-instance HSV color shifts in the fragment shader.
   * Converts the base color to HSV, applies shifts, and converts back to RGB.
   *
   * @param baseColorVar — Name of the vec3 variable holding the base color (default 'baseColor')
   * @param outputVar — Name of the vec3 variable to write the shifted color to (default 'shiftedColor')
   * @returns GLSL string with HSV shift logic
   */
  generateFragmentColorShift(
    baseColorVar: string = 'baseColor',
    outputVar: string = 'shiftedColor'
  ): string {
    return /* glsl */ `
  // Apply per-instance HSV color shift
  vec3 ${outputVar}_hsv = rgb2hsv_pt(${baseColorVar});
  ${outputVar}_hsv.x = fract(${outputVar}_hsv.x + vInstanceHueShift + 1.0); // Wrap hue
  ${outputVar}_hsv.y = clamp(${outputVar}_hsv.y + vInstanceSatShift, 0.0, 1.0);
  ${outputVar}_hsv.z = clamp(${outputVar}_hsv.z + vInstanceValueShift, 0.0, 1.0);
  vec3 ${outputVar} = hsv2rgb_pt(${outputVar}_hsv);
`;
  }

  /**
   * Creates a material variant for a specific instance (for non-instanced usage).
   *
   * When not using InstancedMesh (e.g., individual meshes or when debugging),
   * this method creates a cloned material with the randomization baked in for
   * a specific instance index.
   *
   * @param baseMaterial — The base material to create a variant from
   * @param instanceIndex — The instance index to generate randomization for
   * @returns A new material with per-instance variation applied
   */
  generateMaterialVariation(baseMaterial: THREE.Material, instanceIndex: number): THREE.Material {
    const rng = new SeededRandom(this.seed + this.config.seedOffset + instanceIndex * 7919);

    const cloned = baseMaterial.clone();

    // Apply color variation if the material has a color property
    if ('color' in cloned && (cloned as any).color instanceof THREE.Color) {
      const baseColor = (cloned as any).color as THREE.Color;
      const hsl: THREE.HSL = { h: 0, s: 0, l: 0 };
      baseColor.getHSL(hsl);

      const hShift = rng.nextFloat(...this.config.hueShiftRange);
      const sShift = rng.nextFloat(...this.config.saturationShiftRange);
      const vShift = rng.nextFloat(...this.config.valueShiftRange);

      const newH = ((hsl.h + hShift) % 1 + 1) % 1; // Wrap hue
      const newS = Math.max(0, Math.min(1, hsl.s + sShift));
      const newL = Math.max(0, Math.min(1, hsl.l + vShift));

      baseColor.setHSL(newH, newS, newL);
    }

    // Apply roughness variation
    if ('roughness' in cloned && typeof (cloned as any).roughness === 'number') {
      const rShift = rng.nextFloat(...this.config.roughnessShiftRange);
      (cloned as any).roughness = Math.max(0, Math.min(1, (cloned as any).roughness + rShift));
    }

    // Apply metalness variation
    if ('metalness' in cloned && typeof (cloned as any).metalness === 'number') {
      const mShift = rng.nextFloat(...this.config.metalnessShiftRange);
      (cloned as any).metalness = Math.max(0, Math.min(1, (cloned as any).metalness + mShift));
    }

    // Apply normal scale variation
    if ('normalScale' in cloned && (cloned as any).normalScale instanceof THREE.Vector2) {
      const nShift = rng.nextFloat(...this.config.normalStrengthRange);
      const ns = (cloned as any).normalScale as THREE.Vector2;
      (cloned as any).normalScale = new THREE.Vector2(
        Math.max(0, ns.x + nShift),
        Math.max(0, ns.y + nShift)
      );
    }

    return cloned;
  }
}

// ============================================================================
// 5. InstancedMaterialBuilder
// ============================================================================

/**
 * Builds a custom ShaderMaterial that reads per-instance attributes from an
 * InstancedMesh to vary color, roughness, metalness, and normal strength
 * per instance.
 *
 * The builder creates:
 * - A vertex shader that reads instance attributes and passes them as varyings
 * - A fragment shader that applies HSV color shifts and PBR property modulation
 * - Proper uniform bindings for the base material's properties
 *
 * This enables efficient batched rendering where each instance has unique
 * material variation without requiring separate draw calls.
 *
 * @example
 * ```ts
 * const baseMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8 });
 * const randomizer = new PerInstanceRandomizer(PRESET_RANDOMIZATION_CONFIGS.wood, 42);
 * const builder = new InstancedMaterialBuilder(baseMat, randomizer);
 * const shaderMat = builder.buildInstancedShaderMaterial();
 * mesh.material = shaderMat;
 * ```
 */
export class InstancedMaterialBuilder {
  private readonly baseMaterial: THREE.Material;
  private readonly randomizer: PerInstanceRandomizer;

  /**
   * @param baseMaterial — The base material whose properties will be varied per instance
   * @param randomizer — The per-instance randomizer that generates attribute data
   */
  constructor(baseMaterial: THREE.Material, randomizer: PerInstanceRandomizer) {
    this.baseMaterial = baseMaterial;
    this.randomizer = randomizer;
  }

  /**
   * Extracts PBR properties from the base material for uniform binding.
   */
  private extractBaseProperties(): {
    color: THREE.Color;
    roughness: number;
    metalness: number;
    opacity: number;
    normalScale: number;
    emissive: THREE.Color;
    emissiveIntensity: number;
  } {
    const mat = this.baseMaterial as any;
    return {
      color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
      roughness: typeof mat.roughness === 'number' ? mat.roughness : 0.5,
      metalness: typeof mat.metalness === 'number' ? mat.metalness : 0.0,
      opacity: typeof mat.opacity === 'number' ? mat.opacity : 1.0,
      normalScale: mat.normalScale ? mat.normalScale.x : 1.0,
      emissive: mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000),
      emissiveIntensity: typeof mat.emissiveIntensity === 'number' ? mat.emissiveIntensity : 0.0,
    };
  }

  /**
   * Creates a custom ShaderMaterial that reads per-instance attributes from
   * the InstancedMesh to vary color/roughness/metalness per instance.
   *
   * The vertex shader reads instance attributes and passes them as varyings.
   * The fragment shader applies HSV shifts to the base color and modulates
   * roughness, metalness, and normal strength per instance.
   *
   * @returns A THREE.ShaderMaterial configured for per-instance material variation
   */
  buildInstancedShaderMaterial(): THREE.ShaderMaterial {
    const props = this.extractBaseProperties();

    const uniforms: Record<string, THREE.IUniform> = {
      uBaseColor: { value: props.color },
      uRoughness: { value: props.roughness },
      uMetalness: { value: props.metalness },
      uOpacity: { value: props.opacity },
      uNormalScale: { value: props.normalScale },
      uEmissive: { value: props.emissive },
      uEmissiveIntensity: { value: props.emissiveIntensity },
      uBaseMap: { value: null },
      uNormalMap: { value: null },
      uRoughnessMap: { value: null },
      uMetalnessMap: { value: null },
      uEmissiveMap: { value: null },
    };

    // Copy texture maps from base material if present
    const mat = this.baseMaterial as any;
    if (mat.map) uniforms.uBaseMap.value = mat.map;
    if (mat.normalMap) uniforms.uNormalMap.value = mat.normalMap;
    if (mat.roughnessMap) uniforms.uRoughnessMap.value = mat.roughnessMap;
    if (mat.metalnessMap) uniforms.uMetalnessMap.value = mat.metalnessMap;
    if (mat.emissiveMap) uniforms.uEmissiveMap.value = mat.emissiveMap;

    // ---- Vertex Shader ----
    const vertexShader = /* glsl */ `
${this.randomizer.generateShaderPreamble()}
${this.randomizer.generateVaryingDeclarations()}

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec3 vViewDir;

#ifdef USE_INSTANCING
// InstancedMesh automatically provides instanceMatrix
#endif

void main() {
  vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;

  vec3 transformedNormal = mat3(instanceMatrix) * normal;
  vNormal = normalize(normalMatrix * transformedNormal);

  vViewDir = normalize(cameraPosition - worldPosition.xyz);

  #ifdef USE_UV
    vUv = uv;
  #else
    vUv = vec2(0.0);
  #endif

  // Apply per-instance scale to UVs for texture variation
  vUv *= (1.0 + instanceScale);

  ${this.randomizer.generateVertexPassThrough()}

  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

    // ---- Fragment Shader ----
    const fragmentShader = /* glsl */ `
precision highp float;

${this.randomizer.generateVaryingDeclarations()}

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec3 vViewDir;

// Uniforms
uniform vec3 uBaseColor;
uniform float uRoughness;
uniform float uMetalness;
uniform float uOpacity;
uniform float uNormalScale;
uniform vec3 uEmissive;
uniform float uEmissiveIntensity;

uniform sampler2D uBaseMap;
uniform sampler2D uNormalMap;
uniform sampler2D uRoughnessMap;
uniform sampler2D uMetalnessMap;
uniform sampler2D uEmissiveMap;

// HSV conversion functions (from GLSLNoiseLibrary)
vec3 hsv2rgb_pt(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 rgb2hsv_pt(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// PBR lighting (simplified Cook-Torrance)
const float PI = 3.14159265359;

float distributionGGX(vec3 N, vec3 H, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float NdotH = max(dot(N, H), 0.0);
  float NdotH2 = NdotH * NdotH;
  float denom = NdotH2 * (a2 - 1.0) + 1.0;
  return a2 / (PI * denom * denom + 0.0001);
}

float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
  float r = roughness + 1.0;
  float k = (r * r) / 8.0;
  float NdotV = max(dot(N, V), 0.0);
  float NdotL = max(dot(N, L), 0.0);
  float ggx1 = NdotV / (NdotV * (1.0 - k) + k);
  float ggx2 = NdotL / (NdotL * (1.0 - k) + k);
  return ggx1 * ggx2;
}

vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

void main() {
  // Sample base color from texture or use uniform
  vec4 texColor = texture2D(uBaseMap, vUv);
  vec3 baseColor = mix(uBaseColor, texColor.rgb, step(0.5, float(textureSize(uBaseMap, 0).x > 1)));

  // Apply per-instance HSV color shift
  vec3 shiftedHsv = rgb2hsv_pt(baseColor);
  shiftedHsv.x = fract(shiftedHsv.x + vInstanceHueShift + 1.0); // Wrap hue
  shiftedHsv.y = clamp(shiftedHsv.y + vInstanceSatShift, 0.0, 1.0);
  shiftedHsv.z = clamp(shiftedHsv.z + vInstanceValueShift, 0.0, 1.0);
  vec3 albedo = hsv2rgb_pt(shiftedHsv);

  // Per-instance roughness variation
  float roughnessSampled = texture2D(uRoughnessMap, vUv).r;
  float roughnessBase = mix(uRoughness, roughnessSampled, step(0.5, float(textureSize(uRoughnessMap, 0).x > 1)));
  float roughness = clamp(roughnessBase + vInstanceRoughnessShift, 0.0, 1.0);

  // Per-instance metalness variation
  float metalnessSampled = texture2D(uMetalnessMap, vUv).r;
  float metalnessBase = mix(uMetalness, metalnessSampled, step(0.5, float(textureSize(uMetalnessMap, 0).x > 1)));
  float metalness = clamp(metalnessBase + vInstanceMetalnessShift, 0.0, 1.0);

  // Normal mapping with per-instance strength variation
  vec3 normal = normalize(vNormal);
  vec3 normalMapVal = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
  float effectiveNormalScale = uNormalScale * (1.0 + vInstanceNormalStrength);
  if (textureSize(uNormalMap, 0).x > 1) {
    normal = normalize(normal + normalMapVal * effectiveNormalScale);
  }

  // Simplified PBR lighting with a directional + ambient setup
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
  vec3 lightColor = vec3(1.0, 0.98, 0.95);
  float lightIntensity = 2.0;

  vec3 viewDir = normalize(vViewDir);
  vec3 halfDir = normalize(lightDir + viewDir);

  // PBR calculation
  vec3 F0 = mix(vec3(0.04), albedo, metalness);
  float NDF = distributionGGX(normal, halfDir, roughness);
  float G = geometrySmith(normal, viewDir, lightDir, roughness);
  vec3 F = fresnelSchlick(max(dot(halfDir, viewDir), 0.0), F0);

  vec3 numerator = NDF * G * F;
  float denominator = 4.0 * max(dot(normal, viewDir), 0.0) * max(dot(normal, lightDir), 0.0) + 0.0001;
  vec3 specular = numerator / denominator;

  vec3 kD = (vec3(1.0) - F) * (1.0 - metalness);
  float NdotL = max(dot(normal, lightDir), 0.0);

  vec3 Lo = (kD * albedo / PI + specular) * lightColor * NdotL * lightIntensity;

  // Ambient
  vec3 ambient = vec3(0.03) * albedo;
  vec3 color = ambient + Lo;

  // Emissive with per-instance color influence
  vec3 emissiveColor = uEmissive * uEmissiveIntensity;
  color += emissiveColor;

  // HDR tonemapping (ACES approximation)
  color = color / (color + vec3(1.0));
  // Gamma correction
  color = pow(color, vec3(1.0 / 2.2));

  float alpha = uOpacity;
  gl_FragColor = vec4(color, alpha);
}
`;

    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: props.opacity < 1.0,
      side: this.baseMaterial.side ?? THREE.FrontSide,
      depthWrite: true,
    });
  }

  /**
   * Returns the vertex shader code for per-instance material variation.
   * Useful when composing with other custom shader logic.
   */
  getVertexShader(): string {
    return this.buildInstancedShaderMaterial().vertexShader;
  }

  /**
   * Returns the fragment shader code for per-instance material variation.
   * Useful when composing with other custom shader logic.
   */
  getFragmentShader(): string {
    return this.buildInstancedShaderMaterial().fragmentShader;
  }

  /**
   * Returns the uniform map for the instanced shader material.
   * Useful when composing with other custom shader logic.
   */
  getUniforms(): Record<string, THREE.IUniform> {
    return this.buildInstancedShaderMaterial().uniforms;
  }
}

// ============================================================================
// 6. Integration Helper: randomizeInstancedMesh
// ============================================================================

/**
 * Asset type string for preset config lookup.
 * Extends this union to add new asset types.
 */
export type RandomizableAssetType =
  | 'tree'
  | 'rock'
  | 'grass'
  | 'creature'
  | 'water'
  | 'fabric'
  | 'wood'
  | 'metal'
  | string;

/**
 * One-call convenience function that applies per-instance material randomization
 * to an InstancedMesh.
 *
 * This function:
 * 1. Looks up the preset config for the asset type (falls back to default)
 * 2. Creates a PerInstanceRandomizer with the given seed
 * 3. Generates per-instance attribute arrays
 * 4. Applies them to the mesh's geometry
 * 5. Optionally replaces the mesh's material with an instanced shader material
 *    that reads the per-instance attributes for color/roughness/metalness variation
 *
 * @param mesh — The InstancedMesh to randomize
 * @param assetType — The asset type name (e.g., 'tree', 'rock', 'grass')
 * @param seed — Seed for deterministic randomization
 * @param replaceMaterial — If true, replaces the mesh material with a ShaderMaterial
 *                          that uses the per-instance attributes. If false, only adds
 *                          the instance attributes (for custom shader pipelines).
 *                          Default is true.
 * @param customConfig — Optional custom config that overrides the preset for the asset type
 *
 * @example
 * ```ts
 * const mesh = new THREE.InstancedMesh(geometry, material, 100);
 * // Set instance matrices...
 * randomizeInstancedMesh(mesh, 'tree', 42);
 * // Now each tree instance has unique color/roughness/metalness variation
 * ```
 */
export function randomizeInstancedMesh(
  mesh: THREE.InstancedMesh,
  assetType: RandomizableAssetType,
  seed: number,
  replaceMaterial: boolean = true,
  customConfig?: Partial<MaterialRandomizationConfig>
): void {
  // Step 1: Look up preset config, falling back to default
  const presetConfig = PRESET_RANDOMIZATION_CONFIGS[assetType] ?? DEFAULT_RANDOMIZATION_CONFIG;

  // Merge with custom overrides if provided
  const config: MaterialRandomizationConfig = customConfig
    ? { ...presetConfig, ...customConfig }
    : presetConfig;

  // Step 2: Create randomizer
  const randomizer = new PerInstanceRandomizer(config, seed);

  // Step 3 & 4: Generate and apply per-instance attributes
  randomizer.applyToInstancedMesh(mesh);

  // Step 5: Optionally replace material with instanced shader material
  if (replaceMaterial && mesh.material) {
    const builder = new InstancedMaterialBuilder(
      Array.isArray(mesh.material) ? mesh.material[0] : mesh.material,
      randomizer
    );
    const shaderMaterial = builder.buildInstancedShaderMaterial();
    mesh.material = shaderMaterial;
  }
}

// ============================================================================
// Utility: Create Compact Instance Attributes (optimized for GPU)
// ============================================================================

/**
 * Creates a compact set of instance attributes that pack all randomization
 * data into fewer attributes for reduced GPU memory and bandwidth.
 *
 * Instead of 7+ separate float attributes, this creates:
 * - `instanceColorShift` (vec3) — HSV shift packed as (hue, saturation, value)
 * - `instanceSurfaceShift` (vec3) — (roughness, metalness, normalStrength)
 * - `instanceScale` (float) — texture scale multiplier
 *
 * Total: 7 floats in 3 attributes vs 7+ attributes.
 *
 * @param config — Randomization configuration
 * @param seed — Deterministic seed
 * @param instanceCount — Number of instances
 * @returns Compact array of InstanceRandomAttribute
 */
export function generateCompactInstanceAttributes(
  config: MaterialRandomizationConfig,
  seed: number,
  instanceCount: number
): InstanceRandomAttribute[] {
  const rng = new SeededRandom(seed + config.seedOffset);

  const colorShift = new Float32Array(instanceCount * 3);
  const surfaceShift = new Float32Array(instanceCount * 3);
  const scaleData = new Float32Array(instanceCount);

  const [hMin, hMax] = config.hueShiftRange;
  const [sMin, sMax] = config.saturationShiftRange;
  const [vMin, vMax] = config.valueShiftRange;
  const [rMin, rMax] = config.roughnessShiftRange;
  const [mMin, mMax] = config.metalnessShiftRange;
  const [nMin, nMax] = config.normalStrengthRange;
  const [scMin, scMax] = config.scaleRange;

  for (let i = 0; i < instanceCount; i++) {
    // Pack HSV shift
    colorShift[i * 3] = rng.nextFloat(hMin, hMax);
    colorShift[i * 3 + 1] = rng.nextFloat(sMin, sMax);
    colorShift[i * 3 + 2] = rng.nextFloat(vMin, vMax);

    // Pack surface property shifts
    surfaceShift[i * 3] = rng.nextFloat(rMin, rMax);
    surfaceShift[i * 3 + 1] = rng.nextFloat(mMin, mMax);
    surfaceShift[i * 3 + 2] = rng.nextFloat(nMin, nMax);

    // Texture scale
    scaleData[i] = rng.nextFloat(scMin, scMax);
  }

  return [
    { name: 'instanceColorShift', size: 3, data: colorShift },
    { name: 'instanceSurfaceShift', size: 3, data: surfaceShift },
    { name: 'instanceScale', size: 1, data: scaleData },
  ];
}

/**
 * GLSL preamble for the compact attribute format.
 * Use this instead of `PerInstanceRandomizer.generateShaderPreamble()`
 * when using `generateCompactInstanceAttributes()`.
 */
export const COMPACT_SHADER_PREAMBLE = /* glsl */ `
// ============================================================================
// Per-Instance Material Randomization (Compact Format)
// Auto-generated by PerInstanceMaterialRandomization
// ============================================================================
attribute vec3 instanceColorShift;    // (hueShift, satShift, valueShift)
attribute vec3 instanceSurfaceShift;  // (roughnessShift, metalnessShift, normalStrength)
attribute float instanceScale;        // texture scale multiplier
`;

/**
 * GLSL varying declarations for the compact attribute format.
 */
export const COMPACT_VARYING_DECLARATIONS = /* glsl */ `
// Per-instance material randomization varyings (compact)
varying vec3 vInstanceColorShift;    // HSV shift
varying vec3 vInstanceSurfaceShift;  // roughness, metalness, normalStrength shifts
varying float vInstanceScale;        // texture scale
`;

/**
 * GLSL vertex pass-through code for the compact attribute format.
 */
export const COMPACT_VERTEX_PASS_THROUGH = /* glsl */ `
  // Pass per-instance material randomization to fragment shader (compact)
  vInstanceColorShift = instanceColorShift;
  vInstanceSurfaceShift = instanceSurfaceShift;
  vInstanceScale = instanceScale;
`;

/**
 * GLSL fragment code for applying compact per-instance color shifts.
 *
 * @param baseColorVar — Name of the vec3 variable holding the base color
 * @param outputVar — Name of the vec3 output variable
 * @returns GLSL string with HSV shift logic using compact varyings
 */
export function generateCompactFragmentColorShift(
  baseColorVar: string = 'baseColor',
  outputVar: string = 'shiftedColor'
): string {
  return /* glsl */ `
  // Apply per-instance HSV color shift (compact format)
  vec3 ${outputVar}_hsv = rgb2hsv_pt(${baseColorVar});
  ${outputVar}_hsv.x = fract(${outputVar}_hsv.x + vInstanceColorShift.x + 1.0);
  ${outputVar}_hsv.y = clamp(${outputVar}_hsv.y + vInstanceColorShift.y, 0.0, 1.0);
  ${outputVar}_hsv.z = clamp(${outputVar}_hsv.z + vInstanceColorShift.z, 0.0, 1.0);
  vec3 ${outputVar} = hsv2rgb_pt(${outputVar}_hsv);
`;
}

// ============================================================================
// Utility: Merge Randomization with Existing Shader
// ============================================================================

/**
 * Options for merging per-instance randomization into an existing shader.
 */
export interface ShaderMergeOptions {
  /** Whether to use compact attribute format (default: true for better performance) */
  compact?: boolean;
  /** Whether to include HSV conversion functions in the merged shader (default: true) */
  includeHSVFunctions?: boolean;
  /** Custom varying prefix to avoid name collisions (default: 'vInst') */
  varyingPrefix?: string;
}

/**
 * Merges per-instance randomization GLSL code into an existing vertex/fragment
 * shader pair. This is useful when you already have custom shaders and want to
 * add per-instance variation without rewriting them from scratch.
 *
 * @param vertexShader — Existing vertex shader code
 * @param fragmentShader — Existing fragment shader code
 * @param options — Merge options
 * @returns Object with modified vertexShader and fragmentShader strings
 */
export function mergeRandomizationIntoShader(
  vertexShader: string,
  fragmentShader: string,
  options: ShaderMergeOptions = {}
): { vertexShader: string; fragmentShader: string } {
  const {
    compact = true,
    includeHSVFunctions = true,
  } = options;

  const preamble = compact ? COMPACT_SHADER_PREAMBLE : new PerInstanceRandomizer(DEFAULT_RANDOMIZATION_CONFIG, 0).generateShaderPreamble();
  const varyings = compact ? COMPACT_VARYING_DECLARATIONS : new PerInstanceRandomizer(DEFAULT_RANDOMIZATION_CONFIG, 0).generateVaryingDeclarations();
  const passThrough = compact ? COMPACT_VERTEX_PASS_THROUGH : new PerInstanceRandomizer(DEFAULT_RANDOMIZATION_CONFIG, 0).generateVertexPassThrough();

  const hsvFunctions = includeHSVFunctions
    ? /* glsl */ `
vec3 hsv2rgb_pt(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 rgb2hsv_pt(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
`
    : '';

  // Inject into vertex shader: add preamble + varyings before main, pass-through inside main
  let mergedVert = vertexShader;
  if (!mergedVert.includes('instanceColorShift')) {
    mergedVert = mergedVert.replace(
      /void\s+main\s*\(\)/,
      `${preamble}\n${varyings}\nvoid main()`
    );
    mergedVert = mergedVert.replace(
      /void\s+main\s*\(\)\s*\{/,
      `void main() {\n${passThrough}`
    );
  }

  // Inject into fragment shader: add varyings + HSV functions before main
  let mergedFrag = fragmentShader;
  if (!mergedFrag.includes('vInstanceColorShift') && !mergedFrag.includes('vInstanceHueShift')) {
    mergedFrag = mergedFrag.replace(
      /void\s+main\s*\(\)/,
      `${varyings}\n${hsvFunctions}\nvoid main()`
    );
  }

  return { vertexShader: mergedVert, fragmentShader: mergedFrag };
}
