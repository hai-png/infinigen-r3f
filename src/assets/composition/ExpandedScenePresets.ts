/**
 * Expanded Scene Presets for Infinigen R3F
 *
 * Adds 26 new scene configuration presets covering:
 * - Nature Scene Presets (9): Canyon, Cliff, Coast, KelpForest, Mountain, Plain, River, SnowyMountain, Underwater
 * - Indoor Scene Presets (12): Bedroom, Kitchen, Bathroom, Office, DiningRoom, LivingRoom, Studio, Garage, Library, Attic, Basement, Warehouse
 * - Performance/Utility Presets (5): StereoTraining, MultiviewStereo, NoisyVideo, AssetDemo, Benchmark
 *
 * Each preset defines: terrain params, biome, vegetation density, weather, lighting, creatures,
 * camera settings, and object placement rules derived from the original infinigen gin configs.
 */

import { Vector3 } from 'three';
import type { NatureSceneConfig, Season, WeatherType } from './NatureSceneComposer';
import type { RoomType } from './IndoorSceneComposer';
import type { ScenePreset, PresetCategory } from './ScenePresets';

// ---------------------------------------------------------------------------
// Extended preset category
// ---------------------------------------------------------------------------

export type ExtendedPresetCategory = PresetCategory | 'performance';

// ---------------------------------------------------------------------------
// Nature Scene Presets
// ---------------------------------------------------------------------------

/**
 * Canyon: Deep canyon with steep walls, mesa formations
 * Derived from: canyon.gin — LandTiles=Canyons, deep altitude camera, low creatures, haze
 */
export const CANYON: ScenePreset = {
  id: 'canyon',
  name: 'Canyon',
  description: 'Deep canyon with steep walls, mesa formations, and dramatic rock layers',
  category: 'nature',
  thumbnail: '🏜️',
  natureConfig: {
    terrain: {
      seed: 1101,
      scale: 100,
      octaves: 6,
      persistence: 0.65,
      lacunarity: 2.2,
      tectonicPlates: 3,
      seaLevel: 0.05,
      erosionStrength: 0.7,
      erosionIterations: 30,
    },
    season: 'summer',
    vegetation: {
      treeDensity: 0.03,
      bushDensity: 0.05,
      grassDensity: 0.05,
      flowerDensity: 0.01,
      mushroomDensity: 0.0,
      groundCoverDensity: 0.08,
    },
    clouds: {
      enabled: true,
      count: 3,
      altitude: 120,
      spread: 200,
    },
    camera: {
      position: new Vector3(50, 16, 50),
      target: new Vector3(0, 5, 0),
      fov: 55,
      near: 0.5,
      far: 800,
    },
    lighting: {
      sunPosition: new Vector3(70, 85, 40),
      sunIntensity: 2.2,
      sunColor: '#fff0c0',
      ambientIntensity: 0.3,
      ambientColor: '#d8b888',
      hemisphereSkyColor: '#e8c888',
      hemisphereGroundColor: '#c87830',
      hemisphereIntensity: 0.35,
    },
    water: {
      riverEnabled: false,
      lakeEnabled: false,
      waterfallEnabled: false,
      oceanEnabled: false,
      waterLevel: 0.05,
    },
    wind: {
      enabled: true,
      speed: 3.0,
      gustAmplitude: 0.5,
      gustFrequency: 0.3,
      direction: new Vector3(1, 0.05, 0.3).normalize(),
    },
    weather: { type: 'dust', intensity: 0.15, density: 200 },
    creatures: [
      { type: 'ground', count: 1, spawnArea: { center: new Vector3(0, 0, 0), radius: 50 } },
    ],
  },
};

/**
 * Cliff: Coastal or inland cliff with rock formations
 * Derived from: cliff.gin — Mountain+Cliff+Mountain tiles, steep slope, flying birds
 */
export const CLIFF: ScenePreset = {
  id: 'cliff',
  name: 'Cliff',
  description: 'Dramatic cliff face with sheer drops, nesting birds, and wind-swept rock',
  category: 'nature',
  thumbnail: '🧗',
  natureConfig: {
    terrain: {
      seed: 1102,
      scale: 90,
      octaves: 6,
      persistence: 0.6,
      lacunarity: 2.1,
      tectonicPlates: 3,
      seaLevel: 0.15,
      erosionStrength: 0.5,
      erosionIterations: 20,
    },
    season: 'spring',
    vegetation: {
      treeDensity: 0.1,
      bushDensity: 0.15,
      grassDensity: 0.2,
      flowerDensity: 0.05,
      mushroomDensity: 0.02,
      groundCoverDensity: 0.15,
    },
    clouds: {
      enabled: true,
      count: 12,
      altitude: 60,
      spread: 100,
    },
    camera: {
      position: new Vector3(50, 25, 50),
      target: new Vector3(0, 10, 0),
      fov: 55,
      near: 0.5,
      far: 600,
    },
    lighting: {
      sunPosition: new Vector3(60, 80, 30),
      sunIntensity: 1.8,
      sunColor: '#fff5e0',
      ambientIntensity: 0.4,
      ambientColor: '#c8d8e8',
      hemisphereSkyColor: '#87ceeb',
      hemisphereGroundColor: '#8b7355',
      hemisphereIntensity: 0.4,
    },
    water: {
      riverEnabled: false,
      lakeEnabled: false,
      waterfallEnabled: true,
      oceanEnabled: true,
      waterLevel: 0.15,
    },
    wind: {
      enabled: true,
      speed: 6.0,
      gustAmplitude: 1.0,
      gustFrequency: 0.5,
      direction: new Vector3(1, 0.2, 0).normalize(),
    },
    weather: null,
    creatures: [
      { type: 'flying', count: 5, spawnArea: { center: new Vector3(0, 35, 0), radius: 40 } },
      { type: 'ground', count: 2, spawnArea: { center: new Vector3(0, 0, 0), radius: 30 } },
    ],
  },
};

/**
 * Coast: Beach with ocean meeting land, waves, sand
 * Derived from: coast.gin — coastal water, sand, voronoi rocks, bird/crab creatures
 */
export const COAST: ScenePreset = {
  id: 'coast',
  name: 'Coast',
  description: 'Rocky coastline with crashing waves, tidal pools, and seabirds',
  category: 'nature',
  thumbnail: '🌊',
  natureConfig: {
    terrain: {
      seed: 1103,
      scale: 60,
      octaves: 5,
      persistence: 0.45,
      lacunarity: 2.0,
      tectonicPlates: 2,
      seaLevel: 0.4,
      erosionStrength: 0.15,
      erosionIterations: 6,
    },
    season: 'summer',
    vegetation: {
      treeDensity: 0.05,
      bushDensity: 0.1,
      grassDensity: 0.2,
      flowerDensity: 0.05,
      mushroomDensity: 0.01,
      groundCoverDensity: 0.15,
    },
    clouds: {
      enabled: true,
      count: 8,
      altitude: 80,
      spread: 150,
    },
    camera: {
      position: new Vector3(45, 15, 45),
      target: new Vector3(0, 3, 0),
      fov: 60,
      near: 0.3,
      far: 600,
    },
    lighting: {
      sunPosition: new Vector3(80, 85, 20),
      sunIntensity: 2.0,
      sunColor: '#fffbe0',
      ambientIntensity: 0.45,
      ambientColor: '#d0e8f8',
      hemisphereSkyColor: '#5b9bd5',
      hemisphereGroundColor: '#c2b280',
      hemisphereIntensity: 0.45,
    },
    water: {
      riverEnabled: false,
      lakeEnabled: false,
      waterfallEnabled: false,
      oceanEnabled: true,
      waterLevel: 0.4,
    },
    wind: {
      enabled: true,
      speed: 5.0,
      gustAmplitude: 0.8,
      gustFrequency: 0.4,
      direction: new Vector3(1, 0, 0.5).normalize(),
    },
    weather: { type: 'fog', intensity: 0.2, density: 100 },
    creatures: [
      { type: 'flying', count: 6, spawnArea: { center: new Vector3(0, 25, 0), radius: 50 } },
      { type: 'aquatic', count: 3, spawnArea: { center: new Vector3(0, 0, 30), radius: 25 } },
    ],
  },
};

