import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
/**
 * PerformanceProfiler - Real-time performance monitoring dashboard
 */
const PerformanceProfiler = ({ metrics: externalMetrics, autoRefresh = true, refreshInterval = 1000, }) => {
    const [internalMetrics, setInternalMetrics] = useState({
        fps: 60,
        frameTime: 16.67,
        memoryUsage: 0,
        objectCount: 0,
        drawCalls: 0,
        triangleCount: 0,
        solverIterationTime: 0,
        constraintEvaluationTime: 0,
    });
    const [history, setHistory] = useState([]);
    const [isExpanded, setIsExpanded] = useState(false);
    // Update metrics from external source or simulate
    useEffect(() => {
        if (externalMetrics) {
            setInternalMetrics((prev) => ({ ...prev, ...externalMetrics }));
        }
        else if (autoRefresh) {
            const interval = setInterval(() => {
                // Simulate metrics for demo
                setInternalMetrics((prev) => ({
                    ...prev,
                    fps: Math.round(55 + Math.random() * 10),
                    frameTime: +(16 + Math.random() * 5).toFixed(2),
                    memoryUsage: Math.round(50 + Math.random() * 20),
                    drawCalls: Math.round(100 + Math.random() * 50),
                    triangleCount: Math.round(10000 + Math.random() * 5000),
                    solverIterationTime: +(0.5 + Math.random() * 2).toFixed(2),
                    constraintEvaluationTime: +(0.1 + Math.random() * 0.5).toFixed(2),
                }));
            }, refreshInterval);
            return () => clearInterval(interval);
        }
    }, [externalMetrics, autoRefresh, refreshInterval]);
    // Track FPS history
    useEffect(() => {
        setHistory((prev) => {
            const updated = [...prev, internalMetrics.fps];
            return updated.slice(-60); // Keep last 60 samples
        });
    }, [internalMetrics.fps]);
    const getFpsColor = (fps) => {
        if (fps >= 55)
            return '#44ff88';
        if (fps >= 30)
            return '#ffaa00';
        return '#ff4444';
    };
    const getFpsLabel = (fps) => {
        if (fps >= 55)
            return 'Excellent';
        if (fps >= 30)
            return 'Good';
        return 'Poor';
    };
    const formatBytes = (mb) => `${mb.toFixed(1)} MB`;
    const formatNumber = (n) => n.toLocaleString();
    return (_jsxs("div", { style: {
            backgroundColor: 'var(--panel-bg, #1e1e1e)',
            border: '1px solid var(--panel-border, #333)',
            borderRadius: '4px',
            overflow: 'hidden',
        }, children: [_jsxs("div", { onClick: () => setIsExpanded(!isExpanded), style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    backgroundColor: 'var(--panel-header, #252525)',
                    borderBottom: '1px solid var(--panel-border, #333)',
                    cursor: 'pointer',
                    userSelect: 'none',
                }, children: [_jsx("span", { style: {
                            fontWeight: 600,
                            fontSize: '13px',
                            color: 'var(--text-primary, #fff)',
                        }, children: "Performance Profiler" }), _jsx("span", { style: { fontSize: '10px', color: 'var(--text-secondary, #888)' }, children: isExpanded ? '▼' : '▶' })] }), _jsxs("div", { style: { padding: '12px' }, children: [_jsxs("div", { style: {
                            marginBottom: '16px',
                            textAlign: 'center',
                        }, children: [_jsx("div", { style: {
                                    fontSize: '36px',
                                    fontWeight: 700,
                                    color: getFpsColor(internalMetrics.fps),
                                    lineHeight: 1,
                                }, children: internalMetrics.fps }), _jsxs("div", { style: {
                                    fontSize: '11px',
                                    color: getFpsColor(internalMetrics.fps),
                                    marginTop: '4px',
                                }, children: ["FPS - ", getFpsLabel(internalMetrics.fps)] }), _jsxs("div", { style: {
                                    fontSize: '11px',
                                    color: 'var(--text-secondary, #888)',
                                    marginTop: '2px',
                                }, children: [internalMetrics.frameTime.toFixed(2), "ms frame time"] })] }), _jsx("div", { style: {
                            height: '40px',
                            backgroundColor: 'var(--graph-bg, #1a1a1a)',
                            borderRadius: '4px',
                            marginBottom: '16px',
                            position: 'relative',
                            overflow: 'hidden',
                        }, children: _jsxs("svg", { width: "100%", height: "100%", viewBox: `0 0 ${history.length} 60`, preserveAspectRatio: "none", children: [_jsx("polyline", { fill: "none", stroke: getFpsColor(internalMetrics.fps), strokeWidth: "2", points: history
                                        .map((fps, i) => `${i},${60 - (fps / 60) * 60}`)
                                        .join(' ') }), _jsx("line", { x1: "0", y1: "30", x2: history.length, y2: "30", stroke: "#ffaa00", strokeWidth: "0.5", strokeDasharray: "2,2" }), _jsx("line", { x1: "0", y1: "45", x2: history.length, y2: "45", stroke: "#44ff88", strokeWidth: "0.5", strokeDasharray: "2,2" })] }) }), isExpanded && (_jsxs("div", { style: {
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: '8px',
                            fontSize: '11px',
                        }, children: [_jsx(MetricItem, { label: "Memory", value: formatBytes(internalMetrics.memoryUsage) }), _jsx(MetricItem, { label: "Objects", value: formatNumber(internalMetrics.objectCount) }), _jsx(MetricItem, { label: "Draw Calls", value: formatNumber(internalMetrics.drawCalls) }), _jsx(MetricItem, { label: "Triangles", value: formatNumber(internalMetrics.triangleCount) }), _jsx(MetricItem, { label: "Solver Time", value: `${internalMetrics.solverIterationTime.toFixed(2)}ms` }), _jsx(MetricItem, { label: "Constraint Eval", value: `${internalMetrics.constraintEvaluationTime.toFixed(2)}ms` })] }))] })] }));
};
const MetricItem = ({ label, value }) => (_jsxs("div", { style: {
        padding: '8px',
        backgroundColor: 'var(--metric-bg, #252525)',
        borderRadius: '4px',
    }, children: [_jsx("div", { style: { color: 'var(--text-secondary, #888)', marginBottom: '4px' }, children: label }), _jsx("div", { style: { color: 'var(--text-primary, #fff)', fontWeight: 600 }, children: value })] }));
export default PerformanceProfiler;
//# sourceMappingURL=PerformanceProfiler.js.map