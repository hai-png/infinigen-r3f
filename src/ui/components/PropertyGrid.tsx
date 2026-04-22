import React, { useState, useMemo } from 'react';
import { PropertyGridProps, PropertyItem } from '../types';

/**
 * PropertyGrid - Grid editor for object properties with various input types
 */
const PropertyGrid: React.FC<PropertyGridProps> = ({
  title,
  properties,
  searchable = true,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const filteredProperties = useMemo(() => {
    if (!searchTerm) return properties;
    return properties.filter((prop) =>
      prop.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [properties, searchTerm]);

  const renderValueInput = (property: PropertyItem) => {
    const { type, value, onChange, min, max, step, options } = property;

    switch (type) {
      case 'boolean':
        return (
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => onChange(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
        );

      case 'number':
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            min={min}
            max={max}
            step={step || 1}
            style={{
              width: '100%',
              padding: '4px 8px',
              backgroundColor: 'var(--input-bg, #2a2a2a)',
              border: '1px solid var(--input-border, #444)',
              borderRadius: '3px',
              color: 'var(--text-primary, #fff)',
              fontSize: '12px',
            }}
          />
        );

      case 'string':
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: '100%',
              padding: '4px 8px',
              backgroundColor: 'var(--input-bg, #2a2a2a)',
              border: '1px solid var(--input-border, #444)',
              borderRadius: '3px',
              color: 'var(--text-primary, #fff)',
              fontSize: '12px',
            }}
          />
        );

      case 'color':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              style={{
                width: '32px',
                height: '24px',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-secondary, #888)' }}>
              {value}
            </span>
          </div>
        );

      case 'vector':
        return (
          <div style={{ display: 'flex', gap: '4px' }}>
            {(value as number[]).map((v, i) => (
              <input
                key={i}
                type="number"
                value={v}
                onChange={(e) => {
                  const newValue = [...value];
                  newValue[i] = parseFloat(e.target.value);
                  onChange(newValue);
                }}
                step={step || 0.1}
                style={{
                  width: '100%',
                  padding: '4px 4px',
                  backgroundColor: 'var(--input-bg, #2a2a2a)',
                  border: '1px solid var(--input-border, #444)',
                  borderRadius: '3px',
                  color: 'var(--text-primary, #fff)',
                  fontSize: '11px',
                }}
              />
            ))}
          </div>
        );

      case 'select':
        return (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: '100%',
              padding: '4px 8px',
              backgroundColor: 'var(--input-bg, #2a2a2a)',
              border: '1px solid var(--input-border, #444)',
              borderRadius: '3px',
              color: 'var(--text-primary, #fff)',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            {options?.map((opt) => (
              <option key={String(opt.value)} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      default:
        return <span>{String(value)}</span>;
    }
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--panel-bg, #1e1e1e)',
        border: '1px solid var(--panel-border, #333)',
        borderRadius: '4px',
        overflow: 'hidden',
      }}
    >
      {title && (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: 'var(--panel-header, #252525)',
            borderBottom: '1px solid var(--panel-border, #333)',
            fontWeight: 600,
            fontSize: '13px',
            color: 'var(--text-primary, #fff)',
          }}
        >
          {title}
        </div>
      )}

      {searchable && (
        <div style={{ padding: '8px', borderBottom: '1px solid var(--panel-border, #333)' }}>
          <input
            type="text"
            placeholder="Search properties..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px',
              backgroundColor: 'var(--input-bg, #2a2a2a)',
              border: '1px solid var(--input-border, #444)',
              borderRadius: '3px',
              color: 'var(--text-primary, #fff)',
              fontSize: '12px',
            }}
          />
        </div>
      )}

      <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
        {filteredProperties.map((property, index) => (
          <div
            key={property.name}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              alignItems: 'center',
              padding: '8px 12px',
              borderBottom: index < filteredProperties.length - 1 ? '1px solid var(--border, #2a2a2a)' : 'none',
              fontSize: '12px',
            }}
          >
            <span
              style={{
                color: 'var(--text-secondary, #aaa)',
                fontWeight: 500,
              }}
            >
              {property.name}
            </span>
            <div>{renderValueInput(property)}</div>
          </div>
        ))}

        {filteredProperties.length === 0 && (
          <div
            style={{
              padding: '20px',
              textAlign: 'center',
              color: 'var(--text-disabled, #666)',
              fontSize: '12px',
            }}
          >
            No properties found
          </div>
        )}
      </div>
    </div>
  );
};

export default PropertyGrid;
