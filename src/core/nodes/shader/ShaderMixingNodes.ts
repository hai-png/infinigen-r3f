/**
 * Shader Mixing Nodes - MixShader, LightPath, Fresnel, and Composite Nodes
 *
 * Provides advanced shader mixing capabilities for the node system:
 * - MixShaderNode: Blends two shader configurations with multiple blend modes
 * - LightPathNode: Provides ray-type information for context-sensitive shading
 * - TransparentOverlayNode: Composite node for camera-transparent / shadow-opaque effects
 * - FresnelNode: Schlick's approximation for angle-dependent mixing
 * - ShaderMixingSystem: Registry with preset material configurations
 *
 * Based on Blender's shader node system:
 *   infinigen/core/nodes/nodegroups/shader_nodes.py
 *   ShaderNodeMixShader, ShaderNodeLightPath, ShaderNodeFresnel
 */

import * as THREE from 'three';

// ============================================================================
// Type Definitions & Interfaces
// ============================================================================

/**
 * Blend modes supported by MixShaderNode.
 * MIX = linear interpolation, ADD = additive, MULTIPLY = multiplicative,
 * OVERLAY = overlay compositing (combines multiply and screen)
 */
export type BlendMode = 'MIX' | 'ADD' | 'MULTIPLY' | 'OVERLAY';

/**
 * Ray types tracked by LightPathNode, matching Blender's Light Path outputs.
 * Each type corresponds to a specific kind of ray being traced during rendering.
 */
export type RayType =
  | 'camera'
  | 'shadow'
  | 'diffuse'
  | 'glossy'
  | 'reflection'
  | 'transmission';

/**
 * Context provided to shader nodes during evaluation.
 * Contains information about the current ray being traced,
 * the surface point being shaded, and geometric data.
 */
export interface LightPathContext {
  /** The type of ray currently being traced */
  rayType: RayType;
  /** Direction of the incoming ray (pointing toward the surface) */
  incidentDirection: THREE.Vector3;
  /** Surface normal at the hit point (in world space) */
  normal: THREE.Vector3;
  /** Direction from the surface point toward the camera / viewer */
  viewDirection: THREE.Vector3;
  /** World-space position of the surface point being shaded */
  position: THREE.Vector3;
}

/**
 * A shader output carrying all the PBR parameters needed to describe
 * a complete material appearance. This is the common currency passed
 * between shader mixing nodes.
 */
export interface ShaderOutput {
  /** Base albedo color */
  color: THREE.Color;
  /** Metalness factor 0-1 */
  metalness: number;
  /** Roughness factor 0-1 */
  roughness: number;
  /** Index of refraction */
  ior: number;
  /** Transmission factor 0-1 (glass-like transparency) */
  transmission: number;
  /** Emission color */
  emissionColor: THREE.Color;
  /** Emission strength multiplier */
  emissionStrength: number;
  /** Alpha / opacity 0-1 */
  alpha: number;
  /** Clearcoat intensity 0-1 */
  clearcoat: number;
  /** Clearcoat roughness 0-1 */
  clearcoatRoughness: number;
  /** Subsurface scattering weight 0-1 */
  subsurfaceWeight: number;
  /** Subsurface scattering radius per channel */
  subsurfaceRadius: THREE.Vector3;
  /** Sheen intensity 0-1 */
  sheen: number;
  /** Sheen tint 0-1 */
  sheenTint: number;
  /** Specular reflectivity 0-1 */
  specular: number;
  /** Surface normal override (null = use geometry normal) */
  normal: THREE.Vector3 | null;
}

/**
 * All boolean ray-type outputs from a LightPathNode evaluation.
 * Each field is 1.0 when the current ray matches that type, 0.0 otherwise.
 */
export interface LightPathOutput {
  isCameraRay: number;
  isShadowRay: number;
  isDiffuseRay: number;
  isGlossyRay: number;
  isReflectionRay: number;
  isTransmissionRay: number;
}

// ============================================================================
// Helper Utilities
// ============================================================================

/** Clamp a value to [0, 1] */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Linearly interpolate between two numbers */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/** Linearly interpolate between two Colors (mutates and returns `out`) */
function lerpColor(out: THREE.Color, a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  const f = clamp01(t);
  out.r = a.r + (b.r - a.r) * f;
  out.g = a.g + (b.g - a.g) * f;
  out.b = a.b + (b.b - a.b) * f;
  return out;
}

/** Linearly interpolate between two Vector3s (mutates and returns `out`) */
function lerpVector3(out: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  const f = clamp01(t);
  out.x = a.x + (b.x - a.x) * f;
  out.y = a.y + (b.y - a.y) * f;
  out.z = a.z + (b.z - a.z) * f;
  return out;
}

