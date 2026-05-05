/**
 * Ground Truth Shaders for Infinigen R3F
 * 
 * Implements shader materials for generating ground truth render passes:
 * - Flat shading with random colors per instance
 * - Depth visualization
 * - Normal visualization
 * - Instance ID encoding
 * - Material ID encoding
 * - UV visualization
 * - Position encoding
 * 
 * Based on: infinigen/core/rendering/render.py (global_flat_shading, shader_random)
 * 
 * @module shaders
 */

import {
  ShaderMaterial,
  Color,
  Vector3,
  Matrix4,
  UniformsUtils,
  UniformsLib,
} from 'three';
import type { Camera } from 'three';
import { SeededRandom } from '../../util/MathUtils';

/**
 * Ground truth flat shading shader
 * Replaces all materials with random color per instance for clean segmentation
 */
export class GTFlatShadingMaterial extends ShaderMaterial {
  constructor(instanceId?: number) {
    const randomColor = instanceId !== undefined
      ? GTFlatShadingMaterial.generateRandomColor(instanceId)
      : new Color().setHSL(new SeededRandom(42).next(), 0.7, 0.5);

    super({
      uniforms: {
        instanceColor: { value: randomColor },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec2 vUv;
        
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 instanceColor;
        varying vec3 vWorldPosition;
        varying vec2 vUv;
        
        void main() {
          // Flat color based on instance
          gl_FragColor = vec4(instanceColor, 1.0);
        }
      `,
    });
  }

  /**
   * Generate deterministic random color from instance ID
   */
  private static generateRandomColor(instanceId: number): Color {
    // Use instance ID as seed for reproducible colors
    const hash = GTFlatShadingMaterial.hashInstanceId(instanceId);
    const h = (hash & 0xFF) / 255.0;
    const s = 0.5 + ((hash >> 8) & 0xFF) / 510.0; // 0.5-1.0
    const l = 0.4 + ((hash >> 16) & 0xFF) / 637.5; // 0.4-0.8
    
    return new Color().setHSL(h, s, l);
  }

  /**
   * Hash instance ID to get reproducible random value
   */
  private static hashInstanceId(id: number): number {
    let hash = id;
    hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
    hash = ((hash >> 16) ^ hash) * 0x85ebca6b;
    hash = (hash >> 16) ^ hash;
    return Math.abs(hash);
  }
}

/**
 * Ground truth depth shader
 * Outputs camera-space depth in meters
 */
export class GTDepthMaterial extends ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        near: { value: 0.1 },
        far: { value: 1000.0 },
      },
      vertexShader: `
        varying float vDepth;
        
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float near;
        uniform float far;
        varying float vDepth;
        
        void main() {
          // Output raw depth value
          gl_FragColor = vec4(vDepth, vDepth, vDepth, 1.0);
        }
      `,
    });
  }

  /**
   * Update near/far planes
   */
  updatePlanes(near: number, far: number): void {
    this.uniforms.near.value = near;
    this.uniforms.far.value = far;
  }
}

/**
 * Ground truth float depth shader
 * Outputs depth as a single float value suitable for MRT with FLOAT textures.
 * Also provides packDepthToRGBA for encoding into RGBA8 when float textures are unavailable.
 *
 * Based on: infinigen/core/rendering/render.py which saves EXR float depth.
 *
 * @see GTDepthMaterial for the legacy 8-bit clamped version
 */
export class GTFloatDepthMaterial extends ShaderMaterial {
  /** Whether to output linear depth (camera-space Z in meters) vs non-linear (0-1 normalized) */
  readonly useLinearDepth: boolean;

  constructor(useLinearDepth: boolean = true) {
    super({
      uniforms: {
        near: { value: 0.1 },
        far: { value: 1000.0 },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000.0 },
      },
      vertexShader: /* glsl */ `
        varying float vLinearDepth;
        varying float vNonLinearDepth;

        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          // Linear depth: camera-space Z (positive, in world units / meters)
          vLinearDepth = -mvPosition.z;
          // Non-linear depth: normalized [0, 1] as used by the depth buffer
          vec4 clipPos = projectionMatrix * mvPosition;
          vNonLinearDepth = clipPos.z / clipPos.w;
          gl_Position = clipPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float near;
        uniform float far;
        uniform float cameraNear;
        uniform float cameraFar;
        varying float vLinearDepth;
        varying float vNonLinearDepth;

        /**
         * Pack a 32-bit float depth into RGBA8 (4 x 8-bit channels).
         * Uses standard fract-based packing: each channel stores 8 bits of the mantissa.
         * Decode with: depth = dot(color, vec4(1.0, 1/255.0, 1/65025.0, 1/16581375.0))
         */
        vec4 packDepthToRGBA(float depth) {
          const vec4 bitShift = vec4(256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0);
          const vec4 bitMask  = vec4(0.0, 1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0);
          vec4 res = fract(depth * bitShift);
          res -= res.xxyz * bitMask;
          return res;
        }

        void main() {
          #ifdef USE_LINEAR_DEPTH
            // Camera-space Z distance in meters – suitable for FLOAT render targets
            float depth = vLinearDepth;
          #else
            // Normalized [0, 1] depth – pack into RGBA for 8-bit targets
            float ndcDepth = vNonLinearDepth * 0.5 + 0.5; // [-1,1] -> [0,1]
            gl_FragColor = packDepthToRGBA(ndcDepth);
            return;
          #endif

          // For float targets, output depth directly in the red channel
          gl_FragColor = vec4(depth, 0.0, 0.0, 1.0);
        }
      `,
      defines: {
        USE_LINEAR_DEPTH: '',
      },
    });

    this.useLinearDepth = useLinearDepth;
    if (!useLinearDepth) {
      this.defines = {}; // Remove USE_LINEAR_DEPTH define
      this.needsUpdate = true;
    }
  }

  /**
   * Update camera near/far planes for both linear and non-linear modes.
   */
  updatePlanes(near: number, far: number): void {
    this.uniforms.near.value = near;
    this.uniforms.far.value = far;
    this.uniforms.cameraNear.value = near;
    this.uniforms.cameraFar.value = far;
  }

  /**
   * Decode a packed RGBA depth back to a float value.
   * Counterpart to the GLSL `packDepthToRGBA` function.
   *
   * @param r,g,b,a - Normalized [0,1] channel values from an RGBA8 pixel
   * @returns The decoded depth value
   */
  static unpackDepthFromRGBA(r: number, g: number, b: number, a: number): number {
    return r / (256.0 * 256.0 * 256.0)
         + g / (256.0 * 256.0)
         + b / 256.0
         + a;
  }
}

/**
 * Ground truth normal shader
 * Outputs surface normals in camera-space or world-space.
 *
 * The original Infinigen applies R_world2cv (world-to-camera) transformation
 * to output camera-space normals. This shader supports both modes:
 * - `'camera'` (default): transforms world normals to camera-space via the view matrix
 * - `'world'`: outputs world-space normals (legacy behavior)
 *
 * Based on: infinigen/core/rendering/render.py (shader_normal with R_world2cv)
 */
export class GTNormalMaterial extends ShaderMaterial {
  /** The output coordinate space for normals */
  readonly outputSpace: 'camera' | 'world';

  constructor(outputSpace: 'camera' | 'world' = 'camera') {
    super({
      uniforms: {
        viewMatrix: { value: new Matrix4() },
      },
      vertexShader: /* glsl */ `
        uniform mat4 viewMatrix;
        varying vec3 vNormal;

        void main() {
          // Transform normal to world space first
          vec3 worldNormal = normalize(mat3(modelMatrix) * normal);

          #ifdef USE_CAMERA_SPACE
            // Transform world-space normal to camera-space using
            // the inverse-transpose of the upper-left 3x3 of the view matrix.
            // For orthogonal view matrices, mat3(viewMatrix) is sufficient
            // since the inverse-transpose of an orthogonal matrix equals itself.
            vec3 cameraNormal = normalize(mat3(viewMatrix) * worldNormal);
            vNormal = cameraNormal;
          #else
            vNormal = worldNormal;
          #endif

          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vNormal;

        void main() {
          vec3 n = normalize(vNormal);
          // Convert from [-1,1] to [0,1] for visualization / encoding
          vec3 rgb = n * 0.5 + 0.5;
          gl_FragColor = vec4(rgb, 1.0);
        }
      `,
      defines: {
        USE_CAMERA_SPACE: '',
      },
    });

    this.outputSpace = outputSpace;
    if (outputSpace === 'world') {
      this.defines = {}; // Remove USE_CAMERA_SPACE define
      this.needsUpdate = true;
    }
  }

  /**
   * Update the view matrix from the active camera.
   * Must be called each frame before rendering when using camera-space output.
   *
   * @param camera - The active Three.js camera
   */
  updateViewMatrix(camera: { matrixWorldInverse: Matrix4 }): void {
    this.uniforms.viewMatrix.value.copy(camera.matrixWorldInverse);
  }
}

/**
 * Ground truth position shader
 * Outputs world-space positions encoded as RGB
 */
export class GTPositionMaterial extends ShaderMaterial {
  constructor(scale: number = 1.0, offset: Vector3 = new Vector3(0, 0, 0)) {
    super({
      uniforms: {
        positionScale: { value: scale },
        positionOffset: { value: offset },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float positionScale;
        uniform vec3 positionOffset;
        varying vec3 vWorldPosition;
        
        void main() {
          vec3 pos = (vWorldPosition * positionScale) + positionOffset;
          gl_FragColor = vec4(pos, 1.0);
        }
      `,
    });
  }

  /**
   * Update scale and offset
   */
  updateTransform(scale: number, offset: Vector3): void {
    this.uniforms.positionScale.value = scale;
    this.uniforms.positionOffset.value = offset;
  }
}

/**
 * Ground truth UV shader
 * Outputs texture coordinates
 */
export class GTUVMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: `
        varying vec2 vUv;
        
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        
        void main() {
          // Encode UV as RGB (U=R, G=G, B=0)
          gl_FragColor = vec4(vUv, 0.0, 1.0);
        }
      `,
    });
  }
}

