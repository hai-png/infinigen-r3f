'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';
import * as THREE from 'three';

// Infinigen-R3F imports (adapted from ../../../infinigen-r3f/src/ to ../../)
import { nodeDefinitionRegistry } from '../../core/nodes/core/node-definition-registry';
import { SocketType } from '../../core/nodes/core/socket-types';
import {
  NodeEvaluator,
  EvaluationMode,
  type NodeEvaluationResult,
  type NodeGraph,
} from '../../core/nodes/execution/NodeEvaluator';
import type { NodeInstance, NodeLink } from '../../core/nodes/core/types';
import {
  SceneWireup,
  applyMaterialToScene,
  applyGeometryToScene,
  applyTextureToScene,
  type TextureMapSlot,
  type ApplyResult,
} from '../SceneWireup';
import { CATEGORY_COLORS, SOCKET_COLORS, type InfinigenNodeData } from './nodeGraphConstants';

// React Flow types
import type { Node as RFNode, Edge as RFEdge } from '@xyflow/react';

// ============================================================================
// Types
// ============================================================================

export type CenterViewMode = 'viewport3d' | 'nodeGraph' | 'constraintViz';

export type LeftTab = 'sceneTree' | 'assetBrowser';
export type RightTab = 'properties' | 'material' | 'terrain' | 'constraints' | 'animation' | 'particles' | 'camera';
export type BottomTab = 'timeline' | 'performance' | 'status';

export interface SceneObject {
  id: string;
  name: string;
  type: 'mesh' | 'light' | 'camera' | 'group' | 'terrain' | 'ocean' | 'vegetation' | 'creature';
  visible: boolean;
  locked: boolean;
  selected: boolean;
  children: SceneObject[];
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  materialId?: string;
  userData?: Record<string, unknown>;
}

export interface PBRMaterialState {
  id: string;
  name: string;
  baseColor: [number, number, number];
  metallic: number;
  roughness: number;
  emissive: [number, number, number];
  emissiveIntensity: number;
  opacity: number;
  normalStrength: number;
  aoStrength: number;
}

export interface TerrainParams {
  seed: number;
  scale: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  erosionStrength: number;
  seaLevel: number;
  heightScale: number;
}

export interface ConstraintEntry {
  id: string;
  name: string;
  type: string;
  expression: string;
  weight: number;
  active: boolean;
}

export interface Keyframe {
  id: string;
  time: number;
  objectId: string;
  property: string;
  value: number;
}

export interface ParticleSystemConfig {
  id: string;
  name: string;
  count: number;
  speed: number;
  size: number;
  lifetime: number;
  color: [number, number, number];
  emissionRate: number;
}

export interface CameraRig {
  id: string;
  name: string;
  type: 'orbit' | 'dolly' | 'crane' | 'handheld';
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  memoryUsed: number;
}

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

export interface EditorState {
  // Layout
  centerView: CenterViewMode;
  leftTab: LeftTab;
  rightTab: RightTab;
  bottomTab: BottomTab;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  bottomPanelOpen: boolean;

  // Scene
  sceneObjects: SceneObject[];
  selectedObjectId: string | null;

  // Node Graph
  rfNodes: RFNode[];
  rfEdges: RFEdge[];
  selectedNodeId: string | null;
  evaluationResult: NodeEvaluationResult | null;
  isEvaluating: boolean;
  evalMode: EvaluationMode;

  // Material
  currentMaterial: PBRMaterialState;
  materialPresets: PBRMaterialState[];

  // Terrain
  terrainParams: TerrainParams;

  // Constraints
  constraints: ConstraintEntry[];
  solverRunning: boolean;
  solverIteration: number;
  solverEnergy: number;

  // Animation
  keyframes: Keyframe[];
  playbackTime: number;
  isPlaying: boolean;
  totalDuration: number;

  // Particles
  particleSystems: ParticleSystemConfig[];

  // Camera
  cameraRigs: CameraRig[];
  activeCameraId: string | null;

  // Performance
  performanceMetrics: PerformanceMetrics;

  // Log
  log: LogEntry[];
}

// ============================================================================
// Context Type
// ============================================================================