/**
 * KelpForest: Underwater kelp forest with swaying vegetation
 * Derived from: kelp_forest.gin — extends under_water, kelp=1.0, seaweed=0.8, volume fog
 */
export const KELP_FOREST: ScenePreset = {
  id: 'kelp_forest',
  name: 'Kelp Forest',
  description: 'Towering kelp forest swaying in ocean currents with urchins and marine life',
  category: 'nature',
  thumbnail: '🌿',
  natureConfig: {
    terrain: {
      seed: 1104,
      scale: 35,
      octaves: 4,
      persistence: 0.35,
      lacunarity: 2.0,
      tectonicPlates: 2,
      seaLevel: 0.85,
      erosionStrength: 0.03,
      erosionIterations: 2,
    },
    season: 'summer',
    vegetation: {
      treeDensity: 0.0,
      bushDensity: 0.5, // kelp
      grassDensity: 0.7, // seaweed
      flowerDensity: 0.1, // anemones
      mushroomDensity: 0.05,
      groundCoverDensity: 0.3,
    },
    clouds: {
      enabled: false,
      count: 0,
      altitude: 100,
      spread: 100,
    },
    camera: {
      position: new Vector3(15, -3, 15),
      target: new Vector3(0, -5, 0),
      fov: 65,
      near: 0.1,
      far: 150,
    },
    lighting: {
      sunPosition: new Vector3(0, 100, 0),
      sunIntensity: 0.5,
      sunColor: '#3070a0',
      ambientIntensity: 0.35,
      ambientColor: '#1a4060',
      hemisphereSkyColor: '#1860a0',
      hemisphereGroundColor: '#0a2030',
      hemisphereIntensity: 0.3,
    },
    water: {
      riverEnabled: false,
      lakeEnabled: false,
      waterfallEnabled: false,
      oceanEnabled: true,
      waterLevel: 0.85,
    },
    wind: {
      enabled: true, // underwater currents
      speed: 1.0,
      gustAmplitude: 0.3,
      gustFrequency: 0.15,
      direction: new Vector3(0.5, 0, 1).normalize(),
    },
    weather: null,
    creatures: [
      { type: 'aquatic', count: 10, spawnArea: { center: new Vector3(0, -5, 0), radius: 25 } },
    ],
  },
};

/**
 * Mountain: High altitude mountain with sparse vegetation
 * Derived from: mountain.gin — upturned mountains, fog, low tree density, flying creatures
 */
export const MOUNTAIN: ScenePreset = {
  id: 'mountain',
  name: 'Mountain',
  description: 'Majestic mountain peaks with rocky slopes, alpine air, and soaring eagles',
  category: 'nature',
  thumbnail: '⛰️',
  natureConfig: {
    terrain: {
      seed: 1105,
      scale: 100,
      octaves: 7,
      persistence: 0.55,
      lacunarity: 2.1,
      tectonicPlates: 5,
      seaLevel: 0.1,
      erosionStrength: 0.35,
      erosionIterations: 15,
    },
    season: 'summer',
    vegetation: {
      treeDensity: 0.06,
      bushDensity: 0.1,
      grassDensity: 0.2,
      flowerDensity: 0.1,
      mushroomDensity: 0.02,
      groundCoverDensity: 0.15,
    },
    clouds: {
      enabled: true,
      count: 10,
      altitude: 50,
      spread: 80,
    },
    camera: {
      position: new Vector3(70, 50, 70),
      target: new Vector3(0, 25, 0),
      fov: 50,
      near: 0.5,
      far: 1000,
    },
    lighting: {
      sunPosition: new Vector3(50, 90, 30),
      sunIntensity: 2.0,
      sunColor: '#fff8e0',
      ambientIntensity: 0.4,
      ambientColor: '#b8c8e0',
      hemisphereSkyColor: '#6fa8dc',
      hemisphereGroundColor: '#808080',
      hemisphereIntensity: 0.4,
    },
    water: {
      riverEnabled: true,
      lakeEnabled: true,
      waterfallEnabled: true,
      oceanEnabled: false,
      waterLevel: 0.1,
    },
    wind: {
      enabled: true,
      speed: 5.0,
      gustAmplitude: 0.8,
      gustFrequency: 0.5,
      direction: new Vector3(1, 0.1, 0.2).normalize(),
    },
    weather: { type: 'fog', intensity: 0.3, density: 150 },
    creatures: [
      { type: 'flying', count: 3, spawnArea: { center: new Vector3(0, 50, 0), radius: 60 } },
      { type: 'ground', count: 1, spawnArea: { center: new Vector3(0, 0, 0), radius: 40 } },
    ],
  },
};

/**
 * Plain: Flat grassland with scattered features
 * Derived from: plain.gin — low terrain, high grass, dragonflies, no landtiles/warped rocks
 */
export const PLAIN: ScenePreset = {
  id: 'plain',
  name: 'Plain',
  description: 'Vast open grassland with swaying grasses, wildflowers, and dragonflies',
  category: 'nature',
  thumbnail: '🌾',
  natureConfig: {
    terrain: {
      seed: 1106,
      scale: 40,
      octaves: 4,
      persistence: 0.3,
      lacunarity: 1.8,
      tectonicPlates: 1,
      seaLevel: 0.25,
      erosionStrength: 0.05,
      erosionIterations: 3,
    },
    season: 'spring',
    vegetation: {
      treeDensity: 0.02,
      bushDensity: 0.08,
      grassDensity: 0.95,
      flowerDensity: 0.4,
      mushroomDensity: 0.03,
      groundCoverDensity: 0.6,
    },
    clouds: {
      enabled: true,
      count: 15,
      altitude: 90,
      spread: 180,
    },
    camera: {
      position: new Vector3(60, 10, 60),
      target: new Vector3(0, 2, 0),
      fov: 60,
      near: 0.5,
      far: 500,
    },
    lighting: {
      sunPosition: new Vector3(70, 95, 20),
      sunIntensity: 2.2,
      sunColor: '#fffbe6',
      ambientIntensity: 0.5,
      ambientColor: '#c8e0f0',
      hemisphereSkyColor: '#87ceeb',
      hemisphereGroundColor: '#7ccd7c',
      hemisphereIntensity: 0.5,
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
      speed: 4.0,
      gustAmplitude: 0.6,
      gustFrequency: 0.35,
      direction: new Vector3(1, 0, 0.3).normalize(),
    },
    weather: null,
    creatures: [
      { type: 'ground', count: 3, spawnArea: { center: new Vector3(0, 0, 0), radius: 50 } },
      { type: 'flying', count: 6, spawnArea: { center: new Vector3(0, 15, 0), radius: 60 } },
      { type: 'insect', count: 15, spawnArea: { center: new Vector3(0, 1, 0), radius: 30 } },
    ],
  },
};

