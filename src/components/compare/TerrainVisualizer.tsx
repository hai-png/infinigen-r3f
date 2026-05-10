'use client';

import React, { useState, useMemo, useCallback, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stats, Grid, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import {
  Mountain, Waves, TreePine, Snowflake, Droplets, Layers,
  SlidersHorizontal, Eye, EyeOff, RotateCcw, Zap, Globe
} from 'lucide-react';
import HeightmapCanvas from './HeightmapCanvas';

// ============================================================================
// Types
// ============================================================================

export type TerrainType = 'Ground' | 'Mountains' | 'Caves' | 'VoronoiRocks' | 'Waterbody' | 'LandTiles';

export interface TerrainParams {
  seed: number;
  terrainType: TerrainType;
  frequency: number;
  amplitude: number;
  octaves: number;
  lacunarity: number;
  persistence: number;
}

export interface ErosionParams {
  hydraulic: number;
  thermal: number;
  sedimentTransport: number;
  enabled: boolean;
}

export interface TectonicParams {
  plateCount: number;
  convergenceRate: number;
  faultDensity: number;
  enabled: boolean;
}

export interface SnowParams {
  snowfallRate: number;
  compaction: number;
  windRedistribution: number;
  enabled: boolean;
}

export interface WaterParams {
  riverFlowAccumulation: number;
  waterBoundarySDF: number;
  enabled: boolean;
}

// ============================================================================
// Seeded random number generator
// ============================================================================

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// Terrain generation using FBM noise
// ============================================================================

function generateHeightmap(
  params: TerrainParams,
  erosion: ErosionParams,
  tectonic: TectonicParams,
  snow: SnowParams,
  water: WaterParams,
  resolution: number = 128,
): Float32Array {
  const rng = mulberry32(params.seed);
  const noise2D = createNoise2D(rng);
  const data = new Float32Array(resolution * resolution);
  const half = resolution / 2;

  const fbm = (x: number, z: number): number => {
    let value = 0;
    let amp = 1;
    let freq = 1;
    let maxAmp = 0;

    for (let i = 0; i < params.octaves; i++) {
      value += amp * noise2D(x * freq, z * freq);
      maxAmp += amp;
      amp *= params.persistence;
      freq *= params.lacunarity;
    }

    return value / maxAmp;
  };

  // Tectonic plate contribution
  const plateInfluence = (x: number, z: number): number => {
    if (!tectonic.enabled) return 0;
    const rng2 = mulberry32(params.seed + 1000);
    let influence = 0;
    for (let p = 0; p < tectonic.plateCount; p++) {
      const px = rng2() * 2 - 1;
      const pz = rng2() * 2 - 1;
      const dist = Math.sqrt((x - px) ** 2 + (z - pz) ** 2);
      influence += Math.exp(-dist * tectonic.faultDensity) * tectonic.convergenceRate;
    }
    return influence;
  };

  // Terrain type modifiers
  const terrainModifier = (x: number, z: number, baseHeight: number): number => {
    switch (params.terrainType) {
      case 'Mountains':
        return Math.pow(Math.abs(baseHeight), 0.7) * Math.sign(baseHeight) * 1.5;
      case 'Caves': {
        const caveNoise = noise2D(x * 2.5, z * 2.5);
        return caveNoise > 0.3 ? baseHeight * 0.3 : baseHeight;
      }
      case 'VoronoiRocks': {
        const v = Math.abs(noise2D(x * 3, z * 3));
        return baseHeight * 0.5 + v * 0.5;
      }
      case 'Waterbody':
        return baseHeight * 0.3;
      case 'LandTiles': {
        const tile = Math.floor(x * 4) + Math.floor(z * 4);
        return baseHeight + (tile % 2 === 0 ? 0.05 : -0.05);
      }
      default:
        return baseHeight;
    }
  };

  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const nx = (x - half) / half;
      const nz = (y - half) / half;

      let h = fbm(nx * params.frequency, nz * params.frequency);
      h = terrainModifier(nx, nz, h);
      h += plateInfluence(nx, nz);

      // Erosion simulation
      if (erosion.enabled) {
        const slopeX = fbm((nx + 0.01) * params.frequency, nz * params.frequency) - fbm((nx - 0.01) * params.frequency, nz * params.frequency);
        const slopeZ = fbm(nx * params.frequency, (nz + 0.01) * params.frequency) - fbm(nx * params.frequency, (nz - 0.01) * params.frequency);
        const slope = Math.sqrt(slopeX * slopeX + slopeZ * slopeZ);
        h -= slope * erosion.hydraulic * 0.5;
        h -= Math.max(0, slope - 0.3) * erosion.thermal * 0.3;
        h += erosion.sedimentTransport * 0.02 * noise2D(nx * 8, nz * 8);
      }

      // Snow accumulation
      if (snow.enabled && h > 0.4) {
        h += snow.snowfallRate * 0.05 * (1 + snow.compaction * 0.5);
        h += snow.windRedistribution * 0.02 * noise2D(nx * 12, nz * 12);
      }

      // Water carving
      if (water.enabled) {
        const waterSDF = 1 - Math.abs(noise2D(nx * 2, nz * 2));
        if (waterSDF < water.waterBoundarySDF * 0.3) {
          h -= water.riverFlowAccumulation * 0.15;
        }
      }

      data[y * resolution + x] = h * params.amplitude;
    }
  }

  return data;
}

