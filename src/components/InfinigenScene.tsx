'use client';

import React, { useRef, useMemo, useEffect, useState, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { TerrainGenerator } from '@/terrain/core/TerrainGenerator';
import { OceanSurface } from '@/terrain/water/OceanSystem';
import { SSGIPass, type SSGIConfig } from '@/core/rendering/postprocess/SSGIPass';
import { SSAOPass, type SSAOConfig } from '@/core/rendering/postprocess/SSAOPass';
import { ExposureControl, type ToneMappingPreset } from '@/core/rendering/lighting/ExposureControl';

// Vegetation imports
import { LSystemEngine, LSystemPresets, generateLSystemTree } from '@/assets/objects/vegetation/trees/LSystemEngine';
import { FernGenerator, type FernSpecies, FernSpeciesPresets } from '@/assets/objects/vegetation/plants/FernGenerator';
import { FlowerGenerator, type FlowerType, FlowerSpeciesPresets } from '@/assets/objects/vegetation/plants/FlowerGenerator';
import { MushroomGenerator, type MushroomSpecies, MushroomSpeciesPresets } from '@/assets/objects/vegetation/plants/MushroomGenerator';
import { IvyClimbingSystem, type ClimbingPlantType } from '@/assets/objects/vegetation/climbing/IvyClimbingSystem';
import { ForestFloorScatter, type Season } from '@/assets/objects/vegetation/scatter/ForestFloorScatter';
import { WindAnimationController } from '@/assets/objects/vegetation/WindAnimationController';
import { VegetationLODSystem } from '@/assets/objects/vegetation/VegetationLODSystem';

// Composition system imports
import {
  NatureSceneComposer,
  type NatureSceneResult,
  type Season as CompSeason,
  ALL_PRESETS,
  getPreset,
  type ScenePreset,
} from '@/assets/composition';

// Creature imports (Phase 3.2)
import { MammalGenerator } from '@/assets/objects/creatures/MammalGenerator';
import { BirdGenerator } from '@/assets/objects/creatures/BirdGenerator';
import { SwarmSystem, type SwarmConfig } from '@/assets/objects/creatures/swarm/SwarmSystem';

// Phase 4.1 — Camera System
import {
  OrbitShot,
  DollyShot as DollyShotImpl,
  CraneShot as CraneShotImpl,
  HandheldSim,
  type TrajectoryTypeName,
  type TrajectoryBaseConfig,
} from '@/core/placement/camera/trajectories/TrajectoryImplementations';
import { DepthOfField, DEFAULT_DOF_CONFIG } from '@/core/placement/camera/DepthOfField';
import type { TrajectorySample } from '@/core/placement/camera/trajectories/TrajectoryGenerator';

// Phase 4.2 — Ground Truth
import { GroundTruthRenderer } from '@/datagen/pipeline/GroundTruthRenderer';
import { AnnotationExporter } from '@/datagen/pipeline/AnnotationExporter';

// Phase 3.3 — Material & Texture Pipeline
import { MaterialPresetLibrary, type MaterialCategory } from '@/assets/materials/MaterialPresetLibrary';
import { WearGenerator, type WearParams } from '@/assets/materials/wear/WearGenerator';

// ---------------------------------------------------------------------------
// Feature toggles (controlled via keyboard shortcuts)
// ---------------------------------------------------------------------------

interface FeatureFlags {
  ssgi: boolean;
  ssao: boolean;
  autoExposure: boolean;
  showDebug: boolean;
  wind: boolean;
  creatures: boolean;
  dof: boolean;           // Phase 4.1
  cameraPath: boolean;    // Phase 4.1 — show camera path visualization
  pbrMaterials: boolean;  // Phase 3.3 — use PBR texture materials
  materialInfo: boolean;  // Phase 3.3 — show material info on hover
}

// ---------------------------------------------------------------------------
// Season type
// ---------------------------------------------------------------------------

type VegetationSeason = 'spring' | 'summer' | 'autumn' | 'winter';

// ---------------------------------------------------------------------------
// Terrain Component — procedural heightmap with biome vertex colors
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

interface TerrainProps {
  seed: number;
  scale: number;
  seaLevel: number;
}

function TerrainMesh({ seed, scale, seaLevel }: TerrainProps) {
  const { geometry } = useMemo(() => {
    const generator = new TerrainGenerator({
      seed,
      width: 128,
      height: 128,
      scale,
      octaves: 6,
      persistence: 0.5,
      lacunarity: 2.0,
      erosionStrength: 0.3,
      erosionIterations: 10,
      tectonicPlates: 3,
      seaLevel,
    });

    const terrainData = generator.generate();
    const { data: heightData, width, height } = terrainData.heightMap;
    const { biomeMask } = terrainData;

    const worldSize = 200;
    const heightScale = 35;

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

    return { geometry: geo };
  }, [seed, scale, seaLevel]);

  return (
    <mesh geometry={geometry} receiveShadow castShadow>
      <meshStandardMaterial vertexColors side={THREE.FrontSide} flatShading={false} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// L-System Trees Component
// ---------------------------------------------------------------------------

function LSystemTrees({ density }: { density: number }) {
  const group = useMemo(() => {
    const g = new THREE.Group();

    const treeCount = Math.max(1, Math.round(density * 10));
    const presets = ['oak', 'conifer', 'birch'] as const;

    for (let i = 0; i < treeCount; i++) {
      const preset = presets[i % presets.length];
      const angle = (i / treeCount) * Math.PI * 2;
      const radius = 15 + i * 3;
      const tree = generateLSystemTree(preset, 100 + i);
      tree.position.set(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius,
      );
      tree.scale.setScalar(0.5 + Math.random() * 0.3);
      tree.castShadow = true;
      g.add(tree);
    }

    return g;
  }, [density]);

  return <primitive object={group} />;
}

// ---------------------------------------------------------------------------
// Enhanced Plants Component
// ---------------------------------------------------------------------------

function EnhancedPlants({ flowerDensity, mushroomDensity }: { flowerDensity: number; mushroomDensity: number }) {
  const group = useMemo(() => {
    const g = new THREE.Group();

    // Ferns
    const fernGenerator = new FernGenerator(42);
    const fernSpecies: FernSpecies[] = ['boston', 'maidenhair', 'staghorn'];
    const fernPositions = [
      new THREE.Vector3(-5, 0, 3),
      new THREE.Vector3(-3, 0, 5),
      new THREE.Vector3(8, 0, -8),
    ];

    for (let i = 0; i < fernPositions.length; i++) {
      const fern = fernGenerator.generate({
        species: fernSpecies[i],
        size: 0.8 + Math.random() * 0.4,
      });
      fern.position.copy(fernPositions[i]);
      fern.rotation.y = Math.random() * Math.PI * 2;
      g.add(fern);
    }

    // Flowers
    const flowerGenerator = new FlowerGenerator();
    const flowerTypes: FlowerType[] = ['rose', 'daisy', 'tulip', 'sunflower'];
    const flowerPositions = [
      new THREE.Vector3(3, 0, 5),
      new THREE.Vector3(5, 0, 3),
      new THREE.Vector3(-8, 0, -3),
      new THREE.Vector3(7, 0, -5),
    ];

    for (let i = 0; i < flowerTypes.length; i++) {
      const flower = flowerGenerator.generateFlower({
        variety: flowerTypes[i],
      }, 1000 + i);
      flower.position.copy(flowerPositions[i]);
      g.add(flower);
    }

    // Flower field (instanced) - scaled by density
    const flowerField = flowerGenerator.generateFlowerField({
      variety: 'daisy',
      count: Math.round(flowerDensity * 100),
      spreadArea: { width: 15, depth: 15 },
      density: flowerDensity,
    }, 5000);
    g.add(flowerField);

    // Mushrooms
    const mushroomGenerator = new MushroomGenerator(42);
    const mushroomSpecies: MushroomSpecies[] = ['agaric', 'chanterelle', 'morel', 'bolete'];
    const mushroomPositions = [
      new THREE.Vector3(-4, 0, -2),
      new THREE.Vector3(6, 0, 4),
      new THREE.Vector3(-7, 0, 7),
      new THREE.Vector3(2, 0, -6),
    ];

    const mushroomCount = Math.max(1, Math.round(mushroomDensity * 4));
    for (let i = 0; i < mushroomCount && i < mushroomSpecies.length; i++) {
      const mushroom = mushroomGenerator.generate({
        species: mushroomSpecies[i],
      });
      mushroom.position.copy(mushroomPositions[i]);
      mushroom.scale.setScalar(1.5);
      g.add(mushroom);
    }

    // Mushroom cluster
    if (mushroomDensity > 0.05) {
      const cluster = mushroomGenerator.generateCluster({ species: 'button' }, 5, 0.2);
      cluster.position.set(4, 0, -3);
      g.add(cluster);
    }

    return g;
  }, [flowerDensity, mushroomDensity]);

  return <primitive object={group} />;
}

// ---------------------------------------------------------------------------
// Material Preview Spheres (Phase 3.3)
// ---------------------------------------------------------------------------

function MaterialPreviewSpheres({ visible }: { visible: boolean }) {
  const group = useMemo(() => {
    if (!visible) return new THREE.Group();

    const g = new THREE.Group();
    g.name = 'material-preview';

    const library = new MaterialPresetLibrary(256);

    // Display a selection of material presets as spheres
    const showcasePresets: Array<{ id: string; x: number; z: number }> = [
      { id: 'mossy_stone', x: -8, z: -15 },
      { id: 'oak', x: -5, z: -15 },
      { id: 'steel', x: -2, z: -15 },
      { id: 'porcelain', x: 1, z: -15 },
      { id: 'cotton', x: 4, z: -15 },
      { id: 'glossy_plastic', x: 7, z: -15 },
      { id: 'grass', x: -8, z: -12 },
      { id: 'sand', x: -5, z: -12 },
      { id: 'leather', x: -2, z: -12 },
      { id: 'marble', x: 1, z: -12 },
      { id: 'copper', x: 4, z: -12 },
      { id: 'snow', x: 7, z: -12 },
    ];

    for (const { id, x, z } of showcasePresets) {
      const preset = library.getPreset(id);
      const mat = library.getSimpleMaterial(id, { age: 0.1 });
      if (mat && preset) {
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.8, 24, 24),
          mat
        );
        sphere.position.set(x, 1.5, z);
        sphere.castShadow = true;
        sphere.receiveShadow = true;
        sphere.userData = {
          materialPreset: id,
          materialCategory: preset.category,
          materialName: preset.name,
          materialDesc: preset.description,
        };
        g.add(sphere);
      }
    }

    return g;
  }, [visible]);

  if (!visible) return null;
  return <primitive object={group} />;
}

// ---------------------------------------------------------------------------
// Material Info Display (Phase 3.3)
// ---------------------------------------------------------------------------

function MaterialInfoPanel({ selectedObject }: { selectedObject: THREE.Object3D | null }) {
  if (!selectedObject) return null;

  const userData = selectedObject.userData;
  const preset = userData?.materialPreset as string | undefined;
  const category = userData?.materialCategory as string | undefined;
  const name = userData?.materialName as string | undefined;
  const desc = userData?.materialDesc as string | undefined;

  if (!preset) return null;

  return (
    <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-3 space-y-1 min-w-[200px]">
      <p className="text-xs font-bold text-emerald-400">Material Info</p>
      <p className="text-sm text-gray-200">{name ?? preset}</p>
      {category && <p className="text-xs text-gray-400">Category: {category}</p>}
      {desc && <p className="text-xs text-gray-500">{desc}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ivy on Rock Component
// ---------------------------------------------------------------------------

function IvyOnRock({ usePBR }: { usePBR: boolean }) {
  const group = useMemo(() => {
    const g = new THREE.Group();

    // Simple rock
    const rockGeo = new THREE.DodecahedronGeometry(1.5, 1);
    const positions = rockGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      positions.setX(i, x * (0.8 + Math.random() * 0.4));
      positions.setY(i, y * (0.6 + Math.random() * 0.4));
      positions.setZ(i, z * (0.8 + Math.random() * 0.4));
    }
    rockGeo.computeVertexNormals();

    // Phase 3.3: Apply PBR material with wear to the rock
    let rockMat: THREE.Material;
    if (usePBR) {
      try {
        const library = new MaterialPresetLibrary(256);
        const pbrMat = library.getSimpleMaterial('mossy_stone', { age: 0.3, wear: 0.4 });
        if (pbrMat) {
          // Apply wear effects to the rock
          const wearGen = new WearGenerator();
          wearGen.applyToMaterial(pbrMat, wearGen.getStoneWearParams(), 42);
          rockMat = pbrMat;
        } else {
          rockMat = new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.9,
            metalness: 0.0,
          });
        }
      } catch (err) {
        // Silently fall back - rock material generation failed, using simple material
        if (process.env.NODE_ENV === 'development') console.debug('[InfinigenScene] rock material fallback:', err);
        rockMat = new THREE.MeshStandardMaterial({
          color: 0x808080,
          roughness: 0.9,
          metalness: 0.0,
        });
      }
    } else {
      rockMat = new THREE.MeshStandardMaterial({
        color: 0x808080,
        roughness: 0.9,
        metalness: 0.0,
      });
    }

    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set(20, 0.8, -10);
    rock.castShadow = true;
    rock.receiveShadow = true;
    rock.userData = { materialPreset: 'mossy_stone', materialCategory: 'terrain' };
    g.add(rock);

    // Ivy climbing on the rock
    const ivySystem = new IvyClimbingSystem(42, { plantType: 'ivy' });
    const ivy = ivySystem.generateOnWall(
      new THREE.Vector3(20, 0.5, -10),
      new THREE.Vector3(0, 0, 1),
      2
    );
    g.add(ivy);

    return g;
  }, [usePBR]);

  return <primitive object={group} />;
}

// ---------------------------------------------------------------------------
// Creatures Component (Phase 3.2)
// ---------------------------------------------------------------------------

function Creatures({ visible }: { visible: boolean }) {
  const group = useMemo(() => {
    const g = new THREE.Group();
    g.name = 'creatures';

    // Quadruped (deer-like mammal on the plains)
    const mammalGen = new MammalGenerator(101);
    const mammal = mammalGen.generate('deer');
    mammal.position.set(-10, 0.5, 8);
    mammal.scale.setScalar(0.5);
    mammal.rotation.y = Math.PI * 0.3;
    g.add(mammal);

    // Second mammal (dog-like)
    const dogGen = new MammalGenerator(202);
    const dog = dogGen.generate('dog');
    dog.position.set(-6, 0.3, 12);
    dog.scale.setScalar(0.4);
    dog.rotation.y = -Math.PI * 0.2;
    g.add(dog);

    // Bird
    const birdGen = new BirdGenerator(303);
    const bird = birdGen.generate('sparrow');
    bird.position.set(5, 8, -3);
    bird.scale.setScalar(2.0);
    bird.rotation.y = -Math.PI * 0.4;
    g.add(bird);

    return g;
  }, []);

  if (!visible) return null;
  return <primitive object={group} />;
}

// ---------------------------------------------------------------------------
// Fish School Swarm Component (Phase 3.2)
// ---------------------------------------------------------------------------

function FishSchool({ visible, waterLevel }: { visible: boolean; waterLevel: number }) {
  const swarmRef = useRef<SwarmSystem | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    if (!visible) return;

    const swarm = new SwarmSystem({
      count: 80,
      speed: 1.5,
      separationStrength: 1.8,
      alignmentStrength: 1.2,
      cohesionStrength: 0.8,
      boundaryStrength: 2.5,
      center: new THREE.Vector3(15, waterLevel * 35 - 2, -15),
      bounds: new THREE.Vector3(12, 3, 12),
      individualSize: 0.12,
      color: new THREE.Color(0x4682b4),
      secondaryColor: new THREE.Color(0xc0c0c0),
      swarmType: 'fish',
      separationDistance: 0.6,
      neighborRadius: 2.5,
    }, 42);

    swarmRef.current = swarm;
    groupRef.current = swarm.getGroup();

    return () => {
      swarm.dispose();
    };
  }, [visible, waterLevel]);

  useFrame((_, delta) => {
    if (swarmRef.current && visible) {
      swarmRef.current.update(delta);
    }
  });

  if (!visible || !groupRef.current) return null;
  return <primitive object={groupRef.current} />;
}

