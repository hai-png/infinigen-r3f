/**
 * PropertyPanel - Interactive property editor for scene objects
 * 
 * Provides a comprehensive UI for editing object properties, materials,
 * transforms, and custom parameters in real-time.
 */

import React, { useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';

export interface PropertyPanelProps {
  /** Selected object to edit */
  selectedObject?: THREE.Object3D | null;
  /** Read-only mode */
  readOnly?: boolean;
  /** Show advanced properties */
  showAdvanced?: boolean;
  /** Callback when property changes */
  onPropertyChange?: (path: string, value: any) => void;
  /** Custom property editors */
  customEditors?: Record<string, React.ComponentType<any>>;
}

interface PropertyGroup {
  name: string;
  expanded: boolean;
  properties: PropertyItem[];
}

interface PropertyItem {
  path: string;
  label: string;
  value: any;
  type: PropertyType;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  disabled?: boolean;
}

type PropertyType = 
  | 'number'
  | 'string'
  | 'boolean'
  | 'vector2'
  | 'vector3'
  | 'vector4'
  | 'color'
  | 'enum'
  | 'texture';

/**
 * Vector3 input component
 */
const Vector3Input: React.FC<{
  value: THREE.Vector3;
  onChange: (value: THREE.Vector3) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  const handleChange = (axis: keyof THREE.Vector3, val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      onChange(new THREE.Vector3(
        axis === 'x' ? num : value.x,
        axis === 'y' ? num : value.y,
        axis === 'z' ? num : value.z
      ));
    }
  };
  
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {(['x', 'y', 'z'] as const).map(axis => (
        <input
          key={axis}
          type="number"
          step="0.1"
          disabled={disabled}
          value={value[axis].toFixed(2)}
          onChange={(e) => handleChange(axis, e.target.value)}
          style={{
            width: '60px',
            padding: '2px 4px',
            border: '1px solid #444',
            borderRadius: '2px',
            background: '#2a2a2a',
            color: '#fff',
            fontSize: '11px'
          }}
        />
      ))}
    </div>
  );
};

/**
 * Color input component
 */
const ColorInput: React.FC<{
  value: THREE.Color;
  onChange: (value: THREE.Color) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  const hexValue = '#' + value.getHexString();
  
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <input
        type="color"
        disabled={disabled}
        value={hexValue}
        onChange={(e) => {
          onChange(new THREE.Color(e.target.value));
        }}
        style={{
          width: '30px',
          height: '20px',
          border: 'none',
          padding: 0,
          cursor: disabled ? 'not-allowed' : 'pointer'
        }}
      />
      <input
        type="text"
        disabled={disabled}
        value={hexValue.toUpperCase()}
        onChange={(e) => {
          if (e.target.value.match(/^#[0-9A-F]{6}$/i)) {
            onChange(new THREE.Color(e.target.value));
          }
        }}
        style={{
          width: '80px',
          padding: '2px 4px',
          border: '1px solid #444',
          borderRadius: '2px',
          background: '#2a2a2a',
          color: '#fff',
          fontSize: '11px'
        }}
      />
    </div>
  );
};

/**
 * Individual property row
 */
const PropertyRow: React.FC<{
  item: PropertyItem;
  onChange: (path: string, value: any) => void;
  readOnly?: boolean;
}> = ({ item, onChange, readOnly }) => {
  const renderInput = () => {
    if (readOnly || item.disabled) {
      return <span style={{ color: '#888' }}>{String(item.value)}</span>;
    }
    
    switch (item.type) {
      case 'number':
        return (
          <input
            type="number"
            value={item.value}
            min={item.min}
            max={item.max}
            step={item.step ?? 1}
            onChange={(e) => onChange(item.path, parseFloat(e.target.value))}
            style={{
              width: '100%',
              padding: '2px 4px',
              border: '1px solid #444',
              borderRadius: '2px',
              background: '#2a2a2a',
              color: '#fff',
              fontSize: '11px'
            }}
          />
        );
      
      case 'string':
        return (
          <input
            type="text"
            value={item.value}
            onChange={(e) => onChange(item.path, e.target.value)}
            style={{
              width: '100%',
              padding: '2px 4px',
              border: '1px solid #444',
              borderRadius: '2px',
              background: '#2a2a2a',
              color: '#fff',
              fontSize: '11px'
            }}
          />
        );
      
      case 'boolean':
        return (
          <input
            type="checkbox"
            checked={item.value}
            onChange={(e) => onChange(item.path, e.target.checked)}
          />
        );
      
      case 'vector3':
        return (
          <Vector3Input
            value={item.value}
            onChange={(val) => onChange(item.path, val)}
          />
        );
      
      case 'color':
        return (
          <ColorInput
            value={item.value}
            onChange={(val) => onChange(item.path, val)}
          />
        );
      
      case 'enum':
        return (
          <select
            value={item.value}
            onChange={(e) => onChange(item.path, e.target.value)}
            style={{
              width: '100%',
              padding: '2px 4px',
              border: '1px solid #444',
              borderRadius: '2px',
              background: '#2a2a2a',
              color: '#fff',
              fontSize: '11px'
            }}
          >
            {item.options?.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      
      default:
        return <span>{String(item.value)}</span>;
    }
  };
  
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '4px 8px',
      borderBottom: '1px solid #333'
    }}>
      <span style={{ fontSize: '11px', color: '#aaa' }}>{item.label}</span>
      <div style={{ flex: 1, marginLeft: '8px' }}>{renderInput()}</div>
    </div>
  );
};

