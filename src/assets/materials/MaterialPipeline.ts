/**
 * MaterialPipeline - Unified entry point for material creation
 *
 * The ONE API to get materials, whether from presets or node graphs.
 * MaterialPipeline is the single source of truth for material creation.
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
 *   // THE single entry point — works with names OR node graphs
 *   const mat1 = pipeline.createMaterial('steel');          // from preset name
 *   const mat2 = pipeline.createMaterial(nodeGraph);        // from node graph
 *
 *   // Convenience methods for common scenarios
 *   const mat3 = pipeline.createTerrainMaterial('desert');
 *   const mat4 = pipeline.createCreatureMaterial('reptile', skinConfig);
 *   const mat5 = pipeline.createIndoorMaterial('furniture');
 *
 *   // Low-level access still available
 *   const mat6 = pipeline.fromPreset('steel');
 *   const mat7 = pipeline.fromPresetBaked('oak');
 *   const mat8 = pipeline.create3DMaterial('oak');
 *   const mat9 = pipeline.fromNodeGraph(bsdfOutput);
 */

import * as THREE from 'three';
import { MaterialPresetLibrary, type MaterialPreset, type MaterialCategory, type PresetVariation } from './MaterialPresetLibrary';
import { NodeGraphMaterialBridge, type BSDFOutput, type NodeEvaluationOutput } from '../../core/nodes/execution/NodeGraphMaterialBridge';
import { NodeGraphTextureBridge, type TextureNodeOutput } from '../../core/nodes/execution/NodeGraphTextureBridge';
import { TextureBakePipeline, type PBRTextureSet, type CanvasPBRTextureSet, type BakeResolution, type MaterialPBRParams, type PresetBakeOptions } from './textures/TextureBakePipeline';
import { Material3DEvaluator, CoordinateSpace, type Material3DConfig, DEFAULT_3D_CONFIG } from './Material3DEvaluator';
import { RuntimeMaterialBuilder, type NodeGraph3DConfig } from './RuntimeMaterialBuilder';
import { NodeGraph, NodeEvaluator, EvaluationMode } from '../../core/nodes/execution/NodeEvaluator';
import { evaluateToMaterial, type EvaluateToMaterialOptions, type EvaluateToMaterialResult } from '../../core/nodes/execution/EvaluateToMaterial';

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

/** Input type for createMaterial(): string preset name or NodeGraph */
export type MaterialInput = string | NodeGraph;

/** Configuration for terrain materials */
export interface TerrainMaterialConfig {
  biome: 'desert' | 'tundra' | 'forest' | 'tropical' | 'mountain' | 'volcanic' | 'coastal' | 'grassland';
  moisture?: number;
  temperature?: number;
  elevation?: number;
  variation?: Partial<PresetVariation>;
  resolution?: BakeResolution;
}

/** Configuration for creature materials */
export interface CreatureMaterialConfig {
  skinType: 'fur' | 'scales' | 'feathers' | 'chitin' | 'skin' | 'shell';
  color?: THREE.Color;
  pattern?: 'solid' | 'spotted' | 'striped' | 'mottled';
  scale?: number;
  variation?: Partial<PresetVariation>;
  resolution?: BakeResolution;
}

/** Configuration for indoor materials */
export interface IndoorMaterialConfig {
  category: 'furniture' | 'floor' | 'wall' | 'ceiling' | 'fixture' | 'textile' | 'countertop';
  wear?: number;
  age?: number;
  variation?: Partial<PresetVariation>;
  resolution?: BakeResolution;
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
  // THE Single Entry Point
  // ==========================================================================

  /**
   * Create a material from a preset name or a node graph.
   * This is THE unified entry point — whether you have a string name
   * or a node graph, this method produces a ready-to-use MeshPhysicalMaterial
   * with all PBR maps (diffuse, normal, roughness, metallic, AO).
   *
   * If input is a string: looks up in MaterialPresetLibrary, applies procedural
   * textures via TextureBakePipeline.bakeProceduralSet().
   * If input is a NodeGraph: evaluates through NodeEvaluator → NodeGraphMaterialBridge.
   *
   * @param nameOrGraph - Preset name string or NodeGraph object
   * @param options - Optional: { variation, resolution, useProcedural }
   * @returns Ready-to-use MeshPhysicalMaterial with all maps
   */
  createMaterial(
    nameOrGraph: MaterialInput,
    options?: {
      variation?: Partial<PresetVariation>;
      resolution?: BakeResolution;
      /** Use category-aware procedural bake instead of generic (default: true) */
      useProcedural?: boolean;
    }
  ): THREE.MeshPhysicalMaterial {
    if (typeof nameOrGraph === 'string') {
      return this.createMaterialFromName(nameOrGraph, options);
    } else {
      return this.createMaterialFromGraph(nameOrGraph);
    }
  }

