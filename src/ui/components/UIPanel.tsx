import React, { useState } from 'react';
import { UIPanelProps } from '../types';

/**
 * UIPanel - Collapsible panel component for organizing UI sections
 */
const UIPanel: React.FC<UIPanelProps> = ({
  title,
  collapsible = true,
  defaultCollapsed = false,
  children,
  onClose,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      style={{
        backgroundColor: 'var(--panel-bg, #1e1e1e)',
        border: '1px solid var(--panel-border, #333)',
        borderRadius: '4px',
        marginBottom: '8px',
        overflow: 'hidden',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Panel Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          backgroundColor: isHovered ? 'var(--panel-header-hover, #2a2a2a)' : 'var(--panel-header, #252525)',
          borderBottom: '1px solid var(--panel-border, #333)',
          cursor: collapsible ? 'pointer' : 'default',
          userSelect: 'none',
        }}
        onClick={() => collapsible && setIsCollapsed(!isCollapsed)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {collapsible && (
            <span
              style={{
                fontSize: '10px',
                color: 'var(--text-secondary, #888)',
                transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            >
              ▶
            </span>
          )}
          <span
            style={{
              fontWeight: 600,
              fontSize: '13px',
              color: 'var(--text-primary, #fff)',
            }}
          >
            {title}
          </span>
        </div>
        
        {onClose && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary, #888)',
              cursor: 'pointer',
              padding: '4px',
              fontSize: '16px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Panel Content */}
      {!isCollapsed && (
        <div
          style={{
            padding: '12px',
            maxHeight: '600px',
            overflowY: 'auto',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export default UIPanel;