/**
 * Property group with expand/collapse
 */
const PropertyGroupComponent: React.FC<{
  group: PropertyGroup;
  onToggle: () => void;
  onPropertyChange: (path: string, value: any) => void;
  readOnly?: boolean;
}> = ({ group, onToggle, onPropertyChange, readOnly }) => {
  return (
    <div style={{ marginBottom: '8px' }}>
      <div
        onClick={onToggle}
        style={{
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
        }}
      >
        <span style={{ marginRight: '6px', fontSize: '10px' }}>
          {group.expanded ? '▼' : '▶'}
        </span>
        {group.name}
      </div>
      
      {group.expanded && (
        <div>
          {group.properties.map(prop => (
            <PropertyRow
              key={prop.path}
              item={prop}
              onChange={onPropertyChange}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Main Property Panel Component
 */
export const PropertyPanel: React.FC<PropertyPanelProps> = ({
  selectedObject = null,
  readOnly = false,
  showAdvanced = false,
  onPropertyChange,
  customEditors
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    'Transform': true,
    'Material': true,
    'Geometry': false,
    'Advanced': false
  });
  
  // Extract properties from selected object
  const propertyGroups = useMemo(() => {
    if (!selectedObject) return [];
    
    const groups: PropertyGroup[] = [];
    
    // Transform properties
    const transformProps: PropertyItem[] = [
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
      const material = selectedObject.material as THREE.Material;
      const materialProps: PropertyItem[] = [
        {
          path: 'material.name',
          label: 'Name',
          value: material.name || 'Unnamed',
          type: 'string'
        },
        {
          path: 'material.color',
          label: 'Color',
          value: (material as any).color || new THREE.Color(0xffffff),
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
        materialProps.push(
          {
            path: 'material.roughness',
            label: 'Roughness',
            value: material.roughness,
            type: 'number',
            min: 0,
            max: 1,
            step: 0.01
          },
          {
            path: 'material.metalness',
            label: 'Metalness',
            value: material.metalness,
            type: 'number',
            min: 0,
            max: 1,
            step: 0.01
          },
          {
            path: 'material.flatShading',
            label: 'Flat Shading',
            value: material.flatShading,
            type: 'boolean'
          }
        );
      }
      
      groups.push({
        name: 'Material',
        expanded: expandedGroups['Material'] ?? false,
        properties: materialProps
      });
    }
    
    // Geometry properties
    if ('geometry' in selectedObject && selectedObject.geometry) {
      const geometry = selectedObject.geometry as THREE.BufferGeometry;
      const geomProps: PropertyItem[] = [
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
      const advancedProps: PropertyItem[] = [
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
  const handleGroupToggle = useCallback((groupName: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  }, []);
  
  // Handle property change
  const handlePropertyChange = useCallback((path: string, value: any) => {
    if (!selectedObject || readOnly) return;
    
    const parts = path.split('.');
    
    if (parts[0] === 'position' && value instanceof THREE.Vector3) {
      selectedObject.position.copy(value);
    } else if (parts[0] === 'rotation' && value instanceof THREE.Vector3) {
      selectedObject.rotation.set(value.x, value.y, value.z);
    } else if (parts[0] === 'scale' && value instanceof THREE.Vector3) {
      selectedObject.scale.copy(value);
    } else if (parts[0] === 'material') {
      const material = (selectedObject as any).material;
      if (material) {
        const prop = parts[1];
        if (prop === 'side') {
          material[prop] = ['FrontSide', 'BackSide', 'DoubleSide'].indexOf(value);
        } else if (prop === 'color' && value instanceof THREE.Color) {
          material[prop] = value;
        } else {
          material[prop] = value;
        }
        material.needsUpdate = true;
      }
    } else if (parts[0] === 'name') {
      selectedObject.name = value;
    } else if (parts[0] === 'visible') {
      selectedObject.visible = value;
    } else if (parts[0] === 'castShadow') {
      selectedObject.castShadow = value;
    } else if (parts[0] === 'receiveShadow') {
      selectedObject.receiveShadow = value;
    } else if (parts[0] === 'frustumCulled') {
      selectedObject.frustumCulled = value;
    }
    
    // Notify parent
    onPropertyChange?.(path, value);
  }, [selectedObject, readOnly, onPropertyChange]);
  
  if (!selectedObject) {
    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        color: '#888',
        fontSize: '12px'
      }}>
        Select an object to view properties
      </div>
    );
  }
  
  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflow: 'auto',
      background: '#1a1a1a',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '11px'
    }}>
      <div style={{
        padding: '8px',
        borderBottom: '1px solid #333',
        fontWeight: 'bold',
        color: '#fff'
      }}>
        Properties
        {selectedObject.name && (
          <span style={{ fontWeight: 'normal', color: '#888', marginLeft: '8px' }}>
            - {selectedObject.name}
          </span>
        )}
      </div>
      
      {propertyGroups.map(group => (
        <PropertyGroupComponent
          key={group.name}
          group={group}
          onToggle={() => handleGroupToggle(group.name)}
          onPropertyChange={handlePropertyChange}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
};

export default PropertyPanel;