/** Overlay blend for a single channel (both inputs assumed in [0,1]) */
function overlayChannel(base: number, blend: number): number {
  return base < 0.5
    ? 2.0 * base * blend
    : 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
}

/**
 * Create a default ShaderOutput with neutral PBR values.
 */
export function createDefaultShaderOutput(): ShaderOutput {
  return {
    color: new THREE.Color(0.8, 0.8, 0.8),
    metalness: 0.0,
    roughness: 0.5,
    ior: 1.45,
    transmission: 0.0,
    emissionColor: new THREE.Color(0, 0, 0),
    emissionStrength: 0.0,
    alpha: 1.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.03,
    subsurfaceWeight: 0.0,
    subsurfaceRadius: new THREE.Vector3(1.0, 0.2, 0.1),
    sheen: 0.0,
    sheenTint: 0.5,
    specular: 0.5,
    normal: null,
  };
}

// ============================================================================
// MixShaderNode
// ============================================================================

/**
 * MixShaderNode — Blends between two complete shader configurations.
 *
 * Inputs:
 *   shaderA  — First shader output (factor = 0)
 *   shaderB  — Second shader output (factor = 1)
 *   factor   — Blend weight in [0, 1]. Can be uniform, texture-driven,
 *              or derived from a Fresnel / LightPath node.
 *
 * Outputs:
 *   result   — The blended ShaderOutput
 *
 * Supported blend modes:
 *   MIX       — Standard linear interpolation
 *   ADD       — Additive blending (useful for layering emission)
 *   MULTIPLY  — Multiplicative darkening
 *   OVERLAY   — Overlay compositing (contrast-preserving blend)
 */
export class MixShaderNode {
  readonly nodeType = 'mix_shader';
  readonly category = 'shader';

  /** Blend factor 0 = shaderA only, 1 = shaderB only */
  factor: number;
  /** Active blend mode */
  blendMode: BlendMode;

  constructor(factor: number = 0.5, blendMode: BlendMode = 'MIX') {
    this.factor = clamp01(factor);
    this.blendMode = blendMode;
  }

  /**
   * Evaluate the mix shader.
   *
   * @param shaderA  First shader input (used when factor = 0)
   * @param shaderB  Second shader input (used when factor = 1)
   * @param factor   Optional per-evaluation factor override; if provided it
   *                 takes precedence over `this.factor`.
   * @returns        Blended ShaderOutput
   */
  evaluate(
    shaderA: ShaderOutput,
    shaderB: ShaderOutput,
    factor?: number,
  ): ShaderOutput {
    const f = factor !== undefined ? clamp01(factor) : this.factor;
    const result = createDefaultShaderOutput();

    switch (this.blendMode) {
      case 'MIX':
        this._blendMix(result, shaderA, shaderB, f);
        break;
      case 'ADD':
        this._blendAdd(result, shaderA, shaderB, f);
        break;
      case 'MULTIPLY':
        this._blendMultiply(result, shaderA, shaderB, f);
        break;
      case 'OVERLAY':
        this._blendOverlay(result, shaderA, shaderB, f);
        break;
      default:
        this._blendMix(result, shaderA, shaderB, f);
    }

    return result;
  }

  // -- Blend implementations ------------------------------------------------

  private _blendMix(
    out: ShaderOutput, a: ShaderOutput, b: ShaderOutput, f: number,
  ): void {
    lerpColor(out.color, a.color, b.color, f);
    out.metalness = lerp(a.metalness, b.metalness, f);
    out.roughness = lerp(a.roughness, b.roughness, f);
    out.ior = lerp(a.ior, b.ior, f);
    out.transmission = lerp(a.transmission, b.transmission, f);
    lerpColor(out.emissionColor, a.emissionColor, b.emissionColor, f);
    out.emissionStrength = lerp(a.emissionStrength, b.emissionStrength, f);
    out.alpha = lerp(a.alpha, b.alpha, f);
    out.clearcoat = lerp(a.clearcoat, b.clearcoat, f);
    out.clearcoatRoughness = lerp(a.clearcoatRoughness, b.clearcoatRoughness, f);
    out.subsurfaceWeight = lerp(a.subsurfaceWeight, b.subsurfaceWeight, f);
    lerpVector3(out.subsurfaceRadius, a.subsurfaceRadius, b.subsurfaceRadius, f);
    out.sheen = lerp(a.sheen, b.sheen, f);
    out.sheenTint = lerp(a.sheenTint, b.sheenTint, f);
    out.specular = lerp(a.specular, b.specular, f);
    out.normal = f < 0.5 ? a.normal : b.normal;
  }

