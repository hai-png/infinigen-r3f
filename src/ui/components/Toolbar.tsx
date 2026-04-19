import React from 'react';
import { ToolbarProps } from '../types';

/**
 * Toolbar - Horizontal or vertical toolbar with action buttons
 */
const Toolbar: React.FC<ToolbarProps> = ({
  buttons,
  orientation = 'horizontal',
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: orientation === 'horizontal' ? 'row' : 'column',
        gap: '4px',
        padding: '8px',
        backgroundColor: 'var(--toolbar-bg, #252525)',
        border: '1px solid var(--toolbar-border, #333)',
        borderRadius: '4px',
      }}
    >
      {buttons.map((button) => (
        <button
          key={button.id}
          onClick={button.onClick}
          disabled={button.disabled}
          title={button.tooltip}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            backgroundColor: button.disabled
              ? 'var(--button-disabled, #3a3a3a)'
              : 'var(--button-bg, #2a2a2a)',
            border: '1px solid var(--button-border, #444)',
            borderRadius: '4px',
            color: button.disabled
              ? 'var(--text-disabled, #666)'
              : 'var(--text-primary, #fff)',
            cursor: button.disabled ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            fontWeight: 500,
            transition: 'all 0.15s ease',
            opacity: button.disabled ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (!button.disabled) {
              e.currentTarget.style.backgroundColor = 'var(--button-hover, #3a3a3a)';
              e.currentTarget.style.borderColor = 'var(--button-border-hover, #555)';
            }
          }}
          onMouseLeave={(e) => {
            if (!button.disabled) {
              e.currentTarget.style.backgroundColor = 'var(--button-bg, #2a2a2a)';
              e.currentTarget.style.borderColor = 'var(--button-border, #444)';
            }
          }}
        >
          <span
            style={{
              fontSize: '14px',
              fontFamily: 'monospace',
            }}
          >
            {button.icon}
          </span>
          <span>{button.label}</span>
        </button>
      ))}
    </div>
  );
};

export default Toolbar;
