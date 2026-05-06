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
 * - Translucent BSDF → MeshPhysicalMaterial (subsurface approximation)
 * - Principled Volume → MeshPhysicalMaterial (volume as subsurface)
 * - Emission → MeshPhysicalMaterial (emissive)
 * - Mix Shader → blended material properties
 * - Add Shader → additive material properties
 * - Texture map assignments (diffuse, normal, roughness, metallic, AO, transmission, emissive)
 *
 * Integration with NodeGraphTextureBridge:
 * - When BSDF data contains texture descriptors (e.g., from connected texture nodes),
 *   this bridge automatically converts them to Three.js textures via NodeGraphTextureBridge.
 * - Texture descriptors in the NodeEvaluator output format are recognized and processed.
 */

import * as THREE from 'three';
import { NodeGraphTextureBridge, type EvaluatorTextureOutput } from './NodeGraphTextureBridge';

// ============================================================================
// Types
// ============================================================================

export interface BSDFOutput {
  /** BSDF type identifier */
  type: string; // 'principled_bsdf', 'bsdf_diffuse', 'bsdf_glossy', 'bsdf_glass', 'bsdf_translucent', 'principled_volume', 'emission', 'mix_shader', 'add_shader'

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

  // Texture maps (already-resolved Three.js textures)
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  metalnessMap?: THREE.Texture;
  aoMap?: THREE.Texture;
  transmissionMap?: THREE.Texture;
  emissiveMap?: THREE.Texture;
  bumpMap?: THREE.Texture;
  opacityMap?: THREE.Texture;

  // Texture descriptors (NodeEvaluator texture output format — to be resolved via TextureBridge)
  mapDescriptor?: EvaluatorTextureOutput;
  normalMapDescriptor?: EvaluatorTextureOutput;
  roughnessMapDescriptor?: EvaluatorTextureOutput;
  metalnessMapDescriptor?: EvaluatorTextureOutput;
  aoMapDescriptor?: EvaluatorTextureOutput;
  transmissionMapDescriptor?: EvaluatorTextureOutput;
  emissiveMapDescriptor?: EvaluatorTextureOutput;
  bumpMapDescriptor?: EvaluatorTextureOutput;

  // Mix/Add shader fields
  factor?: number;
  shader1?: any;
  shader2?: any;

  // Volume properties (principled_volume)
  volumeColor?: THREE.Color | { r: number; g: number; b: number } | string;
  volumeDensity?: number;
  volumeEmissionStrength?: number;
  volumeEmissionColor?: THREE.Color | { r: number; g: number; b: number } | string;

  // Translucent BSDF
  subsurfaceColor?: THREE.Color | { r: number; g: number; b: number } | string;
}

/** Wrapper that the NodeEvaluator actually produces */
export interface NodeEvaluationOutput {
  BSDF?: BSDFOutput;
  Emission?: BSDFOutput;
  Shader?: BSDFOutput;
  Volume?: BSDFOutput;
  Surface?: BSDFOutput;
}

/** Options for material conversion */
export interface MaterialBridgeOptions {
  /** Default texture resolution for generated textures (default 512) */
  textureResolution?: number;
  /** Whether to process texture descriptors via TextureBridge (default true) */
  processTextureDescriptors?: boolean;
  /** Normal map strength when generating from height fields (default 1.0) */
  normalMapStrength?: number;
}

// ============================================================================
// NodeGraphMaterialBridge
// ============================================================================

export class NodeGraphMaterialBridge {
  private textureBridge: NodeGraphTextureBridge;
  private options: Required<MaterialBridgeOptions>;

  constructor(options?: MaterialBridgeOptions) {
    this.textureBridge = new NodeGraphTextureBridge();
    this.options = {
      textureResolution: options?.textureResolution ?? 512,
      processTextureDescriptors: options?.processTextureDescriptors ?? true,
      normalMapStrength: options?.normalMapStrength ?? 1.0,
    };
  }