/**
 * River: Winding river through terrain with vegetation
 * Derived from: river.gin — eroded terrain, river tiles, ivy/lichen/moss, autumn bias
 */
export const RIVER: ScenePreset = {
  id: 'river',
  name: 'River',
  description: 'Winding river through eroded terrain with lush riverbank vegetation',
  category: 'nature',
  thumbnail: '🏞️',
  natureConfig: {
    terrain: {
      seed: 1107,
      scale: 70,
      octaves: 6,
      persistence: 0.5,
      lacunarity: 2.0,
      tectonicPlates: 3,
      seaLevel: 0.2,
      erosionStrength: 0.5,
      erosionIterations: 20,
    },
    season: 'autumn',
    vegetation: {
      treeDensity: 0.3,
      bushDensity: 0.4,
      grassDensity: 0.6,
      flowerDensity: 0.15,
      mushroomDensity: 0.15,
      groundCoverDensity: 0.5,
    },
    clouds: {
      enabled: true,
      count: 8,
      altitude: 70,
      spread: 120,
    },
    camera: {
      position: new Vector3(40, 12, 40),
      target: new Vector3(0, 3, 0),
      fov: 55,
      near: 0.3,
      far: 400,
    },
    lighting: {
      sunPosition: new Vector3(50, 75, 25),
      sunIntensity: 1.6,
      sunColor: '#ffe8b0',
      ambientIntensity: 0.4,
      ambientColor: '#c8a878',
      hemisphereSkyColor: '#8bb8d8',
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
      speed: 3.0,
      gustAmplitude: 0.4,
      gustFrequency: 0.3,
      direction: new Vector3(0.8, 0, 0.5).normalize(),
    },
    weather: null,
    creatures: [
      { type: 'flying', count: 4, spawnArea: { center: new Vector3(0, 20, 0), radius: 35 } },
      { type: 'ground', count: 2, spawnArea: { center: new Vector3(0, 0, 0), radius: 25 } },
      { type: 'insect', count: 8, spawnArea: { center: new Vector3(0, 1, 0), radius: 20 } },
    ],
  },
};

/**
 * SnowyMountain: Winter mountain with heavy snow
 * Derived from: snowy_mountain.gin — snowfall, no waterbody, boulders, high elevation camera
 */
export const SNOWY_MOUNTAIN: ScenePreset = {
  id: 'snowy_mountain',
  name: 'Snowy Mountain',
  description: 'Snow-covered mountain peaks with blizzards, ice formations, and low visibility',
  category: 'nature',
  thumbnail: '🏔️',
  natureConfig: {
    terrain: {
      seed: 1108,
      scale: 100,
      octaves: 7,
      persistence: 0.6,
      lacunarity: 2.1,
      tectonicPlates: 5,
      seaLevel: 0.05,
      erosionStrength: 0.2,
      erosionIterations: 10,
    },
    season: 'winter',
    vegetation: {
      treeDensity: 0.02,
      bushDensity: 0.02,
      grassDensity: 0.05,
      flowerDensity: 0.0,
      mushroomDensity: 0.0,
      groundCoverDensity: 0.05,
    },
    clouds: {
      enabled: true,
      count: 15,
      altitude: 40,
      spread: 80,
    },
    camera: {
      position: new Vector3(60, 40, 60),
      target: new Vector3(0, 15, 0),
      fov: 50,
      near: 0.5,
      far: 600,
    },
    lighting: {
      sunPosition: new Vector3(15, 25, 10),
      sunIntensity: 0.7,
      sunColor: '#d0d8e8',
      ambientIntensity: 0.6,
      ambientColor: '#c0c8d8',
      hemisphereSkyColor: '#6080a0',
      hemisphereGroundColor: '#e0e8f0',
      hemisphereIntensity: 0.55,
    },
    water: {
      riverEnabled: false,
      lakeEnabled: false,
      waterfallEnabled: false,
      oceanEnabled: false,
      waterLevel: 0.05,
    },
    wind: {
      enabled: true,
      speed: 7.0,
      gustAmplitude: 1.2,
      gustFrequency: 0.6,
      direction: new Vector3(1, 0.05, 0.3).normalize(),
    },
    weather: { type: 'snow', intensity: 0.95, density: 4000 },
    creatures: [
      { type: 'flying', count: 2, spawnArea: { center: new Vector3(0, 40, 0), radius: 50 } },
    ],
  },
};

/**
 * Underwater: Deep underwater scene with marine life
 * Derived from: under_water.gin — underwater terrain, volume fog, marine snow, turbulence
 */
export const UNDERWATER: ScenePreset = {
  id: 'underwater',
  name: 'Underwater',
  description: 'Deep underwater world with volumetric light, caustics, and marine snow',
  category: 'nature',
  thumbnail: '🐙',
  natureConfig: {
    terrain: {
      seed: 1109,
      scale: 45,
      octaves: 4,
      persistence: 0.4,
      lacunarity: 2.0,
      tectonicPlates: 2,
      seaLevel: 0.9,
      erosionStrength: 0.04,
      erosionIterations: 3,
    },
    season: 'summer',
    vegetation: {
      treeDensity: 0.0,
      bushDensity: 0.35, // coral structures
      grassDensity: 0.6, // seaweed
      flowerDensity: 0.3, // anemones
      mushroomDensity: 0.15, // sea mushrooms
      groundCoverDensity: 0.5,
    },
    clouds: {
      enabled: false,
      count: 0,
      altitude: 100,
      spread: 100,
    },
    camera: {
      position: new Vector3(25, -8, 25),
      target: new Vector3(0, -10, 0),
      fov: 65,
      near: 0.1,
      far: 200,
    },
    lighting: {
      sunPosition: new Vector3(0, 100, 0),
      sunIntensity: 0.4,
      sunColor: '#2060a0',
      ambientIntensity: 0.25,
      ambientColor: '#103050',
      hemisphereSkyColor: '#1860a0',
      hemisphereGroundColor: '#081828',
      hemisphereIntensity: 0.25,
    },
    water: {
      riverEnabled: false,
      lakeEnabled: false,
      waterfallEnabled: false,
      oceanEnabled: true,
      waterLevel: 0.9,
    },
    wind: {
      enabled: true, // underwater currents / turbulence
      speed: 0.8,
      gustAmplitude: 0.3,
      gustFrequency: 0.1,
      direction: new Vector3(0.3, 0, 0.7).normalize(),
    },
    weather: { type: 'fog', intensity: 0.6, density: 300 },
    creatures: [
      { type: 'aquatic', count: 12, spawnArea: { center: new Vector3(0, -8, 0), radius: 30 } },
    ],
  },
};

// ---------------------------------------------------------------------------
// Indoor Scene Presets
// ---------------------------------------------------------------------------

/**
 * Bedroom: Bed, wardrobe, nightstands, lamp
 */