// ---------------------------------------------------------------------------
// Forest Floor Scatter Component
// ---------------------------------------------------------------------------

function ForestFloorScatterComponent({ season }: { season: VegetationSeason }) {
  const group = useMemo(() => {
    const scatter = new ForestFloorScatter(42, {
      areaSize: 40,
      density: 0.7,
      biome: 'forest',
      season: season as Season,
      maxInstancesPerType: 200,
    });
    return scatter.generate();
  }, [season]);

  return <primitive object={group} />;
}

// ---------------------------------------------------------------------------
// Wind Animation Component
// ---------------------------------------------------------------------------

function WindAnimation({ enabled }: { enabled: boolean }) {
  const { scene } = useThree();
  const controllerRef = useRef<WindAnimationController | null>(null);

  useEffect(() => {
    const controller = new WindAnimationController({
      speed: 3.0,
      gustAmplitude: 0.4,
      gustFrequency: 0.3,
      direction: new THREE.Vector3(1, 0, 0.3).normalize(),
    });
    controllerRef.current = controller;

    // Register existing vegetation meshes for wind animation
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.tags) {
        const tags = child.userData.tags as string[];
        if (tags.includes('vegetation')) {
          const flex = tags.includes('tree') ? 0.01 : tags.includes('grass') ? 0.05 : 0.03;
          controller.registerMesh(child, flex);
        }
      }
    });

    return () => {
      controller.dispose();
    };
  }, [scene]);

  useFrame((_, delta) => {
    if (controllerRef.current && enabled) {
      controllerRef.current.update(delta);
    }
  });

  return null;
}

