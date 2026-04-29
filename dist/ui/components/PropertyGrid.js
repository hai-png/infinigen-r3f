import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo } from 'react';
/**
 * PropertyGrid - Grid editor for object properties with various input types
 */
const PropertyGrid = ({ title, properties, searchable = true, }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedSections, setExpandedSections] = useState({});
    const filteredProperties = useMemo(() => {
        if (!searchTerm)
            return properties;
        return properties.filter((prop) => prop.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [properties, searchTerm]);
    const renderValueInput = (property) => {
        const { type, value, onChange, min, max, step, options } = property;
        switch (type) {
            case 'boolean':
                return (_jsx("input", { type: "checkbox", checked: value, onChange: (e) => onChange(e.target.checked), style: { cursor: 'pointer' } }));
            case 'number':
                return (_jsx("input", { type: "number", value: value, onChange: (e) => onChange(parseFloat(e.target.value)), min: min, max: max, step: step || 1, style: {
                        width: '100%',
                        padding: '4px 8px',
                        backgroundColor: 'var(--input-bg, #2a2a2a)',
                        border: '1px solid var(--input-border, #444)',
                        borderRadius: '3px',
                        color: 'var(--text-primary, #fff)',
                        fontSize: '12px',
                    } }));
            case 'string':
                return (_jsx("input", { type: "text", value: value, onChange: (e) => onChange(e.target.value), style: {
                        width: '100%',
                        padding: '4px 8px',
                        backgroundColor: 'var(--input-bg, #2a2a2a)',
                        border: '1px solid var(--input-border, #444)',
                        borderRadius: '3px',
                        color: 'var(--text-primary, #fff)',
                        fontSize: '12px',
                    } }));
            case 'color':
                return (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '8px' }, children: [_jsx("input", { type: "color", value: value, onChange: (e) => onChange(e.target.value), style: {
                                width: '32px',
                                height: '24px',
                                border: 'none',
                                cursor: 'pointer',
                                padding: 0,
                            } }), _jsx("span", { style: { fontSize: '11px', color: 'var(--text-secondary, #888)' }, children: value })] }));
            case 'vector':
                return (_jsx("div", { style: { display: 'flex', gap: '4px' }, children: value.map((v, i) => (_jsx("input", { type: "number", value: v, onChange: (e) => {
                            const newValue = [...value];
                            newValue[i] = parseFloat(e.target.value);
                            onChange(newValue);
                        }, step: step || 0.1, style: {
                            width: '100%',
                            padding: '4px 4px',
                            backgroundColor: 'var(--input-bg, #2a2a2a)',
                            border: '1px solid var(--input-border, #444)',
                            borderRadius: '3px',
                            color: 'var(--text-primary, #fff)',
                            fontSize: '11px',
                        } }, i))) }));
            case 'select':
                return (_jsx("select", { value: value, onChange: (e) => onChange(e.target.value), style: {
                        width: '100%',
                        padding: '4px 8px',
                        backgroundColor: 'var(--input-bg, #2a2a2a)',
                        border: '1px solid var(--input-border, #444)',
                        borderRadius: '3px',
                        color: 'var(--text-primary, #fff)',
                        fontSize: '12px',
                        cursor: 'pointer',
                    }, children: options?.map((opt) => (_jsx("option", { value: opt.value, children: opt.label }, String(opt.value)))) }));
            default:
                return _jsx("span", { children: String(value) });
        }
    };
    return (_jsxs("div", { style: {
            backgroundColor: 'var(--panel-bg, #1e1e1e)',
            border: '1px solid var(--panel-border, #333)',
            borderRadius: '4px',
            overflow: 'hidden',
        }, children: [title && (_jsx("div", { style: {
                    padding: '8px 12px',
                    backgroundColor: 'var(--panel-header, #252525)',
                    borderBottom: '1px solid var(--panel-border, #333)',
                    fontWeight: 600,
                    fontSize: '13px',
                    color: 'var(--text-primary, #fff)',
                }, children: title })), searchable && (_jsx("div", { style: { padding: '8px', borderBottom: '1px solid var(--panel-border, #333)' }, children: _jsx("input", { type: "text", placeholder: "Search properties...", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value), style: {
                        width: '100%',
                        padding: '6px 10px',
                        backgroundColor: 'var(--input-bg, #2a2a2a)',
                        border: '1px solid var(--input-border, #444)',
                        borderRadius: '3px',
                        color: 'var(--text-primary, #fff)',
                        fontSize: '12px',
                    } }) })), _jsxs("div", { style: { maxHeight: '500px', overflowY: 'auto' }, children: [filteredProperties.map((property, index) => (_jsxs("div", { style: {
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            alignItems: 'center',
                            padding: '8px 12px',
                            borderBottom: index < filteredProperties.length - 1 ? '1px solid var(--border, #2a2a2a)' : 'none',
                            fontSize: '12px',
                        }, children: [_jsx("span", { style: {
                                    color: 'var(--text-secondary, #aaa)',
                                    fontWeight: 500,
                                }, children: property.name }), _jsx("div", { children: renderValueInput(property) })] }, property.name))), filteredProperties.length === 0 && (_jsx("div", { style: {
                            padding: '20px',
                            textAlign: 'center',
                            color: 'var(--text-disabled, #666)',
                            fontSize: '12px',
                        }, children: "No properties found" }))] })] }));
};
export default PropertyGrid;
//# sourceMappingURL=PropertyGrid.js.map