/**
 * MaterialPipeline - Unified entry point for material creation
 *
 * Bridges subsystems:
 * 1. MaterialPresetLibrary — 50+ named material presets with PBR parameters
 * 2. NodeGraphMaterialBridge — Converts NodeEvaluator BSDF output to MeshPhysicalMaterial
 * 3. NodeGraphTextureBridge — Converts texture node outputs to Three.js Textures
 * 4. TextureBakePipeline — Bakes full PBR texture sets from material parameters
 * 5. Material3DEvaluator — Runtime GLSL shader pipeline for 3D material evaluation
 * 6. RuntimeMaterialBuilder — Node graph → GLSL ShaderMaterial conversion
 *
 * Usage:
 *   const pipeline = new MaterialPipeline();
 *
 *   // From a preset name
 *   const mat1 = pipeline.fromPreset('steel');
 *
 *   // From a node graph evaluation result
 *   const bsdfOutput = { BSDF: { type: 'principled_bsdf', baseColor: { r: 0.8, g: 0.2, b: 0.1 }, ... } };
 *   const mat2 = pipeline.fromNodeGraph(bsdfOutput);
 *
 *   // From a preset with baked PBR textures
 *   const mat3 = pipeline.fromPresetBaked('oak');
 *
 *   // From a preset with 3D GLSL shader evaluation (runtime, no baking)
 *   const mat4 = pipeline.create3DMaterial('oak');
 *
 *   // Assign texture maps to an existing material
 *   const mat5 = pipeline.withAllMaps(material, { diffuse: tex, normal: normTex });
 */

import * as THREE from 'three';
import { MaterialPresetLibrary, type MaterialPreset, type MaterialCategory, type PresetVariation } from './MaterialPresetLibrary';
import { NodeGraphMaterialBridge, type BSDFOutput, type NodeEvaluationOutput } from '../../core/nodes/execution/NodeGraphMaterialBridge';
import { NodeGraphTextureBridge, type TextureNodeOutput } from '../../core/nodes/execution/NodeGraphTextureBridge';
import { TextureBakePipeline, type PBRTextureSet, type BakeResolution, type MaterialPBRParams } from './textures/TextureBakePipeline';
import { Material3DEvaluator, CoordinateSpace, type Material3DConfig, DEFAULT_3D_CONFIG } from './Material3DEvaluator';
import { RuntimeMaterialBuilder, type NodeGraph3DConfig } from './RuntimeMaterialBuilder';
import type { NodeGraph } from '../../core/nodes/execution/NodeEvaluator';

// ============================================================================
// Types
// ============================================================================

export interface TextureMaps {
  diffuse?: THREE.Texture;
  normal?: THREE.Texture;
  roughness?: THREE.Texture;
  metallic?: THREE.Texture;
  ao?: THREE.Texture;
  transmission?: THREE.Texture;
  emissive?: THREE.Texture;
  bump?: THREE.Texture;
  opacity?: THREE.Texture;
}

// ============================================================================
// MaterialPipeline
// ============================================================================

export class MaterialPipeline {
  private materialBridge = new NodeGraphMaterialBridge();
  private textureBridge = new NodeGraphTextureBridge();
  private presetLibrary = new MaterialPresetLibrary();
  private bakePipeline = new TextureBakePipeline();
  private evaluator3D = new Material3DEvaluator();
  private runtimeBuilder = new RuntimeMaterialBuilder();

  // ==========================================================================
  // Preset-based Material Creation
  // ==========================================================================

  /**
   * Create material from a preset name.
   * Uses MaterialPresetLibrary parameters → MeshPhysicalMaterial (no baked textures).
   */
  fromPreset(name: string, variation?: Partial<PresetVariation>): THREE.MeshPhysicalMaterial {
    const preset = this.presetLibrary.getPreset(name);
    if (!preset) {
      console.warn(`MaterialPipeline: Unknown preset "${name}", returning default material`);
      return this.createDefaultMaterial();
    }

    return this.createMaterialFromPreset(preset, variation);
  }

