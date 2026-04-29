import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Scene Editor - Phase 12
 * WYSIWYG editor for scene manipulation
 */
import { useState, useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls, GridHelper, AxesHelper } from '@react-three/drei';
import * as THREE from 'three';
const EditableObject = ({ object, isSelected, onSelect, isTransformMode, transformMode, onUpdate }) => {
    const meshRef = useRef(null);
    if (!object.visible)
        return null;
    const handleClick = (e) => {
        e.stopPropagation();
        if (!object.locked) {
            onSelect();
        }
    };
    const handleChangeEnd = (e) => {
        if (meshRef.current && isTransformMode) {
            const updates = {};
            if (transformMode === 'translate') {
                updates.position = [
                    meshRef.current.position.x,
                    meshRef.current.position.y,
                    meshRef.current.position.z,
                ];
            }
            else if (transformMode === 'rotate') {
                updates.rotation = [
                    meshRef.current.rotation.x,
                    meshRef.current.rotation.y,
                    meshRef.current.rotation.z,
                ];
            }
            else if (transformMode === 'scale') {
                updates.scale = [
                    meshRef.current.scale.x,
                    meshRef.current.scale.y,
                    meshRef.current.scale.z,
                ];
            }
            onUpdate(updates);
        }
    };
    return (_jsxs(_Fragment, { children: [_jsxs("mesh", { ref: meshRef, position: object.position, rotation: object.rotation, scale: object.scale, onClick: handleClick, children: [isTransformMode && isSelected ? (_jsx(TransformControls, { mode: transformMode, onMouseUp: handleChangeEnd })) : null, _jsx("boxGeometry", { args: [1, 1, 1] }), _jsx("meshStandardMaterial", { color: isSelected ? '#007acc' : '#4ec9b0', transparent: true, opacity: 0.7, wireframe: !isSelected }), isSelected && (_jsxs("lineSegments", { children: [_jsx("edgesGeometry", { args: [new THREE.BoxGeometry(1, 1, 1)] }), _jsx("lineBasicMaterial", { color: "#007acc", linewidth: 2 })] }))] }), isSelected && (_jsx("sprite", { position: [object.position[0], object.position[1] + 1, object.position[2]], children: _jsx("spriteMaterial", { children: _jsx("canvasTexture", { attach: "map", image: (() => {
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
                        })() }) }) }))] }));
};
const SceneContent = ({ objects, selectedObjectId, onObjectSelect, onObjectUpdate, isTransformMode, transformMode, showGrid, showAxes, gridDivisions, gridSize, }) => {
    const { camera } = useThree();
    useEffect(() => {
        camera.position.set(5, 5, 5);
        camera.lookAt(0, 0, 0);
    }, [camera]);
    return (_jsxs(_Fragment, { children: [_jsx("ambientLight", { intensity: 0.5 }), _jsx("directionalLight", { position: [5, 5, 5], intensity: 1, castShadow: true }), showGrid && _jsx(GridHelper, { args: [gridSize, gridDivisions] }), showAxes && _jsx(AxesHelper, { args: [2] }), objects.map(object => (_jsx(EditableObject, { object: object, isSelected: object.id === selectedObjectId, onSelect: () => onObjectSelect(object.id), isTransformMode: isTransformMode, transformMode: transformMode, onUpdate: (updates) => onObjectUpdate(object.id, updates) }, object.id))), _jsxs("mesh", { rotation: [-Math.PI / 2, 0, 0], position: [0, -0.01, 0], onClick: (e) => {
                    e.stopPropagation();
                    onObjectSelect('');
                }, children: [_jsx("planeGeometry", { args: [100, 100] }), _jsx("meshBasicMaterial", { transparent: true, opacity: 0 })] })] }));
};
export const SceneEditor = ({ objects, selectedObjectId, onObjectSelect, onObjectUpdate, onObjectAdd, onObjectDelete, showGrid = true, showAxes = true, gridDivisions = 10, gridSize = 10, }) => {
    const [isTransformMode, setIsTransformMode] = useState(false);
    const [transformMode, setTransformMode] = useState('translate');
    const [viewMode, setViewMode] = useState('perspective');
    const handleKeyDown = useEffect(() => {
        const handleKey = (e) => {
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
    const changeView = (mode) => {
        setViewMode(mode);
        // View change logic would be handled by camera controls
    };
    return (_jsxs("div", { style: { width: '100%', height: '100%', position: 'relative' }, children: [_jsxs("div", { style: {
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
                }, children: [_jsx("button", { onClick: () => setIsTransformMode(!isTransformMode), style: {
                            padding: '6px 12px',
                            background: isTransformMode ? '#007acc' : '#333',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                        }, children: isTransformMode ? '✏️ Edit' : '👁️ View' }), isTransformMode && (_jsxs(_Fragment, { children: [_jsx("button", { onClick: () => setTransformMode('translate'), style: {
                                    padding: '6px 12px',
                                    background: transformMode === 'translate' ? '#007acc' : '#333',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                }, children: "\u2195\uFE0F Move" }), _jsx("button", { onClick: () => setTransformMode('rotate'), style: {
                                    padding: '6px 12px',
                                    background: transformMode === 'rotate' ? '#007acc' : '#333',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                }, children: "\uD83D\uDD04 Rotate" }), _jsx("button", { onClick: () => setTransformMode('scale'), style: {
                                    padding: '6px 12px',
                                    background: transformMode === 'scale' ? '#007acc' : '#333',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                }, children: "\u2921 Scale" })] })), _jsx("div", { style: { width: '1px', background: '#555', margin: '0 4px' } }), _jsx("button", { onClick: () => changeView('perspective'), style: {
                            padding: '6px 12px',
                            background: viewMode === 'perspective' ? '#007acc' : '#333',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                        }, children: "Perspective" }), _jsx("button", { onClick: () => changeView('top'), style: {
                            padding: '6px 12px',
                            background: viewMode === 'top' ? '#007acc' : '#333',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                        }, children: "Top" }), _jsx("button", { onClick: () => changeView('front'), style: {
                            padding: '6px 12px',
                            background: viewMode === 'front' ? '#007acc' : '#333',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                        }, children: "Front" })] }), _jsxs(Canvas, { shadows: true, camera: { position: [5, 5, 5], fov: 50 }, children: [_jsx(SceneContent, { objects: objects, selectedObjectId: selectedObjectId, onObjectSelect: onObjectSelect || (() => { }), onObjectUpdate: onObjectUpdate || (() => { }), isTransformMode: isTransformMode, transformMode: transformMode, showGrid: showGrid, showAxes: showAxes, gridDivisions: gridDivisions, gridSize: gridSize }), _jsx(OrbitControls, { makeDefault: true })] }), _jsxs("div", { style: {
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
                }, children: [_jsx("div", { style: { fontWeight: 'bold', marginBottom: '6px', color: 'white' }, children: "\u2328\uFE0F Shortcuts" }), _jsxs("div", { children: [_jsx("strong", { children: "T" }), " - Translate mode"] }), _jsxs("div", { children: [_jsx("strong", { children: "R" }), " - Rotate mode"] }), _jsxs("div", { children: [_jsx("strong", { children: "S" }), " - Scale mode"] }), _jsxs("div", { children: [_jsx("strong", { children: "Esc" }), " - Exit edit mode"] }), _jsxs("div", { children: [_jsx("strong", { children: "Delete" }), " - Remove selected"] })] })] }));
};
export default SceneEditor;
//# sourceMappingURL=SceneEditor.js.map