  private _blendAdd(
    out: ShaderOutput, a: ShaderOutput, b: ShaderOutput, f: number,
  ): void {
    // Additive: add B scaled by f to A
    out.color.setRGB(
      a.color.r + b.color.r * f,
      a.color.g + b.color.g * f,
      a.color.b + b.color.b * f,
    );
    out.metalness = clamp01(a.metalness + b.metalness * f);
    out.roughness = clamp01(a.roughness + b.roughness * f);
    out.ior = a.ior + (b.ior - 1.0) * f; // offset from 1.0
    out.transmission = clamp01(a.transmission + b.transmission * f);
    out.emissionColor.setRGB(
      a.emissionColor.r + b.emissionColor.r * f,
      a.emissionColor.g + b.emissionColor.g * f,
      a.emissionColor.b + b.emissionColor.b * f,
    );
    out.emissionStrength = a.emissionStrength + b.emissionStrength * f;
    out.alpha = clamp01(a.alpha + b.alpha * f);
    out.clearcoat = clamp01(a.clearcoat + b.clearcoat * f);
    out.clearcoatRoughness = clamp01(a.clearcoatRoughness + b.clearcoatRoughness * f);
    out.subsurfaceWeight = clamp01(a.subsurfaceWeight + b.subsurfaceWeight * f);
    out.subsurfaceRadius.copy(a.subsurfaceRadius).addScaledVector(b.subsurfaceRadius, f);
    out.sheen = clamp01(a.sheen + b.sheen * f);
    out.sheenTint = clamp01(a.sheenTint + b.sheenTint * f);
    out.specular = clamp01(a.specular + b.specular * f);
    out.normal = f < 0.5 ? a.normal : b.normal;
  }

  private _blendMultiply(
    out: ShaderOutput, a: ShaderOutput, b: ShaderOutput, f: number,
  ): void {
    // Multiply: A * lerp(1, B, f) — B modulates A
    const oneMinusF = 1 - f;
    out.color.setRGB(
      a.color.r * (oneMinusF + b.color.r * f),
      a.color.g * (oneMinusF + b.color.g * f),
      a.color.b * (oneMinusF + b.color.b * f),
    );
    out.metalness = clamp01(a.metalness * lerp(1, b.metalness, f));
    out.roughness = clamp01(a.roughness * lerp(1, b.roughness, f));
    out.ior = a.ior * lerp(1, b.ior, f);
    out.transmission = clamp01(a.transmission * lerp(1, b.transmission, f));
    out.emissionColor.setRGB(
      a.emissionColor.r * (oneMinusF + b.emissionColor.r * f),
      a.emissionColor.g * (oneMinusF + b.emissionColor.g * f),
      a.emissionColor.b * (oneMinusF + b.emissionColor.b * f),
    );
    out.emissionStrength = a.emissionStrength * lerp(1, b.emissionStrength, f);
    out.alpha = clamp01(a.alpha * lerp(1, b.alpha, f));
    out.clearcoat = clamp01(a.clearcoat * lerp(1, b.clearcoat, f));
    out.clearcoatRoughness = clamp01(a.clearcoatRoughness * lerp(1, b.clearcoatRoughness, f));
    out.subsurfaceWeight = clamp01(a.subsurfaceWeight * lerp(1, b.subsurfaceWeight, f));
    // Multiply blend for subsurface radius: A * lerp(1, B, f)
    out.subsurfaceRadius.set(
      a.subsurfaceRadius.x * (oneMinusF + b.subsurfaceRadius.x * f),
      a.subsurfaceRadius.y * (oneMinusF + b.subsurfaceRadius.y * f),
      a.subsurfaceRadius.z * (oneMinusF + b.subsurfaceRadius.z * f),
    );
    out.sheen = clamp01(a.sheen * lerp(1, b.sheen, f));
    out.sheenTint = clamp01(a.sheenTint * lerp(1, b.sheenTint, f));
    out.specular = clamp01(a.specular * lerp(1, b.specular, f));
    out.normal = f < 0.5 ? a.normal : b.normal;
  }

