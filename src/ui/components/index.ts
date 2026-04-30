/**
 * UI Components - Complete component library for Infinigen R3F
 */

// Re-export types from the shared types module
export type {
  UIPanelProps,
  ToolbarProps,
  PropertyItem,
  PropertyGridProps,
  AssetItem,
  StatusBarMessage,
  PerformanceMetrics,
} from '../types';

// Core layout components (re-export defaults as named exports)
export { default as UIPanel } from './UIPanel';

export { default as Toolbar } from './Toolbar';

export { default as StatusBar } from './StatusBar';

// Debugging & visualization
export { default as ConstraintVisualizer } from './ConstraintVisualizer';
export type { ConstraintVisualizerProps } from './ConstraintVisualizer';

export { default as SolverDebugger } from './SolverDebugger';
export type { SolverDebuggerProps } from './SolverDebugger';

export { default as SceneInspector } from './SceneInspector';
export type { SceneInspectorProps } from './SceneInspector';

export { default as PerformanceProfiler } from './PerformanceProfiler';
export type { PerformanceProfilerProps } from './PerformanceProfiler';

export { BVHViewer } from './BVHViewer';
export type { BVHViewerProps } from './BVHViewer';

// Property editing
export { default as PropertyGrid } from './PropertyGrid';

export { PropertyPanel } from './PropertyPanel';
export type { PropertyPanelProps } from './PropertyPanel';

// Asset management
export { default as AssetBrowser } from './AssetBrowser';
export type { AssetBrowserProps } from './AssetBrowser';

// Animation & constraints
export { TimelineEditor } from './TimelineEditor';
export type { TimelineEditorProps, Keyframe, AnimationTrack } from './TimelineEditor';

export { ConstraintEditor } from './ConstraintEditor';
export type { ConstraintEditorProps } from './ConstraintEditor';
