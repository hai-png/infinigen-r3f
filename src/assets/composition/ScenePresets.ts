/**
 * Scene Presets for Infinigen R3F
 *
 * Preset scene configurations for quick generation:
 * - Nature presets: Alpine Meadow, Tropical Beach, Dense Forest, Desert Canyon, Arctic Tundra, Coral Reef
 *   + Expanded: Canyon, Cliff, Coast, KelpForest, Mountain, Plain, River, SnowyMountain, Underwater
 * - Indoor preset: Living Room
 *   + Expanded: Bedroom, Kitchen, Bathroom, Office, DiningRoom, LivingRoom(Enhanced), Studio, Garage, Library, Attic, Basement, Warehouse
 * - Special: Cave
 *   + Expanded: StereoTraining, MultiviewStereo, NoisyVideo, AssetDemo, Benchmark
 *
 * Each preset defines: terrain params, biome, vegetation density, weather, lighting, creatures
 */

import { Vector3 } from 'three';
import type { NatureSceneConfig, Season, WeatherType } from './NatureSceneComposer';
import type { RoomType } from './IndoorSceneComposer';
import {
  ALL_EXPANDED_PRESETS,
  EXPANDED_PRESET_MAP,
  getExpandedPreset,
  getExpandedPresetsByCategory,
  getExpandedPresetIds,
  getNatureConfigForPreset,
  getRoomTypeForPreset,
  type ExtendedPresetCategory,
} from './ExpandedScenePresets';

// ---------------------------------------------------------------------------
// Preset types
// ---------------------------------------------------------------------------

export type PresetCategory = 'nature' | 'indoor' | 'special';

