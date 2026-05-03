/**
 * NodeGraphMaterialBridge - Converts NodeEvaluator BSDF output to Three.js MeshPhysicalMaterial
 *
 * The NodeEvaluator produces data objects like `{ BSDF: { type: "principled_bsdf", baseColor, ... } }`
 * but does NOT create actual Three.js materials. This bridge converts those data objects
 * into fully configured MeshPhysicalMaterial instances.
 *
 * Supports:
 * - Principled BSDF → MeshPhysicalMaterial (full PBR)
 * - Diffuse BSDF → MeshPhysicalMaterial (non-metallic)
 * - Glossy BSDF → MeshPhysicalMaterial (metallic)
 * - Glass BSDF → MeshPhysicalMaterial (transmission)
 * - Emission → MeshPhysicalMaterial (emissive)
 * - Mix Shader → blended material properties
 * - Add Shader → additive material properties
 * - Texture map assignments (diffuse, normal, roughness, metallic, AO, transmission, emissive)
 */

import * as THREE from 'three';

// ============================================================================
// Types
// ============================================================================

export interface BSDFOutput {
  /** BSDF type identifier */
  type: string; // 'principled_bsdf', 'bsdf_diffuse', 'bsdf_glossy', 'bsdf_glass', 'emission', 'mix_shader', 'add_shader'

  // Color properties
  baseColor?: THREE.Color | { r: number; g: number; b: number } | string;
  roughness?: number;
  metallic?: number;
  specular?: number;
  ior?: number;
  transmission?: number;
  transmissionRoughness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  sheen?: number;
  sheenColor?: THREE.Color | { r: number; g: number; b: number } | string;
  sheenRoughness?: number;
  anisotropic?: number;
  anisotropicRotation?: number;

  // Subsurface
  subsurfaceWeight?: number;
  subsurfaceRadius?: { x: number; y: number; z: number };

  // Emission
  emissionColor?: THREE.Color | { r: number; g: number; b: number } | string;
  emissionStrength?: number;

  // Alpha / transparency
  alpha?: number;

  // Normal
  normalMapStrength?: number;

  // Texture maps
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  metalnessMap?: THREE.Texture;
  aoMap?: THREE.Texture;
  transmissionMap?: THREE.Texture;
  emissiveMap?: THREE.Texture;
  bumpMap?: THREE.Texture;
  opacityMap?: THREE.Texture;

  // Mix/Add shader fields
  factor?: number;
  shader1?: any;
  shader2?: any;
}

/** Wrapper that the NodeEvaluator actually produces */
export interface NodeEvaluationOutput {
  BSDF?: BSDFOutput;
  Emission?: BSDFOutput;
  Shader?: BSDFOutput;
}

// ============================================================================
// NodeGraphMaterialBridge
// ============================================================================

export class NodeGraphMaterialBridge {
  /**
   * Convert a NodeEvaluator output to a MeshPhysicalMaterial.
   *
   * Accepts either the raw BSDF data object or the wrapper { BSDF: ... } / { Emission: ... } / { Shader: ... }
   */
  convert(output: BSDFOutput | NodeEvaluationOutput): THREE.MeshPhysicalMaterial {
    // Unwrap if the caller passed the full evaluation output
    const bsdf = this.extractBSDF(output);
    if (!bsdf) {
      console.warn('NodeGraphMaterialBridge: No BSDF data found, returning default material');
      return this.createDefaultMaterial();
    }

    switch (bsdf.type) {
      case 'principled_bsdf':
        return this.convertPrincipledBSDF(bsdf);
      case 'bsdf_diffuse':
        return this.convertDiffuseBSDF(bsdf);
      case 'bsdf_glossy':
        return this.convertGlossyBSDF(bsdf);
      case 'bsdf_glass':
        return this.convertGlassBSDF(bsdf);
      case 'emission':
        return this.convertEmission(bsdf);
      case 'mix_shader':
        return this.convertMixShader(bsdf);
      case 'add_shader':
        return this.convertAddShader(bsdf);
      default:
        console.warn(`NodeGraphMaterialBridge: Unknown BSDF type "${bsdf.type}", falling back to principled conversion`);
        return this.convertPrincipledBSDF(bsdf);
    }
  }

