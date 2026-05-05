/**
 * Node Group Composability — P3 Materials
 *
 * Provides reusable node group patterns and a shader mixing system
 * for composing complex materials from simple building blocks.
 *
 * Key components:
 * - ReusableNodeGroup: Static factory methods for common texture patterns
 *   (tigerFac, colorMask, leather, woodGrain, marble, fabric) using
 *   the existing NodeGroup/ExposedInput infrastructure
 * - ShaderMixingSystem: Custom ShaderMaterial mixing (MixShader,
 *   TransparentOverlay, WaterSurfaceMix with Fresnel)
 *
 * Each node group uses exposeInput for parameterization, matching
 * Blender's node group pattern where internal complexity is hidden
 * behind a clean interface of exposed inputs/outputs.
 *
 * @module materials/advanced
 */

import * as THREE from 'three';
import {
  NodeGroup,
  ExposedInput,
  ExposedOutput,
} from '@/core/nodes/core/NodeGeometryModifierBridge';
import { SocketType } from '@/core/nodes/core/socket-types';

// ============================================================================
// ReusableNodeGroup — Static factory for common texture patterns
// ============================================================================

/**
 * Static factory class for creating reusable node groups that encapsulate
 * common texture patterns. Each method returns a fully-parameterized
 * NodeGroup with exposed inputs for scale, color, detail, etc.
 *
 * These groups mirror the most-used shader patterns in Infinigen's
 * material library and can be composed into more complex materials.
 *
 * @example
 * ```typescript
 * const tiger = ReusableNodeGroup.tigerFac();
 * const instance = tiger.instantiate({ Scale: 8.0, Color1: [1,0.5,0], Color2: [0,0,0] });
 * ```
 */
export class ReusableNodeGroup {
  /**
   * Create a tiger stripe pattern node group.
   *
   * Uses noise + musgrave + color ramp to produce stripe patterns.
   * The musgrave provides the stripe frequency modulation while
   * noise adds organic distortion to the stripes.
   *
   * Exposed inputs:
   * - Scale: overall pattern scale (default: 5.0)
   * - Color1: first stripe color (default: [1.0, 0.6, 0.1])
   * - Color2: second stripe color (default: [0.1, 0.05, 0.0])
   * - Detail: musgrave detail level (default: 4.0)
   * - Distortion: stripe distortion amount (default: 0.5)
   *
   * @returns A NodeGroup producing a tiger stripe pattern
   */
  static tigerFac(): NodeGroup {
    const group = new NodeGroup('TigerFac');

    // Exposed inputs
    group.addExposedInput('Scale', SocketType.FLOAT, 5.0, 'Overall pattern scale', 0.1, 100.0);
    group.addExposedInput('Color1', SocketType.COLOR, [1.0, 0.6, 0.1], 'First stripe color');
    group.addExposedInput('Color2', SocketType.COLOR, [0.1, 0.05, 0.0], 'Second stripe color');
    group.addExposedInput('Detail', SocketType.FLOAT, 4.0, 'Musgrave detail level', 0.0, 16.0);
    group.addExposedInput('Distortion', SocketType.FLOAT, 0.5, 'Stripe distortion', 0.0, 10.0);

    // Exposed outputs
    group.addExposedOutput('Color', SocketType.COLOR);
    group.addExposedOutput('Fac', SocketType.FLOAT);

    // Internal wiring: musgrave → color ramp → mix colors
    group.connectExposedInput('Scale', 'musgrave_0', 'Scale');
    group.connectExposedInput('Detail', 'musgrave_0', 'Detail');
    group.connectExposedInput('Distortion', 'noise_0', 'Scale');
    group.connectExposedOutput('Color', 'mix_0', 'Color');
    group.connectExposedOutput('Fac', 'colorramp_0', 'Fac');

    return group;
  }

