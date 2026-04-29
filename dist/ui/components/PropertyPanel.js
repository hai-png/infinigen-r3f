import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * PropertyPanel - Interactive property editor for scene objects
 *
 * Provides a comprehensive UI for editing object properties, materials,
 * transforms, and custom parameters in real-time.
 */
import { useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
/**
 * Vector3 input component
 */
const Vector3Input = ({ value, onChange, disabled }) => {
    const handleChange = (axis, val) => {
        const num = parseFloat(val);
        if (!isNaN(num)) {
            onChange(new THREE.Vector3(axis === 'x' ? num : value.x, axis === 'y' ? num : value.y, axis === 'z' ? num : value.z));
        }
    };
    return (_jsx("div", { style: { display: 'flex', gap: '4px' }, children: ['x', 'y', 'z'].map(axis => (_jsx("input", { type: "number", step: "0.1", disabled: disabled, value: value[axis].toFixed(2), onChange: (e) => handleChange(axis, e.target.value), style: {
                width: '60px',
                padding: '2px 4px',
                border: '1px solid #444',
                borderRadius: '2px',
                background: '#2a2a2a',
                color: '#fff',
                fontSize: '11px'
            } }, axis))) }));
};
/**
 * Color input component
 */
const ColorInput = ({ value, onChange, disabled }) => {
    const hexValue = '#' + value.getHexString();
    return (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '8px' }, children: [_jsx("input", { type: "color", disabled: disabled, value: hexValue, onChange: (e) => {
                    onChange(new THREE.Color(e.target.value));
                }, style: {
                    width: '30px',
                    height: '20px',
                    border: 'none',
                    padding: 0,
                    cursor: disabled ? 'not-allowed' : 'pointer'
                } }), _jsx("input", { type: "text", disabled: disabled, value: hexValue.toUpperCase(), onChange: (e) => {
                    if (e.target.value.match(/^#[0-9A-F]{6}$/i)) {
                        onChange(new THREE.Color(e.target.value));
                    }
                }, style: {
                    width: '80px',
                    padding: '2px 4px',
                    border: '1px solid #444',
                    borderRadius: '2px',
                    background: '#2a2a2a',
                    color: '#fff',
                    fontSize: '11px'
                } })] }));
};
/**
 * Individual property row
 */
const PropertyRow = ({ item, onChange, readOnly }) => {
    const renderInput = () => {
        if (readOnly || item.disabled) {
            return _jsx("span", { style: { color: '#888' }, children: String(item.value) });
        }
        switch (item.type) {
            case 'number':
                return (_jsx("input", { type: "number", value: item.value, min: item.min, max: item.max, step: item.step ?? 1, onChange: (e) => onChange(item.path, parseFloat(e.target.value)), style: {
                        width: '100%',
                        padding: '2px 4px',
                        border: '1px solid #444',
                        borderRadius: '2px',
                        background: '#2a2a2a',
                        color: '#fff',
                        fontSize: '11px'
                    } }));
            case 'string':
                return (_jsx("input", { type: "text", value: item.value, onChange: (e) => onChange(item.path, e.target.value), style: {
                        width: '100%',
                        padding: '2px 4px',
                        border: '1px solid #444',
                        borderRadius: '2px',
                        background: '#2a2a2a',
                        color: '#fff',
                        fontSize: '11px'
                    } }));
            case 'boolean':
                return (_jsx("input", { type: "checkbox", checked: item.value, onChange: (e) => onChange(item.path, e.target.checked) }));
            case 'vector3':
                return (_jsx(Vector3Input, { value: item.value, onChange: (val) => onChange(item.path, val) }));
            case 'color':
                return (_jsx(ColorInput, { value: item.value, onChange: (val) => onChange(item.path, val) }));
            case 'enum':
                return (_jsx("select", { value: item.value, onChange: (e) => onChange(item.path, e.target.value), style: {
                        width: '100%',
                        padding: '2px 4px',
                        border: '1px solid #444',
                        borderRadius: '2px',
                        background: '#2a2a2a',
                        color: '#fff',
                        fontSize: '11px'
                    }, children: item.options?.map(opt => (_jsx("option", { value: opt, children: opt }, opt))) }));
            default:
                return _jsx("span", { children: String(item.value) });
        }
    };
    return (_jsxs("div", { style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '4px 8px',
            borderBottom: '1px solid #333'
        }, children: [_jsx("span", { style: { fontSize: '11px', color: '#aaa' }, children: item.label }), _jsx("div", { style: { flex: 1, marginLeft: '8px' }, children: renderInput() })] }));
};
/**
 * Property group with expand/collapse
 */
