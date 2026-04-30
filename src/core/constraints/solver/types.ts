/**
 * Solver Types
 * Core type definitions for constraint solving system
 */

import type { ObjectState } from '../evaluator/state';
export type { ObjectState };
import type { Relation } from '../language/relations';

/**
 * Represents a proposal for changing an object's state
 */
export interface Proposal {
  /** ID of the object being modified */
  objectId: string;
  
  /** ID of the variable being modified */
  variableId: string;
  
  /** Proposed new value for the variable */
  newValue: any;
  
  /** Proposed new state */
  newState: ObjectState;
  
  /** Score of this proposal (higher is better) */
  score: number;
  
  /** Additional metadata about the proposal */
  metadata: {
    type: 'continuous' | 'discrete' | 'hybrid';
    moveType?: string;
    [key: string]: any;
  };
}

/**
 * Solver state - tracks the current state of the solving process
 */
export interface SolverState {
  /** Current iteration number */
  iteration: number;
  
  /** Current energy (lower is better) */
  energy: number;
  
  /** Current score */
  currentScore: number;
  
  /** Best score found so far */
  bestScore: number;
  
  /** Variable assignments (variable id -> value) */
  assignments: Map<string, any>;
  
  /** Last proposed move */
  lastMove: Proposal | null;
  
  /** Whether last move was accepted */
  lastMoveAccepted: boolean;
}

/**
 * Configuration for pose-based moves
 */
export interface PoseMoveConfig {
  /** Translation delta */
  translation: [number, number, number];
  
  /** Rotation axis and angle */
  rotation?: {
    axis: [number, number, number];
    angle: number;
  };
  
  /** Scale factors */
  scale?: [number, number, number];
}

/**
 * Result of applying a move
 */
export interface MoveResult {
  /** Whether the move was successful */
  success: boolean;
  
  /** New state after the move */
  newState?: Map<string, ObjectState>;
  
  /** Score change from the move */
  scoreDelta?: number;
  
  /** Error message if failed */
  error?: string;
}