/**
 * Ground truth instance ID shader
 * Encodes instance ID as RGBA color for segmentation
 */
export class GTInstanceIdMaterial extends ShaderMaterial {
  constructor(instanceId: number = 0) {
    super({
      uniforms: {
        instanceId: { value: instanceId },
      },
      vertexShader: `
        varying flat int vInstanceId;
        
        void main() {
          vInstanceId = instanceId;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform int instanceId;
        varying flat int vInstanceId;
        
        void main() {
          // Encode integer ID as 4-byte float
          int id = vInstanceId;
          float r = float((id >> 0) & 0xFF) / 255.0;
          float g = float((id >> 8) & 0xFF) / 255.0;
          float b = float((id >> 16) & 0xFF) / 255.0;
          float a = float((id >> 24) & 0xFF) / 255.0;
          gl_FragColor = vec4(r, g, b, a);
        }
      `,
      defines: {
        instanceId: instanceId.toString(),
      },
    });
  }

  /**
   * Update instance ID
   */
  setInstanceId(id: number): void {
    this.uniforms.instanceId.value = id;
    this.defines.instanceId = id.toString();
    this.needsUpdate = true;
  }
}

/**
 * Ground truth material ID shader
 * Encodes material ID for material segmentation
 */
export class GTMaterialIdMaterial extends ShaderMaterial {
  constructor(materialId: number = 0) {
    super({
      uniforms: {
        materialId: { value: materialId },
      },
      vertexShader: `
        varying flat int vMaterialId;
        
        void main() {
          vMaterialId = materialId;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform int materialId;
        varying flat int vMaterialId;
        
        void main() {
          // Encode material ID as RGB
          int id = vMaterialId;
          float r = float((id >> 0) & 0xFF) / 255.0;
          float g = float((id >> 8) & 0xFF) / 255.0;
          float b = float((id >> 16) & 0xFF) / 255.0;
          gl_FragColor = vec4(r, g, b, 1.0);
        }
      `,
      defines: {
        materialId: materialId.toString(),
      },
    });
  }

