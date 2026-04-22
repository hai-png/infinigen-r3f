/**
 * Performance Monitor - Phase 12
 * Real-time performance monitoring and diagnostics
 */

import React, { useState, useEffect, useMemo } from 'react';

interface FrameStats {
  fps: number;
  frameTime: number;
  drawCalls: number;
  triangles: number;
  points: number;
  memory: {
    geometries: number;
    textures: number;
    total: number;
  };
}

interface PerformanceMonitorProps {
  enabled?: boolean;
  showGraph?: boolean;
  updateInterval?: number;
  warningThresholds?: {
    fps: number;
    frameTime: number;
    drawCalls: number;
    memoryMB: number;
  };
  onPerformanceWarning?: (stats: FrameStats) => void;
}

export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  enabled = true,
  showGraph = true,
  updateInterval = 500,
  warningThresholds = {
    fps: 30,
    frameTime: 33,
    drawCalls: 1000,
    memoryMB: 512,
  },
  onPerformanceWarning,
}) => {
  const [stats, setStats] = useState<FrameStats>({
    fps: 60,
    frameTime: 16.67,
    drawCalls: 0,
    triangles: 0,
    points: 0,
    memory: {
      geometries: 0,
      textures: 0,
      total: 0,
    },
  });

  const [history, setHistory] = useState<number[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastWarning, setLastWarning] = useState<string | null>(null);

  // Simulate stats collection (in real implementation, this would hook into Three.js renderer)
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      // In a real implementation, you'd get these from the renderer
      const newStats: FrameStats = {
        fps: Math.round(1000 / (Math.random() * 10 + 10)),
        frameTime: Math.random() * 10 + 10,
        drawCalls: Math.floor(Math.random() * 500) + 100,
        triangles: Math.floor(Math.random() * 100000) + 10000,
        points: Math.floor(Math.random() * 1000),
        memory: {
          geometries: Math.floor(Math.random() * 100) + 10,
          textures: Math.floor(Math.random() * 50) + 5,
          total: Math.floor(Math.random() * 200) + 50,
        },
      };

      setStats(newStats);
      setHistory(prev => [...prev.slice(-59), newStats.fps]);

      // Check for warnings
      if (newStats.fps < warningThresholds.fps) {
        const warningMsg = `Low FPS: ${newStats.fps}`;
        if (lastWarning !== warningMsg) {
          setLastWarning(warningMsg);
          onPerformanceWarning?.(newStats);
        }
      } else if (newStats.frameTime > warningThresholds.frameTime) {
        const warningMsg = `High frame time: ${newStats.frameTime.toFixed(2)}ms`;
        if (lastWarning !== warningMsg) {
          setLastWarning(warningMsg);
          onPerformanceWarning?.(newStats);
        }
      } else if (newStats.drawCalls > warningThresholds.drawCalls) {
        const warningMsg = `High draw calls: ${newStats.drawCalls}`;
        if (lastWarning !== warningMsg) {
          setLastWarning(warningMsg);
          onPerformanceWarning?.(newStats);
        }
      } else {
        setLastWarning(null);
      }
    }, updateInterval);

    return () => clearInterval(interval);
  }, [enabled, updateInterval, warningThresholds, onPerformanceWarning, lastWarning]);

  const getStatusColor = useMemo(() => {
    if (stats.fps >= 60) return '#4caf50';
    if (stats.fps >= 30) return '#ff9800';
    return '#f44336';
  }, [stats.fps]);

  const getMemoryStatus = useMemo(() => {
    if (stats.memory.total < 256) return '#4caf50';
    if (stats.memory.total < 512) return '#ff9800';
    return '#f44336';
  }, [stats.memory.total]);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (!enabled) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 10,
      left: 10,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      borderRadius: '8px',
      padding: '12px',
      color: 'white',
      fontFamily: 'monospace',
      fontSize: '11px',
      zIndex: 1000,
      minWidth: '200px',
      transition: 'all 0.3s ease',
    }}>
      {/* Header */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          marginBottom: '8px',
        }}
      >
        <div style={{ fontWeight: 'bold', fontSize: '12px' }}>
          📊 Performance
        </div>
        <div style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: getStatusColor,
          animation: stats.fps < 30 ? 'pulse 1s infinite' : 'none',
        }} />
      </div>

      {/* Main Stats */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: '#aaa' }}>FPS:</span>
          <span style={{ 
            color: getStatusColor, 
            fontWeight: 'bold',
            fontSize: '14px',
          }}>
            {stats.fps}
          </span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: '#aaa' }}>Frame Time:</span>
          <span style={{ color: stats.frameTime > 33 ? '#f44336' : '#aaa' }}>
            {stats.frameTime.toFixed(2)}ms
          </span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: '#aaa' }}>Draw Calls:</span>
          <span style={{ color: stats.drawCalls > 1000 ? '#ff9800' : '#aaa' }}>
            {formatNumber(stats.drawCalls)}
          </span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: '#aaa' }}>Triangles:</span>
          <span style={{ color: '#aaa' }}>{formatNumber(stats.triangles)}</span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#aaa' }}>Memory:</span>
          <span style={{ color: getMemoryStatus }}>
            {stats.memory.total}MB
          </span>
        </div>
      </div>

      {/* Warning */}
      {lastWarning && (
        <div style={{
          backgroundColor: 'rgba(244, 67, 54, 0.2)',
          border: '1px solid #f44336',
          borderRadius: '4px',
          padding: '6px',
          marginBottom: '8px',
          color: '#ff8a80',
          fontSize: '10px',
        }}>
          ⚠️ {lastWarning}
        </div>
      )}

      {/* Expanded View */}
      {isExpanded && (
        <>
          <div style={{ borderTop: '1px solid #444', margin: '8px 0' }} />
          
          {/* Memory Breakdown */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px', fontSize: '10px' }}>
              Memory Breakdown
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span style={{ color: '#aaa' }}>Geometries:</span>
              <span>{stats.memory.geometries}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#aaa' }}>Textures:</span>
              <span>{stats.memory.textures}</span>
            </div>
          </div>

          {/* FPS Graph */}
          {showGraph && history.length > 0 && (
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '4px', fontSize: '10px' }}>
                FPS History (60 frames)
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'flex-end',
                height: '60px',
                gap: '1px',
                background: 'rgba(0, 0, 0, 0.5)',
                padding: '4px',
                borderRadius: '4px',
              }}>
                {history.map((fps, idx) => (
                  <div
                    key={idx}
                    style={{
                      flex: 1,
                      height: `${(fps / 60) * 100}%`,
                      background: fps >= 60 ? '#4caf50' : fps >= 30 ? '#ff9800' : '#f44336',
                      borderRadius: '1px 1px 0 0',
                      minHeight: '2px',
                    }}
                  />
                ))}
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '4px',
                fontSize: '9px',
                color: '#666',
              }}>
                <span>Older</span>
                <span>Newer</span>
              </div>
            </div>
          )}

          {/* Recommendations */}
          {stats.fps < 30 && (
            <div style={{
              marginTop: '8px',
              padding: '6px',
              backgroundColor: 'rgba(255, 152, 0, 0.1)',
              border: '1px solid #ff9800',
              borderRadius: '4px',
              fontSize: '9px',
              color: '#ffcc80',
            }}>
              <strong>💡 Tips:</strong>
              <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
                <li>Reduce draw calls with batching</li>
                <li>Use instancing for repeated objects</li>
                <li>Implement LOD for distant objects</li>
                <li>Optimize texture sizes</li>
              </ul>
            </div>
          )}
        </>
      )}

      {/* CSS Animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

export default PerformanceMonitor;