export const BEDROOM_PRESET: ScenePreset = {
  id: 'bedroom',
  name: 'Bedroom',
  description: 'Cozy bedroom with bed, nightstands, wardrobe, and soft warm lighting',
  category: 'indoor',
  thumbnail: '🛏️',
  indoorRoomType: 'bedroom',
  natureConfig: {
    terrain: {
      seed: 2001,
      scale: 5,
      octaves: 1,
      persistence: 0.1,
      lacunarity: 1.0,
      tectonicPlates: 0,
      seaLevel: 0,
      erosionStrength: 0,
      erosionIterations: 0,
    },
    season: 'winter',
    vegetation: {
      treeDensity: 0,
      bushDensity: 0,
      grassDensity: 0,
      flowerDensity: 0.05, // potted plant
      mushroomDensity: 0,
      groundCoverDensity: 0,
    },
    clouds: { enabled: false, count: 0, altitude: 10, spread: 10 },
    camera: {
      position: new Vector3(3, 1.6, 3),
      target: new Vector3(0, 0.8, 0),
      fov: 65,
      near: 0.1,
      far: 20,
    },
    lighting: {
      sunPosition: new Vector3(2, 3, 1),
      sunIntensity: 0.8,
      sunColor: '#ffe8c0',
      ambientIntensity: 0.5,
      ambientColor: '#f0e0c0',
      hemisphereSkyColor: '#e8d8c0',
      hemisphereGroundColor: '#8b7355',
      hemisphereIntensity: 0.4,
    },
    water: { riverEnabled: false, lakeEnabled: false, waterfallEnabled: false, oceanEnabled: false, waterLevel: 0 },
    wind: { enabled: false, speed: 0, gustAmplitude: 0, gustFrequency: 0, direction: new Vector3(0, 0, 0) },
    weather: null,
    creatures: [],
  },
};

/**
 * Kitchen: Cabinets, countertops, appliances
 */
export const KITCHEN_PRESET: ScenePreset = {
  id: 'kitchen',
  name: 'Kitchen',
  description: 'Modern kitchen with countertops, stove, refrigerator, and island',
  category: 'indoor',
  thumbnail: '🍳',
  indoorRoomType: 'kitchen',
  natureConfig: {
    terrain: {
      seed: 2002,
      scale: 5,
      octaves: 1,
      persistence: 0.1,
      lacunarity: 1.0,
      tectonicPlates: 0,
      seaLevel: 0,
      erosionStrength: 0,
      erosionIterations: 0,
    },
    season: 'summer',
    vegetation: {
      treeDensity: 0,
      bushDensity: 0,
      grassDensity: 0,
      flowerDensity: 0.02, // small herb plant
      mushroomDensity: 0,
      groundCoverDensity: 0,
    },
    clouds: { enabled: false, count: 0, altitude: 10, spread: 10 },
    camera: {
      position: new Vector3(2.5, 1.6, 2.5),
      target: new Vector3(0, 0.9, 0),
      fov: 60,
      near: 0.1,
      far: 15,
    },
    lighting: {
      sunPosition: new Vector3(1, 3, 2),
      sunIntensity: 1.2,
      sunColor: '#fff5e0',
      ambientIntensity: 0.6,
      ambientColor: '#f0f0e8',
      hemisphereSkyColor: '#e8e8e0',
      hemisphereGroundColor: '#d4c5a9',
      hemisphereIntensity: 0.5,
    },
    water: { riverEnabled: false, lakeEnabled: false, waterfallEnabled: false, oceanEnabled: false, waterLevel: 0 },
    wind: { enabled: false, speed: 0, gustAmplitude: 0, gustFrequency: 0, direction: new Vector3(0, 0, 0) },
    weather: null,
    creatures: [],
  },
};

/**
 * Bathroom: Toilet, sink, bathtub, tiles
 */
export const BATHROOM_PRESET: ScenePreset = {
  id: 'bathroom',
  name: 'Bathroom',
  description: 'Clean bathroom with bathtub, toilet, sink, and tiled walls',
  category: 'indoor',
  thumbnail: '🚿',
  indoorRoomType: 'bathroom',
  natureConfig: {
    terrain: {
      seed: 2003,
      scale: 3,
      octaves: 1,
      persistence: 0.1,
      lacunarity: 1.0,
      tectonicPlates: 0,
      seaLevel: 0,
      erosionStrength: 0,
      erosionIterations: 0,
    },
    season: 'summer',
    vegetation: {
      treeDensity: 0,
      bushDensity: 0,
      grassDensity: 0,
      flowerDensity: 0,
      mushroomDensity: 0,
      groundCoverDensity: 0,
    },
    clouds: { enabled: false, count: 0, altitude: 10, spread: 10 },
    camera: {
      position: new Vector3(1.8, 1.5, 1.8),
      target: new Vector3(0, 0.7, 0),
      fov: 65,
      near: 0.1,
      far: 10,
    },
    lighting: {
      sunPosition: new Vector3(0, 3, 1),
      sunIntensity: 1.0,
      sunColor: '#ffffff',
      ambientIntensity: 0.7,
      ambientColor: '#f0f0f0',
      hemisphereSkyColor: '#e8e8e8',
      hemisphereGroundColor: '#e0dcd4',
      hemisphereIntensity: 0.5,
    },
    water: { riverEnabled: false, lakeEnabled: false, waterfallEnabled: false, oceanEnabled: false, waterLevel: 0 },
    wind: { enabled: false, speed: 0, gustAmplitude: 0, gustFrequency: 0, direction: new Vector3(0, 0, 0) },
    weather: { type: 'fog', intensity: 0.3, density: 50 }, // steam
    creatures: [],
  },
};

/**
 * Office: Desk, chair, bookshelf, computer
 */
export const OFFICE_PRESET: ScenePreset = {
  id: 'office',
  name: 'Office',
  description: 'Professional office with desk, ergonomic chair, bookshelf, and task lighting',
  category: 'indoor',
  thumbnail: '💼',
  indoorRoomType: 'office',
  natureConfig: {
    terrain: {
      seed: 2004,
      scale: 5,
      octaves: 1,
      persistence: 0.1,
      lacunarity: 1.0,
      tectonicPlates: 0,
      seaLevel: 0,
      erosionStrength: 0,
      erosionIterations: 0,
    },
    season: 'summer',
    vegetation: {
      treeDensity: 0,
      bushDensity: 0,
      grassDensity: 0,
      flowerDensity: 0.03, // desk plant
      mushroomDensity: 0,
      groundCoverDensity: 0,
    },
    clouds: { enabled: false, count: 0, altitude: 10, spread: 10 },
    camera: {
      position: new Vector3(2.5, 1.6, 2.5),
      target: new Vector3(0, 0.8, 0),
      fov: 60,
      near: 0.1,
      far: 15,
    },
    lighting: {
      sunPosition: new Vector3(1, 3, 0),
      sunIntensity: 1.0,
      sunColor: '#f0f0ff',
      ambientIntensity: 0.6,
      ambientColor: '#e8e8f0',
      hemisphereSkyColor: '#e0e0f0',
      hemisphereGroundColor: '#8b7355',
      hemisphereIntensity: 0.45,
    },
    water: { riverEnabled: false, lakeEnabled: false, waterfallEnabled: false, oceanEnabled: false, waterLevel: 0 },
    wind: { enabled: false, speed: 0, gustAmplitude: 0, gustFrequency: 0, direction: new Vector3(0, 0, 0) },
    weather: null,
    creatures: [],
  },
};

