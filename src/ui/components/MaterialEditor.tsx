/**
 * Material Editor - Phase 12
 * Interactive material property editor with real-time preview
 */

import React, { useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

export interface MaterialProperties {
  id: string;
  name: string;
  type: 'standard' | 'physical' | 'toon' | 'emissive';
  color: string;
  metalness: number;
  roughness: number;
  transmission?: number;
  thickness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  normalScale?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  sheen?: number;
  sheenColor?: string;
  ior?: number;
}

interface MaterialEditorProps {
  material: MaterialProperties;
  onUpdate?: (material: MaterialProperties) => void;
  onPreviewChange?: (previewType: string) => void;
}

const PreviewSphere: React.FC<{ material: MaterialProperties }> = ({ material }) => {
  const matRef = React.useRef<THREE.MeshStandardMaterial>(null);

  useEffect(() => {
    if (matRef.current) {
      matRef.current.color.set(material.color);
      matRef.current.metalness = material.metalness;
      matRef.current.roughness = material.roughness;
      
      if (material.transmission !== undefined) {
        (matRef.current as any).transmission = material.transmission;
      }
      if (material.thickness !== undefined) {
        (matRef.current as any).thickness = material.thickness;
      }
      if (material.clearcoat !== undefined) {
        (matRef.current as any).clearcoat = material.clearcoat;
      }
      if (material.clearcoatRoughness !== undefined) {
        (matRef.current as any).clearcoatRoughness = material.clearcoatRoughness;
      }
      if (material.sheen !== undefined) {
        (matRef.current as any).sheen = material.sheen;
      }
      if (material.ior !== undefined) {
        (matRef.current as any).ior = material.ior;
      }
    }
  }, [material]);

  return (
    <mesh position={[0, 0, 0]}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial
        ref={matRef}
        color={material.color}
        metalness={material.metalness}
        roughness={material.roughness}
      />
    </mesh>
  );
};

export const MaterialEditor: React.FC<MaterialEditorProps> = ({
  material,
  onUpdate,
  onPreviewChange,
}) => {
  const [localMaterial, setLocalMaterial] = useState<MaterialProperties>(material);
  const [previewType, setPreviewType] = useState('sphere');

  useEffect(() => {
    setLocalMaterial(material);
  }, [material]);

  const handleChange = (key: keyof MaterialProperties, value: any) => {
    const updated = { ...localMaterial, [key]: value };
    setLocalMaterial(updated);
    onUpdate?.(updated);
  };

  const handleSliderChange = (
    key: keyof MaterialProperties,
    value: number,
    min: number = 0,
    max: number = 1
  ) => {
    const clamped = Math.max(min, Math.min(max, value));
    handleChange(key, clamped);
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
          🎨 Material Editor
        </h3>
        <input
          type="text"
          value={localMaterial.name}
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

      {/* Preview Canvas */}
      <div style={{
        height: '200px',
        borderBottom: '1px solid #333',
        backgroundColor: '#1a1a1a',
      }}>
        <Canvas camera={{ position: [0, 0, 3], fov: 50 }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 5]} intensity={1} />
          <Environment preset="studio" />
          <PreviewSphere material={localMaterial} />
          <ContactShadows opacity={0.4} scale={10} blur={2} />
          <OrbitControls makeDefault />
        </Canvas>
        
        {/* Preview type selector */}
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          display: 'flex',
          gap: '4px',
        }}>
          {['sphere', 'cube', 'plane'].map((type) => (
            <button
              key={type}
              onClick={() => {
                setPreviewType(type);
                onPreviewChange?.(type);
              }}
              style={{
                padding: '4px 8px',
                background: previewType === type ? '#007acc' : '#333',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Properties Panel */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px',
      }}>
        {/* Base Color */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Base Color
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="color"
              value={localMaterial.color}
              onChange={(e) => handleChange('color', e.target.value)}
              style={{
                width: '40px',
                height: '30px',
                border: 'none',
                cursor: 'pointer',
              }}
            />
            <input
              type="text"
              value={localMaterial.color}
              onChange={(e) => handleChange('color', e.target.value)}
              style={{
                flex: 1,
                padding: '6px',
                background: '#2d2d2d',
                border: '1px solid #3c3c3c',
                color: '#ccc',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            />
          </div>
        </div>

        {/* Metalness */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Metalness: {localMaterial.metalness.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={localMaterial.metalness}
            onChange={(e) => handleSliderChange('metalness', parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        {/* Roughness */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Roughness: {localMaterial.roughness.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={localMaterial.roughness}
            onChange={(e) => handleSliderChange('roughness', parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        {/* Transmission (for glass-like materials) */}
        {localMaterial.type === 'physical' && (
          <>
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                color: '#aaa',
                marginBottom: '6px',
              }}>
                Transmission: {localMaterial.transmission?.toFixed(2) ?? '0.00'}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={localMaterial.transmission ?? 0}
                onChange={(e) => handleSliderChange('transmission', parseFloat(e.target.value))}
                style={{ width: '100%' }}
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
                Thickness: {localMaterial.thickness?.toFixed(2) ?? '0.00'}
              </label>
              <input
                type="range"
                min="0"
                max="10"
                step="0.1"
                value={localMaterial.thickness ?? 0}
                onChange={(e) => handleSliderChange('thickness', parseFloat(e.target.value), 0, 10)}
                style={{ width: '100%' }}
              />
            </div>
          </>
        )}

        {/* Clearcoat */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Clearcoat: {localMaterial.clearcoat?.toFixed(2) ?? '0.00'}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={localMaterial.clearcoat ?? 0}
            onChange={(e) => handleSliderChange('clearcoat', parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        {/* Sheen */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Sheen: {localMaterial.sheen?.toFixed(2) ?? '0.00'}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={localMaterial.sheen ?? 0}
            onChange={(e) => handleSliderChange('sheen', parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        {/* IOR */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            color: '#aaa',
            marginBottom: '6px',
          }}>
            Index of Refraction: {localMaterial.ior?.toFixed(2) ?? '1.50'}
          </label>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={localMaterial.ior ?? 1.5}
            onChange={(e) => handleSliderChange('ior', parseFloat(e.target.value), 1, 3)}
            style={{ width: '100%' }}
          />
        </div>
      </div>
    </div>
  );
};

export default MaterialEditor;
