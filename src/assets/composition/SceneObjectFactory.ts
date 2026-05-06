/**
 * Scene Object Factory for Infinigen R3F
 *
 * Converts NatureSceneComposer configuration output into Three.js scene objects.
 * Each factory method maps configuration keys to generator calls.
 *
 * Primary API:
 *   buildAll(composerResult)   → THREE.Group (complete scene from composer output)
 *   createTerrain(config)      → THREE.Mesh  (uses TerrainGenerator)
 *   createVegetation(config)   → THREE.Group (uses scatter systems)
 *   createWater(config)        → THREE.Group (uses OceanSystem / RiverNetwork / LakeGenerator)
 *   createLighting(config)     → THREE.Group (DirectionalLight, AmbientLight, etc.)
 *   createAtmosphere(config)   → THREE.Group (fog, sky, weather)
 *
 * Usage:
 *   const composer = new NatureSceneComposer(preset.natureConfig);
 *   const result = composer.compose(seed);
 *   const factory = new SceneObjectFactory();
 *   const sceneGroup = factory.buildAll(result);
 *   scene.add(sceneGroup);
 */

import * as THREE from 'three';
import {
  NatureSceneComposer,
  type NatureSceneResult,
  type NatureSceneConfig,
  type BoulderData,
  type GroundCoverData,
  type RiverData,
  type CreatureParams,
  type Season,
  type WeatherType,
} from './NatureSceneComposer';
import {
  type IndoorSceneResult,
  type IndoorObject,
  type RoomSpec,
  type SurfaceMaterial,
  type DoorPlacement,
  type WindowPlacement,
  type RoomType,
} from './IndoorSceneComposer';

// Existing generators — nature
import { TerrainGenerator, type TerrainConfig, type TerrainData } from '@/terrain/core/TerrainGenerator';
import { OceanSurface } from '@/terrain/water/OceanSystem';
import { RiverNetwork } from '@/terrain/water/RiverNetwork';
import { LakeGenerator } from '@/terrain/water/LakeGenerator';
import { generateLSystemTree } from '@/assets/objects/vegetation/trees/LSystemEngine';
import { FernGenerator, type FernSpecies } from '@/assets/objects/vegetation/plants/FernGenerator';
import { FlowerGenerator, type FlowerType } from '@/assets/objects/vegetation/plants/FlowerGenerator';
import { MushroomGenerator, type MushroomSpecies } from '@/assets/objects/vegetation/plants/MushroomGenerator';
import { IvyClimbingSystem } from '@/assets/objects/vegetation/climbing/IvyClimbingSystem';
import { ForestFloorScatter, type Season as ForestSeason } from '@/assets/objects/vegetation/scatter/ForestFloorScatter';
import { CactusGenerator, type CactusVariant, CACTUS_VARIANTS } from '@/assets/objects/vegetation/cactus/CactusGenerator';

// Existing generators — creatures
import { MammalGenerator } from '@/assets/objects/creatures/MammalGenerator';
import { BirdGenerator } from '@/assets/objects/creatures/BirdGenerator';
import { FishGenerator, type FishParameters } from '@/assets/objects/creatures/FishGenerator';
import { ReptileGenerator } from '@/assets/objects/creatures/ReptileGenerator';
import { InsectGenerator, type InsectParameters } from '@/assets/objects/creatures/InsectGenerator';
import { UnderwaterGenerator } from '@/assets/objects/creatures/UnderwaterGenerator';
import { SwarmSystem, type SwarmConfig } from '@/assets/objects/creatures/swarm/SwarmSystem';

// Existing generators — terrain objects
import { BoulderGenerator, type BoulderType, type BoulderMaterial } from '@/assets/objects/terrain/BoulderGenerator';

// Existing generators — scatter / ground cover
import { GroundCoverGenerator, type GroundCoverType } from '@/assets/objects/scatter/ground/GroundCoverGenerator';
import { LeafLitterGenerator, type LeafLitterConfig } from '@/assets/objects/scatter/ground/LeafLitterGenerator';
import { PebbleGenerator, type PebbleConfig } from '@/assets/objects/scatter/ground/PebbleGenerator';

// Existing generators — underwater
import { CoralGenerator, type CoralSpecies } from '@/assets/objects/underwater/CoralGenerator';
import { SeaweedGenerator } from '@/assets/objects/underwater/SeaweedGenerator';

// Existing generators — indoor / furniture
import { TableFactory } from '@/assets/objects/tables/TableFactory';
import { ChairFactory } from '@/assets/objects/seating/ChairFactory';
import { SofaFactory } from '@/assets/objects/seating/SofaFactory';
import { BedGenerator } from '@/assets/objects/beds/BedGenerator';
import { DeskGenerator } from '@/assets/objects/tables/DeskGenerator';
import { WardrobeGenerator } from '@/assets/objects/storage/WardrobeGenerator';
import { CabinetGenerator } from '@/assets/objects/storage/CabinetGenerator';
import { ShelfGenerator } from '@/assets/objects/storage/ShelfGenerator';
import { LampGenerator } from '@/assets/objects/articulated/LampGenerator';
import { ChandelierGenerator } from '@/assets/objects/lighting/ChandelierGenerator';
import { OutdoorLightGenerator } from '@/assets/objects/lighting/OutdoorLightGenerator';

// Existing generators — architectural
import { FloorGenerator } from '@/assets/objects/architectural/FloorGenerator';
import { DoorGenerator } from '@/assets/objects/architectural/DoorGenerator';
import { WindowGenerator } from '@/assets/objects/architectural/WindowGenerator';

// Material
import { MaterialPresetLibrary } from '@/assets/materials/MaterialPresetLibrary';
import type { BakeResolution } from '@/assets/materials/textures/TextureBakePipeline';

// ---------------------------------------------------------------------------
// Biome colors for terrain vertex coloring
// ---------------------------------------------------------------------------

const BIOME_COLORS: Record<number, [number, number, number]> = {
  0: [0.06, 0.15, 0.40], // Deep water
  1: [0.12, 0.30, 0.50], // Shore
  2: [0.76, 0.72, 0.48], // Beach
  3: [0.28, 0.55, 0.18], // Plains
  4: [0.38, 0.45, 0.20], // Hills
  5: [0.18, 0.44, 0.12], // Forest
  6: [0.28, 0.36, 0.14], // Mountain forest
  7: [0.48, 0.43, 0.38], // Mountain
  8: [0.90, 0.92, 0.96], // Snow peak
};

// ---------------------------------------------------------------------------
// Factory result types
// ---------------------------------------------------------------------------

/** Scene objects produced by the factory for a nature scene */
export interface NatureSceneObjects {
  terrain: THREE.Mesh | null;
  /** Water group containing ocean, rivers, and lakes */
  water: THREE.Group;
  /** @deprecated Use water instead */
  ocean: THREE.Mesh | null;
  vegetation: THREE.Group;
  boulders: THREE.Group;
  creatures: THREE.Group;
  fishSchool: SwarmSystem | null;
  groundCover: THREE.Group;
  rivers: THREE.Group;
  clouds: THREE.Group;
  weatherParticles: THREE.Group;
  windEffector: THREE.Group;
  lighting: THREE.Group;
  atmosphere: THREE.Group;
}

/** Scene objects produced by the factory for an indoor scene */
export interface IndoorSceneObjects {
  rooms: THREE.Group[];
  furniture: THREE.Group;
  lights: THREE.Group;
  doors: THREE.Group;
  windows: THREE.Group;
}

/** Full scene output with both nature and indoor components */
export interface SceneFactoryResult {
  nature: NatureSceneObjects | null;
  indoor: IndoorSceneObjects | null;
  /** The root group that contains everything */
  root: THREE.Group;
}

// ---------------------------------------------------------------------------
// SceneObjectFactory
// ---------------------------------------------------------------------------

export class SceneObjectFactory {
  private materialLibrary: MaterialPresetLibrary;

  constructor(materialResolution: BakeResolution = 256) {
    this.materialLibrary = new MaterialPresetLibrary(materialResolution);
  }

  // =======================================================================
  // Top-level: create a nature scene from composer output
  // =======================================================================

