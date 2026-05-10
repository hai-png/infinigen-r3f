'use client';

import React, { useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import type { CanvasMode, TerrainMeshData, TreeMeshData, ConstraintSceneData } from './systems/SystemTestCanvas';
import * as THREE from 'three';

// ============================================================================
// Feature Parity Data (from gap analysis)
// ============================================================================

export const SYSTEM_PARITY = {
  node: {
    current: 70,
    target: 90,
    gaps: [
      'CaptureAttribute field evaluation incomplete',
      'Kernelizer only supports shader-graph nodes (no geometry nodes)',
      'BSDF nodes NOT supported in kernelizer',
      'No force_input_consistency equivalent',
      '4D noise seeding missing in GLSL pipeline',
      'Pass-through executors for output nodes',
      'Missing AccumulateField executor',
    ],
    strengths: [
      '299 node definitions (more than original 140)',
      '242 executor registrations',
      'GLSL compilation pipeline',
      'WebGPU/WGSL evaluator',
      'PythonCompatibleNodeWrangler',
    ],
  },
  terrain: {
    current: 45,
    target: 85,
    gaps: [
      'No compiled C evaluation (SurfaceKernel)',
      'SurfaceKernel compilation path incomplete',
      'No true SoilMachine erosion',
      'No Landlab snowfall integration',
      'OcMesher is pure JS (not C++)',
      'Tag-to-material pipeline incomplete',
      'No BVH construction for placement',
      'Two-phase pipeline not implemented',
    ],
    strengths: [
      'SDF-based terrain with primitives',
      'GPU compute (WGSL marching cubes)',
      'Multiple meshers (LOD, Chunked, Adaptive)',
      'CPU+GPU hydraulic erosion',
      'Glacial and coastal erosion',
      'Biome system (10 biomes)',
      'FFT ocean, rivers, lakes',
      'Tectonic simulation',
    ],
  },
  constraint: {
    current: 55,
    target: 90,
    gaps: [
      'No trimesh/FCL collision (AABB-only)',
      'Dual competing constraint systems not unified',
      'Relation.algebra() methods incomplete',
      'CoPlanar evaluation is heuristic only',
      'Hidden/Visible evaluation simplified',
      'evaluateState() throws in Solver base class',
      'No shapely.Polygon 2D footprints',
      'ObjectState has two incompatible definitions',
    ],
    strengths: [
      'Full DSL (Lexer -> Parser -> Evaluator)',
      '20+ Relation types',
      'SA solver with violation-priority acceptance',
      'IndoorScenePipeline (10-step)',
      '38 furniture rules',
      '7+ move proposal types',
    ],
  },
  vegetation: {
    current: 35,
    target: 85,
    gaps: [
      'No Recursive Path algorithm',
      'Skinning does not use rev_depth',
      'No child collection hierarchy',
      'Leaf generation too simple',
      'No AccumulateField for monocots',
      'Missing scatter selection masks',
      'No scatter clustering',
      'Missing deformed tree generators',
    ],
    strengths: [
      'SpaceColonization with spatial grid',
      'LSystemEngine with presets',
      '32-parameter TreeGenome',
      'BranchSkinner with bark displacement',
      '5 LOD levels with hysteresis',
      'WindAnimationController',
      'Coral: fan, branching, brain',
      'GrassSystem, IvyClimbingSystem',
    ],
  },
  material: {
    current: 50,
    target: 85,
    gaps: [
      'No SDFPerturb C compilation',
      'No dual geometry+shader pipeline',
      'Mountain material dramatically simplified',
      '4D noise seeding missing',
      'Duplicate GLSL implementations',
      'No proper edge wear detection',
      'No add_geomod equivalent',
      'Missing bark shader fidelity',
    ],
    strengths: [
      'MaterialPresetLibrary (50+ presets)',
      'Three rendering backends',
      'RuntimeMaterialBuilder',
      'GLSLNoiseLibrary',
      'TriplanarProjection',
      'Cook-Torrance BRDF',
      '7 PBR texture channels',
    ],
  },
};

// ============================================================================
// Tab Configuration
// ============================================================================

type SystemTab = 'node' | 'terrain' | 'constraint' | 'vegetation' | 'material';

const TABS: { id: SystemTab; label: string; icon: string; color: string }[] = [
  { id: 'node', label: 'Node', icon: '⬡', color: 'emerald' },
  { id: 'terrain', label: 'Terrain', icon: '▲', color: 'amber' },
  { id: 'constraint', label: 'Constraint', icon: '◈', color: 'cyan' },
  { id: 'vegetation', label: 'Vegetation', icon: '🌿', color: 'rose' },
  { id: 'material', label: 'Material', icon: '◆', color: 'violet' },
];

// ============================================================================
// Lazy-loaded system test panels
// ============================================================================

const NodeSystemTest = dynamic(() => import('./systems/NodeSystemTest'), { ssr: false });
const TerrainSystemTest = dynamic(() => import('./systems/TerrainSystemTest'), { ssr: false });
const ConstraintSystemTest = dynamic(() => import('./systems/ConstraintSystemTest'), { ssr: false });
const VegetationSystemTest = dynamic(() => import('./systems/VegetationSystemTest'), { ssr: false });
const MaterialSystemTest = dynamic(() => import('./systems/MaterialSystemTest'), { ssr: false });
const SystemTestCanvas = dynamic(() => import('./systems/SystemTestCanvas'), { ssr: false });

// ============================================================================
// Main Application
// ============================================================================

export default function SystemsTestApp() {
  const [activeTab, setActiveTab] = useState<SystemTab>('node');
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('node');

  // Canvas data state
  const [terrainData, setTerrainData] = useState<TerrainMeshData | null>(null);
  const [treeData, setTreeData] = useState<TreeMeshData | null>(null);
  const [materialData, setMaterialData] = useState<THREE.Material | null>(null);
  const [constraintData, setConstraintData] = useState<ConstraintSceneData | null>(null);
  const [treeSeed, setTreeSeed] = useState(42);
  const [treeParams, setTreeParams] = useState({
    trunkLength: 3.0,
    trunkRadius: 0.2,
    branchAngle: 30,
    branchCount: 5,
    canopyRadius: 2.0,
  });
  const [nodeEvalResult, setNodeEvalResult] = useState(false);

  const handleTabChange = (tab: SystemTab) => {
    setActiveTab(tab);
    setCanvasMode(tab);
  };

  const handleTerrainGenerated = (data: TerrainMeshData | null) => {
    setTerrainData(data);
  };

  const handleTreeGenerated = (data: TreeMeshData | null) => {
    setTreeData(data);
    setTreeSeed(prev => prev + 1);
  };

  const handleTreeParamsChanged = (params: { trunkLength: number; trunkRadius: number; branchAngle: number; branchCount: number; canopyRadius: number }) => {
    setTreeParams(params);
    setTreeSeed(prev => prev + 1);
  };

  const handleMaterialGenerated = (material: THREE.Material | null) => {
    setMaterialData(material);
  };

  const handleConstraintScene = (data: ConstraintSceneData | null) => {
    setConstraintData(data);
  };

  const handleNodeEvalResult = (success: boolean) => {
    setNodeEvalResult(success);
  };

  // Overall parity score
  const overallParity = Math.round(
    Object.values(SYSTEM_PARITY).reduce((sum, s) => sum + s.current, 0) /
    Object.values(SYSTEM_PARITY).length
  );

  const tabColorMap: Record<SystemTab, string> = {
    node: 'border-emerald-500 text-emerald-400',
    terrain: 'border-amber-500 text-amber-400',
    constraint: 'border-cyan-500 text-cyan-400',
    vegetation: 'border-rose-500 text-rose-400',
    material: 'border-violet-500 text-violet-400',
  };

  const tabBgMap: Record<SystemTab, string> = {
    node: 'bg-emerald-700',
    terrain: 'bg-amber-700',
    constraint: 'bg-cyan-700',
    vegetation: 'bg-rose-700',
    material: 'bg-violet-700',
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-900 text-white overflow-hidden">
      {/* Top Bar */}
      <header className="bg-zinc-950 border-b border-zinc-800 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight">
            <span className="text-zinc-400">infinigen</span>
            <span className="text-white">/systems</span>
          </h1>
          <div className="text-xs text-zinc-500">|</div>
          <div className="text-xs text-zinc-400">System Integration Test</div>
          <div className="text-xs text-zinc-600">|</div>
          <a href="/" className="text-xs text-emerald-500 hover:text-emerald-400">Home</a>
          <a href="/editor" className="text-xs text-emerald-500 hover:text-emerald-400">Editor</a>
          <a href="/scene" className="text-xs text-emerald-500 hover:text-emerald-400">3D Scene</a>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs text-zinc-500">Overall Parity</div>
          <div className="flex items-center gap-2">
            <div className="w-24 bg-zinc-800 rounded-full h-1.5">
              <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${overallParity}%` }} />
            </div>
            <span className="text-xs font-mono text-emerald-400">{overallParity}%</span>
          </div>
        </div>
      </header>

      {/* Tab Bar */}
      <nav className="bg-zinc-950/50 border-b border-zinc-800 px-4 flex gap-1 shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 ${
              activeTab === tab.id
                ? `${tabColorMap[tab.id]} ${tabBgMap[tab.id]}/20`
                : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
            }`}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label}
            <span className="ml-2 text-[10px] font-mono opacity-70">
              {SYSTEM_PARITY[tab.id].current}%
            </span>
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <div className="flex flex-1 min-h-0">
        {/* 3D Canvas - Left Side */}
        <div className="flex-1 min-w-0 relative">
          <Suspense fallback={
            <div className="w-full h-full flex items-center justify-center bg-zinc-900">
              <div className="text-zinc-500 text-sm">Loading 3D Canvas...</div>
            </div>
          }>
            <SystemTestCanvas
              mode={canvasMode}
              terrainData={terrainData}
              treeData={treeData}
              materialData={materialData}
              constraintData={constraintData}
              treeSeed={treeSeed}
              treeParams={treeParams}
              nodeEvalResult={nodeEvalResult}
            />
          </Suspense>

          {/* Canvas Overlay Info */}
          <div className="absolute top-3 left-3 bg-zinc-950/80 rounded px-3 py-1.5 text-[10px] text-zinc-400 backdrop-blur-sm border border-zinc-800">
            {canvasMode === 'node' && (nodeEvalResult ? 'Node graph evaluated successfully' : 'Node graph evaluation pending')}
            {canvasMode === 'terrain' && (terrainData ? `Terrain: ${terrainData.width}x${terrainData.height} vertices` : 'Generate terrain to preview')}
            {canvasMode === 'vegetation' && 'Tree generation preview — orbit to inspect'}
            {canvasMode === 'material' && 'Material preview — sphere rotates automatically'}
            {canvasMode === 'constraint' && (constraintData ? `${constraintData.objects.length} objects, ${constraintData.violations ?? 0} violations` : 'Run solver to preview')}
          </div>

          {/* Navigation hint */}
          <div className="absolute bottom-3 left-3 bg-zinc-950/80 rounded px-2 py-1 text-[9px] text-zinc-500 backdrop-blur-sm border border-zinc-800">
            Orbit: drag | Zoom: scroll | Pan: right-drag
          </div>
        </div>

        {/* System Panel - Right Side */}
        <div className="w-96 border-l border-zinc-800 bg-zinc-900 overflow-y-auto">
          <Suspense fallback={
            <div className="p-4 text-zinc-500 text-sm">Loading panel...</div>
          }>
            {activeTab === 'node' && <NodeSystemTest onEvalResult={handleNodeEvalResult} />}
            {activeTab === 'terrain' && <TerrainSystemTest onTerrainGenerated={handleTerrainGenerated} />}
            {activeTab === 'constraint' && <ConstraintSystemTest onConstraintScene={handleConstraintScene} />}
            {activeTab === 'vegetation' && <VegetationSystemTest onTreeGenerated={handleTreeGenerated} onParamsChanged={handleTreeParamsChanged} />}
            {activeTab === 'material' && <MaterialSystemTest onMaterialGenerated={handleMaterialGenerated} />}
          </Suspense>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <footer className="bg-zinc-950 border-t border-zinc-800 px-4 py-1.5 flex items-center justify-between text-[10px] text-zinc-500 shrink-0">
        <div className="flex items-center gap-4">
          <span>infinigen-r3f systems test</span>
          <span>|</span>
          <span>5 systems integrated</span>
          <span>|</span>
          <span className="text-emerald-600">Real implementations (no simulation)</span>
        </div>
        <div className="flex items-center gap-3">
          {Object.entries(SYSTEM_PARITY).map(([key, val]) => (
            <span key={key} className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{
                backgroundColor: val.current >= 60 ? '#10b981' : val.current >= 40 ? '#f59e0b' : '#ef4444'
              }} />
              {key}: {val.current}%
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}
