/**
 * Solver Profiler Component - Phase 12
 * Performance profiling and visualization for the constraint solver
 */

import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface SolverIteration {
  iteration: number;
  energy: number;
  violations: number;
  temperature?: number;
  acceptedMoves: number;
  rejectedMoves: number;
  proposalTime: number;
  evaluationTime: number;
  totalTime: number;
}

interface SolverProfilerProps {
  iterations: SolverIteration[];
  isSolving: boolean;
  solverType: 'mcmc' | 'greedy' | 'simulated-annealing';
  onReset?: () => void;
  onPause?: () => void;
  onResume?: () => void;
}

interface PerformanceStats {
  avgIterationTime: number;
  minEnergy: number;
  maxEnergy: number;
  currentEnergy: number;
  totalIterations: number;
  acceptanceRate: number;
  bestIteration: number;
  convergenceRate: number;
}

export const SolverProfiler: React.FC<SolverProfilerProps> = ({
  iterations,
  isSolving,
  solverType,
  onReset,
  onPause,
  onResume,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'energy' | 'timing' | 'moves'>('overview');
  const [timeRange, setTimeRange] = useState<{ start: number; end: number } | null>(null);

  const stats: PerformanceStats = useMemo(() => {
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
    
    const totalMoves = iterations.reduce(
      (sum, iter) => sum + iter.acceptedMoves + iter.rejectedMoves, 
      0
    );
    const acceptedMoves = iterations.reduce(
      (sum, iter) => sum + iter.acceptedMoves, 
      0
    );
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
    if (!timeRange) return iterations;
    return iterations.filter(
      (_, idx) => idx >= timeRange.start && idx <= timeRange.end
    );
  }, [iterations, timeRange]);

  const formatTime = (ms: number) => {
    if (ms < 1) return `${(ms * 1000).toFixed(2)}μs`;
    if (ms < 1000) return `${ms.toFixed(2)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatNumber = (num: number, decimals: number = 2) => {
    return num.toLocaleString(undefined, { 
      minimumFractionDigits: decimals, 
      maximumFractionDigits: decimals 
    });
  };

  return (
    <div style={{
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
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '12px',
      }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>
          📊 Solver Profiler
          <span style={{ 
            marginLeft: '8px', 
            fontSize: '12px', 
            color: '#888',
            fontWeight: 'normal',
          }}>
            ({solverType})
          </span>
        </h3>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          {isSolving ? (
            <button
              onClick={onPause}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                borderRadius: '4px',
                border: 'none',
                background: '#ff9800',
                color: 'white',
                cursor: 'pointer',
              }}
            >
              ⏸ Pause
            </button>
          ) : (
            <button
              onClick={onResume}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                borderRadius: '4px',
                border: 'none',
                background: '#4caf50',
                color: 'white',
                cursor: 'pointer',
              }}
            >
              ▶ Resume
            </button>
          )}
          
          <button
            onClick={onReset}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              borderRadius: '4px',
              border: 'none',
              background: '#f44336',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            🔄 Reset
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '8px',
        marginBottom: '12px',
      }}>
        <div style={{
          padding: '8px',
          background: 'linear-gradient(135deg, #1e3a5f 0%, #0d2137 100%)',
          borderRadius: '6px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#64b5f6' }}>
            {stats.totalIterations}
          </div>
          <div style={{ fontSize: '10px', color: '#90caf9', marginTop: '4px' }}>
            Iterations
          </div>
        </div>
        
        <div style={{
          padding: '8px',
          background: 'linear-gradient(135deg, #1b5e20 0%, #0d2b12 100%)',
          borderRadius: '6px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#81c784' }}>
            {formatNumber(stats.currentEnergy, 3)}
          </div>
          <div style={{ fontSize: '10px', color: '#a5d6a7', marginTop: '4px' }}>
            Current Energy
          </div>
        </div>
        
        <div style={{
          padding: '8px',
          background: 'linear-gradient(135deg, #4a148c 0%, #2a0a4e 100%)',
          borderRadius: '6px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ba68c8' }}>
            {formatNumber(stats.acceptanceRate, 1)}%
          </div>
          <div style={{ fontSize: '10px', color: '#ce93d8', marginTop: '4px' }}>
            Acceptance Rate
          </div>
        </div>
        
        <div style={{
          padding: '8px',
          background: 'linear-gradient(135deg, #bf360c 0%, #5a1a04 100%)',
          borderRadius: '6px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ff8a65' }}>
            {formatTime(stats.avgIterationTime)}
          </div>
          <div style={{ fontSize: '10px', color: '#ffccbc', marginTop: '4px' }}>
            Avg Iteration Time
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '4px',
        marginBottom: '12px',
        borderBottom: '1px solid #444',
        paddingBottom: '8px',
      }}>
        {(['overview', 'energy', 'timing', 'moves'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              borderRadius: '4px 4px 0 0',
              border: 'none',
              background: activeTab === tab ? '#007acc' : 'transparent',
              color: activeTab === tab ? 'white' : '#888',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Charts */}
      <div style={{ flex: 1, minHeight: '250px' }}>
        {activeTab === 'overview' && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#444" />
              <XAxis 
                dataKey="iteration" 
                stroke="#888" 
                fontSize={10}
                label={{ value: 'Iteration', position: 'insideBottom', offset: -5, fill: '#888' }}
              />
              <YAxis yAxisId="left" stroke="#64b5f6" fontSize={10} />
              <YAxis yAxisId="right" orientation="right" stroke="#81c784" fontSize={10} />
              <Tooltip 
                contentStyle={{ 
                  background: '#1e1e1e', 
                  border: '1px solid #444',
                  fontSize: '11px',
                }}
                labelStyle={{ color: '#fff' }}
              />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="energy" 
                stroke="#64b5f6" 
                strokeWidth={2}
                dot={false}
                name="Energy"
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="violations" 
                stroke="#81c784" 
                strokeWidth={2}
                dot={false}
                name="Violations"
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'energy' && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#444" />
              <XAxis 
                dataKey="iteration" 
                stroke="#888" 
                fontSize={10}
              />
              <YAxis stroke="#ff8a65" fontSize={10} />
              <Tooltip 
                contentStyle={{ 
                  background: '#1e1e1e', 
                  border: '1px solid #444',
                  fontSize: '11px',
                }}
              />
              <Line 
                type="monotone" 
                dataKey="energy" 
                stroke="#ff8a65" 
                strokeWidth={2}
                dot={false}
              />
              {solverType === 'simulated-annealing' && (
                <Line 
                  type="monotone" 
                  dataKey="temperature" 
                  stroke="#ba68c8" 
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="5 5"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'timing' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData.slice(-50)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#444" />
              <XAxis 
                dataKey="iteration" 
                stroke="#888" 
                fontSize={10}
              />
              <YAxis stroke="#4db6ac" fontSize={10} />
              <Tooltip 
                contentStyle={{ 
                  background: '#1e1e1e', 
                  border: '1px solid #444',
                  fontSize: '11px',
                }}
              />
              <Bar dataKey="proposalTime" fill="#4db6ac" name="Proposal" />
              <Bar dataKey="evaluationTime" fill="#26a69a" name="Evaluation" />
            </BarChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'moves' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData.slice(-50)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#444" />
              <XAxis 
                dataKey="iteration" 
                stroke="#888" 
                fontSize={10}
              />
              <YAxis stroke="#ffb74d" fontSize={10} />
              <Tooltip 
                contentStyle={{ 
                  background: '#1e1e1e', 
                  border: '1px solid #444',
                  fontSize: '11px',
                }}
              />
              <Bar dataKey="acceptedMoves" fill="#81c784" name="Accepted" />
              <Bar dataKey="rejectedMoves" fill="#e57373" name="Rejected" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Additional Info */}
      <div style={{
        marginTop: '12px',
        paddingTop: '12px',
        borderTop: '1px solid #444',
        fontSize: '11px',
        color: '#888',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <div>
          Best Iteration: <span style={{ color: '#81c784' }}>#{stats.bestIteration}</span>
          {' | '}
          Min Energy: <span style={{ color: '#ff8a65' }}>{formatNumber(stats.minEnergy, 3)}</span>
        </div>
        <div>
          Convergence: <span style={{ color: '#64b5f6' }}>{formatNumber(stats.convergenceRate, 1)}%</span>
        </div>
      </div>
    </div>
  );
};

export default SolverProfiler;