  // ==========================================================================
  // BSDF Type Converters
  // ==========================================================================

  private convertPrincipledBSDF(bsdf: BSDFOutput): THREE.MeshPhysicalMaterial {
    const color = this.resolveColor(bsdf.baseColor, new THREE.Color(0.8, 0.8, 0.8));
    const roughness = bsdf.roughness ?? 0.5;
    const metallic = bsdf.metallic ?? 0.0;
    const transmission = bsdf.transmission ?? 0.0;
    const ior = bsdf.ior ?? 1.45;
    const clearcoat = bsdf.clearcoat ?? 0.0;
    const clearcoatRoughness = bsdf.clearcoatRoughness ?? 0.03;
    const sheen = bsdf.sheen ?? 0.0;
    const alpha = bsdf.alpha ?? 1.0;
    const emissionStrength = bsdf.emissionStrength ?? 0.0;
    const emissionColor = this.resolveColor(bsdf.emissionColor, new THREE.Color(0, 0, 0));
    const subsurfaceWeight = bsdf.subsurfaceWeight ?? 0.0;

    const materialParams: THREE.MeshPhysicalMaterialParameters = {
      color,
      roughness: Math.max(0.04, roughness),
      metalness: metallic,
      ior,
      clearcoat,
      clearcoatRoughness,
      sheen,
      sheenRoughness: bsdf.sheenRoughness ?? 0.5,
      sheenColor: this.resolveColor(bsdf.sheenColor, new THREE.Color(1, 1, 1)),
      transparent: alpha < 1.0 || transmission > 0,
      opacity: alpha,
      side: transmission > 0 ? THREE.DoubleSide : THREE.FrontSide,
    };

    // Transmission (glass-like)
    if (transmission > 0) {
      (materialParams as any).transmission = transmission;
      (materialParams as any).thickness = 0.5;
    }

    // Emission
    if (emissionStrength > 0) {
      materialParams.emissive = emissionColor;
      materialParams.emissiveIntensity = emissionStrength;
    }

    // Subsurface scattering approximation
    if (subsurfaceWeight > 0) {
      (materialParams as any).transmission = Math.max(transmission, subsurfaceWeight * 0.2);
      (materialParams as any).thickness = 1.0;
      materialParams.transparent = true;
    }

    const material = new THREE.MeshPhysicalMaterial(materialParams);

    // Assign texture maps
    this.assignTextureMaps(material, bsdf);

    material.name = `Bridge_PrincipledBSDF_${Date.now()}`;
    return material;
  }