  /**
   * Update material ID
   */
  setMaterialId(id: number): void {
    this.uniforms.materialId.value = id;
    this.defines.materialId = id.toString();
    this.needsUpdate = true;
  }
}

/**
 * Ground truth albedo shader
 * Extracts base color without lighting
 */
export class GTAlbedoMaterial extends ShaderMaterial {
  constructor(baseColor: Color = new Color(1, 1, 1)) {
    super({
      uniforms: {
        baseColor: { value: baseColor },
      },
      vertexShader: `
        varying vec2 vUv;
        
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 baseColor;
        varying vec2 vUv;
        
        void main() {
          gl_FragColor = vec4(baseColor, 1.0);
        }
      `,
    });
  }

  /**
   * Update base color
   */
  setColor(color: Color): void {
    this.uniforms.baseColor.value.copy(color);
  }
}

/**
 * Ground truth roughness shader
 * Outputs roughness values
 */
export class GTRoughnessMaterial extends ShaderMaterial {
  constructor(roughness: number = 0.5) {
    super({
      uniforms: {
        roughness: { value: roughness },
      },
      vertexShader: `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float roughness;
        
        void main() {
          gl_FragColor = vec4(vec3(roughness), 1.0);
        }
      `,
    });
  }

  /**
   * Update roughness value
   */
  setRoughness(value: number): void {
    this.uniforms.roughness.value = Math.max(0, Math.min(1, value));
  }
}

