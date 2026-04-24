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
import * as THREE from 'three';
const DEFAULT_OPTIONS = {
    stepSize: 0.5,
    rotationStep: Math.PI / 8,
    scaleStep: 0.1,
    maxAttempts: 100,
};
/**
 * Continuous Proposal Generator
 * Generates small perturbations to position, rotation, and scale
 */
export class ContinuousProposalGenerator {
    constructor(options = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }
    /**
     * Generate a new proposal by perturbing current state
     */
    generate(currentState, relation) {
        const proposal = {
            objectId: currentState.id,
            newState: { ...currentState },
            score: 0,
            metadata: { type: 'continuous' },
        };
        // Randomly choose which dimension to perturb
        const choice = Math.random();
        if (choice < 0.4) {
            // Perturb position (40% chance)
            proposal.newState.position = this.perturbPosition(currentState.position || new THREE.Vector3(), relation);
        }
        else if (choice < 0.7) {
            // Perturb rotation (30% chance)
            proposal.newState.rotation = this.perturbRotation(currentState.rotation || new THREE.Euler(0, 0, 0), relation);
        }
        else if (choice < 0.9) {
            // Perturb scale (20% chance)
            proposal.newState.scale = this.perturbScale(currentState.scale || new THREE.Vector3(1, 1, 1));
        }
        else {
            // Combined perturbation (10% chance)
            proposal.newState.position = this.perturbPosition(currentState.position || new THREE.Vector3());
            proposal.newState.rotation = this.perturbRotation(currentState.rotation || new THREE.Euler(0, 0, 0));
        }
        return proposal;
    }
    /**
     * Perturb position with optional relation guidance
     */
    perturbPosition(current, relation) {
        const newPos = current.clone();
        // If relation suggests specific positioning (e.g., "on", "near"), bias accordingly
        if (relation?.type === 'on' || relation?.type === 'supportedBy') {
            // Keep X/Z similar, adjust Y for support
            newPos.y += (Math.random() - 0.5) * this.options.stepSize * 0.5;
        }
        else if (relation?.type === 'near' || relation?.type === 'touching') {
            // Larger movement in all directions
            newPos.x += (Math.random() - 0.5) * this.options.stepSize * 2;
            newPos.z += (Math.random() - 0.5) * this.options.stepSize * 2;
        }
        else {
            // Standard random walk
            newPos.x += (Math.random() - 0.5) * this.options.stepSize;
            newPos.y += (Math.random() - 0.5) * this.options.stepSize;
            newPos.z += (Math.random() - 0.5) * this.options.stepSize;
        }
        return newPos;
    }
    /**
     * Perturb rotation
     */
    perturbRotation(current, relation) {
        if (current instanceof THREE.Quaternion) {
            const euler = new THREE.Euler().setFromQuaternion(current);
            euler.y += (Math.random() - 0.5) * this.options.rotationStep;
            return new THREE.Quaternion().setFromEuler(euler);
        }
        else {
            const newRot = current.clone();
            // Bias towards Y-axis rotation for most furniture
            if (relation?.type === 'facing') {
                newRot.y += (Math.random() - 0.5) * this.options.rotationStep * 2;
            }
            else {
                newRot.y += (Math.random() - 0.5) * this.options.rotationStep;
            }
            return newRot;
        }
    }
    /**
     * Perturb scale
     */
    perturbScale(current) {
        const newScale = current.clone();
        const axis = Math.floor(Math.random() * 3);
        if (axis === 0) {
            newScale.x *= 1 + (Math.random() - 0.5) * this.options.scaleStep;
        }
        else if (axis === 1) {
            newScale.y *= 1 + (Math.random() - 0.5) * this.options.scaleStep;
        }
        else {
            newScale.z *= 1 + (Math.random() - 0.5) * this.options.scaleStep;
        }
        // Clamp to reasonable bounds
        newScale.clamp(new THREE.Vector3(0.1, 0.1, 0.1), new THREE.Vector3(10, 10, 10));
        return newScale;
    }
}
/**
 * Discrete Proposal Generator
 * Generates discrete changes like object selection or room assignment
 */
export class DiscreteProposalGenerator {
    constructor(options = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }
    /**
     * Generate discrete proposal
     */
    generate(currentState, candidates, relation) {
        const proposal = {
            objectId: currentState.id,
            newState: { ...currentState },
            score: 0,
            metadata: { type: 'discrete' },
        };
        const choice = Math.random();
        if (choice < 0.5 && candidates.length > 0) {
            // Swap asset (50% chance)
            const newIndex = Math.floor(Math.random() * candidates.length);
            proposal.newState.assetDescription = candidates[newIndex];
            proposal.metadata.changeType = 'asset_swap';
        }
        else if (choice < 0.8) {
            // Toggle active state (30% chance)
            proposal.newState.active = !currentState.active;
            proposal.metadata.changeType = 'toggle_active';
        }
        else {
            // Snap to grid/discrete positions (20% chance)
            if (currentState.position) {
                proposal.newState.position = this.snapToGrid(currentState.position);
                proposal.metadata.changeType = 'grid_snap';
            }
        }
        return proposal;
    }
    /**
     * Snap position to grid
     */
    snapToGrid(position) {
        const gridSize = this.options.stepSize;
        return new THREE.Vector3(Math.round(position.x / gridSize) * gridSize, Math.round(position.y / gridSize) * gridSize, Math.round(position.z / gridSize) * gridSize);
    }
    /**
     * Select best candidate based on relation
     */
    selectCandidate(candidates, relation, context) {
        if (candidates.length === 0)
            return null;
        // Simple heuristic: prefer items with matching tags
        if (relation?.targetTags) {
            const scored = candidates.map(c => {
                let score = 0;
                const targetTags = relation.targetTags || [];
                targetTags.forEach(tag => {
                    if (c.tags?.includes(tag))
                        score += 1;
                });
                return { candidate: c, score };
            });
            scored.sort((a, b) => b.score - a.score);
            return scored[0].candidate;
        }
        // Default: random selection
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
}
/**
 * Hybrid Proposal Generator
 * Combines continuous and discrete strategies
 */
export class HybridProposalGenerator {
    constructor(options = {}) {
        this.continuous = new ContinuousProposalGenerator(options);
        this.discrete = new DiscreteProposalGenerator(options);
    }
    /**
     * Generate proposal using hybrid strategy
     */
    generate(currentState, candidates, relation) {
        // Decide between continuous and discrete based on state
        const useDiscrete = !currentState.position || Math.random() < 0.3;
        if (useDiscrete && candidates && candidates.length > 0) {
            return this.discrete.generate(currentState, candidates, relation);
        }
        else {
            return this.continuous.generate(currentState, relation);
        }
    }
    /**
     * Generate multiple proposals for sampling
     */
    generateMultiple(currentState, count, candidates, relation) {
        const proposals = [];
        for (let i = 0; i < Math.min(count, this.options.maxAttempts); i++) {
            proposals.push(this.generate(currentState, candidates, relation));
        }
        return proposals;
    }
}
// Export default instance
export const defaultProposalGenerator = new HybridProposalGenerator();
//# sourceMappingURL=ProposalStrategies.js.map