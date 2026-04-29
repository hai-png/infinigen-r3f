/**
 * Solver Types
 * Core type definitions for constraint solving system
 */
import type { ObjectState } from '../evaluator/state.js';
/**
 * Represents a proposal for changing an object's state
 */
export interface Proposal {
    /** ID of the object being modified */
    objectId: string;
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
//# sourceMappingURL=types.d.ts.map