  /**
   * Convert a NodeEvaluator output to a MeshPhysicalMaterial.
   *
   * Accepts either the raw BSDF data object or the wrapper { BSDF: ... } / { Emission: ... } / { Shader: ... }
   */
  convert(output: BSDFOutput | NodeEvaluationOutput, options?: MaterialBridgeOptions): THREE.MeshPhysicalMaterial {
    // Unwrap if the caller passed the full evaluation output
    const bsdf = this.extractBSDF(output);
    if (!bsdf) {
      console.warn('NodeGraphMaterialBridge: No BSDF data found, returning default material');
      return this.createDefaultMaterial();
    }

    // Process any texture descriptors before conversion
    const processedBsdf = this.options.processTextureDescriptors
      ? this.processTextureDescriptors(bsdf, options)
      : bsdf;

    switch (processedBsdf.type) {
      case 'principled_bsdf':
        return this.convertPrincipledBSDF(processedBsdf);
      case 'bsdf_diffuse':
        return this.convertDiffuseBSDF(processedBsdf);
      case 'bsdf_glossy':
        return this.convertGlossyBSDF(processedBsdf);
      case 'bsdf_glass':
        return this.convertGlassBSDF(processedBsdf);
      case 'bsdf_translucent':
        return this.convertTranslucentBSDF(processedBsdf);
      case 'principled_volume':
        return this.convertPrincipledVolume(processedBsdf);
      case 'emission':
        return this.convertEmission(processedBsdf);
      case 'mix_shader':
        return this.convertMixShader(processedBsdf);
      case 'add_shader':
        return this.convertAddShader(processedBsdf);
      default:
        console.warn(`NodeGraphMaterialBridge: Unknown BSDF type "${processedBsdf.type}", falling back to principled conversion`);
        return this.convertPrincipledBSDF(processedBsdf);
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
    const anisotropic = bsdf.anisotropic ?? 0.0;

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

    // Anisotropic approximation (Three.js doesn't support anisotropic on MeshPhysicalMaterial directly,
    // but we can approximate via clearcoat and roughness modulation)
    if (anisotropic > 0) {
      // Anisotropic materials have directional roughness; we approximate by slightly reducing
      // the isotropic roughness and adding a subtle clearcoat effect
      materialParams.roughness = Math.max(0.04, roughness * (1 - anisotropic * 0.2));
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

  /**
   * Translucent BSDF → MeshPhysicalMaterial with subsurface scattering approximation
   * In Blender, this simulates light passing through the surface (e.g., wax, skin, leaves).
   * Three.js doesn't have a direct equivalent, so we approximate via:
   * - Low transmission with thickness (for light-through effect)
   * - Subsurface color as sheenColor (for back-lit appearance)
   */
  private convertTranslucentBSDF(bsdf: BSDFOutput): THREE.MeshPhysicalMaterial {
    const color = this.resolveColor(bsdf.baseColor, new THREE.Color(0.8, 0.8, 0.8));
    const subsurfaceColor = this.resolveColor(bsdf.subsurfaceColor, new THREE.Color(0.8, 0.5, 0.3));
    const roughness = bsdf.roughness ?? 0.5;

    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: Math.max(0.04, roughness),
      metalness: 0.0,
      transmission: 0.3,
      transparent: true,
      opacity: 1.0,
      thickness: 1.0,
      ior: 1.4,
      sheen: 0.3,
      sheenRoughness: 0.6,
      sheenColor: subsurfaceColor,
      side: THREE.DoubleSide,
    });

    this.assignTextureMaps(material, bsdf);
    material.name = `Bridge_TranslucentBSDF_${Date.now()}`;
    return material;
  }

  /**
   * Principled Volume → MeshPhysicalMaterial
   *
   * Blender's Principled Volume is for volume rendering (smoke, fog, SSS).
   * In Three.js, we approximate this as:
   * - A highly transmissive material with thickness for SSS
   * - Volume emission maps to emissive
   * - Volume density affects opacity
   */
  private convertPrincipledVolume(bsdf: BSDFOutput): THREE.MeshPhysicalMaterial {
    const volumeColor = this.resolveColor(bsdf.volumeColor ?? bsdf.baseColor, new THREE.Color(1, 1, 1));
    const density = bsdf.volumeDensity ?? 1.0;
    const emissionStrength = bsdf.volumeEmissionStrength ?? 0.0;
    const emissionColor = this.resolveColor(bsdf.volumeEmissionColor, new THREE.Color(1, 1, 1));

    const material = new THREE.MeshPhysicalMaterial({
      color: volumeColor,
      roughness: 1.0,
      metalness: 0.0,
      transmission: Math.min(1.0, density * 0.5),
      transparent: true,
      opacity: Math.max(0.1, 1.0 - density * 0.3),
      thickness: Math.max(0.1, density),
      ior: 1.33,
      side: THREE.DoubleSide,
    });

    if (emissionStrength > 0) {
      material.emissive = emissionColor;
      material.emissiveIntensity = emissionStrength;
    }

    this.assignTextureMaps(material, bsdf);
    material.name = `Bridge_PrincipledVolume_${Date.now()}`;
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
      if (shader2) {
        // Try to extract emission from the second shader
        const bsdf2 = this.extractBSDF(shader2);
        if (bsdf2) {
          const emColor = this.resolveColor(
            bsdf2.emissionColor ?? bsdf2.baseColor,
            new THREE.Color(1, 1, 1)
          );
          const emStrength = bsdf2.emissionStrength ?? (bsdf2.type === 'emission' ? 1.0 : 0.5);
          // Additive emission: add to existing emissive or set new
          if (material.emissiveIntensity > 0) {
            material.emissive.add(emColor.multiplyScalar(emStrength));
          } else {
            material.emissive = emColor;
            material.emissiveIntensity = emStrength;
          }
        }
      }
      material.name = `Bridge_AddShader_${Date.now()}`;
      return material;
    }

    const material = this.createDefaultMaterial();
    material.name = `Bridge_AddShader_${Date.now()}`;
    return material;
  }

  // ==========================================================================
  // Texture Descriptor Processing
  // ==========================================================================