  private convertDiffuseBSDF(bsdf: BSDFOutput): THREE.MeshPhysicalMaterial {
    const color = this.resolveColor(bsdf.baseColor, new THREE.Color(0.8, 0.8, 0.8));
    const roughness = bsdf.roughness ?? 0.5;

    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: Math.max(0.04, roughness),
      metalness: 0.0,
    });

    this.assignTextureMaps(material, bsdf);
    material.name = `Bridge_DiffuseBSDF_${Date.now()}`;
    return material;
  }

  private convertGlossyBSDF(bsdf: BSDFOutput): THREE.MeshPhysicalMaterial {
    const color = this.resolveColor(bsdf.baseColor, new THREE.Color(1, 1, 1));
    const roughness = bsdf.roughness ?? 0.0;

    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: Math.max(0.04, roughness),
      metalness: 1.0,
    });

    this.assignTextureMaps(material, bsdf);
    material.name = `Bridge_GlossyBSDF_${Date.now()}`;
    return material;
  }

  private convertGlassBSDF(bsdf: BSDFOutput): THREE.MeshPhysicalMaterial {
    const color = this.resolveColor(bsdf.baseColor, new THREE.Color(1, 1, 1));
    const roughness = bsdf.roughness ?? 0.0;
    const ior = bsdf.ior ?? 1.45;

    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: Math.max(0.04, roughness),
      metalness: 0.0,
      ior,
      transmission: 1.0,
      transparent: true,
      opacity: 1.0,
      thickness: 0.5,
      side: THREE.DoubleSide,
    });

    this.assignTextureMaps(material, bsdf);
    material.name = `Bridge_GlassBSDF_${Date.now()}`;
    return material;
  }

  private convertEmission(bsdf: BSDFOutput): THREE.MeshPhysicalMaterial {
    const emissionColor = this.resolveColor(bsdf.emissionColor ?? bsdf.baseColor, new THREE.Color(1, 1, 1));
    const emissionStrength = bsdf.emissionStrength ?? 1.0;

    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0, 0, 0),
      emissive: emissionColor,
      emissiveIntensity: emissionStrength,
      roughness: 1.0,
      metalness: 0.0,
    });

    if (bsdf.emissiveMap) {
      material.emissiveMap = bsdf.emissiveMap;
    }

    material.name = `Bridge_Emission_${Date.now()}`;
    return material;
  }

  private convertMixShader(bsdf: BSDFOutput): THREE.MeshPhysicalMaterial {
    const factor = bsdf.factor ?? 0.5;
    const shader1 = bsdf.shader1;
    const shader2 = bsdf.shader2;

    // If we have nested BSDF data, try to blend
    if (shader1 && shader2) {
      const mat1 = this.convert(shader1);
      const mat2 = this.convert(shader2);
      return this.blendMaterials(mat1, mat2, factor);
    }

    // Fallback: create a simple material with the factor
    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0.8, 0.8, 0.8),
      roughness: 0.5,
      metalness: 0.0,
    });
    material.name = `Bridge_MixShader_${Date.now()}`;
    return material;
  }

  private convertAddShader(bsdf: BSDFOutput): THREE.MeshPhysicalMaterial {
    const shader1 = bsdf.shader1;
    const shader2 = bsdf.shader2;

    // For add shader, we take the first shader as base and add emission from the second
    if (shader1) {
      const material = this.convert(shader1);
      if (shader2 && shader2.Emission) {
        const emBSDF = shader2.Emission;
        material.emissive = this.resolveColor(emBSDF.emissionColor ?? emBSDF.baseColor, new THREE.Color(1, 1, 1));
        material.emissiveIntensity = emBSDF.emissionStrength ?? 1.0;
      }
      material.name = `Bridge_AddShader_${Date.now()}`;
      return material;
    }

    const material = this.createDefaultMaterial();
    material.name = `Bridge_AddShader_${Date.now()}`;
    return material;
  }

  // ==========================================================================
  // Texture Map Assignment
  // ==========================================================================

  private assignTextureMaps(material: THREE.MeshPhysicalMaterial, bsdf: BSDFOutput): void {
    if (bsdf.map) {
      material.map = bsdf.map;
    }
    if (bsdf.normalMap) {
      material.normalMap = bsdf.normalMap;
      if (bsdf.normalMapStrength !== undefined) {
        material.normalScale = new THREE.Vector2(bsdf.normalMapStrength, bsdf.normalMapStrength);
      }
    }
    if (bsdf.roughnessMap) {
      material.roughnessMap = bsdf.roughnessMap;
    }
    if (bsdf.metalnessMap) {
      material.metalnessMap = bsdf.metalnessMap;
    }
    if (bsdf.aoMap) {
      material.aoMap = bsdf.aoMap;
    }
    if (bsdf.transmissionMap) {
      (material as any).transmissionMap = bsdf.transmissionMap;
    }
    if (bsdf.emissiveMap) {
      material.emissiveMap = bsdf.emissiveMap;
    }
    if (bsdf.bumpMap) {
      material.bumpMap = bsdf.bumpMap;
    }
    if (bsdf.opacityMap) {
      material.alphaMap = bsdf.opacityMap;
    }

    material.needsUpdate = true;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Extract BSDF data from various output formats
   */
  private extractBSDF(output: BSDFOutput | NodeEvaluationOutput): BSDFOutput | null {
    if (!output) return null;

    // Direct BSDFOutput (has a type field)
    if ('type' in output && typeof output.type === 'string') {
      return output as BSDFOutput;
    }

    // NodeEvaluationOutput wrapper
    const wrapper = output as NodeEvaluationOutput;
    if (wrapper.BSDF) return wrapper.BSDF;
    if (wrapper.Emission) return wrapper.Emission;
    if (wrapper.Shader) return wrapper.Shader;

    return null;
  }

  /**
   * Resolve a color from various input types to THREE.Color
   */
  private resolveColor(
    value: THREE.Color | { r: number; g: number; b: number } | string | undefined,
    defaultColor: THREE.Color
  ): THREE.Color {
    if (!value) return defaultColor.clone();
    if (value instanceof THREE.Color) return value.clone();
    if (typeof value === 'string') return new THREE.Color(value);
    if (typeof value === 'object' && 'r' in value && 'g' in value && 'b' in value) {
      return new THREE.Color((value as { r: number; g: number; b: number }).r, (value as { r: number; g: number; b: number }).g, (value as { r: number; g: number; b: number }).b);
    }
    return defaultColor.clone();
  }

  /**
   * Blend two MeshPhysicalMaterials by a factor into a new material
   */
  private blendMaterials(mat1: THREE.MeshPhysicalMaterial, mat2: THREE.MeshPhysicalMaterial, factor: number): THREE.MeshPhysicalMaterial {
    const t = Math.max(0, Math.min(1, factor));

    // Blend color
    const color = new THREE.Color().copy(mat1.color).lerp(mat2.color, t);

    // Blend numeric properties
    const roughness = mat1.roughness * (1 - t) + mat2.roughness * t;
    const metalness = mat1.metalness * (1 - t) + mat2.metalness * t;

    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: Math.max(0.04, roughness),
      metalness,
      transparent: mat1.transparent || mat2.transparent,
      opacity: mat1.opacity * (1 - t) + mat2.opacity * t,
      side: (mat1.side === THREE.DoubleSide || mat2.side === THREE.DoubleSide) ? THREE.DoubleSide : THREE.FrontSide,
    });

    // Blend transmission
    const t1 = (mat1 as any).transmission ?? 0;
    const t2 = (mat2 as any).transmission ?? 0;
    if (t1 > 0 || t2 > 0) {
      (material as any).transmission = t1 * (1 - t) + t2 * t;
      (material as any).thickness = ((mat1 as any).thickness ?? 0.5) * (1 - t) + ((mat2 as any).thickness ?? 0.5) * t;
    }

    // Blend IOR
    const ior1 = mat1.ior ?? 1.5;
    const ior2 = mat2.ior ?? 1.5;
    material.ior = ior1 * (1 - t) + ior2 * t;

    // Blend clearcoat
    const cc1 = mat1.clearcoat ?? 0;
    const cc2 = mat2.clearcoat ?? 0;
    if (cc1 > 0 || cc2 > 0) {
      material.clearcoat = cc1 * (1 - t) + cc2 * t;
      material.clearcoatRoughness = (mat1.clearcoatRoughness ?? 0.03) * (1 - t) + (mat2.clearcoatRoughness ?? 0.03) * t;
    }

    // Blend emission
    if (mat1.emissiveIntensity > 0 || mat2.emissiveIntensity > 0) {
      const emissive = new THREE.Color(0, 0, 0);
      if (mat1.emissiveIntensity > 0) {
        emissive.add(mat1.emissive.clone().multiplyScalar(mat1.emissiveIntensity * (1 - t)));
      }
      if (mat2.emissiveIntensity > 0) {
        emissive.add(mat2.emissive.clone().multiplyScalar(mat2.emissiveIntensity * t));
      }
      material.emissive = emissive;
      material.emissiveIntensity = 1.0; // Already baked into color
    }

    // Use texture from the dominant material (by factor)
    const dominant = t < 0.5 ? mat1 : mat2;
    if (dominant.map) material.map = dominant.map;
    if (dominant.normalMap) material.normalMap = dominant.normalMap;
    if (dominant.roughnessMap) material.roughnessMap = dominant.roughnessMap;
    if (dominant.metalnessMap) material.metalnessMap = dominant.metalnessMap;
    if (dominant.aoMap) material.aoMap = dominant.aoMap;

    material.name = `Bridge_Mixed_${Date.now()}`;
    return material;
  }

  /**
   * Create a default material when no BSDF data is available
   */
  private createDefaultMaterial(): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x888888,
      roughness: 0.5,
      metalness: 0.0,
    });
    material.name = 'Bridge_Default';
    return material;
  }
}
