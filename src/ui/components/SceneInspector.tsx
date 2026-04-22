import React, { useState, useMemo } from 'react';
import { SceneGraphNode } from '../types';

interface SceneInspectorProps {
  sceneGraph?: SceneGraphNode[];
  selectedNodeId?: string;
  onSelectNode?: (nodeId: string) => void;
  onToggleVisibility?: (nodeId: string) => void;
  onToggleLock?: (nodeId: string) => void;
  onDeleteNode?: (nodeId: string) => void;
}

/**
 * SceneInspector - Tree view inspector for scene hierarchy
 */
const SceneInspector: React.FC<SceneInspectorProps> = ({
  sceneGraph = [],
  selectedNodeId,
  onSelectNode,
  onToggleVisibility,
  onToggleLock,
  onDeleteNode,
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['root']));
  const [searchTerm, setSearchTerm] = useState('');

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const filterNodes = (nodes: SceneGraphNode[]): SceneGraphNode[] => {
    if (!searchTerm) return nodes;
    
    return nodes.reduce<SceneGraphNode[]>((acc, node) => {
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

  const renderNode = (node: SceneGraphNode, depth: number = 0) => {
    const isSelected = node.id === selectedNodeId;
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id}>
        <div
          onClick={() => onSelectNode?.(node.id)}
          onDoubleClick={() => hasChildren && toggleExpand(node.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            paddingLeft: `${depth * 16 + 8}px`,
            backgroundColor: isSelected ? 'var(--selection-bg, #2a4a6a)' : 'transparent',
            cursor: 'pointer',
            userSelect: 'none',
            fontSize: '12px',
          }}
          onMouseEnter={(e) => {
            if (!isSelected) {
              e.currentTarget.style.backgroundColor = 'var(--hover-bg, #2a2a2a)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isSelected) {
              e.currentTarget.style.backgroundColor = 'transparent';
            }
          }}
        >
          {/* Expand/Collapse */}
          <span
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleExpand(node.id);
            }}
            style={{
              width: '16px',
              height: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px',
              color: 'var(--text-secondary, #888)',
              cursor: hasChildren ? 'pointer' : 'default',
            }}
          >
            {hasChildren ? (isExpanded ? '▼' : '▶') : '•'}
          </span>

          {/* Visibility Toggle */}
          <span
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility?.(node.id);
            }}
            style={{
              width: '16px',
              height: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              color: node.visible !== false ? 'var(--text-primary, #fff)' : 'var(--text-disabled, #666)',
              cursor: 'pointer',
            }}
            title={node.visible !== false ? 'Visible' : 'Hidden'}
          >
            {node.visible !== false ? '👁️' : '🚫'}
          </span>

          {/* Lock Toggle */}
          <span
            onClick={(e) => {
              e.stopPropagation();
              onToggleLock?.(node.id);
            }}
            style={{
              width: '16px',
              height: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px',
              color: node.locked ? 'var(--accent, #ffaa00)' : 'var(--text-secondary, #888)',
              cursor: 'pointer',
            }}
            title={node.locked ? 'Locked' : 'Unlocked'}
          >
            {node.locked ? '🔒' : '🔓'}
          </span>

          {/* Node Type Icon */}
          <span style={{ fontSize: '12px' }}>
            {getNodeIcon(node.type)}
          </span>

          {/* Node Name */}
          <span
            style={{
              color: isSelected ? 'var(--text-primary, #fff)' : 'var(--text-secondary, #aaa)',
              fontWeight: isSelected ? 600 : 400,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {node.name}
          </span>

          {/* Delete Button (on hover) */}
          <span
            onClick={(e) => {
              e.stopPropagation();
              onDeleteNode?.(node.id);
            }}
            style={{
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
            }}
            className="delete-btn"
            title="Delete"
          >
            ×
          </span>
        </div>

        {/* Render Children */}
        {isExpanded && hasChildren && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}

        <style>{`
          .delete-btn:hover {
            opacity: 1 !important;
          }
        `}</style>
      </div>
    );
  };

  const getNodeIcon = (type: string): string => {
    const iconMap: Record<string, string> = {
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--panel-bg, #1e1e1e)',
        border: '1px solid var(--panel-border, #333)',
        borderRadius: '4px',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          backgroundColor: 'var(--panel-header, #252525)',
          borderBottom: '1px solid var(--panel-border, #333)',
        }}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: '13px',
            color: 'var(--text-primary, #fff)',
            marginBottom: '8px',
          }}
        >
          Scene Inspector
        </div>
        <input
          type="text"
          placeholder="Search nodes..."
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

      {/* Node Tree */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredGraph.map((node) => renderNode(node))}

        {filteredGraph.length === 0 && (
          <div
            style={{
              padding: '20px',
              textAlign: 'center',
              color: 'var(--text-disabled, #666)',
              fontSize: '12px',
            }}
          >
            {searchTerm ? 'No matching nodes' : 'Scene is empty'}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div
        style={{
          padding: '6px 12px',
          backgroundColor: 'var(--panel-bg-secondary, #252525)',
          borderTop: '1px solid var(--panel-border, #333)',
          fontSize: '11px',
          color: 'var(--text-secondary, #888)',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>Total Nodes: {countNodes(sceneGraph)}</span>
        <span>Selected: {selectedNodeId || 'None'}</span>
      </div>
    </div>
  );
};

const countNodes = (nodes: SceneGraphNode[]): number => {
  return nodes.reduce((count, node) => {
    return count + 1 + countNodes(node.children);
  }, 0);
};

export default SceneInspector;