  createNatureScene(result: NatureSceneResult): NatureSceneObjects {
    const waterGroup = this.createWater(result);
    return {
      terrain: this.createTerrain(result),
      water: waterGroup,
      ocean: waterGroup.children.find(c => c.name === 'ocean') as THREE.Mesh ?? null,
      vegetation: this.createVegetation(result),
      boulders: this.createBoulders(result),
      creatures: this.createCreatures(result),
      fishSchool: this.createFishSchool(result),
      groundCover: this.createGroundCover(result),
      rivers: this.createRivers(result),
      clouds: this.createClouds(result),
      weatherParticles: this.createWeatherParticles(result),
      windEffector: this.createWindEffector(result),
      lighting: this.createLighting(result),
      atmosphere: this.createAtmosphere(result),
    };
  }

  // =======================================================================
  // buildAll: create a complete THREE.Group from composer output
  // =======================================================================

  /**
   * Build a complete THREE.Group from a NatureSceneComposer result.
   *
   * This is the primary instance method that converts composer configuration
   * output into a single THREE.Group containing terrain, vegetation, water,
   * lighting, atmosphere, and all other scene objects.
   *
   * Usage:
   *   const composerResult = composer.compose(seed);
   *   const factory = new SceneObjectFactory();
   *   const group = factory.buildAll(composerResult);
   *   scene.add(group);
   */
  buildAll(composerResult: any): THREE.Group {
    const result = composerResult as NatureSceneResult;
    const root = new THREE.Group();
    root.name = 'NatureScene';

    const terrain = this.createTerrain(result);
    if (terrain) root.add(terrain);

    root.add(this.createWater(result));
    root.add(this.createVegetation(result));
    root.add(this.createBoulders(result));
    root.add(this.createCreatures(result));
    root.add(this.createGroundCover(result));
    root.add(this.createRivers(result));
    root.add(this.createClouds(result));
    root.add(this.createWeatherParticles(result));
    root.add(this.createWindEffector(result));
    root.add(this.createLighting(result));
    root.add(this.createAtmosphere(result));

    // Apply fog from atmosphere group
    const fog = root.getObjectByName('atmosphere')?.userData?.fog as THREE.Fog | undefined;
    if (fog) root.userData.fog = fog;

    return root;
  }

  // =======================================================================
  // Top-level: create an indoor scene from composer output
  // =======================================================================

  createIndoorScene(result: IndoorSceneResult): IndoorSceneObjects {
    return {
      rooms: this.createRooms(result),
      furniture: this.createFurniture(result),
      lights: this.createIndoorLights(result),
      doors: this.createDoors(result),
      windows: this.createWindows(result),
    };
  }

  // =======================================================================
  // Top-level: create a combined scene from either type
  // =======================================================================

  createScene(
    natureResult?: NatureSceneResult | null,
    indoorResult?: IndoorSceneResult | null
  ): SceneFactoryResult {
    const root = new THREE.Group();
    root.name = 'SceneFactoryRoot';

    const nature = natureResult ? this.createNatureScene(natureResult) : null;
    const indoor = indoorResult ? this.createIndoorScene(indoorResult) : null;

    if (nature) {
      const natureGroup = new THREE.Group();
      natureGroup.name = 'NatureScene';
      if (nature.terrain) natureGroup.add(nature.terrain);
      natureGroup.add(nature.water);
      natureGroup.add(nature.vegetation);
      natureGroup.add(nature.boulders);
      natureGroup.add(nature.creatures);
      natureGroup.add(nature.groundCover);
      natureGroup.add(nature.rivers);
      natureGroup.add(nature.clouds);
      natureGroup.add(nature.weatherParticles);
      natureGroup.add(nature.windEffector);
      natureGroup.add(nature.lighting);
      natureGroup.add(nature.atmosphere);
      root.add(natureGroup);
    }

    if (indoor) {
      const indoorGroup = new THREE.Group();
      indoorGroup.name = 'IndoorScene';
      for (const room of indoor.rooms) indoorGroup.add(room);
      indoorGroup.add(indoor.furniture);
      indoorGroup.add(indoor.lights);
      indoorGroup.add(indoor.doors);
      indoorGroup.add(indoor.windows);
      root.add(indoorGroup);
    }

    return { nature, indoor, root };
  }

  // =======================================================================
  // buildAll: convenience pipeline — compose + factory in one call
  // =======================================================================

  /**
   * Build a complete THREE.Scene from an already-composed NatureSceneResult.
   *
   * This is the primary "connect" method between NatureSceneComposer output
   * and Three.js scene objects. It creates all child objects (terrain,
   * vegetation, water, lighting, atmosphere, etc.) and adds them to a
   * new THREE.Scene with fog applied.
   *
   * Usage:
   *   const composerResult = composer.compose(seed);
   *   const scene = SceneObjectFactory.buildAllFromResult(composerResult);
   *   renderer.render(scene, camera);
   */
  static buildAllFromResult(composerResult: NatureSceneResult): THREE.Scene {
    const factory = new SceneObjectFactory();
    const objects = factory.createNatureScene(composerResult);
    const scene = new THREE.Scene();
    scene.name = 'NatureScene';

    if (objects.terrain) scene.add(objects.terrain);
    scene.add(objects.water);
    scene.add(objects.vegetation);
    scene.add(objects.boulders);
    scene.add(objects.creatures);
    scene.add(objects.groundCover);
    scene.add(objects.rivers);
    scene.add(objects.clouds);
    scene.add(objects.weatherParticles);
    scene.add(objects.windEffector);
    scene.add(objects.lighting);
    scene.add(objects.atmosphere);

    // Apply fog from atmosphere
    const fog = objects.atmosphere.userData.fog as THREE.Fog | undefined;
    if (fog) scene.fog = fog;

    return scene;
  }

  /**
   * Build a complete THREE.Scene from an already-composed IndoorSceneResult.
   *
   * Usage:
   *   const indoorResult = indoorComposer.composeRoom('living_room');
   *   const scene = SceneObjectFactory.buildAllIndoorFromResult(indoorResult);
   *   renderer.render(scene, camera);
   */
  static buildAllIndoorFromResult(indoorResult: IndoorSceneResult): THREE.Scene {
    const factory = new SceneObjectFactory();
    const objects = factory.createIndoorScene(indoorResult);
    const scene = new THREE.Scene();
    scene.name = 'IndoorScene';

    for (const room of objects.rooms) scene.add(room);
    scene.add(objects.furniture);
    scene.add(objects.lights);
    scene.add(objects.doors);
    scene.add(objects.windows);

    // Indoor ambient light
    scene.add(new THREE.AmbientLight(0xfff8f0, 0.4));
    scene.add(new THREE.HemisphereLight(0xfff8f0, 0x8B7355, 0.3));

    return scene;
  }

  /**
   * Full pipeline: NatureSceneComposer → compose → factory → SceneFactoryResult.
   *
   * Usage:
   *   const result = SceneObjectFactory.buildAll({ terrain: { seed: 42 } });
   *   scene.add(result.root);
   */
  static buildAll(config?: Partial<NatureSceneConfig>, seed?: number): SceneFactoryResult {
    const composer = new NatureSceneComposer(config);
    const composerResult = composer.compose(seed);
    const factory = new SceneObjectFactory();
    return factory.createScene(composerResult);
  }

  /**
   * Compose a nature scene config and build a THREE.Scene in one call.
   *
   * Usage:
   *   const scene = SceneObjectFactory.composeAndBuild({ terrain: { seed: 42 } });
   *   renderer.render(scene, camera);
   */
  static composeAndBuild(config?: Partial<NatureSceneConfig>, seed?: number): THREE.Scene {
    const composer = new NatureSceneComposer(config);
    const composerResult = composer.compose(seed);
    return SceneObjectFactory.buildAllFromResult(composerResult);
  }

  /**
   * Full pipeline from a preset ID: preset → compose → factory → SceneFactoryResult.
   *
   * Usage:
   *   const result = SceneObjectFactory.buildFromPreset('alpine_meadow');
   *   scene.add(result.root);
   */
  static buildFromPreset(presetId: string, seed?: number): SceneFactoryResult | null {
    const { getPreset } = require('./ScenePresets');
    const preset = getPreset(presetId);
    if (!preset) return null;

    const factory = new SceneObjectFactory();

    if (preset.natureConfig) {
      const composer = new NatureSceneComposer(preset.natureConfig);
      const composerResult = composer.compose(seed ?? preset.natureConfig.terrain?.seed ?? 42);
      return factory.createScene(composerResult);
    }

    // Indoor preset
    if (preset.indoorRoomType) {
      const { IndoorSceneComposer } = require('./IndoorSceneComposer');
      const indoorComposer = new IndoorSceneComposer(seed ?? 42);
      const indoorResult = indoorComposer.composeRoom(preset.indoorRoomType);
      return factory.createScene(null, indoorResult);
    }

    return null;
  }