export interface ScenePreset {
  id: string;
  name: string;
  description: string;
  category: PresetCategory;
  thumbnail: string; // Emoji or color for UI
  natureConfig?: Partial<NatureSceneConfig>;
  indoorRoomType?: RoomType;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const ALPINE_MEADOW: ScenePreset = {
  id: 'alpine_meadow',
  name: 'Alpine Meadow',
  description: 'High altitude meadow with wildflowers, sparse trees, and snow-capped peaks',
  category: 'nature',
  thumbnail: '🏔️',
  natureConfig: {
    terrain: {
      seed: 101,
      scale: 80,
      octaves: 7,
      persistence: 0.55,
      lacunarity: 2.1,
      tectonicPlates: 5,
      seaLevel: 0.15,
      erosionStrength: 0.4,
      erosionIterations: 15,
    },
    season: 'summer',
    vegetation: {
      treeDensity: 0.15,
      bushDensity: 0.2,
      grassDensity: 0.9,
      flowerDensity: 0.6,
      mushroomDensity: 0.05,
      groundCoverDensity: 0.7,
    },
    clouds: {
      enabled: true,
      count: 8,
      altitude: 70,
      spread: 100,
    },
    camera: {
      position: new Vector3(60, 45, 60),
      target: new Vector3(0, 15, 0),
      fov: 60,
      near: 0.5,
      far: 800,
    },
    lighting: {
      sunPosition: new Vector3(50, 80, 30),
      sunIntensity: 2.0,
      sunColor: '#fff8e0',
      ambientIntensity: 0.45,
      ambientColor: '#c8d8f0',
      hemisphereSkyColor: '#87ceeb',
      hemisphereGroundColor: '#5a8f3c',
      hemisphereIntensity: 0.4,
    },
    water: {
      riverEnabled: true,
      lakeEnabled: true,
      waterfallEnabled: true,
      oceanEnabled: false,
      waterLevel: 0.2,
    },
    wind: {
      enabled: true,
      speed: 4.0,
      gustAmplitude: 0.6,
      gustFrequency: 0.4,
      direction: new Vector3(1, 0.1, 0.5).normalize(),
    },
    weather: null,
    creatures: [
      { type: 'ground', count: 2, spawnArea: { center: new Vector3(0, 0, 0), radius: 30 } },
      { type: 'flying', count: 3, spawnArea: { center: new Vector3(0, 40, 0), radius: 50 } },
    ],
  },
};

export const TROPICAL_BEACH: ScenePreset = {
  id: 'tropical_beach',
  name: 'Tropical Beach',
  description: 'Palm trees, turquoise ocean, white sand, and coral reefs',
  category: 'nature',
  thumbnail: '🌴',
  natureConfig: {
    terrain: {
      seed: 202,
      scale: 50,
      octaves: 5,
      persistence: 0.4,
      lacunarity: 2.0,
      tectonicPlates: 2,
      seaLevel: 0.45,
      erosionStrength: 0.1,
      erosionIterations: 5,
    },
    season: 'summer',
    vegetation: {
      treeDensity: 0.3,
      bushDensity: 0.4,
      grassDensity: 0.3,
      flowerDensity: 0.3,
      mushroomDensity: 0.02,
      groundCoverDensity: 0.4,
    },
    clouds: {
      enabled: true,
      count: 5,
      altitude: 90,
      spread: 150,
    },
    camera: {
      position: new Vector3(40, 15, 40),
      target: new Vector3(0, 2, 0),
      fov: 65,
      near: 0.5,
      far: 600,
    },
    lighting: {
      sunPosition: new Vector3(80, 90, 30),
      sunIntensity: 2.2,
      sunColor: '#fffbe0',
      ambientIntensity: 0.5,
      ambientColor: '#e0f0ff',
      hemisphereSkyColor: '#4fc3f7',
      hemisphereGroundColor: '#f5deb3',
      hemisphereIntensity: 0.5,
    },
    water: {
      riverEnabled: false,
      lakeEnabled: false,
      waterfallEnabled: false,
      oceanEnabled: true,
      waterLevel: 0.45,
    },
    wind: {
      enabled: true,
      speed: 2.0,
      gustAmplitude: 0.3,
      gustFrequency: 0.2,
      direction: new Vector3(1, 0, 0).normalize(),
    },
    weather: null,
    creatures: [
      { type: 'flying', count: 5, spawnArea: { center: new Vector3(0, 20, 0), radius: 40 } },
      { type: 'aquatic', count: 4, spawnArea: { center: new Vector3(0, 0, 0), radius: 30 } },
    ],
  },
};

export const DENSE_FOREST: ScenePreset = {
  id: 'dense_forest',
  name: 'Dense Forest',
  description: 'Thick canopy, ferns, mushrooms, and fallen logs',
  category: 'nature',
  thumbnail: '🌲',
  natureConfig: {
    terrain: {
      seed: 303,
      scale: 60,
      octaves: 6,
      persistence: 0.5,
      lacunarity: 2.0,
      tectonicPlates: 3,
      seaLevel: 0.25,
      erosionStrength: 0.2,
      erosionIterations: 8,
    },
    season: 'autumn',
    vegetation: {
      treeDensity: 0.9,
      bushDensity: 0.7,
      grassDensity: 0.5,
      flowerDensity: 0.1,
      mushroomDensity: 0.4,
      groundCoverDensity: 0.9,
    },
    clouds: {
      enabled: true,
      count: 15,
      altitude: 60,
      spread: 80,
    },
    camera: {
      position: new Vector3(30, 20, 30),
      target: new Vector3(0, 5, 0),
      fov: 55,
      near: 0.3,
      far: 200,
    },
    lighting: {
      sunPosition: new Vector3(40, 70, 20),
      sunIntensity: 1.0,
      sunColor: '#ffe8b0',
      ambientIntensity: 0.3,
      ambientColor: '#2a4a1a',
      hemisphereSkyColor: '#5a7a3a',
      hemisphereGroundColor: '#2a3a1a',
      hemisphereIntensity: 0.3,
    },
    water: {
      riverEnabled: true,
      lakeEnabled: true,
      waterfallEnabled: false,
      oceanEnabled: false,
      waterLevel: 0.25,
    },
    wind: {
      enabled: true,
      speed: 2.5,
      gustAmplitude: 0.5,
      gustFrequency: 0.35,
      direction: new Vector3(0.8, 0, 0.4).normalize(),
    },
    weather: null,
    creatures: [
      { type: 'ground', count: 3, spawnArea: { center: new Vector3(0, 0, 0), radius: 25 } },
      { type: 'insect', count: 10, spawnArea: { center: new Vector3(0, 1, 0), radius: 15 } },
    ],
  },
};

export const DESERT_CANYON: ScenePreset = {
  id: 'desert_canyon',
  name: 'Desert Canyon',
  description: 'Red rocks, cacti, sand dunes, and mesas',
  category: 'nature',
  thumbnail: '🏜️',
  natureConfig: {
    terrain: {
      seed: 404,
      scale: 100,
      octaves: 5,
      persistence: 0.6,
      lacunarity: 2.2,
      tectonicPlates: 4,
      seaLevel: 0.1,
      erosionStrength: 0.6,
      erosionIterations: 25,
    },
    season: 'summer',
    vegetation: {
      treeDensity: 0.05,
      bushDensity: 0.1,
      grassDensity: 0.05,
      flowerDensity: 0.02,
      mushroomDensity: 0.0,
      groundCoverDensity: 0.1,
    },
    clouds: {
      enabled: false,
      count: 2,
      altitude: 100,
      spread: 200,
    },
    camera: {
      position: new Vector3(70, 30, 70),
      target: new Vector3(0, 10, 0),
      fov: 55,
      near: 0.5,
      far: 600,
    },
    lighting: {
      sunPosition: new Vector3(90, 80, 50),
      sunIntensity: 2.5,
      sunColor: '#fff0c0',
      ambientIntensity: 0.35,
      ambientColor: '#e8c8a0',
      hemisphereSkyColor: '#ffd700',
      hemisphereGroundColor: '#d2691e',
      hemisphereIntensity: 0.4,
    },
    water: {
      riverEnabled: false,
      lakeEnabled: false,
      waterfallEnabled: false,
      oceanEnabled: false,
      waterLevel: 0.1,
    },
    wind: {
      enabled: true,
      speed: 5.0,
      gustAmplitude: 0.8,
      gustFrequency: 0.5,
      direction: new Vector3(1, 0.1, 0).normalize(),
    },
    weather: { type: 'dust', intensity: 0.3, density: 500 },
    creatures: [
      { type: 'ground', count: 1, spawnArea: { center: new Vector3(0, 0, 0), radius: 40 } },
      { type: 'insect', count: 5, spawnArea: { center: new Vector3(0, 0.5, 0), radius: 20 } },
    ],
  },
};

export const ARCTIC_TUNDRA: ScenePreset = {
  id: 'arctic_tundra',
  name: 'Arctic Tundra',
  description: 'Snow, ice, sparse vegetation, and aurora borealis',
  category: 'nature',
  thumbnail: '❄️',
  natureConfig: {
    terrain: {
      seed: 505,
      scale: 80,
      octaves: 5,
      persistence: 0.45,
      lacunarity: 2.0,
      tectonicPlates: 3,
      seaLevel: 0.2,
      erosionStrength: 0.15,
      erosionIterations: 5,
    },
    season: 'winter',
    vegetation: {
      treeDensity: 0.08,
      bushDensity: 0.05,
      grassDensity: 0.1,
      flowerDensity: 0.0,
      mushroomDensity: 0.0,
      groundCoverDensity: 0.15,
    },
    clouds: {
      enabled: true,
      count: 10,
      altitude: 50,
      spread: 100,
    },
    camera: {
      position: new Vector3(60, 25, 60),
      target: new Vector3(0, 5, 0),
      fov: 55,
      near: 0.5,
      far: 800,
    },
    lighting: {
      sunPosition: new Vector3(20, 30, 10),
      sunIntensity: 0.8,
      sunColor: '#c0d0f0',
      ambientIntensity: 0.6,
      ambientColor: '#a0b0d0',
      hemisphereSkyColor: '#4060a0',
      hemisphereGroundColor: '#e0e8f0',
      hemisphereIntensity: 0.5,
    },
    water: {
      riverEnabled: false,
      lakeEnabled: true,
      waterfallEnabled: false,
      oceanEnabled: true,
      waterLevel: 0.2,
    },
    wind: {
      enabled: true,
      speed: 6.0,
      gustAmplitude: 1.0,
      gustFrequency: 0.6,
      direction: new Vector3(1, 0.05, 0.2).normalize(),
    },
    weather: { type: 'snow', intensity: 0.9, density: 3000 },
    creatures: [
      { type: 'ground', count: 2, spawnArea: { center: new Vector3(0, 0, 0), radius: 40 } },
    ],
  },
};

export const CORAL_REEF: ScenePreset = {
  id: 'coral_reef',
  name: 'Coral Reef',
  description: 'Underwater world with fish, coral, and seaweed',
  category: 'nature',
  thumbnail: '🐠',
  natureConfig: {
    terrain: {
      seed: 606,
      scale: 40,
      octaves: 4,
      persistence: 0.4,
      lacunarity: 2.0,
      tectonicPlates: 2,
      seaLevel: 0.8,
      erosionStrength: 0.05,
      erosionIterations: 3,
    },
    season: 'summer',
    vegetation: {
      treeDensity: 0.0,
      bushDensity: 0.3, // Coral
      grassDensity: 0.5, // Seaweed
      flowerDensity: 0.2, // Anemones
      mushroomDensity: 0.1,
      groundCoverDensity: 0.4,
    },
    clouds: {
      enabled: false,
      count: 0,
      altitude: 100,
      spread: 100,
    },
    camera: {
      position: new Vector3(20, -5, 20),
      target: new Vector3(0, -3, 0),
      fov: 65,
      near: 0.1,
      far: 200,
    },
    lighting: {
      sunPosition: new Vector3(0, 100, 0), // Light from above (through water)
      sunIntensity: 0.6,
      sunColor: '#4080c0',
      ambientIntensity: 0.3,
      ambientColor: '#204060',
      hemisphereSkyColor: '#2060a0',
      hemisphereGroundColor: '#102030',
      hemisphereIntensity: 0.3,
    },
    water: {
      riverEnabled: false,
      lakeEnabled: false,
      waterfallEnabled: false,
      oceanEnabled: true,
      waterLevel: 0.8,
    },
    wind: {
      enabled: false,
      speed: 0,
      gustAmplitude: 0,
      gustFrequency: 0,
      direction: new Vector3(0, 0, 0),
    },
    weather: null,
    creatures: [
      { type: 'aquatic', count: 8, spawnArea: { center: new Vector3(0, -3, 0), radius: 20 } },
    ],
  },
};

export const LIVING_ROOM_PRESET: ScenePreset = {
  id: 'living_room',
  name: 'Living Room',
  description: 'Indoor scene with sofa, TV, bookshelf, and cozy lighting',
  category: 'indoor',
  thumbnail: '🛋️',
  indoorRoomType: 'living_room',
};

export const CAVE_PRESET: ScenePreset = {
  id: 'cave',
  name: 'Cave',
  description: 'Underground cavern with stalactites, crystals, and darkness',
  category: 'special',
  thumbnail: '🕳️',
  natureConfig: {
    terrain: {
      seed: 707,
      scale: 30,
      octaves: 8,
      persistence: 0.7,
      lacunarity: 2.5,
      tectonicPlates: 0,
      seaLevel: 0.0,
      erosionStrength: 0.0,
      erosionIterations: 0,
    },
    season: 'winter',
    vegetation: {
      treeDensity: 0.0,
      bushDensity: 0.0,
      grassDensity: 0.0,
      flowerDensity: 0.0,
      mushroomDensity: 0.3,
      groundCoverDensity: 0.2,
    },
    clouds: {
      enabled: false,
      count: 0,
      altitude: 10,
      spread: 20,
    },
    camera: {
      position: new Vector3(10, 5, 10),
      target: new Vector3(0, 2, 0),
      fov: 70,
      near: 0.1,
      far: 100,
    },
    lighting: {
      sunPosition: new Vector3(0, 10, 0),
      sunIntensity: 0.3,
      sunColor: '#8090b0',
      ambientIntensity: 0.15,
      ambientColor: '#304050',
      hemisphereSkyColor: '#203040',
      hemisphereGroundColor: '#102020',
      hemisphereIntensity: 0.15,
    },
    water: {
      riverEnabled: true,
      lakeEnabled: true,
      waterfallEnabled: false,
      oceanEnabled: false,
      waterLevel: 0.3,
    },
    wind: {
      enabled: false,
      speed: 0,
      gustAmplitude: 0,
      gustFrequency: 0,
      direction: new Vector3(0, 0, 0),
    },
    weather: { type: 'fog', intensity: 0.5, density: 200 },
    creatures: [
      { type: 'insect', count: 3, spawnArea: { center: new Vector3(0, 2, 0), radius: 10 } },
    ],
  },
};

// ---------------------------------------------------------------------------
// All presets
// ---------------------------------------------------------------------------

export const ALL_PRESETS: ScenePreset[] = [
  ALPINE_MEADOW,
  TROPICAL_BEACH,
  DENSE_FOREST,
  DESERT_CANYON,
  ARCTIC_TUNDRA,
  CORAL_REEF,
  LIVING_ROOM_PRESET,
  CAVE_PRESET,
  ...ALL_EXPANDED_PRESETS,
];

export const PRESET_MAP: Record<string, ScenePreset> = Object.fromEntries(
  ALL_PRESETS.map(p => [p.id, p]),
);

/**
 * Get a preset by ID (searches both original and expanded presets)
 */
export function getPreset(id: string): ScenePreset | undefined {
  return PRESET_MAP[id] ?? getExpandedPreset(id);
}

/**
 * Get presets by category (supports extended categories including 'performance')
 */
export function getPresetsByCategory(category: PresetCategory | ExtendedPresetCategory): ScenePreset[] {
  // For standard categories, combine original + expanded
  if (category === 'nature' || category === 'indoor' || category === 'special') {
    const original = ALL_PRESETS.filter(p => p.category === category);
    const expanded = getExpandedPresetsByCategory(category as ExtendedPresetCategory);
    // Deduplicate by id (prefer expanded versions)
    const seen = new Set<string>();
    const combined: ScenePreset[] = [];
    for (const p of [...expanded, ...original]) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        combined.push(p);
      }
    }
    return combined;
  }
  // For performance category, only expanded presets apply
  return getExpandedPresetsByCategory(category as ExtendedPresetCategory);
}

/**
 * Get all preset IDs (including expanded)
 */
export function getPresetIds(): string[] {
  return ALL_PRESETS.map(p => p.id);
}

// Re-export expanded preset utilities
export {
  ALL_EXPANDED_PRESETS,
  EXPANDED_PRESET_MAP,
  getExpandedPreset,
  getExpandedPresetsByCategory,
  getExpandedPresetIds,
  getNatureConfigForPreset,
  getRoomTypeForPreset,
  type ExtendedPresetCategory,
} from './ExpandedScenePresets';