  private _blendOverlay(
    out: ShaderOutput, a: ShaderOutput, b: ShaderOutput, f: number,
  ): void {
    // Overlay: per-channel overlay compositing lerped by factor
    const fC = clamp01(f);
    out.color.setRGB(
      lerp(a.color.r, overlayChannel(a.color.r, b.color.r), fC),
      lerp(a.color.g, overlayChannel(a.color.g, b.color.g), fC),
      lerp(a.color.b, overlayChannel(a.color.b, b.color.b), fC),
    );
    out.metalness = lerp(a.metalness, overlayChannel(a.metalness, b.metalness), fC);
    out.roughness = lerp(a.roughness, overlayChannel(a.roughness, b.roughness), fC);
    out.ior = lerp(a.ior, a.ior + (b.ior - a.ior) * overlayChannel(0.5, clamp01(b.ior / 3.0)), fC);
    out.transmission = lerp(a.transmission, overlayChannel(a.transmission, b.transmission), fC);
    out.emissionColor.setRGB(
      lerp(a.emissionColor.r, overlayChannel(a.emissionColor.r, b.emissionColor.r), fC),
      lerp(a.emissionColor.g, overlayChannel(a.emissionColor.g, b.emissionColor.g), fC),
      lerp(a.emissionColor.b, overlayChannel(a.emissionColor.b, b.emissionColor.b), fC),
    );
    out.emissionStrength = lerp(a.emissionStrength, overlayChannel(clamp01(a.emissionStrength), clamp01(b.emissionStrength)), fC);
    out.alpha = lerp(a.alpha, overlayChannel(a.alpha, b.alpha), fC);
    out.clearcoat = lerp(a.clearcoat, overlayChannel(a.clearcoat, b.clearcoat), fC);
    out.clearcoatRoughness = lerp(a.clearcoatRoughness, overlayChannel(a.clearcoatRoughness, b.clearcoatRoughness), fC);
    out.subsurfaceWeight = lerp(a.subsurfaceWeight, overlayChannel(a.subsurfaceWeight, b.subsurfaceWeight), fC);
    out.subsurfaceRadius.set(
      lerp(a.subsurfaceRadius.x, overlayChannel(a.subsurfaceRadius.x, b.subsurfaceRadius.x), fC),
      lerp(a.subsurfaceRadius.y, overlayChannel(a.subsurfaceRadius.y, b.subsurfaceRadius.y), fC),
      lerp(a.subsurfaceRadius.z, overlayChannel(a.subsurfaceRadius.z, b.subsurfaceRadius.z), fC),
    );
    out.sheen = lerp(a.sheen, overlayChannel(a.sheen, b.sheen), fC);
    out.sheenTint = lerp(a.sheenTint, overlayChannel(a.sheenTint, b.sheenTint), fC);
    out.specular = lerp(a.specular, overlayChannel(a.specular, b.specular), fC);
    out.normal = fC < 0.5 ? a.normal : b.normal;
  }
}

// ============================================================================
// LightPathNode
// ============================================================================

/**
 * LightPathNode — Provides ray-type information during shading.
 *
 * Outputs (each 0 or 1):
 *   isCameraRay       — 1 if the ray originated from the camera
 *   isShadowRay       — 1 if the ray is a shadow ray (testing visibility to light)
 *   isDiffuseRay      — 1 if the ray bounced off a diffuse surface
 *   isGlossyRay       — 1 if the ray bounced off a glossy/specular surface
 *   isReflectionRay   — 1 if the ray is a specular reflection
 *   isTransmissionRay — 1 if the ray passed through a transmissive surface
 *
 * Use cases:
 *   - Make objects transparent from the camera but cast shadows
 *   - Apply different shading for reflections vs. direct view
 *   - Control shadow color independently of surface color
 */
export class LightPathNode {
  readonly nodeType = 'light_path';
  readonly category = 'shader';

  /**
   * Evaluate all light path outputs based on the rendering context.
   *
   * @param context  The current light path / render context
   * @returns        Object with each ray-type flag as 0.0 or 1.0
   */
  evaluate(context: LightPathContext): LightPathOutput {
    return {
      isCameraRay: context.rayType === 'camera' ? 1.0 : 0.0,
      isShadowRay: context.rayType === 'shadow' ? 1.0 : 0.0,
      isDiffuseRay: context.rayType === 'diffuse' ? 1.0 : 0.0,
      isGlossyRay: context.rayType === 'glossy' ? 1.0 : 0.0,
      isReflectionRay: context.rayType === 'reflection' ? 1.0 : 0.0,
      isTransmissionRay: context.rayType === 'transmission' ? 1.0 : 0.0,
    };
  }

  /**
   * Convenience: returns a single ray-type flag by name.
   */
  getRayFlag(context: LightPathContext, rayType: RayType): number {
    return context.rayType === rayType ? 1.0 : 0.0;
  }
}

// ============================================================================
// FresnelNode
// ============================================================================