  /**
   * Build a THREE.Scene directly from a preset ID.
   *
   * Usage:
   *   const scene = SceneObjectFactory.buildFromPresetAsScene('alpine_meadow');
   *   renderer.render(scene, camera);
   */
  static buildFromPresetAsScene(presetId: string, seed?: number): THREE.Scene | null {
    const { getPreset } = require('./ScenePresets');
    const preset = getPreset(presetId);
    if (!preset) return null;

    if (preset.natureConfig) {
      const composer = new NatureSceneComposer(preset.natureConfig);
      const composerResult = composer.compose(seed ?? preset.natureConfig.terrain?.seed ?? 42);
      return SceneObjectFactory.buildAllFromResult(composerResult);
    }

    if (preset.indoorRoomType) {
      const { IndoorSceneComposer } = require('./IndoorSceneComposer');
      const indoorComposer = new IndoorSceneComposer(seed ?? 42);
      const indoorResult = indoorComposer.composeRoom(preset.indoorRoomType);
      return SceneObjectFactory.buildAllIndoorFromResult(indoorResult);
    }

    return null;
  }

  // =======================================================================
  // Terrain — procedural heightmap with biome vertex colors
  // =======================================================================

  createTerrain(result: NatureSceneResult): THREE.Mesh | null {
    const tp = result.terrainParams;
    const worldSize = 200;
    const heightScale = 35;

    // Use terrain data from composer if available, otherwise generate ourselves
    const terrainData = result.terrain;
    if (!terrainData) return null;

    const { data: heightData, width, height } = terrainData.heightMap;
    const { biomeMask } = terrainData;

    const geo = new THREE.PlaneGeometry(worldSize, worldSize, width - 1, height - 1);
    geo.rotateX(-Math.PI / 2);

    const positions = geo.attributes.position as THREE.BufferAttribute;
    const colorArray = new Float32Array(positions.count * 3);

    for (let i = 0; i < positions.count; i++) {
      const h = heightData[i] ?? 0;
      positions.setY(i, h * heightScale);

      const biome = biomeMask[i] ?? 3;
      const [r, g, b] = BIOME_COLORS[biome] ?? BIOME_COLORS[3];
      colorArray[i * 3] = r;
      colorArray[i * 3 + 1] = g;
      colorArray[i * 3 + 2] = b;
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colorArray, 3));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.FrontSide,
      flatShading: false,
    }));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }

  // =======================================================================
  // Water — ocean (OceanSystem), rivers (RiverNetwork), lakes (LakeGenerator)
  // =======================================================================

  /**
   * Create a water group containing ocean, river, and lake meshes.
   *
   * Maps the composer's waterConfig to the appropriate generator calls:
   *   - oceanEnabled → OceanSurface from OceanSystem
   *   - riverEnabled  → TubeGeometry from RiverNetwork path data
   *   - lakeEnabled   → LakeGenerator water mesh
   *
   * Returns a THREE.Group even when no water features are enabled
   * so consumers can always safely add the result to the scene.
   */
  createWater(result: NatureSceneResult): THREE.Group {
    const group = new THREE.Group();
    group.name = 'water';
    const wc = result.waterConfig;
    const heightScale = 35;

    // Ocean via OceanSystem
    if (wc.oceanEnabled) {
      try {
        const ocean = new OceanSurface({
          size: 500,
          resolution: 64,
          waveHeight: 1.2,
          waveLength: 25,
          windDirection: [result.windConfig.direction.x, result.windConfig.direction.z],
          windSpeed: result.windConfig.speed * 2,
        });
        const mesh = ocean.getMesh();
        mesh.position.y = wc.waterLevel * heightScale;
        mesh.name = 'ocean';
        mesh.userData._oceanSurface = ocean;
        group.add(mesh);
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[SceneObjectFactory] ocean generation skipped:', err);
        }
      }
    }

    // Rivers via RiverNetwork path data
    if (wc.riverEnabled) {
      for (const river of result.rivers) {
        if (river.path.length < 2) continue;
        try {
          const curve = new THREE.CatmullRomCurve3(river.path);
          const tubeGeo = new THREE.TubeGeometry(curve, river.path.length * 4, river.width / 2, 8, false);
          const riverMat = new THREE.MeshStandardMaterial({
            color: 0x2a6496,
            transparent: true,
            opacity: 0.75,
            roughness: 0.1,
            metalness: 0.3,
          });
          const riverMesh = new THREE.Mesh(tubeGeo, riverMat);
          riverMesh.position.y = 0.1;
          riverMesh.receiveShadow = true;
          riverMesh.name = 'river';
          riverMesh.userData.tags = ['water', 'river'];
          riverMesh.userData.flowSpeed = river.flowSpeed;
          group.add(riverMesh);
        } catch (err) {
          if (process.env.NODE_ENV === 'development') {
            console.debug('[SceneObjectFactory] river generation skipped:', err);
          }
        }
      }
    }

    // Lakes via LakeGenerator
    if (wc.lakeEnabled && result.terrain) {
      try {
        const lakeGen = new LakeGenerator({ seed: result.seed });
        const terrainData = result.terrain;
        const lakeRadius = 30;
        const cx = this.seededRandom(result.seed + 7700) * 120 - 60;
        const cz = this.seededRandom(result.seed + 7701) * 120 - 60;
        const { waterGeometry, waterMaterial } = lakeGen.generate(
          cx, cz, lakeRadius,
          terrainData.heightMap.data,
          terrainData.width,
          200,
        );
        const lakeMesh = new THREE.Mesh(waterGeometry, waterMaterial);
        lakeMesh.name = 'lake';
        lakeMesh.position.y = wc.waterLevel * heightScale;
        lakeMesh.receiveShadow = true;
        lakeMesh.userData.tags = ['water', 'lake'];
        group.add(lakeMesh);
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[SceneObjectFactory] lake generation skipped:', err);
        }
      }
    }

    return group;
  }

  // =======================================================================
  // Vegetation — trees, bushes, flowers, ferns, mushrooms, cacti
  // =======================================================================

  createVegetation(result: NatureSceneResult): THREE.Group {
    const group = new THREE.Group();
    group.name = 'vegetation';
    const veg = result.vegetationConfig;
    const season = result.season;
    const seed = result.seed;

    // Trees from L-System
    const treeCount = Math.max(1, Math.round(veg.treeDensity * 15));
    const treePresets = ['oak', 'conifer', 'birch'] as const;

    for (let i = 0; i < treeCount; i++) {
      try {
        const preset = treePresets[i % treePresets.length];
        const angle = (i / treeCount) * Math.PI * 2;
        const radius = 12 + i * 4;
        const tree = generateLSystemTree(preset, seed + 100 + i);
        tree.position.set(
          Math.cos(angle) * radius,
          0,
          Math.sin(angle) * radius,
        );
        tree.scale.setScalar(0.5 + this.seededRandom(seed + i) * 0.3);
        tree.castShadow = true;
        tree.userData.tags = ['vegetation', 'tree'];
        group.add(tree);
      } catch (err) {
        // Skip individual tree failures
        if (process.env.NODE_ENV === 'development') {
          console.debug('[SceneObjectFactory] tree generation skipped:', err);
        }
      }
    }

    // Cacti for desert biomes
    if (result.dominantBiome === 'desert' || result.dominantBiome === 'savanna') {
      const cactusCount = Math.max(1, Math.round(veg.bushDensity * 8));
      const cactusGen = new CactusGenerator(seed + 500);
      for (let i = 0; i < cactusCount; i++) {
        try {
          const variant = CACTUS_VARIANTS[i % CACTUS_VARIANTS.length];
          const cactus = cactusGen.generate({ variant });
          const angle = (i / cactusCount) * Math.PI * 2;
          cactus.position.set(
            Math.cos(angle) * (15 + i * 5),
            0,
            Math.sin(angle) * (15 + i * 5),
          );
          cactus.scale.setScalar(0.4 + this.seededRandom(seed + 500 + i) * 0.3);
          cactus.userData.tags = ['vegetation', 'cactus'];
          group.add(cactus);
        } catch (err) {
          if (process.env.NODE_ENV === 'development') {
            console.debug('[SceneObjectFactory] cactus generation skipped:', err);
          }
        }
      }
    }

    // Ferns
    const fernCount = Math.max(1, Math.round(veg.bushDensity * 3));
    const fernGenerator = new FernGenerator(seed + 200);
    const fernSpecies: FernSpecies[] = ['boston', 'maidenhair', 'staghorn'];
    for (let i = 0; i < fernCount; i++) {
      try {
        const fern = fernGenerator.generate({
          species: fernSpecies[i % fernSpecies.length],
          size: 0.8 + this.seededRandom(seed + 200 + i) * 0.4,
        });
        const angle = (i / fernCount) * Math.PI * 2;
        fern.position.set(
          Math.cos(angle) * (8 + i * 3),
          0,
          Math.sin(angle) * (8 + i * 3),
        );
        fern.rotation.y = this.seededRandom(seed + 2000 + i) * Math.PI * 2;
        fern.userData.tags = ['vegetation', 'fern'];
        group.add(fern);
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[SceneObjectFactory] fern generation skipped:', err);
        }
      }
    }

    // Flowers
    if (season !== 'winter' && veg.flowerDensity > 0.05) {
      const flowerGenerator = new FlowerGenerator();
      const flowerTypes: FlowerType[] = ['rose', 'daisy', 'tulip', 'sunflower'];
      const flowerCount = Math.max(1, Math.round(veg.flowerDensity * 4));
      for (let i = 0; i < flowerCount; i++) {
        try {
          const flower = flowerGenerator.generateFlower({
            variety: flowerTypes[i % flowerTypes.length],
          }, seed + 1000 + i);
          const angle = (i / flowerCount) * Math.PI * 2;
          flower.position.set(
            Math.cos(angle) * (6 + i * 2),
            0,
            Math.sin(angle) * (6 + i * 2),
          );
          flower.userData.tags = ['vegetation', 'flower'];
          group.add(flower);
        } catch (err) {
          if (process.env.NODE_ENV === 'development') {
            console.debug('[SceneObjectFactory] flower generation skipped:', err);
          }
        }
      }

      // Flower field (instanced)
      try {
        const flowerField = flowerGenerator.generateFlowerField({
          variety: 'daisy',
          count: Math.round(veg.flowerDensity * 100),
          spreadArea: { width: 15, depth: 15 },
          density: veg.flowerDensity,
        }, seed + 5000);
        flowerField.userData.tags = ['vegetation', 'flower_field'];
        group.add(flowerField);
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[SceneObjectFactory] flower field skipped:', err);
        }
      }
    }

    // Mushrooms
    if (season !== 'winter' && veg.mushroomDensity > 0.02) {
      const mushroomGenerator = new MushroomGenerator(seed + 300);
      const mushroomSpecies: MushroomSpecies[] = ['agaric', 'chanterelle', 'morel', 'bolete'];
      const mushroomCount = Math.max(1, Math.round(veg.mushroomDensity * 4));
      for (let i = 0; i < mushroomCount; i++) {
        try {
          const mushroom = mushroomGenerator.generate({
            species: mushroomSpecies[i % mushroomSpecies.length],
          });
          const angle = (i / mushroomCount) * Math.PI * 2;
          mushroom.position.set(
            Math.cos(angle) * (5 + i * 3),
            0,
            Math.sin(angle) * (5 + i * 3),
          );
          mushroom.scale.setScalar(1.5);
          mushroom.userData.tags = ['vegetation', 'mushroom'];
          group.add(mushroom);
        } catch (err) {
          if (process.env.NODE_ENV === 'development') {
            console.debug('[SceneObjectFactory] mushroom generation skipped:', err);
          }
        }
      }
    }

    // Ivy on rock (signature feature)
    try {
      const ivySystem = new IvyClimbingSystem(seed + 400, { plantType: 'ivy' });
      const ivy = ivySystem.generateOnWall(
        new THREE.Vector3(20, 0.5, -10),
        new THREE.Vector3(0, 0, 1),
        2,
      );
      ivy.userData.tags = ['vegetation', 'ivy'];
      group.add(ivy);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.debug('[SceneObjectFactory] ivy generation skipped:', err);
      }
    }

    // Forest floor scatter
    if (veg.groundCoverDensity > 0.1) {
      try {
        const scatter = new ForestFloorScatter(seed + 600, {
          areaSize: 40,
          density: veg.groundCoverDensity,
          biome: 'forest',
          season: season as ForestSeason,
          maxInstancesPerType: 200,
        });
        const scatterGroup = scatter.generate();
        scatterGroup.userData.tags = ['vegetation', 'forest_floor'];
        group.add(scatterGroup);
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[SceneObjectFactory] forest floor scatter skipped:', err);
        }
      }
    }

    // Underwater vegetation for coral/underwater biomes
    if (result.dominantBiome === 'ocean' || result.waterConfig.oceanEnabled) {
      try {
        const seaweedGroup = SeaweedGenerator.generateKelpForest(5, { width: 20, depth: 20 }, result.waterConfig.waterLevel * 35);
        if (seaweedGroup) {
          seaweedGroup.position.set(10, result.waterConfig.waterLevel * 35 - 3, -10);
          seaweedGroup.userData.tags = ['vegetation', 'seaweed'];
          group.add(seaweedGroup);
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[SceneObjectFactory] seaweed generation skipped:', err);
        }
      }

      // Coral
      try {
        const coralGeo = CoralGenerator.generate({ species: 'branching' as CoralSpecies });
        if (coralGeo) {
          const wrapper = new THREE.Group();
          const coralMesh = new THREE.Mesh(coralGeo, new THREE.MeshStandardMaterial({ color: 0xff6347, roughness: 0.7 }));
          wrapper.add(coralMesh);
          wrapper.position.set(-8, result.waterConfig.waterLevel * 35 - 2, 5);
          wrapper.userData.tags = ['vegetation', 'coral'];
          group.add(wrapper);
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[SceneObjectFactory] coral generation skipped:', err);
        }
      }
    }

    return group;
  }

  // =======================================================================
  // Boulders and rocks
  // =======================================================================

  createBoulders(result: NatureSceneResult): THREE.Group {
    const group = new THREE.Group();
    group.name = 'boulders';

    for (const boulder of result.boulders) {
      try {
        const gen = new BoulderGenerator({
          type: (boulder.type === 'pebble' ? 'round' : boulder.type) as BoulderType,
          size: boulder.scale.x,
          sizeVariation: 0.3,
          detailLevel: 2,
        }, result.seed + boulder.position.x * 100);

        const mesh = gen.generateBoulder();
        mesh.position.copy(boulder.position);
        mesh.quaternion.copy(boulder.rotation);
        mesh.scale.copy(boulder.scale);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.tags = ['boulder', boulder.type];
        group.add(mesh);
      } catch (err) {
        // Fallback: simple dodecahedron for boulders
        const geo = new THREE.DodecahedronGeometry(boulder.scale.x * 0.5, 1);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x808080,
          roughness: 0.9,
          metalness: 0.0,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(boulder.position);
        mesh.quaternion.copy(boulder.rotation);
        mesh.scale.copy(boulder.scale);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.tags = ['boulder', boulder.type];
        group.add(mesh);
      }
    }

    return group;
  }

  // =======================================================================
  // Creatures — ground, flying, aquatic, insect
  // =======================================================================

  createCreatures(result: NatureSceneResult): THREE.Group {
    const group = new THREE.Group();
    group.name = 'creatures';
    const seed = result.seed;

    for (const creatureConfig of result.creatureConfigs) {
      const count = creatureConfig.count;
      const spawnCenter = creatureConfig.spawnArea.center;
      const spawnRadius = creatureConfig.spawnArea.radius;

      switch (creatureConfig.type) {
        case 'ground': {
          // Ground creatures: mammals, reptiles
          const groundSpecies = ['deer', 'fox', 'rabbit', 'bear', 'dog'] as const;
          for (let i = 0; i < count; i++) {
            try {
              const species = groundSpecies[i % groundSpecies.length];
              const gen = new MammalGenerator(seed + 1000 + i);
              const creature = gen.generate(species);
              creature.position.set(
                spawnCenter.x + (this.seededRandom(seed + 1010 + i) - 0.5) * spawnRadius,
                spawnCenter.y + 0.5,
                spawnCenter.z + (this.seededRandom(seed + 1020 + i) - 0.5) * spawnRadius,
              );
              creature.scale.setScalar(0.4 + this.seededRandom(seed + 1030 + i) * 0.2);
              creature.rotation.y = this.seededRandom(seed + 1040 + i) * Math.PI * 2;
              creature.userData.tags = ['creature', 'ground', 'mammal'];
              group.add(creature);
            } catch (err) {
              if (process.env.NODE_ENV === 'development') {
                console.debug('[SceneObjectFactory] ground creature skipped:', err);
              }
            }
          }
          break;
        }

        case 'flying': {
          // Flying creatures: birds
          for (let i = 0; i < count; i++) {
            try {
              const birdSpecies = ['sparrow', 'eagle', 'owl', 'parrot'] as const;
              const gen = new BirdGenerator(seed + 2000 + i);
              const bird = gen.generate(birdSpecies[i % birdSpecies.length]);
              bird.position.set(
                spawnCenter.x + (this.seededRandom(seed + 2010 + i) - 0.5) * spawnRadius,
                spawnCenter.y + this.seededRandom(seed + 2020 + i) * 10,
                spawnCenter.z + (this.seededRandom(seed + 2030 + i) - 0.5) * spawnRadius,
              );
              bird.scale.setScalar(1.5 + this.seededRandom(seed + 2040 + i));
              bird.rotation.y = this.seededRandom(seed + 2050 + i) * Math.PI * 2;
              bird.userData.tags = ['creature', 'flying', 'bird'];
              group.add(bird);
            } catch (err) {
              if (process.env.NODE_ENV === 'development') {
                console.debug('[SceneObjectFactory] flying creature skipped:', err);
              }
            }
          }
          break;
        }

        case 'aquatic': {
          // Aquatic creatures: fish
          for (let i = 0; i < Math.min(count, 3); i++) {
            try {
              const gen = new FishGenerator({});
              const fish = gen.generate();
              fish.position.set(
                spawnCenter.x + (this.seededRandom(seed + 3010 + i) - 0.5) * spawnRadius,
                result.waterConfig.waterLevel * 35 - 2,
                spawnCenter.z + (this.seededRandom(seed + 3020 + i) - 0.5) * spawnRadius,
              );
              fish.scale.setScalar(0.3 + this.seededRandom(seed + 3030 + i) * 0.3);
              fish.rotation.y = this.seededRandom(seed + 3040 + i) * Math.PI * 2;
              fish.userData.tags = ['creature', 'aquatic', 'fish'];
              group.add(fish);
            } catch (err) {
              if (process.env.NODE_ENV === 'development') {
                console.debug('[SceneObjectFactory] aquatic creature skipped:', err);
              }
            }
          }
          break;
        }

        case 'insect': {
          // Insects: swarm particles
          for (let i = 0; i < Math.min(count, 4); i++) {
            try {
              const gen = new InsectGenerator({});
              const insect = gen.generate();
              insect.position.set(
                spawnCenter.x + (this.seededRandom(seed + 4010 + i) - 0.5) * spawnRadius,
                spawnCenter.y + this.seededRandom(seed + 4020 + i) * 2,
                spawnCenter.z + (this.seededRandom(seed + 4030 + i) - 0.5) * spawnRadius,
              );
              insect.scale.setScalar(0.1 + this.seededRandom(seed + 4040 + i) * 0.1);
              insect.userData.tags = ['creature', 'insect'];
              group.add(insect);
            } catch (err) {
              if (process.env.NODE_ENV === 'development') {
                console.debug('[SceneObjectFactory] insect generation skipped:', err);
              }
            }
          }
          break;
        }
      }
    }

    return group;
  }

  // =======================================================================
  // Fish School — animated swarm of fish
  // =======================================================================

  createFishSchool(result: NatureSceneResult): SwarmSystem | null {
    const hasAquatic = result.creatureConfigs.some(c => c.type === 'aquatic');
    if (!hasAquatic || !result.waterConfig.oceanEnabled) return null;

    const waterY = result.waterConfig.waterLevel * 35;
    try {
      const swarm = new SwarmSystem({
        count: 80,
        speed: 1.5,
        separationStrength: 1.8,
        alignmentStrength: 1.2,
        cohesionStrength: 0.8,
        boundaryStrength: 2.5,
        center: new THREE.Vector3(15, waterY - 2, -15),
        bounds: new THREE.Vector3(12, 3, 12),
        individualSize: 0.12,
        color: new THREE.Color(0x4682b4),
        secondaryColor: new THREE.Color(0xc0c0c0),
        swarmType: 'fish',
        separationDistance: 0.6,
        neighborRadius: 2.5,
      }, result.seed + 999);

      return swarm;
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.debug('[SceneObjectFactory] fish school skipped:', err);
      }
      return null;
    }
  }

  // =======================================================================
  // Ground cover — leaves, twigs, grass, flowers, mushrooms
  // =======================================================================

  createGroundCover(result: NatureSceneResult): THREE.Group {
    const group = new THREE.Group();
    group.name = 'groundCover';
    const seed = result.seed;
    const worldHalf = 80;

    for (const cover of result.groundCover) {
      try {
        const positions = cover.positions;
        if (positions.length === 0) continue;

        // Map ground cover type to appropriate generator
        switch (cover.type) {
          case 'leaves':
          case 'fallen_leaves':
          case 'leaf_litter': {
            const leaves = LeafLitterGenerator.generate({ count: Math.min(positions.length, 200) } as unknown as LeafLitterConfig);
            const wrapper = new THREE.Group();
            wrapper.add(leaves);
            wrapper.userData.tags = ['groundCover', 'leaves'];
            group.add(wrapper);
            break;
          }
          case 'pebbles':
          case 'stones': {
            const gen = new PebbleGenerator({});
            const pebbles = gen.generate();
            const wrapper = new THREE.Group();
            wrapper.add(pebbles);
            wrapper.userData.tags = ['groundCover', 'pebbles'];
            group.add(wrapper);
            break;
          }
          case 'grass': {
            const gen = new GroundCoverGenerator(seed);
            const grass = gen.generate({
              coverType: 'mixed' as GroundCoverType,
              density: Math.min(positions.length, 300),
            });
            grass.userData.tags = ['groundCover', 'grass'];
            group.add(grass);
            break;
          }
          default: {
            // Generic instanced ground cover
            const instancedGroup = this.createInstancedGroundCover(
              cover.type,
              positions,
              seed,
            );
            if (instancedGroup) {
              instancedGroup.userData.tags = ['groundCover', cover.type];
              group.add(instancedGroup);
            }
          }
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.debug(`[SceneObjectFactory] ground cover "${cover.type}" skipped:`, err);
        }
      }
    }

    return group;
  }

  // =======================================================================
  // Rivers and waterfalls
  // =======================================================================

  createRivers(result: NatureSceneResult): THREE.Group {
    const group = new THREE.Group();
    group.name = 'rivers';

    for (const river of result.rivers) {
      if (river.path.length < 2) continue;

      try {
        // Create river as a tube geometry following the path
        const curve = new THREE.CatmullRomCurve3(river.path);
        const tubeGeo = new THREE.TubeGeometry(curve, river.path.length * 4, river.width / 2, 8, false);
        const riverMat = new THREE.MeshStandardMaterial({
          color: 0x2a6496,
          transparent: true,
          opacity: 0.75,
          roughness: 0.1,
          metalness: 0.3,
        });
        const riverMesh = new THREE.Mesh(tubeGeo, riverMat);
        riverMesh.position.y = 0.1;
        riverMesh.receiveShadow = true;
        riverMesh.userData.tags = ['water', 'river'];
        riverMesh.userData.flowSpeed = river.flowSpeed;
        group.add(riverMesh);
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[SceneObjectFactory] river generation skipped:', err);
        }
      }
    }

    return group;
  }

  // =======================================================================
  // Clouds — simple cloud volumes at altitude
  // =======================================================================

  createClouds(result: NatureSceneResult): THREE.Group {
    const group = new THREE.Group();
    group.name = 'clouds';
    const cc = result.cloudConfig;

    if (!cc.enabled) return group;

    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      roughness: 1.0,
      metalness: 0.0,
    });

    for (let i = 0; i < cc.count; i++) {
      const cloudGroup = new THREE.Group();
      // A cloud is a cluster of spheres
      const blobCount = 3 + Math.floor(this.seededRandom(result.seed + 8000 + i) * 5);
      for (let j = 0; j < blobCount; j++) {
        const radius = 5 + this.seededRandom(result.seed + 8000 + i * 100 + j) * 10;
        const geo = new THREE.SphereGeometry(radius, 8, 6);
        const blob = new THREE.Mesh(geo, cloudMat);
        blob.position.set(
          (this.seededRandom(result.seed + 8100 + i * 100 + j) - 0.5) * 15,
          (this.seededRandom(result.seed + 8200 + i * 100 + j) - 0.5) * 3,
          (this.seededRandom(result.seed + 8300 + i * 100 + j) - 0.5) * 10,
        );
        blob.scale.y = 0.4;
        cloudGroup.add(blob);
      }
      cloudGroup.position.set(
        (this.seededRandom(result.seed + 8400 + i) - 0.5) * cc.spread * 2,
        cc.altitude,
        (this.seededRandom(result.seed + 8500 + i) - 0.5) * cc.spread * 2,
      );
      cloudGroup.userData.tags = ['cloud'];
      group.add(cloudGroup);
    }

    return group;
  }

  // =======================================================================
  // Weather particles — rain, snow, dust, fog
  // =======================================================================

  createWeatherParticles(result: NatureSceneResult): THREE.Group {
    const group = new THREE.Group();
    group.name = 'weather';
    const weather = result.weatherConfig;

    if (!weather) return group;

    const count = weather.density ?? 1000;
    const positions = new Float32Array(count * 3);
    const spread = 160;

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = Math.random() * 60;
      positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    let color: number;
    let size: number;
    let opacity: number;

    switch (weather.type) {
      case 'snow':
        color = 0xffffff;
        size = 0.3;
        opacity = 0.9;
        break;
      case 'rain':
        color = 0xaaccff;
        size = 0.1;
        opacity = 0.5;
        break;
      case 'dust':
        color = 0xd2b48c;
        size = 0.2;
        opacity = 0.4;
        break;
      case 'fog':
        color = 0xcccccc;
        size = 2.0;
        opacity = 0.15;
        break;
      default:
        color = 0xcccccc;
        size = 0.15;
        opacity = 0.5;
    }

    const material = new THREE.PointsMaterial({
      color,
      size,
      transparent: true,
      opacity,
      sizeAttenuation: true,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    points.userData.weatherType = weather.type;
    points.userData.intensity = weather.intensity;
    points.userData.tags = ['weather', weather.type];
    group.add(points);

    return group;
  }

  // =======================================================================
  // Wind effector — visual representation (grass sway etc.)
  // =======================================================================

  createWindEffector(result: NatureSceneResult): THREE.Group {
    const group = new THREE.Group();
    group.name = 'wind';

    if (!result.windConfig.enabled) return group;

    // Store wind config for WindAnimationController consumption
    group.userData.windConfig = {
      speed: result.windConfig.speed,
      gustAmplitude: result.windConfig.gustAmplitude,
      gustFrequency: result.windConfig.gustFrequency,
      direction: result.windConfig.direction.clone(),
    };
    group.userData.tags = ['wind'];

    return group;
  }

  // =======================================================================
  // Lighting config extraction (used by the React component)
  // =======================================================================

  createLightingConfig(result: NatureSceneResult): LightingObjectConfig {
    const lc = result.lightingConfig;
    return {
      sunPosition: lc.sunPosition.clone(),
      sunIntensity: lc.sunIntensity,
      sunColor: lc.sunColor,
      ambientIntensity: lc.ambientIntensity,
      ambientColor: lc.ambientColor,
      hemisphereSkyColor: lc.hemisphereSkyColor,
      hemisphereGroundColor: lc.hemisphereGroundColor,
      hemisphereIntensity: lc.hemisphereIntensity,
    };
  }

  // =======================================================================
  // Lighting — Three.js light objects from composer config
  // =======================================================================

  /**
   * Create Three.js light objects from the composer's lighting config.
   * Produces ambient, hemisphere, and directional (sun) lights with
   * proper shadow map configuration for the sun.
   */
  createLighting(result: NatureSceneResult): THREE.Group {
    const group = new THREE.Group();
    group.name = 'lighting';
    const lc = result.lightingConfig;

    // Ambient light
    const ambient = new THREE.AmbientLight(lc.ambientColor, lc.ambientIntensity);
    ambient.name = 'ambientLight';
    group.add(ambient);

    // Hemisphere light
    const hemi = new THREE.HemisphereLight(
      lc.hemisphereSkyColor,
      lc.hemisphereGroundColor,
      lc.hemisphereIntensity,
    );
    hemi.name = 'hemisphereLight';
    group.add(hemi);

    // Sun (directional light) with shadow
    const sun = new THREE.DirectionalLight(lc.sunColor, lc.sunIntensity);
    sun.position.copy(lc.sunPosition);
    sun.name = 'sunLight';
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 300;
    sun.shadow.camera.left = -120;
    sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120;
    sun.shadow.camera.bottom = -120;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    group.add(sun);

    // Fill light (opposite side, lower intensity)
    const fill = new THREE.DirectionalLight('#a8c8e8', 0.3);
    fill.position.set(-40, 60, -30);
    fill.name = 'fillLight';
    group.add(fill);

    // Store config for React component extraction
    group.userData.lightingConfig = this.createLightingConfig(result);

    return group;
  }

  // =======================================================================
  // Atmosphere — fog and atmospheric effects from composer config
  // =======================================================================

  /**
   * Create atmosphere configuration from the composer output.
   *
   * Three.js Fog must be set on the Scene, not added as a child.
   * This method returns a group with fog data stored in userData
   * so the React component can apply it to the scene.
   *
   * The React component reads:
   *   group.userData.fog → THREE.Fog instance (or null)
   *   group.userData.skyPosition → [x, y, z] for the Sky component
   */
  createAtmosphere(result: NatureSceneResult): THREE.Group {
    const group = new THREE.Group();
    group.name = 'atmosphere';
    const lc = result.lightingConfig;
    const season = result.season;

    // Fog distance varies by season
    let fogColor: string;
    let fogNear: number;
    let fogFar: number;

    switch (season) {
      case 'winter':
        fogColor = '#d0d8e8';
        fogNear = 60;
        fogFar = 250;
        break;
      case 'autumn':
        fogColor = '#d8c8a0';
        fogNear = 80;
        fogFar = 300;
        break;
      case 'spring':
        fogColor = '#c8ddf0';
        fogNear = 100;
        fogFar = 350;
        break;
      case 'summer':
      default:
        fogColor = '#c8ddf0';
        fogNear = 100;
        fogFar = 350;
        break;
    }

    // Reduce visibility in fog weather
    if (result.weatherConfig?.type === 'fog') {
      fogNear = Math.max(20, fogNear - 60);
      fogFar = Math.max(80, fogFar - 150);
    } else if (result.weatherConfig?.type === 'rain') {
      fogNear = Math.max(40, fogNear - 30);
      fogFar = Math.max(120, fogFar - 80);
    }

    const fog = new THREE.Fog(fogColor, fogNear, fogFar);

    // Store atmospheric data for the React component
    group.userData.fog = fog;
    group.userData.skyPosition = [lc.sunPosition.x, lc.sunPosition.y, lc.sunPosition.z];
    group.userData.atmosphereConfig = {
      fogColor,
      fogNear,
      fogFar,
      season,
    };

    return group;
  }

  // =======================================================================
  // Camera config extraction (used by the React component)
  // =======================================================================

  createCameraConfig(result: NatureSceneResult): CameraObjectConfig {
    const cc = result.cameraConfig;
    return {
      position: cc.position.clone(),
      target: cc.target.clone(),
      fov: cc.fov,
      near: cc.near,
      far: cc.far,
    };
  }

  // =======================================================================
  // Indoor: Rooms — walls, floor, ceiling
  // =======================================================================

  createRooms(result: IndoorSceneResult): THREE.Group[] {
    const roomGroups: THREE.Group[] = [];

    for (const roomSpec of result.rooms) {
      const group = new THREE.Group();
      group.name = `room_${roomSpec.id}`;
      const [minX, minY, minZ] = roomSpec.bounds.min;
      const [maxX, maxY, maxZ] = roomSpec.bounds.max;
      const width = maxX - minX;
      const height = maxY - minY;
      const depth = maxZ - minZ;

      // Find materials for this room
      const floorMat = result.materials.find(m => m.surface === 'floor');
      const wallMat = result.materials.find(m => m.surface === 'wall');
      const ceilingMat = result.materials.find(m => m.surface === 'ceiling');

      // Floor
      try {
        const floorGen = new FloorGenerator();
        const floor = floorGen.generate({
          width,
          depth,
        });
        floor.position.set((minX + maxX) / 2, minY, (minZ + maxZ) / 2);
        floor.receiveShadow = true;
        group.add(floor);
      } catch (err) {
        // Fallback: simple plane
        const geo = new THREE.PlaneGeometry(width, depth);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshStandardMaterial({
          color: floorMat?.color ?? '#8B7355',
          roughness: floorMat?.roughness ?? 0.6,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set((minX + maxX) / 2, minY, (minZ + maxZ) / 2);
        mesh.receiveShadow = true;
        group.add(mesh);
      }

      // Ceiling
      {
        const geo = new THREE.PlaneGeometry(width, depth);
        geo.rotateX(Math.PI / 2);
        const mat = new THREE.MeshStandardMaterial({
          color: ceilingMat?.color ?? '#FFFFFF',
          roughness: ceilingMat?.roughness ?? 0.9,
          side: THREE.BackSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set((minX + maxX) / 2, maxY, (minZ + maxZ) / 2);
        group.add(mesh);
      }

      // Walls (4 walls)
      const wallPositions = [
        { pos: [0, height / 2, -depth / 2], rot: [0, 0, 0], size: [width, height] }, // North
        { pos: [0, height / 2, depth / 2], rot: [0, Math.PI, 0], size: [width, height] }, // South
        { pos: [-width / 2, height / 2, 0], rot: [0, Math.PI / 2, 0], size: [depth, height] }, // West
        { pos: [width / 2, height / 2, 0], rot: [0, -Math.PI / 2, 0], size: [depth, height] }, // East
      ];

      for (const wall of wallPositions) {
        const geo = new THREE.PlaneGeometry(wall.size[0], wall.size[1]);
        const mat = new THREE.MeshStandardMaterial({
          color: wallMat?.color ?? '#F5F5DC',
          roughness: wallMat?.roughness ?? 0.8,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
          (minX + maxX) / 2 + wall.pos[0],
          minY + wall.pos[1],
          (minZ + maxZ) / 2 + wall.pos[2],
        );
        mesh.rotation.set(wall.rot[0], wall.rot[1], wall.rot[2]);
        mesh.receiveShadow = true;
        group.add(mesh);
      }

      roomGroups.push(group);
    }

    return roomGroups;
  }

  // =======================================================================
  // Indoor: Furniture placement
  // =======================================================================

  createFurniture(result: IndoorSceneResult): THREE.Group {
    const group = new THREE.Group();
    group.name = 'furniture';

    for (const obj of result.objects) {
      try {
        const furniture = this.createIndoorObject(obj);
        if (furniture) {
          furniture.position.copy(obj.position);
          furniture.quaternion.copy(obj.rotation);
          furniture.scale.copy(obj.scale);
          furniture.userData = {
            ...furniture.userData,
            indoorObjectId: obj.id,
            category: obj.category,
            tags: obj.tags,
          };
          group.add(furniture);
        }
      } catch (err) {
        // Fallback: colored box placeholder
        const size = this.getObjectSize(obj.category);
        const geo = new THREE.BoxGeometry(size, size * 0.8, size * 0.6);
        const color = this.getObjectColor(obj.category);
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(obj.position);
        mesh.quaternion.copy(obj.rotation);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = {
          indoorObjectId: obj.id,
          category: obj.category,
          tags: obj.tags,
          isPlaceholder: true,
        };
        group.add(mesh);
      }
    }

    return group;
  }

  // =======================================================================
  // Indoor: Lights
  // =======================================================================

  createIndoorLights(result: IndoorSceneResult): THREE.Group {
    const group = new THREE.Group();
    group.name = 'indoorLights';

    for (const obj of result.objects) {
      if (!obj.tags.includes('lighting')) continue;

      try {
        const category = obj.category;
        if (category.includes('chandelier')) {
          const gen = new ChandelierGenerator();
          const light = gen.generate?.();
          if (light) {
            light.position.copy(obj.position);
            light.quaternion.copy(obj.rotation);
            group.add(light);
          }
        } else if (category.includes('floor') || category.includes('lamp')) {
          const gen = new LampGenerator();
          const lightResult = gen.generate();
          if (lightResult) {
            const wrapper = new THREE.Group();
            wrapper.add(lightResult.group);
            wrapper.position.copy(obj.position);
            wrapper.quaternion.copy(obj.rotation);
            group.add(wrapper);
          }
        } else if (category.includes('fluorescent') || category.includes('highbay')) {
          // Simple overhead light
          const lightGeo = new THREE.BoxGeometry(0.6, 0.05, 0.2);
          const lightMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffcc,
            emissiveIntensity: 0.8,
          });
          const lightMesh = new THREE.Mesh(lightGeo, lightMat);
          lightMesh.position.copy(obj.position);
          lightMesh.quaternion.copy(obj.rotation);
          group.add(lightMesh);
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[SceneObjectFactory] indoor light skipped:', err);
        }
      }
    }

    return group;
  }

  // =======================================================================
  // Indoor: Doors
  // =======================================================================

  createDoors(result: IndoorSceneResult): THREE.Group {
    const group = new THREE.Group();
    group.name = 'doors';

    for (const door of result.doors) {
      try {
        const gen = new DoorGenerator();
        const doorObj = gen.generate?.({ width: door.width, height: door.height });
        if (doorObj) {
          doorObj.position.copy(door.position);
          doorObj.quaternion.copy(door.rotation);
          group.add(doorObj);
        }
      } catch (err) {
        // Fallback: box door
        const geo = new THREE.BoxGeometry(door.width, door.height, 0.05);
        const mat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.6 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(door.position);
        mesh.quaternion.copy(door.rotation);
        mesh.castShadow = true;
        group.add(mesh);
      }
    }

    return group;
  }

  // =======================================================================
  // Indoor: Windows
  // =======================================================================

  createWindows(result: IndoorSceneResult): THREE.Group {
    const group = new THREE.Group();
    group.name = 'windows';

    for (const win of result.windows) {
      try {
        const gen = new WindowGenerator();
        const winObj = gen.generate?.({ width: win.width, height: win.height });
        if (winObj) {
          winObj.position.copy(win.position);
          winObj.quaternion.copy(win.rotation);
          group.add(winObj);
        }
      } catch (err) {
        // Fallback: transparent window pane
        const geo = new THREE.PlaneGeometry(win.width, win.height);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x87ceeb,
          transparent: true,
          opacity: 0.3,
          roughness: 0.0,
          metalness: 0.5,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(win.position);
        mesh.quaternion.copy(win.rotation);
        group.add(mesh);
      }
    }

    return group;
  }

  // =======================================================================
  // Helpers
  // =======================================================================

  private seededRandom(seed: number): number {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  private createInstancedGroundCover(
    type: string,
    positions: THREE.Vector3[],
    seed: number,
  ): THREE.Group | null {
    const group = new THREE.Group();
    const maxCount = Math.min(positions.length, 200);
    const dummy = new THREE.Object3D();

    // Determine geometry and material by type
    let geo: THREE.BufferGeometry;
    let mat: THREE.MeshStandardMaterial;
    let scale: number;

    switch (type) {
      case 'flowers':
        geo = new THREE.SphereGeometry(0.05, 6, 6);
        mat = new THREE.MeshStandardMaterial({
          color: [0xff69b4, 0xffff00, 0xff6347, 0x9370db][seed % 4],
          roughness: 0.6,
        });
        scale = 1.0;
        break;
      case 'mushrooms':
        geo = new THREE.ConeGeometry(0.03, 0.08, 6);
        mat = new THREE.MeshStandardMaterial({ color: 0xc0a060, roughness: 0.7 });
        scale = 1.5;
        break;
      case 'pine_debris':
      case 'twigs':
        geo = new THREE.CylinderGeometry(0.005, 0.005, 0.15, 4);
        mat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
        scale = 1.0;
        break;
      default:
        geo = new THREE.SphereGeometry(0.02, 4, 4);
        mat = new THREE.MeshStandardMaterial({ color: 0x556b2f, roughness: 0.8 });
        scale = 1.0;
    }

    const mesh = new THREE.InstancedMesh(geo, mat, maxCount);
    for (let i = 0; i < maxCount; i++) {
      dummy.position.copy(positions[i]);
      dummy.scale.setScalar(scale);
      dummy.rotation.set(
        (this.seededRandom(seed + i) - 0.5) * 0.5,
        this.seededRandom(seed + 1000 + i) * Math.PI * 2,
        (this.seededRandom(seed + 2000 + i) - 0.5) * 0.5,
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);

    return group;
  }

  /** Wrap an Object3D in a Group if it isn't already one */
  private wrapInGroup(obj: THREE.Object3D): THREE.Group {
    if ((obj as any).isGroup) return obj as THREE.Group;
    const group = new THREE.Group();
    group.add(obj);
    return group;
  }

  private createIndoorObject(obj: IndoorObject): THREE.Group | null {
    const cat = obj.category;
    const seed = obj.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

    // Map category to generator
    if (cat.includes('sofa')) {
      const factory = new SofaFactory();
      return this.wrapInGroup(factory.generate({ sofaStyle: 'modern' }));
    }
    if (cat.includes('chair') && cat.includes('armchair')) {
      const factory = new ChairFactory();
      return this.wrapInGroup(factory.generate());
    }
    if (cat.includes('chair')) {
      const factory = new ChairFactory();
      return this.wrapInGroup(factory.generate());
    }
    if (cat.includes('table') && cat.includes('coffee')) {
      const factory = new TableFactory();
      return this.wrapInGroup(factory.generate());
    }
    if (cat.includes('table') && cat.includes('dining')) {
      const factory = new TableFactory();
      return this.wrapInGroup(factory.generate());
    }
    if (cat.includes('table') && cat.includes('kitchen_island')) {
      const factory = new TableFactory();
      return this.wrapInGroup(factory.generate());
    }
    if (cat.includes('desk')) {
      const gen = new DeskGenerator();
      return this.wrapInGroup(gen.generate());
    }
    if (cat.includes('table')) {
      const factory = new TableFactory();
      return this.wrapInGroup(factory.generate());
    }
    if (cat.includes('bed')) {
      const gen = new BedGenerator();
      return this.wrapInGroup(gen.generate());
    }
    if (cat.includes('bookcase') || cat.includes('bookshelf')) {
      const gen = new ShelfGenerator();
      return this.wrapInGroup(gen.generate({ shelfType: 'bookcase' }));
    }
    if (cat.includes('shelf')) {
      const gen = new ShelfGenerator();
      return this.wrapInGroup(gen.generate());
    }
    if (cat.includes('wardrobe')) {
      const gen = new WardrobeGenerator();
      return gen.generate().mesh;
    }
    if (cat.includes('cabinet')) {
      const gen = new CabinetGenerator();
      return this.wrapInGroup(gen.generate());
    }
    if (cat.includes('rug')) {
      // Flat rug
      const group = new THREE.Group();
      const geo = new THREE.CircleGeometry(1.2, 32);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.95 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      group.add(mesh);
      return group;
    }
    if (cat.includes('mirror')) {
      const group = new THREE.Group();
      const geo = new THREE.PlaneGeometry(0.6, 1.0);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xc0c0c0,
        metalness: 0.9,
        roughness: 0.05,
      });
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
      return group;
    }
    if (cat.includes('plant')) {
      const gen = new FernGenerator(seed);
      return gen.generate({ size: 0.5 });
    }
    if (cat.includes('stool')) {
      const factory = new ChairFactory();
      return this.wrapInGroup(factory.generate());
    }
    if (cat.includes('bathtub')) {
      const group = new THREE.Group();
      const geo = new THREE.BoxGeometry(1.7, 0.6, 0.8);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      group.add(mesh);
      return group;
    }
    if (cat.includes('toilet')) {
      const group = new THREE.Group();
      const geo = new THREE.CylinderGeometry(0.2, 0.25, 0.45, 12);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.1 });
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
      return group;
    }
    if (cat.includes('sink')) {
      const group = new THREE.Group();
      const geo = new THREE.CylinderGeometry(0.2, 0.18, 0.12, 16);
      const mat = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.05, metalness: 0.3 });
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
      return group;
    }
    if (cat.includes('car')) {
      // Placeholder car shape
      const group = new THREE.Group();
      const bodyGeo = new THREE.BoxGeometry(2.0, 0.8, 4.5);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2244aa, roughness: 0.3, metalness: 0.5 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.6;
      group.add(body);
      const topGeo = new THREE.BoxGeometry(1.6, 0.6, 2.0);
      const topMat = new THREE.MeshStandardMaterial({ color: 0x88bbff, roughness: 0.0, metalness: 0.8, transparent: true, opacity: 0.5 });
      const top = new THREE.Mesh(topGeo, topMat);
      top.position.set(0, 1.3, -0.3);
      group.add(top);
      return group;
    }
    if (cat.includes('forklift')) {
      const group = new THREE.Group();
      const bodyGeo = new THREE.BoxGeometry(1.2, 1.5, 2.5);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xccaa00, roughness: 0.4, metalness: 0.3 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 1.0;
      group.add(body);
      return group;
    }
    if (cat.includes('furnace') || cat.includes('water_heater') || cat.includes('appliance')) {
      const group = new THREE.Group();
      const size = this.getObjectSize(cat);
      const geo = new THREE.BoxGeometry(size, size, size * 0.7);
      const mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.4 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      group.add(mesh);
      return group;
    }

    // Generic fallback for anything not matched
    return null;
  }

  private getObjectSize(category: string): number {
    if (category.includes('large')) return 1.8;
    if (category.includes('sofa') || category.includes('bed') || category.includes('car')) return 2.0;
    if (category.includes('table') || category.includes('desk')) return 1.2;
    if (category.includes('chair') || category.includes('stool')) return 0.5;
    if (category.includes('shelf') || category.includes('cabinet') || category.includes('wardrobe')) return 1.0;
    if (category.includes('lamp') || category.includes('lighting')) return 0.3;
    if (category.includes('rug') || category.includes('mirror')) return 0.8;
    if (category.includes('stove') || category.includes('refrigerator') || category.includes('furnace')) return 0.8;
    if (category.includes('counter') || category.includes('workbench')) return 1.5;
    return 0.6;
  }

  private getObjectColor(category: string): number {
    if (category.includes('sofa')) return 0x6b4226;
    if (category.includes('bed')) return 0xd2b48c;
    if (category.includes('table') || category.includes('desk')) return 0x8b6914;
    if (category.includes('chair')) return 0x654321;
    if (category.includes('shelf') || category.includes('cabinet')) return 0x8b7355;
    if (category.includes('lamp')) return 0x2f4f4f;
    if (category.includes('rug')) return 0x8b4513;
    if (category.includes('mirror')) return 0xc0c0c0;
    if (category.includes('stove') || category.includes('appliance')) return 0x404040;
    if (category.includes('counter')) return 0xd2c6a5;
    if (category.includes('fixture')) return 0xe0e0e0;
    if (category.includes('storage') || category.includes('box')) return 0x8b7355;
    if (category.includes('vehicle')) return 0x2244aa;
    return 0x808080;
  }
}

// ---------------------------------------------------------------------------
// Extracted config types for React component consumption
// ---------------------------------------------------------------------------

export interface LightingObjectConfig {
  sunPosition: THREE.Vector3;
  sunIntensity: number;
  sunColor: string;
  ambientIntensity: number;
  ambientColor: string;
  hemisphereSkyColor: string;
  hemisphereGroundColor: string;
  hemisphereIntensity: number;
}

export interface CameraObjectConfig {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  near: number;
  far: number;
}

// ---------------------------------------------------------------------------
// Convenience function
// ---------------------------------------------------------------------------

/**
 * One-liner: compose a nature scene and produce Three.js objects.
 *
 * @example
 * const { root, nature } = composeAndCreateNatureScene({ terrain: { seed: 42 } });
 * scene.add(root);
 */
export function composeAndCreateNatureScene(
  config: Partial<NatureSceneConfig>,
  seed?: number,
): SceneFactoryResult {
  const composer = new NatureSceneComposer(config);
  const result = composer.compose(seed);
  const factory = new SceneObjectFactory();
  return factory.createScene(result);
}
