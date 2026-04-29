import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export const ParticleEditor = ({ system, onUpdate, }) => {
    const handleChange = (key, value) => {
        onUpdate?.({ ...system, [key]: value });
    };
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', height: '100%' }, children: [_jsxs("div", { style: {
                    padding: '12px',
                    borderBottom: '1px solid #333',
                    backgroundColor: '#1e1e1e',
                }, children: [_jsx("h3", { style: { margin: 0, fontSize: '14px', fontWeight: 600 }, children: "\u2728 Particle Editor" }), _jsx("input", { type: "text", value: system.name, onChange: (e) => handleChange('name', e.target.value), style: {
                            marginTop: '8px',
                            width: '100%',
                            padding: '6px',
                            background: '#2d2d2d',
                            border: '1px solid #3c3c3c',
                            color: '#ccc',
                            borderRadius: '4px',
                        } })] }), _jsxs("div", { style: {
                    flex: 1,
                    overflowY: 'auto',
                    padding: '12px',
                }, children: [_jsxs("div", { style: { marginBottom: '16px' }, children: [_jsxs("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: ["Emission Rate: ", system.emissionRate, "/s"] }), _jsx("input", { type: "range", min: "0", max: "1000", step: "10", value: system.emissionRate, onChange: (e) => handleChange('emissionRate', parseInt(e.target.value)), style: { width: '100%' } })] }), _jsxs("div", { style: { marginBottom: '16px' }, children: [_jsxs("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: ["Lifetime: ", system.lifetime.toFixed(1), "s"] }), _jsx("input", { type: "range", min: "0.1", max: "10", step: "0.1", value: system.lifetime, onChange: (e) => handleChange('lifetime', parseFloat(e.target.value)), style: { width: '100%' } })] }), _jsxs("div", { style: { marginBottom: '16px' }, children: [_jsxs("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: ["Speed: ", system.speed.toFixed(1)] }), _jsx("input", { type: "range", min: "0", max: "50", step: "0.5", value: system.speed, onChange: (e) => handleChange('speed', parseFloat(e.target.value)), style: { width: '100%' } })] }), _jsxs("div", { style: { marginBottom: '16px' }, children: [_jsxs("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: ["Spread: ", system.spread.toFixed(0), "\u00B0"] }), _jsx("input", { type: "range", min: "0", max: "180", step: "5", value: system.spread, onChange: (e) => handleChange('spread', parseFloat(e.target.value)), style: { width: '100%' } })] }), _jsxs("div", { style: { marginBottom: '16px' }, children: [_jsx("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: "Gravity" }), _jsx("div", { style: { display: 'flex', gap: '4px' }, children: ['x', 'y', 'z'].map((axis, i) => (_jsx("input", { type: "number", value: system.gravity[i], onChange: (e) => {
                                        const newGravity = [...system.gravity];
                                        newGravity[i] = parseFloat(e.target.value);
                                        handleChange('gravity', newGravity);
                                    }, style: {
                                        flex: 1,
                                        padding: '6px',
                                        background: '#2d2d2d',
                                        border: '1px solid #3c3c3c',
                                        color: '#ccc',
                                        borderRadius: '4px',
                                        fontSize: '12px',
                                    } }, axis))) })] }), _jsxs("div", { style: { marginBottom: '16px' }, children: [_jsxs("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: ["Particle Size: ", system.size.toFixed(2)] }), _jsx("input", { type: "range", min: "0.01", max: "5", step: "0.01", value: system.size, onChange: (e) => handleChange('size', parseFloat(e.target.value)), style: { width: '100%' } })] }), _jsxs("div", { style: { marginBottom: '16px' }, children: [_jsx("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: "Start Color" }), _jsx("input", { type: "color", value: system.colorStart, onChange: (e) => handleChange('colorStart', e.target.value), style: { width: '100%', height: '30px', border: 'none', cursor: 'pointer' } })] }), _jsxs("div", { style: { marginBottom: '16px' }, children: [_jsx("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: "End Color" }), _jsx("input", { type: "color", value: system.colorEnd, onChange: (e) => handleChange('colorEnd', e.target.value), style: { width: '100%', height: '30px', border: 'none', cursor: 'pointer' } })] }), _jsxs("div", { children: [_jsx("label", { style: {
                                    display: 'block',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: '#aaa',
                                    marginBottom: '6px',
                                }, children: "Emitter Shape" }), _jsxs("select", { value: system.shape, onChange: (e) => handleChange('shape', e.target.value), style: {
                                    width: '100%',
                                    padding: '6px',
                                    background: '#2d2d2d',
                                    border: '1px solid #3c3c3c',
                                    color: '#ccc',
                                    borderRadius: '4px',
                                }, children: [_jsx("option", { value: "point", children: "Point" }), _jsx("option", { value: "sphere", children: "Sphere" }), _jsx("option", { value: "box", children: "Box" }), _jsx("option", { value: "cone", children: "Cone" })] })] })] })] }));
};
export default ParticleEditor;
//# sourceMappingURL=ParticleEditor.js.map