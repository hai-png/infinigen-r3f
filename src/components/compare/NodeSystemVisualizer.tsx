'use client';

import React, { useState, useCallback, useMemo, useRef, Suspense } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  Handle,
  Position,
  BackgroundVariant,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sphere } from '@react-three/drei';
import * as THREE from 'three';
import {
  Box, Code2, Cpu, Play, RotateCcw, Search,
  Palette, Calculator, Sparkles, Box as BoxIcon, Mountain, Image
} from 'lucide-react';

// ============================================================================
// Node Category Colors
// ============================================================================

const CATEGORY_CONFIG: Record<string, { color: string; bgColor: string; borderColor: string; icon: React.ReactNode }> = {
  Texture: { color: '#f97316', bgColor: '#431407', borderColor: '#9a3412', icon: <Image className="w-3.5 h-3.5" /> },
  Color: { color: '#eab308', bgColor: '#422006', borderColor: '#a16207', icon: <Palette className="w-3.5 h-3.5" /> },
  Math: { color: '#a855f7', bgColor: '#2e1065', borderColor: '#7e22ce', icon: <Calculator className="w-3.5 h-3.5" /> },
  Shader: { color: '#22c55e', bgColor: '#052e16', borderColor: '#15803d', icon: <Sparkles className="w-3.5 h-3.5" /> },
  Geometry: { color: '#3b82f6', bgColor: '#172554', borderColor: '#1d4ed8', icon: <BoxIcon className="w-3.5 h-3.5" /> },
  Terrain: { color: '#14b8a6', bgColor: '#042f2e', borderColor: '#0f766e', icon: <Mountain className="w-3.5 h-3.5" /> },
};

// ============================================================================
// Socket Type Colors
// ============================================================================

const SOCKET_COLORS: Record<string, string> = {
  float: '#999999',
  vector: '#ff9933',
  color: '#ffcc33',
  shader: '#66cc66',
  geometry: '#00b8b8',
  value: '#999999',
};

// ============================================================================
// Custom Node Components
// ============================================================================

interface CustomNodeData extends Record<string, unknown> {
  label: string;
  category: string;
  inputs: { name: string; type: string }[];
  outputs: { name: string; type: string }[];
  evaluated: boolean;
  evalTime?: number;
}

