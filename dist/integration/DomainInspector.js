import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * Domain Inspector Component - Phase 12
 * Inspects and visualizes variable domains in the constraint system
 */
import { useState, useMemo } from 'react';
const DomainValueDisplay = ({ domain }) => {
    switch (domain.type) {
        case 'object-set':
            const objDomain = domain;
            return (_jsxs("div", { style: { fontSize: '11px' }, children: [_jsxs("div", { style: { color: '#4ec9b0', marginBottom: '4px' }, children: ["Objects: ", objDomain.allowedObjects?.length || 'unbounded'] }), objDomain.allowedObjects && objDomain.allowedObjects.length > 0 && (_jsx("div", { style: {
                            maxHeight: '100px',
                            overflowY: 'auto',
                            background: '#1e1e1e',
                            padding: '4px',
                            borderRadius: '4px',
                        }, children: objDomain.allowedObjects.map((obj, idx) => (_jsxs("div", { style: {
                                padding: '2px 4px',
                                fontFamily: 'monospace',
                                fontSize: '10px',
                                color: '#dcdcaa',
                            }, children: ["\u2022 ", obj.id || `obj_${idx}`, obj.tags && obj.tags.length > 0 && (_jsxs("span", { style: { color: '#6a9955', marginLeft: '4px' }, children: ["[", obj.tags.join(', '), "]"] }))] }, idx))) })), objDomain.minSize !== undefined && (_jsxs("div", { style: { marginTop: '4px', color: '#aaa' }, children: ["Min Size: ", objDomain.minSize] })), objDomain.maxSize !== undefined && (_jsxs("div", { style: { color: '#aaa' }, children: ["Max Size: ", objDomain.maxSize] }))] }));
        case 'numeric':
            const numDomain = domain;
            return (_jsxs("div", { style: { fontSize: '11px' }, children: [_jsxs("div", { style: { color: '#b5cea8', marginBottom: '4px' }, children: ["Range: [", numDomain.min, ", ", numDomain.max, "]"] }), numDomain.isInteger && (_jsx("div", { style: { color: '#aaa', fontStyle: 'italic' }, children: "Integer only" })), numDomain.unit && (_jsxs("div", { style: { color: '#aaa' }, children: ["Unit: ", numDomain.unit] }))] }));
        case 'pose':
            const poseDomain = domain;
            return (_jsxs("div", { style: { fontSize: '11px' }, children: [_jsx("div", { style: { color: '#569cd6', marginBottom: '4px' }, children: "Position:" }), poseDomain.positionBounds && (_jsxs("div", { style: { marginLeft: '8px', color: '#aaa' }, children: ["X: [", poseDomain.positionBounds.x.min, ", ", poseDomain.positionBounds.x.max, "]", _jsx("br", {}), "Y: [", poseDomain.positionBounds.y.min, ", ", poseDomain.positionBounds.y.max, "]", _jsx("br", {}), "Z: [", poseDomain.positionBounds.z.min, ", ", poseDomain.positionBounds.z.max, "]"] })), _jsx("div", { style: { color: '#569cd6', marginTop: '8px', marginBottom: '4px' }, children: "Rotation:" }), poseDomain.rotationBounds && (_jsxs("div", { style: { marginLeft: '8px', color: '#aaa' }, children: ["X: [", poseDomain.rotationBounds.x.min, ", ", poseDomain.rotationBounds.x.max, "]", _jsx("br", {}), "Y: [", poseDomain.rotationBounds.y.min, ", ", poseDomain.rotationBounds.y.max, "]", _jsx("br", {}), "Z: [", poseDomain.rotationBounds.z.min, ", ", poseDomain.rotationBounds.z.max, "]"] }))] }));
        case 'bbox':
            const bboxDomain = domain;
            return (_jsxs("div", { style: { fontSize: '11px' }, children: [_jsx("div", { style: { color: '#ce9178', marginBottom: '4px' }, children: "Bounding Box Constraints" }), bboxDomain.minSize && (_jsxs("div", { style: { color: '#aaa' }, children: ["Min Size: [", bboxDomain.minSize[0], ", ", bboxDomain.minSize[1], ", ", bboxDomain.minSize[2], "]"] })), bboxDomain.maxSize && (_jsxs("div", { style: { color: '#aaa' }, children: ["Max Size: [", bboxDomain.maxSize[0], ", ", bboxDomain.maxSize[1], ", ", bboxDomain.maxSize[2], "]"] }))] }));
        case 'boolean':
            const boolDomain = domain;
            return (_jsx("div", { style: { fontSize: '11px' }, children: _jsxs("div", { style: { color: '#c586c0' }, children: ["Boolean: ", boolDomain.allowedValues?.join(' or ') || 'true/false'] }) }));
        default:
            return _jsx("div", { style: { fontSize: '11px', color: '#888' }, children: "Unknown domain type" });
    }
};
export const DomainInspector = ({ variables, domains, selectedVariableId, onSelectVariable, onDomainChange, }) => {
    const [expandedDomains, setExpandedDomains] = useState(new Set(['all']));
    const [filterType, setFilterType] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const filteredVariables = useMemo(() => {
        return variables.filter(v => {
            const matchesType = filterType === 'all' || v.domain.type === filterType;
            const matchesSearch = searchQuery === '' ||
                v.name.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesType && matchesSearch;
        });
    }, [variables, filterType, searchQuery]);
    const domainStats = useMemo(() => {
        const stats = {
            total: variables.length,
            'object-set': variables.filter(v => v.domain.type === 'object-set').length,
            numeric: variables.filter(v => v.domain.type === 'numeric').length,
            pose: variables.filter(v => v.domain.type === 'pose').length,
            bbox: variables.filter(v => v.domain.type === 'bbox').length,
            boolean: variables.filter(v => v.domain.type === 'boolean').length,
        };
        return stats;
    }, [variables]);
    const toggleExpand = (varId) => {
        const newExpanded = new Set(expandedDomains);
        if (newExpanded.has(varId)) {
            newExpanded.delete(varId);
        }
        else {
            newExpanded.add(varId);
        }
        setExpandedDomains(newExpanded);
    };
    const expandAll = () => {
        setExpandedDomains(new Set(variables.map(v => v.id)));
    };
    const collapseAll = () => {
        setExpandedDomains(new Set());
    };
    return (_jsxs("div", { style: {
            position: 'absolute',
            top: 10,
            left: 10,
            width: '400px',
            maxHeight: '80vh',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            borderRadius: '8px',
            padding: '16px',
            color: 'white',
            fontFamily: 'monospace',
            zIndex: 1000,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
        }, children: [_jsxs("div", { style: { marginBottom: '12px' }, children: [_jsx("h3", { style: { margin: '0 0 12px 0', fontSize: '16px' }, children: "\uD83D\uDD0D Domain Inspector" }), _jsxs("div", { style: {
                            display: 'grid',
                            gridTemplateColumns: 'repeat(5, 1fr)',
                            gap: '4px',
                            marginBottom: '12px',
                        }, children: [_jsxs("div", { style: { textAlign: 'center', padding: '4px', background: '#007acc44', borderRadius: '4px' }, children: [_jsx("div", { style: { fontSize: '16px', fontWeight: 'bold' }, children: domainStats.total }), _jsx("div", { style: { fontSize: '9px' }, children: "Total" })] }), _jsxs("div", { style: { textAlign: 'center', padding: '4px', background: '#4ec9b044', borderRadius: '4px' }, children: [_jsx("div", { style: { fontSize: '16px', fontWeight: 'bold' }, children: domainStats['object-set'] }), _jsx("div", { style: { fontSize: '9px' }, children: "Objects" })] }), _jsxs("div", { style: { textAlign: 'center', padding: '4px', background: '#b5cea844', borderRadius: '4px' }, children: [_jsx("div", { style: { fontSize: '16px', fontWeight: 'bold' }, children: domainStats.numeric }), _jsx("div", { style: { fontSize: '9px' }, children: "Numeric" })] }), _jsxs("div", { style: { textAlign: 'center', padding: '4px', background: '#569cd644', borderRadius: '4px' }, children: [_jsx("div", { style: { fontSize: '16px', fontWeight: 'bold' }, children: domainStats.pose }), _jsx("div", { style: { fontSize: '9px' }, children: "Pose" })] }), _jsxs("div", { style: { textAlign: 'center', padding: '4px', background: '#ce917844', borderRadius: '4px' }, children: [_jsx("div", { style: { fontSize: '16px', fontWeight: 'bold' }, children: domainStats.bbox }), _jsx("div", { style: { fontSize: '9px' }, children: "BBox" })] })] }), _jsxs("div", { style: { marginBottom: '8px' }, children: [_jsx("input", { type: "text", placeholder: "Search variables...", value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), style: {
                                    width: '100%',
                                    padding: '6px',
                                    borderRadius: '4px',
                                    border: '1px solid #444',
                                    background: '#1e1e1e',
                                    color: 'white',
                                    fontSize: '12px',
                                    marginBottom: '8px',
                                } }), _jsx("div", { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }, children: ['all', 'object-set', 'numeric', 'pose', 'bbox', 'boolean'].map(type => (_jsx("button", { onClick: () => setFilterType(type), style: {
                                        padding: '4px 8px',
                                        fontSize: '10px',
                                        borderRadius: '4px',
                                        border: 'none',
                                        background: filterType === type ? '#007acc' : '#333',
                                        color: 'white',
                                        cursor: 'pointer',
                                        textTransform: 'capitalize',
                                    }, children: type }, type))) }), _jsxs("div", { style: { display: 'flex', gap: '8px' }, children: [_jsx("button", { onClick: expandAll, style: {
                                            padding: '4px 8px',
                                            fontSize: '10px',
                                            borderRadius: '4px',
                                            border: 'none',
                                            background: '#2d2d2d',
                                            color: 'white',
                                            cursor: 'pointer',
                                        }, children: "Expand All" }), _jsx("button", { onClick: collapseAll, style: {
                                            padding: '4px 8px',
                                            fontSize: '10px',
                                            borderRadius: '4px',
                                            border: 'none',
                                            background: '#2d2d2d',
                                            color: 'white',
                                            cursor: 'pointer',
                                        }, children: "Collapse All" })] })] })] }), _jsx("div", { style: {
                    flex: 1,
                    overflowY: 'auto',
                    borderTop: '1px solid #444',
                    paddingTop: '8px',
                }, children: filteredVariables.length === 0 ? (_jsx("div", { style: { textAlign: 'center', padding: '20px', color: '#888' }, children: "No variables found" })) : (filteredVariables.map(variable => {
                    const isExpanded = expandedDomains.has(variable.id);
                    const isSelected = selectedVariableId === variable.id;
                    return (_jsxs("div", { style: {
                            marginBottom: '8px',
                            border: isSelected ? '1px solid #007acc' : '1px solid #333',
                            borderRadius: '4px',
                            overflow: 'hidden',
                        }, children: [_jsxs("div", { onClick: () => {
                                    toggleExpand(variable.id);
                                    onSelectVariable?.(variable);
                                }, style: {
                                    padding: '8px',
                                    backgroundColor: isSelected ? '#007acc44' : '#1e1e1e',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '8px' }, children: [_jsx("span", { style: { fontSize: '14px' }, children: isExpanded ? '▼' : '▶' }), _jsx("span", { style: { fontWeight: 'bold', color: '#dcdcaa' }, children: variable.name }), _jsx("span", { style: {
                                                    fontSize: '10px',
                                                    padding: '2px 6px',
                                                    background: '#333',
                                                    borderRadius: '3px',
                                                    color: '#aaa',
                                                }, children: variable.domain.type })] }), variable.isFixed && (_jsx("span", { style: {
                                            fontSize: '10px',
                                            color: '#6a9955',
                                            fontStyle: 'italic',
                                        }, children: "\uD83D\uDCCC Fixed" }))] }), isExpanded && (_jsxs("div", { style: {
                                    padding: '8px',
                                    backgroundColor: '#252526',
                                    borderTop: '1px solid #333',
                                }, children: [_jsx(DomainValueDisplay, { domain: variable.domain }), variable.currentValue !== undefined && (_jsxs("div", { style: {
                                            marginTop: '8px',
                                            paddingTop: '8px',
                                            borderTop: '1px dashed #444',
                                            fontSize: '11px',
                                            color: '#6a9955',
                                        }, children: [_jsx("strong", { children: "Current Value:" }), ' ', JSON.stringify(variable.currentValue)] }))] }))] }, variable.id));
                })) })] }));
};
export default DomainInspector;
//# sourceMappingURL=DomainInspector.js.map