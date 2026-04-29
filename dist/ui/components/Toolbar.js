import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Toolbar - Horizontal or vertical toolbar with action buttons
 */
const Toolbar = ({ buttons, orientation = 'horizontal', }) => {
    return (_jsx("div", { style: {
            display: 'flex',
            flexDirection: orientation === 'horizontal' ? 'row' : 'column',
            gap: '4px',
            padding: '8px',
            backgroundColor: 'var(--toolbar-bg, #252525)',
            border: '1px solid var(--toolbar-border, #333)',
            borderRadius: '4px',
        }, children: buttons.map((button) => (_jsxs("button", { onClick: button.onClick, disabled: button.disabled, title: button.tooltip, style: {
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
            }, onMouseEnter: (e) => {
                if (!button.disabled) {
                    e.currentTarget.style.backgroundColor = 'var(--button-hover, #3a3a3a)';
                    e.currentTarget.style.borderColor = 'var(--button-border-hover, #555)';
                }
            }, onMouseLeave: (e) => {
                if (!button.disabled) {
                    e.currentTarget.style.backgroundColor = 'var(--button-bg, #2a2a2a)';
                    e.currentTarget.style.borderColor = 'var(--button-border, #444)';
                }
            }, children: [_jsx("span", { style: {
                        fontSize: '14px',
                        fontFamily: 'monospace',
                    }, children: button.icon }), _jsx("span", { children: button.label })] }, button.id))) }));
};
export default Toolbar;
//# sourceMappingURL=Toolbar.js.map