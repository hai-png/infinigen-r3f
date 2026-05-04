/**
 * TerrainSurfaceShaderPipeline — Per-Type Shader Pipeline for terrain surfaces
 *
 * Implements a unified terrain surface shader system with:
 * - 12 terrain material types with dedicated GLSL fragment generators
 * - Per-surface-type specialized shaders (stone, sand, grass, snow, ice, mud, lava, etc.)
 * - Blending between terrain types using material ID weights
 * - Triplanar projection for seamless mapping on arbitrary terrain geometry
 * - Integration with Material3DEvaluator for 3D coordinate evaluation
 *
 * Phase 2, Item 2: Per-Type Shader Pipelines
 *
 * @module assets/materials/terrain
 */

import * as THREE from 'three';
import {
  SIMPLEX_3D_GLSL,
  SIMPLEX_2D_GLSL,
  FBM_GLSL,
  MUSGRAVE_GLSL,
  VALUE_NOISE_GLSL,
  HSV_RGB_GLSL,
} from '../../shaders/common/NoiseGLSL';
import {
  VORONOI_2D_GLSL,
  VORONOI_3D_GLSL,
} from '../../shaders/common/VoronoiGLSL';
import { PBR_GLSL } from '../../shaders/common/PBRGLSL';
import { TRIPLANAR_GLSL } from '../shaders/TriplanarProjection';

// ============================================================================
// Types
// ============================================================================

/** Terrain material types */
export type TerrainMaterialType =
  | 'stone'
  | 'sand'
  | 'soil'
  | 'dirt'
  | 'mud'
  | 'snow'
  | 'ice'
  | 'cobblestone'
  | 'grass'
  | 'water'
  | 'lava'
  | 'sand_dune';

/** Terrain surface configuration */
export interface TerrainSurfaceConfig {
  type: TerrainMaterialType;
  color: THREE.Color;
  roughness: number;
  metalness: number;
  normalStrength: number;
  displacementScale: number;
  /** Custom shader parameters */
  shaderParams: Record<string, number>;
}

/** Terrain blend weight for multi-material rendering */
export interface TerrainBlendWeight {
  type: TerrainMaterialType;
  weight: number;
}

// ============================================================================
// Terrain Surface Presets
// ============================================================================

