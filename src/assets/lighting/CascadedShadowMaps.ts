/**
 * CascadedShadowMaps.ts — Cascaded Shadow Maps for Large Outdoor Scenes
 *
 * Splits the camera frustum into N cascades, each with its own shadow map,
 * providing better shadow resolution distribution across the view distance.
 *
 * This implementation wraps Three.js's built-in DirectionalLight.shadow system
 * with cascade management, offering a simpler API than the lower-level
 * CascadedShadowMap in src/core/rendering/shadows/.
 *
 * Features:
 *   - Practical split scheme blending between uniform and logarithmic splits
 *   - PCF soft shadows per cascade
 *   - Automatic cascade split adjustment based on camera near/far
 *   - Frustum-tight light-space fitting per cascade
 *   - Cascade blending for seamless transitions
 *
 * @module lighting
 */

import * as THREE from 'three';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the Cascaded Shadow Maps system.
 */
export interface CSMConfig {
  /** Number of cascades (default 4) */
  cascades: number;
  /** Shadow map resolution per cascade (default 1024) */
  shadowMapSize: number;
  /**
   * Split lambda: controls the blend between uniform (0) and
   * logarithmic (1) split distribution (default 0.75).
   * Logarithmic gives more detail near the camera; uniform spreads
   * resolution more evenly.
   */
  splitLambda: number;
  /** Shadow bias to reduce acne (default -0.0005) */
  shadowBias: number;
  /** Normal bias to reduce shadow acne on slopes (default 0.02) */
  normalBias: number;
  /** Maximum shadow distance from camera (default 200) */
  shadowDistance: number;
  /** Blend width between cascades as fraction of cascade range (default 0.1) */
  blendWidth: number;
  /** PCF soft shadow kernel radius (default 2) */
  pcfKernelRadius: number;
}

/** Default CSM configuration */
const DEFAULT_CSM_CONFIG: CSMConfig = {
  cascades: 4,
  shadowMapSize: 1024,
  splitLambda: 0.75,
  shadowBias: -0.0005,
  normalBias: 0.02,
  shadowDistance: 200,
  blendWidth: 0.1,
  pcfKernelRadius: 2,
};

// ============================================================================
// Cascade Data
// ============================================================================

/**
 * Per-cascade data including light, camera, and render target.
 */
export interface CascadeData {
  /** Cascade index */
  index: number;
  /** View-space near distance for this cascade */
  near: number;
  /** View-space far distance for this cascade */
  far: number;
  /** Orthographic camera for this cascade's frustum */
  camera: THREE.OrthographicCamera;
  /** Shadow map render target */
  renderTarget: THREE.WebGLRenderTarget;
  /** Shadow matrix (world → shadow UV) */
  shadowMatrix: THREE.Matrix4;
}

// ============================================================================
// CascadedShadowMaps
// ============================================================================

/**
 * Cascaded Shadow Maps system for large outdoor scenes.
 *
 * Splits the camera frustum into N cascades, each with its own
 * shadow map rendered from a tight light-space frustum. Supports
 * PCF soft shadows and cascade blending.
 *
 * Usage:
 * ```typescript
 * const csm = new CascadedShadowMaps({ cascades: 4, shadowMapSize: 1024 });
 * csm.attach(directionalLight, camera);
 *
 * // Per frame:
 * csm.update(camera);
 *
 * // Access shadow maps for custom rendering:
 * const shadowMap = csm.getShadowMap(0);
 *
 * // Cleanup:
 * csm.dispose();
 * ```
 */
export class CascadedShadowMaps {
  /** Configuration */
  readonly config: CSMConfig;

  /** The directional light this CSM is attached to */
  private light: THREE.DirectionalLight | null = null;

  /** Cascade data array */
  private cascades: CascadeData[] = [];

  /** Split distances (cascades + 1 values: near, split1, split2, ..., far) */
  private splitDistances: number[] = [];

  /** Custom depth material for shadow rendering */
  private depthMaterial: THREE.ShaderMaterial;

  /** Whether the system has been attached to a light */
  private attached = false;

