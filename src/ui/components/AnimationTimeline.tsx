/**
 * Animation Timeline Component
 * 
 * React component for displaying and editing animation timelines
 * with keyframe editing, scrubbing, and playback controls.
 */

import React, { useState, useCallback, useRef } from 'react';

export interface TimelineKeyframe {
  time: number;
  value: number;
  interpolation: 'linear' | 'bezier' | 'step';
}

export interface AnimationTimelineProps {
  duration: number;
  currentTime: number;
  keyframes: TimelineKeyframe[];
  onTimeChange: (time: number) => void;
  onKeyframeAdd: (time: number, value: number) => void;
  onKeyframeRemove: (index: number) => void;
  onKeyframeUpdate: (index: number, keyframe: TimelineKeyframe) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
}

const AnimationTimeline: React.FC<AnimationTimelineProps> = ({
  duration,
  currentTime,
  keyframes,
  onTimeChange,
  onKeyframeAdd,
  onKeyframeRemove,
  onKeyframeUpdate,
  isPlaying,
  onPlayPause,
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = (x / rect.width) * duration;
      onTimeChange(Math.max(0, Math.min(duration, time)));
    },
    [duration, onTimeChange]
  );

  return (
    <div className="animation-timeline" style={{ padding: '8px', background: '#1a1a2e', color: '#fff' }}>
      <div className="timeline-controls" style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <button onClick={onPlayPause}>{isPlaying ? '⏸' : '▶'}</button>
        <span>{currentTime.toFixed(2)}s / {duration.toFixed(2)}s</span>
      </div>
      <div
        ref={timelineRef}
        className="timeline-track"
        onClick={handleTimelineClick}
        style={{
          position: 'relative',
          height: '40px',
          background: '#2a2a4a',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        <div
          className="timeline-playhead"
          style={{
            position: 'absolute',
            left: `${(currentTime / duration) * 100}%`,
            top: 0,
            bottom: 0,
            width: '2px',
            background: '#ff6b6b',
          }}
        />
        {keyframes.map((kf, i) => (
          <div
            key={i}
            className="timeline-keyframe"
            style={{
              position: 'absolute',
              left: `${(kf.time / duration) * 100}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '8px',
              height: '8px',
              background: '#4ecdc4',
              borderRadius: '50%',
              cursor: 'grab',
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default AnimationTimeline;