/**
 * DiningRoom: Table, chairs, china cabinet
 */
export const DINING_ROOM_PRESET: ScenePreset = {
  id: 'dining_room',
  name: 'Dining Room',
  description: 'Elegant dining room with table, chairs, china cabinet, and warm chandelier light',
  category: 'indoor',
  thumbnail: '🍽️',
  indoorRoomType: 'dining_room',
  natureConfig: {
    terrain: {
      seed: 2005,
      scale: 6,
      octaves: 1,
      persistence: 0.1,
      lacunarity: 1.0,
      tectonicPlates: 0,
      seaLevel: 0,
      erosionStrength: 0,
      erosionIterations: 0,
    },
    season: 'autumn',
    vegetation: {
      treeDensity: 0,
      bushDensity: 0,
      grassDensity: 0,
      flowerDensity: 0.04, // centerpiece flowers
      mushroomDensity: 0,
      groundCoverDensity: 0,
    },
    clouds: { enabled: false, count: 0, altitude: 10, spread: 10 },
    camera: {
      position: new Vector3(3, 1.6, 3),
      target: new Vector3(0, 0.8, 0),
      fov: 55,
      near: 0.1,
      far: 15,
    },
    lighting: {
      sunPosition: new Vector3(0, 3, 0), // chandelier from above
      sunIntensity: 1.0,
      sunColor: '#ffe8b0',
      ambientIntensity: 0.4,
      ambientColor: '#f0e0c8',
      hemisphereSkyColor: '#f5e6d3',
      hemisphereGroundColor: '#6b4226',
      hemisphereIntensity: 0.35,
    },
    water: { riverEnabled: false, lakeEnabled: false, waterfallEnabled: false, oceanEnabled: false, waterLevel: 0 },
    wind: { enabled: false, speed: 0, gustAmplitude: 0, gustFrequency: 0, direction: new Vector3(0, 0, 0) },
    weather: null,
    creatures: [],
  },
};

/**
 * LivingRoom: Sofa, coffee table, TV, shelves (enhanced preset with full natureConfig)
 */
export const LIVING_ROOM_ENHANCED: ScenePreset = {
  id: 'living_room_enhanced',
  name: 'Living Room (Enhanced)',
  description: 'Spacious living room with sofa, coffee table, TV, bookshelves, and natural window light',
  category: 'indoor',
  thumbnail: '🛋️',
  indoorRoomType: 'living_room',
  natureConfig: {
    terrain: {
      seed: 2006,
      scale: 7,
      octaves: 1,
      persistence: 0.1,
      lacunarity: 1.0,
      tectonicPlates: 0,
      seaLevel: 0,
      erosionStrength: 0,
      erosionIterations: 0,
    },
    season: 'spring',
    vegetation: {
      treeDensity: 0,
      bushDensity: 0,
      grassDensity: 0,
      flowerDensity: 0.05, // potted plants
      mushroomDensity: 0,
      groundCoverDensity: 0,
    },
    clouds: { enabled: false, count: 0, altitude: 10, spread: 10 },
    camera: {
      position: new Vector3(4, 1.6, 3),
      target: new Vector3(0, 0.8, 0),
      fov: 60,
      near: 0.1,
      far: 20,
    },
    lighting: {
      sunPosition: new Vector3(2, 3, -1),
      sunIntensity: 1.2,
      sunColor: '#fff5e0',
      ambientIntensity: 0.5,
      ambientColor: '#e8e0d8',
      hemisphereSkyColor: '#f5f5dc',
      hemisphereGroundColor: '#8b7355',
      hemisphereIntensity: 0.45,
    },
    water: { riverEnabled: false, lakeEnabled: false, waterfallEnabled: false, oceanEnabled: false, waterLevel: 0 },
    wind: { enabled: false, speed: 0, gustAmplitude: 0, gustFrequency: 0, direction: new Vector3(0, 0, 0) },
    weather: null,
    creatures: [],
  },
};

/**
 * Studio: Photography studio with lighting equipment
 */
export const STUDIO_PRESET: ScenePreset = {
  id: 'studio',
  name: 'Studio',
  description: 'Photography studio with backdrop, softboxes, and professional lighting',
  category: 'indoor',
  thumbnail: '📸',
  indoorRoomType: 'studio',
  natureConfig: {
    terrain: {
      seed: 2007,
      scale: 7,
      octaves: 1,
      persistence: 0.1,
      lacunarity: 1.0,
      tectonicPlates: 0,
      seaLevel: 0,
      erosionStrength: 0,
      erosionIterations: 0,
    },
    season: 'summer',
    vegetation: {
      treeDensity: 0,
      bushDensity: 0,
      grassDensity: 0,
      flowerDensity: 0,
      mushroomDensity: 0,
      groundCoverDensity: 0,
    },
    clouds: { enabled: false, count: 0, altitude: 10, spread: 10 },
    camera: {
      position: new Vector3(3, 1.6, 3),
      target: new Vector3(0, 1.0, 1),
      fov: 55,
      near: 0.1,
      far: 15,
    },
    lighting: {
      sunPosition: new Vector3(-2, 3, 1), // studio lights
      sunIntensity: 1.8,
      sunColor: '#ffffff',
      ambientIntensity: 0.3,
      ambientColor: '#f0f0f0',
      hemisphereSkyColor: '#e8e8e8',
      hemisphereGroundColor: '#b0b0b0',
      hemisphereIntensity: 0.3,
    },
    water: { riverEnabled: false, lakeEnabled: false, waterfallEnabled: false, oceanEnabled: false, waterLevel: 0 },
    wind: { enabled: false, speed: 0, gustAmplitude: 0, gustFrequency: 0, direction: new Vector3(0, 0, 0) },
    weather: null,
    creatures: [],
  },
};

/**
 * Garage: Cars, tools, storage
 */
export const GARAGE_PRESET: ScenePreset = {
  id: 'garage',
  name: 'Garage',
  description: 'Residential garage with vehicle, workbench, tool storage, and fluorescent lighting',
  category: 'indoor',
  thumbnail: '🚗',
  indoorRoomType: 'garage',
  natureConfig: {
    terrain: {
      seed: 2008,
      scale: 8,
      octaves: 1,
      persistence: 0.1,
      lacunarity: 1.0,
      tectonicPlates: 0,
      seaLevel: 0,
      erosionStrength: 0,
      erosionIterations: 0,
    },
    season: 'summer',
    vegetation: {
      treeDensity: 0,
      bushDensity: 0,
      grassDensity: 0,
      flowerDensity: 0,
      mushroomDensity: 0,
      groundCoverDensity: 0,
    },
    clouds: { enabled: false, count: 0, altitude: 10, spread: 10 },
    camera: {
      position: new Vector3(4, 1.6, 4),
      target: new Vector3(0, 0.8, 0),
      fov: 65,
      near: 0.1,
      far: 20,
    },
    lighting: {
      sunPosition: new Vector3(0, 3, 0),
      sunIntensity: 1.0,
      sunColor: '#f0f0e8',
      ambientIntensity: 0.6,
      ambientColor: '#d8d8d8',
      hemisphereSkyColor: '#e0e0e0',
      hemisphereGroundColor: '#a0a0a0',
      hemisphereIntensity: 0.4,
    },
    water: { riverEnabled: false, lakeEnabled: false, waterfallEnabled: false, oceanEnabled: false, waterLevel: 0 },
    wind: { enabled: false, speed: 0, gustAmplitude: 0, gustFrequency: 0, direction: new Vector3(0, 0, 0) },
    weather: null,
    creatures: [],
  },
};