export interface EditorContextValue extends EditorState {
  // Layout actions
  setCenterView: (view: CenterViewMode) => void;
  setLeftTab: (tab: LeftTab) => void;
  setRightTab: (tab: RightTab) => void;
  setBottomTab: (tab: BottomTab) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  toggleBottomPanel: () => void;

  // Scene actions
  selectObject: (id: string | null) => void;
  toggleObjectVisibility: (id: string) => void;
  toggleObjectLock: (id: string) => void;
  updateObjectTransform: (id: string, prop: 'position' | 'rotation' | 'scale', value: [number, number, number]) => void;

  // Node graph actions
  setRfNodes: (nodes: RFNode[]) => void;
  setRfEdges: (edges: RFEdge[]) => void;
  setSelectedNodeId: (id: string | null) => void;
  addNode: (definitionType: string, position?: { x: number; y: number }) => void;
  deleteNode: (id: string) => void;
  updateNodeProperty: (nodeId: string, key: string, value: unknown) => void;
  evaluateGraph: () => void;
  loadPreset: (presetName: string) => void;
  clearGraph: () => void;
  setEvalMode: (mode: EvaluationMode) => void;

  // Material actions
  setCurrentMaterial: (mat: Partial<PBRMaterialState>) => void;
  applyMaterialToSelection: () => void;

  // Terrain actions
  setTerrainParams: (params: Partial<TerrainParams>) => void;

  // Constraint actions
  addConstraint: (constraint: Omit<ConstraintEntry, 'id'>) => void;
  removeConstraint: (id: string) => void;
  toggleConstraint: (id: string) => void;
  runSolver: () => void;

  // Animation actions
  addKeyframe: (keyframe: Omit<Keyframe, 'id'>) => void;
  removeKeyframe: (id: string) => void;
  setPlaybackTime: (time: number) => void;
  togglePlayback: () => void;

  // Particle actions
  addParticleSystem: (system: Omit<ParticleSystemConfig, 'id'>) => void;
  removeParticleSystem: (id: string) => void;
  updateParticleSystem: (id: string, updates: Partial<ParticleSystemConfig>) => void;

  // Camera actions
  addCameraRig: (rig: Omit<CameraRig, 'id'>) => void;
  removeCameraRig: (id: string) => void;
  setActiveCamera: (id: string | null) => void;

  // Performance
  updatePerformanceMetrics: (metrics: Partial<PerformanceMetrics>) => void;

  // Scene wireup
  sceneWireup: SceneWireup;
  threeScene: THREE.Scene | null;
  setThreeScene: (scene: THREE.Scene | null) => void;

  // Log
  addLog: (level: LogEntry['level'], message: string) => void;

  // Utility
  categoryColors: Record<string, string>;
  socketColors: Record<string, string>;
}

// ============================================================================
// Helpers
// ============================================================================

let _idCounter = 0;
function nextId(prefix = 'id'): string {
  _idCounter += 1;
  return `${prefix}_${_idCounter}`;
}

