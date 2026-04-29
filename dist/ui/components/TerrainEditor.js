import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Terrain Editor - Phase 12
 * Interactive terrain manipulation tools with sculpting, painting, and erosion
 */
import { useState } from 'react';
export const TerrainEditor = ({ terrainConfig, onUpdate, onBrushApply, }) => {
    const [activeTool, setActiveTool] = useState('sculpt');
    const [brushSize, setBrushSize] = useState(5);
    const [brushStrength, setBrushStrength] = useState(0.5);
    const [falloff, setFalloff] = useState('smooth');
    const handleConfigChange = (key, value) => {
        const updated = { ...terrainConfig, [key]: value };
        onUpdate?.(updated);
    };
    const brush = {
        type: activeTool === 'paint' ? 'paint' : activeTool,
        size: brushSize,
        strength: brushStrength,
        falloff,
    };
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', height: '100%' }, children: [_jsx("div", { style: {
                    padding: '12px',
                    borderBottom: '1px solid #333',
                    backgroundColor: '#1e1e1e',
                }, children: _jsx("h3", { style: { margin: 0, fontSize: '14px', fontWeight: 600 }, children: "\uD83C\uDFD4\uFE0F Terrain Editor" }) }), _jsx("div", { style: {
                    padding: '12px',
                    borderBottom: '1px solid #333',
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap',
                }, children: [
                    { id: 'sculpt', icon: '⛰️', label: 'Sculpt' },
                    { id: 'smooth', icon: '🌊', label: 'Smooth' },
                    { id: 'flatten', icon: '📏', label: 'Flatten' },
                    { id: 'paint', icon: '🎨', label: 'Paint' },
                ].map((tool) => (_jsxs("button", { onClick: () => setActiveTool(tool.id), style: {
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
                    }, children: [_jsx("span", { children: tool.icon }), _jsx("span", { children: tool.label })] }, tool.id))) }), _jsxs("div", { style: {
                    padding: '12px',
                    borderBottom: '1px solid #333',
                }, children: [_jsx("h4", { style: {
                            margin: '0 0 12px 0',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#aaa',
                        }, children: "Brush Settings" }), _jsxs("div", { style: { marginBottom: '12px' }, children: [_jsxs("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: ["Size: ", brushSize.toFixed(1)] }), _jsx("input", { type: "range", min: "1", max: "20", step: "0.5", value: brushSize, onChange: (e) => setBrushSize(parseFloat(e.target.value)), style: { width: '100%' } })] }), _jsxs("div", { style: { marginBottom: '12px' }, children: [_jsxs("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: ["Strength: ", (brushStrength * 100).toFixed(0), "%"] }), _jsx("input", { type: "range", min: "0.01", max: "1", step: "0.01", value: brushStrength, onChange: (e) => setBrushStrength(parseFloat(e.target.value)), style: { width: '100%' } })] }), _jsxs("div", { children: [_jsx("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: "Falloff" }), _jsx("div", { style: { display: 'flex', gap: '4px' }, children: ['constant', 'linear', 'smooth', 'sharp'].map((type) => (_jsx("button", { onClick: () => setFalloff(type), style: {
                                        flex: 1,
                                        padding: '6px',
                                        background: falloff === type ? '#007acc' : '#333',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '10px',
                                        textTransform: 'capitalize',
                                    }, children: type }, type))) })] })] }), _jsxs("div", { style: {
                    flex: 1,
                    overflowY: 'auto',
                    padding: '12px',
                }, children: [_jsx("h4", { style: {
                            margin: '0 0 12px 0',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#aaa',
                        }, children: "Terrain Parameters" }), _jsxs("div", { style: { marginBottom: '12px' }, children: [_jsxs("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: ["Width: ", terrainConfig.width.toFixed(0), "m"] }), _jsx("input", { type: "range", min: "10", max: "500", step: "10", value: terrainConfig.width, onChange: (e) => handleConfigChange('width', parseFloat(e.target.value)), style: { width: '100%' } })] }), _jsxs("div", { style: { marginBottom: '12px' }, children: [_jsxs("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: ["Depth: ", terrainConfig.depth.toFixed(0), "m"] }), _jsx("input", { type: "range", min: "10", max: "500", step: "10", value: terrainConfig.depth, onChange: (e) => handleConfigChange('depth', parseFloat(e.target.value)), style: { width: '100%' } })] }), _jsxs("div", { style: { marginBottom: '12px' }, children: [_jsxs("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: ["Resolution: ", terrainConfig.resolution] }), _jsxs("select", { value: terrainConfig.resolution, onChange: (e) => handleConfigChange('resolution', parseInt(e.target.value)), style: {
                                    width: '100%',
                                    padding: '6px',
                                    background: '#2d2d2d',
                                    border: '1px solid #3c3c3c',
                                    color: '#ccc',
                                    borderRadius: '4px',
                                }, children: [_jsx("option", { value: 64, children: "64 \u00D7 64 (Low)" }), _jsx("option", { value: 128, children: "128 \u00D7 128 (Medium)" }), _jsx("option", { value: 256, children: "256 \u00D7 256 (High)" }), _jsx("option", { value: 512, children: "512 \u00D7 512 (Ultra)" })] })] }), _jsxs("div", { style: { marginBottom: '12px' }, children: [_jsxs("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: ["Max Height: ", terrainConfig.heightScale.toFixed(0), "m"] }), _jsx("input", { type: "range", min: "10", max: "500", step: "10", value: terrainConfig.heightScale, onChange: (e) => handleConfigChange('heightScale', parseFloat(e.target.value)), style: { width: '100%' } })] }), _jsxs("div", { style: { marginBottom: '12px' }, children: [_jsxs("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: ["Water Level: ", terrainConfig.waterLevel.toFixed(1), "m"] }), _jsx("input", { type: "range", min: "0", max: "100", step: "1", value: terrainConfig.waterLevel, onChange: (e) => handleConfigChange('waterLevel', parseFloat(e.target.value)), style: { width: '100%' } })] })] }), _jsxs("div", { style: {
                    padding: '12px',
                    borderTop: '1px solid #333',
                    backgroundColor: '#1a1a1a',
                    fontSize: '11px',
                    color: '#888',
                }, children: [_jsxs("div", { children: [_jsx("strong", { children: "Tip:" }), " Hold Shift while sculpting to lower terrain"] }), _jsxs("div", { children: [_jsx("strong", { children: "Tip:" }), " Use Ctrl+Z to undo last stroke"] })] })] }));
};
export default TerrainEditor;
//# sourceMappingURL=TerrainEditor.js.map