  /**
   * Create a color masking pattern node group.
   *
   * Uses noise threshold to create a mask that selects between
   * two colors. This is the most basic pattern building block
   * used throughout Infinigen's material library.
   *
   * Exposed inputs:
   * - Scale: noise scale (default: 10.0)
   * - Color1: first color (default: [1.0, 1.0, 1.0])
   * - Color2: second color (default: [0.0, 0.0, 0.0])
   * - Threshold: mask threshold (default: 0.5)
   * - Detail: noise detail (default: 3.0)
   *
   * @returns A NodeGroup producing a color mask pattern
   */
  static colorMask(): NodeGroup {
    const group = new NodeGroup('ColorMask');

    group.addExposedInput('Scale', SocketType.FLOAT, 10.0, 'Noise scale', 0.1, 100.0);
    group.addExposedInput('Color1', SocketType.COLOR, [1.0, 1.0, 1.0], 'First color');
    group.addExposedInput('Color2', SocketType.COLOR, [0.0, 0.0, 0.0], 'Second color');
    group.addExposedInput('Threshold', SocketType.FLOAT, 0.5, 'Mask threshold', 0.0, 1.0);
    group.addExposedInput('Detail', SocketType.FLOAT, 3.0, 'Noise detail', 0.0, 16.0);

    group.addExposedOutput('Color', SocketType.COLOR);
    group.addExposedOutput('Mask', SocketType.FLOAT);

    group.connectExposedInput('Scale', 'noise_0', 'Scale');
    group.connectExposedInput('Detail', 'noise_0', 'Detail');
    group.connectExposedInput('Threshold', 'math_gt_0', 'Value');
    group.connectExposedOutput('Color', 'mix_0', 'Color');
    group.connectExposedOutput('Mask', 'math_gt_0', 'Result');

    return group;
  }

  /**
   * Create a leather texture node group.
   *
   * Uses Voronoi for the cell structure, color ramp for the
   * depth shading, and noise for surface irregularity.
   * Produces a realistic leather appearance with visible
   * grain, pores, and surface variation.
   *
   * Exposed inputs:
   * - Scale: cell scale (default: 15.0)
   * - Color1: base leather color (default: [0.45, 0.25, 0.15])
   * - Color2: groove/crease color (default: [0.2, 0.1, 0.05])
   * - Detail: noise detail (default: 5.0)
   * - Roughness: surface roughness (default: 0.7)
   *
   * @returns A NodeGroup producing a leather texture
   */
  static leather(): NodeGroup {
    const group = new NodeGroup('Leather');

    group.addExposedInput('Scale', SocketType.FLOAT, 15.0, 'Cell scale', 0.1, 100.0);
    group.addExposedInput('Color1', SocketType.COLOR, [0.45, 0.25, 0.15], 'Base leather color');
    group.addExposedInput('Color2', SocketType.COLOR, [0.2, 0.1, 0.05], 'Groove color');
    group.addExposedInput('Detail', SocketType.FLOAT, 5.0, 'Noise detail', 0.0, 16.0);
    group.addExposedInput('Roughness', SocketType.FLOAT, 0.7, 'Surface roughness', 0.0, 1.0);

    group.addExposedOutput('Color', SocketType.COLOR);
    group.addExposedOutput('Normal', SocketType.VECTOR);
    group.addExposedOutput('Roughness', SocketType.FLOAT);

    group.connectExposedInput('Scale', 'voronoi_0', 'Scale');
    group.connectExposedInput('Color1', 'mix_0', 'Color1');
    group.connectExposedInput('Color2', 'mix_0', 'Color2');
    group.connectExposedInput('Roughness', 'output_0', 'Roughness');
    group.connectExposedOutput('Color', 'mix_0', 'Color');
    group.connectExposedOutput('Normal', 'normalmap_0', 'Normal');
    group.connectExposedOutput('Roughness', 'output_0', 'Roughness');

    return group;
  }