/**
 * Library: Bookshelves, reading area, ladder
 */
export const LIBRARY_PRESET: ScenePreset = {
  id: 'library',
  name: 'Library',
  description: 'Classic library with floor-to-ceiling bookshelves, reading chairs, and rolling ladder',
  category: 'indoor',
  thumbnail: '📚',
  indoorRoomType: 'library',
  natureConfig: {
    terrain: {
      seed: 2009,
      scale: 7,
      octaves: 1,
      persistence: 0.1,
      lacunarity: 1.0,
      tectonicPlates: 0,
      seaLevel: 0,
      erosionStrength: 0,
      erosionIterations: 0,
    },
    season: 'autumn',
    vegetation: {
      treeDensity: 0,
      bushDensity: 0,
      grassDensity: 0,
      flowerDensity: 0.02, // small desk plant
      mushroomDensity: 0,
      groundCoverDensity: 0,
    },
    clouds: { enabled: false, count: 0, altitude: 10, spread: 10 },
    camera: {
      position: new Vector3(3.5, 1.6, 3),
      target: new Vector3(0, 1.2, 0),
      fov: 55,
      near: 0.1,
      far: 15,
    },
    lighting: {
      sunPosition: new Vector3(1, 3, 0),
      sunIntensity: 0.8,
      sunColor: '#ffe0a0',
      ambientIntensity: 0.5,
      ambientColor: '#d8c8a0',
      hemisphereSkyColor: '#fff5e6',
      hemisphereGroundColor: '#5c3317',
      hemisphereIntensity: 0.4,
    },
    water: { riverEnabled: false, lakeEnabled: false, waterfallEnabled: false, oceanEnabled: false, waterLevel: 0 },
    wind: { enabled: false, speed: 0, gustAmplitude: 0, gustFrequency: 0, direction: new Vector3(0, 0, 0) },
    weather: null,
    creatures: [],
  },
};

/**
 * Attic: Sloped ceilings, storage boxes
 */
export const ATTIC_PRESET: ScenePreset = {
  id: 'attic',
  name: 'Attic',
  description: 'Dusty attic with sloped ceilings, storage boxes, and dim dormer light',
  category: 'indoor',
  thumbnail: '📦',
  indoorRoomType: 'attic',
  natureConfig: {
    terrain: {
      seed: 2010,
      scale: 5,
      octaves: 1,
      persistence: 0.1,
      lacunarity: 1.0,
      tectonicPlates: 0,
      seaLevel: 0,
      erosionStrength: 0,
      erosionIterations: 0,
    },
    season: 'winter',
    vegetation: {
      treeDensity: 0,
      bushDensity: 0,
      grassDensity: 0,
      flowerDensity: 0,
      mushroomDensity: 0,
      groundCoverDensity: 0,
    },
    clouds: { enabled: false, count: 0, altitude: 10, spread: 10 },
    camera: {
      position: new Vector3(2, 1.3, 2),
      target: new Vector3(0, 0.6, 0),
      fov: 70,
      near: 0.1,
      far: 10,
    },
    lighting: {
      sunPosition: new Vector3(0, 2.5, -1),
      sunIntensity: 0.5,
      sunColor: '#d8c8a0',
      ambientIntensity: 0.4,
      ambientColor: '#c0b090',
      hemisphereSkyColor: '#c8b898',
      hemisphereGroundColor: '#7b5b3a',
      hemisphereIntensity: 0.35,
    },
    water: { riverEnabled: false, lakeEnabled: false, waterfallEnabled: false, oceanEnabled: false, waterLevel: 0 },
    wind: { enabled: false, speed: 0, gustAmplitude: 0, gustFrequency: 0, direction: new Vector3(0, 0, 0) },
    weather: { type: 'dust', intensity: 0.15, density: 80 }, // dust particles
    creatures: [],
  },
};

/**
 * Basement: Utility area, storage
 */
export const BASEMENT_PRESET: ScenePreset = {
  id: 'basement',
  name: 'Basement',
  description: 'Utility basement with furnace, water heater, shelving, and concrete floors',
  category: 'indoor',
  thumbnail: '🔧',
  indoorRoomType: 'basement',
  natureConfig: {
    terrain: {
      seed: 2011,
      scale: 7,
      octaves: 1,
      persistence: 0.1,
      lacunarity: 1.0,
      tectonicPlates: 0,
      seaLevel: 0,
      erosionStrength: 0,
      erosionIterations: 0,
    },
    season: 'winter',
    vegetation: {
      treeDensity: 0,
      bushDensity: 0,
      grassDensity: 0,
      flowerDensity: 0,
      mushroomDensity: 0,
      groundCoverDensity: 0,
    },
    clouds: { enabled: false, count: 0, altitude: 10, spread: 10 },
    camera: {
      position: new Vector3(3, 1.5, 3),
      target: new Vector3(0, 0.7, 0),
      fov: 60,
      near: 0.1,
      far: 15,
    },
    lighting: {
      sunPosition: new Vector3(0, 2.8, 0),
      sunIntensity: 0.7,
      sunColor: '#e8e0d0',
      ambientIntensity: 0.5,
      ambientColor: '#c0c0c0',
      hemisphereSkyColor: '#c8c8c0',
      hemisphereGroundColor: '#909090',
      hemisphereIntensity: 0.35,
    },
    water: { riverEnabled: false, lakeEnabled: false, waterfallEnabled: false, oceanEnabled: false, waterLevel: 0 },
    wind: { enabled: false, speed: 0, gustAmplitude: 0, gustFrequency: 0, direction: new Vector3(0, 0, 0) },
    weather: { type: 'dust', intensity: 0.1, density: 50 },
    creatures: [],
  },
};

/**
 * Warehouse: Industrial shelving, pallets
 */
export const WAREHOUSE_PRESET: ScenePreset = {
  id: 'warehouse',
  name: 'Warehouse',
  description: 'Industrial warehouse with pallet racking, forklift, and high bay lighting',
  category: 'indoor',
  thumbnail: '🏭',
  indoorRoomType: 'warehouse',
  natureConfig: {
    terrain: {
      seed: 2012,
      scale: 15,
      octaves: 1,
      persistence: 0.1,
      lacunarity: 1.0,
      tectonicPlates: 0,
      seaLevel: 0,
      erosionStrength: 0,
      erosionIterations: 0,
    },
    season: 'summer',
    vegetation: {
      treeDensity: 0,
      bushDensity: 0,
      grassDensity: 0,
      flowerDensity: 0,
      mushroomDensity: 0,
      groundCoverDensity: 0,
    },
    clouds: { enabled: false, count: 0, altitude: 10, spread: 10 },
    camera: {
      position: new Vector3(7, 2, 7),
      target: new Vector3(0, 1.5, 0),
      fov: 55,
      near: 0.1,
      far: 40,
    },
    lighting: {
      sunPosition: new Vector3(0, 6, 0),
      sunIntensity: 1.2,
      sunColor: '#f0f0e0',
      ambientIntensity: 0.5,
      ambientColor: '#c8c8c0',
      hemisphereSkyColor: '#d0d0c8',
      hemisphereGroundColor: '#808080',
      hemisphereIntensity: 0.35,
    },
    water: { riverEnabled: false, lakeEnabled: false, waterfallEnabled: false, oceanEnabled: false, waterLevel: 0 },
    wind: { enabled: false, speed: 0, gustAmplitude: 0, gustFrequency: 0, direction: new Vector3(0, 0, 0) },
    weather: { type: 'dust', intensity: 0.08, density: 40 },
    creatures: [],
  },
};

