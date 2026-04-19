import React, { useState, useEffect } from 'react';
import { StatusBarMessage } from '../types';

/**
 * StatusBar - Status bar component for displaying messages and system status
 */
const StatusBar: React.FC = () => {
  const [messages, setMessages] = useState<StatusBarMessage[]>([]);

  // Listen for status messages via custom event
  useEffect(() => {
    const handleStatusMessage = (event: CustomEvent<StatusBarMessage>) => {
      const message = event.detail;
      setMessages((prev) => [...prev.slice(-4), message]);

      if (message.duration && message.duration > 0) {
        setTimeout(() => {
          setMessages((prev) => prev.filter((m) => m !== message));
        }, message.duration);
      }
    };

    window.addEventListener('status-message' as any, handleStatusMessage as any);
    return () => window.removeEventListener('status-message' as any, handleStatusMessage as any);
  }, []);

  const getMessageColor = (type: StatusBarMessage['type']) => {
    switch (type) {
      case 'error':
        return '#ff4444';
      case 'warning':
        return '#ffaa00';
      case 'success':
        return '#44ff88';
      case 'info':
      default:
        return '#4488ff';
    }
  };

  const getMessageIcon = (type: StatusBarMessage['type']) => {
    switch (type) {
      case 'error':
        return '⛔';
      case 'warning':
        return '⚠️';
      case 'success':
        return '✅';
      case 'info':
      default:
        return 'ℹ️';
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 12px',
        backgroundColor: 'var(--statusbar-bg, #1a1a1a)',
        borderTop: '1px solid var(--statusbar-border, #333)',
        fontSize: '11px',
        color: 'var(--text-secondary, #888)',
        minHeight: '24px',
      }}
    >
      {/* Left side - Messages */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
        {messages.length > 0 ? (
          messages.map((message, index) => (
            <span
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                color: getMessageColor(message.type),
                animation: 'fadeIn 0.3s ease',
              }}
            >
              <span>{getMessageIcon(message.type)}</span>
              <span>{message.text}</span>
            </span>
          ))
        ) : (
          <span>Ready</span>
        )}
      </div>

      {/* Right side - System info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span>Objects: <span id="status-object-count">0</span></span>
        <span>Constraints: <span id="status-constraint-count">0</span></span>
        <span>FPS: <span id="status-fps">60</span></span>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default StatusBar;