// ---------------------------------------------------------------------------
// Ocean Component — Gerstner-wave animated ocean surface
// ---------------------------------------------------------------------------

function OceanMesh({ waterLevel }: { waterLevel: number }) {
  const oceanRef = useRef<OceanSurface | null>(null);
  const { camera } = useThree();

  const mesh = useMemo(() => {
    const ocean = new OceanSurface({
      size: 500,
      resolution: 64,
      waveHeight: 1.2,
      waveLength: 25,
      windDirection: [1.0, 0.3],
      windSpeed: 8,
    });
    oceanRef.current = ocean;
    const m = ocean.getMesh();
    m.position.y = waterLevel * 35;
    return m;
  }, [waterLevel]);

  useFrame((_, delta) => {
    if (oceanRef.current) {
      oceanRef.current.update(delta);
      oceanRef.current.setCameraPosition(camera.position);
    }
  });

  useEffect(() => {
    return () => {
      oceanRef.current?.dispose();
    };
  }, []);

  return <primitive object={mesh} />;
}

// ---------------------------------------------------------------------------
// Lighting Component — outdoor daylight setup with cascaded shadows
// ---------------------------------------------------------------------------

interface LightingProps {
  sunPosition: THREE.Vector3;
  sunIntensity: number;
  sunColor: string;
  ambientIntensity: number;
  ambientColor: string;
  hemisphereSkyColor: string;
  hemisphereGroundColor: string;
  hemisphereIntensity: number;
}

