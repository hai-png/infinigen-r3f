import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Camera Rig UI - Phase 12
 * Cinematic camera rig controls with multi-camera support
 */
import { useState } from 'react';
export const CameraRigUI = ({ rigs, activeRigId, onRigSelect, onRigUpdate, onRigAdd, onRigDelete, }) => {
    const [expandedRig, setExpandedRig] = useState(null);
    const handleAddRig = () => {
        onRigAdd?.();
    };
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', height: '100%' }, children: [_jsxs("div", { style: {
                    padding: '12px',
                    borderBottom: '1px solid #333',
                    backgroundColor: '#1e1e1e',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }, children: [_jsx("h3", { style: { margin: 0, fontSize: '14px', fontWeight: 600 }, children: "\uD83C\uDFA5 Camera Rigs" }), _jsx("button", { onClick: handleAddRig, style: {
                            padding: '6px 12px',
                            background: '#007acc',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                        }, children: "+ Add Rig" })] }), _jsx("div", { style: { flex: 1, overflowY: 'auto' }, children: rigs.length === 0 ? (_jsxs("div", { style: {
                        padding: '24px',
                        textAlign: 'center',
                        color: '#666',
                        fontSize: '13px',
                    }, children: ["No camera rigs configured.", _jsx("br", {}), "Click \"Add Rig\" to create one."] })) : (rigs.map((rig) => (_jsxs("div", { style: {
                        borderBottom: '1px solid #333',
                        backgroundColor: activeRigId === rig.id ? '#1a3a5c' : undefined,
                    }, children: [_jsxs("div", { onClick: () => {
                                onRigSelect?.(rig.id);
                                setExpandedRig(expandedRig === rig.id ? null : rig.id);
                            }, style: {
                                padding: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                            }, children: [_jsx("span", { style: { fontSize: '16px' }, children: rig.type === 'stereo' ? '👓' : rig.type === 'orbital' ? '🔄' : rig.type === 'dolly' ? '🎬' : '📷' }), _jsx("span", { style: { flex: 1, fontWeight: 500 }, children: rig.name }), _jsx("span", { style: {
                                        fontSize: '11px',
                                        padding: '2px 6px',
                                        background: '#333',
                                        borderRadius: '4px',
                                        color: '#aaa',
                                    }, children: rig.type }), _jsx("button", { onClick: (e) => {
                                        e.stopPropagation();
                                        onRigDelete?.(rig.id);
                                    }, style: {
                                        padding: '4px 8px',
                                        background: 'transparent',
                                        color: '#ff6b6b',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                    }, children: "\u2715" })] }), expandedRig === rig.id && (_jsxs("div", { style: {
                                padding: '12px',
                                backgroundColor: '#1a1a1a',
                            }, children: [_jsxs("div", { style: { marginBottom: '12px' }, children: [_jsx("label", { style: {
                                                display: 'block',
                                                fontSize: '11px',
                                                color: '#aaa',
                                                marginBottom: '6px',
                                            }, children: "Position" }), _jsx("div", { style: { display: 'flex', gap: '4px' }, children: ['x', 'y', 'z'].map((axis, i) => (_jsx("input", { type: "number", value: rig.position[i], onChange: (e) => {
                                                    const newPos = [...rig.position];
                                                    newPos[i] = parseFloat(e.target.value);
                                                    onRigUpdate?.(rig.id, { position: newPos });
                                                }, style: {
                                                    flex: 1,
                                                    padding: '6px',
                                                    background: '#2d2d2d',
                                                    border: '1px solid #3c3c3c',
                                                    color: '#ccc',
                                                    borderRadius: '4px',
                                                    fontSize: '12px',
                                                } }, axis))) })] }), _jsxs("div", { style: { marginBottom: '12px' }, children: [_jsx("label", { style: {
                                                display: 'block',
                                                fontSize: '11px',
                                                color: '#aaa',
                                                marginBottom: '6px',
                                            }, children: "Target" }), _jsx("div", { style: { display: 'flex', gap: '4px' }, children: ['x', 'y', 'z'].map((axis, i) => (_jsx("input", { type: "number", value: rig.target[i], onChange: (e) => {
                                                    const newTarget = [...rig.target];
                                                    newTarget[i] = parseFloat(e.target.value);
                                                    onRigUpdate?.(rig.id, { target: newTarget });
                                                }, style: {
                                                    flex: 1,
                                                    padding: '6px',
                                                    background: '#2d2d2d',
                                                    border: '1px solid #3c3c3c',
                                                    color: '#ccc',
                                                    borderRadius: '4px',
                                                    fontSize: '12px',
                                                } }, axis))) })] }), _jsxs("div", { style: { marginBottom: '12px' }, children: [_jsxs("label", { style: {
                                                display: 'block',
                                                fontSize: '11px',
                                                color: '#aaa',
                                                marginBottom: '6px',
                                            }, children: ["FOV: ", rig.fov, "\u00B0"] }), _jsx("input", { type: "range", min: "10", max: "120", step: "1", value: rig.fov, onChange: (e) => onRigUpdate?.(rig.id, { fov: parseInt(e.target.value) }), style: { width: '100%' } })] }), _jsxs("div", { style: { marginBottom: '12px' }, children: [_jsxs("label", { style: {
                                                display: 'block',
                                                fontSize: '11px',
                                                color: '#aaa',
                                                marginBottom: '6px',
                                            }, children: ["Aperture: f/", rig.aperture.toFixed(1)] }), _jsx("input", { type: "range", min: "1.4", max: "22", step: "0.1", value: rig.aperture, onChange: (e) => onRigUpdate?.(rig.id, { aperture: parseFloat(e.target.value) }), style: { width: '100%' } })] }), _jsxs("div", { children: [_jsxs("label", { style: {
                                                display: 'block',
                                                fontSize: '11px',
                                                color: '#aaa',
                                                marginBottom: '6px',
                                            }, children: ["Focus Distance: ", rig.focusDistance.toFixed(1), "m"] }), _jsx("input", { type: "range", min: "0.1", max: "100", step: "0.1", value: rig.focusDistance, onChange: (e) => onRigUpdate?.(rig.id, { focusDistance: parseFloat(e.target.value) }), style: { width: '100%' } })] })] }))] }, rig.id)))) })] }));
};
export default CameraRigUI;
//# sourceMappingURL=CameraRigUI.js.map