  /**
   * Create a material from a preset name with full PBR textures.
   * Uses the TextureBakePipeline.bakeProceduralSet() for category-aware
   * noise patterns (voronoi for scales, domain warp for wood, etc).
   */
  private createMaterialFromName(
    name: string,
    options?: {
      variation?: Partial<PresetVariation>;
      resolution?: BakeResolution;
      useProcedural?: boolean;
    }
  ): THREE.MeshPhysicalMaterial {
    const preset = this.presetLibrary.getPreset(name);
    if (!preset) {
      console.warn(`MaterialPipeline: Unknown preset "${name}", returning default material`);
      return this.createDefaultMaterial();
    }

    const resolution = options?.resolution ?? 512;
    const useProcedural = options?.useProcedural ?? true;
    const params = this.applyVariation(preset.params, options?.variation);

    // Use the named preset pipeline: name → category detection → procedural bake → material
    const textureSet = this.bakePipeline.bakeFromPresetName(name, params, {
      category: preset.category,
      resolution,
      useProcedural,
      outputFormat: 'data', // MeshPhysicalMaterial works with DataTexture
    }) as PBRTextureSet;

    const material = this.bakePipeline.createMaterial(textureSet, params);
    this.applyPhysicalOverrides(material, preset.physicalOverrides);

    material.name = `Pipeline_${name}`;
    return material;
  }

  /**
   * Create a material from a NodeGraph.
   * Evaluates the node graph through the full NodeEvaluator → NodeGraphMaterialBridge
   * pipeline, then returns a ready-to-use MeshPhysicalMaterial.
   *
   * This properly handles the NodeGraph → evaluation → BSDF → material conversion,
   * unlike the previous broken implementation that just cast the graph to any.
   */
  private createMaterialFromGraph(graph: NodeGraph): THREE.MeshPhysicalMaterial {
    try {
      const result = evaluateToMaterial(graph, {
        fallbackOnErrors: true,
        textureResolution: 512,
        processTextureDescriptors: true,
      });

      if (result.material) {
        // Apply any additional texture processing via the pipeline
        const processedMaterial = this.enhanceFromEvaluatorResult(result.material, result);
        processedMaterial.name = `Pipeline_NodeGraph_${Date.now()}`;
        return processedMaterial;
      }
    } catch (err) {
      console.warn('MaterialPipeline: Node graph evaluation failed, returning default material:', err);
    }

    return this.createDefaultMaterial();
  }

  /**
   * Enhance a material produced by evaluateToMaterial with additional
   * pipeline features (e.g., baked texture enhancement when the evaluator
   * produced only plain properties without textures).
   */
  private enhanceFromEvaluatorResult(
    material: THREE.MeshPhysicalMaterial,
    evalResult: EvaluateToMaterialResult,
  ): THREE.MeshPhysicalMaterial {
    // If the evaluator already produced a material with textures, return as-is
    if (material.map || material.normalMap || material.roughnessMap) {
      return material;
    }

    // If the evaluator produced a material without textures but with PBR parameters,
    // we can optionally bake textures to enhance it.
    // For now, return the evaluator-produced material as-is — it already has
    // proper PBR property values from the BSDF bridge conversion.
    return material;
  }

  // ==========================================================================
  // Convenience Methods
  // ==========================================================================