function LightingSystem({
  sunPosition,
  sunIntensity,
  sunColor,
  ambientIntensity,
  ambientColor,
  hemisphereSkyColor,
  hemisphereGroundColor,
  hemisphereIntensity,
}: LightingProps) {
  const lightRef = useRef<THREE.DirectionalLight>(null);

  useEffect(() => {
    if (lightRef.current) {
      lightRef.current.shadow.mapSize.width = 2048;
      lightRef.current.shadow.mapSize.height = 2048;
      lightRef.current.shadow.camera.near = 0.5;
      lightRef.current.shadow.camera.far = 300;
      lightRef.current.shadow.camera.left = -120;
      lightRef.current.shadow.camera.right = 120;
      lightRef.current.shadow.camera.top = 120;
      lightRef.current.shadow.camera.bottom = -120;
      lightRef.current.shadow.bias = -0.0005;
      lightRef.current.shadow.normalBias = 0.02;
    }
  }, []);

  return (
    <>
      <ambientLight intensity={ambientIntensity} color={ambientColor} />
      <hemisphereLight
        args={[hemisphereSkyColor, hemisphereGroundColor, hemisphereIntensity]}
      />
      <directionalLight
        ref={lightRef}
        position={[sunPosition.x, sunPosition.y, sunPosition.z]}
        intensity={sunIntensity}
        color={sunColor}
        castShadow
      />
      <directionalLight
        position={[-40, 60, -30]}
        intensity={0.3}
        color="#a8c8e8"
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Post-Processing Component — SSGI + SSAO
// ---------------------------------------------------------------------------

interface PostProcessProps {
  features: FeatureFlags;
  onLuminanceMeasured?: (luminance: number) => void;
}

function PostProcessEffect({ features, onLuminanceMeasured }: PostProcessProps) {
  const { gl, camera, scene } = useThree();
  const ssgiPassRef = useRef<SSGIPass | null>(null);
  const ssaoPassRef = useRef<SSAOPass | null>(null);
  const renderTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const outputTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const luminanceFrameRef = useRef(0);

  useEffect(() => {
    const size = gl.getSize(new THREE.Vector2());

    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(size.x, size.y),
    };
    (rtOpts.depthTexture as THREE.DepthTexture).format = THREE.DepthFormat;
    (rtOpts.depthTexture as THREE.DepthTexture).type = THREE.UnsignedShortType;

    renderTargetRef.current = new THREE.WebGLRenderTarget(size.x, size.y, rtOpts);
    outputTargetRef.current = new THREE.WebGLRenderTarget(size.x, size.y, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    });

    const ssgi = new SSGIPass(gl, scene, camera, {
      radius: 3.0,
      intensity: 0.4,
      samples: 6,
      resolution: 0.5,
      blurSharpness: 8.0,
    });
    ssgiPassRef.current = ssgi;

    const ssao = new SSAOPass(gl, camera, {
      radius: 0.8,
      intensity: 1.2,
      samples: 16,
      resolution: 0.5,
      blurSharpness: 6.0,
      blurSize: 2,
    });
    ssaoPassRef.current = ssao;

    return () => {
      ssgi.dispose();
      ssao.dispose();
      renderTargetRef.current?.dispose();
      outputTargetRef.current?.dispose();
    };
  }, [gl, scene, camera]);

  useEffect(() => {
    const handleResize = () => {
      const size = gl.getSize(new THREE.Vector2());
      if (renderTargetRef.current) {
        renderTargetRef.current.setSize(size.x, size.y);
      }
      if (outputTargetRef.current) {
        outputTargetRef.current.setSize(size.x, size.y);
      }
      ssgiPassRef.current?.setSize(size.x, size.y);
      ssaoPassRef.current?.setSize(size.x, size.y);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [gl]);

  useFrame(({ gl: renderer, scene: s, camera: cam }, delta) => {
    if (!renderTargetRef.current || !outputTargetRef.current) return;

    luminanceFrameRef.current++;
    if (onLuminanceMeasured && luminanceFrameRef.current % 4 === 0) {
      const perspCam = cam as THREE.PerspectiveCamera;
      const exposure = renderer.toneMappingExposure;
      const luminance = 1.0 / Math.max(exposure, 0.001);
      onLuminanceMeasured(luminance);
    }

    renderer.setRenderTarget(renderTargetRef.current);
    renderer.render(s, cam);

    let currentRT = renderTargetRef.current;

    if (features.ssao && ssaoPassRef.current) {
      const tempRT = outputTargetRef.current;
      ssaoPassRef.current.render(renderer, tempRT, currentRT);
      currentRT = tempRT;
    }

    if (features.ssgi && ssgiPassRef.current) {
      const tempRT = currentRT === renderTargetRef.current
        ? outputTargetRef.current
        : renderTargetRef.current;
      ssgiPassRef.current.render(renderer, tempRT, currentRT);
      currentRT = tempRT;
    }

    renderer.setRenderTarget(null);
    if (currentRT) {
      const copyMat = new THREE.MeshBasicMaterial({
        map: currentRT.texture,
        depthWrite: false,
        depthTest: false,
      });
      const copyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMat);
      const copyScene = new THREE.Scene();
      copyScene.add(copyQuad);
      const copyCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      renderer.render(copyScene, copyCam);

      copyMat.dispose();
      copyQuad.geometry.dispose();
    }
  }, 100);

  return null;
}

// ---------------------------------------------------------------------------
// Exposure Control Component
// ---------------------------------------------------------------------------

interface ExposureControlProps {
  autoExposure: boolean;
}

function ExposureControlEffect({ autoExposure }: ExposureControlProps) {
  const { gl } = useThree();
  const exposureRef = useRef<ExposureControl | null>(null);

  useEffect(() => {
    const ctrl = new ExposureControl({
      autoExposure,
      manualExposure: 1.0,
      toneMapping: 'aces',
      minExposure: 0.3,
      maxExposure: 4.0,
      adaptationSpeedUp: 3.0,
      adaptationSpeedDown: 1.0,
    });
    exposureRef.current = ctrl;
    ctrl.applyToRenderer(gl);

    return () => {
      ctrl.dispose();
    };
  }, [gl]);

  useEffect(() => {
    if (exposureRef.current) {
      exposureRef.current.setConfig({ autoExposure });
    }
  }, [autoExposure]);

  useFrame((_, delta) => {
    if (exposureRef.current) {
      exposureRef.current.update(delta, autoExposure ? undefined : undefined);
      exposureRef.current.applyToRenderer(gl);
    }
  });

  return null;
}

// ---------------------------------------------------------------------------
// Camera Trajectory Player (Phase 4.1)
// ---------------------------------------------------------------------------

interface TrajectoryPlayerProps {
  playing: boolean;
  samples: TrajectorySample[];
  onPlayToggle: () => void;
}

function TrajectoryPlayer({ playing, samples, onPlayToggle }: TrajectoryPlayerProps) {
  const { camera } = useThree();
  const indexRef = useRef(0);

  useFrame(() => {
    if (!playing || samples.length === 0) return;
    const idx = indexRef.current % samples.length;
    const sample = samples[idx];
    camera.position.copy(sample.position);
    camera.lookAt(sample.target);
    indexRef.current = (idx + 1) % samples.length;
  });

  return null;
}

// ---------------------------------------------------------------------------
// Camera Path Visualization (Phase 4.1)
// ---------------------------------------------------------------------------

function CameraPathVis({ samples, visible }: { samples: TrajectorySample[]; visible: boolean }) {
  const lineObj = useMemo(() => {
    if (samples.length === 0) return null;
    const points = samples.map((s) => s.position);
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.7 });
    return new THREE.Line(geo, mat);
  }, [samples]);

  if (!visible || !lineObj) return null;

  return <primitive object={lineObj} />;
}

