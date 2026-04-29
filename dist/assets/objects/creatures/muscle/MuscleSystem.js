import * as THREE from 'three';
export class MuscleSystem {
    constructor(config = {}) {
        this.muscles = [];
        this.enabled = true;
        this.config = {
            stiffness: 100,
            damping: 5,
            activationSpeed: 10,
            relaxationSpeed: 5,
            maxContraction: 0.3,
            ...config,
        };
    }
    addMuscleGroup(name, boneA, boneB, fiberCount = 10) {
        const fibers = [];
        // Generate muscle fibers between attachment points
        for (let i = 0; i < fiberCount; i++) {
            const t = i / fiberCount;
            // Create slightly varied attachment points for realistic muscle shape
            const spread = 0.1;
            const origin = new THREE.Vector3(t * spread - spread / 2, 0, Math.sin(t * Math.PI) * spread);
            const insertion = new THREE.Vector3(t * spread - spread / 2, 1, Math.sin(t * Math.PI) * spread);
            const direction = insertion.clone().sub(origin).normalize();
            const restLength = origin.distanceTo(insertion);
            fibers.push({
                origin,
                insertion,
                restLength,
                currentLength: restLength,
                activation: 0,
                force: 0,
                direction,
            });
        }
        this.muscles.push({ name, fibers, boneA, boneB });
    }
    update(dt, activations) {
        if (!this.enabled)
            return;
        dt = Math.min(dt, 0.05);
        for (const muscle of this.muscles) {
            const targetActivation = activations.get(muscle.name) || 0;
            for (const fiber of muscle.fibers) {
                // Smooth activation/deactivation
                if (targetActivation > fiber.activation) {
                    fiber.activation += (targetActivation - fiber.activation) *
                        this.config.activationSpeed * dt;
                }
                else {
                    fiber.activation += (targetActivation - fiber.activation) *
                        this.config.relaxationSpeed * dt;
                }
                // Calculate contraction
                const contraction = fiber.activation * this.config.maxContraction;
                fiber.currentLength = fiber.restLength * (1 - contraction);
                // Calculate force based on activation and length
                const lengthRatio = fiber.currentLength / fiber.restLength;
                const passiveForce = Math.max(0, (lengthRatio - 1) * this.config.stiffness);
                const activeForce = fiber.activation * this.config.stiffness * 0.5;
                fiber.force = passiveForce + activeForce;
            }
        }
    }
    getMuscleForce(muscleName) {
        const muscle = this.muscles.find(m => m.name === muscleName);
        if (!muscle)
            return 0;
        return muscle.fibers.reduce((sum, fiber) => sum + fiber.force, 0) / muscle.fibers.length;
    }
    getFiberDirections(muscleName) {
        const muscle = this.muscles.find(m => m.name === muscleName);
        if (!muscle)
            return [];
        return muscle.fibers.map(f => f.direction.clone());
    }
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    reset() {
        for (const muscle of this.muscles) {
            for (const fiber of muscle.fibers) {
                fiber.activation = 0;
                fiber.force = 0;
                fiber.currentLength = fiber.restLength;
            }
        }
    }
    visualize(scene) {
        const group = new THREE.Group();
        for (const muscle of this.muscles) {
            for (const fiber of muscle.fibers) {
                // Create cylinder for fiber visualization
                const length = fiber.currentLength;
                const geometry = new THREE.CylinderGeometry(0.01, 0.01, length, 4);
                // Color based on activation
                const r = 1 - fiber.activation * 0.5;
                const g = 0.2 + fiber.activation * 0.3;
                const b = 0.2;
                const material = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(r, g, b),
                    transparent: true,
                    opacity: 0.8,
                });
                const mesh = new THREE.Mesh(geometry, material);
                // Position at midpoint
                const midPoint = fiber.origin.clone().lerp(fiber.insertion, 0.5);
                mesh.position.copy(midPoint);
                // Orient along fiber direction
                mesh.lookAt(fiber.insertion);
                mesh.rotateX(Math.PI / 2);
                group.add(mesh);
            }
        }
        scene.add(group);
        return group;
    }
    dispose() {
        // Cleanup resources if needed
    }
}
export default MuscleSystem;
//# sourceMappingURL=MuscleSystem.js.map