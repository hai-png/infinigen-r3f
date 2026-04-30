import React, { useState, useEffect, useRef } from 'react';
import { SolverDebuggerConfig } from '../types';
import { SolverState, Move } from '../../core/constraints/solver/moves';

export interface SolverDebuggerProps {
  solverState?: SolverState;
  config?: Partial<SolverDebuggerConfig>;
  onRestart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onStep?: () => void;
}

interface LogEntry {
  iteration: number;
  score: number;
  moveType?: string;
  accepted: boolean;
  timestamp: number;
}

/**
 * SolverDebugger - Debug panel for monitoring and controlling the constraint solver
 */
const SolverDebugger: React.FC<SolverDebuggerProps> = ({
  solverState,
  config,
  onRestart,
  onPause,
  onResume,
  onStep,
}) => {
  const defaultConfig: SolverDebuggerConfig = {
    showIterations: true,
    showScores: true,
    showProposals: true,
    autoScroll: true,
    maxHistoryItems: 100,
    ...config,
  };

  const [log, setLog] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Update log when solver state changes
  useEffect(() => {
    if (!solverState) return;

    const newEntry: LogEntry = {
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

  const formatScore = (score: number) => score.toFixed(4);
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getMoveColor = (moveType?: string, accepted?: boolean) => {
    if (!accepted) return '#ff4444';
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          backgroundColor: 'var(--panel-header, #252525)',
          borderBottom: '1px solid var(--panel-border, #333)',
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: '13px',
            color: 'var(--text-primary, #fff)',
          }}
        >
          Solver Debugger
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={handleRestart}
            style={buttonStyle}
            title="Restart"
          >
            🔄
          </button>
          {isRunning ? (
            <button
              onClick={handlePause}
              style={buttonStyle}
              title="Pause"
            >
              ⏸️
            </button>
          ) : (
            <button
              onClick={handleResume}
              style={buttonStyle}
              title="Resume"
            >
              ▶️
            </button>
          )}
          <button
            onClick={handleStep}
            style={buttonStyle}
            title="Step"
          >
            ⏭️
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {solverState && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            padding: '8px 12px',
            backgroundColor: 'var(--panel-bg-secondary, #252525)',
            borderBottom: '1px solid var(--panel-border, #333)',
            fontSize: '11px',
          }}
        >
          <div>
            <div style={{ color: 'var(--text-secondary, #888)' }}>Iteration</div>
            <div style={{ color: 'var(--text-primary, #fff)', fontWeight: 600 }}>
              {solverState.iteration.toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary, #888)' }}>Score</div>
            <div style={{ color: 'var(--text-primary, #fff)', fontWeight: 600 }}>
              {formatScore(solverState.currentScore)}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary, #888)' }}>Temperature</div>
            <div style={{ color: 'var(--text-primary, #fff)', fontWeight: 600 }}>
              {solverState.temperature?.toFixed(4) ?? 'N/A'}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary, #888)' }}>Best Score</div>
            <div style={{ color: '#44ff88', fontWeight: 600 }}>
              {formatScore(solverState.bestScore ?? solverState.currentScore)}
            </div>
          </div>
        </div>
      )}

      {/* Log Container */}
      <div
        ref={logContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: '11px',
        }}
      >
        {log.map((entry, index) => (
          <div
            key={index}
            style={{
              display: 'grid',
              gridTemplateColumns: '60px 80px 100px 60px 60px',
              padding: '4px 8px',
              borderBottom: '1px solid var(--border, #2a2a2a)',
              backgroundColor: entry.accepted ? 'transparent' : 'rgba(255, 68, 68, 0.1)',
            }}
          >
            <span style={{ color: 'var(--text-secondary, #888)' }}>
              {entry.iteration}
            </span>
            <span style={{ color: entry.accepted ? '#44ff88' : '#ff4444' }}>
              {formatScore(entry.score)}
            </span>
            <span style={{ color: getMoveColor(entry.moveType, entry.accepted) }}>
              {entry.moveType || 'Init'}
            </span>
            <span style={{ color: entry.accepted ? '#44ff88' : '#ff4444' }}>
              {entry.accepted ? '✓' : '✗'}
            </span>
            <span style={{ color: 'var(--text-disabled, #666)' }}>
              {formatTime(entry.timestamp)}
            </span>
          </div>
        ))}

        {log.length === 0 && (
          <div
            style={{
              padding: '20px',
              textAlign: 'center',
              color: 'var(--text-disabled, #666)',
            }}
          >
            No solver activity yet. Start the solver to see iterations.
          </div>
        )}
      </div>
    </div>
  );
};

const buttonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--button-border, #444)',
  borderRadius: '3px',
  padding: '4px 8px',
  cursor: 'pointer',
  fontSize: '12px',
  color: 'var(--text-primary, #fff)',
};

export default SolverDebugger;
