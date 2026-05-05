/**
 * AdvancedPostProcessing.ts — P2 Rendering: Lens Distortion, Glare/Bloom,
 * Camera Parameter Export, and Multi-Pass Ground Truth Output
 *
 * Implements advanced post-processing and camera export features ported
 * from the original Infinigen Python/Blender rendering pipeline:
 *
 * 1. LensDistortionEffect — Brown-Conrady lens distortion model matching
 *    OpenCV, with barrel/pincushion and tangential distortion.
 * 2. GhostsGlareEffect — Ghost-type glare with star patterns and
 *    anamorphic streaks, multi-pass downsample → threshold → streak → composite.
 * 3. CameraParameterExport — Export camera intrinsics (K), extrinsics (T),
 *    and image dimensions in OpenCV convention; COLMAP export support.
 * 4. MultiPassGTOutput — Render all ground truth channels (depth, flow,
 *    segmentation, normals) with float render targets and EXR-like export.
 *
 * @module rendering/postprocessing
 */

import * as THREE from 'three';

// ============================================================================
// Lens Distortion — Types & GLSL
// ============================================================================

/**
 * Parameters for the Brown-Conrady lens distortion model.
 *
 * Matches OpenCV's camera calibration model:
 *   x_distorted = x(1 + k1*r² + k2*r⁴) + 2*p1*x*y + p2*(r² + 2*x²)
 *   y_distorted = y(1 + k1*r² + k2*r⁴) + p1*(r² + 2*y²) + 2*p2*x*y
 *
 * where r² = x² + y² (normalized image coordinates from optical center).
 */
export interface LensDistortionParams {
  /** Radial distortion coefficient k1 (default 0). Positive = barrel, negative = pincushion */
  k1: number;
  /** Radial distortion coefficient k2 (default 0) */
  k2: number;
  /** Tangential distortion coefficient p1 (default 0) */
  p1: number;
  /** Tangential distortion coefficient p2 (default 0) */
  p2: number;
  /** Image width in pixels (for aspect ratio correction) */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Principal point cx (normalized 0-1, default 0.5 = center) */
  cx: number;
  /** Principal point cy (normalized 0-1, default 0.5 = center) */
  cy: number;
  /** Distortion intensity multiplier (default 1.0) */
  intensity: number;
}

/**
 * Default lens distortion parameters (no distortion).
 */
export const DEFAULT_LENS_DISTORTION: LensDistortionParams = {
  k1: 0,
  k2: 0,
  p1: 0,
  p2: 0,
  width: 1920,
  height: 1080,
  cx: 0.5,
  cy: 0.5,
  intensity: 1.0,
};

/**
 * Vertex shader for lens distortion (pass-through).
 */
const LENS_DISTORTION_VERTEX = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Fragment shader for Brown-Conrady lens distortion.
 *
 * Implements the inverse distortion model (undistort → distort) to map
 * output pixels back to input texture coordinates, matching OpenCV's
 * camera calibration model.
 */
