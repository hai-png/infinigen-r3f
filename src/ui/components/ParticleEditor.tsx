/**
 * Particle Editor - Phase 12
 * Interactive particle system editor with real-time preview
 */

import React, { useState } from 'react';

export interface ParticleSystemConfig {
  id: string;
  name: string;
  emissionRate: number;
  lifetime: number;
  speed: number;
  spread: number;
  gravity: [number, number, number];
  size: number;
  colorStart: string;
  colorEnd: string;
  shape: 'point' | 'sphere' | 'box' | 'cone';
}

interface ParticleEditorProps {
  system: ParticleSystemConfig;
  onUpdate?: (system: ParticleSystemConfig) => void;
}

export const ParticleEditor: React.FC<ParticleEditorProps> = ({
  system,
  onUpdate,
}) => {
  const handleChange = (key: keyof ParticleSystemConfig, value: any) => {
    onUpdate?.({ ...system, [key]: value });
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
          ✨ Particle Editor
        </h3>
        <input
          type="text"
          value={system.name}
          onChange={(e) => handleChange('name', e.target.value)}
          style={{
            marginTop: '8px',
            width: '100%',
            padding: '6px',
            background: '#2d2d2d',
            border: '1px solid #3c3c3c',
            color: '#ccc',
            borderRadius: '4px',
          }}
        />
      </div>

      {/* Properties */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px',
      }}>
        {/* Emission Rate */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Emission Rate: {system.emissionRate}/s
          </label>
          <input
            type="range"
            min="0"
            max="1000"
            step="10"
            value={system.emissionRate}
            onChange={(e) => handleChange('emissionRate', parseInt(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        {/* Lifetime */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Lifetime: {system.lifetime.toFixed(1)}s
          </label>
          <input
            type="range"
            min="0.1"
            max="10"
            step="0.1"
            value={system.lifetime}
            onChange={(e) => handleChange('lifetime', parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        {/* Speed */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Speed: {system.speed.toFixed(1)}
          </label>
          <input
            type="range"
            min="0"
            max="50"
            step="0.5"
            value={system.speed}
            onChange={(e) => handleChange('speed', parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        {/* Spread */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Spread: {system.spread.toFixed(0)}°
          </label>
          <input
            type="range"
            min="0"
            max="180"
            step="5"
            value={system.spread}
            onChange={(e) => handleChange('spread', parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        {/* Gravity */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Gravity
          </label>
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['x', 'y', 'z'] as const).map((axis, i) => (
              <input
                key={axis}
                type="number"
                value={system.gravity[i]}
                onChange={(e) => {
                  const newGravity = [...system.gravity] as [number, number, number];
                  newGravity[i] = parseFloat(e.target.value);
                  handleChange('gravity', newGravity);
                }}
                style={{
                  flex: 1,
                  padding: '6px',
                  background: '#2d2d2d',
                  border: '1px solid #3c3c3c',
                  color: '#ccc',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
              />
            ))}
          </div>
        </div>

        {/* Size */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Particle Size: {system.size.toFixed(2)}
          </label>
          <input
            type="range"
            min="0.01"
            max="5"
            step="0.01"
            value={system.size}
            onChange={(e) => handleChange('size', parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        {/* Colors */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Start Color
          </label>
          <input
            type="color"
            value={system.colorStart}
            onChange={(e) => handleChange('colorStart', e.target.value)}
            style={{ width: '100%', height: '30px', border: 'none', cursor: 'pointer' }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            color: '#aaa',
            marginBottom: '6px',
          }}>
            End Color
          </label>
          <input
            type="color"
            value={system.colorEnd}
            onChange={(e) => handleChange('colorEnd', e.target.value)}
            style={{ width: '100%', height: '30px', border: 'none', cursor: 'pointer' }}
          />
        </div>

        {/* Shape */}
        <div>
          <label style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Emitter Shape
          </label>
          <select
            value={system.shape}
            onChange={(e) => handleChange('shape', e.target.value)}
            style={{
              width: '100%',
              padding: '6px',
              background: '#2d2d2d',
              border: '1px solid #3c3c3c',
              color: '#ccc',
              borderRadius: '4px',
            }}
          >
            <option value="point">Point</option>
            <option value="sphere">Sphere</option>
            <option value="box">Box</option>
            <option value="cone">Cone</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default ParticleEditor;