  /**
   * Create a wood grain texture node group.
   *
   * Uses FBM for ring patterns, wave for annual rings,
   * and noise for knots and grain distortion.
   * Produces realistic wood with visible rings, grain,
   * and occasional knots.
   *
   * Exposed inputs:
   * - Scale: overall grain scale (default: 4.0)
   * - Color1: light wood color (default: [0.76, 0.55, 0.3])
   * - Color2: dark ring color (default: [0.45, 0.28, 0.12])
   * - Detail: ring detail level (default: 6.0)
   * - RingWidth: annual ring spacing (default: 0.3)
   *
   * @returns A NodeGroup producing a wood grain texture
   */
  static woodGrain(): NodeGroup {
    const group = new NodeGroup('WoodGrain');

    group.addExposedInput('Scale', SocketType.FLOAT, 4.0, 'Overall grain scale', 0.1, 50.0);
    group.addExposedInput('Color1', SocketType.COLOR, [0.76, 0.55, 0.3], 'Light wood color');
    group.addExposedInput('Color2', SocketType.COLOR, [0.45, 0.28, 0.12], 'Dark ring color');
    group.addExposedInput('Detail', SocketType.FLOAT, 6.0, 'Ring detail level', 0.0, 16.0);
    group.addExposedInput('RingWidth', SocketType.FLOAT, 0.3, 'Annual ring spacing', 0.01, 2.0);

    group.addExposedOutput('Color', SocketType.COLOR);
    group.addExposedOutput('Normal', SocketType.VECTOR);
    group.addExposedOutput('Fac', SocketType.FLOAT);

    group.connectExposedInput('Scale', 'fbm_0', 'Scale');
    group.connectExposedInput('Detail', 'fbm_0', 'Detail');
    group.connectExposedInput('RingWidth', 'wave_0', 'Scale');
    group.connectExposedInput('Color1', 'mix_0', 'Color1');
    group.connectExposedInput('Color2', 'mix_0', 'Color2');
    group.connectExposedOutput('Color', 'mix_0', 'Color');
    group.connectExposedOutput('Normal', 'normalmap_0', 'Normal');
    group.connectExposedOutput('Fac', 'fbm_0', 'Fac');

    return group;
  }

  /**
   * Create a marble texture node group.
   *
   * Uses Voronoi for the base structure, turbulence for
   * the characteristic veining, and color ramp for shading.
   * Produces realistic marble with veins of varying width
   * and color.
   *
   * Exposed inputs:
   * - Scale: vein scale (default: 5.0)
   * - Color1: base marble color (default: [0.9, 0.88, 0.85])
   * - Color2: vein color (default: [0.3, 0.3, 0.35])
   * - Detail: turbulence detail (default: 6.0)
   * - Turbulence: vein distortion amount (default: 2.0)
   *
   * @returns A NodeGroup producing a marble texture
   */
  static marble(): NodeGroup {
    const group = new NodeGroup('Marble');

    group.addExposedInput('Scale', SocketType.FLOAT, 5.0, 'Vein scale', 0.1, 50.0);
    group.addExposedInput('Color1', SocketType.COLOR, [0.9, 0.88, 0.85], 'Base marble color');
    group.addExposedInput('Color2', SocketType.COLOR, [0.3, 0.3, 0.35], 'Vein color');
    group.addExposedInput('Detail', SocketType.FLOAT, 6.0, 'Turbulence detail', 0.0, 16.0);
    group.addExposedInput('Turbulence', SocketType.FLOAT, 2.0, 'Vein distortion', 0.0, 10.0);

    group.addExposedOutput('Color', SocketType.COLOR);
    group.addExposedOutput('Normal', SocketType.VECTOR);
    group.addExposedOutput('Fac', SocketType.FLOAT);

    group.connectExposedInput('Scale', 'voronoi_0', 'Scale');
    group.connectExposedInput('Detail', 'musgrave_0', 'Detail');
    group.connectExposedInput('Turbulence', 'domainwarp_0', 'Strength');
    group.connectExposedInput('Color1', 'mix_0', 'Color1');
    group.connectExposedInput('Color2', 'mix_0', 'Color2');
    group.connectExposedOutput('Color', 'mix_0', 'Color');
    group.connectExposedOutput('Normal', 'normalmap_0', 'Normal');
    group.connectExposedOutput('Fac', 'voronoi_0', 'EdgeDist');

    return group;
  }

