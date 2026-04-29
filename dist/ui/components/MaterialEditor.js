import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Material Editor - Phase 12
 * Interactive material property editor with real-time preview
 */
import React, { useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
const PreviewSphere = ({ material }) => {
    const matRef = React.useRef(null);
    useEffect(() => {
        if (matRef.current) {
            matRef.current.color.set(material.color);
            matRef.current.metalness = material.metalness;
            matRef.current.roughness = material.roughness;
            if (material.transmission !== undefined) {
                matRef.current.transmission = material.transmission;
            }
            if (material.thickness !== undefined) {
                matRef.current.thickness = material.thickness;
            }
            if (material.clearcoat !== undefined) {
                matRef.current.clearcoat = material.clearcoat;
            }
            if (material.clearcoatRoughness !== undefined) {
                matRef.current.clearcoatRoughness = material.clearcoatRoughness;
            }
            if (material.sheen !== undefined) {
                matRef.current.sheen = material.sheen;
            }
            if (material.ior !== undefined) {
                matRef.current.ior = material.ior;
            }
        }
    }, [material]);
    return (_jsxs("mesh", { position: [0, 0, 0], children: [_jsx("sphereGeometry", { args: [1, 64, 64] }), _jsx("meshStandardMaterial", { ref: matRef, color: material.color, metalness: material.metalness, roughness: material.roughness })] }));
};
export const MaterialEditor = ({ material, onUpdate, onPreviewChange, }) => {
    const [localMaterial, setLocalMaterial] = useState(material);
    const [previewType, setPreviewType] = useState('sphere');
    useEffect(() => {
        setLocalMaterial(material);
    }, [material]);
    const handleChange = (key, value) => {
        const updated = { ...localMaterial, [key]: value };
        setLocalMaterial(updated);
        onUpdate?.(updated);
    };
    const handleSliderChange = (key, value, min = 0, max = 1) => {
        const clamped = Math.max(min, Math.min(max, value));
        handleChange(key, clamped);
    };
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', height: '100%' }, children: [_jsxs("div", { style: {
                    padding: '12px',
                    borderBottom: '1px solid #333',
                    backgroundColor: '#1e1e1e',
                }, children: [_jsx("h3", { style: { margin: 0, fontSize: '14px', fontWeight: 600 }, children: "\uD83C\uDFA8 Material Editor" }), _jsx("input", { type: "text", value: localMaterial.name, onChange: (e) => handleChange('name', e.target.value), style: {
                            marginTop: '8px',
                            width: '100%',
                            padding: '6px',
                            background: '#2d2d2d',
                            border: '1px solid #3c3c3c',
                            color: '#ccc',
                            borderRadius: '4px',
                        } })] }), _jsxs("div", { style: {
                    height: '200px',
                    borderBottom: '1px solid #333',
                    backgroundColor: '#1a1a1a',
                }, children: [_jsxs(Canvas, { camera: { position: [0, 0, 3], fov: 50 }, children: [_jsx("ambientLight", { intensity: 0.5 }), _jsx("directionalLight", { position: [5, 5, 5], intensity: 1 }), _jsx(Environment, { preset: "studio" }), _jsx(PreviewSphere, { material: localMaterial }), _jsx(ContactShadows, { opacity: 0.4, scale: 10, blur: 2 }), _jsx(OrbitControls, { makeDefault: true })] }), _jsx("div", { style: {
                            position: 'absolute',
                            top: '10px',
                            right: '10px',
                            display: 'flex',
                            gap: '4px',
                        }, children: ['sphere', 'cube', 'plane'].map((type) => (_jsx("button", { onClick: () => {
                                setPreviewType(type);
                                onPreviewChange?.(type);
                            }, style: {
                                padding: '4px 8px',
                                background: previewType === type ? '#007acc' : '#333',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '11px',
                            }, children: type.charAt(0).toUpperCase() + type.slice(1) }, type))) })] }), _jsxs("div", { style: {
                    flex: 1,
                    overflowY: 'auto',
                    padding: '12px',
                }, children: [_jsxs("div", { style: { marginBottom: '16px' }, children: [_jsx("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: "Base Color" }), _jsxs("div", { style: { display: 'flex', gap: '8px', alignItems: 'center' }, children: [_jsx("input", { type: "color", value: localMaterial.color, onChange: (e) => handleChange('color', e.target.value), style: {
                                            width: '40px',
                                            height: '30px',
                                            border: 'none',
                                            cursor: 'pointer',
                                        } }), _jsx("input", { type: "text", value: localMaterial.color, onChange: (e) => handleChange('color', e.target.value), style: {
                                            flex: 1,
                                            padding: '6px',
                                            background: '#2d2d2d',
                                            border: '1px solid #3c3c3c',
                                            color: '#ccc',
                                            borderRadius: '4px',
                                            fontFamily: 'monospace',
                                            fontSize: '12px',
                                        } })] })] }), _jsxs("div", { style: { marginBottom: '16px' }, children: [_jsxs("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: ["Metalness: ", localMaterial.metalness.toFixed(2)] }), _jsx("input", { type: "range", min: "0", max: "1", step: "0.01", value: localMaterial.metalness, onChange: (e) => handleSliderChange('metalness', parseFloat(e.target.value)), style: { width: '100%' } })] }), _jsxs("div", { style: { marginBottom: '16px' }, children: [_jsxs("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: ["Roughness: ", localMaterial.roughness.toFixed(2)] }), _jsx("input", { type: "range", min: "0", max: "1", step: "0.01", value: localMaterial.roughness, onChange: (e) => handleSliderChange('roughness', parseFloat(e.target.value)), style: { width: '100%' } })] }), localMaterial.type === 'physical' && (_jsxs(_Fragment, { children: [_jsxs("div", { style: { marginBottom: '16px' }, children: [_jsxs("label", { style: {
                                            display: 'block',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            color: '#aaa',
                                            marginBottom: '6px',
                                        }, children: ["Transmission: ", localMaterial.transmission?.toFixed(2) ?? '0.00'] }), _jsx("input", { type: "range", min: "0", max: "1", step: "0.01", value: localMaterial.transmission ?? 0, onChange: (e) => handleSliderChange('transmission', parseFloat(e.target.value)), style: { width: '100%' } })] }), _jsxs("div", { style: { marginBottom: '16px' }, children: [_jsxs("label", { style: {
                                            display: 'block',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            color: '#aaa',
                                            marginBottom: '6px',
                                        }, children: ["Thickness: ", localMaterial.thickness?.toFixed(2) ?? '0.00'] }), _jsx("input", { type: "range", min: "0", max: "10", step: "0.1", value: localMaterial.thickness ?? 0, onChange: (e) => handleSliderChange('thickness', parseFloat(e.target.value), 0, 10), style: { width: '100%' } })] })] })), _jsxs("div", { style: { marginBottom: '16px' }, children: [_jsxs("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: ["Clearcoat: ", localMaterial.clearcoat?.toFixed(2) ?? '0.00'] }), _jsx("input", { type: "range", min: "0", max: "1", step: "0.01", value: localMaterial.clearcoat ?? 0, onChange: (e) => handleSliderChange('clearcoat', parseFloat(e.target.value)), style: { width: '100%' } })] }), _jsxs("div", { style: { marginBottom: '16px' }, children: [_jsxs("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: ["Sheen: ", localMaterial.sheen?.toFixed(2) ?? '0.00'] }), _jsx("input", { type: "range", min: "0", max: "1", step: "0.01", value: localMaterial.sheen ?? 0, onChange: (e) => handleSliderChange('sheen', parseFloat(e.target.value)), style: { width: '100%' } })] }), _jsxs("div", { style: { marginBottom: '16px' }, children: [_jsxs("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: ["Index of Refraction: ", localMaterial.ior?.toFixed(2) ?? '1.50'] }), _jsx("input", { type: "range", min: "1", max: "3", step: "0.01", value: localMaterial.ior ?? 1.5, onChange: (e) => handleSliderChange('ior', parseFloat(e.target.value), 1, 3), style: { width: '100%' } })] })] })] }));
};
export default MaterialEditor;
//# sourceMappingURL=MaterialEditor.js.map