  /**
   * Create a terrain material for a specific biome.
   *
   * Two calling conventions:
   *   createTerrainMaterial('desert')                          — simple biome name
   *   createTerrainMaterial({ biome: 'desert', moisture: 0.3 }) — full config
   *
   * Maps biome type to the best terrain preset, applies biome-specific
   * parameter overrides (moisture, temperature, elevation), and bakes
   * procedural PBR textures.
   */
  createTerrainMaterial(biomeOrConfig: TerrainMaterialConfig['biome'] | TerrainMaterialConfig): THREE.MeshPhysicalMaterial {
    const config: TerrainMaterialConfig = typeof biomeOrConfig === 'string'
      ? { biome: biomeOrConfig }
      : biomeOrConfig;
    const biomePresets: Record<string, string> = {
      desert: 'sand',
      tundra: 'snow',
      forest: 'dirt',
      tropical: 'mud',
      mountain: 'mountain_rock',
      volcanic: 'lava',
      coastal: 'sandstone',
      grassland: 'soil',
    };

    const presetName = biomePresets[config.biome] ?? 'dirt';
    const preset = this.presetLibrary.getPreset(presetName);
    if (!preset) {
      return this.createDefaultMaterial();
    }

    // Apply biome-specific overrides
    let params = { ...preset.params };

    // Moisture: wetter biomes are darker and smoother
    if (config.moisture !== undefined && config.moisture > 0.5) {
      params.baseColor = params.baseColor.clone().multiplyScalar(1 - config.moisture * 0.15);
      params.roughness = Math.max(0.04, params.roughness - config.moisture * 0.2);
    }

    // Temperature: hotter = more cracks, colder = smoother
    if (config.temperature !== undefined) {
      if (config.temperature > 0.7) {
        params.normalStrength *= 1.3; // More pronounced surface
        params.distortion = Math.max(params.distortion, 0.3);
      } else if (config.temperature < 0.3) {
        params.roughness = Math.max(0.04, params.roughness * 0.8); // Smoother when cold
      }
    }

    // Elevation: higher = more rock-like
    if (config.elevation !== undefined && config.elevation > 0.7) {
      params.noiseScale *= 0.7; // Larger features
      params.heightScale *= 1.5; // More height variation
    }

    const variation = config.variation;
    params = this.applyVariation(params, variation);

    const textureSet = this.bakePipeline.bakeFromPresetName(presetName, params, {
      category: 'terrain',
      resolution: config.resolution ?? 512,
      useProcedural: true,
    }) as PBRTextureSet;

    const material = this.bakePipeline.createMaterial(textureSet, params);
    this.applyPhysicalOverrides(material, preset.physicalOverrides);
    material.name = `Pipeline_Terrain_${config.biome}`;
    return material;
  }

  /**
   * Create a creature material for a specific skin type.
   *
   * Two calling conventions:
   *   createCreatureMaterial('reptile')                              — simple skin type
   *   createCreatureMaterial('reptile', { color: new Color(0.5,0.4,0.3) }) — with overrides
   *   createCreatureMaterial({ skinType: 'reptile', color: ... })     — full config
   *
   * Maps skin type to the best creature preset, applies pattern/color overrides,
   * and bakes procedural PBR textures with voronoi (scales) or musgrave (skin) noise.
   */
  createCreatureMaterial(
    typeOrConfig: CreatureMaterialConfig['skinType'] | CreatureMaterialConfig,
    skinConfig?: Partial<Omit<CreatureMaterialConfig, 'skinType'>>
  ): THREE.MeshPhysicalMaterial {
    const config: CreatureMaterialConfig = typeof typeOrConfig === 'string'
      ? { skinType: typeOrConfig, ...skinConfig }
      : typeOrConfig;
    const skinPresets: Record<string, string> = {
      fur: 'fur',
      scales: 'snake_scale',
      feathers: 'feathers',
      chitin: 'chitin',
      skin: 'reptile',
      shell: 'chitin',
    };

    const presetName = skinPresets[config.skinType] ?? 'fur';
    const preset = this.presetLibrary.getPreset(presetName);
    if (!preset) {
      return this.createDefaultMaterial();
    }

    // Apply creature-specific overrides
    let params = { ...preset.params, baseColor: preset.params.baseColor.clone() };

    // Custom color override
    if (config.color) {
      params.baseColor = config.color.clone();
    }

    // Pattern variation
    if (config.pattern) {
      switch (config.pattern) {
        case 'striped':
          params.distortion = Math.max(params.distortion, 0.4);
          params.warpStrength = Math.max(params.warpStrength, 0.5);
          break;
        case 'spotted':
          params.noiseScale = Math.max(params.noiseScale, 8);
          params.noiseDetail = Math.min(params.noiseDetail + 1, 8);
          break;
        case 'mottled':
          params.noiseScale *= 0.7;
          params.distortion = Math.max(params.distortion, 0.3);
          break;
        case 'solid':
          // No additional variation
          break;
      }
    }

    // Scale override (affects noise frequency)
    if (config.scale !== undefined) {
      params.noiseScale *= config.scale;
    }

    const variation = config.variation;
    params = this.applyVariation(params, variation);

    const textureSet = this.bakePipeline.bakeFromPresetName(presetName, params, {
      category: 'creature',
      resolution: config.resolution ?? 512,
      useProcedural: true,
    }) as PBRTextureSet;

    const material = this.bakePipeline.createMaterial(textureSet, params);
    this.applyPhysicalOverrides(material, preset.physicalOverrides);
    material.name = `Pipeline_Creature_${config.skinType}`;
    return material;
  }

