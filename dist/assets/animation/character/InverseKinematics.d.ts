import { Vector3 } from 'three';
/**
 * Joint Configuration for IK chains
 */
export interface JointConfig {
    name: string;
    minAngle?: number;
    maxAngle?: number;
    axis?: Vector3;
    length?: number;
}
/**
 * IK Solver Types
 */
export type IKSolverType = 'ccd' | 'fabrik';
/**
 * IK Chain Configuration
 */
export interface IKChainConfig {
    joints: JointConfig[];
    solverType?: IKSolverType;
    maxIterations?: number;
    tolerance?: number;
    targetPosition?: Vector3;
    targetOrientation?: Vector3;
}
/**
 * Joint state in IK chain
 */
export interface JointState {
    config: JointConfig;
    position: Vector3;
    rotation: number;
    localRotation: number;
}
/**
 * CCD (Cyclic Coordinate Descent) IK Solver
 *
 * Iteratively adjusts each joint to minimize distance to target.
 * Fast and handles joint limits well.
 */
export declare class CCDIKSolver {
    private joints;
    private targetPosition;
    private targetOrientation?;
    private maxIterations;
    private tolerance;
    private chainLength;
    constructor(config: IKChainConfig);
    /**
     * Solve IK for current target
     * @returns Number of iterations taken, or -1 if failed
     */
    solve(): number;
    /**
     * Forward kinematics: update all joint positions
     */
    private forwardKinematics;
    /**
     * Set target position
     */
    setTarget(position: Vector3): void;
    /**
     * Get joint states
     */
    getJoints(): JointState[];
    /**
     * Get end effector position
     */
    getEndEffectorPosition(): Vector3;
    /**
     * Reset to initial state
     */
    reset(): void;
}
/**
 * FABRIK (Forward And Backward Reaching Inverse Kinematics) Solver
 *
 * Geometric approach that's very stable and produces natural-looking results.
 * Excellent for long chains like tentacles or snakes.
 */
export declare class FABRIKSolver {
    private joints;
    private targetPosition;
    private basePosition;
    private maxIterations;
    private tolerance;
    private distances;
    constructor(config: IKChainConfig);
    /**
     * Solve IK using FABRIK algorithm
     * @returns Number of iterations taken, or -1 if failed
     */
    solve(): number;
    /**
     * Apply joint constraints (limits)
     */
    private applyConstraints;
    /**
     * Calculate joint rotations from positions
     */
    private calculateRotations;
    /**
     * Set target position
     */
    setTarget(position: Vector3): void;
    /**
     * Set base position
     */
    setBase(position: Vector3): void;
    /**
     * Get joint states
     */
    getJoints(): JointState[];
    /**
     * Get end effector position
     */
    getEndEffectorPosition(): Vector3;
    /**
     * Reset to initial state
     */
    reset(): void;
}
/**
 * Unified IK Controller
 *
 * Provides a single interface for both CCD and FABRIK solvers.
 */
export declare class InverseKinematics {
    private solver;
    private solverType;
    private config;
    constructor(config: IKChainConfig);
    /**
     * Create appropriate solver based on type
     */
    private createSolver;
    /**
     * Solve IK
     */
    solve(): number;
    /**
     * Set target position
     */
    setTarget(position: Vector3): void;
    /**
     * Get joint positions
     */
    getJointPositions(): Vector3[];
    /**
     * Get end effector position
     */
    getEndEffectorPosition(): Vector3;
    /**
     * Switch solver type
     */
    setSolverType(type: IKSolverType): void;
    /**
     * Get current solver type
     */
    getSolverType(): IKSolverType;
    /**
     * Reset solver
     */
    reset(): void;
}
/**
 * Create a simple arm chain configuration
 */
export declare function createArmChain(upperArmLength?: number, forearmLength?: number, handLength?: number): IKChainConfig;
/**
 * Create a leg chain configuration
 */
export declare function createLegChain(thighLength?: number, shinLength?: number, footLength?: number): IKChainConfig;
/**
 * Create a snake/tentacle chain
 */
export declare function createSnakeChain(segments?: number, segmentLength?: number): IKChainConfig;
export default InverseKinematics;
//# sourceMappingURL=InverseKinematics.d.ts.map