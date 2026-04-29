import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Violation Debugger Component - Phase 12
 * Visualizes constraint violations in the scene
 */
import { useState, useMemo } from 'react';
import { Text } from '@react-three/drei';
const ViolationMarker = ({ violation, position, isSelected, onClick, }) => {
    const color = useMemo(() => {
        const severity = violation.severity || 'high';
        switch (severity) {
            case 'critical': return '#ff0000';
            case 'high': return '#ff6600';
            case 'medium': return '#ffcc00';
            case 'low': return '#ffff00';
            default: return '#ff0000';
        }
    }, [violation.severity]);
    const scale = isSelected ? 1.5 : 1.0;
    return (_jsxs("group", { position: position, onClick: onClick, children: [_jsxs("mesh", { children: [_jsx("sphereGeometry", { args: [0.3 * scale, 16, 16] }), _jsx("meshStandardMaterial", { color: color, emissive: color, emissiveIntensity: 0.5, transparent: true, opacity: 0.8 })] }), violation.direction && (_jsxs("line", { children: [_jsx("bufferGeometry", { children: _jsx("float32BufferAttribute", { attach: "attributes-position", count: 2, array: new Float32Array([
                                0, 0, 0,
                                violation.direction[0] * 0.5,
                                violation.direction[1] * 0.5,
                                violation.direction[2] * 0.5,
                            ]), itemSize: 3 }) }), _jsx("lineBasicMaterial", { color: color, linewidth: 2 })] })), _jsx(Text, { position: [0, 0.5 * scale, 0], fontSize: 0.2, color: "white", anchorX: "center", anchorY: "middle", children: violation.constraintName || 'Violation' })] }));
};
export const ViolationDebugger = ({ violations, constraints, onSelectViolation, autoRefresh = true, }) => {
    const [selectedViolationId, setSelectedViolationId] = useState(null);
    const [showLabels, setShowLabels] = useState(true);
    const [filterSeverity, setFilterSeverity] = useState('all');
    const filteredViolations = useMemo(() => {
        if (filterSeverity === 'all')
            return violations;
        return violations.filter(v => v.severity === filterSeverity);
    }, [violations, filterSeverity]);
    const violationStats = useMemo(() => {
        const stats = {
            total: violations.length,
            critical: violations.filter(v => v.severity === 'critical').length,
            high: violations.filter(v => v.severity === 'high').length,
            medium: violations.filter(v => v.severity === 'medium').length,
            low: violations.filter(v => v.severity === 'low').length,
        };
        return stats;
    }, [violations]);
    const handleViolationClick = (violation) => {
        setSelectedViolationId(violation.id);
        onSelectViolation?.(violation);
    };
    return (_jsxs("div", { style: {
            position: 'absolute',
            top: 10,
            right: 10,
            width: '350px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            borderRadius: '8px',
            padding: '16px',
            color: 'white',
            fontFamily: 'monospace',
            zIndex: 1000,
        }, children: [_jsxs("div", { style: { marginBottom: '12px' }, children: [_jsx("h3", { style: { margin: '0 0 8px 0', fontSize: '16px' }, children: "\uD83D\uDD34 Violation Debugger" }), _jsxs("div", { style: {
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: '4px',
                            marginBottom: '12px',
                        }, children: [_jsxs("div", { style: { textAlign: 'center', padding: '4px', background: '#ff000044', borderRadius: '4px' }, children: [_jsx("div", { style: { fontSize: '18px', fontWeight: 'bold' }, children: violationStats.critical }), _jsx("div", { style: { fontSize: '10px' }, children: "Critical" })] }), _jsxs("div", { style: { textAlign: 'center', padding: '4px', background: '#ff660044', borderRadius: '4px' }, children: [_jsx("div", { style: { fontSize: '18px', fontWeight: 'bold' }, children: violationStats.high }), _jsx("div", { style: { fontSize: '10px' }, children: "High" })] }), _jsxs("div", { style: { textAlign: 'center', padding: '4px', background: '#ffcc0044', borderRadius: '4px' }, children: [_jsx("div", { style: { fontSize: '18px', fontWeight: 'bold' }, children: violationStats.medium }), _jsx("div", { style: { fontSize: '10px' }, children: "Medium" })] }), _jsxs("div", { style: { textAlign: 'center', padding: '4px', background: '#ffff0044', borderRadius: '4px' }, children: [_jsx("div", { style: { fontSize: '18px', fontWeight: 'bold' }, children: violationStats.low }), _jsx("div", { style: { fontSize: '10px' }, children: "Low" })] })] }), _jsxs("div", { style: { marginBottom: '8px' }, children: [_jsx("label", { style: { fontSize: '12px', marginRight: '8px' }, children: "Filter:" }), _jsxs("select", { value: filterSeverity, onChange: (e) => setFilterSeverity(e.target.value), style: {
                                    padding: '4px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: '#333',
                                    color: 'white',
                                    fontSize: '12px',
                                }, children: [_jsx("option", { value: "all", children: "All" }), _jsx("option", { value: "critical", children: "Critical" }), _jsx("option", { value: "high", children: "High" }), _jsx("option", { value: "medium", children: "Medium" }), _jsx("option", { value: "low", children: "Low" })] }), _jsxs("label", { style: { fontSize: '12px', marginLeft: '12px', marginRight: '8px' }, children: [_jsx("input", { type: "checkbox", checked: showLabels, onChange: (e) => setShowLabels(e.target.checked), style: { marginRight: '4px' } }), "Labels"] })] })] }), _jsx("div", { style: {
                    maxHeight: '300px',
                    overflowY: 'auto',
                    borderTop: '1px solid #444',
                    paddingTop: '8px',
                }, children: filteredViolations.length === 0 ? (_jsx("div", { style: { textAlign: 'center', padding: '20px', color: '#888' }, children: "\u2705 No violations found" })) : (filteredViolations.map((violation, index) => (_jsxs("div", { onClick: () => handleViolationClick(violation), style: {
                        padding: '8px',
                        marginBottom: '4px',
                        backgroundColor: selectedViolationId === violation.id ? '#444' : '#222',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        borderLeft: `4px solid ${violation.severity === 'critical' ? '#ff0000' :
                            violation.severity === 'high' ? '#ff6600' :
                                violation.severity === 'medium' ? '#ffcc00' : '#ffff00'}`,
                    }, children: [_jsx("div", { style: { fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }, children: violation.constraintName || `Constraint #${index + 1}` }), _jsxs("div", { style: { fontSize: '10px', color: '#aaa', marginBottom: '2px' }, children: ["Type: ", violation.type || 'Unknown'] }), _jsxs("div", { style: { fontSize: '10px', color: '#aaa' }, children: ["Objects: ", violation.objectIds?.join(', ') || 'N/A'] }), violation.message && (_jsxs("div", { style: { fontSize: '10px', color: '#ff6666', marginTop: '4px' }, children: ["\u26A0\uFE0F ", violation.message] }))] }, violation.id)))) })] }));
};
export default ViolationDebugger;
//# sourceMappingURL=ViolationDebugger.js.map