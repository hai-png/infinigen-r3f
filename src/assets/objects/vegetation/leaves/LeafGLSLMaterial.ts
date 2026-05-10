/**
 * LeafMaterial.ts — GLSL Leaf Shader System with Vein Patterns, Translucency, and Seasonal Variants
 *
 * Extends the existing canvas-based leaf material system with a full GLSL shader
 * path that includes:
 *   - Vein pattern: fractal branching pattern using Voronoi + noise
 *   - Translucency: subsurfaceStrength uniform controls light transmission through leaf
 *   - Edge wear: darker/brown at edges using distance from center
 *   - Seasonal color variation: spring/summer/autumn/winter color palettes
 *   - Leaf TYPE shader variants: Broadleaf, Maple, Pine, Palm
 *
 * This complements the existing canvas-based LeafMaterialGenerator by providing
 * GPU-accelerated procedural leaf materials with richer visual detail.
 *
 * @module assets/objects/vegetation/leaves
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Leaf Shader Types
// ============================================================================

/** Supported leaf shader type variants */
export type LeafShaderType = 'broadleaf' | 'maple' | 'pine' | 'palm';

/** Season for color variation */
export type LeafSeason = 'spring' | 'summer' | 'autumn' | 'winter';

/** Parameters for the GLSL leaf shader material */
export interface GLSLLeafMaterialParams {
  /** Leaf type shader variant (default 'broadleaf') */
  leafType: LeafShaderType;
  /** Season for color variation (default 'summer') */
  season: LeafSeason;
  /** Vein pattern intensity 0-1 (default 0.6) */
  veinIntensity: number;
  /** Subsurface/translucency strength 0-1 (default 0.5) */
  subsurfaceStrength: number;
  /** Edge wear/darkening extent 0-1 (default 0.2) */
  edgeWear: number;
  /** Random seed for variation (default 42) */
  seed: number;
  /** Base leaf color (overrides season default if provided) */
  baseColor?: THREE.Color;
  /** Double-sided rendering (default true) */
  doubleSided: boolean;
}

// ============================================================================
// Seasonal Color Palettes
// ============================================================================

interface SeasonPalette {
  baseColor: [number, number, number];       // RGB 0-1
  veinColor: [number, number, number];
  edgeColor: [number, number, number];
  tipColor: [number, number, number];
  subsurfaceColor: [number, number, number];
}

const SEASON_PALETTES: Record<LeafSeason, SeasonPalette> = {
  spring: {
    baseColor: [0.25, 0.55, 0.18],
    veinColor: [0.15, 0.38, 0.10],
    edgeColor: [0.35, 0.45, 0.15],
    tipColor: [0.35, 0.60, 0.22],
    subsurfaceColor: [0.35, 0.65, 0.25],
  },
  summer: {
    baseColor: [0.20, 0.50, 0.15],
    veinColor: [0.12, 0.35, 0.08],
    edgeColor: [0.40, 0.30, 0.15],
    tipColor: [0.30, 0.50, 0.15],
    subsurfaceColor: [0.30, 0.60, 0.20],
  },
  autumn: {
    baseColor: [0.60, 0.40, 0.10],
    veinColor: [0.40, 0.25, 0.05],
    edgeColor: [0.50, 0.20, 0.05],
    tipColor: [0.70, 0.35, 0.08],
    subsurfaceColor: [0.65, 0.45, 0.15],
  },
  winter: {
    baseColor: [0.35, 0.35, 0.25],
    veinColor: [0.25, 0.25, 0.18],
    edgeColor: [0.30, 0.25, 0.15],
    tipColor: [0.40, 0.38, 0.25],
    subsurfaceColor: [0.30, 0.30, 0.20],
  },
};

// ============================================================================
// GLSL Shader Code
// ============================================================================

const LEAF_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);

    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vViewDir = normalize(cameraPosition - worldPos.xyz);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Generate fragment shader for a specific leaf type.
 */