/**
 * Ground truth metalness shader
 * Outputs metalness values
 */
export class GTMetalnessMaterial extends ShaderMaterial {
  constructor(metalness: number = 0.0) {
    super({
      uniforms: {
        metalness: { value: metalness },
      },
      vertexShader: `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float metalness;
        
        void main() {
          gl_FragColor = vec4(vec3(metalness), 1.0);
        }
      `,
    });
  }

  /**
   * Update metalness value
   */
  setMetalness(value: number): void {
    this.uniforms.metalness.value = Math.max(0, Math.min(1, value));
  }
}

/**
 * Ground truth emission shader
 * Outputs emissive color
 */
export class GTEmissionMaterial extends ShaderMaterial {
  constructor(emissive: Color = new Color(0, 0, 0)) {
    super({
      uniforms: {
        emissive: { value: emissive },
      },
      vertexShader: `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 emissive;
        
        void main() {
          gl_FragColor = vec4(emissive, 1.0);
        }
      `,
    });
  }

  /**
   * Update emissive color
   */
  setEmissive(color: Color): void {
    this.uniforms.emissive.value.copy(color);
  }
}

/**
 * Convenience class that sets up all GT materials for Multiple Render Targets (MRT) rendering.
 *
 * Provides a unified interface to create and update all ground truth pass materials
 * at once from a single camera, ensuring consistent view-dependent state.
 *
 * Usage:
 * ```ts
 * const mrt = new GTMRTMaterials();
 * // In render loop:
 * mrt.updateFromCamera(camera);
 * // Assign mrt.depth, mrt.normal, etc. to render targets
 * ```
 */
export class GTMRTMaterials {
  /** Float depth material for accurate depth output */
  depth: GTFloatDepthMaterial;
  /** Normal material with configurable output space */
  normal: GTNormalMaterial;
  /** Flat shading segmentation material */
  segmentation: GTFlatShadingMaterial;
  /** Position encoding material */
  position: GTPositionMaterial;

  constructor(options?: {
    /** Whether depth should use linear (camera-space Z) output. Default: true */
    linearDepth?: boolean;
    /** Normal output space: 'camera' or 'world'. Default: 'camera' */
    normalSpace?: 'camera' | 'world';
    /** Position scale factor. Default: 1.0 */
    positionScale?: number;
    /** Position offset. Default: (0,0,0) */
    positionOffset?: Vector3;
  }) {
    const opts = options ?? {};
    this.depth = new GTFloatDepthMaterial(opts.linearDepth ?? true);
    this.normal = new GTNormalMaterial(opts.normalSpace ?? 'camera');
    this.segmentation = new GTFlatShadingMaterial();
    this.position = new GTPositionMaterial(
      opts.positionScale ?? 1.0,
      opts.positionOffset ?? new Vector3(0, 0, 0)
    );
  }

  /**
   * Update all view-dependent materials from the given camera.
   * Call this once per frame before rendering.
   *
   * @param camera - The active Three.js camera
   */
  updateFromCamera(camera: Camera): void {
    // Update depth near/far
    if ('near' in camera && 'far' in camera) {
      this.depth.updatePlanes(
        (camera as any).near as number,
        (camera as any).far as number
      );
    }
    // Update normal view matrix
    this.normal.updateViewMatrix(camera);
  }
}

