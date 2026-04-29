import { Vector3 } from 'three';
/**
 * CCD (Cyclic Coordinate Descent) IK Solver
 *
 * Iteratively adjusts each joint to minimize distance to target.
 * Fast and handles joint limits well.
 */
export class CCDIKSolver {
    constructor(config) {
        this.maxIterations = config.maxIterations ?? 100;
        this.tolerance = config.tolerance ?? 0.001;
        this.targetPosition = config.targetPosition ?? new Vector3(0, 1, 0);
        this.targetOrientation = config.targetOrientation;
        // Initialize joints
        this.joints = config.joints.map((jointConfig, index) => {
            const length = jointConfig.length ?? 1;
            return {
                config: jointConfig,
                position: new Vector3(0, index * length, 0),
                rotation: 0,
                localRotation: 0,
            };
        });
        // Calculate total chain length
        this.chainLength = this.joints.reduce((sum, j) => sum + (j.config.length ?? 1), 0);
    }
    /**
     * Solve IK for current target
     * @returns Number of iterations taken, or -1 if failed
     */
    solve() {
        const n = this.joints.length;
        if (n === 0)
            return -1;
        // Update joint positions based on rotations
        this.forwardKinematics();
        let iterations = 0;
        let converged = false;
        while (iterations < this.maxIterations && !converged) {
            iterations++;
            // Iterate from end effector to base
            for (let i = n - 2; i >= 0; i--) {
                const joint = this.joints[i];
                const endEffector = this.joints[n - 1].position;
                // Vector from joint to end effector
                const toEnd = endEffector.clone().sub(joint.position).normalize();
                // Vector from joint to target
                const toTarget = this.targetPosition.clone().sub(joint.position).normalize();
                // Calculate rotation needed
                let angle = Math.atan2(toTarget.y, toTarget.x) - Math.atan2(toEnd.y, toEnd.x);
                // Normalize angle to [-PI, PI]
                while (angle > Math.PI)
                    angle -= 2 * Math.PI;
                while (angle < -Math.PI)
                    angle += 2 * Math.PI;
                // Apply joint limits
                const minAngle = joint.config.minAngle ?? -Math.PI;
                const maxAngle = joint.config.maxAngle ?? Math.PI;
                angle = Math.max(minAngle, Math.min(maxAngle, angle));
                // Apply rotation
                joint.localRotation += angle;
                joint.rotation = joint.localRotation;
                // Update forward kinematics
                this.forwardKinematics();
                // Check convergence
                const dist = this.joints[n - 1].position.distanceTo(this.targetPosition);
                if (dist < this.tolerance) {
                    converged = true;
                    break;
                }
            }
        }
        return converged ? iterations : -1;
    }
    /**
     * Forward kinematics: update all joint positions
     */
    forwardKinematics() {
        let cumulativeRotation = 0;
        let currentPosition = new Vector3(0, 0, 0);
        for (let i = 0; i < this.joints.length; i++) {
            const joint = this.joints[i];
            // Update cumulative rotation
            if (i > 0) {
                cumulativeRotation += joint.localRotation;
            }
            // Set joint position
            joint.position.copy(currentPosition);
            // Calculate next position
            const length = joint.config.length ?? 1;
            const nextX = currentPosition.x + length * Math.cos(cumulativeRotation);
            const nextY = currentPosition.y + length * Math.sin(cumulativeRotation);
            currentPosition.set(nextX, nextY, 0);
        }
    }
    /**
     * Set target position
     */
    setTarget(position) {
        this.targetPosition = position.clone();
    }
    /**
     * Get joint states
     */
    getJoints() {
        return this.joints.map(j => ({ ...j, position: j.position.clone() }));
    }
    /**
     * Get end effector position
     */
    getEndEffectorPosition() {
        return this.joints[this.joints.length - 1].position.clone();
    }
    /**
     * Reset to initial state
     */
    reset() {
        for (const joint of this.joints) {
            joint.rotation = 0;
            joint.localRotation = 0;
        }
        this.forwardKinematics();
    }
}
/**
 * FABRIK (Forward And Backward Reaching Inverse Kinematics) Solver
 *
 * Geometric approach that's very stable and produces natural-looking results.
 * Excellent for long chains like tentacles or snakes.
 */