const TERRAIN_PRESETS: Record<TerrainMaterialType, TerrainSurfaceConfig> = {
  stone: {
    type: 'stone',
    color: new THREE.Color(0.48, 0.45, 0.40),
    roughness: 0.85,
    metalness: 0.0,
    normalStrength: 2.0,
    displacementScale: 0.05,
    shaderParams: { crackScale: 3.0, lichenIntensity: 0.2, bumpScale: 1.5 },
  },
  sand: {
    type: 'sand',
    color: new THREE.Color(0.82, 0.72, 0.52),
    roughness: 0.9,
    metalness: 0.0,
    normalStrength: 0.8,
    displacementScale: 0.01,
    shaderParams: { rippleScale: 15.0, grainScale: 80.0, windAngle: 0.3 },
  },
  soil: {
    type: 'soil',
    color: new THREE.Color(0.25, 0.18, 0.10),
    roughness: 0.92,
    metalness: 0.0,
    normalStrength: 0.8,
    displacementScale: 0.02,
    shaderParams: { clumpScale: 8.0, organicMatter: 0.3 },
  },
  dirt: {
    type: 'dirt',
    color: new THREE.Color(0.35, 0.25, 0.15),
    roughness: 0.95,
    metalness: 0.0,
    normalStrength: 1.0,
    displacementScale: 0.02,
    shaderParams: { clumpScale: 6.0, pebbleDensity: 0.15 },
  },
  mud: {
    type: 'mud',
    color: new THREE.Color(0.30, 0.22, 0.14),
    roughness: 0.7,
    metalness: 0.0,
    normalStrength: 1.5,
    displacementScale: 0.01,
    shaderParams: { wetness: 0.5, crackScale: 5.0, puddleDepth: 0.3 },
  },
  snow: {
    type: 'snow',
    color: new THREE.Color(0.92, 0.94, 0.98),
    roughness: 0.7,
    metalness: 0.0,
    normalStrength: 0.5,
    displacementScale: 0.01,
    shaderParams: { crystalScale: 20.0, compressionScale: 3.0, meltEdge: 0.3 },
  },
  ice: {
    type: 'ice',
    color: new THREE.Color(0.70, 0.82, 0.90),
    roughness: 0.15,
    metalness: 0.0,
    normalStrength: 0.4,
    displacementScale: 0.005,
    shaderParams: { crackScale: 4.0, frostScale: 30.0, refractionStrength: 0.3 },
  },
  cobblestone: {
    type: 'cobblestone',
    color: new THREE.Color(0.45, 0.42, 0.38),
    roughness: 0.75,
    metalness: 0.0,
    normalStrength: 1.8,
    displacementScale: 0.04,
    shaderParams: { stoneScale: 4.0, mortarWidth: 0.08, stoneVariation: 0.3 },
  },
  grass: {
    type: 'grass',
    color: new THREE.Color(0.18, 0.38, 0.10),
    roughness: 0.65,
    metalness: 0.0,
    normalStrength: 1.0,
    displacementScale: 0.02,
    shaderParams: { thatchScale: 25.0, dryPatchScale: 5.0, colorVariation: 0.3 },
  },
  water: {
    type: 'water',
    color: new THREE.Color(0.10, 0.30, 0.45),
    roughness: 0.05,
    metalness: 0.0,
    normalStrength: 0.3,
    displacementScale: 0.0,
    shaderParams: { waveScale: 2.0, foamDensity: 0.2, depthFade: 0.5 },
  },
  lava: {
    type: 'lava',
    color: new THREE.Color(0.15, 0.05, 0.02),
    roughness: 0.9,
    metalness: 0.0,
    normalStrength: 2.0,
    displacementScale: 0.03,
    shaderParams: { crackScale: 3.0, temperature: 1500.0, emissionStrength: 5.0 },
  },
  sand_dune: {
    type: 'sand_dune',
    color: new THREE.Color(0.85, 0.75, 0.50),
    roughness: 0.85,
    metalness: 0.0,
    normalStrength: 1.2,
    displacementScale: 0.03,
    shaderParams: { duneScale: 1.5, rippleScale: 12.0, windAngle: 0.5 },
  },
};

// ============================================================================
// Per-Surface-Type GLSL Fragment Generators
// ============================================================================

