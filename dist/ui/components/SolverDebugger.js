import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react';
/**
 * SolverDebugger - Debug panel for monitoring and controlling the constraint solver
 */
const SolverDebugger = ({ solverState, config, onRestart, onPause, onResume, onStep, }) => {
    const defaultConfig = {
        showIterations: true,
        showScores: true,
        showProposals: true,
        autoScroll: true,
        maxHistoryItems: 100,
        ...config,
    };
    const [log, setLog] = useState([]);
    const [isRunning, setIsRunning] = useState(false);
    const logContainerRef = useRef(null);
    // Update log when solver state changes
    useEffect(() => {
        if (!solverState)
            return;
        const newEntry = {
            iteration: solverState.iteration,
            score: solverState.currentScore,
            moveType: solverState.lastMove?.type,
            accepted: solverState.lastMoveAccepted ?? true,
            timestamp: Date.now(),
        };
        setLog((prev) => {
            const updated = [...prev, newEntry];
            if (updated.length > defaultConfig.maxHistoryItems) {
                return updated.slice(updated.length - defaultConfig.maxHistoryItems);
            }
            return updated;
        });
    }, [solverState]);
    // Auto-scroll log
    useEffect(() => {
        if (defaultConfig.autoScroll && logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [log, defaultConfig.autoScroll]);
    const handleRestart = () => {
        setLog([]);
        setIsRunning(false);
        onRestart?.();
    };
    const handlePause = () => {
        setIsRunning(false);
        onPause?.();
    };
    const handleResume = () => {
        setIsRunning(true);
        onResume?.();
    };
    const handleStep = () => {
        onStep?.();
    };
    const formatScore = (score) => score.toFixed(4);
    const formatTime = (timestamp) => {
        return new Date(timestamp).toLocaleTimeString();
    };
    const getMoveColor = (moveType, accepted) => {
        if (!accepted)
            return '#ff4444';
        switch (moveType) {
            case 'TranslateMove':
                return '#4488ff';
            case 'RotateMove':
                return '#44ff88';
            case 'SwapMove':
                return '#ffaa00';
            case 'AdditionMove':
                return '#aa44ff';
            case 'DeletionMove':
                return '#ff44aa';
            default:
                return '#888888';
        }
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
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    backgroundColor: 'var(--panel-header, #252525)',
                    borderBottom: '1px solid var(--panel-border, #333)',
                }, children: [_jsx("span", { style: {
                            fontWeight: 600,
                            fontSize: '13px',
                            color: 'var(--text-primary, #fff)',
                        }, children: "Solver Debugger" }), _jsxs("div", { style: { display: 'flex', gap: '4px' }, children: [_jsx("button", { onClick: handleRestart, style: buttonStyle, title: "Restart", children: "\uD83D\uDD04" }), isRunning ? (_jsx("button", { onClick: handlePause, style: buttonStyle, title: "Pause", children: "\u23F8\uFE0F" })) : (_jsx("button", { onClick: handleResume, style: buttonStyle, title: "Resume", children: "\u25B6\uFE0F" })), _jsx("button", { onClick: handleStep, style: buttonStyle, title: "Step", children: "\u23ED\uFE0F" })] })] }), solverState && (_jsxs("div", { style: {
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    padding: '8px 12px',
                    backgroundColor: 'var(--panel-bg-secondary, #252525)',
                    borderBottom: '1px solid var(--panel-border, #333)',
                    fontSize: '11px',
                }, children: [_jsxs("div", { children: [_jsx("div", { style: { color: 'var(--text-secondary, #888)' }, children: "Iteration" }), _jsx("div", { style: { color: 'var(--text-primary, #fff)', fontWeight: 600 }, children: solverState.iteration.toLocaleString() })] }), _jsxs("div", { children: [_jsx("div", { style: { color: 'var(--text-secondary, #888)' }, children: "Score" }), _jsx("div", { style: { color: 'var(--text-primary, #fff)', fontWeight: 600 }, children: formatScore(solverState.currentScore) })] }), _jsxs("div", { children: [_jsx("div", { style: { color: 'var(--text-secondary, #888)' }, children: "Temperature" }), _jsx("div", { style: { color: 'var(--text-primary, #fff)', fontWeight: 600 }, children: solverState.temperature?.toFixed(4) ?? 'N/A' })] }), _jsxs("div", { children: [_jsx("div", { style: { color: 'var(--text-secondary, #888)' }, children: "Best Score" }), _jsx("div", { style: { color: '#44ff88', fontWeight: 600 }, children: formatScore(solverState.bestScore ?? solverState.currentScore) })] })] })), _jsxs("div", { ref: logContainerRef, style: {
                    flex: 1,
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                }, children: [log.map((entry, index) => (_jsxs("div", { style: {
                            display: 'grid',
                            gridTemplateColumns: '60px 80px 100px 60px 60px',
                            padding: '4px 8px',
                            borderBottom: '1px solid var(--border, #2a2a2a)',
                            backgroundColor: entry.accepted ? 'transparent' : 'rgba(255, 68, 68, 0.1)',
                        }, children: [_jsx("span", { style: { color: 'var(--text-secondary, #888)' }, children: entry.iteration }), _jsx("span", { style: { color: entry.accepted ? '#44ff88' : '#ff4444' }, children: formatScore(entry.score) }), _jsx("span", { style: { color: getMoveColor(entry.moveType, entry.accepted) }, children: entry.moveType || 'Init' }), _jsx("span", { style: { color: entry.accepted ? '#44ff88' : '#ff4444' }, children: entry.accepted ? '✓' : '✗' }), _jsx("span", { style: { color: 'var(--text-disabled, #666)' }, children: formatTime(entry.timestamp) })] }, index))), log.length === 0 && (_jsx("div", { style: {
                            padding: '20px',
                            textAlign: 'center',
                            color: 'var(--text-disabled, #666)',
                        }, children: "No solver activity yet. Start the solver to see iterations." }))] })] }));
};
const buttonStyle = {
    background: 'none',
    border: '1px solid var(--button-border, #444)',
    borderRadius: '3px',
    padding: '4px 8px',
    cursor: 'pointer',
    fontSize: '12px',
    color: 'var(--text-primary, #fff)',
};
export default SolverDebugger;
//# sourceMappingURL=SolverDebugger.js.map