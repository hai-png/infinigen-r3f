import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
/**
 * StatusBar - Status bar component for displaying messages and system status
 */
const StatusBar = () => {
    const [messages, setMessages] = useState([]);
    // Listen for status messages via custom event
    useEffect(() => {
        const handleStatusMessage = (event) => {
            const message = event.detail;
            setMessages((prev) => [...prev.slice(-4), message]);
            if (message.duration && message.duration > 0) {
                setTimeout(() => {
                    setMessages((prev) => prev.filter((m) => m !== message));
                }, message.duration);
            }
        };
        window.addEventListener('status-message', handleStatusMessage);
        return () => window.removeEventListener('status-message', handleStatusMessage);
    }, []);
    const getMessageColor = (type) => {
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
    const getMessageIcon = (type) => {
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
    return (_jsxs("div", { style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 12px',
            backgroundColor: 'var(--statusbar-bg, #1a1a1a)',
            borderTop: '1px solid var(--statusbar-border, #333)',
            fontSize: '11px',
            color: 'var(--text-secondary, #888)',
            minHeight: '24px',
        }, children: [_jsx("div", { style: { display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }, children: messages.length > 0 ? (messages.map((message, index) => (_jsxs("span", { style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: getMessageColor(message.type),
                        animation: 'fadeIn 0.3s ease',
                    }, children: [_jsx("span", { children: getMessageIcon(message.type) }), _jsx("span", { children: message.text })] }, index)))) : (_jsx("span", { children: "Ready" })) }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '16px' }, children: [_jsxs("span", { children: ["Objects: ", _jsx("span", { id: "status-object-count", children: "0" })] }), _jsxs("span", { children: ["Constraints: ", _jsx("span", { id: "status-constraint-count", children: "0" })] }), _jsxs("span", { children: ["FPS: ", _jsx("span", { id: "status-fps", children: "60" })] })] }), _jsx("style", { children: `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      ` })] }));
};
export default StatusBar;
//# sourceMappingURL=StatusBar.js.map