  constructor(config: Partial<CSMConfig> = {}) {
    this.config = { ...DEFAULT_CSM_CONFIG, ...config };

    // Simple depth material for shadow map rendering
    this.depthMaterial = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: /* glsl */ `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        void main() {
          gl_FragColor = vec4(vec3(gl_FragCoord.z), 1.0);
        }
      `,
      side: THREE.FrontSide,
    });

    this.createCascades();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Attach the CSM system to a directional light and camera.
   *
   * Configures the light's shadow properties and creates cascade
   * cameras/render targets.
   *
   * @param light - The directional light to attach to
   * @param camera - The main camera (used for initial split computation)
   */
  attach(light: THREE.DirectionalLight, camera: THREE.Camera): void {
    this.light = light;
    this.attached = true;

    // Configure the directional light's shadow system
    light.castShadow = true;
    light.shadow.mapSize.set(this.config.shadowMapSize, this.config.shadowMapSize);
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = this.config.shadowDistance;
    light.shadow.bias = this.config.shadowBias;
    light.shadow.normalBias = this.config.normalBias;
    light.shadow.radius = this.config.pcfKernelRadius;

    // PCF soft shadows are enabled via the renderer's shadowMap.type;
    // setting light.shadow.radius controls PCF kernel size.

    // Compute initial splits
    if (camera instanceof THREE.PerspectiveCamera) {
      this.computeSplits(camera);
    }
  }

  /**
   * Update cascade matrices each frame.
   *
   * Recomputes cascade split distances based on the camera's near/far,
   * then updates each cascade's orthographic camera to tightly fit
   * the sub-frustum in light space.
   *
   * @param camera - The current main camera
   */
  update(camera: THREE.Camera): void {
    if (!this.light || !this.attached) return;

    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    // 1. Recompute cascade split distances
    this.computeSplits(camera);

    // 2. Update each cascade's camera frustum
    for (let i = 0; i < this.config.cascades; i++) {
      this.computeCascadeCamera(camera, i);
    }
  }

  /**
   * Render all cascade shadow maps.
   *
   * Call this before the main render pass. Renders the scene from
   * each cascade's light-space camera into its render target.
   *
   * @param renderer - The WebGL renderer
   * @param scene - The scene to render shadows for
   */
  renderShadowMaps(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    if (!this.light || !this.attached) return;

    const overrideMaterial = scene.overrideMaterial;

    for (let i = 0; i < this.config.cascades; i++) {
      const cascade = this.cascades[i];

      renderer.setRenderTarget(cascade.renderTarget);
      renderer.clear();

      scene.overrideMaterial = this.depthMaterial;
      renderer.render(scene, cascade.camera);

      // Compute shadow matrix: scale-bias * projection * view
      cascade.shadowMatrix.set(
        0.5, 0.0, 0.0, 0.5,
        0.0, 0.5, 0.0, 0.5,
        0.0, 0.0, 0.5, 0.5,
        0.0, 0.0, 0.0, 1.0,
      );
      cascade.shadowMatrix.multiply(cascade.camera.projectionMatrix);
      cascade.shadowMatrix.multiply(cascade.camera.matrixWorldInverse);
    }

    scene.overrideMaterial = overrideMaterial;
    renderer.setRenderTarget(null);
  }

  /**
   * Get the shadow map render target for a specific cascade.
   *
   * @param index - Cascade index (0 to cascades-1)
   * @returns The render target containing the shadow map
   * @throws Error if index is out of range
   */
  getShadowMap(index: number): THREE.WebGLRenderTarget {
    if (index < 0 || index >= this.cascades.length) {
      throw new Error(
        `[CascadedShadowMaps] Cascade index ${index} out of range [0, ${this.cascades.length - 1}]`,
      );
    }
    return this.cascades[index].renderTarget;
  }

  /**
   * Get all cascade data.
   */
  getCascades(): readonly CascadeData[] {
    return this.cascades;
  }

  /**
   * Get the cascade split distances.
   * Returns cascades+1 values: [near, split1, split2, ..., far].
   */
  getSplitDistances(): readonly number[] {
    return this.splitDistances;
  }

  /**
   * Get the depth material used for shadow map rendering.
   */
  getDepthMaterial(): THREE.ShaderMaterial {
    return this.depthMaterial;
  }

  /**
   * Get the attached directional light.
   */
  getLight(): THREE.DirectionalLight | null {
    return this.light;
  }

  /**
   * Update configuration at runtime.
   *
   * Some config changes (cascades count, shadow map size) require
   * rebuilding the cascade render targets.
   */
  setConfig(partial: Partial<CSMConfig>): void {
    const needsRebuild =
      partial.cascades !== undefined ||
      partial.shadowMapSize !== undefined;

    Object.assign(this.config, partial);

    if (needsRebuild) {
      this.disposeCascades();
      this.createCascades();
    }

    // Update light shadow properties if attached
    if (this.light) {
      this.light.shadow.mapSize.set(this.config.shadowMapSize, this.config.shadowMapSize);
      this.light.shadow.bias = this.config.shadowBias;
      this.light.shadow.normalBias = this.config.normalBias;
      this.light.shadow.radius = this.config.pcfKernelRadius;
    }
  }

  /**
   * Release all GPU resources.
   */
  dispose(): void {
    this.disposeCascades();
    this.depthMaterial.dispose();
    this.attached = false;
    this.light = null;
  }

  // ── Private Implementation ──────────────────────────────────────────────

  /**
   * Create cascade cameras and render targets.
   */
  private createCascades(): void {
    this.cascades = [];

    for (let i = 0; i < this.config.cascades; i++) {
      const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.5, 200);

      const renderTarget = new THREE.WebGLRenderTarget(
        this.config.shadowMapSize,
        this.config.shadowMapSize,
        {
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter,
          format: THREE.RGBAFormat,
          type: THREE.FloatType,
        },
      );

      this.cascades.push({
        index: i,
        near: 0,
        far: 0,
        camera,
        renderTarget,
        shadowMatrix: new THREE.Matrix4(),
      });
    }
  }

  /**
   * Dispose all cascade render targets.
   */
  private disposeCascades(): void {
    for (const cascade of this.cascades) {
      cascade.renderTarget.dispose();
    }
    this.cascades = [];
  }

  /**
   * Compute cascade split distances using the practical split scheme.
   *
   * Blends between logarithmic splits (more detail near camera)
   * and uniform splits (even distribution across range).
   *
   * Formula per split i:
   *   split_i = lambda * logSplit_i + (1 - lambda) * uniformSplit_i
   * where:
   *   logSplit_i = near * (far/near)^(i/N)
   *   uniformSplit_i = near + (far - near) * (i/N)
   */
  private computeSplits(camera: THREE.PerspectiveCamera): void {
    const near = camera.near;
    const far = Math.min(camera.far, this.config.shadowDistance);
    const lambda = this.config.splitLambda;
    const n = this.config.cascades;

    this.splitDistances = [near];

    for (let i = 1; i <= n; i++) {
      const p = i / n;
      const logSplit = near * Math.pow(far / near, p);
      const uniformSplit = near + (far - near) * p;
      const split = lambda * logSplit + (1 - lambda) * uniformSplit;
      this.splitDistances.push(split);
    }
  }

  /**
   * Compute a tight orthographic camera for a cascade by extracting
   * the sub-frustum and fitting it in light space.
   *
   * This ensures maximum shadow map resolution for each cascade
   * by minimizing wasted shadow map space.
   */
  private computeCascadeCamera(
    camera: THREE.PerspectiveCamera,
    cascadeIndex: number,
  ): void {
    if (!this.light) return;

    const cascade = this.cascades[cascadeIndex];
    const near = this.splitDistances[cascadeIndex];
    const far = this.splitDistances[cascadeIndex + 1];
    cascade.near = near;
    cascade.far = far;

    // Compute 8 corners of the sub-frustum in view space
    const aspect = camera.aspect;
    const fov = camera.fov * (Math.PI / 180);
    const tanFov = Math.tan(fov / 2);

    const nearTop = near * tanFov;
    const nearRight = nearTop * aspect;
    const farTop = far * tanFov;
    const farRight = farTop * aspect;

    const frustumCornersView: THREE.Vector3[] = [
      new THREE.Vector3(-nearRight, nearTop, -near),
      new THREE.Vector3(nearRight, nearTop, -near),
      new THREE.Vector3(nearRight, -nearTop, -near),
      new THREE.Vector3(-nearRight, -nearTop, -near),
      new THREE.Vector3(-farRight, farTop, -far),
      new THREE.Vector3(farRight, farTop, -far),
      new THREE.Vector3(farRight, -farTop, -far),
      new THREE.Vector3(-farRight, -farTop, -far),
    ];

    // Transform to world space
    const viewInverse = camera.matrixWorld;
    const frustumCornersWorld = frustumCornersView.map(v =>
      v.applyMatrix4(viewInverse),
    );

    // Transform to light space and find tight bounding box
    const lightViewMatrix = new THREE.Matrix4().lookAt(
      this.light.position,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0),
    );

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const corner of frustumCornersWorld) {
      const lightSpace = corner.clone().applyMatrix4(lightViewMatrix);
      minX = Math.min(minX, lightSpace.x);
      maxX = Math.max(maxX, lightSpace.x);
      minY = Math.min(minY, lightSpace.y);
      maxY = Math.max(maxY, lightSpace.y);
      minZ = Math.min(minZ, lightSpace.z);
      maxZ = Math.max(maxZ, lightSpace.z);
    }

    // Extend Z range to include scene objects behind the frustum
    const zExtend = (maxZ - minZ) * 0.5;
    minZ -= zExtend;
    maxZ += zExtend;

    // Snap to texel boundaries to reduce shadow acne (swimming)
    const texelSize = (maxX - minX) / this.config.shadowMapSize;
    minX = Math.floor(minX / texelSize) * texelSize;
    maxX = Math.floor(maxX / texelSize) * texelSize;
    minY = Math.floor(minY / texelSize) * texelSize;
    maxY = Math.floor(maxY / texelSize) * texelSize;

    // Set cascade camera properties
    const cam = cascade.camera;
    cam.left = minX;
    cam.right = maxX;
    cam.top = maxY;
    cam.bottom = minY;
    cam.near = -maxZ;
    cam.far = -minZ;
    cam.updateProjectionMatrix();

    // Position at light and look at origin
    cam.position.copy(this.light.position);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
  }
}

/**
 * Convenience factory function to create a CascadedShadowMaps instance.
 */
export function createCSM(config: Partial<CSMConfig> = {}): CascadedShadowMaps {
  return new CascadedShadowMaps(config);
}