  /**
   * Create an indoor material for a specific category.
   *
   * Two calling conventions:
   *   createIndoorMaterial('furniture')                        — simple category name
   *   createIndoorMaterial({ category: 'furniture', wear: 0.3 }) — full config
   *
   * Maps indoor category to appropriate presets, applies wear/age,
   * and bakes procedural PBR textures.
   */
  createIndoorMaterial(categoryOrConfig: IndoorMaterialConfig['category'] | IndoorMaterialConfig): THREE.MeshPhysicalMaterial {
    const config: IndoorMaterialConfig = typeof categoryOrConfig === 'string'
      ? { category: categoryOrConfig }
      : categoryOrConfig;
    const indoorPresets: Record<string, string> = {
      furniture: 'table_wood',
      floor: 'hardwood_floor',
      wall: 'matte_plastic',
      ceiling: 'matte_plastic',
      fixture: 'chrome',
      textile: 'cotton',
      countertop: 'marble',
    };

    const presetName = indoorPresets[config.category] ?? 'table_wood';
    const preset = this.presetLibrary.getPreset(presetName);
    if (!preset) {
      return this.createDefaultMaterial();
    }

    // Apply indoor-specific overrides
    let params = { ...preset.params, baseColor: preset.params.baseColor.clone() };

    // Wear: increases roughness, reduces clearcoat
    if (config.wear !== undefined && config.wear > 0) {
      params.roughness = Math.min(1, params.roughness + config.wear * 0.2);
      params.aoStrength = Math.min(1, params.aoStrength + config.wear * 0.1);
      params.normalStrength = Math.max(0, params.normalStrength * (1 - config.wear * 0.3));
    }

    // Age: darkens and desaturates
    if (config.age !== undefined && config.age > 0) {
      const hsl = { h: 0, s: 0, l: 0 };
      params.baseColor.getHSL(hsl);
      params.baseColor.setHSL(
        hsl.h,
        Math.max(0, hsl.s * (1 - config.age * 0.3)),
        Math.max(0, hsl.l * (1 - config.age * 0.2))
      );
    }

    const variation = config.variation;
    params = this.applyVariation(params, variation);

    const category = preset.category; // Use the preset's actual category for procedural bake
    const textureSet = this.bakePipeline.bakeFromPresetName(presetName, params, {
      category,
      resolution: config.resolution ?? 512,
      useProcedural: true,
    }) as PBRTextureSet;

    const material = this.bakePipeline.createMaterial(textureSet, params);
    this.applyPhysicalOverrides(material, preset.physicalOverrides);
    material.name = `Pipeline_Indoor_${config.category}`;
    return material;
  }

  // ==========================================================================
  // Preset-based Material Creation (legacy, still available)
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

    // Bake PBR texture set using the named pipeline
    const textureSet = this.bakePipeline.bakeFromPresetName(name, params, {
      category: preset.category,
      resolution,
      useProcedural: true,
    }) as PBRTextureSet;

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
   *
   * Accepts either:
   * - A BSDFOutput or NodeEvaluationOutput (already-evaluated node graph result)
   * - A NodeGraph (will be evaluated through the full pipeline)
   *
   * Processes any texture references in the BSDF output, then converts via materialBridge.
   */
  fromNodeGraph(input: BSDFOutput | NodeEvaluationOutput | NodeGraph): THREE.MeshPhysicalMaterial {
    // If it's a NodeGraph, evaluate it first
    if (this.isNodeGraph(input)) {
      return this.createMaterialFromGraph(input);
    }

    // Process any embedded texture node references
    const processedOutput = this.processTextureReferences(input as BSDFOutput | NodeEvaluationOutput);
    const material = this.materialBridge.convert(processedOutput);
    material.name = `Pipeline_NodeGraph_${Date.now()}`;
    return material;
  }

  /**
   * Check if an input looks like a NodeGraph (has nodes and links)
   * vs a BSDFOutput (has type field) or NodeEvaluationOutput (has BSDF/Emission/Shader)
   */
  private isNodeGraph(input: any): input is NodeGraph {
    if (!input || typeof input !== 'object') return false;
    // NodeGraph has `nodes` (Map) and `links` (array)
    // BSDFOutput has `type` (string)
    // NodeEvaluationOutput has `BSDF`/`Emission`/`Shader`/`Volume`/`Surface`
    if ('type' in input && typeof input.type === 'string') return false;
    if ('BSDF' in input || 'Emission' in input || 'Shader' in input || 'Volume' in input || 'Surface' in input) return false;
    return 'nodes' in input && 'links' in input;
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