export class FABRIKSolver {
    constructor(config) {
        this.maxIterations = config.maxIterations ?? 100;
        this.tolerance = config.tolerance ?? 0.001;
        this.targetPosition = config.targetPosition ?? new Vector3(0, 1, 0);
        this.basePosition = new Vector3(0, 0, 0);
        // Initialize joints
        this.joints = config.joints.map((jointConfig, index) => {
            const length = jointConfig.length ?? 1;
            return {
                config: jointConfig,
                position: new Vector3(0, index * length, 0),
                rotation: 0,
                localRotation: 0,
            };
        });
        // Pre-calculate distances between joints
        this.distances = [];
        for (let i = 0; i < this.joints.length - 1; i++) {
            this.distances.push(this.joints[i].position.distanceTo(this.joints[i + 1].position));
        }
    }
    /**
     * Solve IK using FABRIK algorithm
     * @returns Number of iterations taken, or -1 if failed
     */
    solve() {
        const n = this.joints.length;
        if (n < 2)
            return -1;
        // Check if target is reachable
        const distToTarget = this.joints[0].position.distanceTo(this.targetPosition);
        const reach = this.distances.reduce((a, b) => a + b, 0);
        if (distToTarget > reach) {
            // Target unreachable, stretch toward it
            const direction = this.targetPosition.clone().sub(this.joints[0].position).normalize();
            this.targetPosition.copy(this.joints[0].position.clone().add(direction.multiplyScalar(reach)));
        }
        let iterations = 0;
        let converged = false;
        while (iterations < this.maxIterations && !converged) {
            iterations++;
            // Backward reaching: place end effector at target
            this.joints[n - 1].position.copy(this.targetPosition);
            for (let i = n - 2; i >= 0; i--) {
                const r = this.distances[i];
                const lambda = r / this.joints[i].position.distanceTo(this.joints[i + 1].position);
                this.joints[i].position.lerpVectors(this.joints[i + 1].position, this.joints[i].position, lambda);
                // Apply joint constraints
                this.applyConstraints(i);
            }
            // Forward reaching: place base at original position
            this.joints[0].position.copy(this.basePosition);
            for (let i = 1; i < n; i++) {
                const r = this.distances[i - 1];
                const lambda = r / this.joints[i].position.distanceTo(this.joints[i - 1].position);
                this.joints[i].position.lerpVectors(this.joints[i - 1].position, this.joints[i].position, lambda);
                // Apply joint constraints
                this.applyConstraints(i);
            }
            // Check convergence
            const dist = this.joints[n - 1].position.distanceTo(this.targetPosition);
            if (dist < this.tolerance) {
                converged = true;
            }
        }
        // Calculate rotations from positions
        this.calculateRotations();
        return converged ? iterations : -1;
    }
    /**
     * Apply joint constraints (limits)
     */
    applyConstraints(index) {
        const joint = this.joints[index];
        const minAngle = joint.config.minAngle ?? -Math.PI;
        const maxAngle = joint.config.maxAngle ?? Math.PI;
        // For FABRIK, we constrain by limiting the position relative to parent
        if (index > 0) {
            const parent = this.joints[index - 1];
            const toJoint = joint.position.clone().sub(parent.position);
            let angle = Math.atan2(toJoint.y, toJoint.x);
            // Clamp angle
            const currentRotation = joint.localRotation;
            const clampedAngle = Math.max(minAngle, Math.min(maxAngle, angle));
            if (clampedAngle !== angle) {
                const length = this.distances[index - 1];
                joint.position.set(parent.position.x + length * Math.cos(clampedAngle), parent.position.y + length * Math.sin(clampedAngle), 0);
            }
        }
    }
    /**
     * Calculate joint rotations from positions
     */
    calculateRotations() {
        for (let i = 1; i < this.joints.length; i++) {
            const parent = this.joints[i - 1];
            const joint = this.joints[i];
            const toJoint = joint.position.clone().sub(parent.position);
            const angle = Math.atan2(toJoint.y, toJoint.x);
            joint.localRotation = angle - (i > 1 ? this.joints[i - 1].localRotation : 0);
            joint.rotation = angle;
        }
    }
    /**
     * Set target position
     */
    setTarget(position) {
        this.targetPosition = position.clone();
    }
    /**
     * Set base position
     */
    setBase(position) {
        this.basePosition = position.clone();
        this.joints[0].position.copy(position);
    }
    /**
     * Get joint states
     */
    getJoints() {
        return this.joints.map(j => ({ ...j, position: j.position.clone() }));
    }
    /**
     * Get end effector position
     */
    getEndEffectorPosition() {
        return this.joints[this.joints.length - 1].position.clone();
    }
    /**
     * Reset to initial state
     */
    reset() {
        const length = this.distances[0] || 1;
        for (let i = 0; i < this.joints.length; i++) {
            this.joints[i].position.set(0, i * length, 0);
            this.joints[i].rotation = 0;
            this.joints[i].localRotation = 0;
        }
    }
}
/**
 * Unified IK Controller
 *
 * Provides a single interface for both CCD and FABRIK solvers.
 */