const PropertyGroupComponent = ({ group, onToggle, onPropertyChange, readOnly }) => {
    return (_jsxs("div", { style: { marginBottom: '8px' }, children: [_jsxs("div", { onClick: onToggle, style: {
                    padding: '6px 8px',
                    background: '#2a2a2a',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: '#fff',
                    borderTop: '1px solid #333',
                    borderBottom: '1px solid #333'
                }, children: [_jsx("span", { style: { marginRight: '6px', fontSize: '10px' }, children: group.expanded ? '▼' : '▶' }), group.name] }), group.expanded && (_jsx("div", { children: group.properties.map(prop => (_jsx(PropertyRow, { item: prop, onChange: onPropertyChange, readOnly: readOnly }, prop.path))) }))] }));
};
/**
 * Main Property Panel Component
 */
export const PropertyPanel = ({ selectedObject = null, readOnly = false, showAdvanced = false, onPropertyChange, customEditors }) => {
    const [expandedGroups, setExpandedGroups] = useState({
        'Transform': true,
        'Material': true,
        'Geometry': false,
        'Advanced': false
    });
    // Extract properties from selected object
    const propertyGroups = useMemo(() => {
        if (!selectedObject)
            return [];
        const groups = [];
        // Transform properties
        const transformProps = [
            {
                path: 'position',
                label: 'Position',
                value: selectedObject.position.clone(),
                type: 'vector3'
            },
            {
                path: 'rotation',
                label: 'Rotation (Euler)',
                value: selectedObject.rotation.clone(),
                type: 'vector3'
            },
            {
                path: 'scale',
                label: 'Scale',
                value: selectedObject.scale.clone(),
                type: 'vector3'
            },
            {
                path: 'visible',
                label: 'Visible',
                value: selectedObject.visible,
                type: 'boolean'
            }
        ];
        groups.push({
            name: 'Transform',
            expanded: expandedGroups['Transform'] ?? false,
            properties: transformProps
        });
        // Material properties (if mesh)
        if ('material' in selectedObject && selectedObject.material) {
            const material = selectedObject.material;
            const materialProps = [
                {
                    path: 'material.name',
                    label: 'Name',
                    value: material.name || 'Unnamed',
                    type: 'string'
                },
                {
                    path: 'material.color',
                    label: 'Color',
                    value: material.color || new THREE.Color(0xffffff),
                    type: 'color'
                },
                {
                    path: 'material.opacity',
                    label: 'Opacity',
                    value: material.opacity,
                    type: 'number',
                    min: 0,
                    max: 1,
                    step: 0.01
                },
                {
                    path: 'material.transparent',
                    label: 'Transparent',
                    value: material.transparent,
                    type: 'boolean'
                },
                {
                    path: 'material.side',
                    label: 'Side',
                    value: ['Front', 'Back', 'Double'][material.side],
                    type: 'enum',
                    options: ['Front', 'Back', 'Double']
                }
            ];
            // Add PBR properties for standard material
            if (material instanceof THREE.MeshStandardMaterial) {
                materialProps.push({
                    path: 'material.roughness',
                    label: 'Roughness',
                    value: material.roughness,
                    type: 'number',
                    min: 0,
                    max: 1,
                    step: 0.01
                }, {
                    path: 'material.metalness',
                    label: 'Metalness',
                    value: material.metalness,
                    type: 'number',
                    min: 0,
                    max: 1,
                    step: 0.01
                }, {
                    path: 'material.flatShading',
                    label: 'Flat Shading',
                    value: material.flatShading,
                    type: 'boolean'
                });
            }
            groups.push({
                name: 'Material',
                expanded: expandedGroups['Material'] ?? false,
                properties: materialProps
            });
        }
        // Geometry properties
        if ('geometry' in selectedObject && selectedObject.geometry) {
            const geometry = selectedObject.geometry;
            const geomProps = [
                {
                    path: 'geometry.type',
                    label: 'Type',
                    value: geometry.type,
                    type: 'string',
                    disabled: true
                },
                {
                    path: 'geometry.vertexCount',
                    label: 'Vertices',
                    value: geometry.attributes.position?.count || 0,
                    type: 'number',
                    disabled: true
                }
            ];
            groups.push({
                name: 'Geometry',
                expanded: expandedGroups['Geometry'] ?? false,
                properties: geomProps
            });
        }
        // Advanced properties
        if (showAdvanced) {
            const advancedProps = [
                {
                    path: 'uuid',
                    label: 'UUID',
                    value: selectedObject.uuid,
                    type: 'string',
                    disabled: true
                },
                {
                    path: 'name',
                    label: 'Name',
                    value: selectedObject.name || 'Unnamed',
                    type: 'string'
                },
                {
                    path: 'castShadow',
                    label: 'Cast Shadow',
                    value: selectedObject.castShadow,
                    type: 'boolean'
                },
                {
                    path: 'receiveShadow',
                    label: 'Receive Shadow',
                    value: selectedObject.receiveShadow,
                    type: 'boolean'
                },
                {
                    path: 'frustumCulled',
                    label: 'Frustum Culled',
                    value: selectedObject.frustumCulled,
                    type: 'boolean'
                }
            ];
            groups.push({
                name: 'Advanced',
                expanded: expandedGroups['Advanced'] ?? false,
                properties: advancedProps
            });
        }
        return groups;
    }, [selectedObject, showAdvanced, expandedGroups]);
    // Handle group toggle
    const handleGroupToggle = useCallback((groupName) => {
        setExpandedGroups(prev => ({
            ...prev,
            [groupName]: !prev[groupName]
        }));
    }, []);
    // Handle property change
    const handlePropertyChange = useCallback((path, value) => {
        if (!selectedObject || readOnly)
            return;
        const parts = path.split('.');
        if (parts[0] === 'position' && value instanceof THREE.Vector3) {
            selectedObject.position.copy(value);
        }
        else if (parts[0] === 'rotation' && value instanceof THREE.Vector3) {
            selectedObject.rotation.set(value.x, value.y, value.z);
        }
        else if (parts[0] === 'scale' && value instanceof THREE.Vector3) {
            selectedObject.scale.copy(value);
        }
        else if (parts[0] === 'material') {
            const material = selectedObject.material;
            if (material) {
                const prop = parts[1];
                if (prop === 'side') {
                    material[prop] = ['FrontSide', 'BackSide', 'DoubleSide'].indexOf(value);
                }
                else if (prop === 'color' && value instanceof THREE.Color) {
                    material[prop] = value;
                }
                else {
                    material[prop] = value;
                }
                material.needsUpdate = true;
            }
        }
        else if (parts[0] === 'name') {
            selectedObject.name = value;
        }
        else if (parts[0] === 'visible') {
            selectedObject.visible = value;
        }
        else if (parts[0] === 'castShadow') {
            selectedObject.castShadow = value;
        }
        else if (parts[0] === 'receiveShadow') {
            selectedObject.receiveShadow = value;
        }
        else if (parts[0] === 'frustumCulled') {
            selectedObject.frustumCulled = value;
        }
        // Notify parent
        onPropertyChange?.(path, value);
    }, [selectedObject, readOnly, onPropertyChange]);
    if (!selectedObject) {
        return (_jsx("div", { style: {
                padding: '20px',
                textAlign: 'center',
                color: '#888',
                fontSize: '12px'
            }, children: "Select an object to view properties" }));
    }
    return (_jsxs("div", { style: {
            width: '100%',
            height: '100%',
            overflow: 'auto',
            background: '#1a1a1a',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '11px'
        }, children: [_jsxs("div", { style: {
                    padding: '8px',
                    borderBottom: '1px solid #333',
                    fontWeight: 'bold',
                    color: '#fff'
                }, children: ["Properties", selectedObject.name && (_jsxs("span", { style: { fontWeight: 'normal', color: '#888', marginLeft: '8px' }, children: ["- ", selectedObject.name] }))] }), propertyGroups.map(group => (_jsx(PropertyGroupComponent, { group: group, onToggle: () => handleGroupToggle(group.name), onPropertyChange: handlePropertyChange, readOnly: readOnly }, group.name)))] }));
};
export default PropertyPanel;
//# sourceMappingURL=PropertyPanel.js.map