/**
 * Move Operators for Simulated Annealing
 * Ported from original Infinigen's move system
 */
import { Vector3, Euler } from 'three';
import { ConstraintDomain } from '../core/ConstraintTypes';
export declare enum MoveType {
    SWAP = "swap",
    POSE = "pose",
    ADD = "add",
    DELETE = "delete",
    REASSIGN = "reassign"
}
export interface Move {
    id: string;
    type: MoveType;
    objectId?: string;
    targetObjectId?: string;
    position?: Vector3;
    rotation?: Euler;
    scale?: Vector3;
    roomId?: string;
    previousState?: {
        position?: Vector3;
        rotation?: Euler;
        scale?: Vector3;
        roomId?: string;
    };
}
export interface MoveResult {
    success: boolean;
    energyChange: number;
    message?: string;
}
/**
 * SwapMove: Exchange positions of two objects
 */
export declare class SwapMoveOperator {
    private domain;
    constructor(domain: ConstraintDomain);
    execute(move: Move): MoveResult;
    undo(move: Move): boolean;
}
/**
 * PoseMove: Change position/rotation/scale of an object
 */
export declare class PoseMoveOperator {
    private domain;
    constructor(domain: ConstraintDomain);
    execute(move: Move): MoveResult;
    undo(move: Move): boolean;
}
/**
 * AddMove: Add a new object to the scene
 */
export declare class AddMoveOperator {
    private domain;
    constructor(domain: ConstraintDomain);
    execute(move: Move): MoveResult;
    undo(move: Move): boolean;
}
/**
 * DeleteMove: Remove an object from the scene
 */
export declare class DeleteMoveOperator {
    private domain;
    constructor(domain: ConstraintDomain);
    execute(move: Move): MoveResult;
    undo(move: Move): boolean;
}
/**
 * ReassignMove: Move object from one room to another
 */
export declare class ReassignMoveOperator {
    private domain;
    constructor(domain: ConstraintDomain);
    execute(move: Move): MoveResult;
    undo(move: Move): boolean;
}
/**
 * MoveOperatorFactory: Creates appropriate move operators
 */
export declare class MoveOperatorFactory {
    private operators;
    constructor(domain: ConstraintDomain);
    getOperator(type: MoveType): any;
    executeMove(move: Move): MoveResult;
    undoMove(move: Move): boolean;
}
//# sourceMappingURL=MoveOperators.d.ts.map