import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo } from 'react';
/**
 * SceneInspector - Tree view inspector for scene hierarchy
 */
const SceneInspector = ({ sceneGraph = [], selectedNodeId, onSelectNode, onToggleVisibility, onToggleLock, onDeleteNode, }) => {
    const [expandedNodes, setExpandedNodes] = useState(new Set(['root']));
    const [searchTerm, setSearchTerm] = useState('');
    const toggleExpand = (nodeId) => {
        setExpandedNodes((prev) => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            }
            else {
                next.add(nodeId);
            }
            return next;
        });
    };
    const filterNodes = (nodes) => {
        if (!searchTerm)
            return nodes;
        return nodes.reduce((acc, node) => {
            const matchesSearch = node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                node.type.toLowerCase().includes(searchTerm.toLowerCase());
            const filteredChildren = filterNodes(node.children);
            if (matchesSearch || filteredChildren.length > 0) {
                acc.push({
                    ...node,
                    children: filteredChildren.length > 0 ? filteredChildren : node.children,
                });
            }
            return acc;
        }, []);
    };
    const filteredGraph = useMemo(() => filterNodes(sceneGraph), [sceneGraph, searchTerm]);
    const renderNode = (node, depth = 0) => {
        const isSelected = node.id === selectedNodeId;
        const isExpanded = expandedNodes.has(node.id);
        const hasChildren = node.children && node.children.length > 0;
        return (_jsxs("div", { children: [_jsxs("div", { onClick: () => onSelectNode?.(node.id), onDoubleClick: () => hasChildren && toggleExpand(node.id), style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        paddingLeft: `${depth * 16 + 8}px`,
                        backgroundColor: isSelected ? 'var(--selection-bg, #2a4a6a)' : 'transparent',
                        cursor: 'pointer',
                        userSelect: 'none',
                        fontSize: '12px',
                    }, onMouseEnter: (e) => {
                        if (!isSelected) {
                            e.currentTarget.style.backgroundColor = 'var(--hover-bg, #2a2a2a)';
                        }
                    }, onMouseLeave: (e) => {
                        if (!isSelected) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                        }
                    }, children: [_jsx("span", { onClick: (e) => {
                                e.stopPropagation();
                                if (hasChildren)
                                    toggleExpand(node.id);
                            }, style: {
                                width: '16px',
                                height: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                color: 'var(--text-secondary, #888)',
                                cursor: hasChildren ? 'pointer' : 'default',
                            }, children: hasChildren ? (isExpanded ? '▼' : '▶') : '•' }), _jsx("span", { onClick: (e) => {
                                e.stopPropagation();
                                onToggleVisibility?.(node.id);
                            }, style: {
                                width: '16px',
                                height: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                color: node.visible !== false ? 'var(--text-primary, #fff)' : 'var(--text-disabled, #666)',
                                cursor: 'pointer',
                            }, title: node.visible !== false ? 'Visible' : 'Hidden', children: node.visible !== false ? '👁️' : '🚫' }), _jsx("span", { onClick: (e) => {
                                e.stopPropagation();
                                onToggleLock?.(node.id);
                            }, style: {
                                width: '16px',
                                height: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                color: node.locked ? 'var(--accent, #ffaa00)' : 'var(--text-secondary, #888)',
                                cursor: 'pointer',
                            }, title: node.locked ? 'Locked' : 'Unlocked', children: node.locked ? '🔒' : '🔓' }), _jsx("span", { style: { fontSize: '12px' }, children: getNodeIcon(node.type) }), _jsx("span", { style: {
                                color: isSelected ? 'var(--text-primary, #fff)' : 'var(--text-secondary, #aaa)',
                                fontWeight: isSelected ? 600 : 400,
                                flex: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }, children: node.name }), _jsx("span", { onClick: (e) => {
                                e.stopPropagation();
                                onDeleteNode?.(node.id);
                            }, style: {
                                width: '16px',
                                height: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                color: 'var(--error, #ff4444)',
                                cursor: 'pointer',
                                opacity: 0,
                                transition: 'opacity 0.15s',
                            }, className: "delete-btn", title: "Delete", children: "\u00D7" })] }), isExpanded && hasChildren && (_jsx("div", { children: node.children.map((child) => renderNode(child, depth + 1)) })), _jsx("style", { children: `
          .delete-btn:hover {
            opacity: 1 !important;
          }
        ` })] }, node.id));
    };
    const getNodeIcon = (type) => {
        const iconMap = {
            'Mesh': '🔷',
            'Light': '💡',
            'Camera': '📷',
            'Group': '📁',
            'Material': '🎨',
            'Geometry': '🔺',
            'Texture': '🖼️',
            'Animation': '🎬',
            'Particle': '✨',
            'Terrain': '🏔️',
            'Vegetation': '🌲',
            'Object': '📦',
        };
        return iconMap[type] || '📦';
    };
    return (_jsxs("div", { style: {
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            backgroundColor: 'var(--panel-bg, #1e1e1e)',
            border: '1px solid var(--panel-border, #333)',
            borderRadius: '4px',
            overflow: 'hidden',
        }, children: [_jsxs("div", { style: {
                    padding: '8px 12px',
                    backgroundColor: 'var(--panel-header, #252525)',
                    borderBottom: '1px solid var(--panel-border, #333)',
                }, children: [_jsx("div", { style: {
                            fontWeight: 600,
                            fontSize: '13px',
                            color: 'var(--text-primary, #fff)',
                            marginBottom: '8px',
                        }, children: "Scene Inspector" }), _jsx("input", { type: "text", placeholder: "Search nodes...", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value), style: {
                            width: '100%',
                            padding: '6px 10px',
                            backgroundColor: 'var(--input-bg, #2a2a2a)',
                            border: '1px solid var(--input-border, #444)',
                            borderRadius: '3px',
                            color: 'var(--text-primary, #fff)',
                            fontSize: '12px',
                        } })] }), _jsxs("div", { style: { flex: 1, overflowY: 'auto' }, children: [filteredGraph.map((node) => renderNode(node)), filteredGraph.length === 0 && (_jsx("div", { style: {
                            padding: '20px',
                            textAlign: 'center',
                            color: 'var(--text-disabled, #666)',
                            fontSize: '12px',
                        }, children: searchTerm ? 'No matching nodes' : 'Scene is empty' }))] }), _jsxs("div", { style: {
                    padding: '6px 12px',
                    backgroundColor: 'var(--panel-bg-secondary, #252525)',
                    borderTop: '1px solid var(--panel-border, #333)',
                    fontSize: '11px',
                    color: 'var(--text-secondary, #888)',
                    display: 'flex',
                    justifyContent: 'space-between',
                }, children: [_jsxs("span", { children: ["Total Nodes: ", countNodes(sceneGraph)] }), _jsxs("span", { children: ["Selected: ", selectedNodeId || 'None'] })] })] }));
};
const countNodes = (nodes) => {
    return nodes.reduce((count, node) => {
        return count + 1 + countNodes(node.children);
    }, 0);
};
export default SceneInspector;
//# sourceMappingURL=SceneInspector.js.map