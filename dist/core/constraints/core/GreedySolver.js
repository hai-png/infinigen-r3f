/**
 * Greedy Solver for Constraint Satisfaction
 * Ported from original Infinigen's greedy solver implementation
 */
import { ConstraintType } from './ConstraintTypes';
import { Vector3 } from 'three';
export class GreedySolver {
    constructor(domain, config = {}) {
        this.iterationCount = 0;
        this.currentEnergy = Infinity;
        this.domain = domain;
        this.config = {
            maxIterations: config.maxIterations ?? 1000,
            convergenceThreshold: config.convergenceThreshold ?? 0.001,
            randomSeed: config.randomSeed,
            debugMode: config.debugMode ?? false,
        };
        this.constraints = new Map();
    }
    /**
     * Add a constraint to the solver
     */
    addConstraint(constraint) {
        this.constraints.set(constraint.id, constraint);
        // Add to domain relationships
        const key = constraint.subject;
        if (!this.domain.relationships.has(key)) {
            this.domain.relationships.set(key, []);
        }
        this.domain.relationships.get(key).push(constraint);
    }
    /**
     * Remove a constraint from the solver
     */
    removeConstraint(constraintId) {
        const constraint = this.constraints.get(constraintId);
        if (!constraint)
            return false;
        this.constraints.delete(constraintId);
        // Remove from domain relationships
        const key = constraint.subject;
        const relationships = this.domain.relationships.get(key);
        if (relationships) {
            const index = relationships.findIndex(c => c.id === constraintId);
            if (index !== -1) {
                relationships.splice(index, 1);
            }
        }
        return true;
    }
    /**
     * Solve constraints using greedy approach
     */
    solve() {
        this.iterationCount = 0;
        let previousEnergy = Infinity;
        this.currentEnergy = Infinity;
        while (this.iterationCount < this.config.maxIterations) {
            // Evaluate all active constraints
            const result = this.evaluateAllConstraints();
            this.currentEnergy = result.energy;
            // Check for convergence
            const energyChange = Math.abs(previousEnergy - this.currentEnergy);
            if (energyChange < this.config.convergenceThreshold && result.totalViolations === 0) {
                if (this.config.debugMode) {
                    console.log(`[GreedySolver] Converged after ${this.iterationCount} iterations`);
                }
                return result;
            }
            // If no violations, we're done
            if (result.totalViolations === 0) {
                if (this.config.debugMode) {
                    console.log(`[GreedySolver] All constraints satisfied after ${this.iterationCount} iterations`);
                }
                return result;
            }
            // Try to fix the most severe violation
            const worstViolation = result.violations.reduce((worst, current) => current.severity > worst.severity ? current : worst);
            if (!this.attemptToFixViolation(worstViolation.constraint)) {
                // Cannot fix this violation, mark as unsatisfiable
                worstViolation.constraint.isActive = false;
                if (this.config.debugMode) {
                    console.warn(`[GreedySolver] Could not satisfy constraint: ${worstViolation.constraint.id}`);
                }
            }
            previousEnergy = this.currentEnergy;
            this.iterationCount++;
        }
        if (this.config.debugMode) {
            console.warn(`[GreedySolver] Max iterations (${this.config.maxIterations}) reached`);
        }
        return this.evaluateAllConstraints();
    }
    /**
     * Evaluate all active constraints
     */
    evaluateAllConstraints() {
        const violations = [];
        let totalEnergy = 0;
        for (const constraint of this.constraints.values()) {
            if (!constraint.isActive)
                continue;
            const evaluation = this.evaluateConstraint(constraint);
            if (!evaluation.isSatisfied) {
                violations.push(...evaluation.violations);
                totalEnergy += evaluation.energy;
            }
        }
        return {
            isSatisfied: violations.length === 0,
            totalViolations: violations.length,
            violations,
            energy: totalEnergy,
        };
    }
    /**
     * Evaluate a single constraint
     */
    evaluateConstraint(constraint) {
        const subject = this.domain.objects.get(constraint.subject);
        if (!subject) {
            return {
                isSatisfied: false,
                totalViolations: 1,
                violations: [{
                        constraint,
                        severity: 1.0,
                        message: `Subject object '${constraint.subject}' not found`,
                    }],
                energy: constraint.weight * 1000,
            };
        }
        let isSatisfied = true;
        let violationAmount = 0;
        let message = '';
        switch (constraint.type) {
            case ConstraintType.ABOVE: {
                const target = constraint.object ? this.domain.objects.get(constraint.object) : null;
                if (target) {
                    const subjectPos = new Vector3();
                    const targetPos = new Vector3();
                    subject.getWorldPosition(subjectPos);
                    target.getWorldPosition(targetPos);
                    isSatisfied = subjectPos.y > targetPos.y;
                    violationAmount = isSatisfied ? 0 : targetPos.y - subjectPos.y;
                    message = isSatisfied ? '' : `Object is ${violationAmount.toFixed(2)} units below target`;
                }
                break;
            }
            case ConstraintType.BELOW: {
                const target = constraint.object ? this.domain.objects.get(constraint.object) : null;
                if (target) {
                    const subjectPos = new Vector3();
                    const targetPos = new Vector3();
                    subject.getWorldPosition(subjectPos);
                    target.getWorldPosition(targetPos);
                    isSatisfied = subjectPos.y < targetPos.y;
                    violationAmount = isSatisfied ? 0 : subjectPos.y - targetPos.y;
                    message = isSatisfied ? '' : `Object is ${violationAmount.toFixed(2)} units above target`;
                }
                break;
            }
            case ConstraintType.NEAR: {
                const target = constraint.object ? this.domain.objects.get(constraint.object) : null;
                const maxDistance = typeof constraint.value === 'number' ? constraint.value : 5;
                if (target) {
                    const distance = subject.position.distanceTo(target.position);
                    isSatisfied = distance <= maxDistance;
                    violationAmount = isSatisfied ? 0 : distance - maxDistance;
                    message = isSatisfied ? '' : `Object is ${violationAmount.toFixed(2)} units too far`;
                }
                break;
            }
            case ConstraintType.FAR: {
                const target = constraint.object ? this.domain.objects.get(constraint.object) : null;
                const minDistance = typeof constraint.value === 'number' ? constraint.value : 10;
                if (target) {
                    const distance = subject.position.distanceTo(target.position);
                    isSatisfied = distance >= minDistance;
                    violationAmount = isSatisfied ? 0 : minDistance - distance;
                    message = isSatisfied ? '' : `Object is ${violationAmount.toFixed(2)} units too close`;
                }
                break;
            }
            case ConstraintType.INSIDE: {
                const roomId = constraint.object;
                const room = roomId ? this.domain.rooms.get(roomId) : null;
                if (room) {
                    const pos = subject.position;
                    isSatisfied = (pos.x >= room.bounds.min[0] && pos.x <= room.bounds.max[0] &&
                        pos.y >= room.bounds.min[1] && pos.y <= room.bounds.max[1] &&
                        pos.z >= room.bounds.min[2] && pos.z <= room.bounds.max[2]);
                    violationAmount = isSatisfied ? 0 : 1;
                    message = isSatisfied ? '' : `Object is outside room '${room.name}'`;
                }
                break;
            }
            case ConstraintType.SAME_ROOM: {
                const otherObjectId = constraint.object;
                if (otherObjectId) {
                    const otherObj = this.domain.objects.get(otherObjectId);
                    if (otherObj) {
                        const subjectRoom = this.findObjectRoom(subject);
                        const otherRoom = this.findObjectRoom(otherObj);
                        isSatisfied = subjectRoom === otherRoom && subjectRoom !== null;
                        violationAmount = isSatisfied ? 0 : 1;
                        message = isSatisfied ? '' : 'Objects are in different rooms';
                    }
                }
                break;
            }
            case ConstraintType.SUPPORTED_BY: {
                // Simplified support check - would need physics integration for full implementation
                const target = constraint.object ? this.domain.objects.get(constraint.object) : null;
                if (target) {
                    const subjectPos = new Vector3();
                    const targetPos = new Vector3();
                    subject.getWorldPosition(subjectPos);
                    target.getWorldPosition(targetPos);
                    // Check if subject is roughly on top of target
                    const horizontalDist = Math.sqrt(Math.pow(subjectPos.x - targetPos.x, 2) +
                        Math.pow(subjectPos.z - targetPos.z, 2));
                    const verticalDist = subjectPos.y - targetPos.y;
                    isSatisfied = horizontalDist < 1.0 && verticalDist > -0.5 && verticalDist < 2.0;
                    violationAmount = isSatisfied ? 0 : horizontalDist + Math.abs(verticalDist);
                    message = isSatisfied ? '' : 'Object is not properly supported';
                }
                break;
            }
            default:
                if (this.config.debugMode) {
                    console.warn(`[GreedySolver] Unknown constraint type: ${constraint.type}`);
                }
                isSatisfied = true;
        }
        const severity = constraint.isHard ? 1.0 : constraint.weight;
        return {
            isSatisfied,
            totalViolations: isSatisfied ? 0 : 1,
            violations: isSatisfied ? [] : [{
                    constraint,
                    severity: severity * (violationAmount > 0 ? violationAmount : 1),
                    message,
                }],
            energy: isSatisfied ? 0 : constraint.weight * (violationAmount || 1),
        };
    }
    /**
     * Attempt to fix a constraint violation
     */
    attemptToFixViolation(constraint) {
        const subject = this.domain.objects.get(constraint.subject);
        if (!subject)
            return false;
        // Simple greedy fix: move object to satisfy constraint
        switch (constraint.type) {
            case ConstraintType.ABOVE: {
                const target = constraint.object ? this.domain.objects.get(constraint.object) : null;
                if (target) {
                    const targetPos = new Vector3();
                    target.getWorldPosition(targetPos);
                    subject.position.y = targetPos.y + 1.0;
                    return true;
                }
                break;
            }
            case ConstraintType.BELOW: {
                const target = constraint.object ? this.domain.objects.get(constraint.object) : null;
                if (target) {
                    const targetPos = new Vector3();
                    target.getWorldPosition(targetPos);
                    subject.position.y = targetPos.y - 1.0;
                    return true;
                }
                break;
            }
            case ConstraintType.NEAR: {
                const target = constraint.object ? this.domain.objects.get(constraint.object) : null;
                const maxDistance = typeof constraint.value === 'number' ? constraint.value : 5;
                if (target) {
                    const direction = new Vector3().subVectors(target.position, subject.position).normalize();
                    const currentDist = subject.position.distanceTo(target.position);
                    const moveDist = currentDist - maxDistance + 0.5;
                    subject.position.add(direction.multiplyScalar(moveDist));
                    return true;
                }
                break;
            }
            case ConstraintType.INSIDE: {
                const roomId = constraint.object;
                const room = roomId ? this.domain.rooms.get(roomId) : null;
                if (room) {
                    subject.position.x = (room.bounds.min[0] + room.bounds.max[0]) / 2;
                    subject.position.y = (room.bounds.min[1] + room.bounds.max[1]) / 2;
                    subject.position.z = (room.bounds.min[2] + room.bounds.max[2]) / 2;
                    return true;
                }
                break;
            }
            default:
                // Cannot automatically fix this constraint type
                return false;
        }
        return false;
    }
    /**
     * Find which room an object belongs to
     */
    findObjectRoom(object) {
        const pos = object.position;
        for (const [roomId, room] of this.domain.rooms.entries()) {
            if (pos.x >= room.bounds.min[0] && pos.x <= room.bounds.max[0] &&
                pos.y >= room.bounds.min[1] && pos.y <= room.bounds.max[1] &&
                pos.z >= room.bounds.min[2] && pos.z <= room.bounds.max[2]) {
                return roomId;
            }
        }
        return null;
    }
    /**
     * Get solver statistics
     */
    getStats() {
        return {
            iterationCount: this.iterationCount,
            currentEnergy: this.currentEnergy,
            totalConstraints: this.constraints.size,
            activeConstraints: Array.from(this.constraints.values()).filter(c => c.isActive).length,
        };
    }
}
//# sourceMappingURL=GreedySolver.js.map