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
  UniformsUtils,
  UniformsLib,
} from 'three';
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
 * Ground truth normal shader
 * Outputs world-space surface normals
 */
export class GTNormalMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: `
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        
        void main() {
          // Transform normal to world space
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        
        void main() {
          // Normalize and convert from [-1,1] to [0,1]
          vec3 normal = normalize(vWorldNormal);
          vec3 rgb = normal * 0.5 + 0.5;
          gl_FragColor = vec4(rgb, 1.0);
        }
      `,
    });
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
 * Factory function to create appropriate GT material based on pass type
 */
export function createGTMaterial(
  passType: string,
  params?: any
): ShaderMaterial {
  switch (passType.toLowerCase()) {
    case 'flat':
    case 'instance':
      return new GTFlatShadingMaterial(params?.instanceId);
    
    case 'depth':
      return new GTDepthMaterial();
    
    case 'normal':
      return new GTNormalMaterial();
    
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

export default {
  GTFlatShadingMaterial,
  GTDepthMaterial,
  GTNormalMaterial,
  GTPositionMaterial,
  GTUVMaterial,
  GTInstanceIdMaterial,
  GTMaterialIdMaterial,
  GTAlbedoMaterial,
  GTRoughnessMaterial,
  GTMetalnessMaterial,
  GTEmissionMaterial,
  createGTMaterial,
  applyGTMaterialsToScene,
  restoreOriginalMaterials,
};
