import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * Solver Profiler Component - Phase 12
 * Performance profiling and visualization for the constraint solver
 */
import { useState, useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
export const SolverProfiler = ({ iterations, isSolving, solverType, onReset, onPause, onResume, }) => {
    const [activeTab, setActiveTab] = useState('overview');
    const [timeRange, setTimeRange] = useState(null);
    const stats = useMemo(() => {
        if (iterations.length === 0) {
            return {
                avgIterationTime: 0,
                minEnergy: 0,
                maxEnergy: 0,
                currentEnergy: 0,
                totalIterations: 0,
                acceptanceRate: 0,
                bestIteration: 0,
                convergenceRate: 0,
            };
        }
        const totalTime = iterations.reduce((sum, iter) => sum + iter.totalTime, 0);
        const energies = iterations.map(iter => iter.energy);
        const minEnergy = Math.min(...energies);
        const maxEnergy = Math.max(...energies);
        const currentEnergy = energies[energies.length - 1];
        const bestIteration = iterations.findIndex(iter => iter.energy === minEnergy);
        const totalMoves = iterations.reduce((sum, iter) => sum + iter.acceptedMoves + iter.rejectedMoves, 0);
        const acceptedMoves = iterations.reduce((sum, iter) => sum + iter.acceptedMoves, 0);
        const acceptanceRate = totalMoves > 0 ? (acceptedMoves / totalMoves) * 100 : 0;
        // Calculate convergence rate (energy reduction per iteration)
        let convergenceRate = 0;
        if (iterations.length > 10) {
            const earlyAvg = iterations.slice(0, 10).reduce((sum, i) => sum + i.energy, 0) / 10;
            const lateAvg = iterations.slice(-10).reduce((sum, i) => sum + i.energy, 0) / 10;
            convergenceRate = ((earlyAvg - lateAvg) / earlyAvg) * 100;
        }
        return {
            avgIterationTime: totalTime / iterations.length,
            minEnergy,
            maxEnergy,
            currentEnergy,
            totalIterations: iterations.length,
            acceptanceRate,
            bestIteration,
            convergenceRate,
        };
    }, [iterations]);
    const chartData = useMemo(() => {
        if (!timeRange)
            return iterations;
        return iterations.filter((_, idx) => idx >= timeRange.start && idx <= timeRange.end);
    }, [iterations, timeRange]);
    const formatTime = (ms) => {
        if (ms < 1)
            return `${(ms * 1000).toFixed(2)}μs`;
        if (ms < 1000)
            return `${ms.toFixed(2)}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    };
    const formatNumber = (num, decimals = 2) => {
        return num.toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    };
    return (_jsxs("div", { style: {
            position: 'absolute',
            bottom: 10,
            right: 10,
            width: '600px',
            maxHeight: '500px',
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            borderRadius: '8px',
            padding: '16px',
            color: 'white',
            fontFamily: 'monospace',
            zIndex: 1000,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
        }, children: [_jsxs("div", { style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                }, children: [_jsxs("h3", { style: { margin: 0, fontSize: '16px' }, children: ["\uD83D\uDCCA Solver Profiler", _jsxs("span", { style: {
                                    marginLeft: '8px',
                                    fontSize: '12px',
                                    color: '#888',
                                    fontWeight: 'normal',
                                }, children: ["(", solverType, ")"] })] }), _jsxs("div", { style: { display: 'flex', gap: '8px' }, children: [isSolving ? (_jsx("button", { onClick: onPause, style: {
                                    padding: '4px 12px',
                                    fontSize: '12px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: '#ff9800',
                                    color: 'white',
                                    cursor: 'pointer',
                                }, children: "\u23F8 Pause" })) : (_jsx("button", { onClick: onResume, style: {
                                    padding: '4px 12px',
                                    fontSize: '12px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: '#4caf50',
                                    color: 'white',
                                    cursor: 'pointer',
                                }, children: "\u25B6 Resume" })), _jsx("button", { onClick: onReset, style: {
                                    padding: '4px 12px',
                                    fontSize: '12px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: '#f44336',
                                    color: 'white',
                                    cursor: 'pointer',
                                }, children: "\uD83D\uDD04 Reset" })] })] }), _jsxs("div", { style: {
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '8px',
                    marginBottom: '12px',
                }, children: [_jsxs("div", { style: {
                            padding: '8px',
                            background: 'linear-gradient(135deg, #1e3a5f 0%, #0d2137 100%)',
                            borderRadius: '6px',
                            textAlign: 'center',
                        }, children: [_jsx("div", { style: { fontSize: '20px', fontWeight: 'bold', color: '#64b5f6' }, children: stats.totalIterations }), _jsx("div", { style: { fontSize: '10px', color: '#90caf9', marginTop: '4px' }, children: "Iterations" })] }), _jsxs("div", { style: {
                            padding: '8px',
                            background: 'linear-gradient(135deg, #1b5e20 0%, #0d2b12 100%)',
                            borderRadius: '6px',
                            textAlign: 'center',
                        }, children: [_jsx("div", { style: { fontSize: '20px', fontWeight: 'bold', color: '#81c784' }, children: formatNumber(stats.currentEnergy, 3) }), _jsx("div", { style: { fontSize: '10px', color: '#a5d6a7', marginTop: '4px' }, children: "Current Energy" })] }), _jsxs("div", { style: {
                            padding: '8px',
                            background: 'linear-gradient(135deg, #4a148c 0%, #2a0a4e 100%)',
                            borderRadius: '6px',
                            textAlign: 'center',
                        }, children: [_jsxs("div", { style: { fontSize: '20px', fontWeight: 'bold', color: '#ba68c8' }, children: [formatNumber(stats.acceptanceRate, 1), "%"] }), _jsx("div", { style: { fontSize: '10px', color: '#ce93d8', marginTop: '4px' }, children: "Acceptance Rate" })] }), _jsxs("div", { style: {
                            padding: '8px',
                            background: 'linear-gradient(135deg, #bf360c 0%, #5a1a04 100%)',
                            borderRadius: '6px',
                            textAlign: 'center',
                        }, children: [_jsx("div", { style: { fontSize: '20px', fontWeight: 'bold', color: '#ff8a65' }, children: formatTime(stats.avgIterationTime) }), _jsx("div", { style: { fontSize: '10px', color: '#ffccbc', marginTop: '4px' }, children: "Avg Iteration Time" })] })] }), _jsx("div", { style: {
                    display: 'flex',
                    gap: '4px',
                    marginBottom: '12px',
                    borderBottom: '1px solid #444',
                    paddingBottom: '8px',
                }, children: ['overview', 'energy', 'timing', 'moves'].map(tab => (_jsx("button", { onClick: () => setActiveTab(tab), style: {
                        padding: '6px 12px',
                        fontSize: '12px',
                        borderRadius: '4px 4px 0 0',
                        border: 'none',
                        background: activeTab === tab ? '#007acc' : 'transparent',
                        color: activeTab === tab ? 'white' : '#888',
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                    }, children: tab }, tab))) }), _jsxs("div", { style: { flex: 1, minHeight: '250px' }, children: [activeTab === 'overview' && (_jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(LineChart, { data: chartData, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "#444" }), _jsx(XAxis, { dataKey: "iteration", stroke: "#888", fontSize: 10, label: { value: 'Iteration', position: 'insideBottom', offset: -5, fill: '#888' } }), _jsx(YAxis, { yAxisId: "left", stroke: "#64b5f6", fontSize: 10 }), _jsx(YAxis, { yAxisId: "right", orientation: "right", stroke: "#81c784", fontSize: 10 }), _jsx(Tooltip, { contentStyle: {
                                        background: '#1e1e1e',
                                        border: '1px solid #444',
                                        fontSize: '11px',
                                    }, labelStyle: { color: '#fff' } }), _jsx(Line, { yAxisId: "left", type: "monotone", dataKey: "energy", stroke: "#64b5f6", strokeWidth: 2, dot: false, name: "Energy" }), _jsx(Line, { yAxisId: "right", type: "monotone", dataKey: "violations", stroke: "#81c784", strokeWidth: 2, dot: false, name: "Violations" })] }) })), activeTab === 'energy' && (_jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(LineChart, { data: chartData, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "#444" }), _jsx(XAxis, { dataKey: "iteration", stroke: "#888", fontSize: 10 }), _jsx(YAxis, { stroke: "#ff8a65", fontSize: 10 }), _jsx(Tooltip, { contentStyle: {
                                        background: '#1e1e1e',
                                        border: '1px solid #444',
                                        fontSize: '11px',
                                    } }), _jsx(Line, { type: "monotone", dataKey: "energy", stroke: "#ff8a65", strokeWidth: 2, dot: false }), solverType === 'simulated-annealing' && (_jsx(Line, { type: "monotone", dataKey: "temperature", stroke: "#ba68c8", strokeWidth: 2, dot: false, strokeDasharray: "5 5" }))] }) })), activeTab === 'timing' && (_jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(BarChart, { data: chartData.slice(-50), children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "#444" }), _jsx(XAxis, { dataKey: "iteration", stroke: "#888", fontSize: 10 }), _jsx(YAxis, { stroke: "#4db6ac", fontSize: 10 }), _jsx(Tooltip, { contentStyle: {
                                        background: '#1e1e1e',
                                        border: '1px solid #444',
                                        fontSize: '11px',
                                    } }), _jsx(Bar, { dataKey: "proposalTime", fill: "#4db6ac", name: "Proposal" }), _jsx(Bar, { dataKey: "evaluationTime", fill: "#26a69a", name: "Evaluation" })] }) })), activeTab === 'moves' && (_jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(BarChart, { data: chartData.slice(-50), children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "#444" }), _jsx(XAxis, { dataKey: "iteration", stroke: "#888", fontSize: 10 }), _jsx(YAxis, { stroke: "#ffb74d", fontSize: 10 }), _jsx(Tooltip, { contentStyle: {
                                        background: '#1e1e1e',
                                        border: '1px solid #444',
                                        fontSize: '11px',
                                    } }), _jsx(Bar, { dataKey: "acceptedMoves", fill: "#81c784", name: "Accepted" }), _jsx(Bar, { dataKey: "rejectedMoves", fill: "#e57373", name: "Rejected" })] }) }))] }), _jsxs("div", { style: {
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: '1px solid #444',
                    fontSize: '11px',
                    color: '#888',
                    display: 'flex',
                    justifyContent: 'space-between',
                }, children: [_jsxs("div", { children: ["Best Iteration: ", _jsxs("span", { style: { color: '#81c784' }, children: ["#", stats.bestIteration] }), ' | ', "Min Energy: ", _jsx("span", { style: { color: '#ff8a65' }, children: formatNumber(stats.minEnergy, 3) })] }), _jsxs("div", { children: ["Convergence: ", _jsxs("span", { style: { color: '#64b5f6' }, children: [formatNumber(stats.convergenceRate, 1), "%"] })] })] })] }));
};
export default SolverProfiler;
//# sourceMappingURL=SolverProfiler.js.map