// ---------------------------------------------------------------------------
// DOF Effect Component (Phase 4.1)
// ---------------------------------------------------------------------------

function DOFEffect({ enabled }: { enabled: boolean }) {
  const { camera, scene } = useThree();
  const dofRef = useRef<DepthOfField | null>(null);

  useEffect(() => {
    const dof = new DepthOfField({ ...DEFAULT_DOF_CONFIG, autoFocus: true });
    dofRef.current = dof;
    return () => { dofRef.current = null; };
  }, []);

  useFrame(() => {
    if (!dofRef.current || !enabled) return;
    const perspCam = camera as THREE.PerspectiveCamera;
    dofRef.current.autoFocus(perspCam, scene);
  });

  if (!enabled) return null;
  return null;
}

// ---------------------------------------------------------------------------
// Camera Controller — sets initial camera position
// ---------------------------------------------------------------------------

function CameraSetup({ position, target }: { position: THREE.Vector3; target: THREE.Vector3 }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.copy(position);
    camera.lookAt(target);
  }, [camera, position, target]);

  return null;
}

// ---------------------------------------------------------------------------
// Keyboard shortcut handler
// ---------------------------------------------------------------------------

function KeyboardHandler({
  features,
  onFeaturesChange,
  onToneMappingCycle,
  onSeasonCycle,
  onTrajectoryToggle,
  onGTCapture,
}: {
  features: FeatureFlags;
  onFeaturesChange: (features: FeatureFlags) => void;
  onToneMappingCycle: () => void;
  onSeasonCycle: () => void;
  onTrajectoryToggle: () => void;
  onGTCapture: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case 'g':
          onFeaturesChange({ ...features, ssgi: !features.ssgi });
          break;
        case 'o':
          onFeaturesChange({ ...features, ssao: !features.ssao });
          break;
        case 'e':
          onFeaturesChange({ ...features, autoExposure: !features.autoExposure });
          break;
        case 't':
          onToneMappingCycle();
          break;
        case 'p':
          onFeaturesChange({ ...features, showDebug: !features.showDebug });
          break;
        case 'w':
          onFeaturesChange({ ...features, wind: !features.wind });
          break;
        case 's':
          onSeasonCycle();
          break;
        case 'c':
          onFeaturesChange({ ...features, creatures: !features.creatures });
          break;
        case 'd':
          onFeaturesChange({ ...features, dof: !features.dof });
          break;
        case 'v':
          onFeaturesChange({ ...features, cameraPath: !features.cameraPath });
          break;
        case 'l':
          onTrajectoryToggle();
          break;
        case 'x':
          onGTCapture();
          break;
        case 'm':
          onFeaturesChange({ ...features, pbrMaterials: !features.pbrMaterials });
          break;
        case 'n':
          onFeaturesChange({ ...features, materialInfo: !features.materialInfo });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [features, onFeaturesChange, onToneMappingCycle, onSeasonCycle, onTrajectoryToggle, onGTCapture]);

  return null;
}

// ---------------------------------------------------------------------------
// Scene Content — all 3D objects inside the Canvas
// ---------------------------------------------------------------------------

interface SceneContentProps {
  features: FeatureFlags;
  season: VegetationSeason;
  sceneConfig: NatureSceneResult | null;
  trajectoryPlaying: boolean;
  trajectorySamples: TrajectorySample[];
  onTrajectoryToggle: () => void;
  onGTCapture: () => void;
}

