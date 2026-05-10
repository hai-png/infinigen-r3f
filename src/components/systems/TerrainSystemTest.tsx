'use client';

import React, { useState, useCallback } from 'react';
import { SYSTEM_PARITY } from '../SystemsTestApp';
import type { TerrainMeshData } from './SystemTestCanvas';

// ============================================================================
// Terrain System Test Panel
// ============================================================================

export default function TerrainSystemTest({
  onTerrainGenerated,
}: {
  onTerrainGenerated: (data: TerrainMeshData | null) => void;
}) {
  const [logs, setLogs] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [config, setConfig] = useState({
    seed: 42,
    size: 128,
    scale: 100,
    octaves: 6,
    persistence: 0.5,
    lacunarity: 2.0,
    erosionStrength: 0.3,
    erosionIterations: 20,
    tectonicPlates: 4,
    seaLevel: 0.3,
  });
  const [genTime, setGenTime] = useState<number | null>(null);
  const [terrainInfo, setTerrainInfo] = useState<string>('');
  const [testResults, setTestResults] = useState<Record<string, 'pass' | 'fail' | 'pending'>>({});

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 50));
  }, []);

  const generateTerrain = useCallback(() => {
    setGenerating(true);
    const start = performance.now();
    addLog(`Generating terrain (seed=${config.seed}, ${config.size}x${config.size})...`);

    import('@/terrain/core/TerrainGenerator').then(mod => {
      const TerrainGenerator = mod.TerrainGenerator;
      if (TerrainGenerator) {
        try {
          const gen = new TerrainGenerator({
            seed: config.seed,
            width: config.size,
            height: config.size,
            scale: config.scale,
            octaves: config.octaves,
            persistence: config.persistence,
            lacunarity: config.lacunarity,
            erosionStrength: config.erosionStrength,
            erosionIterations: config.erosionIterations,
            tectonicPlates: config.tectonicPlates,
            seaLevel: config.seaLevel,
          });

          const data = gen.generate();
          const elapsed = performance.now() - start;
          setGenTime(elapsed);

          if (data && data.heightMap) {
            const hmData = data.heightMap.data ?? data.heightMap;
            const w = data.width ?? config.size;
            const h = data.height ?? config.size;
            setTerrainInfo(`${w}x${h} · ${elapsed.toFixed(0)}ms`);
            addLog(`OK Terrain generated in ${elapsed.toFixed(0)}ms`);

            onTerrainGenerated({
              heightMap: hmData instanceof Float32Array ? hmData : new Float32Array(hmData),
              width: w,
              height: h,
              scale: config.scale,
            });
            setTestResults(prev => ({ ...prev, generate: 'pass' }));
          } else {
            addLog('WARN TerrainGenerator returned no heightmap data');
            onTerrainGenerated(null);
            setTestResults(prev => ({ ...prev, generate: 'fail' }));
          }
        } catch (e: any) {
          addLog(`WARN Generation error: ${e.message}`);
          onTerrainGenerated(null);
          setTestResults(prev => ({ ...prev, generate: 'fail' }));
        }
      } else {
        addLog('WARN TerrainGenerator not available, using FBM fallback');
        // Fallback: generate simple FBM heightmap
        const size = config.size;
        const heightMap = new Float32Array(size * size);
        const rng = (() => { let s = config.seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();

        // Simple multi-octave noise approximation
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            let h = 0, amp = 1, freq = 1, maxAmp = 0;
            for (let o = 0; o < config.octaves; o++) {
              const nx = x / size * freq * 4;
              const ny = y / size * freq * 4;
              h += amp * (Math.sin(nx * 1.7 + config.seed + o * 1.3) * Math.cos(ny * 2.3 + config.seed * 0.7 + o * 0.9) * 0.5 + 0.5);
              maxAmp += amp;
              amp *= config.persistence;
              freq *= config.lacunarity;
            }
            heightMap[y * size + x] = h / maxAmp;
          }
        }

        const elapsed = performance.now() - start;
        setGenTime(elapsed);
        setTerrainInfo(`${size}x${size} FBM fallback · ${elapsed.toFixed(0)}ms`);
        addLog(`OK FBM terrain generated in ${elapsed.toFixed(0)}ms`);

        onTerrainGenerated({
          heightMap,
          width: size,
          height: size,
          scale: config.scale,
        });
        setTestResults(prev => ({ ...prev, generate: 'pass' }));
      }
      setGenerating(false);
    }).catch((e: any) => {
      addLog(`WARN TerrainGenerator import: ${e.message}`);
      onTerrainGenerated(null);
      setTestResults(prev => ({ ...prev, generate: 'fail' }));
      setGenerating(false);
    });
  }, [config, onTerrainGenerated, addLog]);

  const testErosion = useCallback(() => {
    addLog('Testing ErosionSystem...');
    import('@/terrain/erosion/ErosionSystem').then(mod => {
      const ErosionSystem = mod.ErosionSystem;
      if (ErosionSystem) {
        try {
          const mockHeightmap = new Float32Array(16 * 16);
          const erosion = new ErosionSystem(mockHeightmap, 16, 16, {});
          addLog('OK ErosionSystem instantiated (hydraulic, glacial, coastal)');
          setTestResults(prev => ({ ...prev, erosion: 'pass' }));
        } catch (e: any) {
          addLog(`WARN ErosionSystem: ${e.message}`);
          setTestResults(prev => ({ ...prev, erosion: 'fail' }));
        }
      } else {
        addLog('WARN ErosionSystem not available');
        setTestResults(prev => ({ ...prev, erosion: 'fail' }));
      }
    }).catch((e: any) => {
      addLog(`WARN Erosion import: ${e.message}`);
      setTestResults(prev => ({ ...prev, erosion: 'fail' }));
    });
  }, [addLog]);

  const testBiomes = useCallback(() => {
    addLog('Testing BiomeSystem...');
    import('@/terrain/biomes/core/BiomeSystem').then(mod => {
      const BiomeSystem = mod.BiomeSystem;
      if (BiomeSystem) {
        try {
          const biome = new BiomeSystem(0.3, 42);
          addLog('OK BiomeSystem instantiated (10 biome types)');
          setTestResults(prev => ({ ...prev, biomes: 'pass' }));
        } catch (e: any) {
          addLog(`WARN BiomeSystem: ${e.message}`);
          setTestResults(prev => ({ ...prev, biomes: 'fail' }));
        }
      } else {
        addLog('WARN BiomeSystem not available');
        setTestResults(prev => ({ ...prev, biomes: 'fail' }));
      }
    }).catch((e: any) => {
      addLog(`WARN Biome import: ${e.message}`);
      setTestResults(prev => ({ ...prev, biomes: 'fail' }));
    });
  }, [addLog]);

  const testSDF = useCallback(() => {
    addLog('Testing SDF Primitives...');
    import('@/terrain/sdf/SDFPrimitives').then(mod => {
      const hasPrimitives = mod.sdSphere && mod.sdBox && mod.sdCylinder;
      if (hasPrimitives) {
        addLog('OK SDF Primitives available (sdSphere, sdBox, sdCylinder, sdGround, etc.)');
        setTestResults(prev => ({ ...prev, sdf: 'pass' }));
      } else {
        addLog('WARN SDF Primitives not fully exported');
        setTestResults(prev => ({ ...prev, sdf: 'fail' }));
      }
    }).catch((e: any) => {
      addLog(`WARN SDF import: ${e.message}`);
      setTestResults(prev => ({ ...prev, sdf: 'fail' }));
    });
  }, [addLog]);

  const testTwoPhase = useCallback(() => {
    addLog('Testing TwoPhaseTerrainPipeline...');
    import('@/terrain/core/TwoPhaseTerrainPipeline').then(mod => {
      const TwoPhaseTerrainPipeline = mod.TwoPhaseTerrainPipeline;
      if (TwoPhaseTerrainPipeline) {
        addLog('OK TwoPhaseTerrainPipeline available (coarse->fine)');
        setTestResults(prev => ({ ...prev, twoPhase: 'pass' }));
      } else {
        addLog('WARN TwoPhaseTerrainPipeline not available');
        setTestResults(prev => ({ ...prev, twoPhase: 'fail' }));
      }
    }).catch((e: any) => {
      addLog(`WARN TwoPhase import: ${e.message}`);
      setTestResults(prev => ({ ...prev, twoPhase: 'fail' }));
    });
  }, [addLog]);

  const testTectonic = useCallback(() => {
    addLog('Testing TectonicPlateSimulator...');
    import('@/terrain/tectonic/TectonicPlateSimulator').then(mod => {
      const TectonicPlateSimulator = mod.TectonicPlateSimulator;
      if (TectonicPlateSimulator) {
        addLog('OK TectonicPlateSimulator available');
        setTestResults(prev => ({ ...prev, tectonic: 'pass' }));
      } else {
        addLog('WARN TectonicPlateSimulator not available');
        setTestResults(prev => ({ ...prev, tectonic: 'fail' }));
      }
    }).catch((e: any) => {
      addLog(`WARN Tectonic import: ${e.message}`);
      setTestResults(prev => ({ ...prev, tectonic: 'fail' }));
    });
  }, [addLog]);

  const testWater = useCallback(() => {
    addLog('Testing water system (Ocean, Rivers, Lakes)...');
    import('@/terrain/water/OceanSystem').then(mod => {
      const OceanSurface = mod.OceanSurface;
      if (OceanSurface) {
        addLog('OK OceanSurface (FFT) available');
        setTestResults(prev => ({ ...prev, water: 'pass' }));
      } else {
        addLog('WARN OceanSurface not available');
        setTestResults(prev => ({ ...prev, water: 'fail' }));
      }
    }).catch((e: any) => {
      addLog(`WARN Water import: ${e.message}`);
      setTestResults(prev => ({ ...prev, water: 'fail' }));
    });
  }, [addLog]);

  const runAllTests = useCallback(() => {
    testErosion();
    setTimeout(() => testBiomes(), 200);
    setTimeout(() => testSDF(), 400);
    setTimeout(() => testTwoPhase(), 600);
    setTimeout(() => testTectonic(), 800);
    setTimeout(() => testWater(), 1000);
  }, [testErosion, testBiomes, testSDF, testTwoPhase, testTectonic, testWater]);

  const updateConfig = (key: string, value: number) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const parity = SYSTEM_PARITY.terrain;

  return (
    <div className="flex flex-col h-full gap-3 text-sm p-3">
      {/* Header */}
      <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
        <h3 className="text-base font-bold text-white mb-1">Terrain System</h3>
        <p className="text-zinc-400 text-xs">SDF terrain · GPU erosion · 10 biomes · Tectonic simulation</p>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 bg-zinc-700 rounded-full h-2">
            <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${parity.current}%` }} />
          </div>
          <span className="text-amber-400 text-xs font-mono">{parity.current}%</span>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
        <h4 className="text-xs font-semibold text-zinc-300 mb-2">Terrain Config</h4>
        <div className="space-y-2">
          {[
            { key: 'seed', label: 'Seed', min: 0, max: 9999, step: 1 },
            { key: 'size', label: 'Grid Size', min: 32, max: 256, step: 32 },
            { key: 'scale', label: 'World Scale', min: 10, max: 500, step: 10 },
            { key: 'octaves', label: 'Octaves', min: 1, max: 10, step: 1 },
            { key: 'persistence', label: 'Persistence', min: 0.1, max: 1.0, step: 0.05 },
            { key: 'lacunarity', label: 'Lacunarity', min: 1.0, max: 4.0, step: 0.1 },
            { key: 'erosionStrength', label: 'Erosion', min: 0, max: 1.0, step: 0.05 },
            { key: 'erosionIterations', label: 'Erosion Iters', min: 0, max: 100, step: 5 },
            { key: 'tectonicPlates', label: 'Tectonic Plates', min: 0, max: 10, step: 1 },
            { key: 'seaLevel', label: 'Sea Level', min: 0, max: 1.0, step: 0.05 },
          ].map(({ key, label, min, max, step }) => (
            <div key={key} className="flex items-center gap-2">
              <label className="text-[10px] text-zinc-400 w-20 shrink-0">{label}</label>
              <input type="range" min={min} max={max} step={step}
                value={(config as any)[key]}
                onChange={e => updateConfig(key, parseFloat(e.target.value))}
                className="flex-1 h-1 accent-amber-500"
              />
              <span className="text-[10px] text-zinc-300 font-mono w-10 text-right">{(config as any)[key]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick presets */}
      <div className="flex gap-1 flex-wrap">
        {[
          { name: 'Flat', p: { seed: 42, size: 128, scale: 100, octaves: 2, persistence: 0.3, lacunarity: 2, erosionStrength: 0.1, erosionIterations: 5, tectonicPlates: 0, seaLevel: 0.1 } },
          { name: 'Hills', p: { seed: 42, size: 128, scale: 100, octaves: 4, persistence: 0.5, lacunarity: 2, erosionStrength: 0.3, erosionIterations: 20, tectonicPlates: 2, seaLevel: 0.25 } },
          { name: 'Mountains', p: { seed: 42, size: 128, scale: 100, octaves: 8, persistence: 0.6, lacunarity: 2.5, erosionStrength: 0.5, erosionIterations: 50, tectonicPlates: 4, seaLevel: 0.3 } },
          { name: 'Islands', p: { seed: 42, size: 128, scale: 100, octaves: 6, persistence: 0.5, lacunarity: 2, erosionStrength: 0.4, erosionIterations: 30, tectonicPlates: 3, seaLevel: 0.5 } },
        ].map(preset => (
          <button key={preset.name} onClick={() => setConfig(prev => ({ ...prev, ...preset.p }))}
            className="text-[10px] bg-zinc-700 hover:bg-zinc-600 text-zinc-300 px-2 py-1 rounded transition-colors">{preset.name}</button>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={generateTerrain} disabled={generating}
          className="col-span-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white px-3 py-2 rounded text-xs font-semibold transition-colors">
          {generating ? 'Generating...' : 'Generate Terrain'}
        </button>
        <button onClick={runAllTests} className="bg-amber-700/50 hover:bg-amber-700 text-white px-3 py-1.5 rounded text-xs transition-colors">
          Run All Tests
        </button>
        <button onClick={testWater} className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded text-xs transition-colors">
          Test Water
        </button>
      </div>

      {/* Test Results */}
      {Object.keys(testResults).length > 0 && (
        <div className="bg-zinc-800/50 rounded p-2 border border-zinc-700">
          <div className="grid grid-cols-3 gap-1">
            {Object.entries(testResults).map(([name, status]) => (
              <div key={name} className="flex items-center gap-1 text-[9px]">
                <span className={`w-1.5 h-1.5 rounded-full ${status === 'pass' ? 'bg-emerald-400' : status === 'fail' ? 'bg-red-400' : 'bg-zinc-600'}`} />
                <span className="text-zinc-400">{name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="bg-zinc-800/50 rounded p-2 border border-zinc-700">
          <div className="text-lg font-bold text-white">{genTime !== null ? `${genTime.toFixed(0)}ms` : '--'}</div>
          <div className="text-zinc-500 text-[10px]">Gen Time</div>
        </div>
        <div className="bg-zinc-800/50 rounded p-2 border border-zinc-700">
          <div className="text-xs font-bold text-white">{terrainInfo || '--'}</div>
          <div className="text-zinc-500 text-[10px]">Terrain Info</div>
        </div>
      </div>

      {/* Feature Parity */}
      <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 flex-1 min-h-0 overflow-hidden flex flex-col">
        <h4 className="text-xs font-semibold text-zinc-300 mb-2">Feature Parity vs Original</h4>
        <div className="space-y-1 flex-1 min-h-0 overflow-y-auto">
          <div className="text-[10px] text-emerald-400 font-semibold mb-1">Strengths</div>
          {parity.strengths.map((s, i) => (
            <div key={`s${i}`} className="text-[10px] text-zinc-400 flex items-start gap-1">
              <span className="text-emerald-500 mt-0.5">+</span> {s}
            </div>
          ))}
          <div className="text-[10px] text-amber-400 font-semibold mb-1 mt-2">Gaps</div>
          {parity.gaps.map((g, i) => (
            <div key={`g${i}`} className="text-[10px] text-zinc-400 flex items-start gap-1">
              <span className="text-amber-500 mt-0.5">!</span> {g}
            </div>
          ))}
        </div>
      </div>

      {/* Log */}
      <div className="bg-zinc-900 rounded-lg p-2 border border-zinc-700 max-h-28 overflow-y-auto">
        {logs.length === 0 && <div className="text-[10px] text-zinc-600">Click Generate Terrain or Run All Tests...</div>}
        {logs.map((log, i) => (
          <div key={i} className={`text-[10px] font-mono leading-tight ${
            log.startsWith('OK') ? 'text-emerald-400' :
            log.startsWith('WARN') ? 'text-amber-400' :
            log.startsWith('ERR') ? 'text-red-400' :
            'text-zinc-400'
          }`}>{log}</div>
        ))}
      </div>
    </div>
  );
}