  /**
   * Create material from a preset name with full PBR texture bake.
   * Uses TextureBakePipeline to generate albedo, normal, roughness, metallic, AO, height maps.
   */
  fromPresetBaked(name: string, resolution: BakeResolution = 512, variation?: Partial<PresetVariation>): THREE.MeshPhysicalMaterial {
    const preset = this.presetLibrary.getPreset(name);
    if (!preset) {
      console.warn(`MaterialPipeline: Unknown preset "${name}", returning default material`);
      return this.createDefaultMaterial();
    }

    // Apply variation to params
    const params = this.applyVariation(preset.params, variation);

    // Bake PBR texture set
    const textureSet = this.bakePipeline.bakePBRSet(params, {
      category: preset.category,
      resolution,
    });

    // Create material with baked textures
    const material = this.bakePipeline.createMaterial(textureSet, params);

    // Apply physical overrides from preset
    this.applyPhysicalOverrides(material, preset.physicalOverrides);

    material.name = `Pipeline_Baked_${name}`;
    return material;
  }

  /**
   * Create material from a preset, converting it through the BSDF bridge.
   * This converts the preset's MaterialPBRParams to a BSDFOutput, then to a MeshPhysicalMaterial.
   */
  fromPresetViaBridge(name: string): THREE.MeshPhysicalMaterial {
    const preset = this.presetLibrary.getPreset(name);
    if (!preset) {
      console.warn(`MaterialPipeline: Unknown preset "${name}", returning default material`);
      return this.createDefaultMaterial();
    }

    // Convert preset params to BSDFOutput
    const bsdf = this.presetToBSDF(preset);
    const material = this.materialBridge.convert(bsdf);

    // Apply physical overrides
    this.applyPhysicalOverrides(material, preset.physicalOverrides);

    material.name = `Pipeline_Bridge_${name}`;
    return material;
  }

  // ==========================================================================
  // Node Graph-based Material Creation
  // ==========================================================================

  /**
   * Create material from a node graph evaluation result (BSDF output).
   * Processes any texture references in the BSDF output, then converts via materialBridge.
   */
  fromNodeGraph(bsdfOutput: BSDFOutput | NodeEvaluationOutput): THREE.MeshPhysicalMaterial {
    // Process any embedded texture node references
    const processedOutput = this.processTextureReferences(bsdfOutput);
    const material = this.materialBridge.convert(processedOutput);
    material.name = `Pipeline_NodeGraph_${Date.now()}`;
    return material;
  }

  /**
   * Create a texture from a texture node output specification.
   */
  createTexture(textureOutput: TextureNodeOutput): THREE.Texture {
    return this.textureBridge.convert(textureOutput);
  }

  // ==========================================================================
  // 3D Material Evaluation (Runtime GLSL Shader Pipeline)
  // ==========================================================================

  /**
   * Create a 3D-evaluated material from a preset name.
   * Uses the runtime GLSL shader pipeline with triplanar projection instead of
   * baking textures onto 2D canvases. The material is evaluated per-pixel in
   * 3D texture space (Object/World/Generated coordinates).
   *
   * This is more expensive than baked textures but produces seamless materials
   * on arbitrary mesh orientations without UV seam artifacts.
   *
   * @param name - Preset name
   * @param config - Optional 3D evaluation configuration
   * @returns THREE.ShaderMaterial with 3D evaluation
   */
  create3DMaterial(name: string, config?: Partial<Material3DConfig>): THREE.ShaderMaterial {
    const preset = this.presetLibrary.getPreset(name);
    if (!preset) {
      console.warn(`MaterialPipeline: Unknown preset "${name}" for 3D material, returning fallback`);
      return this.createDefault3DMaterial();
    }

    const params = preset.params;
    const cfg: Partial<Material3DConfig> = {
      ...config,
    };

    return this.evaluator3D.createShaderMaterialFromParams(params, cfg);
  }

  /**
   * Create a 3D-evaluated material from a node graph.
   * Uses the RuntimeMaterialBuilder to generate a complete GLSL shader
   * that evaluates the material per-pixel in 3D texture space.
   *
   * @param graph - Node graph defining the material
   * @param config - Optional configuration for the builder
   * @returns THREE.ShaderMaterial with 3D evaluation
   */
  create3DMaterialFromGraph(graph: NodeGraph, config?: Partial<NodeGraph3DConfig>): THREE.ShaderMaterial {
    return this.runtimeBuilder.buildFromNodeGraph(graph, config);
  }