/**
 * FresnelNode — Computes the Fresnel effect using Schlick's approximation.
 *
 * The Fresnel effect describes how reflectivity increases at grazing angles.
 * This is the physical basis for phenomena like:
 *   - Water appearing more reflective at shallow viewing angles
 *   - Glass reflections being stronger at the edges
 *   - The "rim lighting" effect on curved surfaces
 *
 * Schlick's approximation:
 *   R(θ) = R0 + (1 - R0)(1 - cos θ)^5
 *
 * where:
 *   R0 = ((n1 - n2) / (n1 + n2))^2   (reflectance at normal incidence)
 *   θ  = angle between view direction and surface normal
 *   n1 = 1.0 (air), n2 = IOR of the material
 *
 * Inputs:
 *   ior    — Index of refraction of the material (default 1.45)
 *   normal — Optional custom normal (uses context normal if null)
 *
 * Outputs:
 *   factor — 0 at perpendicular incidence, 1 at grazing angles
 */
export class FresnelNode {
  readonly nodeType = 'fresnel';
  readonly category = 'shader';

  /** Index of refraction for the material */
  ior: number;
  /** Custom normal override; null = use geometry normal from context */
  normal: THREE.Vector3 | null;

  private _tmpView = new THREE.Vector3();
  private _tmpNorm = new THREE.Vector3();

  constructor(ior: number = 1.45, normal: THREE.Vector3 | null = null) {
    this.ior = Math.max(1.0, ior); // IOR must be >= 1
    this.normal = normal;
  }

  /**
   * Evaluate the Fresnel factor for the given shading context.
   *
   * @param context  Current light path context providing view/normal data
   * @returns        Fresnel factor in [0, 1]
   */
  evaluate(context: LightPathContext): number {
    // Determine the effective normal
    const normal = this.normal ?? context.normal;
    this._tmpNorm.copy(normal).normalize();

    // View direction: from surface toward camera
    this._tmpView.copy(context.viewDirection).normalize();

    // cos(theta) = dot(normal, view)
    // Clamp to [0, 1] to handle back-facing surfaces gracefully
    const cosTheta = clamp01(this._tmpNorm.dot(this._tmpView));

    // Schlick's R0: reflectance at normal incidence (air-to-material)
    const n1 = 1.0; // air
    const n2 = this.ior;
    const r0 = ((n1 - n2) / (n1 + n2)) ** 2;

    // Schlick's approximation
    const oneMinusCos = 1.0 - cosTheta;
    const fresnel = r0 + (1.0 - r0) * (oneMinusCos * oneMinusCos * oneMinusCos * oneMinusCos * oneMinusCos);

    return clamp01(fresnel);
  }

  /**
   * Static convenience: compute Fresnel factor for given IOR and angle.
   *
   * @param ior          Index of refraction
   * @param cosTheta     Cosine of angle between normal and view direction
   * @returns            Fresnel factor in [0, 1]
   */
  static schlick(ior: number, cosTheta: number): number {
    const n1 = 1.0;
    const n2 = Math.max(1.0, ior);
    const r0 = ((n1 - n2) / (n1 + n2)) ** 2;
    const omc = 1.0 - clamp01(cosTheta);
    return clamp01(r0 + (1.0 - r0) * omc * omc * omc * omc * omc);
  }

  /**
   * Compute R0 (reflectance at normal incidence) for a given IOR.
   */
  static computeR0(ior: number): number {
    const n2 = Math.max(1.0, ior);
    return ((1.0 - n2) / (1.0 + n2)) ** 2;
  }
}

// ============================================================================
// TransparentOverlayNode
// ============================================================================

/**
 * TransparentOverlayNode — Composite node for camera-transparent / shadow-opaque effects.
 *
 * This is a common pattern in production rendering: an object should appear
 * transparent when viewed directly through the camera, but still cast opaque
 * (possibly tinted) shadows. This is achieved by:
 *
 * 1. Evaluating the LightPath to detect shadow vs. camera rays
 * 2. Using the result to drive a MixShader between a base shader and a
 *    transparent version
 *
 * Common use cases:
 *   - Glass that casts colored shadows
 *   - Foliage that is translucent from the camera but opaque to shadows
 *   - Volumetric effects that shouldn't block light
 *
 * Inputs:
 *   baseShader     — The primary material appearance
 *   overlayColor   — Color applied in shadow rays (e.g., colored shadow tint)
 *   transparency   — How transparent the object appears to camera rays (0-1)
 */
export class TransparentOverlayNode {
  readonly nodeType = 'transparent_overlay';
  readonly category = 'shader';

  /** The base shader that defines the material's primary appearance */
  baseShader: ShaderOutput;
  /** Color tint for shadow rays */
  overlayColor: THREE.Color;
  /** Transparency for camera rays: 0 = fully opaque, 1 = fully transparent */
  transparency: number;

  // Internal nodes
  private _lightPath: LightPathNode;
  private _mixShader: MixShaderNode;
  private _transparentShader: ShaderOutput;

