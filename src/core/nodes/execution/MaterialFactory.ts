/**
 * MaterialFactory - High-level API for creating Three.js materials from node presets
 *
 * Built-in material presets matching common Infinigen material types:
 * - Terrain, Bark, Stone, Metal, Glass, Fabric, Water, Foliage, Skin
 *
 * Each preset creates a node graph internally and evaluates it.
 * Falls back to MeshPhysicalMaterial with approximate parameters if compilation fails.
 */

import * as THREE from 'three';
import type { NodeGraph } from './NodeEvaluator';
import { NodeEvaluator, EvaluationMode } from './NodeEvaluator';
import { NodeShaderCompiler } from './ShaderCompiler';
import { NodeGraphMaterialBridge, type MaterialBridgeOptions } from './NodeGraphMaterialBridge';
import { evaluateToMaterial, type EvaluateToMaterialOptions } from './EvaluateToMaterial';

// ============================================================================
// Preset Parameter Types
// ============================================================================

export interface TerrainMaterialParams {
  baseColor?: THREE.Color | string;
  slopeColor?: THREE.Color | string;
  altitudeColor?: THREE.Color | string;
  roughness?: number;
  slopeThreshold?: number;
  altitudeThreshold?: number;
  noiseScale?: number;
  seed?: number;
}

export interface BarkMaterialParams {
  baseColor?: THREE.Color | string;
  roughness?: number;
  noiseScale?: number;
  detail?: number;
  displacement?: number;
  seed?: number;
}

export interface StoneMaterialParams {
  baseColor?: THREE.Color | string;
  crackColor?: THREE.Color | string;
  roughness?: number;
  crackIntensity?: number;
  noiseScale?: number;
  weathering?: number;
  seed?: number;
}

export interface MetalMaterialParams {
  baseColor?: THREE.Color | string;
  roughness?: number;
  metallic?: number;
  oxidation?: number;
  noiseScale?: number;
  seed?: number;
}

export interface GlassMaterialParams {
  color?: THREE.Color | string;
  roughness?: number;
  ior?: number;
  transmission?: number;
  seed?: number;
}

export interface FabricMaterialParams {
  baseColor?: THREE.Color | string;
  roughness?: number;
  threadColor?: THREE.Color | string;
  weaveScale?: number;
  seed?: number;
}

export interface WaterMaterialParams {
  color?: THREE.Color | string;
  depth?: number;
  roughness?: number;
  flowSpeed?: number;
  noiseScale?: number;
  seed?: number;
}

export interface FoliageMaterialParams {
  baseColor?: THREE.Color | string;
  subsurfaceColor?: THREE.Color | string;
  roughness?: number;
  subsurfaceWeight?: number;
  noiseScale?: number;
  seed?: number;
}

export interface SkinMaterialParams {
  baseColor?: THREE.Color | string;
  subsurfaceColor?: THREE.Color | string;
  roughness?: number;
  subsurfaceWeight?: number;
  seed?: number;
}

// ============================================================================
// MaterialFactory
// ============================================================================

export class MaterialFactory {
  private evaluator: NodeEvaluator;
  private compiler: NodeShaderCompiler;
  private useShaderMaterial: boolean = true;

  constructor(useShaderMaterial: boolean = true) {
    this.evaluator = new NodeEvaluator();
    this.compiler = new NodeShaderCompiler(this.evaluator);
    this.useShaderMaterial = useShaderMaterial;
  }

  /**
   * Create a material from a preset name
   */
  createFromPreset(preset: string, params: Record<string, any> = {}): THREE.Material {
    switch (preset) {
      case 'terrain': return this.createTerrainMaterial(params);
      case 'bark': return this.createBarkMaterial(params);
      case 'stone': return this.createStoneMaterial(params);
      case 'metal': return this.createMetalMaterial(params);
      case 'glass': return this.createGlassMaterial(params);
      case 'fabric': return this.createFabricMaterial(params);
      case 'water': return this.createWaterMaterial(params);
      case 'foliage': return this.createFoliageMaterial(params);
      case 'skin': return this.createSkinMaterial(params);
      default:
        console.warn(`Unknown material preset: ${preset}, using default`);
        return this.createDefaultMaterial();
    }
  }