export class InverseKinematics {
    constructor(config) {
        this.config = config;
        this.solverType = config.solverType ?? 'ccd';
        this.solver = this.createSolver();
    }
    /**
     * Create appropriate solver based on type
     */
    createSolver() {
        if (this.solverType === 'fabrik') {
            return new FABRIKSolver(this.config);
        }
        return new CCDIKSolver(this.config);
    }
    /**
     * Solve IK
     */
    solve() {
        if (!this.solver)
            return -1;
        return this.solver.solve();
    }
    /**
     * Set target position
     */
    setTarget(position) {
        if (this.solver instanceof CCDIKSolver) {
            this.solver.setTarget(position);
        }
        else if (this.solver instanceof FABRIKSolver) {
            this.solver.setTarget(position);
        }
    }
    /**
     * Get joint positions
     */
    getJointPositions() {
        if (!this.solver)
            return [];
        const joints = this.solver.getJoints();
        return joints.map(j => j.position.clone());
    }
    /**
     * Get end effector position
     */
    getEndEffectorPosition() {
        if (!this.solver)
            return new Vector3();
        if (this.solver instanceof CCDIKSolver) {
            return this.solver.getEndEffectorPosition();
        }
        else {
            return this.solver.getEndEffectorPosition();
        }
    }
    /**
     * Switch solver type
     */
    setSolverType(type) {
        if (this.solverType === type)
            return;
        this.solverType = type;
        this.solver = this.createSolver();
    }
    /**
     * Get current solver type
     */
    getSolverType() {
        return this.solverType;
    }
    /**
     * Reset solver
     */
    reset() {
        if (this.solver) {
            if (this.solver instanceof CCDIKSolver) {
                this.solver.reset();
            }
            else {
                this.solver.reset();
            }
        }
    }
}
/**
 * Create a simple arm chain configuration
 */
export function createArmChain(upperArmLength = 1, forearmLength = 1, handLength = 0.5) {
    return {
        joints: [
            { name: 'shoulder', length: 0, minAngle: -Math.PI / 2, maxAngle: Math.PI / 2 },
            { name: 'elbow', length: upperArmLength, minAngle: 0, maxAngle: Math.PI },
            { name: 'wrist', length: forearmLength, minAngle: -Math.PI / 4, maxAngle: Math.PI / 4 },
            { name: 'hand', length: handLength },
        ],
        solverType: 'ccd',
        maxIterations: 50,
        tolerance: 0.01,
    };
}
/**
 * Create a leg chain configuration
 */
export function createLegChain(thighLength = 1, shinLength = 1, footLength = 0.5) {
    return {
        joints: [
            { name: 'hip', length: 0, minAngle: -Math.PI / 3, maxAngle: Math.PI / 3 },
            { name: 'knee', length: thighLength, minAngle: 0, maxAngle: Math.PI / 2 },
            { name: 'ankle', length: shinLength, minAngle: -Math.PI / 6, maxAngle: Math.PI / 6 },
            { name: 'foot', length: footLength },
        ],
        solverType: 'fabrik',
        maxIterations: 50,
        tolerance: 0.01,
    };
}
/**
 * Create a snake/tentacle chain
 */
export function createSnakeChain(segments = 10, segmentLength = 0.5) {
    const joints = [];
    for (let i = 0; i <= segments; i++) {
        joints.push({
            name: `segment_${i}`,
            length: i === 0 ? 0 : segmentLength,
            minAngle: -Math.PI / 4,
            maxAngle: Math.PI / 4,
        });
    }
    return {
        joints,
        solverType: 'fabrik',
        maxIterations: 100,
        tolerance: 0.001,
    };
}
export default InverseKinematics;
//# sourceMappingURL=InverseKinematics.js.map