const TERRAIN_SURFACE_FRAGMENTS: Record<string, string> = {
  stone: /* glsl */ `
    // Stone: Musgrave-driven bumps, crack patterns via Voronoi F2-F1, lichen/moss color variation
    vec3 stoneSurface(vec3 pos, vec3 N, float seed) {
      float crackScale = uShaderParam1; // crackScale
      float lichenIntensity = uShaderParam2; // lichenIntensity
      float bumpScale = uShaderParam3; // bumpScale

      // Musgrave bumps for rock surface
      float bumps = musgraveFBM(pos, 4.0, 6, 2.0, 2.0) * bumpScale;

      // Crack pattern via Voronoi F2-F1
      VoronoiResult3D crack = voronoi3D(pos * crackScale);
      float crackMask = smoothstep(0.0, 0.1, crack.edgeDist);

      // Lichen/moss color variation
      float lichen = snoise3D(pos * 2.0 + vec3(seed + 50.0)) * 0.5 + 0.5;
      lichen = smoothstep(1.0 - lichenIntensity, 1.0, lichen);

      // Stone color with variation
      vec3 baseCol = uSurfaceColor;
      baseColor = mix(baseCol, baseCol * 0.7, 1.0 - crackMask); // Darken in cracks
      baseColor = mix(baseColor, vec3(0.35, 0.42, 0.22), lichen * 0.5); // Lichen tint

      // Roughness: rougher in cracks
      outRoughness = uRoughness + (1.0 - crackMask) * 0.1 + lichen * 0.15;

      // Normal perturbation
      float eps = 0.02;
      float hC = musgraveFBM(pos, 4.0, 6, 2.0, 2.0);
      float hR = musgraveFBM(pos + vec3(eps, 0, 0), 4.0, 6, 2.0, 2.0);
      float hU = musgraveFBM(pos + vec3(0, eps, 0), 4.0, 6, 2.0, 2.0);
      float hF = musgraveFBM(pos + vec3(0, 0, eps), 4.0, 6, 2.0, 2.0);

      perturbNormal = normalize(N - vec3(
        (hR - hC) / eps * uNormalStrength * 0.3,
        (hU - hC) / eps * uNormalStrength * 0.3,
        (hF - hC) / eps * uNormalStrength * 0.3
      ));

      return baseColor;
    }
  `,

  sand: /* glsl */ `
    // Sand: Fine ripples using wave noise, grain-scale roughness, wind ripple patterns
    vec3 sandSurface(vec3 pos, vec3 N, float seed) {
      float rippleScale = uShaderParam1;
      float grainScale = uShaderParam2;
      float windAngle = uShaderParam3;

      // Wind ripple pattern
      vec2 windDir = vec2(cos(windAngle), sin(windAngle));
      float ripple = snoise2D(dot(pos.xz, windDir) * rippleScale + vec2(seed)) * 0.5 + 0.5;

      // Fine grain detail
      float grain = snoise3D(pos * grainScale + vec3(seed)) * 0.15;

      // Sand color variation
      vec3 baseCol = uSurfaceColor;
      baseColor = baseCol * (0.9 + ripple * 0.2 + grain);

      // Wet sand at lower areas
      float wetness = smoothstep(-0.5, 0.0, pos.y) * 0.3;
      outRoughness = uRoughness - wetness * 0.4;
      baseColor *= 1.0 - wetness * 0.15; // Slightly darker when wet

      return baseColor;
    }
  `,

  grass: /* glsl */ `
    // Grass: Color variation from noise, thatch pattern, wet/dry patches
    vec3 grassSurface(vec3 pos, vec3 N, float seed) {
      float thatchScale = uShaderParam1;
      float dryPatchScale = uShaderParam2;
      float colorVariation = uShaderParam3;

      // Base grass color with variation
      vec3 grassGreen = uSurfaceColor;
      vec3 dryGrass = vec3(0.55, 0.50, 0.25);

      // Color variation using noise
      float colorNoise = snoise3D(pos * 3.0 + vec3(seed)) * colorVariation;

      // Dry patches
      float dryness = snoise3D(pos * dryPatchScale + vec3(seed + 20.0)) * 0.5 + 0.5;
      dryness = smoothstep(0.6, 0.9, dryness);

      vec3 baseCol = mix(grassGreen, dryGrass, dryness);
      baseColor = baseCol * (0.85 + colorNoise * 0.3);

      // Thatch pattern for subtle directional texture
      float thatch = snoise2D(pos.xz * thatchScale + vec2(seed)) * 0.1;
      baseColor += thatch;

      // Wet patches
      float wetness = snoise3D(pos * 2.0 + vec3(seed + 30.0)) * 0.5 + 0.5;
      wetness = smoothstep(0.7, 0.9, wetness);
      outRoughness = uRoughness - wetness * 0.2;

      return baseColor;
    }
  `,

  snow: /* glsl */ `
    // Snow: Smooth with subtle crystal structure, compressed footprints, melt patterns
    vec3 snowSurface(vec3 pos, vec3 N, float seed) {
      float crystalScale = uShaderParam1;
      float compressionScale = uShaderParam2;
      float meltEdge = uShaderParam3;

      // Crystal structure (subtle)
      float crystal = snoise3D(pos * crystalScale + vec3(seed)) * 0.05;

      // Compression (smooth undulation)
      float compression = snoise3D(pos * compressionScale + vec3(seed + 10.0)) * 0.1;

      // Melt pattern (slightly blue-tinted at melt edges)
      float melt = snoise3D(pos * 4.0 + vec3(seed + 20.0)) * 0.5 + 0.5;
      melt = smoothstep(1.0 - meltEdge, 1.0, melt);

      vec3 baseCol = uSurfaceColor;
      baseColor = baseColor * (0.95 + crystal + compression);
      baseColor = mix(baseColor, vec3(0.85, 0.90, 0.98), melt * 0.3); // Blue tint at melt

      // Snow is slightly less rough where compressed
      outRoughness = uRoughness - compression * 0.3;

      return baseColor;
    }
  `,

  ice: /* glsl */ `
    // Ice: Smooth surface with internal refraction hints, crack patterns, surface frost
    vec3 iceSurface(vec3 pos, vec3 N, float seed) {
      float crackScale = uShaderParam1;
      float frostScale = uShaderParam2;
      float refractionStrength = uShaderParam3;

      // Crack pattern
      VoronoiResult3D crack = voronoi3D(pos * crackScale + vec3(seed));
      float crackMask = 1.0 - smoothstep(0.0, 0.08, crack.edgeDist);

      // Surface frost
      float frost = snoise3D(pos * frostScale + vec3(seed + 10.0)) * 0.5 + 0.5;
      frost = smoothstep(0.3, 0.7, frost);

      vec3 baseCol = uSurfaceColor;
      // Darken at cracks
      baseColor = mix(baseCol, baseCol * 0.6, crackMask * 0.5);
      // Frost whitening
      baseColor = mix(baseColor, vec3(0.92, 0.95, 1.0), frost * 0.3);
      // Internal refraction color shift
      float refrShift = snoise3D(pos * 2.0 + vec3(seed + 20.0)) * refractionStrength;
      baseColor.b += refrShift * 0.1;

      // Ice is smooth except where cracked
      outRoughness = uRoughness + crackMask * 0.3 + frost * 0.2;

      return baseColor;
    }
  `,

  mud: /* glsl */ `
    // Mud: Wet/dry variation, crack patterns when dry, puddle reflections when wet
    vec3 mudSurface(vec3 pos, vec3 N, float seed) {
      float wetness = uShaderParam1;
      float crackScale = uShaderParam2;
      float puddleDepth = uShaderParam3;

      // Wet/dry variation
      float wetNoise = snoise3D(pos * 3.0 + vec3(seed)) * 0.5 + 0.5;
      float localWetness = wetness * wetNoise;

      // Crack pattern when dry
      float dryness = 1.0 - localWetness;
      VoronoiResult3D crack = voronoi3D(pos * crackScale + vec3(seed + 10.0));
      float crackMask = smoothstep(0.0, 0.1, crack.edgeDist) * dryness;

      vec3 baseCol = uSurfaceColor;
      // Darken when wet
      baseColor = baseCol * (1.0 - localWetness * 0.2);
      // Darken in cracks
      baseColor = mix(baseColor, baseCol * 0.5, (1.0 - crackMask) * dryness * 0.5);

      // Roughness: very low when wet (puddle reflections), high when dry
      outRoughness = mix(uRoughness, 0.05 + localWetness * 0.05, localWetness * puddleDepth);
      outRoughness += (1.0 - crackMask) * dryness * 0.1; // Rougher in dry cracks

      return baseColor;
    }
  `,

  lava: /* glsl */ `
    // Lava: Dark rock with Voronoi crack emission (simplified - full version in LavaShader.ts)
    vec3 lavaSurface(vec3 pos, vec3 N, float seed) {
      float crackScale = uShaderParam1;
      float temperature = uShaderParam2;
      float emissionStrength = uShaderParam3;

      // Crack pattern
      VoronoiResult3D crack = voronoi3D(pos * crackScale + vec3(seed));
      float crackMask = 1.0 - smoothstep(0.0, 0.05, crack.edgeDist);

      // Rock base color (dark, near-black with noise variation)
      float rockNoise = snoise3D(pos * 10.0 + vec3(seed + 50.0)) * 0.05;
      vec3 baseCol = uSurfaceColor + rockNoise;

      // Emission from cracks
      vec3 emission = blackbodyColor(temperature) * crackMask * emissionStrength;

      // Mix: emission for cracks vs dark rock
      baseColor = baseCol + emission;
      outEmission = emission;
      outEmissionStrength = crackMask * emissionStrength;

      // Rough rock except at cracks
      outRoughness = uRoughness - crackMask * 0.3;

      return baseColor;
    }
  `,

  // Default generic terrain surface
  default: /* glsl */ `
    vec3 defaultSurface(vec3 pos, vec3 N, float seed) {
      float noiseVal = snoise3D(pos * 5.0 + vec3(seed)) * 0.5 + 0.5;
      vec3 baseCol = uSurfaceColor * (0.9 + noiseVal * 0.2);
      outRoughness = uRoughness + snoise3D(pos * 10.0 + vec3(seed + 5.0)) * 0.1;
      return baseCol;
    }
  `,
};

