/**
 * TimelineEditor - Visual timeline for animation and keyframe editing
 * 
 * Provides an interactive timeline interface for creating, editing,
 * and managing animation keyframes and sequences.
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';

export interface Keyframe {
  /** Unique identifier */
  id: string;
  /** Time in seconds */
  time: number;
  /** Property path (e.g., "object.position.x") */
  property: string;
  /** Value at keyframe */
  value: any;
  /** Interpolation type */
  interpolation?: 'linear' | 'step' | 'bezier';
  /** Bezier control points (if bezier) */
  bezierPoints?: [number, number, number, number];
}

export interface AnimationTrack {
  /** Track name */
  name: string;
  /** Target object/property */
  target: string;
  /** Keyframes on this track */
  keyframes: Keyframe[];
  /** Track color */
  color?: string;
  /** Is track enabled */
  enabled?: boolean;
}

export interface TimelineEditorProps {
  /** Animation tracks */
  tracks?: AnimationTrack[];
  /** Current playback time */
  currentTime?: number;
  /** Total duration */
  duration?: number;
  /** Read-only mode */
  readOnly?: boolean;
  /** Zoom level (pixels per second) */
  zoom?: number;
  /** Callback when time changes */
  onTimeChange?: (time: number) => void;
  /** Callback when keyframe changes */
  onKeyframeChange?: (trackName: string, keyframe: Keyframe) => void;
  /** Callback when play/pause toggled */
  onPlayPause?: (playing: boolean) => void;
}

interface TimelineState {
  isPlaying: boolean;
  selectedKeyframe: string | null;
  zoom: number;
  scrollLeft: number;
}

/**
 * Individual keyframe marker
 */
const KeyframeMarker: React.FC<{
  keyframe: Keyframe;
  x: number;
  isSelected: boolean;
  color: string;
  onSelect: () => void;
  onDrag: (newTime: number) => void;
  onDelete: () => void;
  readOnly?: boolean;
}> = ({ 
  keyframe, 
  x, 
  isSelected, 
  color, 
  onSelect, 
  onDrag,
  onDelete,
  readOnly = false 
}) => {
  const [dragging, setDragging] = useState(false);
  const markerRef = useRef<HTMLDivElement>(null);
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (readOnly) return;
    
    e.stopPropagation();
    onSelect();
    setDragging(true);
    
    const startX = e.clientX;
    const startTime = keyframe.time;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = deltaX / 10; // pixels to seconds
      const newTime = Math.max(0, startTime + deltaTime);
      onDrag(newTime);
    };
    
    const handleMouseUp = () => {
      setDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [readOnly, onSelect, onDrag, keyframe.time]);
  
  return (
    <div
      ref={markerRef}
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        left: `${x - 6}px`,
        top: '50%',
        transform: 'translateY(-50%)',
        width: '12px',
        height: '12px',
        background: isSelected ? '#fff' : color,
        border: `2px solid ${color}`,
        borderRadius: '2px',
        cursor: readOnly ? 'default' : 'ew-resize',
        zIndex: isSelected ? 10 : 1,
        transition: dragging ? 'none' : 'background 0.1s'
      }}
      title={`${keyframe.property}: ${JSON.stringify(keyframe.value)}`}
    />
  );
};

/**
 * Animation track row
 */