  constructor(
    baseShader: ShaderOutput = createDefaultShaderOutput(),
    overlayColor: THREE.Color = new THREE.Color(1, 1, 1),
    transparency: number = 0.8,
  ) {
    this.baseShader = baseShader;
    this.overlayColor = overlayColor.clone();
    this.transparency = clamp01(transparency);
    this._lightPath = new LightPathNode();
    this._mixShader = new MixShaderNode(0.5, 'MIX');

    // Build the transparent variant of the base shader
    this._transparentShader = createDefaultShaderOutput();
    this._updateTransparentShader();
  }

  /**
   * Evaluate the transparent overlay for the given render context.
   *
   * @param context  Current light path / render context
   * @returns        ShaderOutput with camera transparency and shadow opacity
   */
  evaluate(context: LightPathContext): ShaderOutput {
    const lp = this._lightPath.evaluate(context);

    // When this is a shadow ray, use opaque overlay (factor → 0, pick base)
    // When this is a camera ray, blend toward transparent
    // isCameraRay = 1 → factor = transparency (more transparent)
    // isShadowRay = 1 → factor = 0 (fully opaque base)
    const factor = lp.isCameraRay * this.transparency;

    return this._mixShader.evaluate(this.baseShader, this._transparentShader, factor);
  }

  /**
   * Update the internal transparent shader variant.
   * Call after modifying baseShader, overlayColor, or transparency.
   */
  private _updateTransparentShader(): void {
    this._transparentShader.color.copy(this.overlayColor);
    this._transparentShader.metalness = 0.0;
    this._transparentShader.roughness = 0.0;
    this._transparentShader.transmission = 1.0;
    this._transparentShader.alpha = 1.0 - this.transparency;
    this._transparentShader.emissionColor.set(0, 0, 0);
    this._transparentShader.emissionStrength = 0.0;
    this._transparentShader.clearcoat = 0.0;
    this._transparentShader.subsurfaceWeight = 0.0;
    this._transparentShader.sheen = 0.0;
    this._transparentShader.specular = 0.0;
    this._transparentShader.normal = null;
  }

  /**
   * Update parameters and refresh the internal transparent shader.
   */
  update(
    baseShader?: ShaderOutput,
    overlayColor?: THREE.Color,
    transparency?: number,
  ): void {
    if (baseShader !== undefined) this.baseShader = baseShader;
    if (overlayColor !== undefined) this.overlayColor.copy(overlayColor);
    if (transparency !== undefined) this.transparency = clamp01(transparency);
    this._updateTransparentShader();
  }
}

// ============================================================================
// ShaderMixingSystem — Registry & Preset Factory
// ============================================================================

/**
 * A registered mix shader configuration in the system.
 */
export interface RegisteredMixShader {
  id: string;
  name: string;
  node: MixShaderNode;
  shaderA: ShaderOutput;
  shaderB: ShaderOutput;
  factorSource: 'uniform' | 'fresnel' | 'lightpath' | 'texture';
  factorValue?: number;
  fresnelNode?: FresnelNode;
}

/**
 * ShaderMixingSystem — Central registry for mix shader configurations,
 * graph evaluation, and preset material creation.
 *
 * Provides:
 *   - registerMixShader() — Register a named mix shader configuration
 *   - evaluateShaderGraph() — Traverse and evaluate a shader node graph
 *   - createWaterSurfaceMix() — Preset: Fresnel-driven water surface
 *   - createGlassMaterial() — Preset: LightPath-aware glass
 *   - createFoliageMaterial() — Preset: Leaf with subsurface scattering
 */
export class ShaderMixingSystem {
  private _registry: Map<string, RegisteredMixShader> = new Map();
  private _nextId = 0;

  // Shared nodes for evaluation
  private _lightPath = new LightPathNode();

  /**
   * Register a mix shader configuration.
   *
   * @param name          Human-readable name
   * @param node          MixShaderNode instance
   * @param shaderA       First shader input
   * @param shaderB       Second shader input
   * @param factorSource  How the factor is determined
   * @param factorValue   Uniform factor value (if applicable)
   * @param fresnelNode   Fresnel node (if factorSource is 'fresnel')
   * @returns             Registration ID
   */
  registerMixShader(
    name: string,
    node: MixShaderNode,
    shaderA: ShaderOutput,
    shaderB: ShaderOutput,
    factorSource: 'uniform' | 'fresnel' | 'lightpath' | 'texture' = 'uniform',
    factorValue?: number,
    fresnelNode?: FresnelNode,
  ): string {
    const id = `mix_shader_${this._nextId++}`;
    this._registry.set(id, {
      id,
      name,
      node,
      shaderA,
      shaderB,
      factorSource,
      factorValue,
      fresnelNode,
    });
    return id;
  }

  /**
   * Retrieve a registered mix shader by ID.
   */
  getMixShader(id: string): RegisteredMixShader | undefined {
    return this._registry.get(id);
  }

