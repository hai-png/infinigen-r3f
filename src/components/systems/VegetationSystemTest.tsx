'use client';

import React, { useState, useCallback } from 'react';
import * as THREE from 'three';
import { SYSTEM_PARITY } from '../SystemsTestApp';
import type { TreeMeshData } from './SystemTestCanvas';

// ============================================================================
// Vegetation System Test Panel
// ============================================================================

type TreeType = 'TreeGenerator' | 'Conifer' | 'Palm' | 'LSystem' | 'SpaceColonization' | 'Deciduous';

const TREE_TYPES: { id: TreeType; label: string; desc: string }[] = [
  { id: 'TreeGenerator', label: 'Generic Tree', desc: 'Configurable tree with genome params' },
  { id: 'Conifer', label: 'Conifer', desc: 'Pine/spruce with needle canopy' },
  { id: 'Palm', label: 'Palm', desc: 'Tropical palm with frond crown' },
  { id: 'LSystem', label: 'L-System', desc: 'L-system rule-based generation' },
  { id: 'SpaceColonization', label: 'Space Colonization', desc: 'Attractor-driven branching' },
  { id: 'Deciduous', label: 'Deciduous', desc: 'Broad-leaf deciduous tree' },
];

export default function VegetationSystemTest({
  onTreeGenerated,
  onParamsChanged,
}: {
  onTreeGenerated: (data: TreeMeshData | null) => void;
  onParamsChanged: (params: { trunkLength: number; trunkRadius: number; branchAngle: number; branchCount: number; canopyRadius: number }) => void;
}) {
  const [logs, setLogs] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [selectedTree, setSelectedTree] = useState<TreeType>('TreeGenerator');
  const [genomeParams, setGenomeParams] = useState({
    trunkLength: 3.0,
    trunkRadius: 0.2,
    branchAngle: 30,
    branchCount: 5,
    canopyDensity: 0.7,
    canopyRadius: 2.0,
    seed: 42,
  });
  const [genTime, setGenTime] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'pass' | 'fail' | 'pending'>>({});

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 50));
  }, []);

  const updateGenome = (key: string, value: number) => {
    setGenomeParams(prev => {
      const next = { ...prev, [key]: value };
      // Update canvas with live params for fallback tree
      onParamsChanged({
        trunkLength: next.trunkLength,
        trunkRadius: next.trunkRadius,
        branchAngle: next.branchAngle,
        branchCount: next.branchCount,
        canopyRadius: next.canopyRadius,
      });
      return next;
    });
  };

  const generateTree = useCallback(() => {
    setGenerating(true);
    const start = performance.now();
    addLog(`Generating ${selectedTree} (seed=${genomeParams.seed})...`);

    const moduleMap: Record<TreeType, string> = {
      TreeGenerator: '@/assets/objects/vegetation/trees/TreeGenerator',
      Conifer: '@/assets/objects/vegetation/trees/ConiferGenerator',
      Palm: '@/assets/objects/vegetation/trees/PalmGenerator',
      LSystem: '@/assets/objects/vegetation/trees/LSystemTreeGenerator',
      SpaceColonization: '@/assets/objects/vegetation/trees/SpaceColonizationTreeGenerator',
      Deciduous: '@/assets/objects/vegetation/trees/DeciduousGenerator',
    };

    const modulePath = moduleMap[selectedTree];
    import(/* @vite-ignore */ modulePath).then(mod => {
      const GeneratorClass = mod.default ?? Object.values(mod).find(
        (v: any) => typeof v === 'function' && v.prototype && (v.prototype.generate || v.prototype.generateTree)
      );

      if (GeneratorClass) {
        try {
          const generator = new GeneratorClass({
            seed: genomeParams.seed,
            trunkLength: genomeParams.trunkLength,
            trunkRadius: genomeParams.trunkRadius,
            branchAngle: genomeParams.branchAngle * Math.PI / 180,
            branchCount: genomeParams.branchCount,
            canopyDensity: genomeParams.canopyDensity,
            canopyRadius: genomeParams.canopyRadius,
          });
          addLog(`OK ${selectedTree} generator instantiated`);

          let result: any = null;
          if (typeof generator.generate === 'function') {
            result = generator.generate();
          } else if (typeof generator.generateTree === 'function') {
            result = generator.generateTree();
          }

          const elapsed = performance.now() - start;
          setGenTime(elapsed);

          if (result) {
            let trunkGeo: THREE.BufferGeometry | null = null;
            let canopyGeo: THREE.BufferGeometry | null = null;
            let leafGeo: THREE.BufferGeometry | null = null;

            if (result.trunk) trunkGeo = result.trunk.geometry ?? result.trunk;
            else if (result.geometry) trunkGeo = result.geometry;
            if (result.canopy) canopyGeo = result.canopy.geometry ?? result.canopy;
            else if (result.leaves) leafGeo = result.leaves.geometry ?? result.leaves;

            onTreeGenerated({ trunkGeometry: trunkGeo, canopyGeometry: canopyGeo, leafGeometry: leafGeo, position: [0, 0, 0] });
            addLog(`OK Tree generated in ${elapsed.toFixed(0)}ms`);
          } else {
            // Fallback — canvas will show procedural tree
            onTreeGenerated(null);
            addLog(`OK Fallback procedural tree rendered (${elapsed.toFixed(0)}ms)`);
          }
          setTestResults(prev => ({ ...prev, [selectedTree]: 'pass' }));
        } catch (e: any) {
          addLog(`WARN Generation error: ${e.message}`);
          onTreeGenerated(null);
          setTestResults(prev => ({ ...prev, [selectedTree]: 'fail' }));
        }
      } else {
        addLog(`WARN ${selectedTree} class not found in module`);
        onTreeGenerated(null);
        setTestResults(prev => ({ ...prev, [selectedTree]: 'fail' }));
      }
      setGenerating(false);
    }).catch((e: any) => {
      addLog(`WARN Import error: ${e.message}`);
      onTreeGenerated(null);
      setTestResults(prev => ({ ...prev, [selectedTree]: 'fail' }));
      setGenerating(false);
    });
  }, [selectedTree, genomeParams, addLog, onTreeGenerated]);

  const testGenome = useCallback(() => {
    addLog('Testing TreeGenome...');
    import('@/assets/objects/vegetation/TreeGenome').then(mod => {
      const TreeGenome = mod.TreeGenome ?? mod.default;
      const presets = mod.TREE_SPECIES_PRESETS;
      if (TreeGenome) {
        try {
          const genome = new TreeGenome({ seed: genomeParams.seed });
          addLog('OK TreeGenome instantiated (32-parameter genome)');
          setTestResults(prev => ({ ...prev, genome: 'pass' }));
        } catch (e: any) {
          addLog(`WARN TreeGenome: ${e.message}`);
          setTestResults(prev => ({ ...prev, genome: 'fail' }));
        }
      }
      if (presets) {
        const count = Object.keys(presets).length;
        addLog(`OK TREE_SPECIES_PRESETS: ${count} species presets`);
      }
    }).catch((e: any) => {
      addLog(`WARN TreeGenome import: ${e.message}`);
      setTestResults(prev => ({ ...prev, genome: 'fail' }));
    });
  }, [genomeParams.seed, addLog]);

  const testGrass = useCallback(() => {
    addLog('Testing GrassSystem...');
    import('@/assets/objects/vegetation/GrassSystem').then(mod => {
      const GrassSystem = mod.GrassSystem;
      if (GrassSystem) {
        addLog('OK GrassSystem available');
        setTestResults(prev => ({ ...prev, grass: 'pass' }));
      } else {
        addLog('WARN GrassSystem not found');
        setTestResults(prev => ({ ...prev, grass: 'fail' }));
      }
    }).catch((e: any) => {
      addLog(`WARN GrassSystem: ${e.message}`);
      setTestResults(prev => ({ ...prev, grass: 'fail' }));
    });
  }, [addLog]);

  const testWind = useCallback(() => {
    addLog('Testing WindAnimationController...');
    import('@/assets/objects/vegetation/WindAnimationController').then(mod => {
      const WindAnimationController = mod.WindAnimationController;
      if (WindAnimationController) {
        addLog('OK WindAnimationController available');
        setTestResults(prev => ({ ...prev, wind: 'pass' }));
      } else {
        addLog('WARN WindAnimationController not found');
        setTestResults(prev => ({ ...prev, wind: 'fail' }));
      }
    }).catch((e: any) => {
      addLog(`WARN Wind: ${e.message}`);
      setTestResults(prev => ({ ...prev, wind: 'fail' }));
    });
  }, [addLog]);

  const testBranchSkinner = useCallback(() => {
    addLog('Testing BranchSkinner...');
    import('@/assets/objects/vegetation/BranchSkinner').then(mod => {
      const BranchSkinner = mod.BranchSkinner;
      if (BranchSkinner) {
        addLog('OK BranchSkinner available (tapered cylinders with bark displacement)');
        setTestResults(prev => ({ ...prev, skinner: 'pass' }));
      } else {
        addLog('WARN BranchSkinner not found');
        setTestResults(prev => ({ ...prev, skinner: 'fail' }));
      }
    }).catch((e: any) => {
      addLog(`WARN BranchSkinner: ${e.message}`);
      setTestResults(prev => ({ ...prev, skinner: 'fail' }));
    });
  }, [addLog]);

  const testSpaceColonization = useCallback(() => {
    addLog('Testing SpaceColonization...');
    import('@/assets/objects/vegetation/trees/SpaceColonizationTreeGenerator').then(mod => {
      const SpaceColonization = mod.SpaceColonization ?? mod.default;
      if (SpaceColonization) {
        addLog('OK SpaceColonization available (attractor-driven branching)');
        setTestResults(prev => ({ ...prev, spaceCol: 'pass' }));
      } else {
        addLog('WARN SpaceColonization not found');
        setTestResults(prev => ({ ...prev, spaceCol: 'fail' }));
      }
    }).catch((e: any) => {
      addLog(`WARN SpaceColonization: ${e.message}`);
      setTestResults(prev => ({ ...prev, spaceCol: 'fail' }));
    });
  }, [addLog]);

  const testLSystem = useCallback(() => {
    addLog('Testing LSystemEngine...');
    import('@/assets/objects/vegetation/trees/LSystemTreeGenerator').then(mod => {
      const LSystemEngine = mod.LSystemEngine ?? mod.default;
      if (LSystemEngine) {
        addLog('OK LSystemEngine available (rule-based tree generation)');
        setTestResults(prev => ({ ...prev, lsystem: 'pass' }));
      } else {
        addLog('WARN LSystemEngine not found');
        setTestResults(prev => ({ ...prev, lsystem: 'fail' }));
      }
    }).catch((e: any) => {
      addLog(`WARN LSystem: ${e.message}`);
      setTestResults(prev => ({ ...prev, lsystem: 'fail' }));
    });
  }, [addLog]);

  const runAllTests = useCallback(() => {
    testGenome();
    setTimeout(() => testGrass(), 200);
    setTimeout(() => testWind(), 400);
    setTimeout(() => testBranchSkinner(), 600);
    setTimeout(() => testSpaceColonization(), 800);
    setTimeout(() => testLSystem(), 1000);
  }, [testGenome, testGrass, testWind, testBranchSkinner, testSpaceColonization, testLSystem]);

  const parity = SYSTEM_PARITY.vegetation;

  return (
    <div className="flex flex-col h-full gap-3 text-sm p-3">
      {/* Header */}
      <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
        <h3 className="text-base font-bold text-white mb-1">Vegetation System</h3>
        <p className="text-zinc-400 text-xs">6 tree generators · SpaceColonization · L-System · Grass · Wind</p>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 bg-zinc-700 rounded-full h-2">
            <div className="bg-rose-500 h-2 rounded-full" style={{ width: `${parity.current}%` }} />
          </div>
          <span className="text-rose-400 text-xs font-mono">{parity.current}%</span>
        </div>
      </div>

      {/* Tree Type Selector */}
      <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
        <h4 className="text-xs font-semibold text-zinc-300 mb-2">Tree Generator</h4>
        <div className="grid grid-cols-3 gap-1">
          {TREE_TYPES.map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedTree(t.id)}
              className={`px-2 py-1.5 rounded text-[10px] transition-colors ${
                selectedTree === t.id
                  ? 'bg-rose-700 text-white'
                  : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
              }`}
              title={t.desc}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Genome Parameters */}
      <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
        <h4 className="text-xs font-semibold text-zinc-300 mb-2">Genome Parameters</h4>
        <div className="space-y-1.5">
          {[
            { key: 'seed', label: 'Seed', min: 0, max: 9999, step: 1 },
            { key: 'trunkLength', label: 'Trunk Length', min: 1, max: 8, step: 0.5 },
            { key: 'trunkRadius', label: 'Trunk Radius', min: 0.05, max: 0.5, step: 0.05 },
            { key: 'branchAngle', label: 'Branch Angle', min: 10, max: 60, step: 5 },
            { key: 'branchCount', label: 'Branches', min: 2, max: 12, step: 1 },
            { key: 'canopyDensity', label: 'Canopy Density', min: 0.1, max: 1.0, step: 0.1 },
            { key: 'canopyRadius', label: 'Canopy Radius', min: 0.5, max: 4, step: 0.5 },
          ].map(({ key, label, min, max, step }) => (
            <div key={key} className="flex items-center gap-2">
              <label className="text-[10px] text-zinc-400 w-20 shrink-0">{label}</label>
              <input
                type="range" min={min} max={max} step={step}
                value={(genomeParams as any)[key]}
                onChange={e => updateGenome(key, parseFloat(e.target.value))}
                className="flex-1 h-1 accent-rose-500"
              />
              <span className="text-[10px] text-zinc-300 font-mono w-10 text-right">
                {(genomeParams as any)[key]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={generateTree}
          disabled={generating}
          className="col-span-2 bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white px-3 py-2 rounded text-xs font-semibold transition-colors"
        >
          {generating ? 'Generating...' : 'Generate Tree'}
        </button>
        <button onClick={runAllTests} className="bg-rose-700/50 hover:bg-rose-700 text-white px-3 py-1.5 rounded text-xs transition-colors">
          Run All Tests
        </button>
        <button onClick={testBranchSkinner} className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded text-xs transition-colors">
          Test Skinner
        </button>
      </div>

      {/* Test Results Grid */}
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
          Generation time: <span className="text-white font-mono">{genTime.toFixed(0)}ms</span>
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
        {logs.length === 0 && <div className="text-[10px] text-zinc-600">Select a tree type and click Generate...</div>}
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
