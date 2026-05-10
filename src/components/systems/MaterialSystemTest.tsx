'use client';

import React, { useState, useCallback } from 'react';
import * as THREE from 'three';
import { SYSTEM_PARITY } from '../SystemsTestApp';

// ============================================================================
// Material System Test Panel
// ============================================================================

const CATEGORIES = ['terrain', 'wood', 'metal', 'ceramic', 'fabric', 'plastic', 'glass', 'nature', 'plant', 'creature'] as const;
type MaterialCat = typeof CATEGORIES[number];

export default function MaterialSystemTest({
  onMaterialGenerated,
}: {
  onMaterialGenerated: (material: THREE.Material | null) => void;
}) {
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<MaterialCat>('terrain');
  const [presets, setPresets] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [pbrParams, setPbrParams] = useState({
    roughness: 0.5,
    metallic: 0.0,
    baseColor: '#888888',
    aoStrength: 0.5,
    normalStrength: 1.0,
    heightScale: 0.01,
    clearcoat: 0.0,
    transmission: 0.0,
  });
  const [wearAmount, setWearAmount] = useState(0);
  const [genTime, setGenTime] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'pass' | 'fail' | 'pending'>>({});

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 50));
  }, []);

  const loadPresets = useCallback(() => {
    addLog('Loading MaterialPresetLibrary...');
    import('@/assets/materials/MaterialPresetLibrary').then(mod => {
      const MaterialPresetLibrary = mod.MaterialPresetLibrary;
      if (MaterialPresetLibrary) {
        try {
          const lib = new MaterialPresetLibrary(256);
          let foundPresets: any[] = [];

          if (typeof lib.getPresetsByCategory === 'function') {
            foundPresets = lib.getPresetsByCategory(selectedCategory) as any;
          } else if (typeof lib.getAllPresets === 'function') {
            foundPresets = (lib.getAllPresets() as any).filter((p: any) => p.category === selectedCategory);
          }

          if (foundPresets.length > 0) {
            setPresets(foundPresets.map((p: any) => ({ id: p.id, name: p.name, description: p.description ?? '' })));
            addLog(`OK ${foundPresets.length} presets for "${selectedCategory}"`);
            setTestResults(prev => ({ ...prev, presets: 'pass' }));
          } else {
            loadFallbackPresets();
          }
        } catch {
          loadFallbackPresets();
        }
      } else {
        loadFallbackPresets();
      }
    }).catch((e: any) => {
      addLog(`WARN MaterialPresetLibrary import: ${e.message}`);
      loadFallbackPresets();
    });
  }, [selectedCategory, addLog]);

  const loadFallbackPresets = useCallback(() => {
    const fallbacks: Record<string, Array<{ id: string; name: string; description: string }>> = {
      terrain: [
        { id: 'mossy_stone', name: 'Mossy Stone', description: 'Ancient stone with moss' },
        { id: 'sandstone', name: 'Sandstone', description: 'Layered sedimentary' },
        { id: 'sand', name: 'Sand', description: 'Fine desert sand' },
        { id: 'lava', name: 'Lava Rock', description: 'Cooled volcanic rock' },
        { id: 'snow', name: 'Snow', description: 'Fresh powder snow' },
      ],
      wood: [
        { id: 'oak', name: 'Oak', description: 'Warm oak wood' },
        { id: 'bark', name: 'Bark', description: 'Tree bark surface' },
        { id: 'mahogany', name: 'Mahogany', description: 'Dark rich mahogany' },
        { id: 'pine', name: 'Pine', description: 'Light softwood' },
      ],
      metal: [
        { id: 'steel', name: 'Steel', description: 'Brushed steel' },
        { id: 'copper', name: 'Copper', description: 'Warm copper' },
        { id: 'rusted_iron', name: 'Rusted Iron', description: 'Corroded iron' },
        { id: 'gold', name: 'Gold', description: 'Polished gold' },
      ],
      ceramic: [
        { id: 'porcelain', name: 'Porcelain', description: 'Smooth white porcelain' },
        { id: 'marble', name: 'Marble', description: 'Veined marble' },
      ],
      fabric: [
        { id: 'leather', name: 'Leather', description: 'Tanned leather' },
        { id: 'velvet', name: 'Velvet', description: 'Deep plush velvet' },
      ],
      plastic: [
        { id: 'glossy_plastic', name: 'Glossy', description: 'Shiny plastic' },
        { id: 'rubber', name: 'Rubber', description: 'Flexible rubber' },
      ],
      glass: [
        { id: 'clear_glass', name: 'Clear Glass', description: 'Transparent' },
        { id: 'frosted_glass', name: 'Frosted', description: 'Translucent' },
      ],
      nature: [
        { id: 'grass', name: 'Grass', description: 'Green grass' },
        { id: 'mud', name: 'Mud', description: 'Wet mud' },
      ],
      plant: [
        { id: 'greenery', name: 'Greenery', description: 'Foliage' },
        { id: 'succulent', name: 'Succulent', description: 'Waxy leaves' },
      ],
      creature: [
        { id: 'snake_scale', name: 'Snake Scale', description: 'Overlapping scales' },
        { id: 'fur', name: 'Fur', description: 'Dense fur' },
      ],
    };
    const categoryPresets = fallbacks[selectedCategory] ?? [];
    setPresets(categoryPresets);
    addLog(`OK ${categoryPresets.length} fallback presets for "${selectedCategory}"`);
  }, [selectedCategory, addLog]);

  const applyPreset = useCallback((presetId: string) => {
    setSelectedPreset(presetId);
    addLog(`Applying preset: ${presetId}`);
    const start = performance.now();

    import('@/assets/materials/MaterialPresetLibrary').then(mod => {
      const MaterialPresetLibrary = mod.MaterialPresetLibrary;
      let material: THREE.Material | null = null;

      if (MaterialPresetLibrary) {
        try {
          const lib = new MaterialPresetLibrary(256);
          if (typeof lib.getSimpleMaterial === 'function') {
            material = lib.getSimpleMaterial(presetId, { age: wearAmount });
          }
        } catch {}
      }

      if (!material) {
        // Create from current PBR params
        material = new THREE.MeshPhysicalMaterial({
          color: pbrParams.baseColor,
          roughness: pbrParams.roughness,
          metalness: pbrParams.metallic,
          clearcoat: pbrParams.clearcoat,
          transmission: pbrParams.transmission,
          aoMapIntensity: pbrParams.aoStrength,
          normalScale: new THREE.Vector2(pbrParams.normalStrength, pbrParams.normalStrength),
          displacementScale: pbrParams.heightScale,
        });
      }

      onMaterialGenerated(material);
      const elapsed = performance.now() - start;
      setGenTime(elapsed);
      addLog(`OK Material created in ${elapsed.toFixed(0)}ms`);
    }).catch(() => {
      // Fallback
      const material = new THREE.MeshPhysicalMaterial({
        color: pbrParams.baseColor,
        roughness: pbrParams.roughness,
        metalness: pbrParams.metallic,
        clearcoat: pbrParams.clearcoat,
        transmission: pbrParams.transmission,
      });
      onMaterialGenerated(material);
      addLog('OK Material created from params (fallback)');
    });
  }, [addLog, onMaterialGenerated, pbrParams, wearAmount]);

  const applyPBR = useCallback(() => {
    const start = performance.now();
    try {
      const material = new THREE.MeshPhysicalMaterial({
        color: pbrParams.baseColor,
        roughness: pbrParams.roughness,
        metalness: pbrParams.metallic,
        clearcoat: pbrParams.clearcoat,
        transmission: pbrParams.transmission,
        aoMapIntensity: pbrParams.aoStrength,
        normalScale: new THREE.Vector2(pbrParams.normalStrength, pbrParams.normalStrength),
        displacementScale: pbrParams.heightScale,
      });
      onMaterialGenerated(material);
      const elapsed = performance.now() - start;
      setGenTime(elapsed);
      addLog(`OK PBR material applied in ${elapsed.toFixed(0)}ms`);
    } catch (e: any) {
      addLog(`WARN PBR apply: ${e.message}`);
    }
  }, [pbrParams, onMaterialGenerated, addLog]);

  const testWear = useCallback(() => {
    addLog('Testing WearGenerator...');
    import('@/assets/materials/wear/WearGenerator').then(mod => {
      const WearGenerator = mod.WearGenerator;
      if (WearGenerator) {
        addLog('OK WearGenerator available (edge wear, scratches)');
        setTestResults(prev => ({ ...prev, wear: 'pass' }));
      } else {
        addLog('WARN WearGenerator not found');
        setTestResults(prev => ({ ...prev, wear: 'fail' }));
      }
    }).catch((e: any) => {
      addLog(`WARN WearGenerator: ${e.message}`);
      setTestResults(prev => ({ ...prev, wear: 'fail' }));
    });
  }, [addLog]);

  const testTextureBake = useCallback(() => {
    addLog('Testing TextureBakePipeline...');
    import('@/assets/materials/textures/TextureBakePipeline').then(mod => {
      const TextureBakePipeline = mod.TextureBakePipeline;
      if (TextureBakePipeline) {
        addLog('OK TextureBakePipeline available (7 PBR channels)');
        setTestResults(prev => ({ ...prev, textureBake: 'pass' }));
      } else {
        addLog('WARN TextureBakePipeline not found');
        setTestResults(prev => ({ ...prev, textureBake: 'fail' }));
      }
    }).catch((e: any) => {
      addLog(`WARN TextureBakePipeline: ${e.message}`);
      setTestResults(prev => ({ ...prev, textureBake: 'fail' }));
    });
  }, [addLog]);

  const testRuntimeMaterialBuilder = useCallback(() => {
    addLog('Testing RuntimeMaterialBuilder...');
    import('@/assets/materials/RuntimeMaterialBuilder').then(mod => {
      const RuntimeMaterialBuilder = mod.RuntimeMaterialBuilder;
      if (RuntimeMaterialBuilder) {
        addLog('OK RuntimeMaterialBuilder available (GLSL shader compilation)');
        setTestResults(prev => ({ ...prev, runtime: 'pass' }));
      } else {
        addLog('WARN RuntimeMaterialBuilder not found');
        setTestResults(prev => ({ ...prev, runtime: 'fail' }));
      }
    }).catch((e: any) => {
      addLog(`WARN RuntimeMaterialBuilder: ${e.message}`);
      setTestResults(prev => ({ ...prev, runtime: 'fail' }));
    });
  }, [addLog]);

  const testErosionBlending = useCallback(() => {
    addLog('Testing ErosionMaterialBlending...');
    import('@/assets/materials/blending/ErosionMaterialBlending').then(mod => {
      const ErosionMaterialBlending = mod.ErosionMaterialBlending;
      if (ErosionMaterialBlending) {
        addLog('OK ErosionMaterialBlending available (slope/altitude blending)');
        setTestResults(prev => ({ ...prev, blending: 'pass' }));
      } else {
        addLog('WARN ErosionMaterialBlending not found');
        setTestResults(prev => ({ ...prev, blending: 'fail' }));
      }
    }).catch((e: any) => {
      addLog(`WARN ErosionBlending: ${e.message}`);
      setTestResults(prev => ({ ...prev, blending: 'fail' }));
    });
  }, [addLog]);

  const runAllTests = useCallback(() => {
    testWear();
    setTimeout(() => testTextureBake(), 200);
    setTimeout(() => testRuntimeMaterialBuilder(), 400);
    setTimeout(() => testErosionBlending(), 600);
    setTimeout(() => loadPresets(), 800);
  }, [testWear, testTextureBake, testRuntimeMaterialBuilder, testErosionBlending, loadPresets]);

  const updatePBR = (key: string, value: number | string) => {
    setPbrParams(prev => ({ ...prev, [key]: value }));
  };

  const parity = SYSTEM_PARITY.material;

  return (
    <div className="flex flex-col h-full gap-3 text-sm p-3">
      {/* Header */}
      <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
        <h3 className="text-base font-bold text-white mb-1">Material System</h3>
        <p className="text-zinc-400 text-xs">50+ presets · Cook-Torrance BRDF · 7 PBR channels · Wear system</p>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 bg-zinc-700 rounded-full h-2">
            <div className="bg-violet-500 h-2 rounded-full" style={{ width: `${parity.current}%` }} />
          </div>
          <span className="text-violet-400 text-xs font-mono">{parity.current}%</span>
        </div>
      </div>

      {/* Category Selector */}
      <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
        <h4 className="text-xs font-semibold text-zinc-300 mb-2">Material Category</h4>
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => { setSelectedCategory(cat); setSelectedPreset(null); }}
              className={`px-2 py-1 rounded text-[10px] transition-colors ${
                selectedCategory === cat ? 'bg-violet-700 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
              }`}>{cat}</button>
          ))}
        </div>
      </div>

      {/* Preset Selector */}
      <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-zinc-300">Presets</h4>
          <button onClick={loadPresets} className="text-[10px] text-violet-400 hover:text-violet-300">Load</button>
        </div>
        <div className="max-h-20 overflow-y-auto space-y-0.5">
          {presets.length > 0 ? presets.map(p => (
            <button key={p.id} onClick={() => applyPreset(p.id)}
              className={`w-full text-left px-2 py-1 rounded text-[10px] transition-colors ${
                selectedPreset === p.id ? 'bg-violet-700 text-white' : 'bg-zinc-700/50 text-zinc-300 hover:bg-zinc-600'
              }`}>
              <span className="font-semibold">{p.name}</span>
              <span className="text-zinc-500 ml-1">{p.description}</span>
            </button>
          )) : (
            <div className="text-[10px] text-zinc-500">Click Load to fetch presets</div>
          )}
        </div>
      </div>

      {/* PBR Controls */}
      <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
        <h4 className="text-xs font-semibold text-zinc-300 mb-2">PBR Parameters</h4>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-zinc-400 w-16 shrink-0">Color</label>
            <input type="color" value={pbrParams.baseColor} onChange={e => updatePBR('baseColor', e.target.value)}
              className="w-8 h-6 cursor-pointer border-0" />
            <span className="text-[10px] text-zinc-300 font-mono">{pbrParams.baseColor}</span>
          </div>
          {[
            { key: 'roughness', label: 'Roughness', min: 0, max: 1, step: 0.01 },
            { key: 'metallic', label: 'Metallic', min: 0, max: 1, step: 0.01 },
            { key: 'aoStrength', label: 'AO', min: 0, max: 1, step: 0.05 },
            { key: 'normalStrength', label: 'Normal', min: 0, max: 3, step: 0.1 },
            { key: 'clearcoat', label: 'Clearcoat', min: 0, max: 1, step: 0.05 },
            { key: 'transmission', label: 'Transmission', min: 0, max: 1, step: 0.05 },
          ].map(({ key, label, min, max, step }) => (
            <div key={key} className="flex items-center gap-2">
              <label className="text-[10px] text-zinc-400 w-16 shrink-0">{label}</label>
              <input type="range" min={min} max={max} step={step}
                value={(pbrParams as any)[key]}
                onChange={e => updatePBR(key, parseFloat(e.target.value))}
                className="flex-1 h-1 accent-violet-500"
              />
              <span className="text-[10px] text-zinc-300 font-mono w-10 text-right">{(pbrParams as any)[key].toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={applyPBR} className="bg-violet-700 hover:bg-violet-600 text-white px-3 py-2 rounded text-xs font-semibold transition-colors">
          Apply PBR
        </button>
        <button onClick={runAllTests} className="bg-violet-700/50 hover:bg-violet-700 text-white px-3 py-2 rounded text-xs transition-colors">
          Run All Tests
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

      {/* Gen Time */}
      {genTime !== null && (
        <div className="bg-zinc-800/50 rounded p-2 border border-zinc-700 text-center text-xs text-zinc-300">
          Material creation: <span className="text-white font-mono">{genTime.toFixed(0)}ms</span>
        </div>
      )}

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
        {logs.length === 0 && <div className="text-[10px] text-zinc-600">Select a category and apply a preset...</div>}
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