  /**
   * List all registered mix shader IDs.
   */
  listMixShaders(): string[] {
    return Array.from(this._registry.keys());
  }

  /**
   * Remove a registered mix shader.
   */
  unregisterMixShader(id: string): boolean {
    return this._registry.delete(id);
  }

  /**
   * Evaluate a shader graph starting from a root node.
   *
   * Walks the graph, evaluates each node in turn, and produces a final
   * ShaderOutput. Supports MixShader, Fresnel, LightPath, and
   * TransparentOverlay nodes.
   *
   * @param rootNode  The root node to start evaluation from
   * @param context   The current rendering context
   * @returns         Final evaluated ShaderOutput
   */
  evaluateShaderGraph(
    rootNode: MixShaderNode | FresnelNode | LightPathNode | TransparentOverlayNode,
    context: LightPathContext,
  ): ShaderOutput {
    // Handle each node type
    if (rootNode instanceof TransparentOverlayNode) {
      return rootNode.evaluate(context);
    }

    if (rootNode instanceof LightPathNode) {
      // LightPath alone doesn't produce a shader; create a default with
      // the camera-ray factor encoded as alpha for diagnostic use
      const lp = rootNode.evaluate(context);
      const out = createDefaultShaderOutput();
      out.alpha = lp.isCameraRay;
      return out;
    }

    if (rootNode instanceof FresnelNode) {
      // Fresnel alone doesn't produce a shader; encode factor as roughness
      const f = rootNode.evaluate(context);
      const out = createDefaultShaderOutput();
      out.roughness = f;
      return out;
    }

    if (rootNode instanceof MixShaderNode) {
      // For a standalone MixShaderNode we need default inputs
      const factor = rootNode.factor;
      return rootNode.evaluate(
        createDefaultShaderOutput(),
        createDefaultShaderOutput(),
        factor,
      );
    }

    // Fallback
    return createDefaultShaderOutput();
  }

  /**
   * Evaluate a registered mix shader by ID within the given context.
   *
   * @param id       Registered mix shader ID
   * @param context  Current rendering context
   * @returns        Evaluated ShaderOutput, or default if not found
   */
  evaluateRegistered(id: string, context: LightPathContext): ShaderOutput {
    const entry = this._registry.get(id);
    if (!entry) return createDefaultShaderOutput();

    let factor: number;

    switch (entry.factorSource) {
      case 'fresnel': {
        const fresnel = entry.fresnelNode ?? new FresnelNode();
        factor = fresnel.evaluate(context);
        break;
      }
      case 'lightpath': {
        const lp = this._lightPath.evaluate(context);
        // Default: use camera ray flag as factor
        factor = lp.isCameraRay;
        break;
      }
      case 'uniform':
      default:
        factor = entry.factorValue ?? entry.node.factor;
    }

    return entry.node.evaluate(entry.shaderA, entry.shaderB, factor);
  }

  // --------------------------------------------------------------------------
  // Preset Material Factories
  // --------------------------------------------------------------------------

  /**
   * Create a Fresnel-driven water surface material.
   *
   * Water has low reflectance when viewed straight down (you see into the
   * water) but high reflectance at shallow angles. This preset:
   *   - Shader A: Deep water color (dark, slightly transparent)
   *   - Shader B: Sky reflection (lighter, more specular)
   *   - Factor: Fresnel with IOR ~1.33 (water)
   *
   * @param ior         Index of refraction (default 1.33 for water)
   * @param baseColor   Deep water color (default dark blue-green)
   * @param depthColor  Reflected sky/highlight color
   * @returns           Registered mix shader ID
   */
  createWaterSurfaceMix(
    ior: number = 1.33,
    baseColor: THREE.Color = new THREE.Color(0.01, 0.04, 0.08),
    depthColor: THREE.Color = new THREE.Color(0.15, 0.35, 0.45),
  ): string {
    // Shader A: deep water — low roughness, slightly transmissive
    const shaderA = createDefaultShaderOutput();
    shaderA.color.copy(baseColor);
    shaderA.metalness = 0.0;
    shaderA.roughness = 0.05;
    shaderA.transmission = 0.4;
    shaderA.ior = ior;
    shaderA.specular = 0.8;
    shaderA.alpha = 0.95;

    // Shader B: surface reflection — sky-like color
    const shaderB = createDefaultShaderOutput();
    shaderB.color.copy(depthColor);
    shaderB.metalness = 0.0;
    shaderB.roughness = 0.02;
    shaderB.transmission = 0.0;
    shaderB.specular = 1.0;
    shaderB.clearcoat = 0.3;
    shaderB.clearcoatRoughness = 0.01;

    const fresnel = new FresnelNode(ior);
    const mixNode = new MixShaderNode(0.5, 'MIX');

    return this.registerMixShader(
      'Water Surface',
      mixNode,
      shaderA,
      shaderB,
      'fresnel',
      undefined,
      fresnel,
    );
  }

