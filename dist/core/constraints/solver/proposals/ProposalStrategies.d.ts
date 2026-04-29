/**
 * Solver Proposal Strategies - Hybrid Implementation
 *
 * Implements continuous and discrete proposal generators for constraint solving.
 *
 * Features:
 * 1. Continuous Proposals (Position, Rotation, Scale)
 * 2. Discrete Proposals (Object Selection, Room Assignment)
 * 3. Heuristic-Based Sampling
 * 4. Constraint-Guided Generation
 */
import type { ObjectState, Proposal } from '../types';
import type { AssetDescription, Relation } from '../../domain/types';
export interface ProposalStrategyOptions {
    stepSize?: number;
    rotationStep?: number;
    scaleStep?: number;
    maxAttempts?: number;
}
/**
 * Continuous Proposal Generator
 * Generates small perturbations to position, rotation, and scale
 */
export declare class ContinuousProposalGenerator {
    private options;
    constructor(options?: Partial<ProposalStrategyOptions>);
    /**
     * Generate a new proposal by perturbing current state
     */
    generate(currentState: ObjectState, relation?: Relation): Proposal;
    /**
     * Perturb position with optional relation guidance
     */
    private perturbPosition;
    /**
     * Perturb rotation
     */
    private perturbRotation;
    /**
     * Perturb scale
     */
    private perturbScale;
}
/**
 * Discrete Proposal Generator
 * Generates discrete changes like object selection or room assignment
 */
export declare class DiscreteProposalGenerator {
    private options;
    constructor(options?: Partial<ProposalStrategyOptions>);
    /**
     * Generate discrete proposal
     */
    generate(currentState: ObjectState, candidates: AssetDescription[], relation?: Relation): Proposal;
    /**
     * Snap position to grid
     */
    private snapToGrid;
    /**
     * Select best candidate based on relation
     */
    selectCandidate(candidates: AssetDescription[], relation?: Relation, context?: any): AssetDescription | null;
}
/**
 * Hybrid Proposal Generator
 * Combines continuous and discrete strategies
 */
export declare class HybridProposalGenerator {
    private continuous;
    private discrete;
    constructor(options?: Partial<ProposalStrategyOptions>);
    /**
     * Generate proposal using hybrid strategy
     */
    generate(currentState: ObjectState, candidates?: AssetDescription[], relation?: Relation): Proposal;
    /**
     * Generate multiple proposals for sampling
     */
    generateMultiple(currentState: ObjectState, count: number, candidates?: AssetDescription[], relation?: Relation): Proposal[];
}
export declare const defaultProposalGenerator: HybridProposalGenerator;
//# sourceMappingURL=ProposalStrategies.d.ts.map