function generateLeafFragmentShader(leafType: LeafShaderType): string {
  // Leaf-type specific vein patterns
  const veinFunction = getVeinFunction(leafType);
  const edgeFunction = getEdgeFunction(leafType);
  const colorBlending = getColorBlending(leafType);

  return /* glsl */ `
    precision highp float;

    uniform vec3 uBaseColor;
    uniform vec3 uVeinColor;
    uniform vec3 uEdgeColor;
    uniform vec3 uTipColor;
    uniform vec3 uSubsurfaceColor;
    uniform float uVeinIntensity;
    uniform float uSubsurfaceStrength;
    uniform float uEdgeWear;
    uniform float uSeed;
    uniform vec3 uLightDir;
    uniform float uTime;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec3 vViewDir;

    // Noise functions
    ${NOISE_GLSL}

    ${veinFunction}

    ${edgeFunction}

    ${colorBlending}

    void main() {
      // Compute vein pattern
      float vein = computeVeinPattern(vUv, uSeed);

      // Compute edge distance (0=center, 1=edge)
      float edgeDist = computeEdgeDistance(vUv);

      // Compute base color with tip gradient
      vec3 color = computeLeafColor(vUv, vein, edgeDist);

      // Apply vein darkening
      color = mix(color, uVeinColor, vein * uVeinIntensity);

      // Apply edge wear (brown at edges)
      float edgeFactor = smoothstep(0.6, 1.0, edgeDist);
      color = mix(color, uEdgeColor, edgeFactor * uEdgeWear);

      // Add subtle noise variation
      float noiseVar = snoise3D(vWorldPosition * 8.0 + uSeed) * 0.05;
      color += noiseVar;

      // Basic lighting (Lambertian)
      float NdotL = max(dot(vNormal, normalize(uLightDir)), 0.0);
      float ambient = 0.3;
      float diffuse = NdotL * 0.7;
      float lighting = ambient + diffuse;

      // Subsurface scattering approximation
      // Light transmitted through the leaf when viewed from behind
      vec3 viewNorm = normalize(vViewDir);
      float VdotL = max(dot(-viewNorm, normalize(uLightDir)), 0.0);
      float subsurface = pow(VdotL, 2.0) * uSubsurfaceStrength;

      // Back-lighting: when normal faces away from light, add subsurface color
      float backLight = max(0.0, -dot(vNormal, normalize(uLightDir)));
      vec3 subsurfaceContrib = uSubsurfaceColor * (subsurface + backLight * 0.4) * uSubsurfaceStrength;

      // Final color
      vec3 finalColor = color * lighting + subsurfaceContrib;

      // Gamma correction
      finalColor = pow(finalColor, vec3(1.0 / 2.2));

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;
}

/**
 * Get vein pattern function for each leaf type.
 */
function getVeinFunction(leafType: LeafShaderType): string {
  switch (leafType) {
    case 'broadleaf':
      return /* glsl */ `
        float computeVeinPattern(vec2 uv, float seed) {
          // Main central vein
          float centerDist = abs(uv.x - 0.5) * 2.0;
          float mainVein = 1.0 - smoothstep(0.0, 0.08, centerDist);

          // Secondary veins branching from center
          float secondaryVein = 0.0;
          for (int i = 1; i <= 6; i++) {
            float fi = float(i);
            float veinY = 1.0 - fi / 7.0;
            if (uv.y > veinY) {
              float progress = (uv.y - veinY) / (1.0 - veinY);
              // Left vein
              float leftX = 0.5 - progress * 0.45;
              float distLeft = abs(uv.x - leftX) / (0.03 + progress * 0.04);
              // Right vein
              float rightX = 0.5 + progress * 0.45;
              float distRight = abs(uv.x - rightX) / (0.03 + progress * 0.04);

              secondaryVein += max(0.0, 1.0 - min(distLeft, distRight)) * (1.0 - progress) * 0.6;
            }
          }

          // Tertiary veins using noise for fractal branching
          float noiseVein = abs(snoise3D(vec3(uv * 12.0, seed))) * 0.3;
          noiseVein *= smoothstep(0.0, 0.15, centerDist); // Avoid main vein area

          return clamp(mainVein + secondaryVein + noiseVein, 0.0, 1.0);
        }
      `;

    case 'maple':
      return /* glsl */ `
        float computeVeinPattern(vec2 uv, float seed) {
          // Maple has a star pattern with prominent veins radiating from stem
          float centerDist = abs(uv.x - 0.5) * 2.0;
          float mainVein = 1.0 - smoothstep(0.0, 0.06, centerDist);

          // 5 radiating veins (maple leaf shape)
          float radialVein = 0.0;
          for (int i = 0; i < 5; i++) {
            float fi = float(i);
            float angle = (fi / 5.0) * 3.14159 - 1.5708 + seed * 0.1;
            vec2 dir = vec2(cos(angle), sin(angle));
            vec2 fromCenter = uv - vec2(0.5, 0.1);
            float proj = dot(fromCenter, dir);
            float perpDist = abs(fromCenter.x * dir.y - fromCenter.y * dir.x);
            if (proj > 0.0) {
              float veinWidth = 0.03 + proj * 0.02;
              radialVein += max(0.0, 1.0 - perpDist / veinWidth) * (1.0 - proj * 0.8);
            }
          }

          // Deep vein network using Voronoi-like pattern
          float deepVein = abs(snoise3D(vec3(uv * 15.0, seed))) * 0.4;

          return clamp(mainVein + radialVein * 0.7 + deepVein, 0.0, 1.0);
        }
      `;

    case 'pine':
      return /* glsl */ `
        float computeVeinPattern(vec2 uv, float seed) {
          // Pine needles have minimal veins — just a central stripe
          float centerDist = abs(uv.x - 0.5) * 2.0;
          float centralVein = 1.0 - smoothstep(0.0, 0.12, centerDist);

          // Very subtle longitudinal striations
          float striation = abs(snoise3D(vec3(uv.y * 30.0, uv.x * 3.0, seed))) * 0.15;

          return clamp(centralVein * 0.4 + striation, 0.0, 1.0);
        }
      `;

    case 'palm':
      return /* glsl */ `
        float computeVeinPattern(vec2 uv, float seed) {
          // Palm fronds have fibrous veins radiating from base
          float centerDist = abs(uv.x - 0.5) * 2.0;

          // Multiple parallel veins along the frond
          float fibVein = 0.0;
          for (int i = 0; i < 8; i++) {
            float fi = float(i);
            float veinX = 0.5 + (fi - 3.5) * 0.1;
            float dist = abs(uv.x - veinX);
            fibVein += max(0.0, 1.0 - dist / 0.015) * 0.5;
          }

          // Cross-connections between fibers
          float crossVein = abs(sin(uv.y * 25.0 + seed)) * 0.1;

          return clamp(fibVein + crossVein, 0.0, 1.0);
        }
      `;
  }
}

/**
 * Get edge distance function for each leaf type.
 */
function getEdgeFunction(leafType: LeafShaderType): string {
  switch (leafType) {
    case 'broadleaf':
      return /* glsl */ `
        float computeEdgeDistance(vec2 uv) {
          float dx = abs(uv.x - 0.5) * 2.0;
          float dy = uv.y;
          // Elliptical leaf shape
          float shape = sqrt(dx * dx * 0.6 + dy * dy * 0.3);
          return clamp(shape, 0.0, 1.0);
        }
      `;

    case 'maple':
      return /* glsl */ `
        float computeEdgeDistance(vec2 uv) {
          float dx = abs(uv.x - 0.5) * 2.0;
          float dy = uv.y;
          // Star-shaped with lobed edges
          float lobe = 0.3 + 0.3 * sin(dy * 15.0);
          float dist = max(dx, dy);
          return clamp(dist * (1.0 - lobe * dx), 0.0, 1.0);
        }
      `;

    case 'pine':
      return /* glsl */ `
        float computeEdgeDistance(vec2 uv) {
          float dx = abs(uv.x - 0.5) * 2.0;
          float dy = abs(uv.y - 0.5) * 2.0;
          // Needle shape: thin and pointed
          float needleDist = max(dx, dy);
          return clamp(needleDist, 0.0, 1.0);
        }
      `;

    case 'palm':
      return /* glsl */ `
        float computeEdgeDistance(vec2 uv) {
          float dx = abs(uv.x - 0.5) * 2.0;
          float dy = uv.y;
          // Fan shape: wide at top, narrow at base
          float fanDist = dx * (0.5 + dy * 0.5);
          return clamp(max(fanDist, dy), 0.0, 1.0);
        }
      `;
  }
}

/**
 * Get color blending function for each leaf type.
 */
function getColorBlending(_leafType: LeafShaderType): string {
  return /* glsl */ `
    vec3 computeLeafColor(vec2 uv, float vein, float edgeDist) {
      // Gradient from base (bottom) to tip (top)
      vec3 baseToTip = mix(uBaseColor, uTipColor, uv.y);
      return baseToTip;
    }
  `;
}

// ============================================================================
// Noise GLSL Library
// ============================================================================

const NOISE_GLSL = /* glsl */ `
  // Simplex 3D noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise3D(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
`;

// ============================================================================
// GLSL Leaf Material Generator
// ============================================================================

/**
 * Creates GLSL-based leaf materials with vein patterns, translucency,
 * and seasonal color variation.
 *
 * Usage:
 *   const material = createGLSLLeafMaterial({ leafType: 'maple', season: 'autumn' });
 *   const mesh = new THREE.Mesh(geometry, material);
 */
export function createGLSLLeafMaterial(
  params: Partial<GLSLLeafMaterialParams> = {}
): THREE.ShaderMaterial {
  const p: GLSLLeafMaterialParams = {
    leafType: 'broadleaf',
    season: 'summer',
    veinIntensity: 0.6,
    subsurfaceStrength: 0.5,
    edgeWear: 0.2,
    seed: 42,
    doubleSided: true,
    ...params,
  };

  const palette = SEASON_PALETTES[p.season];
  const baseColor = p.baseColor
    ? [p.baseColor.r, p.baseColor.g, p.baseColor.b]
    : palette.baseColor;

  const material = new THREE.ShaderMaterial({
    vertexShader: LEAF_VERTEX_SHADER,
    fragmentShader: generateLeafFragmentShader(p.leafType),
    uniforms: {
      uBaseColor: { value: new THREE.Vector3(...baseColor) },
      uVeinColor: { value: new THREE.Vector3(...palette.veinColor) },
      uEdgeColor: { value: new THREE.Vector3(...palette.edgeColor) },
      uTipColor: { value: new THREE.Vector3(...palette.tipColor) },
      uSubsurfaceColor: { value: new THREE.Vector3(...palette.subsurfaceColor) },
      uVeinIntensity: { value: p.veinIntensity },
      uSubsurfaceStrength: { value: p.subsurfaceStrength },
      uEdgeWear: { value: p.edgeWear },
      uSeed: { value: p.seed },
      uLightDir: { value: new THREE.Vector3(0.5, 1.0, 0.3).normalize() },
      uTime: { value: 0.0 },
    },
    side: p.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    transparent: false,
  });

  material.userData = {
    isGLSLLeafMaterial: true,
    leafType: p.leafType,
    season: p.season,
    subsurfaceStrength: p.subsurfaceStrength,
  };

  return material;
}

/**
 * Create a leaf mesh with GLSL material applied.
 *
 * @param leafType The type of leaf shader to use
 * @param geometry The leaf geometry (from LeafGenerator or LeafGeometry)
 * @param params Material parameters
 * @returns A THREE.Mesh with the GLSL leaf material
 */
export function createLeafMesh(
  leafType: LeafShaderType,
  geometry: THREE.BufferGeometry,
  params: Partial<GLSLLeafMaterialParams> = {}
): THREE.Mesh {
  const material = createGLSLLeafMaterial({ ...params, leafType });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.isLeaf = true;
  mesh.userData.leafType = leafType;
  return mesh;
}

/**
 * Update the seasonal colors of an existing GLSL leaf material.
 * Useful for real-time season transitions.
 */
export function updateLeafSeason(
  material: THREE.ShaderMaterial,
  season: LeafSeason
): void {
  const palette = SEASON_PALETTES[season];
  material.uniforms.uBaseColor.value.set(...palette.baseColor);
  material.uniforms.uVeinColor.value.set(...palette.veinColor);
  material.uniforms.uEdgeColor.value.set(...palette.edgeColor);
  material.uniforms.uTipColor.value.set(...palette.tipColor);
  material.uniforms.uSubsurfaceColor.value.set(...palette.subsurfaceColor);
  material.uniforms.uTime.value = 0;
  material.userData.season = season;
  material.needsUpdate = true;
}