const TrackRow: React.FC<{
  track: AnimationTrack;
  duration: number;
  zoom: number;
  selectedKeyframeId: string | null;
  onSelectKeyframe: (trackName: string, keyframeId: string) => void;
  onKeyframeDrag: (trackName: string, keyframeId: string, newTime: number) => void;
  onDeleteKeyframe: (trackName: string, keyframeId: string) => void;
  onAddKeyframe: (trackName: string, time: number) => void;
  readOnly?: boolean;
}> = ({
  track,
  duration,
  zoom,
  selectedKeyframeId,
  onSelectKeyframe,
  onKeyframeDrag,
  onDeleteKeyframe,
  onAddKeyframe,
  readOnly = false
}) => {
  const trackColor = track.color || '#4ec9b0';
  
  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if (readOnly) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = x / zoom;
    
    if (time >= 0 && time <= duration) {
      onAddKeyframe(track.name, time);
    }
  }, [readOnly, zoom, duration, track.name, onAddKeyframe]);
  
  return (
    <div
      onClick={handleTrackClick}
      style={{
        position: 'relative',
        height: '40px',
        borderBottom: '1px solid #333',
        background: track.enabled === false ? '#1a1a1a' : '#222',
        cursor: readOnly ? 'default' : 'pointer'
      }}
    >
      {/* Track label */}
      <div style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: '150px',
        padding: '8px',
        background: '#2a2a2a',
        borderRight: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        fontSize: '11px',
        color: '#fff',
        zIndex: 2
      }}>
        <div style={{
          width: '10px',
          height: '10px',
          background: trackColor,
          borderRadius: '2px',
          marginRight: '8px'
        }} />
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {track.name}
        </span>
      </div>
      
      {/* Keyframes area */}
      <div style={{
        position: 'absolute',
        left: '150px',
        right: 0,
        top: 0,
        bottom: 0
      }}>
        {/* Grid lines */}
        {Array.from({ length: Math.ceil(duration) + 1 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${i * zoom}px`,
              top: 0,
              bottom: 0,
              width: '1px',
              background: i % 5 === 0 ? '#444' : '#333'
            }}
          />
        ))}
        
        {/* Keyframes */}
        {track.keyframes.map(kf => (
          <KeyframeMarker
            key={kf.id}
            keyframe={kf}
            x={kf.time * zoom}
            isSelected={selectedKeyframeId === kf.id}
            color={trackColor}
            onSelect={() => onSelectKeyframe(track.name, kf.id)}
            onDrag={(newTime) => onKeyframeDrag(track.name, kf.id, newTime)}
            onDelete={() => onDeleteKeyframe(track.name, kf.id)}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * Time ruler
 */
const TimeRuler: React.FC<{
  duration: number;
  zoom: number;
  currentTime: number;
  onTimeScrub: (time: number) => void;
}> = ({ duration, zoom, currentTime, onTimeScrub }) => {
  const rulerRef = useRef<HTMLDivElement>(null);
  
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!rulerRef.current) return;
    
    const rect = rulerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.max(0, Math.min(duration, x / zoom));
    onTimeScrub(time);
  }, [zoom, duration, onTimeScrub]);
  
  return (
    <div
      ref={rulerRef}
      onClick={handleClick}
      style={{
        position: 'relative',
        height: '30px',
        background: '#1a1a1a',
        borderBottom: '1px solid #333',
        cursor: 'pointer',
        marginLeft: '150px'
      }}
    >
      {/* Time markers */}
      {Array.from({ length: Math.ceil(duration) + 1 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${i * zoom}px`,
            top: 0,
            bottom: 0,
            width: '1px',
            background: '#444'
          }}
        >
          <span style={{
            position: 'absolute',
            top: '2px',
            left: '2px',
            fontSize: '9px',
            color: '#888'
          }}>
            {i}s
          </span>
        </div>
      ))}
      
      {/* Playhead */}
      <div
        style={{
          position: 'absolute',
          left: `${currentTime * zoom}px`,
          top: 0,
          bottom: 0,
          width: '2px',
          background: '#ff4444',
          zIndex: 10
        }}
      >
        <div style={{
          position: 'absolute',
          top: 0,
          left: '-5px',
          width: 0,
          height: 0,
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderTop: '8px solid #ff4444'
        }} />
      </div>
    </div>
  );
};

/**
 * Playback controls
 */
const PlaybackControls: React.FC<{
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onStop: () => void;
  onGoToStart: () => void;
  onGoToEnd: () => void;
}> = ({ isPlaying, currentTime, duration, onPlayPause, onStop, onGoToStart, onGoToEnd }) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px'
    }}>
      <button
        onClick={onGoToStart}
        style={{
          padding: '4px 8px',
          border: 'none',
          borderRadius: '2px',
          background: '#333',
          color: '#fff',
          cursor: 'pointer',
          fontSize: '12px'
        }}
        title="Go to start"
      >
        ⏮
      </button>
      
      <button
        onClick={onPlayPause}
        style={{
          padding: '4px 12px',
          border: 'none',
          borderRadius: '2px',
          background: isPlaying ? '#cc3333' : '#007acc',
          color: '#fff',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 'bold'
        }}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      
      <button
        onClick={onStop}
        style={{
          padding: '4px 8px',
          border: 'none',
          borderRadius: '2px',
          background: '#333',
          color: '#fff',
          cursor: 'pointer',
          fontSize: '12px'
        }}
        title="Stop"
      >
        ⏹
      </button>
      
      <button
        onClick={onGoToEnd}
        style={{
          padding: '4px 8px',
          border: 'none',
          borderRadius: '2px',
          background: '#333',
          color: '#fff',
          cursor: 'pointer',
          fontSize: '12px'
        }}
        title="Go to end"
      >
        ⏭
      </button>
      
      <div style={{
        marginLeft: 'auto',
        fontSize: '11px',
        color: '#aaa'
      }}>
        {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
      </div>
    </div>
  );
};

/**
 * Main Timeline Editor Component
 */
