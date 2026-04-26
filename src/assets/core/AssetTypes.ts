/**
 * AssetTypes.ts
 * 
 * Core TypeScript interfaces and types for all asset categories in Infinigen R3F.
 * Provides type-safe definitions for procedural generators, materials, and loaded assets.
 */

import * as THREE from 'three';

// ============================================================================
// Base Asset Interfaces
// ============================================================================

/**
 * Base interface for all procedural assets
 */
export interface IAsset {
  id: string;
  name: string;
  category: AssetCategory;
  tags: string[];
  lodLevels: number;
  boundingBox: THREE.Box3;
  metadata: AssetMetadata;
}

/**
 * Metadata for asset tracking and serialization
 */
export interface AssetMetadata {
  version: string;
  createdAt: number;
  updatedAt: number;
  author: string;
  description?: string;
  polyCount?: number;
  textureResolution?: number;
  memoryUsage?: number;
  tags?: string[];
  name?: string;
  url?: string;
  type?: string;
  category?: string;
  triangleCount?: number;
  vertexCount?: number;
  materialCount?: number;
  textureCount?: number;
  lodLevels?: any[];
  [key: string]: unknown;
}

/**
 * Asset categories for organization and filtering
 */
export enum AssetCategory {
  VEGETATION = 'vegetation',
  ROCK_TERRAIN = 'rock_terrain',
  WATER_FEATURE = 'water_feature',
  MAN_MADE = 'man_made',
  MISCELLANEOUS = 'miscellaneous',
  MATERIAL = 'material',
  BIOME = 'biome'
}

/**
 * LOD (Level of Detail) configuration
 */
export interface LODConfig {
  distance: number;
  complexity: 'high' | 'medium' | 'low';
  targetFaceCount: number;
  textureResolution: number;
}

/**
 * LOD description for asset metadata
 */
export interface LODDescription {
  level: number;
  distance: number;
  meshUrl?: string;
  faceCount?: number;
}

// ============================================================================
// Procedural Generator Interfaces
// ============================================================================

/**
 * Base interface for procedural object generators
 */
export interface IProceduralGenerator<TParams = any> {
  /**
   * Generate a Three.js mesh from parameters
   */
  generate(params: TParams): THREE.Object3D;
  
  /**
   * Get default parameters for this generator
   */
  getDefaultParams(): TParams;
  
  /**
   * Validate parameters before generation
   */
  validateParams(params: TParams): boolean;
  
  /**
   * Randomize parameters within valid ranges
   */
  randomizeParams(seed?: number): TParams;
}

/**
 * Parameters common to vegetation generators
 */
export interface VegetationParams {
  height: number;
  width: number;
  age: number; // 0-1, young to mature
  health: number; // 0-1, healthy to dying
  season: Season;
  windStrength: number;
  seed: number;
}

/**
 * Seasonal variations for vegetation
 */
export enum Season {
  SPRING = 'spring',
  SUMMER = 'summer',
  AUTUMN = 'autumn',
  WINTER = 'winter'
}

/**
 * Parameters for rock and terrain features
 */
export interface RockTerrainParams {
  size: number;
  roughness: number; // 0-1
  erosion: number; // 0-1
  materialType: RockType;
  seed: number;
}

export enum RockType {
  GRANITE = 'granite',
  LIMESTONE = 'limestone',
  BASALT = 'basalt',
  SLATE = 'slate',
  SANDSTONE = 'sandstone',
  MARBLE = 'marble'
}

/**
 * Parameters for water features
 */
export interface WaterFeatureParams {
  flowRate: number;
  turbulence: number;
  depth: number;
  width: number;
  length: number;
  sedimentLoad: number; // 0-1
  foamAmount: number; // 0-1
  seed: number;
}

/**
 * Parameters for man-made structures
 */
export interface ManMadeParams {
  style: ArchitecturalStyle;
  age: number; // 0-1, new to ancient
  damage: number; // 0-1, pristine to ruined
  materialPrimary: string;
  materialSecondary?: string;
  scale: number;
  seed: number;
}

export enum ArchitecturalStyle {
  MEDIEVAL = 'medieval',
  VICTORIAN = 'victorian',
  MODERN = 'modern',
  RUSTIC = 'rustic',
  INDUSTRIAL = 'industrial',
  FANTASY = 'fantasy'
}

// ============================================================================
// Material Interfaces
// ============================================================================

/**
 * Base interface for PBR materials
 */
export interface IPBRMaterial {
  id: string;
  name: string;
  material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
  properties: MaterialProperties;
  textures: MaterialTextures;
}

/**
 * Physical material properties
 */
export interface MaterialProperties {
  baseColor: THREE.Color;
  roughness: number;
  metalness: number;
  normalScale: number;
  displacementScale: number;
  ambientOcclusion: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  transmission?: number;
  thickness?: number;
  subsurface?: number;
}