// ---------------------------------------------------------------------------
// Performance / Utility Presets
// ---------------------------------------------------------------------------

/**
 * StereoTraining: Multi-view stereo camera setup
 * Designed for training multi-view stereo models with structured camera positions
 */
export const STEREO_TRAINING: ScenePreset = {
  id: 'stereo_training',
  name: 'Stereo Training',
  description: 'Multi-view stereo camera setup with structured viewpoints for MVS training data',
  category: 'special',
  thumbnail: '🔬',
  natureConfig: {
    terrain: {
      seed: 3001,
      scale: 50,
      octaves: 5,
      persistence: 0.5,
      lacunarity: 2.0,
      tectonicPlates: 3,
      seaLevel: 0.3,
      erosionStrength: 0.2,
      erosionIterations: 8,
    },
    season: 'summer',
    vegetation: {
      treeDensity: 0.3,
      bushDensity: 0.3,
      grassDensity: 0.5,
      flowerDensity: 0.1,
      mushroomDensity: 0.05,
      groundCoverDensity: 0.4,
    },
    clouds: {
      enabled: false, // consistent lighting
      count: 0,
      altitude: 100,
      spread: 100,
    },
    camera: {
      position: new Vector3(30, 20, 30),
      target: new Vector3(0, 5, 0),
      fov: 50,
      near: 0.1,
      far: 300,
    },
    lighting: {
      sunPosition: new Vector3(50, 90, 30),
      sunIntensity: 1.8,
      sunColor: '#ffffff',
      ambientIntensity: 0.5,
      ambientColor: '#d0d0d0',
      hemisphereSkyColor: '#87ceeb',
      hemisphereGroundColor: '#5a8f3c',
      hemisphereIntensity: 0.4,
    },
    water: {
      riverEnabled: true,
      lakeEnabled: true,
      waterfallEnabled: false,
      oceanEnabled: false,
      waterLevel: 0.3,
    },
    wind: {
      enabled: false, // no movement for consistent captures
      speed: 0,
      gustAmplitude: 0,
      gustFrequency: 0,
      direction: new Vector3(0, 0, 0),
    },
    weather: null, // clear weather for consistent captures
    creatures: [], // no dynamic elements
  },
};

/**
 * MultiviewStereo: Ring of cameras for MVS
 * 360-degree camera ring arrangement for dense reconstruction
 */
export const MULTIVIEW_STEREO: ScenePreset = {
  id: 'multiview_stereo',
  name: 'Multiview Stereo',
  description: 'Ring of cameras for multi-view stereo reconstruction with varied terrain features',
  category: 'special',
  thumbnail: '🔄',
  natureConfig: {
    terrain: {
      seed: 3002,
      scale: 60,
      octaves: 6,
      persistence: 0.55,
      lacunarity: 2.0,
      tectonicPlates: 4,
      seaLevel: 0.25,
      erosionStrength: 0.3,
      erosionIterations: 12,
    },
    season: 'summer',
    vegetation: {
      treeDensity: 0.2,
      bushDensity: 0.25,
      grassDensity: 0.5,
      flowerDensity: 0.15,
      mushroomDensity: 0.05,
      groundCoverDensity: 0.4,
    },
    clouds: {
      enabled: false,
      count: 0,
      altitude: 100,
      spread: 100,
    },
    camera: {
      position: new Vector3(40, 25, 0), // one of the ring positions
      target: new Vector3(0, 8, 0),
      fov: 45,
      near: 0.1,
      far: 400,
    },
    lighting: {
      sunPosition: new Vector3(60, 95, 40),
      sunIntensity: 2.0,
      sunColor: '#fffbe6',
      ambientIntensity: 0.45,
      ambientColor: '#c8d8e8',
      hemisphereSkyColor: '#87ceeb',
      hemisphereGroundColor: '#5a8f3c',
      hemisphereIntensity: 0.4,
    },
    water: {
      riverEnabled: true,
      lakeEnabled: false,
      waterfallEnabled: false,
      oceanEnabled: false,
      waterLevel: 0.25,
    },
    wind: {
      enabled: false,
      speed: 0,
      gustAmplitude: 0,
      gustFrequency: 0,
      direction: new Vector3(0, 0, 0),
    },
    weather: null,
    creatures: [],
  },
};

/**
 * NoisyVideo: Video with motion blur and noise
 * Stress-test preset for video generation with challenging conditions
 */
export const NOISY_VIDEO: ScenePreset = {
  id: 'noisy_video',
  name: 'Noisy Video',
  description: 'Video stress-test scene with motion blur, atmospheric noise, and dynamic elements',
  category: 'special',
  thumbnail: '📺',
  natureConfig: {
    terrain: {
      seed: 3003,
      scale: 65,
      octaves: 6,
      persistence: 0.5,
      lacunarity: 2.0,
      tectonicPlates: 3,
      seaLevel: 0.3,
      erosionStrength: 0.25,
      erosionIterations: 10,
    },
    season: 'autumn',
    vegetation: {
      treeDensity: 0.5,
      bushDensity: 0.4,
      grassDensity: 0.6,
      flowerDensity: 0.2,
      mushroomDensity: 0.15,
      groundCoverDensity: 0.7,
    },
    clouds: {
      enabled: true,
      count: 20,
      altitude: 50,
      spread: 80,
    },
    camera: {
      position: new Vector3(35, 15, 35),
      target: new Vector3(0, 5, 0),
      fov: 70,
      near: 0.3,
      far: 300,
    },
    lighting: {
      sunPosition: new Vector3(30, 60, 20), // low sun for dramatic shadows
      sunIntensity: 1.2,
      sunColor: '#ffc880',
      ambientIntensity: 0.3,
      ambientColor: '#a0a0c0',
      hemisphereSkyColor: '#708090',
      hemisphereGroundColor: '#5a5a3c',
      hemisphereIntensity: 0.3,
    },
    water: {
      riverEnabled: true,
      lakeEnabled: true,
      waterfallEnabled: true,
      oceanEnabled: false,
      waterLevel: 0.3,
    },
    wind: {
      enabled: true,
      speed: 7.0,
      gustAmplitude: 1.5,
      gustFrequency: 0.6,
      direction: new Vector3(1, 0.1, 0.3).normalize(),
    },
    weather: { type: 'rain', intensity: 0.6, density: 2000 },
    creatures: [
      { type: 'ground', count: 3, spawnArea: { center: new Vector3(0, 0, 0), radius: 25 } },
      { type: 'flying', count: 5, spawnArea: { center: new Vector3(0, 25, 0), radius: 35 } },
      { type: 'insect', count: 10, spawnArea: { center: new Vector3(0, 1, 0), radius: 15 } },
    ],
  },
};

/**
 * AssetDemo: Clean lighting for asset showcase
 * Neutral environment optimized for showcasing individual assets
 */