/**
 * Factory function to create appropriate GT material based on pass type.
 *
 * Supports all legacy pass types plus the new float-depth and camera-normal modes
 * via the `params` object.
 *
 * @param passType - The ground truth pass type identifier
 * @param params - Optional parameters for material construction
 * @returns A configured ShaderMaterial for the requested pass
 */
export function createGTMaterial(
  passType: string,
  params?: {
    instanceId?: number;
    materialId?: number;
    scale?: number;
    offset?: Vector3;
    color?: Color;
    roughness?: number;
    metalness?: number;
    emissive?: Color;
    /** Use float depth output instead of legacy 8-bit clamped depth */
    floatDepth?: boolean;
    /** Use linear (camera-space Z) depth. Default true. Only for float depth. */
    linearDepth?: boolean;
    /** Normal output space: 'camera' or 'world'. Default 'camera'. */
    normalSpace?: 'camera' | 'world';
    [key: string]: unknown;
  }
): ShaderMaterial {
  switch (passType.toLowerCase()) {
    case 'flat':
    case 'instance':
      return new GTFlatShadingMaterial(params?.instanceId);

    case 'depth':
      // Use float depth by default (params.floatDepth defaults to true for new code)
      if (params?.floatDepth !== false) {
        return new GTFloatDepthMaterial(params?.linearDepth ?? true);
      }
      return new GTDepthMaterial();

    case 'float_depth':
      return new GTFloatDepthMaterial(params?.linearDepth ?? true);

    case 'normal':
      return new GTNormalMaterial(params?.normalSpace ?? 'camera');

    case 'position':
      return new GTPositionMaterial(params?.scale, params?.offset);

    case 'uv':
      return new GTUVMaterial();

    case 'instance_id':
      return new GTInstanceIdMaterial(params?.instanceId ?? 0);

    case 'material_id':
      return new GTMaterialIdMaterial(params?.materialId ?? 0);

    case 'albedo':
      return new GTAlbedoMaterial(params?.color);

    case 'roughness':
      return new GTRoughnessMaterial(params?.roughness ?? 0.5);

    case 'metalness':
      return new GTMetalnessMaterial(params?.metalness ?? 0.0);

    case 'emission':
      return new GTEmissionMaterial(params?.emissive);

    case 'optical_flow':
      // Optical flow material is handled by OpticalFlowPass directly,
      // but we provide a fallback that outputs zero flow
      return new GTFlatShadingMaterial();

    default:
      console.warn(`Unknown GT pass type: ${passType}, using flat shading`);
      return new GTFlatShadingMaterial();
  }
}

/**
 * Apply ground truth materials to scene objects
 */
export function applyGTMaterialsToScene(
  scene: any,
  passType: string,
  params?: any
): Map<any, any> {
  const originalMaterials = new Map();
  
  scene.traverse((object: any) => {
    if (!object.isMesh || !object.visible) return;
    
    // Store original material(s)
    if (Array.isArray(object.material)) {
      originalMaterials.set(object, [...object.material]);
    } else {
      originalMaterials.set(object, object.material);
    }
    
    // Create and apply GT material
    const gtMaterial = createGTMaterial(passType, {
      ...params,
      instanceId: object.id,
      materialId: object.material?.uuid ? stringToHash(object.material.uuid) : 0,
    });
    
    object.material = gtMaterial;
  });
  
  return originalMaterials;
}

/**
 * Restore original materials to scene objects
 */
export function restoreOriginalMaterials(
  scene: any,
  originalMaterials: Map<any, any>
): void {
  scene.traverse((object: any) => {
    if (!object.isMesh) return;
    
    const original = originalMaterials.get(object);
    if (original) {
      object.material = original;
    }
  });
}

/**
 * Hash string to integer (for material IDs)
 */
function stringToHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Default export – GTFlatShadingMaterial, the primary ground-truth material.
 *
 * Previously this file exported a bag-of-symbols object as default.  All
 * symbols remain available as named exports.
 */
export default GTFlatShadingMaterial;