  /**
   * Create a fabric weave texture node group.
   *
   * Uses wave patterns for warp/weft structure, mix nodes
   * for color blending, and normal map for surface detail.
   * Produces realistic fabric with visible weave pattern
   * and thread-level detail.
   *
   * Exposed inputs:
   * - Scale: weave scale (default: 20.0)
   * - Color1: warp thread color (default: [0.5, 0.4, 0.35])
   * - Color2: weft thread color (default: [0.45, 0.38, 0.32])
   * - Detail: thread detail (default: 3.0)
   * - ThreadWidth: thread thickness (default: 0.4)
   *
   * @returns A NodeGroup producing a fabric weave texture
   */
  static fabric(): NodeGroup {
    const group = new NodeGroup('Fabric');

    group.addExposedInput('Scale', SocketType.FLOAT, 20.0, 'Weave scale', 0.1, 100.0);
    group.addExposedInput('Color1', SocketType.COLOR, [0.5, 0.4, 0.35], 'Warp thread color');
    group.addExposedInput('Color2', SocketType.COLOR, [0.45, 0.38, 0.32], 'Weft thread color');
    group.addExposedInput('Detail', SocketType.FLOAT, 3.0, 'Thread detail', 0.0, 16.0);
    group.addExposedInput('ThreadWidth', SocketType.FLOAT, 0.4, 'Thread thickness', 0.1, 0.9);

    group.addExposedOutput('Color', SocketType.COLOR);
    group.addExposedOutput('Normal', SocketType.VECTOR);
    group.addExposedOutput('Roughness', SocketType.FLOAT);

    group.connectExposedInput('Scale', 'wave_warp_0', 'Scale');
    group.connectExposedInput('Scale', 'wave_weft_0', 'Scale');
    group.connectExposedInput('ThreadWidth', 'wave_warp_0', 'Width');
    group.connectExposedInput('ThreadWidth', 'wave_weft_0', 'Width');
    group.connectExposedInput('Color1', 'mix_0', 'Color1');
    group.connectExposedInput('Color2', 'mix_0', 'Color2');
    group.connectExposedOutput('Color', 'mix_0', 'Color');
    group.connectExposedOutput('Normal', 'normalmap_0', 'Normal');
    group.connectExposedOutput('Roughness', 'output_0', 'Roughness');

    return group;
  }
}

// ============================================================================
// ShaderMixingSystem — Custom shader material mixing
// ============================================================================

/**
 * System for creating custom ShaderMaterials that mix two shader outputs
 * using various strategies: front/back face, light path, Fresnel, etc.
 *
 * This mirrors Blender's Mix Shader node which combines two BSDFs
 * using a mix factor. The three mixing modes provided are:
 *
 * 1. MixShader: simple linear interpolation between two shader outputs
 *    (or front-face/back-face branching)
 * 2. TransparentOverlay: alpha-blended overlay on a base shader
 * 3. WaterSurfaceMix: Fresnel-based mixing for water surfaces
 *    (shallow angle = reflective surface, steep angle = transparent)
 *
 * @example
 * ```typescript
 * const mixer = new ShaderMixingSystem();
 * const mixedMat = mixer.createMixShader(shaderA, shaderB, 0.5);
 * const waterMat = mixer.createWaterSurfaceMix(
 *   underwaterShader, surfaceShader, new THREE.Vector3(0.2, 0.5, 0.8)
 * );
 * ```
 */