export const ASSET_DEMO: ScenePreset = {
  id: 'asset_demo',
  name: 'Asset Demo',
  description: 'Clean, neutral lighting environment optimized for showcasing individual 3D assets',
  category: 'special',
  thumbnail: '💎',
  natureConfig: {
    terrain: {
      seed: 3004,
      scale: 30,
      octaves: 3,
      persistence: 0.3,
      lacunarity: 1.8,
      tectonicPlates: 1,
      seaLevel: 0.0,
      erosionStrength: 0.05,
      erosionIterations: 2,
    },
    season: 'summer',
    vegetation: {
      treeDensity: 0.0,
      bushDensity: 0.0,
      grassDensity: 0.1,
      flowerDensity: 0.0,
      mushroomDensity: 0.0,
      groundCoverDensity: 0.05,
    },
    clouds: {
      enabled: false,
      count: 0,
      altitude: 100,
      spread: 100,
    },
    camera: {
      position: new Vector3(8, 5, 8),
      target: new Vector3(0, 1, 0),
      fov: 45,
      near: 0.1,
      far: 100,
    },
    lighting: {
      sunPosition: new Vector3(5, 10, 5),
      sunIntensity: 1.5,
      sunColor: '#ffffff',
      ambientIntensity: 0.7,
      ambientColor: '#e0e0e0',
      hemisphereSkyColor: '#d0d0d0',
      hemisphereGroundColor: '#a0a0a0',
      hemisphereIntensity: 0.5,
    },
    water: {
      riverEnabled: false,
      lakeEnabled: false,
      waterfallEnabled: false,
      oceanEnabled: false,
      waterLevel: 0,
    },
    wind: {
      enabled: false,
      speed: 0,
      gustAmplitude: 0,
      gustFrequency: 0,
      direction: new Vector3(0, 0, 0),
    },
    weather: null,
    creatures: [],
  },
};

/**
 * Benchmark: Standardized benchmark scene
 * Consistent scene for performance benchmarking with representative complexity
 */
export const BENCHMARK: ScenePreset = {
  id: 'benchmark',
  name: 'Benchmark',
  description: 'Standardized benchmark scene with balanced complexity for performance testing',
  category: 'special',
  thumbnail: '⏱️',
  natureConfig: {
    terrain: {
      seed: 3005,
      scale: 60,
      octaves: 6,
      persistence: 0.5,
      lacunarity: 2.0,
      tectonicPlates: 3,
      seaLevel: 0.3,
      erosionStrength: 0.3,
      erosionIterations: 10,
    },
    season: 'summer',
    vegetation: {
      treeDensity: 0.4,
      bushDensity: 0.3,
      grassDensity: 0.6,
      flowerDensity: 0.2,
      mushroomDensity: 0.1,
      groundCoverDensity: 0.5,
    },
    clouds: {
      enabled: true,
      count: 10,
      altitude: 80,
      spread: 120,
    },
    camera: {
      position: new Vector3(60, 40, 60),
      target: new Vector3(0, 5, 0),
      fov: 55,
      near: 0.5,
      far: 500,
    },
    lighting: {
      sunPosition: new Vector3(50, 80, 30),
      sunIntensity: 1.8,
      sunColor: '#fffbe6',
      ambientIntensity: 0.4,
      ambientColor: '#b8d4e8',
      hemisphereSkyColor: '#87ceeb',
      hemisphereGroundColor: '#5a8f3c',
      hemisphereIntensity: 0.35,
    },
    water: {
      riverEnabled: true,
      lakeEnabled: true,
      waterfallEnabled: true,
      oceanEnabled: true,
      waterLevel: 0.3,
    },
    wind: {
      enabled: true,
      speed: 3.0,
      gustAmplitude: 0.4,
      gustFrequency: 0.3,
      direction: new Vector3(1, 0, 0.3).normalize(),
    },
    weather: { type: 'clear', intensity: 0, density: 0 },
    creatures: [
      { type: 'ground', count: 2, spawnArea: { center: new Vector3(0, 0, 0), radius: 30 } },
      { type: 'flying', count: 3, spawnArea: { center: new Vector3(0, 30, 0), radius: 40 } },
      { type: 'aquatic', count: 2, spawnArea: { center: new Vector3(0, 0, 20), radius: 25 } },
      { type: 'insect', count: 8, spawnArea: { center: new Vector3(0, 1, 0), radius: 15 } },
    ],
  },
};

// ---------------------------------------------------------------------------
// All expanded presets
// ---------------------------------------------------------------------------

export const EXPANDED_NATURE_PRESETS: ScenePreset[] = [
  CANYON,
  CLIFF,
  COAST,
  KELP_FOREST,
  MOUNTAIN,
  PLAIN,
  RIVER,
  SNOWY_MOUNTAIN,
  UNDERWATER,
];

export const EXPANDED_INDOOR_PRESETS: ScenePreset[] = [
  BEDROOM_PRESET,
  KITCHEN_PRESET,
  BATHROOM_PRESET,
  OFFICE_PRESET,
  DINING_ROOM_PRESET,
  LIVING_ROOM_ENHANCED,
  STUDIO_PRESET,
  GARAGE_PRESET,
  LIBRARY_PRESET,
  ATTIC_PRESET,
  BASEMENT_PRESET,
  WAREHOUSE_PRESET,
];

export const EXPANDED_PERFORMANCE_PRESETS: ScenePreset[] = [
  STEREO_TRAINING,
  MULTIVIEW_STEREO,
  NOISY_VIDEO,
  ASSET_DEMO,
  BENCHMARK,
];

export const ALL_EXPANDED_PRESETS: ScenePreset[] = [
  ...EXPANDED_NATURE_PRESETS,
  ...EXPANDED_INDOOR_PRESETS,
  ...EXPANDED_PERFORMANCE_PRESETS,
];

export const EXPANDED_PRESET_MAP: Record<string, ScenePreset> = Object.fromEntries(
  ALL_EXPANDED_PRESETS.map(p => [p.id, p]),
);

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Get all presets for a specific category (including 'performance')
 */
export function getExpandedPresetsByCategory(category: ExtendedPresetCategory): ScenePreset[] {
  switch (category) {
    case 'nature':
      return EXPANDED_NATURE_PRESETS;
    case 'indoor':
      return EXPANDED_INDOOR_PRESETS;
    case 'special':
    case 'performance':
      return EXPANDED_PERFORMANCE_PRESETS;
    default:
      return ALL_EXPANDED_PRESETS;
  }
}

/**
 * Get an expanded preset by ID
 */
export function getExpandedPreset(id: string): ScenePreset | undefined {
  return EXPANDED_PRESET_MAP[id];
}

/**
 * Get all expanded preset IDs
 */
export function getExpandedPresetIds(): string[] {
  return ALL_EXPANDED_PRESETS.map(p => p.id);
}

/**
 * Get a nature config by preset ID — returns the natureConfig portion of any preset
 */
export function getNatureConfigForPreset(id: string): Partial<NatureSceneConfig> | undefined {
  const preset = EXPANDED_PRESET_MAP[id];
  return preset?.natureConfig;
}

/**
 * Get the room type for an indoor preset
 */
export function getRoomTypeForPreset(id: string): RoomType | undefined {
  const preset = EXPANDED_PRESET_MAP[id];
  return preset?.indoorRoomType;
}