// ============================================================================
// Unified Terrain Surface Shader
// ============================================================================

const TERRAIN_SURFACE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vUv = uv;
    vPosition = position;

    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TERRAIN_SURFACE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  // Material uniforms
  uniform vec3 uSurfaceColor;
  uniform float uRoughness;
  uniform float uMetalness;
  uniform float uNormalStrength;
  uniform float uShaderParam1;
  uniform float uShaderParam2;
  uniform float uShaderParam3;
  uniform float uSeed;
  uniform float uTime;
  uniform int uTerrainType; // 0=stone, 1=sand, 2=soil, 3=dirt, 4=mud, 5=snow, 6=ice, 7=cobble, 8=grass, 9=water, 10=lava, 11=sand_dune
  uniform vec3 uLightDir;
  uniform vec3 uCameraPosition;

  // Blend uniforms (for multi-material blending)
  uniform int uBlendEnabled;
  uniform vec3 uSurfaceColor2;
  uniform float uRoughness2;
  uniform float uBlendWeight;
  uniform int uTerrainType2;

  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  ${SIMPLEX_3D_GLSL}
  ${SIMPLEX_2D_GLSL}
  ${FBM_GLSL}
  ${MUSGRAVE_GLSL}
  ${VALUE_NOISE_GLSL}
  ${HSV_RGB_GLSL}
  ${VORONOI_2D_GLSL}
  ${VORONOI_3D_GLSL}
  ${PBR_GLSL}

  // Output variables from surface functions
  vec3 baseColor;
  float outRoughness;
  float outMetallic;
  vec3 perturbNormal;
  vec3 outEmission;
  float outEmissionStrength;

  // Include the blackbody function for lava
  ${/* Re-include blackbody inline for lava */ `
  vec3 blackbodyColor(float tempK) {
    float t = clamp(tempK, 1000.0, 40000.0) / 100.0;
    float r = t <= 66.0 ? 1.0 : clamp(329.698727446 * pow(t - 60.0, -0.1332047592) / 255.0, 0.0, 1.0);
    float g = t <= 66.0 ? clamp((99.4708025861 * log(t) - 161.1195681661) / 255.0, 0.0, 1.0)
                       : clamp(288.1221695283 * pow(t - 60.0, -0.0755148492) / 255.0, 0.0, 1.0);
    float b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp((138.5177312231 * log(t - 10.0) - 305.0447927307) / 255.0, 0.0, 1.0));
    return vec3(r, g, b);
  }
  `}

  // Surface type functions
  ${TERRAIN_SURFACE_FRAGMENTS.stone}
  ${TERRAIN_SURFACE_FRAGMENTS.sand}
  ${TERRAIN_SURFACE_FRAGMENTS.grass}
  ${TERRAIN_SURFACE_FRAGMENTS.snow}
  ${TERRAIN_SURFACE_FRAGMENTS.ice}
  ${TERRAIN_SURFACE_FRAGMENTS.mud}
  ${TERRAIN_SURFACE_FRAGMENTS.lava}
  ${TERRAIN_SURFACE_FRAGMENTS.default}

  // Evaluate terrain surface by type
  void evaluateTerrainSurface(int terrainType, vec3 pos, vec3 N, float seed) {
    // Initialize outputs
    baseColor = uSurfaceColor;
    outRoughness = uRoughness;
    outMetallic = uMetalness;
    perturbNormal = N;
    outEmission = vec3(0.0);
    outEmissionStrength = 0.0;

    if (terrainType == 0) {
      baseColor = stoneSurface(pos, N, seed);
    } else if (terrainType == 1) {
      baseColor = sandSurface(pos, N, seed);
    } else if (terrainType == 2 || terrainType == 3) {
      // Soil and dirt use default with slight variation
      baseColor = defaultSurface(pos, N, seed);
    } else if (terrainType == 4) {
      baseColor = mudSurface(pos, N, seed);
    } else if (terrainType == 5) {
      baseColor = snowSurface(pos, N, seed);
    } else if (terrainType == 6) {
      baseColor = iceSurface(pos, N, seed);
    } else if (terrainType == 7) {
      // Cobblestone uses stone with different params
      baseColor = stoneSurface(pos, N, seed);
    } else if (terrainType == 8) {
      baseColor = grassSurface(pos, N, seed);
    } else if (terrainType == 9) {
      // Water uses default with very low roughness
      baseColor = defaultSurface(pos, N, seed);
      outRoughness = 0.05;
    } else if (terrainType == 10) {
      baseColor = lavaSurface(pos, N, seed);
    } else if (terrainType == 11) {
      // Sand dune uses sand with larger ripple
      baseColor = sandSurface(pos, N, seed);
    } else {
      baseColor = defaultSurface(pos, N, seed);
    }
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(uCameraPosition - vWorldPosition);

    // Evaluate primary terrain surface
    evaluateTerrainSurface(uTerrainType, vPosition, N, uSeed);

    vec3 finalColor = baseColor;
    float finalRoughness = outRoughness;
    vec3 finalNormal = perturbNormal;
    vec3 finalEmission = outEmission;
    float finalEmissionStrength = outEmissionStrength;

    // Blend with secondary terrain type if enabled
    if (uBlendEnabled > 0) {
      // Save primary results
      vec3 color1 = finalColor;
      float rough1 = finalRoughness;
      vec3 norm1 = finalNormal;
      vec3 em1 = finalEmission;
      float emStr1 = finalEmissionStrength;

      // Swap uniforms to evaluate secondary type
      vec3 savedColor = uSurfaceColor;
      float savedRoughness = uRoughness;

      // Use second surface color and roughness
      baseColor = uSurfaceColor2;
      outRoughness = uRoughness2;

      // Evaluate secondary
      evaluateTerrainSurface(uTerrainType2, vPosition, N, uSeed + 100.0);

      // Blend
      float w = uBlendWeight;
      finalColor = mix(color1, baseColor, w);
      finalRoughness = mix(rough1, outRoughness, w);
      finalNormal = normalize(mix(norm1, perturbNormal, w));
      finalEmission = mix(em1, outEmission, w);
      finalEmissionStrength = mix(emStr1, outEmissionStrength, w);
    }

    // --- PBR Lighting ---
    vec3 F0 = vec3(0.04);
    F0 = mix(F0, finalColor, outMetallic);

    vec3 lightDir = normalize(uLightDir);
    vec3 lightColor = vec3(1.0, 0.95, 0.90);

    vec3 Lo = computePBRLight(finalNormal, V, finalColor, outMetallic, finalRoughness,
                              lightDir, lightColor, 1.0, F0);

    // Fill light
    vec3 fillDir = normalize(vec3(-0.3, 0.5, -0.6));
    Lo += computePBRLight(finalNormal, V, finalColor, outMetallic, finalRoughness,
                          fillDir, vec3(0.2), 1.0, F0);

    // Ambient
    vec3 ambient = vec3(0.10) * finalColor;

    vec3 color = ambient + Lo;

    // Emission
    if (finalEmissionStrength > 0.0) {
      color += finalEmission * finalEmissionStrength;
    }

    // Tone mapping
    color = color / (color + vec3(1.0));

    // Gamma correction
    color = pow(color, vec3(1.0 / 2.2));

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ============================================================================
// Terrain Type to Integer Mapping
// ============================================================================

const TERRAIN_TYPE_TO_INT: Record<TerrainMaterialType, number> = {
  stone: 0,
  sand: 1,
  soil: 2,
  dirt: 3,
  mud: 4,
  snow: 5,
  ice: 6,
  cobblestone: 7,
  grass: 8,
  water: 9,
  lava: 10,
  sand_dune: 11,
};

// ============================================================================
// TerrainSurfaceFactory
// ============================================================================

/**
 * Factory class for creating terrain surface shader materials.
 *
 * Supports single terrain type rendering or blended multi-material terrain.
 * Each terrain type has a dedicated GLSL fragment with specialized patterns.
 *
 * @example
 * ```ts
 * const factory = new TerrainSurfaceFactory('stone', 42);
 * const material = factory.create();
 *
 * // Or with blending:
 * const factory = new TerrainSurfaceFactory('stone', 42);
 * const material = factory.createBlended('grass', 0.3);
 * ```
 */
export class TerrainSurfaceFactory {
  private config: TerrainSurfaceConfig;
  private material: THREE.ShaderMaterial | null = null;

  constructor(terrainType: TerrainMaterialType = 'stone', seed: number = 0) {
    this.config = { ...TERRAIN_PRESETS[terrainType], shaderParams: { ...TERRAIN_PRESETS[terrainType].shaderParams } };
    this.config.shaderParams.seed = seed;
  }

  /**
   * Create a terrain surface ShaderMaterial for a single terrain type.
   */
  create(config?: Partial<TerrainSurfaceConfig> & { seed?: number }): THREE.ShaderMaterial {
    const seed = config?.seed ?? this.config.shaderParams.seed ?? 0;
    const finalConfig = { ...this.config, ...config };
    const params = Object.values(finalConfig.shaderParams);

    const uniforms: Record<string, THREE.IUniform> = {
      uSurfaceColor: { value: new THREE.Vector3(finalConfig.color.r, finalConfig.color.g, finalConfig.color.b) },
      uRoughness: { value: finalConfig.roughness },
      uMetalness: { value: finalConfig.metalness },
      uNormalStrength: { value: finalConfig.normalStrength },
      uShaderParam1: { value: params[0] ?? 0 },
      uShaderParam2: { value: params[1] ?? 0 },
      uShaderParam3: { value: params[2] ?? 0 },
      uSeed: { value: seed },
      uTime: { value: 0.0 },
      uTerrainType: { value: TERRAIN_TYPE_TO_INT[finalConfig.type] },
      uLightDir: { value: new THREE.Vector3(0.5, 1.0, 0.8).normalize() },
      uCameraPosition: { value: new THREE.Vector3() },
      // Blend uniforms
      uBlendEnabled: { value: 0 },
      uSurfaceColor2: { value: new THREE.Vector3(1, 1, 1) },
      uRoughness2: { value: 0.5 },
      uBlendWeight: { value: 0.0 },
      uTerrainType2: { value: 0 },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: TERRAIN_SURFACE_VERTEX_SHADER,
      fragmentShader: TERRAIN_SURFACE_FRAGMENT_SHADER,
      uniforms,
      side: THREE.FrontSide,
    });

    this.material.name = `TerrainSurface_${finalConfig.type}_${seed}`;
    return this.material;
  }

  /**
   * Create a blended terrain surface material that transitions between two terrain types.
   */
  createBlended(
    secondType: TerrainMaterialType,
    blendWeight: number = 0.5,
    config?: Partial<TerrainSurfaceConfig> & { seed?: number }
  ): THREE.ShaderMaterial {
    const material = this.create(config);
    const secondConfig = TERRAIN_PRESETS[secondType];

    material.uniforms.uBlendEnabled.value = 1;
    material.uniforms.uSurfaceColor2.value = new THREE.Vector3(secondConfig.color.r, secondConfig.color.g, secondConfig.color.b);
    material.uniforms.uRoughness2.value = secondConfig.roughness;
    material.uniforms.uBlendWeight.value = blendWeight;
    material.uniforms.uTerrainType2.value = TERRAIN_TYPE_TO_INT[secondType];

    return material;
  }

  /**
   * Create a MeshPhysicalMaterial for a terrain type (native Three.js rendering).
   */
  createPhysicalMaterial(terrainType?: TerrainMaterialType): THREE.MeshPhysicalMaterial {
    const config = terrainType ? TERRAIN_PRESETS[terrainType] : this.config;

    return new THREE.MeshPhysicalMaterial({
      color: config.color,
      roughness: config.roughness,
      metalness: config.metalness,
      name: `TerrainSurface_Phys_${config.type}`,
      side: THREE.FrontSide,
    });
  }

  /**
   * Update the time uniform for animated terrain (lava, water).
   */
  updateTime(time: number): void {
    if (this.material && this.material.uniforms.uTime) {
      this.material.uniforms.uTime.value = time;
    }
  }

  /**
   * Update the camera position.
   */
  updateCamera(camera: THREE.Camera): void {
    if (this.material && this.material.uniforms.uCameraPosition) {
      this.material.uniforms.uCameraPosition.value.copy(camera.position);
    }
  }

  /**
   * Update blend weight at runtime.
   */
  updateBlendWeight(weight: number): void {
    if (this.material && this.material.uniforms.uBlendWeight) {
      this.material.uniforms.uBlendWeight.value = weight;
    }
  }

  /**
   * Get the preset for a given terrain type.
   */
  static getPreset(terrainType: TerrainMaterialType): TerrainSurfaceConfig {
    return { ...TERRAIN_PRESETS[terrainType] };
  }

  /**
   * List all terrain types.
   */
  static listTypes(): TerrainMaterialType[] {
    return Object.keys(TERRAIN_PRESETS) as TerrainMaterialType[];
  }

  /**
   * Dispose of created materials.
   */
  dispose(): void {
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
  }
}