  /**
   * Create a glass material with LightPath-aware transparency.
   *
   * Glass appears transparent when viewed from the camera, but casts
   * appropriately tinted shadows. The material uses:
   *   - Shader A: Solid glass (for shadow/reflection rays)
   *   - Shader B: Transparent version (for camera rays)
   *   - Factor: Driven by LightPath isCameraRay flag
   *
   * @param ior        Index of refraction (default 1.5 for glass)
   * @param tint       Color tint of the glass
   * @param roughness  Surface roughness of the glass
   * @returns          Registered mix shader ID
   */
  createGlassMaterial(
    ior: number = 1.5,
    tint: THREE.Color = new THREE.Color(1, 1, 1),
    roughness: number = 0.0,
  ): string {
    // Shader A: solid glass appearance (for shadows and indirect rays)
    const shaderA = createDefaultShaderOutput();
    shaderA.color.copy(tint);
    shaderA.metalness = 0.0;
    shaderA.roughness = roughness;
    shaderA.transmission = 0.95;
    shaderA.ior = ior;
    shaderA.specular = 1.0;
    shaderA.alpha = 1.0;
    shaderA.clearcoat = 0.1;

    // Shader B: fully transparent (for direct camera view)
    const shaderB = createDefaultShaderOutput();
    shaderB.color.copy(tint);
    shaderB.metalness = 0.0;
    shaderB.roughness = 0.0;
    shaderB.transmission = 1.0;
    shaderB.ior = ior;
    shaderB.alpha = 0.15;
    shaderB.specular = 1.0;

    const mixNode = new MixShaderNode(0.5, 'MIX');

    return this.registerMixShader(
      'Glass Material',
      mixNode,
      shaderA,
      shaderB,
      'lightpath',
    );
  }

  /**
   * Create a foliage material with subsurface scattering.
   *
   * Leaves are thin and translucent: light passes through them, giving
   * a characteristic back-lit glow. This preset:
   *   - Shader A: Front surface (darker, diffuse)
   *   - Shader B: Back-lit subsurface (brighter, warmer, translucent)
   *   - Factor: Fresnel + diffuse-ray awareness
   *
   * @param frontColor     Color of the leaf's front surface
   * @param backColor      Color when back-lit (typically lighter / warmer)
   * @param transmission   How much light passes through the leaf (0-1)
   * @returns              Registered mix shader ID
   */
  createFoliageMaterial(
    frontColor: THREE.Color = new THREE.Color(0.05, 0.25, 0.02),
    backColor: THREE.Color = new THREE.Color(0.2, 0.55, 0.1),
    transmission: number = 0.3,
  ): string {
    // Shader A: front-facing leaf surface
    const shaderA = createDefaultShaderOutput();
    shaderA.color.copy(frontColor);
    shaderA.metalness = 0.0;
    shaderA.roughness = 0.7;
    shaderA.transmission = 0.0;
    shaderA.subsurfaceWeight = 0.4;
    shaderA.subsurfaceRadius.set(0.5, 1.0, 0.3);
    shaderA.specular = 0.2;
    shaderA.sheen = 0.1;

    // Shader B: back-lit subsurface glow
    const shaderB = createDefaultShaderOutput();
    shaderB.color.copy(backColor);
    shaderB.metalness = 0.0;
    shaderB.roughness = 0.8;
    shaderB.transmission = transmission;
    shaderB.subsurfaceWeight = 0.8;
    shaderB.subsurfaceRadius.set(1.0, 2.0, 0.5);
    shaderB.emissionColor.copy(backColor).multiplyScalar(0.1);
    shaderB.emissionStrength = 0.3;
    shaderB.specular = 0.1;

    // Use Fresnel to enhance the rim/edge translucency
    const fresnel = new FresnelNode(1.45);
    const mixNode = new MixShaderNode(0.3, 'MIX');

    return this.registerMixShader(
      'Foliage Material',
      mixNode,
      shaderA,
      shaderB,
      'fresnel',
      undefined,
      fresnel,
    );
  }

  /**
   * Clear all registered mix shaders.
   */
  clear(): void {
    this._registry.clear();
  }

  /**
   * Number of registered mix shaders.
   */
  get size(): number {
    return this._registry.size;
  }
}

// ============================================================================
// Module-level singleton for convenience
// ============================================================================

/** Shared default instance of the shader mixing system */
export const shaderMixingSystem = new ShaderMixingSystem();