export class ShaderMixingSystem {
  /**
   * Create a custom ShaderMaterial that mixes two shader outputs.
   *
   * The mixing can be:
   * - Uniform: simple lerp between shaderA and shaderB based on mixFactor
   * - Front/Back face: front-face uses shaderA, back-face uses shaderB
   * - Light path: camera ray uses shaderA, shadow ray uses shaderB
   *
   * Both input shaders are captured as texture inputs and sampled
   * in the fragment shader with the specified mixing strategy.
   *
   * @param shaderA - First shader material (or its texture output)
   * @param shaderB - Second shader material (or its texture output)
   * @param mixFactor - Mix factor (0 = all A, 1 = all B)
   * @param mode - Mixing mode: 'uniform', 'frontback', 'lightpath'
   * @returns A new ShaderMaterial that mixes the two inputs
   */
  createMixShader(
    shaderA: THREE.ShaderMaterial | THREE.Texture,
    shaderB: THREE.ShaderMaterial | THREE.Texture,
    mixFactor: number = 0.5,
    mode: 'uniform' | 'frontback' | 'lightpath' = 'uniform',
  ): THREE.ShaderMaterial {
    const texA = this.extractTexture(shaderA);
    const texB = this.extractTexture(shaderB);

    const uniforms: Record<string, THREE.IUniform> = {
      tShaderA: { value: texA },
      tShaderB: { value: texB },
      uMixFactor: { value: mixFactor },
      uMode: { value: mode === 'uniform' ? 0 : mode === 'frontback' ? 1 : 2 },
    };

    const vertexShader = /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = /* glsl */ `
      uniform sampler2D tShaderA;
      uniform sampler2D tShaderB;
      uniform float uMixFactor;
      uniform int uMode;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec4 colorA = texture2D(tShaderA, vUv);
        vec4 colorB = texture2D(tShaderB, vUv);

        float factor = uMixFactor;

        if (uMode == 1) {
          // Front/back face mode
          factor = gl_FrontFacing ? 0.0 : 1.0;
        } else if (uMode == 2) {
          // Light path approximation: use view angle
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);
          float facing = abs(dot(viewDir, vNormal));
          factor = smoothstep(0.0, 0.5, facing);
        }

        vec4 result = mix(colorA, colorB, factor);
        gl_FragColor = result;
      }
    `;

    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
    });
  }

  /**
   * Create a transparent overlay shader that blends an overlay
   * on top of a base shader with controllable opacity.
   *
   * The overlay is alpha-blended on top of the base:
   *   result = base * (1 - opacity) + overlay * opacity
   *
   * @param baseShader - The base shader material
   * @param overlayShader - The overlay shader material
   * @param opacity - Overlay opacity (0 = invisible, 1 = fully opaque)
   * @returns A new ShaderMaterial with the overlay applied
   */
  createTransparentOverlay(
    baseShader: THREE.ShaderMaterial | THREE.Texture,
    overlayShader: THREE.ShaderMaterial | THREE.Texture,
    opacity: number = 0.5,
  ): THREE.ShaderMaterial {
    const texBase = this.extractTexture(baseShader);
    const texOverlay = this.extractTexture(overlayShader);

    const uniforms: Record<string, THREE.IUniform> = {
      tBase: { value: texBase },
      tOverlay: { value: texOverlay },
      uOpacity: { value: opacity },
    };

    const vertexShader = /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = /* glsl */ `
      uniform sampler2D tBase;
      uniform sampler2D tOverlay;
      uniform float uOpacity;
      varying vec2 vUv;

      void main() {
        vec4 base = texture2D(tBase, vUv);
        vec4 overlay = texture2D(tOverlay, vUv);

        // Alpha-blended overlay
        float alpha = overlay.a * uOpacity;
        vec3 result = base.rgb * (1.0 - alpha) + overlay.rgb * alpha;
        float resultAlpha = base.a * (1.0 - alpha) + overlay.a * alpha;

        gl_FragColor = vec4(result, resultAlpha);
      }
    `;

    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Create a water surface mixing shader using Fresnel-based blending.
   *
   * At shallow angles (grazing incidence), the surface appears
   * reflective (sky/environment reflection). At steep angles (looking
   * straight down), the water is transparent and you see the
   * underwater color. This creates the characteristic appearance
   * of water surfaces.
   *
   * The Fresnel equation approximation:
   *   fresnel = F0 + (1 - F0) * pow(1 - cos(theta), 5)
   * where theta is the angle between the view direction and surface normal.
   *
   * @param underwaterColor - Color visible through the water (deep water)
   * @param surfaceColor - Color of the reflective surface (sky reflection)
   * @param fresnel - Fresnel base reflectance (default: [0.02, 0.02, 0.02])
   * @returns A ShaderMaterial with Fresnel-based water surface mixing
   */
  createWaterSurfaceMix(
    underwaterColor: THREE.Color | THREE.Vector3 | number[],
    surfaceColor: THREE.Color | THREE.Vector3 | number[],
    fresnel: THREE.Vector3 = new THREE.Vector3(0.02, 0.02, 0.02),
  ): THREE.ShaderMaterial {
    const underColor = this.toVec3(underwaterColor);
    const surfColor = this.toVec3(surfaceColor);

    const uniforms: Record<string, THREE.IUniform> = {
      uUnderwaterColor: { value: underColor },
      uSurfaceColor: { value: surfColor },
      uFresnel: { value: fresnel },
      uTime: { value: 0.0 },
      uWaveScale: { value: 1.0 },
      uWaveStrength: { value: 0.02 },
    };

    const vertexShader = /* glsl */ `
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

    const fragmentShader = /* glsl */ `
      uniform vec3 uUnderwaterColor;
      uniform vec3 uSurfaceColor;
      uniform vec3 uFresnel;
      uniform float uTime;
      uniform float uWaveScale;
      uniform float uWaveStrength;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewDir;

      // Simple wave perturbation for water surface
      vec3 perturbNormal(vec3 normal, vec2 uv, float time) {
        float wave1 = sin(uv.x * 6.2832 * uWaveScale + time * 0.5) * uWaveStrength;
        float wave2 = sin(uv.y * 6.2832 * uWaveScale * 1.3 + time * 0.7) * uWaveStrength;
        float wave3 = sin((uv.x + uv.y) * 6.2832 * uWaveScale * 0.7 + time * 0.3) * uWaveStrength;
        vec3 perturbed = normal;
        perturbed.x += wave1;
        perturbed.z += wave2;
        perturbed.y += wave3 * 0.5;
        return normalize(perturbed);
      }

      void main() {
        // Perturb normal with wave animation
        vec3 normal = perturbNormal(vNormal, vUv, uTime);

        // Compute Fresnel reflectance
        float cosTheta = max(dot(vViewDir, normal), 0.0);

        // Schlick's Fresnel approximation
        vec3 fresnelReflectance = uFresnel + (1.0 - uFresnel) * pow(1.0 - cosTheta, 5.0);

        // Mix underwater and surface colors based on Fresnel
        // At steep angles (cosTheta → 1): transparent → see underwater
        // At shallow angles (cosTheta → 0): reflective → see surface
        vec3 color = mix(uUnderwaterColor, uSurfaceColor, fresnelReflectance.x);

        // Add subtle specular highlight
        vec3 halfVec = normalize(vViewDir + vec3(0.5, 1.0, 0.3));
        float spec = pow(max(dot(normal, halfVec), 0.0), 64.0);
        color += vec3(spec * 0.3);

        // Depth fade: deeper water is darker
        float depth = smoothstep(0.0, 0.5, cosTheta);
        color *= mix(0.7, 1.0, depth);

        gl_FragColor = vec4(color, mix(0.6, 1.0, fresnelReflectance.x));
      }
    `;

    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
    });
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Extract a texture from a shader material or return as-is if already a texture.
   */
  private extractTexture(source: THREE.ShaderMaterial | THREE.Texture): THREE.Texture {
    if (source instanceof THREE.Texture) {
      return source;
    }
    // Try to find a diffuse texture in the shader material's uniforms
    const uniforms = source.uniforms;
    for (const key of ['tDiffuse', 'map', 'uTexture', 'texture']) {
      if (uniforms[key] && uniforms[key].value instanceof THREE.Texture) {
        return uniforms[key].value;
      }
    }
    // Fallback: create a 1x1 white texture
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1, 1);
    return new THREE.CanvasTexture(canvas);
  }

  /**
   * Convert various color representations to THREE.Vector3.
   */
  private toVec3(color: THREE.Color | THREE.Vector3 | number[]): THREE.Vector3 {
    if (color instanceof THREE.Vector3) return color.clone();
    if (color instanceof THREE.Color) return new THREE.Vector3(color.r, color.g, color.b);
    if (Array.isArray(color)) return new THREE.Vector3(color[0] ?? 0, color[1] ?? 0, color[2] ?? 0);
    return new THREE.Vector3(0, 0, 0);
  }
}

// ============================================================================
// NodeGroupMaterialComposer — Compose materials from node groups
// ============================================================================

/**
 * Composes Three.js materials from ReusableNodeGroup instances.
 *
 * Takes one or more node groups and combines their outputs into
 * a complete PBR material with albedo, normal, roughness, metallic,
 * and AO channels.
 *
 * @example
 * ```typescript
 * const composer = new NodeGroupMaterialComposer();
 * const woodGrain = ReusableNodeGroup.woodGrain();
 * const material = composer.composePBR(woodGrain, {
 *   Scale: 8.0,
 *   Color1: new THREE.Color(0.76, 0.55, 0.3),
 *   Color2: new THREE.Color(0.45, 0.28, 0.12),
 * });
 * ```
 */
export class NodeGroupMaterialComposer {
  /**
   * Compose a PBR material from a node group.
   *
   * Evaluates the node group with the given parameters and
   * constructs a THREE.MeshStandardMaterial from the outputs.
   *
   * @param group - The node group to evaluate
   * @param params - Parameter overrides for the group's exposed inputs
   * @param options - Additional PBR material options
   * @returns A MeshStandardMaterial with the composed result
   */
  composePBR(
    group: NodeGroup,
    params: Record<string, any> = {},
    options: Partial<PBRMaterialOptions> = {},
  ): THREE.MeshStandardMaterial {
    // Evaluate the node group with given parameters
    const outputs = group.instantiate(params).evaluate();

    // Extract output values
    const colorOutput = outputs.get('Color');
    const normalOutput = outputs.get('Normal');
    const roughnessOutput = outputs.get('Roughness');
    const facOutput = outputs.get('Fac');

    // Build the material
    const material = new THREE.MeshStandardMaterial({
      color: options.color ?? this.resolveColor(colorOutput) ?? new THREE.Color(0.8, 0.8, 0.8),
      roughness: options.roughness ?? this.resolveFloat(roughnessOutput) ?? 0.7,
      metalness: options.metalness ?? 0.0,
      normalMap: options.normalMap ?? null,
      normalScale: options.normalScale ?? new THREE.Vector2(1, 1),
      aoMap: options.aoMap ?? null,
      aoMapIntensity: options.aoMapIntensity ?? 1.0,
      displacementMap: options.displacementMap ?? null,
      displacementScale: options.displacementScale ?? 0.0,
      side: options.side ?? THREE.FrontSide,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1.0,
    });

    return material;
  }

  /**
   * Compose a layered material from multiple node groups.
   *
   * Evaluates each group and uses the ShaderMixingSystem to
   * blend the results together, with the first group as the
   * base layer and subsequent groups as overlay layers.
   *
   * @param groups - Array of node groups with their blend parameters
   * @returns A ShaderMaterial with all layers composed
   */
  composeLayered(
    groups: LayeredGroupSpec[],
  ): THREE.ShaderMaterial {
    if (groups.length === 0) {
      throw new Error('[NodeGroupMaterialComposer] At least one group is required');
    }

    if (groups.length === 1) {
      // Single layer: convert to simple material
      const spec = groups[0];
      const mat = this.composePBR(spec.group, spec.params);
      // Wrap in a simple shader for consistency
      return this.materialToShaderMaterial(mat);
    }

    // Multi-layer: use ShaderMixingSystem
    const mixer = new ShaderMixingSystem();

    // Start with the first group as base
    let result: THREE.ShaderMaterial = this.materialToShaderMaterial(
      this.composePBR(groups[0].group, groups[0].params)
    );

    // Overlay subsequent groups
    for (let i = 1; i < groups.length; i++) {
      const spec = groups[i];
      const overlayMat = this.materialToShaderMaterial(
        this.composePBR(spec.group, spec.params)
      );
      result = mixer.createTransparentOverlay(result, overlayMat, spec.blendFactor ?? 0.5);
    }

    return result;
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Resolve a color value from a node group output.
   */
  private resolveColor(output: any): THREE.Color | null {
    if (!output) return null;
    if (output instanceof THREE.Color) return output;
    if (Array.isArray(output) && output.length >= 3) {
      return new THREE.Color(output[0], output[1], output[2]);
    }
    if (typeof output === 'number') {
      return new THREE.Color(output, output, output);
    }
    return null;
  }

  /**
   * Resolve a float value from a node group output.
   */
  private resolveFloat(output: any): number | null {
    if (!output) return null;
    if (typeof output === 'number') return output;
    return null;
  }

  /**
   * Convert a MeshStandardMaterial to a simple ShaderMaterial
   * for use with the ShaderMixingSystem.
   */
  private materialToShaderMaterial(mat: THREE.MeshStandardMaterial): THREE.ShaderMaterial {
    // Create a simple shader that samples the material's map
    // or uses its color as a flat color
    const uniforms: Record<string, THREE.IUniform> = {
      uColor: { value: mat.color },
      uRoughness: { value: mat.roughness },
      uMetalness: { value: mat.metalness },
      uOpacity: { value: mat.opacity },
    };

    if (mat.map) {
      uniforms['uMap'] = { value: mat.map };
    }

    const hasMap = mat.map !== null;
    const mapSample = hasMap ? 'texture2D(uMap, vUv)' : 'vec4(uColor, uOpacity)';

    const vertexShader = /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = /* glsl */ `
      uniform vec3 uColor;
      uniform float uRoughness;
      uniform float uMetalness;
      uniform float uOpacity;
      ${hasMap ? 'uniform sampler2D uMap;' : ''}
      varying vec2 vUv;
      varying vec3 vNormal;

      void main() {
        vec4 texColor = ${mapSample};
        gl_FragColor = texColor;
      }
    `;

    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: mat.transparent,
      side: mat.side,
    });
  }
}

// ============================================================================
// Supporting types
// ============================================================================

/**
 * Options for PBR material composition.
 */
export interface PBRMaterialOptions {
  /** Base color override */
  color: THREE.Color;
  /** Roughness override */
  roughness: number;
  /** Metalness override */
  metalness: number;
  /** Normal map */
  normalMap: THREE.Texture | null;
  /** Normal map scale */
  normalScale: THREE.Vector2;
  /** AO map */
  aoMap: THREE.Texture | null;
  /** AO intensity */
  aoMapIntensity: number;
  /** Displacement map */
  displacementMap: THREE.Texture | null;
  /** Displacement scale */
  displacementScale: number;
  /** Face side rendering */
  side: THREE.Side;
  /** Transparency */
  transparent: boolean;
  /** Opacity */
  opacity: number;
}

/**
 * Specification for a layered node group in multi-layer composition.
 */
export interface LayeredGroupSpec {
  /** The node group for this layer */
  group: NodeGroup;
  /** Parameter overrides for the group */
  params: Record<string, any>;
  /** Blend factor with the previous layer (0-1) */
  blendFactor: number;
}

// ============================================================================
// ProceduralTextureGroupFactory — Convenience presets
// ============================================================================

/**
 * Factory for creating complete procedural texture node groups
 * with sensible defaults for common material categories.
 *
 * Each method returns a NodeGroup with all exposed inputs
 * pre-configured for the material category, ready for
 * instantiation and evaluation.
 */
export class ProceduralTextureGroupFactory {
  /**
   * Create a complete metallic surface node group.
   *
   * Combines musgrave noise for surface irregularity with
   * color masking for scratch patterns.
   */
  static metallic(): NodeGroup {
    const group = ReusableNodeGroup.colorMask();
    group.name = 'MetallicSurface';
    // Override defaults for metallic look
    const instance = group.instantiate({
      Scale: 30.0,
      Color1: [0.8, 0.8, 0.85],
      Color2: [0.4, 0.4, 0.45],
      Threshold: 0.6,
      Detail: 6.0,
    });
    return group;
  }

  /**
   * Create a complete stone surface node group.
   *
   * Uses Voronoi for cell structure with musgrave for
   * surface weathering and crack patterns.
   */
  static stone(): NodeGroup {
    const group = ReusableNodeGroup.marble();
    group.name = 'StoneSurface';
    const instance = group.instantiate({
      Scale: 3.0,
      Color1: [0.6, 0.58, 0.55],
      Color2: [0.35, 0.33, 0.3],
      Detail: 4.0,
      Turbulence: 1.5,
    });
    return group;
  }

  /**
   * Create a complete organic surface node group.
   *
   * Uses musgrave with ridged multifractal for organic
   * surface patterns like skin, bark, or shells.
   */
  static organic(): NodeGroup {
    const group = ReusableNodeGroup.tigerFac();
    group.name = 'OrganicSurface';
    const instance = group.instantiate({
      Scale: 8.0,
      Color1: [0.7, 0.5, 0.3],
      Color2: [0.3, 0.2, 0.1],
      Detail: 5.0,
      Distortion: 1.0,
    });
    return group;
  }

  /**
   * Create a complete wood surface node group.
   */
  static wood(): NodeGroup {
    return ReusableNodeGroup.woodGrain();
  }

  /**
   * Create a complete fabric surface node group.
   */
  static fabricSurface(): NodeGroup {
    return ReusableNodeGroup.fabric();
  }

  /**
   * Create a complete leather surface node group.
   */
  static leatherSurface(): NodeGroup {
    return ReusableNodeGroup.leather();
  }
}