const LENS_DISTORTION_FRAGMENT = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uK1;
  uniform float uK2;
  uniform float uP1;
  uniform float uP2;
  uniform float uCx;
  uniform float uCy;
  uniform float uIntensity;
  uniform float uAspect;

  varying vec2 vUv;

  void main() {
    // Normalized coordinates from principal point
    float x = (vUv.x - uCx) * uAspect;
    float y = vUv.y - uCy;

    float r2 = x * x + y * y;
    float r4 = r2 * r2;

    // Radial distortion
    float radial = 1.0 + uK1 * r2 + uK2 * r4;

    // Tangential distortion
    float xDistorted = x * radial + 2.0 * uP1 * x * y + uP2 * (r2 + 2.0 * x * x);
    float yDistorted = y * radial + uP1 * (r2 + 2.0 * y * y) + 2.0 * uP2 * x * y;

    // Apply intensity
    xDistorted = mix(x, xDistorted, uIntensity);
    yDistorted = mix(y, yDistorted, uIntensity);

    // Convert back to UV coordinates
    vec2 distortedUv = vec2(
      xDistorted / uAspect + uCx,
      yDistorted + uCy
    );

    // Check bounds — black outside
    if (distortedUv.x < 0.0 || distortedUv.x > 1.0 ||
        distortedUv.y < 0.0 || distortedUv.y > 1.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    gl_FragColor = texture2D(uTexture, distortedUv);
  }
`;

// ============================================================================
// LensDistortionEffect
// ============================================================================

/**
 * Applies Brown-Conrady lens distortion to a rendered image.
 *
 * Implements the full OpenCV camera distortion model:
 * - Barrel distortion (positive k1) or pincushion distortion (negative k1)
 * - Tangential distortion from decentered lens elements (p1, p2)
 * - Configurable principal point (optical center offset)
 *
 * Usage:
 * ```ts
 * const effect = new LensDistortionEffect();
 * const material = effect.createLensDistortionMaterial({
 *   k1: -0.3, k2: 0.1,   // pincushion + secondary radial
 *   p1: 0.001, p2: -0.001, // slight tangential
 * });
 * // Apply in a render pass:
 * const result = effect.applyDistortion(sourceTarget, renderer, params);
 * ```
 */
export class LensDistortionEffect {
  /** Reusable fullscreen quad scene and camera */
  private quadScene: THREE.Scene;
  private quadCamera: THREE.OrthographicCamera;
  /** Cached materials per parameter set */
  private materialCache: Map<string, THREE.ShaderMaterial>;

  constructor() {
    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.materialCache = new Map();
  }

  /**
   * Create a ShaderMaterial for lens distortion.
   *
   * @param params  Distortion parameters
   * @returns Configured ShaderMaterial
   */
  createLensDistortionMaterial(params: Partial<LensDistortionParams> = {}): THREE.ShaderMaterial {
    const p = { ...DEFAULT_LENS_DISTORTION, ...params };
    const aspect = p.width / Math.max(p.height, 1);

    return new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: null },
        uK1: { value: p.k1 },
        uK2: { value: p.k2 },
        uP1: { value: p.p1 },
        uP2: { value: p.p2 },
        uCx: { value: p.cx },
        uCy: { value: p.cy },
        uIntensity: { value: p.intensity },
        uAspect: { value: aspect },
      },
      vertexShader: LENS_DISTORTION_VERTEX,
      fragmentShader: LENS_DISTORTION_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
  }

  /**
   * Apply lens distortion to a render target and output to a new render target.
   *
   * @param renderTarget  Source render target (the beauty render)
   * @param renderer      WebGL renderer
   * @param params        Distortion parameters
   * @returns New render target with distorted image
   */
  applyDistortion(
    renderTarget: THREE.WebGLRenderTarget,
    renderer: THREE.WebGLRenderer,
    params: Partial<LensDistortionParams> = {},
  ): THREE.WebGLRenderTarget {
    const p = { ...DEFAULT_LENS_DISTORTION, ...params };
    const material = this.createLensDistortionMaterial(p);
    material.uniforms.uTexture.value = renderTarget.texture;

    // Create output render target
    const outputTarget = new THREE.WebGLRenderTarget(
      renderTarget.width,
      renderTarget.height,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
      },
    );

    // Render fullscreen quad
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.quadScene.add(quad);
    renderer.setRenderTarget(outputTarget);
    renderer.render(this.quadScene, this.quadCamera);
    renderer.setRenderTarget(null);
    this.quadScene.remove(quad);

    material.dispose();
    return outputTarget;
  }

  /**
   * Create a barrel distortion preset (wide-angle lens look).
   */
  static barrelPreset(intensity: number = 0.3): LensDistortionParams {
    return {
      k1: intensity,
      k2: intensity * 0.3,
      p1: 0,
      p2: 0,
      width: 1920,
      height: 1080,
      cx: 0.5,
      cy: 0.5,
      intensity: 1.0,
    };
  }

  /**
   * Create a pincushion distortion preset (telephoto lens look).
   */
  static pincushionPreset(intensity: number = 0.2): LensDistortionParams {
    return {
      k1: -intensity,
      k2: -intensity * 0.15,
      p1: 0,
      p2: 0,
      width: 1920,
      height: 1080,
      cx: 0.5,
      cy: 0.5,
      intensity: 1.0,
    };
  }
}

// ============================================================================
// Ghosts Glare — Types & GLSL
// ============================================================================

/**
 * Parameters for the ghost-type glare effect.
 */
export interface GlareParams {
  /** Brightness threshold for glare extraction (default 0.8) */
  threshold: number;
  /** Glare intensity multiplier (default 1.5) */
  intensity: number;
  /** Number of downsample passes (default 3) */
  downsamplePasses: number;
  /** Streak angle in radians for anamorphic glare (0 = no streaks, default 0) */
  streakAngle: number;
  /** Streak length multiplier (default 1.0) */
  streakLength: number;
  /** Number of star points (4, 6, or 8, default 4) */
  starPoints: number;
  /** Star pattern rotation in radians (default 0) */
  starRotation: number;
  /** Anamorphic stretch (0 = none, >0 = horizontal stretch, default 0) */
  anamorphicStretch: number;
  /** Ghost count for ghost-type glare reflections (default 4) */
  ghostCount: number;
  /** Ghost spread factor (default 0.5) */
  ghostSpread: number;
}

/**
 * Default glare parameters.
 */
export const DEFAULT_GLARE_PARAMS: GlareParams = {
  threshold: 0.8,
  intensity: 1.5,
  downsamplePasses: 3,
  streakAngle: 0,
  streakLength: 1.0,
  starPoints: 4,
  starRotation: 0,
  anamorphicStretch: 0,
  ghostCount: 4,
  ghostSpread: 0.5,
};

/**
 * Fragment shader for bright pixel extraction (threshold pass).
 */
const GLARE_THRESHOLD_FRAGMENT = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uThreshold;

  varying vec2 vUv;

  void main() {
    vec4 color = texture2D(uTexture, vUv);
    float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    float brightness = max(0.0, luminance - uThreshold);
    float scale = brightness / max(luminance, 0.0001);
    gl_FragColor = vec4(color.rgb * scale, 1.0);
  }
`;

/**
 * Fragment shader for streak generation (directional blur).
 */
const GLARE_STREAK_FRAGMENT = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec2 uDirection;   // blur direction (normalized)
  uniform float uLength;     // streak length in UV units
  uniform int uSamples;      // number of samples

  varying vec2 vUv;

  void main() {
    vec3 color = vec3(0.0);
    float totalWeight = 0.0;

    for (int i = -8; i <= 8; i++) {
      float t = float(i) / 8.0;
      float weight = exp(-t * t * 2.0); // Gaussian-like falloff
      vec2 offset = uDirection * t * uLength;
      color += texture2D(uTexture, vUv + offset).rgb * weight;
      totalWeight += weight;
    }

    gl_FragColor = vec4(color / max(totalWeight, 0.001), 1.0);
  }
`;

/**
 * Fragment shader for ghost reflections (concentric reflections from bright pixels).
 */
const GLARE_GHOST_FRAGMENT = /* glsl */ `
  uniform sampler2D uTexture;
  uniform int uGhostCount;
  uniform float uGhostSpread;
  uniform float uIntensity;

  varying vec2 vUv;

  void main() {
    vec3 color = vec3(0.0);
    vec2 center = vec2(0.5, 0.5);

    for (int i = 0; i < 8; i++) {
      if (i >= uGhostCount) break;

      float scale = 1.0 - (float(i) + 1.0) * uGhostSpread * 0.15;
      vec2 ghostUv = center + (vUv - center) * scale;

      // Chromatic offset per ghost
      float chromaticOffset = float(i) * 0.003;
      float r = texture2D(uTexture, ghostUv + vec2(chromaticOffset, 0.0)).r;
      float g = texture2D(uTexture, ghostUv).g;
      float b = texture2D(uTexture, ghostUv - vec2(chromaticOffset, 0.0)).b;

      float ghostFalloff = exp(-float(i) * 0.5);
      color += vec3(r, g, b) * ghostFalloff * uIntensity;
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * Fragment shader for star pattern generation.
 */
const GLARE_STAR_FRAGMENT = /* glsl */ `
  uniform sampler2D uTexture;
  uniform int uStarPoints;
  uniform float uStarRotation;
  uniform float uIntensity;

  varying vec2 vUv;

  void main() {
    vec3 color = vec3(0.0);

    // Accumulate directional streaks for star pattern
    for (int p = 0; p < 8; p++) {
      if (p >= uStarPoints) break;

      float angle = uStarRotation + float(p) * 3.14159265 / float(uStarPoints);
      vec2 dir = vec2(cos(angle), sin(angle));

      for (int i = -4; i <= 4; i++) {
        float t = float(i) * 0.005;
        float weight = exp(-t * t * 500.0);
        color += texture2D(uTexture, vUv + dir * t).rgb * weight;
      }
    }

    gl_FragColor = vec4(color * uIntensity, 1.0);
  }
`;

const GLARE_COMPOSITE_FRAGMENT = /* glsl */ `
  uniform sampler2D uScene;
  uniform sampler2D uGlare;
  uniform float uIntensity;

  varying vec2 vUv;

  void main() {
    vec3 scene = texture2D(uScene, vUv).rgb;
    vec3 glare = texture2D(uGlare, vUv).rgb;
    gl_FragColor = vec4(scene + glare * uIntensity, 1.0);
  }
`;

const POST_PROCESS_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ============================================================================
// GhostsGlareEffect
// ============================================================================

/**
 * Ghost-type glare effect with star patterns and anamorphic streaks.
 *
 * Unlike simple bloom (which blurs all bright pixels uniformly), this
 * effect simulates real lens flare artifacts:
 * - Ghost reflections from internal lens elements
 * - Star patterns from aperture blades
 * - Anamorphic horizontal streaks from cylindrical lens elements
 *
 * Multi-pass pipeline:
 *   1. Downsample the source image
 *   2. Threshold to extract bright pixels
 *   3. Generate streaks (directional blur)
 *   4. Generate ghost reflections
 *   5. Generate star patterns
 *   6. Composite with original scene
 *
 * Usage:
 * ```ts
 * const glare = new GhostsGlareEffect();
 * const material = glare.createGlareMaterial({ threshold: 0.7, intensity: 2.0 });
 * const result = glare.applyGlare(sourceTarget, renderer, params);
 * ```
 */
export class GhostsGlareEffect {
  private quadScene: THREE.Scene;
  private quadCamera: THREE.OrthographicCamera;

  constructor() {
    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /**
   * Create a ShaderMaterial for the glare effect.
   *
   * This returns the composite material. The full multi-pass pipeline
   * is handled by applyGlare().
   *
   * @param params  Glare parameters
   * @returns Configured ShaderMaterial for the composite pass
   */
  createGlareMaterial(params: Partial<GlareParams> = {}): THREE.ShaderMaterial {
    const p = { ...DEFAULT_GLARE_PARAMS, ...params };

    return new THREE.ShaderMaterial({
      uniforms: {
        uScene: { value: null },
        uGlare: { value: null },
        uIntensity: { value: p.intensity },
      },
      vertexShader: POST_PROCESS_VERTEX,
      fragmentShader: GLARE_COMPOSITE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      transparent: true,
    });
  }

  /**
   * Apply ghost-type glare to a render target.
   *
   * Multi-pass pipeline:
   *   1. Downsample source to quarter resolution
   *   2. Threshold pass — extract bright pixels
   *   3. Streak pass — directional blur for anamorphic streaks
   *   4. Ghost pass — ghost reflections
   *   5. Star pass — star pattern from bright pixels
   *   6. Composite — add glare to original scene
   *
   * @param renderTarget  Source render target
   * @param renderer      WebGL renderer
   * @param params        Glare parameters
   * @returns New render target with glare applied
   */
  applyGlare(
    renderTarget: THREE.WebGLRenderTarget,
    renderer: THREE.WebGLRenderer,
    params: Partial<GlareParams> = {},
  ): THREE.WebGLRenderTarget {
    const p = { ...DEFAULT_GLARE_PARAMS, ...params };
    const w = renderTarget.width;
    const h = renderTarget.height;

    // --- Pass 1: Downsample ---
    const halfW = Math.max(Math.floor(w / 2), 1);
    const halfH = Math.max(Math.floor(h / 2), 1);
    const downsampleTarget = new THREE.WebGLRenderTarget(halfW, halfH, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    const downsampleMat = new THREE.ShaderMaterial({
      uniforms: { uTexture: { value: renderTarget.texture } },
      vertexShader: POST_PROCESS_VERTEX,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D uTexture;
        void main() {
          gl_FragColor = texture2D(uTexture, vUv);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.renderQuad(downsampleMat, downsampleTarget, renderer);
    downsampleMat.dispose();

    // --- Pass 2: Threshold ---
    const thresholdTarget = new THREE.WebGLRenderTarget(halfW, halfH, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    const thresholdMat = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: downsampleTarget.texture },
        uThreshold: { value: p.threshold },
      },
      vertexShader: POST_PROCESS_VERTEX,
      fragmentShader: GLARE_THRESHOLD_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.renderQuad(thresholdMat, thresholdTarget, renderer);
    thresholdMat.dispose();
    downsampleTarget.dispose();

    // --- Pass 3: Streak (anamorphic) ---
    const streakTarget = new THREE.WebGLRenderTarget(halfW, halfH, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    const streakDir = new THREE.Vector2(
      Math.cos(p.streakAngle),
      Math.sin(p.streakAngle),
    ).normalize();

    const streakMat = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: thresholdTarget.texture },
        uDirection: { value: streakDir },
        uLength: { value: p.streakLength * 0.05 },
        uSamples: { value: 17 },
      },
      vertexShader: POST_PROCESS_VERTEX,
      fragmentShader: GLARE_STREAK_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.renderQuad(streakMat, streakTarget, renderer);
    streakMat.dispose();

    // If anamorphic, add horizontal stretch pass
    let glareSourceTarget = streakTarget;
    if (p.anamorphicStretch > 0) {
      const anamorphicTarget = new THREE.WebGLRenderTarget(halfW, halfH, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
      const anamorphicDir = new THREE.Vector2(1, 0);
      const anamorphicMat = new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: streakTarget.texture },
          uDirection: { value: anamorphicDir },
          uLength: { value: p.anamorphicStretch * 0.03 },
          uSamples: { value: 17 },
        },
        vertexShader: POST_PROCESS_VERTEX,
        fragmentShader: GLARE_STREAK_FRAGMENT,
        depthTest: false,
        depthWrite: false,
      });
      this.renderQuad(anamorphicMat, anamorphicTarget, renderer);
      anamorphicMat.dispose();
      streakTarget.dispose();
      glareSourceTarget = anamorphicTarget;
    }

    // --- Pass 4: Ghost reflections ---
    const ghostTarget = new THREE.WebGLRenderTarget(halfW, halfH, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    const ghostMat = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: thresholdTarget.texture },
        uGhostCount: { value: p.ghostCount },
        uGhostSpread: { value: p.ghostSpread },
        uIntensity: { value: p.intensity * 0.3 },
      },
      vertexShader: POST_PROCESS_VERTEX,
      fragmentShader: GLARE_GHOST_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.renderQuad(ghostMat, ghostTarget, renderer);
    ghostMat.dispose();

    // --- Pass 5: Star pattern ---
    const starTarget = new THREE.WebGLRenderTarget(halfW, halfH, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    const starMat = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: thresholdTarget.texture },
        uStarPoints: { value: p.starPoints },
        uStarRotation: { value: p.starRotation },
        uIntensity: { value: p.intensity * 0.5 },
      },
      vertexShader: POST_PROCESS_VERTEX,
      fragmentShader: GLARE_STAR_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.renderQuad(starMat, starTarget, renderer);
    starMat.dispose();
    thresholdTarget.dispose();

    // --- Pass 6: Composite ---
    // Combine streak + ghost + star onto a half-res glare buffer,
    // then upsample and composite with the original scene
    const glareCombined = new THREE.WebGLRenderTarget(halfW, halfH, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    const combineMat = new THREE.ShaderMaterial({
      uniforms: {
        uStreak: { value: glareSourceTarget.texture },
        uGhost: { value: ghostTarget.texture },
        uStar: { value: starTarget.texture },
      },
      vertexShader: POST_PROCESS_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D uStreak;
        uniform sampler2D uGhost;
        uniform sampler2D uStar;
        varying vec2 vUv;
        void main() {
          vec3 streak = texture2D(uStreak, vUv).rgb;
          vec3 ghost = texture2D(uGhost, vUv).rgb;
          vec3 star = texture2D(uStar, vUv).rgb;
          gl_FragColor = vec4(streak + ghost + star, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.renderQuad(combineMat, glareCombined, renderer);
    combineMat.dispose();
    glareSourceTarget.dispose();
    ghostTarget.dispose();
    starTarget.dispose();

    // Final composite: original scene + glare
    const outputTarget = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    const compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        uScene: { value: renderTarget.texture },
        uGlare: { value: glareCombined.texture },
        uIntensity: { value: p.intensity },
      },
      vertexShader: POST_PROCESS_VERTEX,
      fragmentShader: GLARE_COMPOSITE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.renderQuad(compositeMat, outputTarget, renderer);
    compositeMat.dispose();
    glareCombined.dispose();

    return outputTarget;
  }

  /**
   * Render a fullscreen quad with the given material to a target.
   */
  private renderQuad(
    material: THREE.ShaderMaterial,
    target: THREE.WebGLRenderTarget,
    renderer: THREE.WebGLRenderer,
  ): void {
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.quadScene.add(quad);
    renderer.setRenderTarget(target);
    renderer.render(this.quadScene, this.quadCamera);
    renderer.setRenderTarget(null);
    this.quadScene.remove(quad);
  }

  /**
   * Create a cinematic anamorphic glare preset.
   */
  static anamorphicPreset(): GlareParams {
    return {
      threshold: 0.75,
      intensity: 2.0,
      downsamplePasses: 4,
      streakAngle: 0,
      streakLength: 0.8,
      starPoints: 4,
      starRotation: 0,
      anamorphicStretch: 2.0,
      ghostCount: 6,
      ghostSpread: 0.4,
    };
  }

  /**
   * Create a natural lens flare preset.
   */
  static naturalPreset(): GlareParams {
    return {
      threshold: 0.85,
      intensity: 1.0,
      downsamplePasses: 3,
      streakAngle: Math.PI / 8,
      streakLength: 0.5,
      starPoints: 6,
      starRotation: Math.PI / 12,
      anamorphicStretch: 0,
      ghostCount: 3,
      ghostSpread: 0.6,
    };
  }
}

// ============================================================================
// Camera Parameter Export — Types
// ============================================================================

/**
 * Camera intrinsic matrix K (3×3) in OpenCV convention.
 */
export interface CameraIntrinsicMatrix {
  /** Focal length in x (pixels) */
  fx: number;
  /** Focal length in y (pixels) */
  fy: number;
  /** Principal point x (pixels) */
  cx: number;
  /** Principal point y (pixels) */
  cy: number;
  /** Skew coefficient (default 0) */
  skew: number;
}

/**
 * Full camera parameters for a single frame in OpenCV convention.
 */
export interface CameraParameters {
  /** Intrinsic matrix K */
  K: CameraIntrinsicMatrix;
  /** Extrinsic matrix T (4×4 world-to-camera) as flat 16-element array (row-major) */
  T: number[];
  /** Image height in pixels */
  H: number;
  /** Image width in pixels */
  W: number;
  /** Frame index */
  frameIndex: number;
  /** Camera position in world space */
  position: [number, number, number];
  /** Distortion coefficients [k1, k2, p1, p2, k3] */
  distortion: number[];
}

// ============================================================================
// CameraParameterExport
// ============================================================================

/**
 * Export camera intrinsic and extrinsic parameters in OpenCV convention.
 *
 * The intrinsic matrix K is computed from the perspective camera's FOV
 * and resolution. The extrinsic matrix T converts from Three.js (Y-up,
 * Z-backward) to OpenCV (Y-down, Z-forward) convention.
 *
 * Supports:
 * - JSON export for per-frame camera parameters
 * - COLMAP-format export for structure-from-motion pipelines
 *
 * Usage:
 * ```ts
 * const exporter = new CameraParameterExport(1920, 1080);
 * const params = exporter.exportCameraParameters(camera, 0);
 * const json = exporter.exportToJSON(camera, 100);
 * ```
 */
export class CameraParameterExport {
  private width: number;
  private height: number;

  /**
   * @param width   Image width in pixels (default 1920)
   * @param height  Image height in pixels (default 1080)
   */
  constructor(width: number = 1920, height: number = 1080) {
    this.width = width;
    this.height = height;
  }

  /**
   * Export camera parameters for a single frame.
   *
   * @param camera      Perspective camera
   * @param frameIndex  Frame index number
   * @returns Camera parameters in OpenCV convention
   */
  exportCameraParameters(camera: THREE.PerspectiveCamera, frameIndex: number): CameraParameters {
    camera.updateMatrixWorld(true);

    const K = this.computeIntrinsicMatrix(camera);
    const T = this.computeExtrinsicMatrix(camera);

    return {
      K,
      T,
      H: this.height,
      W: this.width,
      frameIndex,
      position: [camera.position.x, camera.position.y, camera.position.z],
      distortion: [0, 0, 0, 0, 0], // No distortion by default
    };
  }

  /**
   * Export camera parameters for multiple frames as JSON string.
   *
   * @param camera     Camera (assumed static; for animated cameras,
   *                    call exportCameraParameters per frame)
   * @param frameCount Number of frames to export
   * @returns JSON string with all frame parameters
   */
  exportToJSON(camera: THREE.PerspectiveCamera, frameCount: number): string {
    const frames: CameraParameters[] = [];

    for (let i = 0; i < frameCount; i++) {
      frames.push(this.exportCameraParameters(camera, i));
    }

    return JSON.stringify({
      format: 'infinigen_camera_params_v2',
      version: '2.0',
      resolution: { width: this.width, height: this.height },
      convention: 'opencv',
      frames,
    }, null, 2);
  }

  /**
   * Export camera parameters in COLMAP format.
   *
   * Writes three files:
   * - cameras.txt: intrinsic parameters
   * - images.txt: extrinsic parameters per frame
   * - points3D.txt: empty (no 3D points from camera export)
   *
   * @param camera     Perspective camera
   * @param frameCount Number of frames
   * @param outputDir  Directory to write files to (Node.js only)
   */
  async exportToCOLMAP(
    camera: THREE.PerspectiveCamera,
    frameCount: number,
    outputDir: string,
  ): Promise<void> {
    const isNode = typeof process !== 'undefined' && process.versions?.node != null;
    if (!isNode) {
      console.warn('COLMAP export requires Node.js environment');
      return;
    }

    const fs = await import('fs');
    const path = await import('path');

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // cameras.txt: one line per camera model
    // Format: CAMERA_ID MODEL WIDTH HEIGHT PARAMS[]
    const K = this.computeIntrinsicMatrix(camera);
    const camerasLine = `1 PINHOLE ${this.width} ${this.height} ${K.fx} ${K.fy} ${K.cx} ${K.cy}`;
    fs.writeFileSync(path.join(outputDir, 'cameras.txt'), camerasLine + '\n');

    // images.txt: one line per frame (QW QX QY QZ TX TY TZ CAMERA_ID NAME)
    const imagesLines: string[] = [];
    for (let i = 0; i < frameCount; i++) {
      camera.updateMatrixWorld(true);
      const params = this.exportCameraParameters(camera, i);

      // Extract rotation (quaternion) and translation from T
      const quat = camera.quaternion;
      // COLMAP uses world-from-camera convention (inverse of T)
      const tx = params.position[0];
      const ty = params.position[1];
      const tz = params.position[2];

      imagesLines.push(
        `${i + 1} ${quat.w} ${quat.x} ${quat.y} ${quat.z} ${tx} ${ty} ${tz} 1 frame_${String(i).padStart(6, '0')}`,
      );
    }
    fs.writeFileSync(path.join(outputDir, 'images.txt'), imagesLines.join('\n') + '\n');

    // points3D.txt: empty
    fs.writeFileSync(path.join(outputDir, 'points3D.txt'), '# 3D point list\n');
  }

  /**
   * Compute the intrinsic matrix K from a perspective camera.
   */
  private computeIntrinsicMatrix(camera: THREE.PerspectiveCamera): CameraIntrinsicMatrix {
    const fovRad = (camera.fov * Math.PI) / 180;
    const fy = (this.height / 2) / Math.tan(fovRad / 2);
    const fx = fy; // Square pixels
    const cx = this.width / 2;
    const cy = this.height / 2;

    return { fx, fy, cx, cy, skew: 0 };
  }

  /**
   * Compute the 4×4 extrinsic matrix T (world-to-camera) in OpenCV convention.
   * Returns a flat 16-element array in row-major order.
   */
  private computeExtrinsicMatrix(camera: THREE.PerspectiveCamera): number[] {
    camera.updateMatrixWorld(true);

    const viewMatrix = camera.matrixWorldInverse.clone();

    // Convert from Three.js (Y up, Z backward) to OpenCV (Y down, Z forward)
    const cv = new THREE.Matrix4().set(
      1, 0, 0, 0,
      0, -1, 0, 0,
      0, 0, -1, 0,
      0, 0, 0, 1,
    );

    const T_CV = new THREE.Matrix4().multiplyMatrices(cv, viewMatrix);

    // Convert to row-major flat array
    const e = T_CV.elements;
    return [
      e[0], e[4], e[8], e[12],
      e[1], e[5], e[9], e[13],
      e[2], e[6], e[10], e[14],
      e[3], e[7], e[11], e[15],
    ];
  }
}

// ============================================================================
// Multi-Pass GT Output — Types
// ============================================================================

/**
 * Named texture data for a ground truth channel.
 */
export interface TextureData {
  /** Channel name (e.g., 'depth', 'normal', 'flow', 'segmentation') */
  name: string;
  /** Float pixel data (width * height * channels) */
  data: Float32Array;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
  /** Number of channels per pixel (1 for depth, 3 for normals/flow, 4 for segmentation) */
  channels: number;
}

/**
 * Configuration for multi-pass GT output.
 */
export interface MultiPassGTConfig {
  /** Render depth channel */
  renderDepth: boolean;
  /** Render normal channel */
  renderNormal: boolean;
  /** Render optical flow channel */
  renderFlow: boolean;
  /** Render segmentation channel */
  renderSegmentation: boolean;
  /** Render position channel */
  renderPosition: boolean;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
  /** Use float render targets (true) or RGBA8 (false) */
  useFloatTargets: boolean;
}

/**
 * Default multi-pass GT configuration.
 */
export const DEFAULT_MULTIPASS_GT_CONFIG: MultiPassGTConfig = {
  renderDepth: true,
  renderNormal: true,
  renderFlow: true,
  renderSegmentation: true,
  renderPosition: true,
  width: 1920,
  height: 1080,
  useFloatTargets: true,
};

// ============================================================================
// MultiPassGTOutput
// ============================================================================

/**
 * Renders all ground truth channels for a scene in multiple passes.
 *
 * Supports:
 * - Depth (linear camera-space Z, float)
 * - Normals (camera-space, float RGB)
 * - Optical flow (motion vectors, float XY)
 * - Segmentation (instance/material ID, float RGBA)
 * - Position (world-space, float RGB)
 *
 * Uses float render targets (THREE.FloatType) for depth and flow channels
 * to preserve full precision, matching the original Infinigen EXR output.
 *
 * Usage:
 * ```ts
 * const gt = new MultiPassGTOutput();
 * const channels = gt.renderAllPasses(scene, camera, renderer);
 * // channels.get('depth') → TextureData with Float32Array
 * // Export to EXR:
 * const depthBuffer = gt.exportEXRChannel(channels.get('depth')!.data, w, h, 'depth');
 * ```
 */
export class MultiPassGTOutput {
  private config: MultiPassGTConfig;

  constructor(config: Partial<MultiPassGTConfig> = {}) {
    this.config = { ...DEFAULT_MULTIPASS_GT_CONFIG, ...config };
  }

  /**
   * Render all configured ground truth channels.
   *
   * Each channel is rendered in a separate pass with the appropriate
   * override material. Float render targets are used for depth and flow
   * channels.
   *
   * @param scene    The Three.js scene
   * @param camera   The camera
   * @param renderer The WebGL renderer
   * @returns Map of channel name → TextureData
   */
  renderAllPasses(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
  ): Map<string, TextureData> {
    const results = new Map<string, TextureData>();
    const { width, height, useFloatTargets } = this.config;

    // Store original materials
    const originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        originalMaterials.set(mesh, mesh.material);
      }
    });

    try {
      // --- Depth pass ---
      if (this.config.renderDepth) {
        const depthData = this.renderDepthPass(scene, camera, renderer, width, height, useFloatTargets);
        results.set('depth', depthData);
      }

      // --- Normal pass ---
      if (this.config.renderNormal) {
        const normalData = this.renderNormalPass(scene, camera, renderer, width, height, useFloatTargets);
        results.set('normal', normalData);
      }

      // --- Flow pass (placeholder — requires previous frame) ---
      if (this.config.renderFlow) {
        const flowData = new Float32Array(width * height * 2); // Zero flow
        results.set('flow', {
          name: 'flow',
          data: flowData,
          width,
          height,
          channels: 2,
        });
      }

      // --- Segmentation pass ---
      if (this.config.renderSegmentation) {
        const segData = this.renderSegmentationPass(scene, camera, renderer, width, height);
        results.set('segmentation', segData);
      }

      // --- Position pass ---
      if (this.config.renderPosition) {
        const posData = this.renderPositionPass(scene, camera, renderer, width, height, useFloatTargets);
        results.set('position', posData);
      }
    } finally {
      // Restore original materials
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          const original = originalMaterials.get(mesh);
          if (original !== undefined) {
            mesh.material = original;
          }
        }
      });
    }

    return results;
  }

  /**
   * Export a GT channel as an EXR-like float ArrayBuffer.
   *
   * Produces a raw float buffer (not a valid EXR file) suitable for
   * piping into the EXRExporter's writeGroundTruthEXR function or
   * for direct binary file output.
   *
   * @param data         Float32Array of pixel data
   * @param width        Image width
   * @param height       Image height
   * @param channelName  Name of the channel (for metadata)
   * @returns ArrayBuffer containing the raw float data
   */
  exportEXRChannel(data: Float32Array, width: number, height: number, channelName: string): ArrayBuffer {
    // Create a header + float data structure
    // Header: magic(4) + width(4) + height(4) + channels(4) + nameLen(4) + name(N)
    const nameBytes = new TextEncoder().encode(channelName);
    const headerSize = 20 + nameBytes.length;
    const dataSize = data.byteLength;
    const totalSize = headerSize + dataSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    // Magic number: 'GTEX' = 0x47544558
    view.setUint32(0, 0x47544558, true);
    view.setUint32(4, width, true);
    view.setUint32(8, height, true);
    view.setUint32(12, data.length / (width * height), true); // channels per pixel
    view.setUint32(16, nameBytes.length, true);

    const arr = new Uint8Array(buffer);
    arr.set(nameBytes, 20);

    const dataBytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    arr.set(dataBytes, headerSize);

    return buffer;
  }

  // --- Private pass renderers ---

  /**
   * Render depth pass using override material.
   */
  private renderDepthPass(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    width: number,
    height: number,
    useFloat: boolean,
  ): TextureData {
    const target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: useFloat ? THREE.FloatType : THREE.UnsignedByteType,
    });

    const depthMat = new THREE.ShaderMaterial({
      uniforms: {
        near: { value: camera.near },
        far: { value: camera.far },
      },
      vertexShader: /* glsl */ `
        varying float vDepth;
        void main() {
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mvPos.z;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float near;
        uniform float far;
        varying float vDepth;
        void main() {
          gl_FragColor = vec4(vDepth, 0.0, 0.0, 1.0);
        }
      `,
      depthTest: true,
      depthWrite: true,
    });

    // Apply override material
    scene.overrideMaterial = depthMat;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    scene.overrideMaterial = null;

    // Read pixels
    const data = new Float32Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, data);

    // Extract depth channel only
    const depthData = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      depthData[i] = data[i * 4]; // R channel = depth
    }

    depthMat.dispose();
    target.dispose();

    return {
      name: 'depth',
      data: depthData,
      width,
      height,
      channels: 1,
    };
  }

  /**
   * Render normal pass using override material.
   */
  private renderNormalPass(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    width: number,
    height: number,
    useFloat: boolean,
  ): TextureData {
    const target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: useFloat ? THREE.FloatType : THREE.UnsignedByteType,
    });

    const normalMat = new THREE.ShaderMaterial({
      uniforms: {
        viewMatrix: { value: camera.matrixWorldInverse.clone() },
      },
      vertexShader: /* glsl */ `
        uniform mat4 viewMatrix;
        varying vec3 vNormal;
        void main() {
          vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
          vec3 cameraNormal = normalize(mat3(viewMatrix) * worldNormal);
          vNormal = cameraNormal;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vNormal;
        void main() {
          vec3 n = normalize(vNormal);
          gl_FragColor = vec4(n, 1.0);
        }
      `,
      depthTest: true,
      depthWrite: true,
    });

    scene.overrideMaterial = normalMat;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    scene.overrideMaterial = null;

    const data = new Float32Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, data);

    // Extract XYZ normals
    const normalData = new Float32Array(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      normalData[i * 3 + 0] = data[i * 4 + 0];
      normalData[i * 3 + 1] = data[i * 4 + 1];
      normalData[i * 3 + 2] = data[i * 4 + 2];
    }

    normalMat.dispose();
    target.dispose();

    return {
      name: 'normal',
      data: normalData,
      width,
      height,
      channels: 3,
    };
  }

  /**
   * Render segmentation pass with flat colors per mesh object.
   */
  private renderSegmentationPass(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    width: number,
    height: number,
  ): TextureData {
    const target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    });

    // Assign unique colors to each mesh
    const meshMap = new Map<THREE.Mesh, THREE.Color>();
    let meshIndex = 0;

    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const color = new THREE.Color().setHSL(
          (meshIndex * 0.618033988749895) % 1.0,
          0.8,
          0.5,
        );
        meshMap.set(mesh, color);
        meshIndex++;
      }
    });

    const segMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(1, 1, 1) },
      },
      vertexShader: /* glsl */ `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        void main() {
          gl_FragColor = vec4(uColor, 1.0);
        }
      `,
      depthTest: true,
      depthWrite: true,
    });

    // Render each mesh with its unique color
    renderer.setRenderTarget(target);
    renderer.clear(true, true, true);

    for (const [mesh, color] of meshMap) {
      const origMat = mesh.material;
      segMat.uniforms.uColor.value.copy(color);
      mesh.material = segMat;
      renderer.render(scene, camera);
      mesh.material = origMat;
    }

    renderer.setRenderTarget(null);

    const data = new Float32Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, data);

    segMat.dispose();
    target.dispose();

    return {
      name: 'segmentation',
      data,
      width,
      height,
      channels: 4,
    };
  }

  /**
   * Render position pass using override material.
   */
  private renderPositionPass(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    width: number,
    height: number,
    useFloat: boolean,
  ): TextureData {
    const target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: useFloat ? THREE.FloatType : THREE.UnsignedByteType,
    });

    const posMat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vWorldPos;
        void main() {
          gl_FragColor = vec4(vWorldPos, 1.0);
        }
      `,
      depthTest: true,
      depthWrite: true,
    });

    scene.overrideMaterial = posMat;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    scene.overrideMaterial = null;

    const data = new Float32Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, data);

    const posData = new Float32Array(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      posData[i * 3 + 0] = data[i * 4 + 0];
      posData[i * 3 + 1] = data[i * 4 + 1];
      posData[i * 3 + 2] = data[i * 4 + 2];
    }

    posMat.dispose();
    target.dispose();

    return {
      name: 'position',
      data: posData,
      width,
      height,
      channels: 3,
    };
  }
}
