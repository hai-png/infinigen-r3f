/**
 * Scene Editor - Phase 12
 * WYSIWYG editor for scene manipulation
 */

import React, { useState, useRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, TransformControls, GridHelper, AxesHelper } from '@react-three/drei';
import * as THREE from 'three';

export interface SceneObject {
  id: string;
  type: 'mesh' | 'light' | 'camera';
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  visible: boolean;
  locked: boolean;
  tags?: string[];
}

interface SceneEditorProps {
  objects: SceneObject[];
  selectedObjectId?: string;
  onObjectSelect?: (objectId: string) => void;
  onObjectUpdate?: (objectId: string, updates: Partial<SceneObject>) => void;
  onObjectAdd?: (object: Omit<SceneObject, 'id'>) => void;
  onObjectDelete?: (objectId: string) => void;
  showGrid?: boolean;
  showAxes?: boolean;
  gridDivisions?: number;
  gridSize?: number;
}

const EditableObject: React.FC<{
  object: SceneObject;
  isSelected: boolean;
  onSelect: () => void;
  isTransformMode: boolean;
  transformMode: 'translate' | 'rotate' | 'scale';
  onUpdate: (updates: Partial<SceneObject>) => void;
}> = ({ 
  object, 
  isSelected, 
  onSelect, 
  isTransformMode,
  transformMode,
  onUpdate 
}) => {
  const meshRef = useRef<THREE.Mesh>(null);

  if (!object.visible) return null;

  const handleClick = (e: THREE.Event) => {
    e.stopPropagation();
    if (!object.locked) {
      onSelect();
    }
  };

  const handleChangeEnd = (e: any) => {
    if (meshRef.current && isTransformMode) {
      const updates: Partial<SceneObject> = {};
      
      if (transformMode === 'translate') {
        updates.position = [
          meshRef.current.position.x,
          meshRef.current.position.y,
          meshRef.current.position.z,
        ];
      } else if (transformMode === 'rotate') {
        updates.rotation = [
          meshRef.current.rotation.x,
          meshRef.current.rotation.y,
          meshRef.current.rotation.z,
        ];
      } else if (transformMode === 'scale') {
        updates.scale = [
          meshRef.current.scale.x,
          meshRef.current.scale.y,
          meshRef.current.scale.z,
        ];
      }
      
      onUpdate(updates);
    }
  };

  return (
    <>
      <mesh
        ref={meshRef}
        position={object.position}
        rotation={object.rotation}
        scale={object.scale}
        onClick={handleClick}
      >
        {isTransformMode && isSelected ? (
          <TransformControls
            mode={transformMode}
            onMouseUp={handleChangeEnd}
          />
        ) : null}
        
        {/* Placeholder geometry for editing */}
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={isSelected ? '#007acc' : '#4ec9b0'}
          transparent
          opacity={0.7}
          wireframe={!isSelected}
        />
        
        {/* Selection highlight */}
        {isSelected && (
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(1, 1, 1)]} />
            <lineBasicMaterial color="#007acc" linewidth={2} />
          </lineSegments>
        )}
      </mesh>
      
      {/* Object label */}
      {isSelected && (
        <sprite position={[object.position[0], object.position[1] + 1, object.position[2]]}>
          <spriteMaterial>
            <canvasTexture
              attach="map"
              image={(() => {
                const canvas = document.createElement('canvas');
                canvas.width = 256;
                canvas.height = 64;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                  ctx.fillRect(0, 0, 256, 64);
                  ctx.fillStyle = 'white';
                  ctx.font = '24px monospace';
                  ctx.textAlign = 'center';
                  ctx.fillText(object.name, 128, 40);
                }
                return canvas;
              })()}
            />
          </spriteMaterial>
        </sprite>
      )}
    </>
  );
};

const SceneContent: React.FC<{
  objects: SceneObject[];
  selectedObjectId?: string;
  onObjectSelect: (objectId: string) => void;
  onObjectUpdate: (objectId: string, updates: Partial<SceneObject>) => void;
  isTransformMode: boolean;
  transformMode: 'translate' | 'rotate' | 'scale';
  showGrid: boolean;
  showAxes: boolean;
  gridDivisions: number;
  gridSize: number;
}> = ({
  objects,
  selectedObjectId,
  onObjectSelect,
  onObjectUpdate,
  isTransformMode,
  transformMode,
  showGrid,
  showAxes,
  gridDivisions,
  gridSize,
}) => {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1} castShadow />
      
      {/* Helpers */}
      {showGrid && <GridHelper args={[gridSize, gridDivisions]} />}
      {showAxes && <AxesHelper args={[2]} />}
      
      {/* Objects */}
      {objects.map(object => (
        <EditableObject
          key={object.id}
          object={object}
          isSelected={object.id === selectedObjectId}
          onSelect={() => onObjectSelect(object.id)}
          isTransformMode={isTransformMode}
          transformMode={transformMode}
          onUpdate={(updates) => onObjectUpdate(object.id, updates)}
        />
      ))}
      
      {/* Background click to deselect */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onObjectSelect('');
        }}
      >
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </>
  );
};