function buildDefaultSceneObjects(): SceneObject[] {
  return [
    {
      id: 'scene_root',
      name: 'Scene Root',
      type: 'group',
      visible: true,
      locked: false,
      selected: false,
      children: [
        { id: 'terrain', name: 'Terrain', type: 'terrain', visible: true, locked: false, selected: false, children: [], position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], materialId: 'terrain_mat' },
        { id: 'ocean', name: 'Ocean', type: 'ocean', visible: true, locked: false, selected: false, children: [], position: [0, 10.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        { id: 'trees', name: 'Trees', type: 'vegetation', visible: true, locked: false, selected: false, children: [], position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        { id: 'plants', name: 'Plants', type: 'vegetation', visible: true, locked: false, selected: false, children: [], position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        { id: 'creatures', name: 'Creatures', type: 'creature', visible: true, locked: false, selected: false, children: [], position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      ],
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    {
      id: 'lights',
      name: 'Lights',
      type: 'group',
      visible: true,
      locked: false,
      selected: false,
      children: [
        { id: 'sun', name: 'Sun Light', type: 'light', visible: true, locked: false, selected: false, children: [], position: [60, 100, 40], rotation: [0, 0, 0], scale: [1, 1, 1] },
        { id: 'ambient', name: 'Ambient Light', type: 'light', visible: true, locked: false, selected: false, children: [], position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      ],
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  ];
}

const DEFAULT_MATERIALS: PBRMaterialState[] = [
  { id: 'terrain_mat', name: 'Terrain', baseColor: [0.28, 0.55, 0.18], metallic: 0, roughness: 0.9, emissive: [0, 0, 0], emissiveIntensity: 0, opacity: 1, normalStrength: 1, aoStrength: 1 },
  { id: 'stone_mat', name: 'Stone', baseColor: [0.5, 0.48, 0.45], metallic: 0, roughness: 0.85, emissive: [0, 0, 0], emissiveIntensity: 0, opacity: 1, normalStrength: 0.8, aoStrength: 0.6 },
  { id: 'bark_mat', name: 'Bark', baseColor: [0.35, 0.22, 0.1], metallic: 0, roughness: 0.95, emissive: [0, 0, 0], emissiveIntensity: 0, opacity: 1, normalStrength: 1, aoStrength: 0.8 },
  { id: 'leaf_mat', name: 'Leaf', baseColor: [0.15, 0.4, 0.08], metallic: 0, roughness: 0.7, emissive: [0, 0, 0], emissiveIntensity: 0, opacity: 1, normalStrength: 0.5, aoStrength: 0.4 },
  { id: 'water_mat', name: 'Water', baseColor: [0.05, 0.15, 0.4], metallic: 0.1, roughness: 0.1, emissive: [0, 0, 0.05], emissiveIntensity: 0.2, opacity: 0.85, normalStrength: 0.2, aoStrength: 0 },
  { id: 'sand_mat', name: 'Sand', baseColor: [0.76, 0.72, 0.48], metallic: 0, roughness: 0.95, emissive: [0, 0, 0], emissiveIntensity: 0, opacity: 1, normalStrength: 0.3, aoStrength: 0.2 },
];

const DEFAULT_CONSTRAINTS: ConstraintEntry[] = [
  { id: 'c1', name: 'Objects on Ground', type: 'containment', expression: 'obj.position.y >= 0', weight: 10, active: true },
  { id: 'c2', name: 'No Overlap', type: 'collision_avoidance', expression: 'distance(a, b) >= min_dist', weight: 5, active: true },
  { id: 'c3', name: 'Natural Distribution', type: 'distance', expression: 'variance(distances) < threshold', weight: 2, active: false },
];

// ============================================================================
// Context
// ============================================================================

const EditorContext = createContext<EditorContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export function EditorProvider({ children }: { children: ReactNode }) {
  // Layout state
  const [centerView, setCenterView] = useState<CenterViewMode>('viewport3d');
  const [leftTab, setLeftTab] = useState<LeftTab>('sceneTree');
  const [rightTab, setRightTab] = useState<RightTab>('properties');
  const [bottomTab, setBottomTab] = useState<BottomTab>('status');
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true);

  // Scene state
  const [sceneObjects, setSceneObjects] = useState<SceneObject[]>(buildDefaultSceneObjects);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);

  // Node graph state
  const [rfNodes, setRfNodes] = useState<RFNode[]>([]);
  const [rfEdges, setRfEdges] = useState<RFEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<NodeEvaluationResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalMode, setEvalMode] = useState<EvaluationMode>(EvaluationMode.MATERIAL);

  // Material state
  const [currentMaterial, setCurrentMaterialState] = useState<PBRMaterialState>(DEFAULT_MATERIALS[0]);
  const [materialPresets] = useState<PBRMaterialState[]>(DEFAULT_MATERIALS);

  // Terrain state
  const [terrainParams, setTerrainParamsState] = useState<TerrainParams>({
    seed: 42,
    scale: 60,
    octaves: 6,
    persistence: 0.5,
    lacunarity: 2.0,
    erosionStrength: 0.3,
    seaLevel: 0.3,
    heightScale: 35,
  });

  // Constraint state
  const [constraints, setConstraints] = useState<ConstraintEntry[]>(DEFAULT_CONSTRAINTS);
  const [solverRunning, setSolverRunning] = useState(false);
  const [solverIteration, setSolverIteration] = useState(0);
  const [solverEnergy, setSolverEnergy] = useState(0);

  // Animation state
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [totalDuration] = useState(10);

  // Particle state
  const [particleSystems, setParticleSystems] = useState<ParticleSystemConfig[]>([]);

  // Camera state
  const [cameraRigs, setCameraRigs] = useState<CameraRig[]>([
    { id: 'cam_default', name: 'Default Orbit', type: 'orbit', position: [80, 60, 80], target: [0, 5, 0], fov: 50 },
    { id: 'cam_cinematic', name: 'Cinematic Dolly', type: 'dolly', position: [0, 15, 50], target: [0, 5, 0], fov: 35 },
  ]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>('cam_default');

  // Performance state
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics>({
    fps: 0, frameTime: 0, drawCalls: 0, triangles: 0,
    geometries: 0, textures: 0, programs: 0, memoryUsed: 0,
  });

  // Log state
  const [log, setLog] = useState<LogEntry[]>([]);

  // Refs
  const evaluatorRef = useRef<NodeEvaluator | null>(null);
  const sceneWireupRef = useRef<SceneWireup>(new SceneWireup());
  const [threeScene, setThreeScene] = useState<THREE.Scene | null>(null);

  // ---- Logging ----
  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    setLog(prev => [...prev.slice(-200), { timestamp: Date.now(), level, message }]);
  }, []);

  // ---- Layout actions ----
  const toggleLeftPanel = useCallback(() => setLeftPanelOpen(p => !p), []);
  const toggleRightPanel = useCallback(() => setRightPanelOpen(p => !p), []);
  const toggleBottomPanel = useCallback(() => setBottomPanelOpen(p => !p), []);

  // ---- Scene actions ----
  const selectObject = useCallback((id: string | null) => {
    setSelectedObjectId(id);
    setSceneObjects(prev => updateObjectSelection(prev, id));
  }, []);

  const toggleObjectVisibility = useCallback((id: string) => {
    setSceneObjects(prev => updateObjectInTree(prev, id, obj => ({ ...obj, visible: !obj.visible })));
  }, []);

  const toggleObjectLock = useCallback((id: string) => {
    setSceneObjects(prev => updateObjectInTree(prev, id, obj => ({ ...obj, locked: !obj.locked })));
  }, []);

  const updateObjectTransform = useCallback((id: string, prop: 'position' | 'rotation' | 'scale', value: [number, number, number]) => {
    setSceneObjects(prev => updateObjectInTree(prev, id, obj => ({ ...obj, [prop]: value })));
  }, []);

  // ---- Node Graph actions ----
  const addNode = useCallback((definitionType: string, position?: { x: number; y: number }) => {
    const def = nodeDefinitionRegistry.get(definitionType);
    if (!def) {
      addLog('error', `Unknown node type: ${definitionType}`);
      return;
    }

    const pos = position ?? { x: 100 + _idCounter * 20, y: 100 + _idCounter * 10 };
    const category = def.category;
    const color = CATEGORY_COLORS[category] ?? '#6b7280';

    const inputs = def.inputs.map((s: any) => ({
      name: s.name,
      type: s.type as string,
      defaultValue: s.defaultValue ?? s.default,
    }));

    const outputs = def.outputs.map((s: any) => ({
      name: s.name,
      type: s.type as string,
    }));

    const propertyValues: Record<string, any> = {};
    if (def.properties) {
      for (const [k, v] of Object.entries(def.properties)) {
        propertyValues[k] = (v as any).default;
      }
    }

    const node: RFNode<InfinigenNodeData> = {
      id: nextId('node'),
      type: categoryToNodeType(category),
      position: pos,
      data: {
        label: def.label,
        definitionType,
        category,
        color,
        inputs,
        outputs,
        properties: def.properties ?? {},
        propertyValues,
      },
    };

    setRfNodes(prev => [...prev, node]);
    addLog('info', `Added node: ${def.label}`);
  }, [addLog]);

  const deleteNode = useCallback((id: string) => {
    setRfNodes(prev => prev.filter(n => n.id !== id));
    setRfEdges(prev => prev.filter(e => e.source !== id && e.target !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
    addLog('info', `Deleted node: ${id}`);
  }, [selectedNodeId, addLog]);

  const updateNodeProperty = useCallback((nodeId: string, key: string, value: unknown) => {
    setRfNodes(prev => prev.map(n => {
      if (n.id !== nodeId) return n;
      const data = n.data as InfinigenNodeData;
      return { ...n, data: { ...data, propertyValues: { ...data.propertyValues, [key]: value } } };
    }));
  }, []);

  const evaluateGraph = useCallback(() => {
    setIsEvaluating(true);
    addLog('info', `Evaluating graph in ${evalMode} mode...`);

    try {
      if (!evaluatorRef.current) {
        evaluatorRef.current = new NodeEvaluator();
      }
      const evaluator = evaluatorRef.current;

      // Convert React Flow → NodeGraph
      const nodeMap = new Map<string, NodeInstance>();
      for (const n of rfNodes) {
        const data = n.data as InfinigenNodeData;
        const inputs: Record<string, any> = {};
        for (const inp of data.inputs) {
          inputs[inp.name] = inp.defaultValue ?? null;
        }
        nodeMap.set(n.id, {
          id: n.id,
          type: data.definitionType,
          name: data.label,
          position: { x: n.position.x, y: n.position.y },
          settings: { ...data.propertyValues },
          inputs: inputs as any,
          outputs: new Map() as any,
        });
      }

      const links: NodeLink[] = rfEdges.map(e => ({
        id: e.id,
        fromNode: e.source!,
        fromSocket: e.sourceHandle ?? '',
        toNode: e.target!,
        toSocket: e.targetHandle ?? '',
      }));

      const graph: NodeGraph = { nodes: nodeMap, links };
      const result = evaluator.evaluate(graph, evalMode);

      setEvaluationResult(result);
      result.warnings.forEach(w => addLog('warn', w));
      result.errors.forEach(e => addLog('error', e));

      if (result.errors.length === 0) {
        addLog('success', `Evaluation complete (${evalMode})`);
      } else {
        addLog('error', `Evaluation failed with ${result.errors.length} error(s)`);
      }

      // Apply to scene if we have one
      if (threeScene && result.value) {
        try {
          if (result.mode === EvaluationMode.MATERIAL && result.value instanceof THREE.Material) {
            sceneWireupRef.current.applyMaterial(threeScene, result.value);
            addLog('success', 'Material applied to scene');
          } else if (result.mode === EvaluationMode.GEOMETRY && result.value instanceof THREE.BufferGeometry) {
            const targetId = selectedObjectId ?? 'terrain';
            sceneWireupRef.current.applyGeometry(threeScene, result.value, targetId);
            addLog('success', `Geometry applied to ${targetId}`);
          } else if (result.mode === EvaluationMode.TEXTURE && result.value instanceof THREE.Texture) {
            sceneWireupRef.current.applyTexture(threeScene, result.value, undefined, 'map');
            addLog('success', 'Texture applied to scene');
          }
        } catch (err: any) {
          addLog('warn', `Apply to scene failed: ${err.message}`);
        }
      }
    } catch (err: any) {
      addLog('error', `Evaluation error: ${err.message}`);
      setEvaluationResult({
        mode: evalMode,
        value: null,
        warnings: [],
        errors: [err.message],
      });
    } finally {
      setIsEvaluating(false);
    }
  }, [rfNodes, rfEdges, evalMode, threeScene, selectedObjectId, addLog]);

  const loadPreset = useCallback(async (presetName: string) => {
    try {
      const presetModule = await import(`../presets/${presetName}.json`);
      const preset = presetModule.default ?? presetModule;
      setRfNodes(preset.nodes ?? []);
      setRfEdges(preset.edges ?? []);
      setSelectedNodeId(null);
      setEvaluationResult(null);
      addLog('info', `Loaded preset: ${presetName}`);
    } catch (err: any) {
      addLog('error', `Failed to load preset ${presetName}: ${err.message}`);
    }
  }, [addLog]);

  const clearGraph = useCallback(() => {
    setRfNodes([]);
    setRfEdges([]);
    setSelectedNodeId(null);
    setEvaluationResult(null);
    addLog('info', 'Graph cleared');
  }, [addLog]);

  // ---- Material actions ----
  const setCurrentMaterial = useCallback((updates: Partial<PBRMaterialState>) => {
    setCurrentMaterialState(prev => ({ ...prev, ...updates }));
  }, []);

  const applyMaterialToSelection = useCallback(() => {
    if (!threeScene || !selectedObjectId) return;
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(...currentMaterial.baseColor),
      metalness: currentMaterial.metallic,
      roughness: currentMaterial.roughness,
      emissive: new THREE.Color(...currentMaterial.emissive),
      emissiveIntensity: currentMaterial.emissiveIntensity,
      transparent: currentMaterial.opacity < 1,
      opacity: currentMaterial.opacity,
    });
    const result = sceneWireupRef.current.applyMaterial(threeScene, mat, [selectedObjectId]);
    addLog(result.success ? 'success' : 'error', `Material applied: ${result.appliedCount} objects`);
  }, [threeScene, selectedObjectId, currentMaterial, addLog]);

  // ---- Terrain actions ----
  const setTerrainParams = useCallback((updates: Partial<TerrainParams>) => {
    setTerrainParamsState(prev => ({ ...prev, ...updates }));
  }, []);

  // ---- Constraint actions ----
  const addConstraint = useCallback((constraint: Omit<ConstraintEntry, 'id'>) => {
    setConstraints(prev => [...prev, { ...constraint, id: nextId('c') }]);
  }, []);

  const removeConstraint = useCallback((id: string) => {
    setConstraints(prev => prev.filter(c => c.id !== id));
  }, []);

  const toggleConstraint = useCallback((id: string) => {
    setConstraints(prev => prev.map(c => c.id === id ? { ...c, active: !c.active } : c));
  }, []);

  const runSolver = useCallback(async () => {
    setSolverRunning(true);
    addLog('info', 'Starting constraint solver...');
    // Simulate solver running
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 50));
      setSolverIteration(i + 1);
      setSolverEnergy(Math.max(0, 100 - i * 5 + (i % 3)));
    }
    setSolverRunning(false);
    addLog('success', 'Constraint solver finished');
  }, [addLog]);

  // ---- Animation actions ----
  const addKeyframe = useCallback((keyframe: Omit<Keyframe, 'id'>) => {
    setKeyframes(prev => [...prev, { ...keyframe, id: nextId('kf') }]);
  }, []);

  const removeKeyframe = useCallback((id: string) => {
    setKeyframes(prev => prev.filter(k => k.id !== id));
  }, []);

  const togglePlayback = useCallback(() => setIsPlaying(p => !p), []);

  // ---- Particle actions ----
  const addParticleSystem = useCallback((system: Omit<ParticleSystemConfig, 'id'>) => {
    setParticleSystems(prev => [...prev, { ...system, id: nextId('ps') }]);
  }, []);

  const removeParticleSystem = useCallback((id: string) => {
    setParticleSystems(prev => prev.filter(s => s.id !== id));
  }, []);

  const updateParticleSystem = useCallback((id: string, updates: Partial<ParticleSystemConfig>) => {
    setParticleSystems(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  // ---- Camera actions ----
  const addCameraRig = useCallback((rig: Omit<CameraRig, 'id'>) => {
    setCameraRigs(prev => [...prev, { ...rig, id: nextId('cam') }]);
  }, []);

  const removeCameraRig = useCallback((id: string) => {
    setCameraRigs(prev => prev.filter(r => r.id !== id));
    if (activeCameraId === id) setActiveCameraId(null);
  }, [activeCameraId]);

  const setActiveCamera = useCallback((id: string | null) => {
    setActiveCameraId(id);
  }, []);

  // ---- Performance ----
  const updatePerformanceMetrics = useCallback((metrics: Partial<PerformanceMetrics>) => {
    setPerformanceMetrics(prev => ({ ...prev, ...metrics }));
  }, []);

  // ---- Value ----
  const value = useMemo<EditorContextValue>(() => ({
    // Layout
    centerView, setCenterView, leftTab, setLeftTab, rightTab, setRightTab, bottomTab, setBottomTab,
    leftPanelOpen, rightPanelOpen, bottomPanelOpen,
    toggleLeftPanel, toggleRightPanel, toggleBottomPanel,

    // Scene
    sceneObjects, selectedObjectId, selectObject,
    toggleObjectVisibility, toggleObjectLock, updateObjectTransform,

    // Node graph
    rfNodes, rfEdges, selectedNodeId, evaluationResult, isEvaluating, evalMode,
    setRfNodes, setRfEdges, setSelectedNodeId,
    addNode, deleteNode, updateNodeProperty, evaluateGraph, loadPreset, clearGraph, setEvalMode,

    // Material
    currentMaterial, materialPresets, setCurrentMaterial, applyMaterialToSelection,

    // Terrain
    terrainParams, setTerrainParams,

    // Constraints
    constraints, solverRunning, solverIteration, solverEnergy,
    addConstraint, removeConstraint, toggleConstraint, runSolver,

    // Animation
    keyframes, playbackTime, isPlaying, totalDuration,
    addKeyframe, removeKeyframe, setPlaybackTime, togglePlayback,

    // Particles
    particleSystems, addParticleSystem, removeParticleSystem, updateParticleSystem,

    // Camera
    cameraRigs, activeCameraId, addCameraRig, removeCameraRig, setActiveCamera,

    // Performance
    performanceMetrics, updatePerformanceMetrics,

    // Scene wireup
    sceneWireup: sceneWireupRef.current,
    threeScene, setThreeScene,

    // Log
    log, addLog,

    // Utility
    categoryColors: CATEGORY_COLORS,
    socketColors: SOCKET_COLORS,
  }), [
    centerView, leftTab, rightTab, bottomTab,
    leftPanelOpen, rightPanelOpen, bottomPanelOpen,
    sceneObjects, selectedObjectId,
    rfNodes, rfEdges, selectedNodeId, evaluationResult, isEvaluating, evalMode,
    currentMaterial, materialPresets,
    terrainParams,
    constraints, solverRunning, solverIteration, solverEnergy,
    keyframes, playbackTime, isPlaying, totalDuration,
    particleSystems,
    cameraRigs, activeCameraId,
    performanceMetrics,
    log, threeScene,
  ]);

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used within EditorProvider');
  return ctx;
}

export default EditorContext;

// ============================================================================
// Internal Helpers
// ============================================================================

function categoryToNodeType(category: string): string {
  const mapping: Record<string, string> = {
    SHADER: 'shader', GEOMETRY: 'geometry', MESH: 'geometry', MESH_PRIMITIVES: 'geometry',
    TEXTURE: 'texture', TEXTURE_SHADER: 'texture', INPUT: 'input', SHADER_INPUT: 'input',
    OUTPUT: 'output', SHADER_OUTPUT: 'output', UTILITY: 'utility', CONVERTER: 'utility',
    COLOR: 'utility', CURVE: 'geometry', CURVE_PRIMITIVES: 'geometry', ATTRIBUTE: 'utility',
    INSTANCES: 'geometry', MATERIAL: 'shader', POINT: 'geometry', SIMULATE: 'utility',
    TEXT: 'utility', TRANSFORM: 'geometry', MODIFIERS: 'geometry',
  };
  return mapping[category] ?? 'utility';
}

function updateObjectSelection(objects: SceneObject[], selectedId: string | null): SceneObject[] {
  return objects.map(obj => ({
    ...obj,
    selected: obj.id === selectedId,
    children: updateObjectSelection(obj.children, selectedId),
  }));
}

function updateObjectInTree(
  objects: SceneObject[],
  targetId: string,
  updater: (obj: SceneObject) => SceneObject,
): SceneObject[] {
  return objects.map(obj => {
    if (obj.id === targetId) return updater(obj);
    if (obj.children.length > 0) {
      return { ...obj, children: updateObjectInTree(obj.children, targetId, updater) };
    }
    return obj;
  });
}