export const TimelineEditor: React.FC<TimelineEditorProps> = ({
  tracks = [],
  currentTime = 0,
  duration = 30,
  readOnly = false,
  zoom = 50,
  onTimeChange,
  onKeyframeChange,
  onPlayPause
}) => {
  const [state, setState] = useState<TimelineState>({
    isPlaying: false,
    selectedKeyframe: null,
    zoom,
    scrollLeft: 0
  });
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Auto-play loop
  React.useEffect(() => {
    if (!state.isPlaying) return;
    
    const interval = setInterval(() => {
      const newTime = currentTime + 0.016; // ~60fps
      if (newTime >= duration) {
        onTimeChange?.(0);
      } else {
        onTimeChange?.(newTime);
      }
    }, 16);
    
    return () => clearInterval(interval);
  }, [state.isPlaying, currentTime, duration, onTimeChange]);
  
  // Handle play/pause
  const handlePlayPause = useCallback(() => {
    const newPlaying = !state.isPlaying;
    setState(prev => ({ ...prev, isPlaying: newPlaying }));
    onPlayPause?.(newPlaying);
  }, [state.isPlaying, onPlayPause]);
  
  // Handle stop
  const handleStop = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: false }));
    onTimeChange?.(0);
    onPlayPause?.(false);
  }, [onTimeChange, onPlayPause]);
  
  // Handle go to start
  const handleGoToStart = useCallback(() => {
    onTimeChange?.(0);
  }, [onTimeChange]);
  
  // Handle go to end
  const handleGoToEnd = useCallback(() => {
    onTimeChange?.(duration);
  }, [onTimeChange, duration]);
  
  // Handle time scrub
  const handleTimeScrub = useCallback((time: number) => {
    onTimeChange?.(time);
  }, [onTimeChange]);
  
  // Handle keyframe selection
  const handleSelectKeyframe = useCallback((trackName: string, keyframeId: string) => {
    setState(prev => ({ ...prev, selectedKeyframe: keyframeId }));
  }, []);
  
  // Handle keyframe drag
  const handleKeyframeDrag = useCallback((trackName: string, keyframeId: string, newTime: number) => {
    const track = tracks.find(t => t.name === trackName);
    if (!track) return;
    
    const keyframe = track.keyframes.find(kf => kf.id === keyframeId);
    if (!keyframe) return;
    
    const updatedKeyframe: Keyframe = { ...keyframe, time: newTime };
    onKeyframeChange?.(trackName, updatedKeyframe);
  }, [tracks, onKeyframeChange]);
  
  // Handle keyframe deletion
  const handleDeleteKeyframe = useCallback((trackName: string, keyframeId: string) => {
    if (readOnly) return;
    
    const track = tracks.find(t => t.name === trackName);
    if (!track) return;
    
    const keyframe = track.keyframes.find(kf => kf.id === keyframeId);
    if (!keyframe) return;
    
    // Delete by setting time to -1 (convention for deletion)
    const deletedKeyframe: Keyframe = { ...keyframe, time: -1 };
    onKeyframeChange?.(trackName, deletedKeyframe);
    setState(prev => ({ ...prev, selectedKeyframe: null }));
  }, [tracks, readOnly, onKeyframeChange]);
  
  // Handle add keyframe
  const handleAddKeyframe = useCallback((trackName: string, time: number) => {
    if (readOnly) return;
    
    const newKeyframe: Keyframe = {
      id: `kf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      time,
      property: '',
      value: 0,
      interpolation: 'linear'
    };
    
    onKeyframeChange?.(trackName, newKeyframe);
  }, [readOnly, onKeyframeChange]);
  
  const totalWidth = duration * state.zoom;
  
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#1a1a1a',
      fontFamily: 'system-ui, sans-serif',
      overflow: 'hidden'
    }}>
      {/* Playback controls */}
      <PlaybackControls
        isPlaying={state.isPlaying}
        currentTime={currentTime}
        duration={duration}
        onPlayPause={handlePlayPause}
        onStop={handleStop}
        onGoToStart={handleGoToStart}
        onGoToEnd={handleGoToEnd}
      />
      
      {/* Timeline content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Time ruler */}
        <TimeRuler
          duration={duration}
          zoom={state.zoom}
          currentTime={currentTime}
          onTimeScrub={handleTimeScrub}
        />
        
        {/* Tracks */}
        <div
          ref={scrollContainerRef}
          style={{
            flex: 1,
            overflow: 'auto'
          }}
        >
          <div style={{ minWidth: `${totalWidth + 150}px` }}>
            {tracks.map(track => (
              <TrackRow
                key={track.name}
                track={track}
                duration={duration}
                zoom={state.zoom}
                selectedKeyframeId={state.selectedKeyframe}
                onSelectKeyframe={handleSelectKeyframe}
                onKeyframeDrag={handleKeyframeDrag}
                onDeleteKeyframe={handleDeleteKeyframe}
                onAddKeyframe={handleAddKeyframe}
                readOnly={readOnly}
              />
            ))}
            
            {tracks.length === 0 && (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: '#888',
                fontSize: '12px'
              }}>
                No animation tracks. Add tracks to begin animating.
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Footer with info */}
      <div style={{
        padding: '4px 8px',
        borderTop: '1px solid #333',
        background: '#222',
        fontSize: '10px',
        color: '#888',
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <span>{tracks.length} tracks</span>
        <span>Zoom: {state.zoom.toFixed(0)} px/s</span>
      </div>
    </div>
  );
};

export default TimelineEditor;
