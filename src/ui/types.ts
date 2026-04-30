/**
 * UI System Types
 */

import { Constraint, Expression } from '../core/constraints/language/types';
import { SolverState } from '../core/constraints/solver/moves';
import { SceneObject } from '../types';

export interface UIPanelProps {
  title: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
  onClose?: () => void;
}

export interface ToolbarButton {
  id: string;
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  tooltip?: string;
}

export interface ToolbarProps {
  buttons: ToolbarButton[];
  orientation?: 'horizontal' | 'vertical';
}

export interface PropertyItem {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'vector' | 'color' | 'select';
  value: any;
  onChange: (value: any) => void;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: any }[];
}

export interface PropertyGridProps {
  title?: string;
  properties: PropertyItem[];
  searchable?: boolean;
}

export interface ConstraintVisualizationConfig {
  showViolations: boolean;
  showSatisfied: boolean;
  showBounds: boolean;
  violationColor: string;
  satisfiedColor: string;
  scale: number;
}

export interface SolverDebuggerConfig {
  showIterations: boolean;
  showScores: boolean;
  showProposals: boolean;
  autoScroll: boolean;
  maxHistoryItems: number;
}

export interface SceneGraphNode {
  id: string;
  name: string;
  type: string;
  children: SceneGraphNode[];
  selected?: boolean;
  visible?: boolean;
  locked?: boolean;
}

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  memoryUsage: number;
  objectCount: number;
  drawCalls: number;
  triangleCount: number;
  solverIterationTime: number;
  constraintEvaluationTime: number;
}

export interface AssetCategory {
  name: string;
  icon: string;
  count: number;
  subcategories: AssetCategory[];
}

export interface AssetItem {
  id: string;
  name: string;
  thumbnail: string;
  category: string;
  tags: string[];
  metadata: Record<string, any>;
}

export interface MaterialPreset {
  name: string;
  thumbnail: string;
  parameters: Record<string, any>;
}

export interface TerrainBrush {
  id: string;
  name: string;
  icon: string;
  radius: number;
  strength: number;
  falloff: 'linear' | 'smooth' | 'sharp';
}

export interface CameraRigPreset {
  name: string;
  description: string;
  shotType: 'closeup' | 'medium' | 'long' | 'extreme';
  movementType: 'static' | 'pan' | 'tilt' | 'dolly' | 'orbit' | 'tracking';
}

export interface AnimationKeyframe {
  time: number;
  property: string;
  value: any;
  interpolation: 'linear' | 'bezier' | 'step';
}

export interface ParticleEmitterPreview {
  position: [number, number, number];
  direction: [number, number, number];
  spread: number;
  rate: number;
  lifetime: number;
}

export interface StatusBarMessage {
  type: 'info' | 'warning' | 'error' | 'success';
  text: string;
  duration?: number;
}

export interface ThemeColors {
  background: string;
  backgroundSecondary: string;
  foreground: string;
  foregroundSecondary: string;
  accent: string;
  accentHover: string;
  border: string;
  error: string;
  warning: string;
  success: string;
  info: string;
}

export interface Theme {
  name: string;
  colors: ThemeColors;
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  fontSize: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
  };
}
