/**
 * ConfigPresets.ts — Pre-built Configuration Presets
 *
 * Provides ready-to-use configuration presets for common scene types,
 * mirroring the gin-config files used in the original Infinigen project.
 *
 * Each preset is expressed as a config string in the gin-config syntax,
 * and can be loaded via `GinConfig.fromConfigString()`.
 *
 * Presets use `@include base.gin` convention for shared base settings,
 * then add biome-specific overrides.
 */

import { GinConfig, ConfigValue, vec3, color, enumVal } from './GinConfig';

// ============================================================================
// Preset Type
// ============================================================================

/**
 * A named configuration preset.
 */
export interface ConfigPreset {
  /** Unique preset identifier. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Description of the scene this preset creates. */
  description: string;
  /** The config string to apply. */
  configString: string;
  /** Category for UI grouping. */
  category: 'nature' | 'indoor' | 'aquatic' | 'fantasy' | 'custom';
  /** Tags for search/filter. */
  tags: string[];
}

// ============================================================================
// Base Configuration
// ============================================================================

/**
 * Base configuration shared by all presets.
 * Defines the fundamental scene structure and common defaults.
 */
const BASE_CONFIG = `
# Base configuration for all infinigen-r3f scenes
# This is the equivalent of the base.gin file in Infinigen

scene/seed = 42

terrain/TerrainGenerator.seed = 42
terrain/TerrainGenerator.width = 512
terrain/TerrainGenerator.height = 512
terrain/TerrainGenerator.scale = 100
terrain/TerrainGenerator.octaves = 6
terrain/TerrainGenerator.persistence = 0.5
terrain/TerrainGenerator.lacunarity = 2.0
terrain/TerrainGenerator.elevationOffset = 0
terrain/TerrainGenerator.erosionStrength = 0.3
terrain/TerrainGenerator.erosionIterations = 20
terrain/TerrainGenerator.tectonicPlates = 4
terrain/TerrainGenerator.seaLevel = 0.3

terrain/erosion/ErosionSystem.hydraulicErosionEnabled = true
terrain/erosion/ErosionSystem.thermalErosionEnabled = true

terrain/water/WaterSystemManager.enabled = false

weather/WeatherSystem.enabled = true
weather/WeatherSystem.cloudCoverage = 0.3
weather/WeatherSystem.windSpeed = 2.0

weather/TimeOfDaySystem.hour = 12.0
weather/TimeOfDaySystem.month = 6

lighting/LightingSystem.ambientIntensity = 0.4
lighting/LightingSystem.directionalIntensity = 1.0
lighting/LightingSystem.shadowMapSize = 2048

camera/CameraSystem.fov = 60
camera/CameraSystem.near = 0.1
camera/CameraSystem.far = 1000

creatures/CreatureBase.size = 1.0
creatures/CreatureBase.health = 1.0

rendering/RenderingConfig.resolution = {"__type":"Enum","enumName":"Resolution","value":"fhd"}
rendering/RenderingConfig.antialias = true
rendering/RenderingConfig.toneMapping = "aces"
rendering/RenderingConfig.exposure = 1.0
`.trim();

// ============================================================================
// Preset Definitions
// ============================================================================

/**
 * Outdoor nature scene — temperate forest with rolling hills.
 */
export const NATURE_PRESET: ConfigPreset = {
  id: 'nature',
  name: 'Temperate Nature',
  description: 'Outdoor nature scene with rolling hills, deciduous trees, grass, and ambient wildlife.',
  category: 'nature',
  tags: ['outdoor', 'forest', 'temperate', 'nature', 'trees', 'grass'],
  configString: `
@include base.gin

scene/seed = 42

terrain/TerrainGenerator.seed = 42
terrain/TerrainGenerator.persistence = 0.5
terrain/TerrainGenerator.seaLevel = 0.25
terrain/TerrainGenerator.erosionStrength = 0.4

vegetation/TreeGenerator.species = "broadleaf"
vegetation/TreeGenerator.density = 0.15
vegetation/TreeGenerator.sizeVariation = 0.3

vegetation/GrassGenerator.enabled = true
vegetation/GrassGenerator.density = 0.8
vegetation/GrassGenerator.height = 0.15

vegetation/FlowerGenerator.enabled = true
vegetation/FlowerGenerator.density = 0.05

weather/TimeOfDaySystem.hour = 14.0
weather/WeatherSystem.cloudCoverage = 0.2

creatures/CreatureBase.creatureType = {"__type":"Enum","enumName":"CreatureType","value":"mammal"}
creatures/CreatureBase.density = 0.01

terrain/water/WaterSystemManager.enabled = true
terrain/water/RiverNetwork.enabled = true
terrain/water/LakeGenerator.enabled = true
`.trim(),
};

/**
 * Indoor scene — room with furniture and lighting.
 */
