'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Mountain, GitBranch, ArrowLeftRight,
  Activity, Cpu, HardDrive, Monitor
} from 'lucide-react';

// Lazy-load heavy components to avoid SSR issues with Three.js / R3F
const TerrainVisualizer = dynamic(
  () => import('./compare/TerrainVisualizer'),
  {
    ssr: false,
    loading: () => <LoadingPlaceholder label="Loading Terrain Visualizer..." />,
  },
);

const NodeSystemVisualizer = dynamic(
  () => import('./compare/NodeSystemVisualizer'),
  {
    ssr: false,
    loading: () => <LoadingPlaceholder label="Loading Node System Visualizer..." />,
  },
);

const ComparisonPanel = dynamic(
  () => import('./compare/ComparisonPanel'),
  {
    ssr: false,
    loading: () => <LoadingPlaceholder label="Loading Comparison Panel..." />,
  },
);

// ============================================================================
// Loading Placeholder
// ============================================================================

function LoadingPlaceholder({ label }: { label: string }) {
  return (
    <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-gray-950 rounded-xl border border-gray-800">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-sm text-gray-400">{label}</p>
      </div>
    </div>
  );
}

// ============================================================================
// Tab configuration
// ============================================================================

type TabId = 'terrain' | 'nodes' | 'comparison';

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const TABS: TabConfig[] = [
  {
    id: 'terrain',
    label: 'Terrain System',
    icon: <Mountain className="w-4 h-4" />,
    description: '3D terrain generation with noise, erosion, tectonics, snow & water systems',
  },
  {
    id: 'nodes',
    label: 'Node System',
    icon: <GitBranch className="w-4 h-4" />,
    description: 'Visual node graph editor with live evaluation, material preview & GLSL output',
  },
  {
    id: 'comparison',
    label: 'Comparison',
    icon: <ArrowLeftRight className="w-4 h-4" />,
    description: 'Side-by-side R3F vs reference, feature parity checklist & determinism test',
  },
];

// ============================================================================
// Mock Performance Stats
// ============================================================================

function PerformanceBar() {
  return (
    <div className="flex items-center gap-4 px-4 py-1.5 bg-gray-900/50 border-t border-gray-800 text-[10px] text-gray-500">
      <div className="flex items-center gap-1">
        <Activity className="w-3 h-3 text-emerald-500" />
        <span>FPS: <span className="text-emerald-400">60</span></span>
      </div>
      <div className="flex items-center gap-1">
        <Cpu className="w-3 h-3 text-blue-400" />
        <span>CPU: <span className="text-blue-300">12%</span></span>
      </div>
      <div className="flex items-center gap-1">
        <HardDrive className="w-3 h-3 text-amber-400" />
        <span>Mem: <span className="text-amber-300">128MB</span></span>
      </div>
      <div className="flex items-center gap-1">
        <Monitor className="w-3 h-3 text-purple-400" />
        <span>Draw: <span className="text-purple-300">24</span></span>
      </div>
    </div>
  );
}

// ============================================================================
// Main CompareEditor Component
// ============================================================================

export default function CompareEditor() {
  const [activeTab, setActiveTab] = useState<TabId>('terrain');

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-900/50 border border-emerald-700 flex items-center justify-center">
              <Mountain className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-100">Infinigen-R3F Comparison Editor</h1>
              <p className="text-[10px] text-gray-500">Visual comparison between R3F output and original Infinigen reference</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Engine Active</span>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-gray-900/50 border-b border-gray-800 px-4">
        <div className="flex items-center gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all relative ${
                activeTab === tab.id
                  ? 'text-emerald-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.icon}
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-t-full" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Tab Description */}
      <div className="px-4 py-2 bg-gray-900/30 border-b border-gray-800/50">
        <p className="text-[11px] text-gray-500">
          {TABS.find(t => t.id === activeTab)?.description}
        </p>
      </div>

      {/* Content Area */}
      <main className="flex-1 p-4 overflow-hidden">
        {activeTab === 'terrain' && <TerrainVisualizer />}
        {activeTab === 'nodes' && <NodeSystemVisualizer />}
        {activeTab === 'comparison' && <ComparisonPanel />}
      </main>

      {/* Performance Bar */}
      <PerformanceBar />
    </div>
  );
}
