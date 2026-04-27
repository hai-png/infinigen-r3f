/**
 * Camera Rig UI - Phase 12
 * Cinematic camera rig controls with multi-camera support
 */

import React, { useState } from 'react';

export interface CameraRigConfig {
  id: string;
  name: string;
  type: 'single' | 'stereo' | 'multi' | 'orbital' | 'dolly';
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  aperture: number;
  focusDistance: number;
}

interface CameraRigUIProps {
  rigs: CameraRigConfig[];
  activeRigId?: string;
  onRigSelect?: (rigId: string) => void;
  onRigUpdate?: (rigId: string, updates: Partial<CameraRigConfig>) => void;
  onRigAdd?: () => void;
  onRigDelete?: (rigId: string) => void;
}

export const CameraRigUI: React.FC<CameraRigUIProps> = ({
  rigs,
  activeRigId,
  onRigSelect,
  onRigUpdate,
  onRigAdd,
  onRigDelete,
}) => {
  const [expandedRig, setExpandedRig] = useState<string | null>(null);

  const handleAddRig = () => {
    onRigAdd?.();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '12px',
        borderBottom: '1px solid #333',
        backgroundColor: '#1e1e1e',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
          🎥 Camera Rigs
        </h3>
        <button
          onClick={handleAddRig}
          style={{
            padding: '6px 12px',
            background: '#007acc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          + Add Rig
        </button>
      </div>

      {/* Rig List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {rigs.length === 0 ? (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: '#666',
            fontSize: '13px',
          }}>
            No camera rigs configured.<br />
            Click "Add Rig" to create one.
          </div>
        ) : (
          rigs.map((rig) => (
            <div
              key={rig.id}
              style={{
                borderBottom: '1px solid #333',
                backgroundColor: activeRigId === rig.id ? '#1a3a5c' : undefined,
              }}
            >
              {/* Rig Header */}
              <div
                onClick={() => {
                  onRigSelect?.(rig.id);
                  setExpandedRig(expandedRig === rig.id ? null : rig.id);
                }}
                style={{
                  padding: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '16px' }}>
                  {rig.type === 'stereo' ? '👓' : rig.type === 'orbital' ? '🔄' : rig.type === 'dolly' ? '🎬' : '📷'}
                </span>
                <span style={{ flex: 1, fontWeight: 500 }}>{rig.name}</span>
                <span style={{
                  fontSize: '11px',
                  padding: '2px 6px',
                  background: '#333',
                  borderRadius: '4px',
                  color: '#aaa',
                }}>
                  {rig.type}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRigDelete?.(rig.id);
                  }}
                  style={{
                    padding: '4px 8px',
                    background: 'transparent',
                    color: '#ff6b6b',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Rig Details */}
              {expandedRig === rig.id && (
                <div style={{
                  padding: '12px',
                  backgroundColor: '#1a1a1a',
                }}>
                  {/* Position */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '11px',
                      color: '#aaa',
                      marginBottom: '6px',
                    }}>
                      Position
                    </label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {(['x', 'y', 'z'] as const).map((axis, i) => (
                        <input
                          key={axis}
                          type="number"
                          value={rig.position[i]}
                          onChange={(e) => {
                            const newPos = [...rig.position] as [number, number, number];
                            newPos[i] = parseFloat(e.target.value);
                            onRigUpdate?.(rig.id, { position: newPos });
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

                  {/* Target */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '11px',
                      color: '#aaa',
                      marginBottom: '6px',
                    }}>
                      Target
                    </label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {(['x', 'y', 'z'] as const).map((axis, i) => (
                        <input
                          key={axis}
                          type="number"
                          value={rig.target[i]}
                          onChange={(e) => {
                            const newTarget = [...rig.target] as [number, number, number];
                            newTarget[i] = parseFloat(e.target.value);
                            onRigUpdate?.(rig.id, { target: newTarget });
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

                  {/* FOV */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '11px',
                      color: '#aaa',
                      marginBottom: '6px',
                    }}>
                      FOV: {rig.fov}°
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="120"
                      step="1"
                      value={rig.fov}
                      onChange={(e) => onRigUpdate?.(rig.id, { fov: parseInt(e.target.value) })}
                      style={{ width: '100%' }}
                    />
                  </div>

                  {/* Aperture */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '11px',
                      color: '#aaa',
                      marginBottom: '6px',
                    }}>
                      Aperture: f/{rig.aperture.toFixed(1)}
                    </label>
                    <input
                      type="range"
                      min="1.4"
                      max="22"
                      step="0.1"
                      value={rig.aperture}
                      onChange={(e) => onRigUpdate?.(rig.id, { aperture: parseFloat(e.target.value) })}
                      style={{ width: '100%' }}
                    />
                  </div>

                  {/* Focus Distance */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '11px',
                      color: '#aaa',
                      marginBottom: '6px',
                    }}>
                      Focus Distance: {rig.focusDistance.toFixed(1)}m
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="100"
                      step="0.1"
                      value={rig.focusDistance}
                      onChange={(e) => onRigUpdate?.(rig.id, { focusDistance: parseFloat(e.target.value) })}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CameraRigUI;
