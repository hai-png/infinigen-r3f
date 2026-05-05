'use client';

import React, { useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
  type NodeProps,
  type Node,
  MarkerType,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEditor } from '../EditorContext';
// Adapted from ../../../../infinigen-r3f/src/ to ../../../
import { SocketType } from '../../../core/nodes/core/socket-types';
import { nodeDefinitionRegistry } from '../../../core/nodes/core/node-definition-registry';
import type { InfinigenNodeData } from '../nodeGraphConstants';

// ---- Custom Node Components ----

function ShaderNode({ data, selected }: NodeProps<Node<InfinigenNodeData>>) {
  return (
    <div className={`px-3 py-2 rounded-lg border-2 min-w-[140px] ${selected ? 'border-emerald-400 shadow-lg shadow-emerald-400/20' : 'border-green-600'}`} style={{ background: 'rgba(22, 101, 52, 0.9)' }}>
      <div className="text-xs font-bold text-green-200 mb-1">{data.label}</div>
      <div className="flex justify-between gap-2">
        <div className="flex flex-col gap-1">
          {data.inputs.map((inp, i) => (
            <div key={i} className="flex items-center gap-1">
              <Handle type="target" position={Position.Left} id={inp.name} className="!w-2 !h-2 !bg-gray-400 !border-0 !min-w-[8px]" />
              <span className="text-[9px] text-gray-300">{inp.name}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1 items-end">
          {data.outputs.map((out, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-[9px] text-gray-300">{out.name}</span>
              <Handle type="source" position={Position.Right} id={out.name} className="!w-2 !h-2 !bg-green-400 !border-0 !min-w-[8px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GeometryNode({ data, selected }: NodeProps<Node<InfinigenNodeData>>) {
  return (
    <div className={`px-3 py-2 rounded-lg border-2 min-w-[140px] ${selected ? 'border-emerald-400 shadow-lg shadow-emerald-400/20' : 'border-blue-600'}`} style={{ background: 'rgba(30, 64, 175, 0.9)' }}>
      <div className="text-xs font-bold text-blue-200 mb-1">{data.label}</div>
      <div className="flex justify-between gap-2">
        <div className="flex flex-col gap-1">
          {data.inputs.map((inp, i) => (
            <div key={i} className="flex items-center gap-1">
              <Handle type="target" position={Position.Left} id={inp.name} className="!w-2 !h-2 !bg-cyan-400 !border-0 !min-w-[8px]" />
              <span className="text-[9px] text-gray-300">{inp.name}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1 items-end">
          {data.outputs.map((out, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-[9px] text-gray-300">{out.name}</span>
              <Handle type="source" position={Position.Right} id={out.name} className="!w-2 !h-2 !bg-cyan-400 !border-0 !min-w-[8px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TextureNode({ data, selected }: NodeProps<Node<InfinigenNodeData>>) {
  return (
    <div className={`px-3 py-2 rounded-lg border-2 min-w-[140px] ${selected ? 'border-emerald-400 shadow-lg shadow-emerald-400/20' : 'border-orange-600'}`} style={{ background: 'rgba(154, 52, 18, 0.9)' }}>
      <div className="text-xs font-bold text-orange-200 mb-1">{data.label}</div>
      <div className="flex justify-between gap-2">
        <div className="flex flex-col gap-1">
          {data.inputs.map((inp, i) => (
            <div key={i} className="flex items-center gap-1">
              <Handle type="target" position={Position.Left} id={inp.name} className="!w-2 !h-2 !bg-yellow-400 !border-0 !min-w-[8px]" />
              <span className="text-[9px] text-gray-300">{inp.name}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1 items-end">
          {data.outputs.map((out, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-[9px] text-gray-300">{out.name}</span>
              <Handle type="source" position={Position.Right} id={out.name} className="!w-2 !h-2 !bg-yellow-400 !border-0 !min-w-[8px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UtilityNode({ data, selected }: NodeProps<Node<InfinigenNodeData>>) {
  return (
    <div className={`px-3 py-2 rounded-lg border-2 min-w-[140px] ${selected ? 'border-emerald-400 shadow-lg shadow-emerald-400/20' : 'border-purple-600'}`} style={{ background: 'rgba(91, 33, 182, 0.85)' }}>
      <div className="text-xs font-bold text-purple-200 mb-1">{data.label}</div>
      <div className="flex justify-between gap-2">
        <div className="flex flex-col gap-1">
          {data.inputs.map((inp, i) => (
            <div key={i} className="flex items-center gap-1">
              <Handle type="target" position={Position.Left} id={inp.name} className="!w-2 !h-2 !bg-purple-300 !border-0 !min-w-[8px]" />
              <span className="text-[9px] text-gray-300">{inp.name}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1 items-end">
          {data.outputs.map((out, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-[9px] text-gray-300">{out.name}</span>
              <Handle type="source" position={Position.Right} id={out.name} className="!w-2 !h-2 !bg-purple-300 !border-0 !min-w-[8px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InputNode({ data, selected }: NodeProps<Node<InfinigenNodeData>>) {
  return (
    <div className={`px-3 py-2 rounded-lg border-2 min-w-[140px] ${selected ? 'border-emerald-400 shadow-lg shadow-emerald-400/20' : 'border-gray-500'}`} style={{ background: 'rgba(55, 65, 81, 0.9)' }}>
      <div className="text-xs font-bold text-gray-200 mb-1">{data.label}</div>
      <div className="flex flex-col gap-1 items-end">
        {data.outputs.map((out, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="text-[9px] text-gray-300">{out.name}</span>
            <Handle type="source" position={Position.Right} id={out.name} className="!w-2 !h-2 !bg-gray-300 !border-0 !min-w-[8px]" />
          </div>
        ))}
      </div>
    </div>
  );
}

function OutputNode({ data, selected }: NodeProps<Node<InfinigenNodeData>>) {
  return (
    <div className={`px-3 py-2 rounded-lg border-2 min-w-[140px] ${selected ? 'border-emerald-400 shadow-lg shadow-emerald-400/20' : 'border-red-600'}`} style={{ background: 'rgba(153, 27, 27, 0.9)' }}>
      <div className="text-xs font-bold text-red-200 mb-1">{data.label}</div>
      <div className="flex flex-col gap-1">
        {data.inputs.map((inp, i) => (
          <div key={i} className="flex items-center gap-1">
            <Handle type="target" position={Position.Left} id={inp.name} className="!w-2 !h-2 !bg-red-400 !border-0 !min-w-[8px]" />
            <span className="text-[9px] text-gray-300">{inp.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const nodeTypes = {
  shader: ShaderNode,
  geometry: GeometryNode,
  texture: TextureNode,
  utility: UtilityNode,
  input: InputNode,
  output: OutputNode,
};

// ---- Node Palette ----

function NodePalette() {
  const { addNode, categoryColors } = useEditor();

  const categories = useMemo(() => {
    const allDefs = nodeDefinitionRegistry.getAll();
    const catMap = new Map<string, { type: string; label: string }[]>();
    for (const def of allDefs) {
      const cat = def.category;
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push({ type: def.type, label: def.label });
    }
    return catMap;
  }, []);

  const [search, setSearch] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);

  const filteredCategories = useMemo(() => {
    const result = new Map<string, { type: string; label: string }[]>();
    for (const [cat, nodes] of categories) {
      const filtered = nodes.filter(n =>
        n.label.toLowerCase().includes(search.toLowerCase()) ||
        n.type.toLowerCase().includes(search.toLowerCase())
      );
      if (filtered.length > 0) {
        result.set(cat, selectedCategory && cat !== selectedCategory ? [] : filtered);
      }
    }
    return result;
  }, [categories, search, selectedCategory]);

  return (
    <Panel position="top-left" className="!m-1">
      <div className="bg-gray-900/95 rounded-lg border border-gray-700 shadow-xl w-56 max-h-[60vh] overflow-hidden flex flex-col">
        <div className="p-2 border-b border-gray-700">
          <input
            type="text"
            placeholder="Search nodes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-800 text-gray-200 text-xs px-2 py-1.5 rounded border border-gray-600 focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1 p-2 border-b border-gray-700">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`text-[10px] px-1.5 py-0.5 rounded ${!selectedCategory ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            All
          </button>
          {Array.from(categories.keys()).slice(0, 8).map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              className={`text-[10px] px-1.5 py-0.5 rounded ${selectedCategory === cat ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              {cat.slice(0, 6)}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto p-1 flex-1" style={{ maxHeight: '40vh' }}>
          {Array.from(filteredCategories.entries()).map(([cat, nodes]) => {
            if (nodes.length === 0) return null;
            const color = categoryColors[cat] ?? '#6b7280';
            return (
              <div key={cat} className="mb-1">
                <div className="text-[10px] font-bold px-1 py-0.5" style={{ color }}>{cat}</div>
                {nodes.map(n => (
                  <button
                    key={n.type}
                    onClick={() => addNode(n.type)}
                    className="w-full text-left text-[10px] text-gray-300 hover:bg-gray-700 px-2 py-0.5 rounded transition-colors"
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

// ---- Main Component ----

export default function NodeGraphView() {
  const {
    rfNodes, rfEdges, setRfNodes, setRfEdges,
    addNode, deleteNode, evaluateGraph, isEvaluating,
    evaluationResult, evalMode, setEvalMode, loadPreset, clearGraph,
    socketColors, selectedNodeId, setSelectedNodeId,
  } = useEditor();

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      const updated = applyNodeChanges(changes, rfNodes);
      setRfNodes(updated);
    },
    [rfNodes, setRfNodes],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      const updated = applyEdgeChanges(changes, rfEdges);
      setRfEdges(updated);
    },
    [rfEdges, setRfEdges],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (!connection.source || !connection.target) return;

      // Check for duplicate
      const duplicate = rfEdges.find(
        (e) => e.target === connection.target && e.targetHandle === connection.targetHandle,
      );
      if (duplicate) return;

      // Get socket color
      const sourceNode = rfNodes.find((n) => n.id === connection.source);
      const sourceData = sourceNode?.data as InfinigenNodeData | undefined;
      const outputSocket = sourceData?.outputs.find((o) => o.name === connection.sourceHandle);
      const socketColor = socketColors[outputSocket?.type ?? SocketType.ANY] ?? '#999';

      const newEdge = {
        id: `e-${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}`,
        source: connection.source,
        sourceHandle: connection.sourceHandle,
        target: connection.target,
        targetHandle: connection.targetHandle,
        type: 'smoothstep' as const,
        animated: true,
        style: { stroke: socketColor, strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: socketColor, width: 14, height: 14 },
      };
      setRfEdges([...rfEdges, newEdge]);
    },
    [rfNodes, rfEdges, setRfEdges, socketColors],
  );

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(node.id);
  }, [setSelectedNodeId]);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedNodeId) {
        deleteNode(selectedNodeId);
      }
    }
  }, [selectedNodeId, deleteNode]);

  return (
    <div className="w-full h-full bg-gray-950" onKeyDown={handleKeyDown} tabIndex={0}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={['Delete', 'Backspace']}
        className="!bg-gray-950"
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#333" gap={20} size={1} />
        <Controls className="!bg-gray-800 !border-gray-600 [&>button]:!bg-gray-800 [&>button]:!border-gray-600 [&>button]:!text-gray-300 [&>button:hover]:!bg-gray-700" />
        <MiniMap
          nodeColor={(n) => {
            const data = n.data as InfinigenNodeData;
            return data?.color ?? '#6b7280';
          }}
          maskColor="rgba(0,0,0,0.7)"
          className="!bg-gray-900 !border-gray-700"
        />

        <NodePalette />

        {/* Toolbar panel */}
        <Panel position="top-right" className="!m-1">
          <div className="bg-gray-900/95 rounded-lg border border-gray-700 shadow-xl p-2 flex flex-col gap-2">
            <div className="flex gap-1">
              <select
                value={evalMode}
                onChange={(e) => setEvalMode(e.target.value as any)}
                className="bg-gray-800 text-gray-200 text-xs px-2 py-1 rounded border border-gray-600 focus:outline-none focus:border-emerald-500"
              >
                <option value="MATERIAL">Material</option>
                <option value="GEOMETRY">Geometry</option>
                <option value="TEXTURE">Texture</option>
              </select>
              <button
                onClick={evaluateGraph}
                disabled={isEvaluating}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 text-white text-xs px-3 py-1 rounded transition-colors"
              >
                {isEvaluating ? '⏳' : '▶ Eval'}
              </button>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => loadPreset('basic_material')}
                className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-[10px] px-2 py-0.5 rounded transition-colors"
              >
                Basic Mat
              </button>
              <button
                onClick={() => loadPreset('terrain_material')}
                className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-[10px] px-2 py-0.5 rounded transition-colors"
              >
                Terrain Mat
              </button>
              <button
                onClick={() => loadPreset('scatter_system')}
                className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-[10px] px-2 py-0.5 rounded transition-colors"
              >
                Scatter
              </button>
              <button
                onClick={clearGraph}
                className="bg-red-900 hover:bg-red-800 text-gray-200 text-[10px] px-2 py-0.5 rounded transition-colors"
              >
                Clear
              </button>
            </div>
            {evaluationResult && (
              <div className="text-[10px] border-t border-gray-700 pt-1">
                {evaluationResult.errors.length > 0 && (
                  <div className="text-red-400">Errors: {evaluationResult.errors.length}</div>
                )}
                {evaluationResult.warnings.length > 0 && (
                  <div className="text-yellow-400">Warnings: {evaluationResult.warnings.length}</div>
                )}
                {evaluationResult.errors.length === 0 && (
                  <div className="text-emerald-400">✓ {evalMode} eval success</div>
                )}
              </div>
            )}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