// ============================================================================
// 3D Terrain Mesh Component
// ============================================================================

interface TerrainMeshProps {
  heightmap: Float32Array;
  resolution: number;
  wireframe: boolean;
  amplitude: number;
  terrainType: TerrainType;
}

function TerrainMesh({ heightmap, resolution, wireframe, amplitude, terrainType }: TerrainMeshProps) {
  const meshRef = React.useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = React.useState(false);

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(20, 20, resolution - 1, resolution - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;

    // Find min/max for normalization
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < heightmap.length; i++) {
      if (heightmap[i] < min) min = heightmap[i];
      if (heightmap[i] > max) max = heightmap[i];
    }
    const range = max - min || 1;

    for (let i = 0; i < pos.count; i++) {
      const xi = i % resolution;
      const zi = Math.floor(i / resolution);
      const hIdx = Math.min(zi * resolution + xi, heightmap.length - 1);
      const normalizedH = (heightmap[hIdx] - min) / range;
      pos.setY(i, normalizedH * amplitude * 0.5);
    }

    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, [heightmap, resolution, amplitude]);

  const material = useMemo(() => {
    const colorMap: Record<TerrainType, number> = {
      Ground: 0x3a7d3a,
      Mountains: 0x6b6b6b,
      Caves: 0x4a3728,
      VoronoiRocks: 0x8b7355,
      Waterbody: 0x1a5276,
      LandTiles: 0x4a8c3f,
    };
    return new THREE.MeshStandardMaterial({
      color: colorMap[terrainType] ?? 0x3a7d3a,
      wireframe,
      flatShading: wireframe,
      roughness: 0.8,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
  }, [wireframe, terrainType]);

  useFrame(() => {
    if (meshRef.current && hovered) {
      meshRef.current.rotation.y += 0.002;
    }
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      castShadow
      receiveShadow
    />
  );
}

// ============================================================================
// Slider Component
// ============================================================================

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  icon?: React.ReactNode;
}

function SliderControl({ label, value, min, max, step, onChange, icon }: SliderControlProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-400 flex items-center gap-1.5">
          {icon}
          {label}
        </label>
        <span className="text-xs text-emerald-400 font-mono">{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
      />
    </div>
  );
}

// ============================================================================
// Section Toggle Component
// ============================================================================

interface SectionToggleProps {
  label: string;
  enabled: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
}

function SectionToggle({ label, enabled, onToggle, icon }: SectionToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        enabled
          ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/50'
          : 'bg-gray-800 text-gray-500 border border-gray-700'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ============================================================================
// Main TerrainVisualizer Component
// ============================================================================

export default function TerrainVisualizer() {
  const [terrainParams, setTerrainParams] = useState<TerrainParams>({
    seed: 42,
    terrainType: 'Mountains',
    frequency: 2.0,
    amplitude: 3.0,
    octaves: 6,
    lacunarity: 2.0,
    persistence: 0.5,
  });

  const [erosion, setErosion] = useState<ErosionParams>({
    hydraulic: 0.5,
    thermal: 0.3,
    sedimentTransport: 0.2,
    enabled: false,
  });

  const [tectonic, setTectonic] = useState<TectonicParams>({
    plateCount: 4,
    convergenceRate: 0.5,
    faultDensity: 2.0,
    enabled: false,
  });

  const [snow, setSnow] = useState<SnowParams>({
    snowfallRate: 0.5,
    compaction: 0.3,
    windRedistribution: 0.2,
    enabled: false,
  });

  const [water, setWater] = useState<WaterParams>({
    riverFlowAccumulation: 0.5,
    waterBoundarySDF: 0.5,
    enabled: false,
  });

  const [wireframe, setWireframe] = useState(false);
  const [showHeightmap, setShowHeightmap] = useState(true);
  const [resolution] = useState(128);
  const [genTime, setGenTime] = useState(0);

  const heightmap = useMemo(() => {
    const start = performance.now();
    const data = generateHeightmap(terrainParams, erosion, tectonic, snow, water, resolution);
    setGenTime(Math.round(performance.now() - start));
    return data;
  }, [terrainParams, erosion, tectonic, snow, water, resolution]);

  const terrainTypes: TerrainType[] = ['Ground', 'Mountains', 'Caves', 'VoronoiRocks', 'Waterbody', 'LandTiles'];

  const terrainTypeIcons: Record<TerrainType, React.ReactNode> = {
    Ground: <Layers className="w-3.5 h-3.5" />,
    Mountains: <Mountain className="w-3.5 h-3.5" />,
    Caves: <Globe className="w-3.5 h-3.5" />,
    VoronoiRocks: <Zap className="w-3.5 h-3.5" />,
    Waterbody: <Waves className="w-3.5 h-3.5" />,
    LandTiles: <TreePine className="w-3.5 h-3.5" />,
  };

  const handleRandomizeSeed = useCallback(() => {
    setTerrainParams(prev => ({ ...prev, seed: Math.floor(Math.random() * 100000) }));
  }, []);

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      {/* 3D Viewport */}
      <div className="flex-1 min-h-[400px] rounded-xl overflow-hidden border border-gray-700 bg-gray-950 relative">
        <Canvas camera={{ position: [15, 12, 15], fov: 50 }} shadows>
          <ambientLight intensity={0.3} />
          <directionalLight position={[20, 30, 10]} intensity={1.2} castShadow />
          <directionalLight position={[-10, 15, -5]} intensity={0.4} />
          <Suspense fallback={null}>
            <TerrainMesh
              heightmap={heightmap}
              resolution={resolution}
              wireframe={wireframe}
              amplitude={terrainParams.amplitude}
              terrainType={terrainParams.terrainType}
            />
            <Grid
              args={[40, 40]}
              position={[0, -0.01, 0]}
              cellSize={2}
              cellColor="#1a3a2a"
              sectionSize={10}
              sectionColor="#2a5a3a"
              fadeDistance={50}
              fadeStrength={1}
              infiniteGrid
            />
            <Environment preset="sunset" />
          </Suspense>
          <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
        </Canvas>

        {/* Overlay Stats */}
        <div className="absolute top-3 left-3 bg-gray-900/80 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-gray-300 border border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium">Live Preview</span>
          </div>
          <div>Vertices: {resolution * resolution}</div>
          <div>Gen Time: {genTime}ms</div>
          <div>Type: {terrainParams.terrainType}</div>
        </div>

        {/* Wireframe toggle */}
        <button
          onClick={() => setWireframe(!wireframe)}
          className="absolute top-3 right-3 bg-gray-900/80 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-gray-300 border border-gray-700 hover:border-emerald-600 transition-colors flex items-center gap-1.5"
        >
          {wireframe ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {wireframe ? 'Wireframe' : 'Solid'}
        </button>
      </div>

      {/* Controls Panel */}
      <div className="lg:w-80 flex flex-col gap-3 overflow-y-auto max-h-[calc(100vh-120px)] pr-1 custom-scrollbar">
        {/* Terrain Type Selector */}
        <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
            <Mountain className="w-4 h-4 text-emerald-400" />
            Terrain Type
          </h3>
          <div className="grid grid-cols-3 gap-1.5">
            {terrainTypes.map(type => (
              <button
                key={type}
                onClick={() => setTerrainParams(prev => ({ ...prev, terrainType: type }))}
                className={`px-2 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                  terrainParams.terrainType === type
                    ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-600 shadow-lg shadow-emerald-900/20'
                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
                }`}
              >
                {terrainTypeIcons[type]}
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Core Parameters */}
        <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
            Parameters
          </h3>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-400">Seed</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-400 font-mono">{terrainParams.seed}</span>
                <button
                  onClick={handleRandomizeSeed}
                  className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-emerald-400 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>
            <SliderControl
              label="Frequency"
              value={terrainParams.frequency}
              min={0.5}
              max={8}
              step={0.1}
              onChange={v => setTerrainParams(prev => ({ ...prev, frequency: v }))}
            />
            <SliderControl
              label="Amplitude"
              value={terrainParams.amplitude}
              min={0.5}
              max={8}
              step={0.1}
              onChange={v => setTerrainParams(prev => ({ ...prev, amplitude: v }))}
            />
            <SliderControl
              label="Octaves"
              value={terrainParams.octaves}
              min={1}
              max={10}
              step={1}
              onChange={v => setTerrainParams(prev => ({ ...prev, octaves: v }))}
            />
            <SliderControl
              label="Lacunarity"
              value={terrainParams.lacunarity}
              min={1}
              max={4}
              step={0.1}
              onChange={v => setTerrainParams(prev => ({ ...prev, lacunarity: v }))}
            />
            <SliderControl
              label="Persistence"
              value={terrainParams.persistence}
              min={0.1}
              max={1}
              step={0.05}
              onChange={v => setTerrainParams(prev => ({ ...prev, persistence: v }))}
            />
          </div>
        </div>

        {/* Erosion System */}
        <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
              <Waves className="w-4 h-4 text-emerald-400" />
              Erosion
            </h3>
            <SectionToggle
              label={erosion.enabled ? 'On' : 'Off'}
              enabled={erosion.enabled}
              onToggle={() => setErosion(prev => ({ ...prev, enabled: !prev.enabled }))}
              icon={<Waves className="w-3 h-3" />}
            />
          </div>
          {erosion.enabled && (
            <div className="flex flex-col gap-3">
              <SliderControl label="Hydraulic" value={erosion.hydraulic} min={0} max={1} step={0.05} onChange={v => setErosion(prev => ({ ...prev, hydraulic: v }))} />
              <SliderControl label="Thermal" value={erosion.thermal} min={0} max={1} step={0.05} onChange={v => setErosion(prev => ({ ...prev, thermal: v }))} />
              <SliderControl label="Sediment" value={erosion.sedimentTransport} min={0} max={1} step={0.05} onChange={v => setErosion(prev => ({ ...prev, sedimentTransport: v }))} />
            </div>
          )}
        </div>

        {/* Tectonic System */}
        <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-400" />
              Tectonic
            </h3>
            <SectionToggle
              label={tectonic.enabled ? 'On' : 'Off'}
              enabled={tectonic.enabled}
              onToggle={() => setTectonic(prev => ({ ...prev, enabled: !prev.enabled }))}
              icon={<Globe className="w-3 h-3" />}
            />
          </div>
          {tectonic.enabled && (
            <div className="flex flex-col gap-3">
              <SliderControl label="Plate Count" value={tectonic.plateCount} min={2} max={10} step={1} onChange={v => setTectonic(prev => ({ ...prev, plateCount: v }))} />
              <SliderControl label="Convergence" value={tectonic.convergenceRate} min={0} max={2} step={0.1} onChange={v => setTectonic(prev => ({ ...prev, convergenceRate: v }))} />
              <SliderControl label="Fault Density" value={tectonic.faultDensity} min={0.5} max={5} step={0.1} onChange={v => setTectonic(prev => ({ ...prev, faultDensity: v }))} />
            </div>
          )}
        </div>

        {/* Snow System */}
        <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
              <Snowflake className="w-4 h-4 text-emerald-400" />
              Snow
            </h3>
            <SectionToggle
              label={snow.enabled ? 'On' : 'Off'}
              enabled={snow.enabled}
              onToggle={() => setSnow(prev => ({ ...prev, enabled: !prev.enabled }))}
              icon={<Snowflake className="w-3 h-3" />}
            />
          </div>
          {snow.enabled && (
            <div className="flex flex-col gap-3">
              <SliderControl label="Snowfall Rate" value={snow.snowfallRate} min={0} max={1} step={0.05} onChange={v => setSnow(prev => ({ ...prev, snowfallRate: v }))} />
              <SliderControl label="Compaction" value={snow.compaction} min={0} max={1} step={0.05} onChange={v => setSnow(prev => ({ ...prev, compaction: v }))} />
              <SliderControl label="Wind Redist." value={snow.windRedistribution} min={0} max={1} step={0.05} onChange={v => setSnow(prev => ({ ...prev, windRedistribution: v }))} />
            </div>
          )}
        </div>

        {/* Water System */}
        <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
              <Droplets className="w-4 h-4 text-emerald-400" />
              Water
            </h3>
            <SectionToggle
              label={water.enabled ? 'On' : 'Off'}
              enabled={water.enabled}
              onToggle={() => setWater(prev => ({ ...prev, enabled: !prev.enabled }))}
              icon={<Droplets className="w-3 h-3" />}
            />
          </div>
          {water.enabled && (
            <div className="flex flex-col gap-3">
              <SliderControl label="River Flow" value={water.riverFlowAccumulation} min={0} max={1} step={0.05} onChange={v => setWater(prev => ({ ...prev, riverFlowAccumulation: v }))} />
              <SliderControl label="Boundary SDF" value={water.waterBoundarySDF} min={0} max={1} step={0.05} onChange={v => setWater(prev => ({ ...prev, waterBoundarySDF: v }))} />
            </div>
          )}
        </div>

        {/* Heightmap 2D View */}
        {showHeightmap && (
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                Heightmap
              </h3>
              <button
                onClick={() => setShowHeightmap(false)}
                className="text-gray-500 hover:text-gray-300"
              >
                <EyeOff className="w-3.5 h-3.5" />
              </button>
            </div>
            <HeightmapCanvas
              width={resolution}
              height={resolution}
              data={heightmap}
              displayWidth={256}
              displayHeight={256}
              colorScheme="terrain"
              seaLevel={0.3}
              className="w-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}