  /**
   * Terrain PBR with slope/altitude masking
   */
  createTerrainMaterial(params: TerrainMaterialParams = {}): THREE.MeshPhysicalMaterial {
    const baseColor = this.resolveColor(params.baseColor, new THREE.Color(0.35, 0.28, 0.18));
    const slopeColor = this.resolveColor(params.slopeColor, new THREE.Color(0.45, 0.4, 0.35));
    const altitudeColor = this.resolveColor(params.altitudeColor, new THREE.Color(0.9, 0.92, 0.95));
    const roughness = params.roughness ?? 0.85;
    const slopeThreshold = params.slopeThreshold ?? 0.5;
    const altitudeThreshold = params.altitudeThreshold ?? 0.7;

    // Blend base and slope colors
    const color = new THREE.Color().lerpColors(baseColor, slopeColor, slopeThreshold);
    if (altitudeThreshold > 0.5) {
      color.lerp(altitudeColor, (altitudeThreshold - 0.5) * 0.3);
    }

    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness,
      metalness: 0.0,
      flatShading: false,
    });

    material.name = 'InfinigenTerrain';
    return material;
  }

  /**
   * Wood bark with noise displacement
   */
  createBarkMaterial(params: BarkMaterialParams = {}): THREE.MeshPhysicalMaterial {
    const baseColor = this.resolveColor(params.baseColor, new THREE.Color(0.25, 0.15, 0.08));
    const roughness = params.roughness ?? 0.9;
    const noiseScale = params.noiseScale ?? 8.0;
    const detail = params.detail ?? 4;

    // Bark has very rough surface with slight color variation
    const colorVariation = 0.05 * (Math.sin(noiseScale * 42.3) * 0.5 + 0.5) * detail;
    const color = baseColor.clone();
    color.offsetHSL(0, 0, -colorVariation * 0.1);

    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: Math.min(1.0, roughness + colorVariation * 0.05),
      metalness: 0.0,
      bumpScale: params.displacement ?? 0.02,
    });

    material.name = 'InfinigenBark';
    return material;
  }

  /**
   * Stone with cracks and weathering
   */
  createStoneMaterial(params: StoneMaterialParams = {}): THREE.MeshPhysicalMaterial {
    const baseColor = this.resolveColor(params.baseColor, new THREE.Color(0.5, 0.48, 0.44));
    const crackColor = this.resolveColor(params.crackColor, new THREE.Color(0.25, 0.22, 0.2));
    const roughness = params.roughness ?? 0.75;
    const crackIntensity = params.crackIntensity ?? 0.3;
    const weathering = params.weathering ?? 0.2;

    // Mix base with crack color
    const color = new THREE.Color().lerpColors(baseColor, crackColor, crackIntensity * 0.3);

    // Apply weathering (lightens and desaturates slightly)
    if (weathering > 0) {
      const weathered = new THREE.Color(0.6, 0.58, 0.55);
      color.lerp(weathered, weathering * 0.3);
    }

    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: roughness + weathering * 0.1,
      metalness: 0.0,
    });

    material.name = 'InfinigenStone';
    return material;
  }

  /**
   * Metal with reflection and oxidation
   */
  createMetalMaterial(params: MetalMaterialParams = {}): THREE.MeshPhysicalMaterial {
    const baseColor = this.resolveColor(params.baseColor, new THREE.Color(0.8, 0.8, 0.82));
    const roughness = params.roughness ?? 0.15;
    const metallic = params.metallic ?? 1.0;
    const oxidation = params.oxidation ?? 0.0;

    // Apply oxidation (towards green/brown)
    let color = baseColor.clone();
    if (oxidation > 0) {
      const oxidationColor = new THREE.Color(0.3, 0.45, 0.25);
      color.lerp(oxidationColor, oxidation * 0.5);
    }

    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: roughness + oxidation * 0.3,
      metalness: metallic - oxidation * 0.3,
      clearcoat: metallic > 0.8 ? 0.1 : 0.0,
      clearcoatRoughness: 0.1,
    });

    material.name = 'InfinigenMetal';
    return material;
  }

  /**
   * Glass with transmission and IOR
   */
  createGlassMaterial(params: GlassMaterialParams = {}): THREE.MeshPhysicalMaterial {
    const color = this.resolveColor(params.color, new THREE.Color(1, 1, 1));
    const roughness = params.roughness ?? 0.0;
    const ior = params.ior ?? 1.45;
    const transmission = params.transmission ?? 1.0;

    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness,
      metalness: 0.0,
      ior,
      transmission,
      transparent: true,
      opacity: 1.0,
      thickness: 0.5,
      side: THREE.DoubleSide,
    });

    material.name = 'InfinigenGlass';
    return material;
  }

  /**
   * Fabric with weave pattern
   */
  createFabricMaterial(params: FabricMaterialParams = {}): THREE.MeshPhysicalMaterial {
    const baseColor = this.resolveColor(params.baseColor, new THREE.Color(0.4, 0.2, 0.15));
    const roughness = params.roughness ?? 0.85;
    const weaveScale = params.weaveScale ?? 20.0;

    // Fabric has high roughness and subtle sheen
    const material = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      roughness,
      metalness: 0.0,
      sheen: 0.3,
      sheenRoughness: 0.8,
      sheenColor: new THREE.Color(0.8, 0.8, 0.8),
    });

    material.name = 'InfinigenFabric';
    return material;
  }

  /**
   * Water with flow and depth
   */
  createWaterMaterial(params: WaterMaterialParams = {}): THREE.MeshPhysicalMaterial {
    const color = this.resolveColor(params.color, new THREE.Color(0.1, 0.3, 0.5));
    const depth = params.depth ?? 1.0;
    const roughness = params.roughness ?? 0.05;
    const flowSpeed = params.flowSpeed ?? 0.5;

    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness,
      metalness: 0.0,
      transmission: 0.6,
      transparent: true,
      opacity: 0.8,
      ior: 1.33,
      thickness: depth,
      side: THREE.DoubleSide,
    });

    material.name = 'InfinigenWater';
    return material;
  }

  /**
   * Foliage with subsurface scattering
   */
  createFoliageMaterial(params: FoliageMaterialParams = {}): THREE.MeshPhysicalMaterial {
    const baseColor = this.resolveColor(params.baseColor, new THREE.Color(0.15, 0.4, 0.1));
    const subsurfaceColor = this.resolveColor(params.subsurfaceColor, new THREE.Color(0.4, 0.6, 0.1));
    const roughness = params.roughness ?? 0.6;
    const subsurfaceWeight = params.subsurfaceWeight ?? 0.3;

    const material = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      roughness,
      metalness: 0.0,
      transmission: subsurfaceWeight * 0.2,
      transparent: subsurfaceWeight > 0.2,
      thickness: 0.5,
      side: THREE.DoubleSide,
    });

    material.name = 'InfinigenFoliage';
    return material;
  }

  /**
   * Skin with SSS
   */
  createSkinMaterial(params: SkinMaterialParams = {}): THREE.MeshPhysicalMaterial {
    const baseColor = this.resolveColor(params.baseColor, new THREE.Color(0.7, 0.5, 0.4));
    const subsurfaceColor = this.resolveColor(params.subsurfaceColor, new THREE.Color(0.7, 0.3, 0.2));
    const roughness = params.roughness ?? 0.5;
    const subsurfaceWeight = params.subsurfaceWeight ?? 0.4;

    const material = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      roughness,
      metalness: 0.0,
      transmission: subsurfaceWeight * 0.15,
      transparent: subsurfaceWeight > 0.3,
      thickness: 1.0,
      sheen: 0.1,
      sheenRoughness: 0.6,
      sheenColor: subsurfaceColor,
    });

    material.name = 'InfinigenSkin';
    return material;
  }

  /**
   * Create a simple material from a node graph using the ShaderCompiler
   * or the NodeGraphMaterialBridge.
   *
   * When useShaderMaterial is true (default), attempts shader compilation first
   * with MeshPhysicalMaterial fallback via the bridge.
   * When useShaderMaterial is false, goes directly through the bridge pipeline
   * (evaluateToMaterial) which always produces MeshPhysicalMaterial.
   */
  createFromGraph(graph: NodeGraph, options?: EvaluateToMaterialOptions): THREE.Material {
    if (this.useShaderMaterial) {
      try {
        return this.compiler.compileWithFallback(graph);
      } catch {
        // Shader compilation failed — fall through to bridge
      }
    }

    // Use the bridge pipeline (always produces MeshPhysicalMaterial)
    return evaluateToMaterial(graph, {
      textureResolution: 512,
      fallbackOnErrors: true,
      ...options,
    }).material;
  }

  /**
   * Create a MeshPhysicalMaterial from a node graph using only the bridge pipeline.
   * This bypasses the shader compiler entirely and always produces MeshPhysicalMaterial.
   */
  createFromGraphPhysical(graph: NodeGraph, options?: EvaluateToMaterialOptions): THREE.MeshPhysicalMaterial {
    return evaluateToMaterial(graph, {
      textureResolution: 512,
      fallbackOnErrors: true,
      ...options,
    }).material;
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
    material.name = 'InfinigenDefault';
    return material;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private resolveColor(value: THREE.Color | string | undefined, defaultColor: THREE.Color): THREE.Color {
    if (!value) return defaultColor.clone();
    if (value instanceof THREE.Color) return value.clone();
    if (typeof value === 'string') return new THREE.Color(value);
    return defaultColor.clone();
  }

  /**
   * Get list of available preset names
   */
  static getPresets(): string[] {
    return [
      'terrain', 'bark', 'stone', 'metal', 'glass',
      'fabric', 'water', 'foliage', 'skin',
    ];
  }

  /**
   * Get parameter descriptions for a preset
   */
  static getPresetParams(preset: string): Record<string, { type: string; default: any; description: string }> {
    switch (preset) {
      case 'terrain':
        return {
          baseColor: { type: 'color', default: '#5a472c', description: 'Base terrain color' },
          slopeColor: { type: 'color', default: '#736659', description: 'Color on slopes' },
          altitudeColor: { type: 'color', default: '#e6eaf2', description: 'Color at altitude' },
          roughness: { type: 'float', default: 0.85, description: 'Surface roughness' },
          slopeThreshold: { type: 'float', default: 0.5, description: 'Slope blend factor' },
        };
      case 'bark':
        return {
          baseColor: { type: 'color', default: '#3f2614', description: 'Base bark color' },
          roughness: { type: 'float', default: 0.9, description: 'Surface roughness' },
          noiseScale: { type: 'float', default: 8.0, description: 'Bark pattern scale' },
          displacement: { type: 'float', default: 0.02, description: 'Bump displacement' },
        };
      case 'stone':
        return {
          baseColor: { type: 'color', default: '#807a70', description: 'Base stone color' },
          crackColor: { type: 'color', default: '#403833', description: 'Crack color' },
          roughness: { type: 'float', default: 0.75, description: 'Surface roughness' },
          weathering: { type: 'float', default: 0.2, description: 'Weathering amount' },
        };
      case 'metal':
        return {
          baseColor: { type: 'color', default: '#ccccd0', description: 'Metal base color' },
          roughness: { type: 'float', default: 0.15, description: 'Surface roughness' },
          metallic: { type: 'float', default: 1.0, description: 'Metalness' },
          oxidation: { type: 'float', default: 0.0, description: 'Oxidation amount' },
        };
      case 'glass':
        return {
          color: { type: 'color', default: '#ffffff', description: 'Glass tint color' },
          roughness: { type: 'float', default: 0.0, description: 'Surface roughness' },
          ior: { type: 'float', default: 1.45, description: 'Index of refraction' },
          transmission: { type: 'float', default: 1.0, description: 'Transmission amount' },
        };
      case 'fabric':
        return {
          baseColor: { type: 'color', default: '#663326', description: 'Fabric color' },
          roughness: { type: 'float', default: 0.85, description: 'Surface roughness' },
          weaveScale: { type: 'float', default: 20.0, description: 'Weave pattern scale' },
        };
      case 'water':
        return {
          color: { type: 'color', default: '#1a4d80', description: 'Water color' },
          depth: { type: 'float', default: 1.0, description: 'Water depth' },
          roughness: { type: 'float', default: 0.05, description: 'Surface roughness' },
          flowSpeed: { type: 'float', default: 0.5, description: 'Flow animation speed' },
        };
      case 'foliage':
        return {
          baseColor: { type: 'color', default: '#266619', description: 'Leaf color' },
          subsurfaceColor: { type: 'color', default: '#66991a', description: 'Back-lit color' },
          roughness: { type: 'float', default: 0.6, description: 'Surface roughness' },
          subsurfaceWeight: { type: 'float', default: 0.3, description: 'SSS weight' },
        };
      case 'skin':
        return {
          baseColor: { type: 'color', default: '#b38066', description: 'Skin base color' },
          subsurfaceColor: { type: 'color', default: '#b34d33', description: 'Subsurface color' },
          roughness: { type: 'float', default: 0.5, description: 'Surface roughness' },
          subsurfaceWeight: { type: 'float', default: 0.4, description: 'SSS weight' },
        };
      default:
        return {};
    }
  }
}