function CustomNode({ data }: NodeProps) {
  const nodeData = data as unknown as CustomNodeData;
  const config = CATEGORY_CONFIG[nodeData.category] ?? CATEGORY_CONFIG.Math;

  return (
    <div
      className="rounded-lg border-2 shadow-xl min-w-[160px] backdrop-blur-sm"
      style={{
        backgroundColor: config.bgColor,
        borderColor: nodeData.evaluated ? config.color : config.borderColor,
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-1.5 rounded-t-md flex items-center gap-2 border-b"
        style={{ borderColor: config.borderColor }}
      >
        <span style={{ color: config.color }}>{config.icon}</span>
        <span className="text-xs font-semibold text-gray-200 flex-1">{nodeData.label}</span>
        {nodeData.evaluated && (
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title={`Evaluated in ${nodeData.evalTime}ms`} />
        )}
      </div>

      {/* Sockets */}
      <div className="flex">
        {/* Input sockets */}
        <div className="flex flex-col gap-1 py-2 px-1">
          {nodeData.inputs.map((input, i) => (
            <div key={i} className="flex items-center gap-1 relative">
              <Handle
                type="target"
                position={Position.Left}
                id={input.name}
                style={{
                  background: SOCKET_COLORS[input.type] ?? '#999',
                  width: 8,
                  height: 8,
                  border: '1px solid #333',
                  left: -4,
                }}
              />
              <span className="text-[10px] text-gray-400 ml-3">{input.name}</span>
            </div>
          ))}
        </div>

        {/* Output sockets */}
        <div className="flex flex-col gap-1 py-2 px-1 ml-auto">
          {nodeData.outputs.map((output, i) => (
            <div key={i} className="flex items-center gap-1 justify-end relative">
              <span className="text-[10px] text-gray-400 mr-3">{output.name}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={output.name}
                style={{
                  background: SOCKET_COLORS[output.type] ?? '#999',
                  width: 8,
                  height: 8,
                  border: '1px solid #333',
                  right: -4,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

// ============================================================================
// Pre-built example graph data
// ============================================================================

function createExampleGraph(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [
    {
      id: 'n1',
      type: 'custom',
      position: { x: 0, y: 50 },
      data: {
        label: 'Noise Texture',
        category: 'Texture',
        inputs: [{ name: 'Scale', type: 'float' }, { name: 'Detail', type: 'float' }],
        outputs: [{ name: 'Fac', type: 'float' }, { name: 'Color', type: 'color' }],
        evaluated: false,
      },
    },
    {
      id: 'n2',
      type: 'custom',
      position: { x: 260, y: 0 },
      data: {
        label: 'ColorRamp',
        category: 'Color',
        inputs: [{ name: 'Fac', type: 'float' }],
        outputs: [{ name: 'Color', type: 'color' }],
        evaluated: false,
      },
    },
    {
      id: 'n3',
      type: 'custom',
      position: { x: 260, y: 180 },
      data: {
        label: 'Math (Multiply)',
        category: 'Math',
        inputs: [{ name: 'Value', type: 'float' }, { name: 'Value_001', type: 'float' }],
        outputs: [{ name: 'Value', type: 'float' }],
        evaluated: false,
      },
    },
    {
      id: 'n4',
      type: 'custom',
      position: { x: 500, y: 50 },
      data: {
        label: 'Principled BSDF',
        category: 'Shader',
        inputs: [
          { name: 'Base Color', type: 'color' },
          { name: 'Roughness', type: 'float' },
          { name: 'Metallic', type: 'float' },
          { name: 'Normal', type: 'vector' },
        ],
        outputs: [{ name: 'BSDF', type: 'shader' }],
        evaluated: false,
      },
    },
    {
      id: 'n5',
      type: 'custom',
      position: { x: 740, y: 100 },
      data: {
        label: 'Material Output',
        category: 'Shader',
        inputs: [{ name: 'Surface', type: 'shader' }],
        outputs: [],
        evaluated: false,
      },
    },
    {
      id: 'n6',
      type: 'custom',
      position: { x: 0, y: 280 },
      data: {
        label: 'Voronoi Texture',
        category: 'Texture',
        inputs: [{ name: 'Scale', type: 'float' }, { name: 'Randomness', type: 'float' }],
        outputs: [{ name: 'Distance', type: 'float' }, { name: 'Color', type: 'color' }],
        evaluated: false,
      },
    },
    {
      id: 'n7',
      type: 'custom',
      position: { x: 0, y: 450 },
      data: {
        label: 'Terrain SDF',
        category: 'Terrain',
        inputs: [{ name: 'Frequency', type: 'float' }, { name: 'Amplitude', type: 'float' }],
        outputs: [{ name: 'SDF', type: 'float' }, { name: 'Normal', type: 'vector' }],
        evaluated: false,
      },
    },
  ];

  const edges: Edge[] = [
    { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'Fac', targetHandle: 'Fac', animated: true, style: { stroke: '#f97316', strokeWidth: 2 } },
    { id: 'e2', source: 'n1', target: 'n3', sourceHandle: 'Fac', targetHandle: 'Value', animated: true, style: { stroke: '#a855f7', strokeWidth: 2 } },
    { id: 'e3', source: 'n2', target: 'n4', sourceHandle: 'Color', targetHandle: 'Base Color', animated: true, style: { stroke: '#eab308', strokeWidth: 2 } },
    { id: 'e4', source: 'n3', target: 'n4', sourceHandle: 'Value', targetHandle: 'Roughness', animated: true, style: { stroke: '#a855f7', strokeWidth: 2 } },
    { id: 'e5', source: 'n4', target: 'n5', sourceHandle: 'BSDF', targetHandle: 'Surface', animated: true, style: { stroke: '#22c55e', strokeWidth: 2 } },
    { id: 'e6', source: 'n7', target: 'n4', sourceHandle: 'Normal', targetHandle: 'Normal', animated: true, style: { stroke: '#14b8a6', strokeWidth: 2 } },
  ];

  return { nodes, edges };
}

// ============================================================================
// GLSL Shader Code Generator (simplified)
// ============================================================================

function generateGLSL(nodes: Node[], edges: Edge[]): string {
  const lines: string[] = [
    '// Auto-generated GLSL from Infinigen-R3F Node Graph',
    '// ================================================',
    '',
    'precision highp float;',
    '',
    'uniform float uTime;',
    'uniform vec2 uResolution;',
    '',
    '// Noise functions',
    'float hash(vec2 p) {',
    '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);',
    '}',
    '',
    'float noise(vec2 p) {',
    '  vec2 i = floor(p);',
    '  vec2 f = fract(p);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  float a = hash(i);',
    '  float b = hash(i + vec2(1.0, 0.0));',
    '  float c = hash(i + vec2(0.0, 1.0));',
    '  float d = hash(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);',
    '}',
    '',
    'float fbm(vec2 p, int octaves, float lacunarity, float persistence) {',
    '  float value = 0.0;',
    '  float amplitude = 1.0;',
    '  float frequency = 1.0;',
    '  for (int i = 0; i < 8; i++) {',
    '    if (i >= octaves) break;',
    '    value += amplitude * noise(p * frequency);',
    '    amplitude *= persistence;',
    '    frequency *= lacunarity;',
    '  }',
    '  return value;',
    '}',
    '',
  ];

  // Add node-specific code
  for (const node of nodes) {
    const data = node.data as unknown as CustomNodeData;
    lines.push(`// ${data.label} (${node.id})`);
    switch (data.label) {
      case 'Noise Texture':
        lines.push('float noise_fac = fbm(vUv * 5.0, 6, 2.0, 0.5);');
        lines.push('vec3 noise_color = vec3(noise_fac);');
        break;
      case 'ColorRamp':
        lines.push('vec3 ramp_color = mix(vec3(0.05, 0.2, 0.05), vec3(0.8, 0.75, 0.4), noise_fac);');
        break;
      case 'Math (Multiply)':
        lines.push('float math_val = noise_fac * 0.8;');
        break;
      case 'Principled BSDF':
        lines.push('vec3 baseColor = ramp_color;');
        lines.push('float roughness = math_val;');
        lines.push('float metallic = 0.0;');
        break;
      case 'Voronoi Texture':
        lines.push('// Voronoi pattern omitted for brevity');
        break;
      case 'Terrain SDF':
        lines.push('// Terrain SDF evaluation omitted for brevity');
        break;
      case 'Material Output':
        lines.push('fragColor = vec4(baseColor, 1.0);');
        break;
    }
    lines.push('');
  }

  lines.push('void main() {');
  lines.push('  vec2 vUv = gl_FragCoord.xy / uResolution;');
  lines.push('  // ... node evaluation order ...');
  lines.push('}');

  return lines.join('\n');
}

// ============================================================================
// Material Preview Sphere
// ============================================================================

function MaterialPreviewSphere() {
  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.2, 0.5, 0.15),
      roughness: 0.6,
      metalness: 0.0,
    });
  }, []);

  return (
    <Sphere args={[1, 64, 64]} material={material}>
      <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={2} />
    </Sphere>
  );
}

// ============================================================================
// Node Palette
// ============================================================================

const PALETTE_CATEGORIES = [
  {
    name: 'Texture',
    items: ['Noise Texture', 'Voronoi Texture', 'Wave Texture', 'Musgrave Texture', 'Brick Texture'],
  },
  {
    name: 'Color',
    items: ['ColorRamp', 'Mix Color', 'Hue/Saturation', 'Bright/Contrast', 'Gamma'],
  },
  {
    name: 'Math',
    items: ['Math (Add)', 'Math (Multiply)', 'Math (Power)', 'Map Range', 'Clamp'],
  },
  {
    name: 'Shader',
    items: ['Principled BSDF', 'Diffuse BSDF', 'Glossy BSDF', 'Glass BSDF', 'Emission'],
  },
  {
    name: 'Geometry',
    items: ['Mesh Primitive', 'Subdivision Surface', 'Boolean', 'Transform', 'Instance'],
  },
  {
    name: 'Terrain',
    items: ['Terrain SDF', 'Erosion Filter', 'Biome Map', 'Height Output', 'Slope Map'],
  },
];

interface NodePaletteProps {
  onAddNode: (label: string, category: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

function NodePalette({ onAddNode, searchQuery, onSearchChange }: NodePaletteProps) {
  const filteredCategories = useMemo(() => {
    if (!searchQuery) return PALETTE_CATEGORIES;
    return PALETTE_CATEGORIES.map(cat => ({
      ...cat,
      items: cat.items.filter(item => item.toLowerCase().includes(searchQuery.toLowerCase())),
    })).filter(cat => cat.items.length > 0);
  }, [searchQuery]);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
        <input
          type="text"
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-200 placeholder:text-gray-500 focus:border-emerald-600 focus:outline-none"
        />
      </div>
      <div className="max-h-64 overflow-y-auto custom-scrollbar flex flex-col gap-2">
        {filteredCategories.map(cat => (
          <div key={cat.name}>
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              {CATEGORY_CONFIG[cat.name]?.icon}
              {cat.name}
            </div>
            <div className="flex flex-col gap-0.5">
              {cat.items.map(item => (
                <button
                  key={item}
                  onClick={() => onAddNode(item, cat.name)}
                  className="text-left text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-800 transition-colors"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main NodeSystemVisualizer
// ============================================================================

export default function NodeSystemVisualizer() {
  const initialGraph = useMemo(() => createExampleGraph(), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.edges);
  const [evaluated, setEvaluated] = useState(false);
  const [evalTime, setEvalTime] = useState(0);
  const [showGLSL, setShowGLSL] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [nodeMetrics, setNodeMetrics] = useState<Record<string, number>>({});
  const nextIdRef = useRef(100);

  const onConnect = useCallback(
    (params: Connection) => {
      const edgeStyle = { stroke: '#66cc66', strokeWidth: 2 };
      setEdges(eds => addEdge({ ...params, animated: true, style: edgeStyle }, eds));
    },
    [setEdges],
  );

  const handleEvaluate = useCallback(() => {
    const start = performance.now();

    // Simulate evaluation by marking nodes as evaluated with random times
    const metrics: Record<string, number> = {};
    const newNodes = nodes.map(node => {
      const t = Math.random() * 5 + 0.5;
      metrics[node.id] = t;
      return {
        ...node,
        data: {
          ...(node.data as Record<string, unknown>),
          evaluated: true,
          evalTime: t,
        },
      };
    });

    setNodes(newNodes);
    setNodeMetrics(metrics);
    setEvalTime(Math.round(performance.now() - start));
    setEvaluated(true);
  }, [nodes, setNodes]);

  const handleReset = useCallback(() => {
    const { nodes: newNodes, edges: newEdges } = createExampleGraph();
    setNodes(newNodes);
    setEdges(newEdges);
    setEvaluated(false);
    setEvalTime(0);
    setNodeMetrics({});
  }, [setNodes, setEdges]);

  const handleAddNode = useCallback(
    (label: string, category: string) => {
      const id = `n_${nextIdRef.current++}`;
      const config = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.Math;

      let inputs = [{ name: 'Input', type: 'float' }];
      let outputs = [{ name: 'Output', type: 'float' }];

      if (category === 'Shader') {
        inputs = [{ name: 'Color', type: 'color' }, { name: 'Roughness', type: 'float' }];
        outputs = [{ name: 'BSDF', type: 'shader' }];
      } else if (category === 'Color') {
        inputs = [{ name: 'Fac', type: 'float' }];
        outputs = [{ name: 'Color', type: 'color' }];
      } else if (category === 'Texture') {
        inputs = [{ name: 'Scale', type: 'float' }, { name: 'Detail', type: 'float' }];
        outputs = [{ name: 'Fac', type: 'float' }, { name: 'Color', type: 'color' }];
      } else if (category === 'Terrain') {
        inputs = [{ name: 'Frequency', type: 'float' }, { name: 'Amplitude', type: 'float' }];
        outputs = [{ name: 'SDF', type: 'float' }, { name: 'Normal', type: 'vector' }];
      }

      const newNode: Node = {
        id,
        type: 'custom',
        position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
        data: {
          label,
          category,
          inputs,
          outputs,
          evaluated: false,
        },
      };

      setNodes(nds => [...nds, newNode]);
    },
    [setNodes],
  );

  const glslCode = useMemo(() => generateGLSL(nodes, edges), [nodes, edges]);

  const totalEvalTime = useMemo(
    () => Object.values(nodeMetrics).reduce((a, b) => a + b, 0),
    [nodeMetrics],
  );

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      {/* Node Graph Editor */}
      <div className="flex-1 min-h-[400px] rounded-xl overflow-hidden border border-gray-700 bg-gray-950 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          style={{ backgroundColor: '#0a0a0a' }}
          connectionLineStyle={{ stroke: '#22c55e', strokeWidth: 2 }}
          defaultEdgeOptions={{ animated: true }}
        >
          <Controls className="bg-gray-800 border-gray-700 [&>button]:bg-gray-800 [&>button]:border-gray-700 [&>button]:text-gray-300 [&>button:hover]:bg-gray-700" />
          <MiniMap
            nodeColor={node => {
              const data = node.data as unknown as CustomNodeData;
              return CATEGORY_CONFIG[data.category]?.color ?? '#666';
            }}
            maskColor="rgba(0, 0, 0, 0.7)"
            style={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px' }}
          />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1a3a2a" />
        </ReactFlow>

        {/* Eval Stats Overlay */}
        <div className="absolute top-3 left-3 bg-gray-900/80 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-gray-300 border border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-medium">Node Graph</span>
          </div>
          <div>Nodes: {nodes.length}</div>
          <div>Connections: {edges.length}</div>
          {evaluated && (
            <>
              <div className="text-emerald-400 mt-1">Eval: {evalTime}ms</div>
              <div>Critical Path: {totalEvalTime.toFixed(1)}ms</div>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="absolute top-3 right-3 flex gap-2">
          <button
            onClick={handleEvaluate}
            className="bg-emerald-900/80 hover:bg-emerald-800/80 text-emerald-300 border border-emerald-700 rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            Evaluate
          </button>
          <button
            onClick={handleReset}
            className="bg-gray-900/80 hover:bg-gray-800/80 text-gray-300 border border-gray-700 rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* Side Panel */}
      <div className="lg:w-80 flex flex-col gap-3 overflow-y-auto max-h-[calc(100vh-120px)] pr-1 custom-scrollbar">
        {/* Material Preview */}
        <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
            <Box className="w-4 h-4 text-emerald-400" />
            Material Preview
          </h3>
          <div className="w-full h-48 rounded-lg overflow-hidden border border-gray-700">
            <Canvas camera={{ position: [0, 0, 3] }}>
              <ambientLight intensity={0.4} />
              <directionalLight position={[5, 5, 5]} intensity={1} />
              <Suspense fallback={null}>
                <MaterialPreviewSphere />
              </Suspense>
            </Canvas>
          </div>
        </div>

        {/* Node Palette */}
        <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            Node Palette
          </h3>
          <NodePalette onAddNode={handleAddNode} searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        </div>

        {/* Execution Metrics */}
        {evaluated && (
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              Execution Metrics
            </h3>
            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto custom-scrollbar">
              {nodes.map(node => {
                const data = node.data as unknown as CustomNodeData;
                const time = nodeMetrics[node.id];
                const config = CATEGORY_CONFIG[data.category] ?? CATEGORY_CONFIG.Math;
                return (
                  <div key={node.id} className="flex items-center justify-between text-xs bg-gray-800/50 rounded-md px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
                      <span className="text-gray-300">{data.label}</span>
                    </div>
                    <span className="text-gray-500 font-mono">{time?.toFixed(1) ?? '-'}ms</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* GLSL Output */}
        <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
              <Code2 className="w-4 h-4 text-emerald-400" />
              GLSL Output
            </h3>
            <button
              onClick={() => setShowGLSL(!showGLSL)}
              className="text-xs text-gray-500 hover:text-emerald-400 transition-colors"
            >
              {showGLSL ? 'Hide' : 'Show'}
            </button>
          </div>
          {showGLSL && (
            <pre className="text-[10px] text-gray-400 bg-gray-800 rounded-lg p-3 max-h-64 overflow-y-auto custom-scrollbar font-mono leading-relaxed">
              {glslCode}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
