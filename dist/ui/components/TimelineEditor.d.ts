/**
 * TimelineEditor - Visual timeline for animation and keyframe editing
 *
 * Provides an interactive timeline interface for creating, editing,
 * and managing animation keyframes and sequences.
 */
import React from 'react';
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
/**
 * Main Timeline Editor Component
 */
export declare const TimelineEditor: React.FC<TimelineEditorProps>;
export default TimelineEditor;
//# sourceMappingURL=TimelineEditor.d.ts.map