  /**
   * Create a 3D-evaluated material from PBR parameters directly.
   * Convenience method for creating 3D materials without a preset or node graph.
   *
   * @param params - PBR parameters
   * @param config - Optional 3D evaluation configuration
   * @returns THREE.ShaderMaterial with 3D evaluation
   */
  create3DMaterialFromParams(params: MaterialPBRParams, config?: Partial<Material3DConfig>): THREE.ShaderMaterial {
    return this.evaluator3D.createShaderMaterialFromParams(params, config);
  }

  /**
   * Evaluate a material at a specific 3D point (CPU fallback).
   * Useful for offline evaluation, baking, or validation.
   *
   * @param graph - Node graph defining the material
   * @param point - 3D position
   * @param normal - Surface normal at the point
   * @returns PBR parameters at the given point
   */
  evaluateMaterialAtPoint(
    graph: NodeGraph,
    point: THREE.Vector3,
    normal: THREE.Vector3
  ) {
    return this.evaluator3D.evaluateMaterialAtPoint(graph, point, normal);
  }

  /**
   * Update the time uniform for animated 3D materials.
   * Call this in the render loop when the material has animated: true.
   */
  update3DMaterialTime(material: THREE.ShaderMaterial, time: number): void {
    this.evaluator3D.updateTime(material, time);
  }

  /**
   * Update the camera position for a 3D material.
   * Required for proper PBR lighting calculations.
   */
  update3DMaterialCamera(material: THREE.ShaderMaterial, camera: THREE.Camera): void {
    this.evaluator3D.updateCamera(material, camera);
  }

  /**
   * Get the 3D evaluator for advanced usage.
   */
  getEvaluator3D(): Material3DEvaluator {
    return this.evaluator3D;
  }

  /**
   * Get the runtime builder for advanced usage.
   */
  getRuntimeBuilder(): RuntimeMaterialBuilder {
    return this.runtimeBuilder;
  }

  /**
   * Create a default/placeholder 3D material.
   */
  createDefault3DMaterial(): THREE.ShaderMaterial {
    return this.evaluator3D.createShaderMaterialFromParams({
      baseColor: new THREE.Color(0.5, 0.5, 0.5),
      roughness: 0.5,
      metallic: 0.0,
      noiseScale: 5.0,
      noiseDetail: 4,
      normalStrength: 1.0,
      aoStrength: 0.5,
      heightScale: 0.02,
      emissionColor: null,
      emissionStrength: 0,
    });
  }

  // ==========================================================================
  // Material Enhancement
  // ==========================================================================

  /**
   * Assign all provided texture maps to a material.
   * Returns the same material instance for chaining.
   */
  withAllMaps(material: THREE.MeshPhysicalMaterial, maps: TextureMaps): THREE.MeshPhysicalMaterial {
    if (maps.diffuse) {
      material.map = maps.diffuse;
    }
    if (maps.normal) {
      material.normalMap = maps.normal;
    }
    if (maps.roughness) {
      material.roughnessMap = maps.roughness;
    }
    if (maps.metallic) {
      material.metalnessMap = maps.metallic;
    }
    if (maps.ao) {
      material.aoMap = maps.ao;
    }
    if (maps.transmission) {
      (material as any).transmissionMap = maps.transmission;
    }
    if (maps.emissive) {
      material.emissiveMap = maps.emissive;
    }
    if (maps.bump) {
      material.bumpMap = maps.bump;
    }
    if (maps.opacity) {
      material.alphaMap = maps.opacity;
    }

    material.needsUpdate = true;
    return material;
  }

