/**
 * Constraint Types for Infinigen R3F
 * Core constraint definitions ported from original Infinigen
 */

import { Object3D } from 'three';

export enum ConstraintType {
  // Spatial constraints
  ABOVE = 'above',
  BELOW = 'below',
  LEFT_OF = 'left_of',
  RIGHT_OF = 'right_of',
  IN_FRONT_OF = 'in_front_of',
  BEHIND = 'behind',
  NEAR = 'near',
  FAR = 'far',
  
  // Containment constraints
  INSIDE = 'inside',
  OUTSIDE = 'outside',
  ON_TOP_OF = 'on_top_of',
  ATTACHED_TO = 'attached_to',
  
  // Semantic constraints
  SAME_ROOM = 'same_room',
  DIFFERENT_ROOM = 'different_room',
  VISIBLE_FROM = 'visible_from',
  OCCLUDED_FROM = 'occluded_from',
  
  // Physical constraints
  SUPPORTED_BY = 'supported_by',
  HANGING_FROM = 'hanging_from',
  STABLE = 'stable',
  BALANCED = 'balanced',
  
  // Group constraints
  ALIGNED_WITH = 'aligned_with',
  SYMMETRIC_TO = 'symmetric_to',
  GROUPED_WITH = 'grouped_with',
  DISTRIBUTE_ALONG = 'distribute_along',
}

export type ConstraintOperator = 
  | '==' | '!=' | '===' | '!=='
  | '<' | '>' | '<=' | '>='
  | '+' | '-' | '*' | '/' | '%'
  | '&&' | '||'
  | '=' | '+=' | '-=' | '*=' | '/=' | '%=';

export type DomainType = 'point' | 'edge' | 'face' | 'face_corner' | 'spline' | 'instance';

export interface Constraint {
  id: string;
  type: ConstraintType;
  subject: string; // Object ID
  object?: string; // Target object ID (optional for some constraints)
  value?: number | string | any; // Additional parameter
  weight: number; // Importance weight (0-1)
  isHard: boolean; // If true, must be satisfied
  isActive: boolean; // Currently being evaluated
  
  // Cached evaluation state
  isSatisfied?: boolean;
  violationAmount?: number;
  lastEvaluated?: number;
}

export interface ConstraintDomain {
  id: string;
  objects: Map<string, Object3D>;
  rooms: Map<string, Room>;
  relationships: Map<string, Constraint[]>;
}

export interface Room {
  id: string;
  name: string;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  objects: Set<string>;
  adjacencies: Set<string>;
}

export type ConstraintViolation = {
  constraint: Constraint;
  severity: number;
  message: string;
  suggestion?: string;
};

export type ConstraintEvaluationResult = {
  isSatisfied: boolean;
  totalViolations: number;
  violations: ConstraintViolation[];
  energy: number; // For simulated annealing
};