export const INDOOR_PRESET: ConfigPreset = {
  id: 'indoor',
  name: 'Indoor Room',
  description: 'Indoor scene with walls, floor, ceiling, furniture, and artificial lighting.',
  category: 'indoor',
  tags: ['indoor', 'room', 'furniture', 'interior'],
  configString: `
@include base.gin

scene/seed = 123

terrain/TerrainGenerator.enabled = false

architectural/FloorPlanSolver.roomCount = 3
architectural/FloorPlanSolver.roomSizeRange = {"__type":"Enum","enumName":"SizeRange","value":"medium"}
architectural/WallGenerator.height = 2.8
architectural/WallGenerator.thickness = 0.15
architectural/FloorGenerator.material = "wood"
architectural/CeilingGenerator.enabled = true

lighting/IndoorLightingSetup.enabled = true
lighting/IndoorLightingSetup.style = "residential"
lighting/IndoorLightingSetup.warmth = 0.7

furniture/TableGenerator.density = 0.05
furniture/ChairGenerator.density = 0.08
furniture/ShelfGenerator.density = 0.03

decor/BookGenerator.density = 0.1
decor/VaseGenerator.density = 0.02
decor/PlantPotGenerator.density = 0.03

weather/WeatherSystem.enabled = false
weather/TimeOfDaySystem.hour = 15.0

terrain/water/WaterSystemManager.enabled = false
`.trim(),
};

/**
 * Alpine biome — high mountains with snow, pine trees, and thin air.
 */
export const ALPINE_PRESET: ConfigPreset = {
  id: 'alpine',
  name: 'Alpine Mountains',
  description: 'High mountain scene with snow-capped peaks, pine forests, rocky terrain, and thin atmosphere.',
  category: 'nature',
  tags: ['outdoor', 'mountain', 'alpine', 'snow', 'pine', 'rocky'],
  configString: `
@include base.gin

scene/seed = 777

terrain/TerrainGenerator.seed = 777
terrain/TerrainGenerator.persistence = 0.6
terrain/TerrainGenerator.seaLevel = 0.15
terrain/TerrainGenerator.erosionStrength = 0.5
terrain/TerrainGenerator.elevationOffset = 0.1
terrain/TerrainGenerator.tectonicPlates = 6

terrain/snow/SnowSystem.enabled = true
terrain/snow/SnowSystem.snowLine = 0.65
terrain/snow/SnowSystem.snowDepth = 0.3
terrain/snow/SnowSystem.snowAngleLimit = 0.7

vegetation/TreeGenerator.species = "pine"
vegetation/TreeGenerator.density = 0.08
vegetation/TreeGenerator.sizeVariation = 0.2
vegetation/TreeGenerator.altitudeLimit = 0.6

vegetation/GrassGenerator.enabled = false

terrain/erosion/GlacialErosion.enabled = true
terrain/erosion/GlacialErosion.strength = 0.7

weather/TimeOfDaySystem.hour = 10.0
weather/WeatherSystem.cloudCoverage = 0.5
weather/WeatherSystem.windSpeed = 5.0
weather/FogSystem.enabled = true
weather/FogSystem.density = 0.002
weather/FogSystem.startDistance = 50

creatures/CreatureBase.creatureType = {"__type":"Enum","enumName":"CreatureType","value":"bird"}
creatures/CreatureBase.density = 0.005

rendering/RenderingConfig.exposure = 0.9
`.trim(),
};

/**
 * Tropical biome — lush vegetation, warm climate, sandy beaches.
 */
export const TROPICAL_PRESET: ConfigPreset = {
  id: 'tropical',
  name: 'Tropical Paradise',
  description: 'Warm tropical scene with palm trees, sandy beaches, coral reefs, and vibrant vegetation.',
  category: 'nature',
  tags: ['outdoor', 'tropical', 'beach', 'palm', 'ocean', 'warm'],
  configString: `
@include base.gin

scene/seed = 999

terrain/TerrainGenerator.seed = 999
terrain/TerrainGenerator.persistence = 0.35
terrain/TerrainGenerator.seaLevel = 0.45
terrain/TerrainGenerator.erosionStrength = 0.15

vegetation/TreeGenerator.species = "palm"
vegetation/TreeGenerator.density = 0.1
vegetation/TreeGenerator.sizeVariation = 0.4

vegetation/TropicPlantGenerator.enabled = true
vegetation/TropicPlantGenerator.density = 0.2
vegetation/FlowerGenerator.enabled = true
vegetation/FlowerGenerator.density = 0.1

vegetation/coral/CoralGrowthAlgorithms.enabled = true
vegetation/coral/CoralGrowthAlgorithms.complexity = 0.7

terrain/water/WaterSystemManager.enabled = true
terrain/water/OceanSystem.enabled = true
terrain/water/OceanSystem.waveHeight = 0.5
terrain/water/OceanSystem.waveFrequency = 0.3
terrain/water/CausticsRenderer.enabled = true

weather/TimeOfDaySystem.hour = 11.0
weather/WeatherSystem.cloudCoverage = 0.15
weather/WeatherSystem.windSpeed = 1.5

creatures/CreatureBase.creatureType = {"__type":"Enum","enumName":"CreatureType","value":"fish"}
creatures/CreatureBase.density = 0.02

lighting/LightingSystem.ambientIntensity = 0.6
lighting/LightingSystem.directionalIntensity = 1.2
rendering/RenderingConfig.exposure = 1.1
`.trim(),
};