export const SceneEditor: React.FC<SceneEditorProps> = ({
  objects,
  selectedObjectId,
  onObjectSelect,
  onObjectUpdate,
  onObjectAdd,
  onObjectDelete,
  showGrid = true,
  showAxes = true,
  gridDivisions = 10,
  gridSize = 10,
}) => {
  const [isTransformMode, setIsTransformMode] = useState(false);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [viewMode, setViewMode] = useState<'perspective' | 'top' | 'front' | 'side'>('perspective');

  const handleKeyDown = useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case 't':
          setTransformMode('translate');
          setIsTransformMode(true);
          break;
        case 'r':
          setTransformMode('rotate');
          setIsTransformMode(true);
          break;
        case 's':
          setTransformMode('scale');
          setIsTransformMode(true);
          break;
        case 'escape':
          setIsTransformMode(false);
          break;
        case 'delete':
        case 'backspace':
          if (selectedObjectId) {
            onObjectDelete?.(selectedObjectId);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedObjectId, onObjectDelete]);

  const changeView = (mode: typeof viewMode) => {
    setViewMode(mode);
    // View change logic would be handled by camera controls
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Toolbar */}
      <div style={{
        position: 'absolute',
        top: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderRadius: '8px',
        padding: '8px',
        display: 'flex',
        gap: '8px',
        zIndex: 100,
      }}>
        <button
          onClick={() => setIsTransformMode(!isTransformMode)}
          style={{
            padding: '6px 12px',
            background: isTransformMode ? '#007acc' : '#333',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {isTransformMode ? '✏️ Edit' : '👁️ View'}
        </button>
        
        {isTransformMode && (
          <>
            <button
              onClick={() => setTransformMode('translate')}
              style={{
                padding: '6px 12px',
                background: transformMode === 'translate' ? '#007acc' : '#333',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              ↕️ Move
            </button>
            <button
              onClick={() => setTransformMode('rotate')}
              style={{
                padding: '6px 12px',
                background: transformMode === 'rotate' ? '#007acc' : '#333',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              🔄 Rotate
            </button>
            <button
              onClick={() => setTransformMode('scale')}
              style={{
                padding: '6px 12px',
                background: transformMode === 'scale' ? '#007acc' : '#333',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              ⤡ Scale
            </button>
          </>
        )}
        
        <div style={{ width: '1px', background: '#555', margin: '0 4px' }} />
        
        <button
          onClick={() => changeView('perspective')}
          style={{
            padding: '6px 12px',
            background: viewMode === 'perspective' ? '#007acc' : '#333',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Perspective
        </button>
        <button
          onClick={() => changeView('top')}
          style={{
            padding: '6px 12px',
            background: viewMode === 'top' ? '#007acc' : '#333',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Top
        </button>
        <button
          onClick={() => changeView('front')}
          style={{
            padding: '6px 12px',
            background: viewMode === 'front' ? '#007acc' : '#333',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Front
        </button>
      </div>

      {/* 3D Canvas */}
      <Canvas shadows camera={{ position: [5, 5, 5], fov: 50 }}>
        <SceneContent
          objects={objects}
          selectedObjectId={selectedObjectId}
          onObjectSelect={onObjectSelect || (() => {})}
          onObjectUpdate={onObjectUpdate || (() => {})}
          isTransformMode={isTransformMode}
          transformMode={transformMode}
          showGrid={showGrid}
          showAxes={showAxes}
          gridDivisions={gridDivisions}
          gridSize={gridSize}
        />
        <OrbitControls makeDefault />
      </Canvas>

      {/* Help overlay */}
      <div style={{
        position: 'absolute',
        bottom: 10,
        left: 10,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        padding: '12px',
        borderRadius: '6px',
        fontSize: '11px',
        color: '#aaa',
        fontFamily: 'monospace',
        zIndex: 100,
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '6px', color: 'white' }}>
          ⌨️ Shortcuts
        </div>
        <div><strong>T</strong> - Translate mode</div>
        <div><strong>R</strong> - Rotate mode</div>
        <div><strong>S</strong> - Scale mode</div>
        <div><strong>Esc</strong> - Exit edit mode</div>
        <div><strong>Delete</strong> - Remove selected</div>
      </div>
    </div>
  );
};

export default SceneEditor;