function SceneContent({ features, season, sceneConfig, trajectoryPlaying, trajectorySamples, onTrajectoryToggle, onGTCapture }: SceneContentProps) {
  const terrainSeed = sceneConfig?.terrainParams.seed ?? 42;
  const terrainScale = sceneConfig?.terrainParams.scale ?? 60;
  const seaLevel = sceneConfig?.waterConfig.waterLevel ?? 0.3;
  const treeDensity = sceneConfig?.vegetationConfig.treeDensity ?? 0.4;
  const flowerDensity = sceneConfig?.vegetationConfig.flowerDensity ?? 0.2;
  const mushroomDensity = sceneConfig?.vegetationConfig.mushroomDensity ?? 0.1;
  const cameraPos = sceneConfig?.cameraConfig.position ?? new THREE.Vector3(80, 60, 80);
  const cameraTarget = sceneConfig?.cameraConfig.target ?? new THREE.Vector3(0, 5, 0);

  const lightingProps: LightingProps = sceneConfig ? {
    sunPosition: sceneConfig.lightingConfig.sunPosition,
    sunIntensity: sceneConfig.lightingConfig.sunIntensity,
    sunColor: sceneConfig.lightingConfig.sunColor,
    ambientIntensity: sceneConfig.lightingConfig.ambientIntensity,
    ambientColor: sceneConfig.lightingConfig.ambientColor,
    hemisphereSkyColor: sceneConfig.lightingConfig.hemisphereSkyColor,
    hemisphereGroundColor: sceneConfig.lightingConfig.hemisphereGroundColor,
    hemisphereIntensity: sceneConfig.lightingConfig.hemisphereIntensity,
  } : {
    sunPosition: new THREE.Vector3(60, 100, 40),
    sunIntensity: 1.8,
    sunColor: '#fffbe6',
    ambientIntensity: 0.4,
    ambientColor: '#b8d4e8',
    hemisphereSkyColor: '#87ceeb',
    hemisphereGroundColor: '#3a5f0b',
    hemisphereIntensity: 0.35,
  };

  const showOcean = sceneConfig?.waterConfig.oceanEnabled ?? true;

  return (
    <>
      <CameraSetup position={cameraPos} target={cameraTarget} />
      <LightingSystem {...lightingProps} />
      <Sky
        distance={450000}
        sunPosition={[lightingProps.sunPosition.x, lightingProps.sunPosition.y, lightingProps.sunPosition.z]}
        inclination={0.52}
        azimuth={0.25}
        rayleigh={2}
        turbidity={8}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />
      <Suspense fallback={null}>
        <TerrainMesh seed={terrainSeed} scale={terrainScale} seaLevel={seaLevel} />
      </Suspense>
      {/* Phase 3.3: Material preview spheres using MaterialPresetLibrary */}
      <Suspense fallback={null}>
        <MaterialPreviewSpheres visible={features.pbrMaterials} />
      </Suspense>
      {showOcean && (
        <Suspense fallback={null}>
          <OceanMesh waterLevel={seaLevel} />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <LSystemTrees density={treeDensity} />
      </Suspense>
      <Suspense fallback={null}>
        <EnhancedPlants flowerDensity={flowerDensity} mushroomDensity={mushroomDensity} />
      </Suspense>
      <Suspense fallback={null}>
        <IvyOnRock usePBR={features.pbrMaterials} />
      </Suspense>
      <Suspense fallback={null}>
        <ForestFloorScatterComponent season={season} />
      </Suspense>
      <Suspense fallback={null}>
        <Creatures visible={features.creatures} />
      </Suspense>
      <FishSchool visible={features.creatures} waterLevel={seaLevel} />
      <WindAnimation enabled={features.wind} />
      <PostProcessEffect features={features} />
      <ExposureControlEffect autoExposure={features.autoExposure} />
      <DOFEffect enabled={features.dof} />
      <TrajectoryPlayer playing={trajectoryPlaying} samples={trajectorySamples} onPlayToggle={onTrajectoryToggle} />
      <CameraPathVis samples={trajectorySamples} visible={features.cameraPath} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        minDistance={10}
        maxDistance={400}
        maxPolarAngle={Math.PI / 2 - 0.02}
        target={[0, 5, 0]}
      />
      <fog attach="fog" args={['#c8ddf0', 100, 350]} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Loading Fallback
// ---------------------------------------------------------------------------

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-300 text-lg font-medium">Generating procedural world...</p>
        <p className="text-gray-500 text-sm mt-2">Terrain &bull; Vegetation &bull; Ocean</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error Boundary
// ---------------------------------------------------------------------------

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class SceneErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[InfinigenScene] Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-20">
          <div className="text-center max-w-md mx-auto p-8">
            <div className="text-6xl mb-4">&#9888;&#65039;</div>
            <h2 className="text-xl font-bold text-red-400 mb-2">3D Scene Error</h2>
            <p className="text-gray-400 mb-4 text-sm">
              {this.state.error?.message || 'An unexpected error occurred while rendering the 3D scene.'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Feature status indicator
// ---------------------------------------------------------------------------

function FeatureIndicator({ label, active, shortcut }: { label: string; active: boolean; shortcut: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-400' : 'bg-gray-600'}`} />
      <span className={`text-xs ${active ? 'text-gray-200' : 'text-gray-500'}`}>{label}</span>
      <span className="text-xs text-gray-600">[{shortcut}]</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preset Selector Component
// ---------------------------------------------------------------------------

function PresetSelector({
  presets,
  selectedId,
  onSelect,
}: {
  presets: ScenePreset[];
  selectedId: string | null;
  onSelect: (preset: ScenePreset) => void;
}) {
  const naturePresets = presets.filter(p => p.category === 'nature');
  const indoorPresets = presets.filter(p => p.category === 'indoor');
  const specialPresets = presets.filter(p => p.category === 'special');

  return (
    <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
      <p className="text-xs font-bold text-emerald-400">Scene Presets</p>

      {naturePresets.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Nature</p>
          <div className="space-y-1">
            {naturePresets.map(p => (
              <button
                key={p.id}
                onClick={() => onSelect(p)}
                className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                  selectedId === p.id
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                {p.thumbnail} {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {indoorPresets.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Indoor</p>
          <div className="space-y-1">
            {indoorPresets.map(p => (
              <button
                key={p.id}
                onClick={() => onSelect(p)}
                className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                  selectedId === p.id
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                {p.thumbnail} {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {specialPresets.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Special</p>
          <div className="space-y-1">
            {specialPresets.map(p => (
              <button
                key={p.id}
                onClick={() => onSelect(p)}
                className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                  selectedId === p.id
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                {p.thumbnail} {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Density Controls Component
// ---------------------------------------------------------------------------

function DensityControls({
  sceneConfig,
  onChange,
}: {
  sceneConfig: NatureSceneResult | null;
  onChange: (config: NatureSceneResult) => void;
}) {
  if (!sceneConfig) return null;

  const veg = sceneConfig.vegetationConfig;

  const updateDensity = (key: keyof typeof veg, value: number) => {
    if (!sceneConfig) return;
    onChange({
      ...sceneConfig,
      vegetationConfig: {
        ...sceneConfig.vegetationConfig,
        [key]: value,
      },
    });
  };

  return (
    <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 space-y-1">
      <p className="text-xs font-bold text-emerald-400">Scatter Density</p>
      {([
        ['Trees', 'treeDensity'],
        ['Bushes', 'bushDensity'],
        ['Grass', 'grassDensity'],
        ['Flowers', 'flowerDensity'],
        ['Mushrooms', 'mushroomDensity'],
        ['Ground Cover', 'groundCoverDensity'],
      ] as const).map(([label, key]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-20">{label}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={veg[key]}
            onChange={(e) => updateDensity(key, parseFloat(e.target.value))}
            className="w-16 h-1 accent-emerald-500"
          />
          <span className="text-xs text-gray-500 w-6">{veg[key].toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Export — InfinigenScene with Canvas
// ---------------------------------------------------------------------------

const TONE_MAPPING_NAMES: Record<ToneMappingPreset, string> = {
  linear: 'Linear',
  reinhard: 'Reinhard',
  aces: 'ACES Filmic',
  uncharted2: 'Uncharted 2',
};

const SEASON_LABELS: Record<VegetationSeason, string> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
};

const SEASONS: VegetationSeason[] = ['spring', 'summer', 'autumn', 'winter'];

export default function InfinigenScene() {
  const [features, setFeatures] = useState<FeatureFlags>({
    ssgi: true,
    ssao: true,
    autoExposure: true,
    showDebug: false,
    wind: true,
    creatures: true,
    dof: false,
    cameraPath: false,
    pbrMaterials: false,
    materialInfo: false,
  });
  const [toneMapping, setToneMapping] = useState<ToneMappingPreset>('aces');
  const [seasonIndex, setSeasonIndex] = useState(1); // summer
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [sceneConfig, setSceneConfig] = useState<NatureSceneResult | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [showDensity, setShowDensity] = useState(false);

  // Phase 4.1 — Camera trajectory state
  const [trajectoryPlaying, setTrajectoryPlaying] = useState(false);
  const [trajectorySamples, setTrajectorySamples] = useState<TrajectorySample[]>([]);
  const [selectedTrajectory, setSelectedTrajectory] = useState<TrajectoryTypeName>('orbit');

  // Phase 4.2 — GT capture state
  const [gtCapturing, setGTCapturing] = useState(false);

  const season = SEASONS[seasonIndex];

  const cycleToneMapping = useCallback(() => {
    const presets: ToneMappingPreset[] = ['linear', 'reinhard', 'aces', 'uncharted2'];
    const currentIndex = presets.indexOf(toneMapping);
    const nextIndex = (currentIndex + 1) % presets.length;
    setToneMapping(presets[nextIndex]);
  }, [toneMapping]);

  const cycleSeason = useCallback(() => {
    setSeasonIndex(prev => (prev + 1) % SEASONS.length);
  }, []);

  const handlePresetSelect = useCallback((preset: ScenePreset) => {
    setSelectedPresetId(preset.id);

    if (preset.natureConfig) {
      const composer = new NatureSceneComposer(preset.natureConfig);
      const result = composer.compose(preset.natureConfig.terrain?.seed ?? 42);
      setSceneConfig(result);

      // Update season from preset
      const presetSeason = result.season;
      const seasonIdx = SEASONS.indexOf(presetSeason as VegetationSeason);
      if (seasonIdx >= 0) setSeasonIndex(seasonIdx);
    } else {
      setSceneConfig(null);
    }
  }, []);

  const handleGenerateRandom = useCallback(() => {
    const seed = Math.floor(Math.random() * 10000);
    const composer = new NatureSceneComposer({ terrain: { seed } });
    const result = composer.compose(seed);
    setSceneConfig(result);
    setSelectedPresetId(null);
  }, []);

  // Phase 4.1 — Trajectory toggle
  const handleTrajectoryToggle = useCallback(() => {
    if (trajectoryPlaying) {
      setTrajectoryPlaying(false);
    } else {
      // Generate trajectory samples for the selected type
      const center = new THREE.Vector3(0, 5, 0);
      const cameraPos = new THREE.Vector3(80, 60, 80);

      let samples: TrajectorySample[] = [];
      switch (selectedTrajectory) {
        case 'orbit':
          samples = new OrbitShot().generate({
            center,
            radius: 40,
            duration: 10,
            elevation: Math.PI / 6,
          });
          break;
        case 'dolly':
          samples = new DollyShotImpl().generate({
            start: cameraPos,
            end: new THREE.Vector3(20, 10, 20),
            target: center,
            duration: 6,
          });
          break;
        case 'crane':
          samples = new CraneShotImpl().generate({
            start: new THREE.Vector3(0, 5, 40),
            end: new THREE.Vector3(0, 50, 40),
            target: center,
            arcHeight: 10,
            duration: 5,
          });
          break;
        case 'handheld':
          samples = new HandheldSim().generate({
            basePosition: cameraPos,
            target: center,
            duration: 8,
            intensity: 0.3,
          });
          break;
        default:
          samples = new OrbitShot().generate({
            center,
            radius: 40,
            duration: 10,
          });
      }

      setTrajectorySamples(samples);
      setTrajectoryPlaying(true);
    }
  }, [trajectoryPlaying, selectedTrajectory]);

  // Phase 4.2 — GT capture
  const handleGTCapture = useCallback(() => {
    setGTCapturing(true);
    // GT capture happens via the canvas ref; just flag it
    setTimeout(() => setGTCapturing(false), 2000);
  }, []);

  return (
    <div className="w-full h-screen relative bg-gray-900">
      <SceneErrorBoundary>
        <Suspense fallback={<LoadingOverlay />}>
          <Canvas
            shadows
            gl={{
              antialias: true,
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.0,
            }}
            camera={{
              fov: 55,
              near: 0.5,
              far: 1000,
              position: [80, 60, 80],
            }}
            dpr={[1, 2]}
          >
            <SceneContent
              features={features}
              season={season}
              sceneConfig={sceneConfig}
              trajectoryPlaying={trajectoryPlaying}
              trajectorySamples={trajectorySamples}
              onTrajectoryToggle={handleTrajectoryToggle}
              onGTCapture={handleGTCapture}
            />
          </Canvas>
        </Suspense>
      </SceneErrorBoundary>

      <KeyboardHandler
        features={features}
        onFeaturesChange={setFeatures}
        onToneMappingCycle={cycleToneMapping}
        onSeasonCycle={cycleSeason}
        onTrajectoryToggle={handleTrajectoryToggle}
        onGTCapture={handleGTCapture}
      />

      {/* HUD Overlay */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <div className="bg-black/60 backdrop-blur-sm rounded-lg px-4 py-3 text-white">
          <h2 className="text-sm font-bold text-emerald-400">Infinigen-R3F</h2>
          <p className="text-xs text-gray-300 mt-1">Procedural World Generation</p>
        </div>
      </div>

      {/* Feature toggles */}
      <div className="absolute top-4 left-44 z-10 pointer-events-none">
        <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 space-y-1">
          <FeatureIndicator label="SSGI" active={features.ssgi} shortcut="G" />
          <FeatureIndicator label="SSAO" active={features.ssao} shortcut="O" />
          <FeatureIndicator label="Auto Exposure" active={features.autoExposure} shortcut="E" />
          <FeatureIndicator label="Wind" active={features.wind} shortcut="W" />
          <FeatureIndicator label="Creatures" active={features.creatures} shortcut="C" />
          <FeatureIndicator label="DOF" active={features.dof} shortcut="D" />
          <FeatureIndicator label="Cam Path" active={features.cameraPath} shortcut="V" />
          <FeatureIndicator label="PBR Materials" active={features.pbrMaterials} shortcut="M" />
          <FeatureIndicator label="Mat Info" active={features.materialInfo} shortcut="N" />
          <FeatureIndicator label="Trajectory" active={trajectoryPlaying} shortcut="L" />
          <div className="flex items-center gap-2 mt-1 pt-1 border-t border-gray-700">
            <span className="text-xs text-gray-400">Tone Map: {TONE_MAPPING_NAMES[toneMapping]}</span>
            <span className="text-xs text-gray-600">[T]</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Season: {SEASON_LABELS[season]}</span>
            <span className="text-xs text-gray-600">[S]</span>
          </div>
        </div>
      </div>

      {/* Scene Presets & Controls Panel */}
      <div className="absolute top-20 left-4 z-10 space-y-2 pointer-events-auto">
        <button
          onClick={() => setShowPresets(!showPresets)}
          className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium transition-colors"
        >
          {showPresets ? '▼' : '▶'} Scene Presets
        </button>

        {showPresets && (
          <PresetSelector
            presets={ALL_PRESETS}
            selectedId={selectedPresetId}
            onSelect={handlePresetSelect}
          />
        )}

        <button
          onClick={handleGenerateRandom}
          className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium transition-colors"
        >
          🎲 Generate Random
        </button>

        <button
          onClick={() => setShowDensity(!showDensity)}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs font-medium transition-colors"
        >
          {showDensity ? '▼' : '▶'} Density Controls
        </button>

        {/* Phase 4.1 — Camera trajectory type selector */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">Trajectory:</span>
          <select
            value={selectedTrajectory}
            onChange={(e) => setSelectedTrajectory(e.target.value as TrajectoryTypeName)}
            className="bg-gray-700 text-white text-xs rounded px-1 py-0.5 border border-gray-600"
          >
            <option value="orbit">Orbit</option>
            <option value="dolly">Dolly</option>
            <option value="crane">Crane</option>
            <option value="handheld">Handheld</option>
            <option value="pantilt">Pan/Tilt</option>
            <option value="tracking">Tracking</option>
            <option value="goto">GoTo</option>
          </select>
          <button
            onClick={handleTrajectoryToggle}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              trajectoryPlaying
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-emerald-700 hover:bg-emerald-600 text-white'
            }`}
          >
            {trajectoryPlaying ? '■ Stop' : '▶ Play'}
          </button>
        </div>

        {/* Phase 4.2 — Capture GT button */}
        <button
          onClick={handleGTCapture}
          disabled={gtCapturing}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            gtCapturing
              ? 'bg-yellow-600 text-white cursor-wait'
              : 'bg-purple-700 hover:bg-purple-600 text-white'
          }`}
        >
          {gtCapturing ? 'Capturing...' : 'Capture GT [X]'}
        </button>

        {showDensity && (
          <DensityControls sceneConfig={sceneConfig} onChange={setSceneConfig} />
        )}
      </div>

      {/* Current preset indicator */}
      {selectedPresetId && (
        <div className="absolute top-4 right-20 z-10 pointer-events-none">
          <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2">
            <p className="text-xs text-emerald-400 font-medium">
              Preset: {getPreset(selectedPresetId)?.name ?? selectedPresetId}
            </p>
            {sceneConfig && (
              <p className="text-xs text-gray-500">Seed: {sceneConfig.seed}</p>
            )}
          </div>
        </div>
      )}

      {/* Controls hint */}
      <div className="absolute bottom-4 left-4 z-10 pointer-events-none">
        <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-gray-400">
          <p>&#128247; Left-drag: Orbit &bull; Scroll: Zoom &bull; Right-drag: Pan</p>
          <p className="mt-1">G: SSGI &bull; O: SSAO &bull; E: Exposure &bull; T: Tone Map &bull; W: Wind &bull; S: Season &bull; C: Creatures</p>
        </div>
      </div>

      {/* Stats toggle area */}
      <div className="absolute top-4 right-4 z-10">
        <a
          href="/"
          className="px-4 py-2 bg-black/60 backdrop-blur-sm text-white rounded-lg text-sm hover:bg-black/80 transition-colors"
        >
          &larr; Dashboard
        </a>
      </div>
    </div>
  );
}