/**
 * Ocean/underwater scene — deep sea with coral, fish, and caustic lighting.
 */
export const OCEAN_PRESET: ConfigPreset = {
  id: 'ocean',
  name: 'Deep Ocean',
  description: 'Underwater ocean scene with coral formations, marine life, caustic lighting, and volumetric fog.',
  category: 'aquatic',
  tags: ['underwater', 'ocean', 'coral', 'fish', 'aquatic', 'caustics'],
  configString: `
@include base.gin

scene/seed = 2024

terrain/TerrainGenerator.seed = 2024
terrain/TerrainGenerator.seaLevel = 0.9
terrain/TerrainGenerator.persistence = 0.3
terrain/TerrainGenerator.erosionStrength = 0.1

vegetation/coral/CoralGrowthAlgorithms.enabled = true
vegetation/coral/CoralGrowthAlgorithms.complexity = 0.8
vegetation/coral/CoralGrowthAlgorithms.branchDensity = 0.6

creatures/CreatureBase.creatureType = {"__type":"Enum","enumName":"CreatureType","value":"fish"}
creatures/CreatureBase.density = 0.05

creatures/UnderwaterGenerator.enabled = true
creatures/UnderwaterGenerator.bioluminescence = 0.3

terrain/water/WaterSystemManager.enabled = true
terrain/water/OceanSystem.enabled = true
terrain/water/OceanSystem.waveHeight = 0.2
terrain/water/CausticsRenderer.enabled = true
terrain/water/CausticsRenderer.intensity = 0.8
terrain/water/UnderwaterEffects.enabled = true
terrain/water/UnderwaterEffects.fogDensity = 0.015
terrain/water/UnderwaterEffects.colorShift = {"__type":"Color","r":0.0,"g":0.2,"b":0.4}

weather/WeatherSystem.enabled = false

lighting/LightingSystem.ambientIntensity = 0.3
lighting/LightingSystem.directionalIntensity = 0.5

rendering/RenderingConfig.exposure = 0.8
rendering/RenderingConfig.toneMapping = "aces"
`.trim(),
};

// ============================================================================
// Preset Registry
// ============================================================================

/**
 * All built-in presets, keyed by ID.
 */
export const BUILTIN_PRESETS: Record<string, ConfigPreset> = {
  nature: NATURE_PRESET,
  indoor: INDOOR_PRESET,
  alpine: ALPINE_PRESET,
  tropical: TROPICAL_PRESET,
  ocean: OCEAN_PRESET,
};

/**
 * Get a preset by ID.
 */
export function getPreset(id: string): ConfigPreset | undefined {
  return BUILTIN_PRESETS[id];
}

/**
 * Get all preset IDs.
 */
export function getPresetIds(): string[] {
  return Object.keys(BUILTIN_PRESETS);
}

/**
 * Get all presets in a given category.
 */
export function getPresetsByCategory(category: ConfigPreset['category']): ConfigPreset[] {
  return Object.values(BUILTIN_PRESETS).filter(p => p.category === category);
}

// ============================================================================
// Preset Application
// ============================================================================

/**
 * Apply a preset to a GinConfig instance.
 *
 * This creates a new GinConfig (to avoid polluting an existing one),
 * applies the base config first, then the preset-specific overrides.
 *
 * @param presetId - The preset ID to apply
 * @param seed - Optional seed override
 * @returns A new GinConfig with the preset applied
 */
export function applyPreset(presetId: string, seed?: number): GinConfig {
  const preset = BUILTIN_PRESETS[presetId];
  if (!preset) {
    throw new Error(`Unknown preset: ${presetId}. Available: ${getPresetIds().join(', ')}`);
  }

  const gin = new GinConfig(seed ?? 42);

  // Apply base config first
  gin.fromConfigString(BASE_CONFIG);

  // Then apply preset overrides
  gin.fromConfigString(preset.configString);

  // Override seed if provided
  if (seed !== undefined) {
    gin.seed = seed;
    gin.setOverride('scene', 'seed', seed);
  }

  return gin;
}

/**
 * Get the base config string (useful for includes).
 */
export function getBaseConfigString(): string {
  return BASE_CONFIG;
}

/**
 * Create a custom preset from a config string.
 */
export function createCustomPreset(
  id: string,
  name: string,
  description: string,
  configString: string,
  category: ConfigPreset['category'] = 'custom',
  tags: string[] = [],
): ConfigPreset {
  return {
    id,
    name,
    description,
    configString,
    category,
    tags,
  };
}