  /**
   * Process texture descriptors in the BSDF output.
   *
   * When the NodeEvaluator produces a BSDF with connected texture nodes,
   * the texture data may appear as descriptor objects (e.g., { type: 'noise_texture', scale, ... })
   * instead of Three.js Texture instances. This method converts those descriptors
   * to actual textures using the NodeGraphTextureBridge.
   */
  private processTextureDescriptors(bsdf: BSDFOutput, options?: MaterialBridgeOptions): BSDFOutput {
    const result = { ...bsdf };
    const res = options?.textureResolution ?? this.options.textureResolution;

    // Process each texture descriptor slot
    if (result.mapDescriptor && !result.map) {
      try {
        const convResult = this.textureBridge.convertFromEvaluatorOutput(result.mapDescriptor, 'Color', res, res);
        result.map = convResult.texture;
      } catch (e) {
        console.warn('NodeGraphMaterialBridge: Failed to convert map descriptor', e);
      }
    }

    if (result.normalMapDescriptor && !result.normalMap) {
      try {
        result.normalMap = this.textureBridge.convertToNormalMap(
          result.normalMapDescriptor,
          'Fac',
          options?.normalMapStrength ?? this.options.normalMapStrength,
          res, res,
        );
      } catch (e) {
        console.warn('NodeGraphMaterialBridge: Failed to convert normalMap descriptor', e);
      }
    }

    if (result.roughnessMapDescriptor && !result.roughnessMap) {
      try {
        result.roughnessMap = this.textureBridge.convertToScalarMap(result.roughnessMapDescriptor, 'Fac', res, res);
      } catch (e) {
        console.warn('NodeGraphMaterialBridge: Failed to convert roughnessMap descriptor', e);
      }
    }

    if (result.metalnessMapDescriptor && !result.metalnessMap) {
      try {
        result.metalnessMap = this.textureBridge.convertToScalarMap(result.metalnessMapDescriptor, 'Fac', res, res);
      } catch (e) {
        console.warn('NodeGraphMaterialBridge: Failed to convert metalnessMap descriptor', e);
      }
    }

    if (result.aoMapDescriptor && !result.aoMap) {
      try {
        result.aoMap = this.textureBridge.convertToScalarMap(result.aoMapDescriptor, 'Fac', res, res);
      } catch (e) {
        console.warn('NodeGraphMaterialBridge: Failed to convert aoMap descriptor', e);
      }
    }

    if (result.transmissionMapDescriptor && !result.transmissionMap) {
      try {
        result.transmissionMap = this.textureBridge.convertToScalarMap(result.transmissionMapDescriptor, 'Fac', res, res);
      } catch (e) {
        console.warn('NodeGraphMaterialBridge: Failed to convert transmissionMap descriptor', e);
      }
    }

    if (result.emissiveMapDescriptor && !result.emissiveMap) {
      try {
        const convResult = this.textureBridge.convertFromEvaluatorOutput(result.emissiveMapDescriptor, 'Color', res, res);
        result.emissiveMap = convResult.texture;
      } catch (e) {
        console.warn('NodeGraphMaterialBridge: Failed to convert emissiveMap descriptor', e);
      }
    }

    if (result.bumpMapDescriptor && !result.bumpMap) {
      try {
        result.bumpMap = this.textureBridge.convertToScalarMap(result.bumpMapDescriptor, 'Fac', res, res);
      } catch (e) {
        console.warn('NodeGraphMaterialBridge: Failed to convert bumpMap descriptor', e);
      }
    }

    // Also scan for texture descriptors in non-standard fields
    // (e.g., baseColor might be a texture descriptor if a texture was connected to the color input)
    result.baseColor = this.resolveTextureOrColor(result.baseColor, 'Color');
    result.emissionColor = this.resolveTextureOrColor(result.emissionColor, 'Color');

    return result;
  }

  /**
   * If a value looks like a texture descriptor, convert it to a Color and return
   * the generated texture separately. Otherwise return the color as-is.
   */
  private resolveTextureOrColor(
    value: any,
    outputSocket: 'Color' | 'Fac' | 'Distance',
  ): THREE.Color | { r: number; g: number; b: number } | string | undefined {
    if (!value) return value;
    if (value instanceof THREE.Color) return value;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && 'r' in value && 'g' in value && 'b' in value) return value;

    // If it looks like a texture descriptor, we can't set a color from it directly
    // (it would need to be a texture), so return default
    if (typeof value === 'object' && 'type' in value) {
      // This is a texture descriptor — the actual texture should be on the map slot
      // Return undefined so the default color is used
      return undefined;
    }

    return value;
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
    if (wrapper.Volume) return wrapper.Volume;
    if (wrapper.Surface) return wrapper.Surface;

    return null;
  }

  /**
   * Resolve a color from various input types to THREE.Color
   */
  private resolveColor(
    value: THREE.Color | { r: number; g: number; b: number } | string | undefined,
    defaultColor: THREE.Color,
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
   * Create a default/placeholder material when no BSDF data is available
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
