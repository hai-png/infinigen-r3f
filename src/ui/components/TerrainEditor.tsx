/**
 * Terrain Editor - Phase 12
 * Interactive terrain manipulation tools with sculpting, painting, and erosion
 */

import React, { useState, useCallback } from 'react';

export interface TerrainBrush {
  type: 'sculpt' | 'smooth' | 'flatten' | 'noise' | 'paint';
  size: number;
  strength: number;
  falloff: 'constant' | 'linear' | 'smooth' | 'sharp';
}

export interface TerrainConfig {
  width: number;
  depth: number;
  resolution: number;
  heightScale: number;
  waterLevel: number;
}

interface TerrainEditorProps {
  terrainConfig: TerrainConfig;
  onUpdate?: (config: TerrainConfig) => void;
  onBrushApply?: (brush: TerrainBrush, position: [number, number]) => void;
}

export const TerrainEditor: React.FC<TerrainEditorProps> = ({
  terrainConfig,
  onUpdate,
  onBrushApply,
}) => {
  const [activeTool, setActiveTool] = useState<'sculpt' | 'smooth' | 'flatten' | 'paint'>('sculpt');
  const [brushSize, setBrushSize] = useState(5);
  const [brushStrength, setBrushStrength] = useState(0.5);
  const [falloff, setFalloff] = useState<TerrainBrush['falloff']>('smooth');

  const handleConfigChange = (key: keyof TerrainConfig, value: number) => {
    const updated = { ...terrainConfig, [key]: value };
    onUpdate?.(updated);
  };

  const brush: TerrainBrush = {
    type: activeTool === 'paint' ? 'paint' : activeTool,
    size: brushSize,
    strength: brushStrength,
    falloff,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '12px',
        borderBottom: '1px solid #333',
        backgroundColor: '#1e1e1e',
      }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
          🏔️ Terrain Editor
        </h3>
      </div>

      {/* Tool Palette */}
      <div style={{
        padding: '12px',
        borderBottom: '1px solid #333',
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
      }}>
        {[
          { id: 'sculpt', icon: '⛰️', label: 'Sculpt' },
          { id: 'smooth', icon: '🌊', label: 'Smooth' },
          { id: 'flatten', icon: '📏', label: 'Flatten' },
          { id: 'paint', icon: '🎨', label: 'Paint' },
        ].map((tool) => (
          <button
            key={tool.id}
            onClick={() => setActiveTool(tool.id as any)}
            style={{
              padding: '8px 12px',
              background: activeTool === tool.id ? '#007acc' : '#333',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
            }}
          >
            <span>{tool.icon}</span>
            <span>{tool.label}</span>
          </button>
        ))}
      </div>

      {/* Brush Settings */}
      <div style={{
        padding: '12px',
        borderBottom: '1px solid #333',
      }}>
        <h4 style={{
          margin: '0 0 12px 0',
          fontSize: '12px',
          fontWeight: 600,
          color: '#aaa',
        }}>
          Brush Settings
        </h4>

        {/* Brush Size */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Size: {brushSize.toFixed(1)}
          </label>
          <input
            type="range"
            min="1"
            max="20"
            step="0.5"
            value={brushSize}
            onChange={(e) => setBrushSize(parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        {/* Brush Strength */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Strength: {(brushStrength * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min="0.01"
            max="1"
            step="0.01"
            value={brushStrength}
            onChange={(e) => setBrushStrength(parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        {/* Falloff */}
        <div>
          <label style={{
            display: 'block',
            fontSize: '11px',
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Falloff
          </label>
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['constant', 'linear', 'smooth', 'sharp'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFalloff(type)}
                style={{
                  flex: 1,
                  padding: '6px',
                  background: falloff === type ? '#007acc' : '#333',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '10px',
                  textTransform: 'capitalize',
                }}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Terrain Parameters */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px',
      }}>
        <h4 style={{
          margin: '0 0 12px 0',
          fontSize: '12px',
          fontWeight: 600,
          color: '#aaa',
        }}>
          Terrain Parameters
        </h4>

        {/* Width */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Width: {terrainConfig.width.toFixed(0)}m
          </label>
          <input
            type="range"
            min="10"
            max="500"
            step="10"
            value={terrainConfig.width}
            onChange={(e) => handleConfigChange('width', parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        {/* Depth */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Depth: {terrainConfig.depth.toFixed(0)}m
          </label>
          <input
            type="range"
            min="10"
            max="500"
            step="10"
            value={terrainConfig.depth}
            onChange={(e) => handleConfigChange('depth', parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        {/* Resolution */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Resolution: {terrainConfig.resolution}
          </label>
          <select
            value={terrainConfig.resolution}
            onChange={(e) => handleConfigChange('resolution', parseInt(e.target.value))}
            style={{
              width: '100%',
              padding: '6px',
              background: '#2d2d2d',
              border: '1px solid #3c3c3c',
              color: '#ccc',
              borderRadius: '4px',
            }}
          >
            <option value={64}>64 × 64 (Low)</option>
            <option value={128}>128 × 128 (Medium)</option>
            <option value={256}>256 × 256 (High)</option>
            <option value={512}>512 × 512 (Ultra)</option>
          </select>
        </div>

        {/* Height Scale */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Max Height: {terrainConfig.heightScale.toFixed(0)}m
          </label>
          <input
            type="range"
            min="10"
            max="500"
            step="10"
            value={terrainConfig.heightScale}
            onChange={(e) => handleConfigChange('heightScale', parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        {/* Water Level */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Water Level: {terrainConfig.waterLevel.toFixed(1)}m
          </label>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={terrainConfig.waterLevel}
            onChange={(e) => handleConfigChange('waterLevel', parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* Info Panel */}
      <div style={{
        padding: '12px',
        borderTop: '1px solid #333',
        backgroundColor: '#1a1a1a',
        fontSize: '11px',
        color: '#888',
      }}>
        <div><strong>Tip:</strong> Hold Shift while sculpting to lower terrain</div>
        <div><strong>Tip:</strong> Use Ctrl+Z to undo last stroke</div>
      </div>
    </div>
  );
};

export default TerrainEditor;