  /**
   * Bake and assign a full PBR texture set to an existing material.
   */
  withBakedTextures(material: THREE.MeshPhysicalMaterial, params: MaterialPBRParams, resolution: BakeResolution = 512): THREE.MeshPhysicalMaterial {
    const textureSet = this.bakePipeline.bakePBRSet(params, { resolution });

    material.map = textureSet.albedo;
    material.normalMap = textureSet.normal;
    material.roughnessMap = textureSet.roughness;
    material.metalnessMap = textureSet.metallic;
    material.aoMap = textureSet.ao;
    material.bumpMap = textureSet.height;
    material.bumpScale = params.heightScale;

    if (textureSet.emission) {
      material.emissiveMap = textureSet.emission;
    }

    material.needsUpdate = true;
    return material;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get all available preset names
   */
  getPresetNames(): string[] {
    return this.presetLibrary.getAllPresets().map(p => p.id);
  }

  /**
   * Get all presets in a category
   */
  getPresetsByCategory(category: MaterialCategory): MaterialPreset[] {
    return this.presetLibrary.getPresetsByCategory(category);
  }

  /**
   * Get a preset by name
   */
  getPreset(name: string): MaterialPreset | undefined {
    return this.presetLibrary.getPreset(name);
  }

  /**
   * Get the underlying bridges for advanced usage
   */
  getMaterialBridge(): NodeGraphMaterialBridge {
    return this.materialBridge;
  }

  getTextureBridge(): NodeGraphTextureBridge {
    return this.textureBridge;
  }

  getBakePipeline(): TextureBakePipeline {
    return this.bakePipeline;
  }

  /**
   * Create a default/placeholder material
   */
  createDefaultMaterial(): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x888888,
      roughness: 0.5,
      metalness: 0.0,
    });
    material.name = 'Pipeline_Default';
    return material;
  }

  // ==========================================================================
  // Internal Helpers
  // ==========================================================================

  /**
   * Convert a MaterialPreset to a BSDFOutput for the bridge
   */
  private presetToBSDF(preset: MaterialPreset): BSDFOutput {
    const params = preset.params;
    const overrides = preset.physicalOverrides;

    const bsdf: BSDFOutput = {
      type: 'principled_bsdf',
      baseColor: params.baseColor,
      roughness: params.roughness,
      metallic: params.metallic,
      ior: overrides?.ior ?? 1.45,
      clearcoat: overrides?.clearcoat ?? 0.0,
      clearcoatRoughness: overrides?.clearcoatRoughness ?? 0.03,
      sheen: overrides?.sheen ?? 0.0,
      sheenColor: overrides?.sheenColor,
      sheenRoughness: overrides?.sheenRoughness,
      transmission: overrides?.transmission ?? 0.0,
      alpha: overrides?.opacity ?? 1.0,
      normalMapStrength: params.normalStrength,
    };

    // Emission
    if (params.emissionColor && params.emissionStrength > 0) {
      bsdf.emissionColor = params.emissionColor;
      bsdf.emissionStrength = params.emissionStrength;
    }

    // Subsurface approximation for fabric-like materials
    if (overrides?.sheen && overrides.sheen > 0.3) {
      bsdf.subsurfaceWeight = 0.1;
    }

    return bsdf;
  }

  /**
   * Create a MeshPhysicalMaterial from a preset (without baking)
   */
  private createMaterialFromPreset(preset: MaterialPreset, variation?: Partial<PresetVariation>): THREE.MeshPhysicalMaterial {
    const params = this.applyVariation(preset.params, variation);

    const material = new THREE.MeshPhysicalMaterial({
      color: params.baseColor,
      roughness: Math.max(0.04, params.roughness),
      metalness: params.metallic,
      bumpScale: params.heightScale,
      normalScale: new THREE.Vector2(params.normalStrength, params.normalStrength),
      aoMapIntensity: params.aoStrength,
    });

    // Apply physical overrides
    this.applyPhysicalOverrides(material, preset.physicalOverrides);

    // Emission
    if (params.emissionColor && params.emissionStrength > 0) {
      material.emissive = params.emissionColor;
      material.emissiveIntensity = params.emissionStrength;
    }

    material.name = `Pipeline_${preset.id}`;
    return material;
  }

  /**
   * Apply PresetVariation (age, wear, moisture, colorShift) to MaterialPBRParams
   */
  private applyVariation(params: MaterialPBRParams, variation?: Partial<PresetVariation>): MaterialPBRParams {
    if (!variation) return params;

    const result = { ...params };

    // Age: darkens and roughens the material
    if (variation.age && variation.age > 0) {
      result.baseColor = result.baseColor.clone().multiplyScalar(1 - variation.age * 0.3);
      result.roughness = Math.min(1, result.roughness + variation.age * 0.2);
    }

    // Wear: increases roughness and reduces metallic
    if (variation.wear && variation.wear > 0) {
      result.roughness = Math.min(1, result.roughness + variation.wear * 0.15);
      result.metallic = Math.max(0, result.metallic - variation.wear * 0.2);
      result.aoStrength = Math.min(1, result.aoStrength + variation.wear * 0.1);
    }

    // Moisture: darkens slightly and reduces roughness
    if (variation.moisture && variation.moisture > 0) {
      result.baseColor = result.baseColor.clone().multiplyScalar(1 - variation.moisture * 0.15);
      result.roughness = Math.max(0.04, result.roughness - variation.moisture * 0.2);
    }

    // Color shift: rotates the hue
    if (variation.colorShift && variation.colorShift > 0) {
      const hsl = { h: 0, s: 0, l: 0 };
      result.baseColor.getHSL(hsl);
      result.baseColor.setHSL(
        (hsl.h + variation.colorShift * 0.2) % 1,
        hsl.s,
        hsl.l
      );
    }

    return result;
  }

  /**
   * Apply physical overrides from a preset to a material
   */
  private applyPhysicalOverrides(
    material: THREE.MeshPhysicalMaterial,
    overrides?: MaterialPreset['physicalOverrides']
  ): void {
    if (!overrides) return;

    if (overrides.clearcoat !== undefined) material.clearcoat = overrides.clearcoat;
    if (overrides.clearcoatRoughness !== undefined) material.clearcoatRoughness = overrides.clearcoatRoughness;
    if (overrides.transmission !== undefined) {
      (material as any).transmission = overrides.transmission;
      if (overrides.transmission > 0) {
        material.transparent = true;
        (material as any).thickness = (material as any).thickness ?? 0.5;
      }
    }
    if (overrides.ior !== undefined) material.ior = overrides.ior;
    if (overrides.thickness !== undefined) (material as any).thickness = overrides.thickness;
    if (overrides.sheen !== undefined) material.sheen = overrides.sheen;
    if (overrides.sheenRoughness !== undefined) material.sheenRoughness = overrides.sheenRoughness;
    if (overrides.sheenColor !== undefined) material.sheenColor = overrides.sheenColor;
    if (overrides.transparent !== undefined) material.transparent = overrides.transparent;
    if (overrides.opacity !== undefined) material.opacity = overrides.opacity;
    if (overrides.side !== undefined) material.side = overrides.side;
    if (overrides.flatShading !== undefined) material.flatShading = overrides.flatShading;

    material.needsUpdate = true;
  }

  /**
   * Process texture references in a BSDF output.
   * If any texture field contains a TextureNodeOutput (instead of an actual Texture),
   * generates the texture via NodeGraphTextureBridge.
   */
  private processTextureReferences(output: BSDFOutput | NodeEvaluationOutput): BSDFOutput | NodeEvaluationOutput {
    // Unwrap if needed
    const bsdf = this.extractBSDFMutable(output);
    if (!bsdf) return output;

    // Check each texture field — if it's a TextureNodeOutput, generate the texture
    const textureFields: (keyof BSDFOutput)[] = [
      'map', 'normalMap', 'roughnessMap', 'metalnessMap',
      'aoMap', 'transmissionMap', 'emissiveMap', 'bumpMap', 'opacityMap',
    ];

    for (const field of textureFields) {
      const value = bsdf[field];
      if (value && typeof value === 'object' && 'type' in value && 'parameters' in value && !(value instanceof THREE.Texture)) {
        // It's a TextureNodeOutput, generate the texture
        const textureNodeOutput = value as unknown as TextureNodeOutput;
        try {
          (bsdf as any)[field] = this.textureBridge.convert(textureNodeOutput);
        } catch (e) {
          console.warn(`MaterialPipeline: Failed to generate texture for field "${field}":`, e);
          delete (bsdf as any)[field];
        }
      }
    }

    // Recursively process nested shaders in mix/add shader
    if (bsdf.shader1 && typeof bsdf.shader1 === 'object') {
      this.processTextureReferences(bsdf.shader1);
    }
    if (bsdf.shader2 && typeof bsdf.shader2 === 'object') {
      this.processTextureReferences(bsdf.shader2);
    }

    return output;
  }

  /**
   * Extract a mutable BSDF output from various formats
   */
  private extractBSDFMutable(output: BSDFOutput | NodeEvaluationOutput): BSDFOutput | null {
    if (!output) return null;

    // Direct BSDFOutput
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
}