/**
 * Material texture maps
 */
export interface MaterialTextures {
  baseColor?: THREE.Texture;
  roughness?: THREE.Texture;
  metalness?: THREE.Texture;
  normal?: THREE.Texture;
  displacement?: THREE.Texture;
  ambientOcclusion?: THREE.Texture;
  emissive?: THREE.Texture;
  alpha?: THREE.Texture;
}

/**
 * Material blending configuration
 */
export interface MaterialBlendConfig {
  materialA: IPBRMaterial;
  materialB: IPBRMaterial;
  blendFactor: number; // 0-1
  blendMode: BlendMode;
  maskTexture?: THREE.Texture;
}

export enum BlendMode {
  LINEAR = 'linear',
  NOISE = 'noise',
  GRADIENT = 'gradient',
  MASK = 'mask'
}

// ============================================================================
// Biome Interfaces
// ============================================================================

/**
 * Biome definition with climate and asset distributions
 */
export interface IBiome {
  id: string;
  name: string;
  climate: ClimateProfile;
  terrain: TerrainProfile;
  vegetation: VegetationDistribution;
  assets: AssetDistribution;
  materials: MaterialDistribution;
}

/**
 * Climate parameters for biome classification
 */
export interface ClimateProfile {
  temperature: number; // -10 to 40 Celsius
  precipitation: number; // mm/year
  humidity: number; // 0-1
  seasonality: number; // 0-1, constant to variable
  elevation: number; // meters
}

/**
 * Terrain characteristics for biome
 */
export interface TerrainProfile {
  slopeRange: [number, number]; // degrees
  roughness: number; // 0-1
  elevationVariation: number; // meters
  waterCoverage: number; // 0-1
  soilType: SoilType;
}

export enum SoilType {
  CLAY = 'clay',
  SAND = 'sand',
  SILT = 'silt',
  LOAM = 'loam',
  PEAT = 'peat',
  ROCK = 'rock'
}

/**
 * Vegetation distribution probabilities
 */
export interface VegetationDistribution {
  treeDensity: number; // trees per hectare
  bushDensity: number;
  grassCoverage: number; // 0-1
  flowerDensity: number;
  speciesWeights: Record<string, number>;
}

/**
 * General asset distribution
 */
export interface AssetDistribution {
  rockDensity: number;
  waterFeatureDensity: number;
  manMadeDensity: number;
  allowedCategories: AssetCategory[];
  excludedCategories: AssetCategory[];
}

/**
 * Material distribution for biome
 */
export interface MaterialDistribution {
  groundMaterials: Record<string, number>; // materialId -> weight
  rockMaterials: Record<string, number>;
  waterMaterial?: string;
  skyMaterial?: string;
}

// ============================================================================
// Loading & Runtime Interfaces
// ============================================================================

/**
 * Asset loading progress
 */
export interface LoadProgress {
  total: number;
  loaded: number;
  failed: number;
  progress: number; // 0-1
  currentAsset?: string;
}

/**
 * Asset loading options
 */
export interface LoadOptions {
  priority?: 'high' | 'normal' | 'low';
  cache?: boolean;
  instantiate?: boolean;
  lodLevel?: number;
  timeout?: number;
}

/**
 * Instanced mesh configuration
 */
export interface InstancingConfig {
  maxInstances: number;
  instanceMatrix: THREE.InstancedBufferAttribute;
  instanceColor?: THREE.InstancedBufferAttribute;
  instanceScale?: THREE.InstancedBufferAttribute;
  boundingSphere: THREE.Sphere;
}

/**
 * Collision mesh configuration
 */
export interface CollisionConfig {
  shape: CollisionShape;
  convex: boolean;
  compound?: boolean;
  children?: CollisionConfig[];
}

export enum CollisionShape {
  BOX = 'box',
  SPHERE = 'sphere',
  CYLINDER = 'cylinder',
  CAPSULE = 'capsule',
  CONVEX_HULL = 'convex_hull',
  MESH = 'mesh'
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Result of asset generation or loading
 */
export type AssetResult<T> = 
  | { success: true; data: T }
  | { success: false; error: Error };

/**
 * Callback for async loading operations
 */
export type LoadCallback<T> = (result: AssetResult<T>) => void;

/**
 * Event types for asset system
 */
export enum AssetEventType {
  LOAD_START = 'load_start',
  LOAD_PROGRESS = 'load_progress',
  LOAD_COMPLETE = 'load_complete',
  LOAD_ERROR = 'load_error',
  CACHE_HIT = 'cache_hit',
  CACHE_MISS = 'cache_miss',
  LOD_SWITCH = 'lod_switch'
}

/**
 * Asset system event
 */
export interface AssetEvent {
  type: AssetEventType;
  assetId?: string;
  progress?: LoadProgress;
  error?: Error;
  timestamp: number;
}
