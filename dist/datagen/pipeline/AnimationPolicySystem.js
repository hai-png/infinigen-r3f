/**
 * AnimationPolicySystem
 *
 * Manages animation policies for dynamic scenes, providing temporal control
 * over object animations, procedural motion patterns, and physics-based interactions.
 *
 * Features:
 * - Keyframe-based animation policies
 * - Procedural motion generators (sine, noise, perlin)
 * - Physics-driven animations (spring, damping, gravity)
 * - Event-triggered animations
 * - Animation blending and interpolation
 * - Timeline management with play/pause/seek
 * - Hierarchical animation inheritance
 */
import { Vector3, Quaternion, Euler, Clock, LinearInterpolant } from 'three';
// ============================================================================
// Helper Functions
// ============================================================================
/**
 * Generate a unique ID for animations
 */
function generateAnimationId() {
    return `anim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
/**
 * Interpolate between two keyframes
 */
function interpolateKeyframes(prev, next, t, interpolant) {
    const result = { time: prev.time + (next.time - prev.time) * t };
    if (prev.position && next.position) {
        const times = new Float32Array([0, 1]);
        const values = new Float32Array([
            prev.position.x, prev.position.y, prev.position.z,
            next.position.x, next.position.y, next.position.z
        ]);
        const interp = new LinearInterpolant(times, values, 3, new Float32Array(3));
        const interpolated = interp.evaluate([t]);
        result.position = new Vector3(interpolated[0], interpolated[1], interpolated[2]);
    }
    if (prev.rotation && next.rotation) {
        const prevQuat = prev.rotation instanceof Quaternion ? prev.rotation : new Quaternion().setFromEuler(prev.rotation);
        const nextQuat = next.rotation instanceof Quaternion ? next.rotation : new Quaternion().setFromEuler(next.rotation);
        result.rotation = prevQuat.clone().slerp(nextQuat, t);
    }
    if (prev.scale && next.scale) {
        const times = new Float32Array([0, 1]);
        const values = new Float32Array([
            prev.scale.x, prev.scale.y, prev.scale.z,
            next.scale.x, next.scale.y, next.scale.z
        ]);
        const interp = new LinearInterpolant(times, values, 3, new Float32Array(3));
        const interpolated = interp.evaluate([t]);
        result.scale = new Vector3(interpolated[0], interpolated[1], interpolated[2]);
    }
    if (prev.visible !== undefined && next.visible !== undefined) {
        result.visible = t < 0.5 ? prev.visible : next.visible;
    }
    return result;
}
/**
 * Evaluate procedural motion at given time
 */
function evaluateProceduralMotion(params, time) {
    const center = params.center || new Vector3(0, 0, 0);
    const amplitude = params.amplitude || new Vector3(1, 1, 1);
    const frequency = params.frequency || 1;
    const phase = params.phase || 0;
    const t = time * frequency + phase;
    let position = new Vector3();
    let velocity = new Vector3();
    switch (params.type) {
        case 'sine':
            position.x = center.x + Math.sin(t * Math.PI * 2) * amplitude.x;
            position.y = center.y + Math.sin(t * Math.PI * 2 + Math.PI / 4) * amplitude.y;
            position.z = center.z + Math.sin(t * Math.PI * 2 + Math.PI / 2) * amplitude.z;
            velocity.x = Math.cos(t * Math.PI * 2) * amplitude.x * frequency * Math.PI * 2;
            velocity.y = Math.cos(t * Math.PI * 2 + Math.PI / 4) * amplitude.y * frequency * Math.PI * 2;
            velocity.z = Math.cos(t * Math.PI * 2 + Math.PI / 2) * amplitude.z * frequency * Math.PI * 2;
            break;
        case 'noise':
            position.x = center.x + (Math.sin(t) + Math.sin(t * 2.3) + Math.sin(t * 4.7)) / 3 * amplitude.x;
            position.y = center.y + (Math.sin(t * 1.1) + Math.sin(t * 2.7) + Math.sin(t * 5.3)) / 3 * amplitude.y;
            position.z = center.z + (Math.sin(t * 1.3) + Math.sin(t * 3.1) + Math.sin(t * 6.1)) / 3 * amplitude.z;
            break;
        case 'random_walk':
            const stepSize = 0.1;
            const steps = Math.floor(time * 10);
            let x = 0, y = 0, z = 0;
            let px = 0, py = 0, pz = 0;
            for (let i = 0; i < steps; i++) {
                const angle = Math.random() * Math.PI * 2;
                x += Math.cos(angle) * stepSize;
                y += Math.sin(angle) * stepSize * 0.1;
                z += Math.sin(angle) * stepSize;
            }
            position.set(center.x + x * amplitude.x, center.y + y * amplitude.y, center.z + z * amplitude.z);
            break;
        case 'orbit':
            const axis = params.axis || new Vector3(0, 1, 0);
            const radius = params.radius || 1;
            const speed = params.speed || 1;
            const angle = t * speed * Math.PI * 2;
            const sinA = Math.sin(angle);
            const cosA = Math.cos(angle);
            if (axis.y > 0.5) {
                position.x = center.x + Math.cos(angle) * radius * amplitude.x;
                position.z = center.z + Math.sin(angle) * radius * amplitude.z;
                position.y = center.y;
            }
            else if (axis.x > 0.5) {
                position.y = center.y + Math.cos(angle) * radius * amplitude.y;
                position.z = center.z + Math.sin(angle) * radius * amplitude.z;
                position.x = center.x;
            }
            else {
                position.x = center.x + Math.cos(angle) * radius * amplitude.x;
                position.y = center.y + Math.sin(angle) * radius * amplitude.y;
                position.z = center.z;
            }
            velocity.x = -Math.sin(angle) * radius * speed * Math.PI * 2;
            velocity.z = Math.cos(angle) * radius * speed * Math.PI * 2;
            break;
        case 'figure8':
            const figure8Speed = params.speed || 1;
            const figure8T = time * figure8Speed;
            position.x = center.x + Math.sin(figure8T) * amplitude.x;
            position.y = center.y + Math.sin(figure8T * 2) * amplitude.y * 0.5;
            position.z = center.z + Math.sin(figure8T) * Math.cos(figure8T) * amplitude.z;
            break;
        case 'perlin':
            // Simplified Perlin-like noise using multiple sine waves
            const perlinScale = 0.5;
            position.x = center.x + (Math.sin(t) * 0.5 +
                Math.sin(t * 2.1) * 0.25 +
                Math.sin(t * 4.3) * 0.125 +
                Math.sin(t * 8.7) * 0.0625) * amplitude.x * perlinScale;
            position.y = center.y + (Math.sin(t * 1.1) * 0.5 +
                Math.sin(t * 2.3) * 0.25 +
                Math.sin(t * 4.5) * 0.125 +
                Math.sin(t * 8.9) * 0.0625) * amplitude.y * perlinScale;
            position.z = center.y + (Math.sin(t * 1.2) * 0.5 +
                Math.sin(t * 2.5) * 0.25 +
                Math.sin(t * 4.7) * 0.125 +
                Math.sin(t * 8.1) * 0.0625) * amplitude.z * perlinScale;
            break;
    }
    return { position, velocity: velocity.lengthSq() > 0 ? velocity : undefined };
}
/**
 * Evaluate physics-based animation
 */
function evaluatePhysicsAnimation(params, state, deltaTime) {
    const { position, velocity } = state;
    const dt = Math.min(deltaTime, 0.1); // Clamp delta time
    switch (params.type) {
        case 'spring': {
            const restPosition = params.restPosition || new Vector3(0, 0, 0);
            const stiffness = params.stiffness || 10;
            const mass = params.mass || 1;
            const displacement = new Vector3().subVectors(position, restPosition);
            const acceleration = displacement.multiplyScalar(-stiffness / mass);
            velocity.add(acceleration.multiplyScalar(dt));
            position.add(velocity.clone().multiplyScalar(dt));
            break;
        }
        case 'damped_spring': {
            const restPosition = params.restPosition || new Vector3(0, 0, 0);
            const stiffness = params.stiffness || 10;
            const damping = params.damping || 1;
            const mass = params.mass || 1;
            const displacement = new Vector3().subVectors(position, restPosition);
            const springForce = displacement.multiplyScalar(-stiffness);
            const dampingForce = velocity.clone().multiplyScalar(-damping);
            const acceleration = new Vector3().addVectors(springForce, dampingForce).divideScalar(mass);
            velocity.add(acceleration.multiplyScalar(dt));
            position.add(velocity.clone().multiplyScalar(dt));
            break;
        }
        case 'gravity': {
            const gravity = params.gravity || new Vector3(0, -9.81, 0);
            velocity.add(gravity.clone().multiplyScalar(dt));
            position.add(velocity.clone().multiplyScalar(dt));
            break;
        }
        case 'pendulum': {
            const restPosition = params.restPosition || new Vector3(0, 0, 0);
            const length = restPosition ? restPosition.length() : 1;
            const gravity = params.gravity || new Vector3(0, -9.81, 0);
            const direction = new Vector3().subVectors(position, restPosition).normalize();
            const tangentialGravity = gravity.clone().projectOnPlane(direction);
            const acceleration = tangentialGravity.multiplyScalar(-1 / length);
            velocity.add(acceleration.multiplyScalar(dt));
            position.add(velocity.clone().multiplyScalar(dt));
            // Constrain to pendulum length
            const currentLength = new Vector3().subVectors(position, restPosition).length();
            if (currentLength > 0) {
                position.subVectors(position, restPosition)
                    .normalize()
                    .multiplyScalar(length)
                    .add(restPosition);
            }
            break;
        }
        case 'elastic': {
            const restPosition = params.restPosition || new Vector3(0, 0, 0);
            const stiffness = params.stiffness || 20;
            const damping = params.damping || 2;
            const displacement = new Vector3().subVectors(position, restPosition);
            const distance = displacement.length();
            if (distance > 0) {
                const direction = displacement.normalize();
                const springForce = -stiffness * (distance - 1);
                const dampingForce = -damping * velocity.dot(direction);
                const acceleration = (springForce + dampingForce) * direction;
                velocity.add(acceleration.multiplyScalar(dt));
                position.add(velocity.clone().multiplyScalar(dt));
            }
            break;
        }
    }
    return { position, velocity };
}
/**
 * Check if an animation condition is met
 */
function checkCondition(condition, policy, object, camera) {
    let result = false;
    switch (condition.type) {
        case 'distance':
            if (camera && typeof condition.threshold === 'number') {
                const distance = camera.position.distanceTo(object.position);
                result = distance <= condition.threshold;
            }
            break;
        case 'visibility':
            if (camera) {
                const direction = new Vector3().subVectors(object.position, camera.position).normalize();
                const cameraDirection = new Vector3();
                camera.getWorldDirection(cameraDirection);
                const dot = direction.dot(cameraDirection);
                result = dot > 0.5; // Within ~60 degrees
            }
            break;
        case 'tag':
            if (typeof condition.trigger === 'string') {
                // This would integrate with TaggingSystem
                result = true; // Placeholder
            }
            break;
        case 'custom':
            if (typeof condition.trigger === 'function') {
                result = condition.trigger(policy, object);
            }
            break;
    }
    return condition.inverted ? !result : result;
}
/**
 * Apply loop mode to time value
 */
function applyLoopMode(time, duration, loopMode) {
    if (duration <= 0)
        return { time: 0, cycle: 0 };
    const totalCycles = time / duration;
    const cycle = Math.floor(totalCycles);
    const normalizedTime = totalCycles - cycle;
    switch (loopMode) {
        case 'once':
            return { time: Math.min(time, duration), cycle: Math.min(cycle, 1) };
        case 'loop':
            return { time: normalizedTime * duration, cycle };
        case 'pingpong':
            const pingpongCycle = cycle % 2;
            const pingpongTime = pingpongCycle === 0 ? normalizedTime * duration : (1 - normalizedTime) * duration;
            return { time: pingpongTime, cycle };
        case 'pingpong_once':
            if (time <= duration) {
                return { time, cycle: 0 };
            }
            else if (time <= duration * 2) {
                return { time: duration * 2 - time, cycle: 1 };
            }
            else {
                return { time: duration, cycle: 1 };
            }
        default:
            return { time: normalizedTime * duration, cycle };
    }
}
// ============================================================================
// AnimationPolicySystem Class
// ============================================================================
export class AnimationPolicySystem {
    constructor() {
        this.clock = new Clock();
        this.objectMap = new Map();
        this.eventListeners = new Map();
        this.timeline = {
            totalTime: 0,
            currentTime: 0,
            playing: false,
            speed: 1.0,
            policies: new Map(),
            states: new Map()
        };
    }
    /**
     * Register an object with the animation system
     */
    registerObject(object, id) {
        const objectId = id || object.uuid || generateAnimationId();
        this.objectMap.set(objectId, object);
        return objectId;
    }
    /**
     * Unregister an object from the animation system
     */
    unregisterObject(objectId) {
        this.objectMap.delete(objectId);
        // Remove associated states
        for (const [key, state] of this.timeline.states.entries()) {
            if (state.objectId === objectId) {
                this.timeline.states.delete(key);
            }
        }
    }
    /**
     * Create an animation policy with keyframe clip
     */
    createKeyframePolicy(targetObjects, clip, options) {
        const id = generateAnimationId();
        const policy = {
            id,
            targetObjects,
            clip: {
                ...clip,
                name: `clip_${id}`
            },
            priority: options?.priority ?? 0,
            layer: options?.layer ?? 0,
            blendWeight: options?.blendWeight ?? 1.0,
            startTime: options?.startTime ?? 0,
            duration: options?.duration ?? clip.duration,
            loopMode: options?.loopMode ?? 'loop',
            enabled: options?.enabled ?? true,
            conditions: options?.conditions ?? [],
            events: options?.events ?? []
        };
        this.timeline.policies.set(id, policy);
        return id;
    }
    /**
     * Create an animation policy with procedural motion
     */
    createProceduralPolicy(targetObjects, motion, options) {
        const id = generateAnimationId();
        const policy = {
            id,
            targetObjects,
            proceduralMotion: motion,
            priority: options?.priority ?? 0,
            layer: options?.layer ?? 0,
            blendWeight: options?.blendWeight ?? 1.0,
            startTime: options?.startTime ?? 0,
            duration: options?.duration ?? Infinity,
            loopMode: options?.loopMode ?? 'loop',
            enabled: options?.enabled ?? true,
            conditions: options?.conditions ?? [],
            events: options?.events ?? []
        };
        this.timeline.policies.set(id, policy);
        return id;
    }
    /**
     * Create an animation policy with physics-based animation
     */
    createPhysicsPolicy(targetObjects, physics, options) {
        const id = generateAnimationId();
        const policy = {
            id,
            targetObjects,
            physicsAnimation: physics,
            priority: options?.priority ?? 0,
            layer: options?.layer ?? 0,
            blendWeight: options?.blendWeight ?? 1.0,
            startTime: options?.startTime ?? 0,
            duration: options?.duration ?? Infinity,
            loopMode: options?.loopMode ?? 'loop',
            enabled: options?.enabled ?? true,
            conditions: options?.conditions ?? [],
            events: options?.events ?? []
        };
        this.timeline.policies.set(id, policy);
        // Initialize physics state for each target
        for (const objectId of targetObjects) {
            const object = this.objectMap.get(objectId);
            if (object) {
                const stateKey = `${id}_${objectId}`;
                this.timeline.states.set(stateKey, {
                    policyId: id,
                    objectId,
                    currentTime: 0,
                    elapsedTime: 0,
                    currentPose: {
                        position: object.position.clone(),
                        rotation: object.quaternion.clone(),
                        scale: object.scale.clone()
                    },
                    velocity: physics.initialVelocity?.clone() || new Vector3(),
                    angularVelocity: new Vector3(),
                    isPlaying: false,
                    isPaused: false,
                    completedCycles: 0
                });
            }
        }
        return id;
    }
    /**
     * Remove an animation policy
     */
    removePolicy(policyId) {
        this.timeline.policies.delete(policyId);
        // Remove associated states
        for (const [key, state] of this.timeline.states.entries()) {
            if (state.policyId === policyId) {
                this.timeline.states.delete(key);
            }
        }
    }
    /**
     * Enable or disable a policy
     */
    setPolicyEnabled(policyId, enabled) {
        const policy = this.timeline.policies.get(policyId);
        if (policy) {
            policy.enabled = enabled;
        }
    }
    /**
     * Set the blend weight of a policy
     */
    setPolicyWeight(policyId, weight) {
        const policy = this.timeline.policies.get(policyId);
        if (policy) {
            policy.blendWeight = Math.max(0, Math.min(1, weight));
        }
    }
    /**
     * Start the animation timeline
     */
    play() {
        this.timeline.playing = true;
        this.clock.start();
    }
    /**
     * Pause the animation timeline
     */
    pause() {
        this.timeline.playing = false;
        this.clock.stop();
    }
    /**
     * Stop and reset the animation timeline
     */
    stop() {
        this.timeline.playing = false;
        this.timeline.currentTime = 0;
        this.clock.stop();
        // Reset all states
        for (const state of this.timeline.states.values()) {
            state.currentTime = 0;
            state.elapsedTime = 0;
            state.isPlaying = false;
            state.completedCycles = 0;
        }
    }
    /**
     * Seek to a specific time in the timeline
     */
    seek(time) {
        this.timeline.currentTime = Math.max(0, time);
        // Update all states to match the new time
        for (const [policyId, policy] of this.timeline.policies.entries()) {
            for (const objectId of policy.targetObjects) {
                const stateKey = `${policyId}_${objectId}`;
                const state = this.timeline.states.get(stateKey);
                if (state) {
                    state.currentTime = time - policy.startTime;
                    state.elapsedTime = state.currentTime;
                }
            }
        }
    }
    /**
     * Set the playback speed
     */
    setSpeed(speed) {
        this.timeline.speed = Math.max(0, speed);
    }
    /**
     * Update all animations
     */
    update(deltaTime) {
        if (!this.timeline.playing)
            return;
        const dt = deltaTime ?? this.clock.getDelta();
        const scaledDt = dt * this.timeline.speed;
        this.timeline.currentTime += scaledDt;
        this.timeline.totalTime = Math.max(this.timeline.totalTime, this.timeline.currentTime);
        // Update each policy
        for (const [policyId, policy] of this.timeline.policies.entries()) {
            if (!policy.enabled)
                continue;
            // Check conditions
            let shouldRun = true;
            if (policy.conditions && policy.conditions.length > 0) {
                for (const objectId of policy.targetObjects) {
                    const object = this.objectMap.get(objectId);
                    if (object) {
                        for (const condition of policy.conditions) {
                            if (!checkCondition(condition, policy, object)) {
                                shouldRun = false;
                                break;
                            }
                        }
                    }
                    if (!shouldRun)
                        break;
                }
            }
            if (!shouldRun)
                continue;
            // Update each target object
            for (const objectId of policy.targetObjects) {
                const object = this.objectMap.get(objectId);
                if (!object)
                    continue;
                const stateKey = `${policyId}_${objectId}`;
                let state = this.timeline.states.get(stateKey);
                // Initialize state if needed
                if (!state) {
                    state = {
                        policyId,
                        objectId,
                        currentTime: 0,
                        elapsedTime: 0,
                        currentPose: {
                            position: object.position.clone(),
                            rotation: object.quaternion.clone(),
                            scale: object.scale.clone()
                        },
                        velocity: new Vector3(),
                        angularVelocity: new Vector3(),
                        isPlaying: true,
                        isPaused: false,
                        completedCycles: 0
                    };
                    this.timeline.states.set(stateKey, state);
                }
                if (state.isPaused)
                    continue;
                // Update time
                const localTime = this.timeline.currentTime - policy.startTime;
                if (localTime < 0)
                    continue;
                const { time: loopedTime, cycle } = applyLoopMode(localTime, policy.duration, policy.loopMode);
                state.currentTime = loopedTime;
                state.elapsedTime = localTime;
                // Detect cycle completion
                if (cycle > state.completedCycles) {
                    state.completedCycles = cycle;
                    // Trigger loop events
                    if (policy.events) {
                        for (const event of policy.events) {
                            if (event.time <= policy.duration && !event.triggered) {
                                event.callback?.(object, policy);
                                event.triggered = true;
                            }
                        }
                    }
                }
                // Apply animation based on type
                if (policy.clip) {
                    this.applyKeyframeAnimation(object, policy.clip, loopedTime, policy.blendWeight);
                }
                else if (policy.proceduralMotion) {
                    this.applyProceduralAnimation(object, policy.proceduralMotion, localTime, policy.blendWeight);
                }
                else if (policy.physicsAnimation) {
                    this.applyPhysicsAnimation(state, policy.physicsAnimation, scaledDt, policy.blendWeight);
                }
                // Check and trigger time-based events
                if (policy.events) {
                    for (const event of policy.events) {
                        if (!event.triggered && event.time <= loopedTime) {
                            event.callback?.(object, policy);
                            event.triggered = true;
                        }
                    }
                }
            }
        }
    }
    /**
     * Apply keyframe animation to an object
     */
    applyKeyframeAnimation(object, clip, time, weight) {
        if (clip.keyframes.length === 0)
            return;
        // Find surrounding keyframes
        let prevIndex = 0;
        let nextIndex = clip.keyframes.length - 1;
        for (let i = 0; i < clip.keyframes.length - 1; i++) {
            if (clip.keyframes[i].time <= time && clip.keyframes[i + 1].time >= time) {
                prevIndex = i;
                nextIndex = i + 1;
                break;
            }
        }
        const prev = clip.keyframes[prevIndex];
        const next = clip.keyframes[nextIndex];
        const duration = next.time - prev.time;
        const t = duration > 0 ? (time - prev.time) / duration : 0;
        // Interpolate
        const interpolated = interpolateKeyframes(prev, next, t, new LinearInterpolant(new Float32Array([0, 1]), new Float32Array(6), 3, new Float32Array(3)));
        // Apply with weight
        if (interpolated.position && weight > 0) {
            if (weight >= 1) {
                object.position.copy(interpolated.position);
            }
            else {
                object.position.lerp(interpolated.position, weight);
            }
        }
        if (interpolated.rotation && weight > 0) {
            if (weight >= 1) {
                if (interpolated.rotation instanceof Quaternion) {
                    object.quaternion.copy(interpolated.rotation);
                }
                else {
                    object.setRotationFromEuler(interpolated.rotation);
                }
            }
            else {
                const targetQuat = interpolated.rotation instanceof Quaternion
                    ? interpolated.rotation
                    : new Quaternion().setFromEuler(interpolated.rotation);
                object.quaternion.slerp(targetQuat, weight);
            }
        }
        if (interpolated.scale && weight > 0) {
            if (weight >= 1) {
                object.scale.copy(interpolated.scale);
            }
            else {
                object.scale.lerp(interpolated.scale, weight);
            }
        }
        if (interpolated.visible !== undefined) {
            object.visible = interpolated.visible;
        }
    }
    /**
     * Apply procedural animation to an object
     */
    applyProceduralAnimation(object, motion, time, weight) {
        const result = evaluateProceduralMotion(motion, time);
        if (weight >= 1) {
            object.position.copy(result.position);
        }
        else {
            object.position.lerp(result.position, weight);
        }
    }
    /**
     * Apply physics animation to an object
     */
    applyPhysicsAnimation(state, physics, deltaTime, weight) {
        const result = evaluatePhysicsAnimation(physics, { position: state.currentPose.position, velocity: state.velocity }, deltaTime);
        state.velocity.copy(result.velocity);
        if (weight >= 1) {
            state.currentPose.position.copy(result.position);
        }
        else {
            state.currentPose.position.lerp(result.position, weight);
        }
        // Apply to object
        const object = this.objectMap.get(state.objectId);
        if (object) {
            object.position.copy(state.currentPose.position);
        }
    }
    /**
     * Get the current state of an animation
     */
    getAnimationState(policyId, objectId) {
        const stateKey = `${policyId}_${objectId}`;
        return this.timeline.states.get(stateKey);
    }
    /**
     * Get all active policies
     */
    getActivePolicies() {
        return Array.from(this.timeline.policies.values()).filter(p => p.enabled);
    }
    /**
     * Get policy by ID
     */
    getPolicy(policyId) {
        return this.timeline.policies.get(policyId);
    }
    /**
     * Export timeline state to JSON
     */
    exportToJSON() {
        const data = {
            timeline: {
                totalTime: this.timeline.totalTime,
                currentTime: this.timeline.currentTime,
                speed: this.timeline.speed
            },
            policies: Array.from(this.timeline.policies.values()).map(p => ({
                ...p,
                clip: p.clip ? {
                    ...p.clip,
                    keyframes: p.clip.keyframes.map(k => ({
                        ...k,
                        position: k.position ? [k.position.x, k.position.y, k.position.z] : undefined,
                        rotation: k.rotation instanceof Quaternion
                            ? [k.rotation.x, k.rotation.y, k.rotation.z, k.rotation.w]
                            : k.rotation instanceof Euler
                                ? [k.rotation.x, k.rotation.y, k.rotation.z]
                                : undefined,
                        scale: k.scale ? [k.scale.x, k.scale.y, k.scale.z] : undefined
                    }))
                } : undefined
            })),
            states: Array.from(this.timeline.states.values()).map(s => ({
                ...s,
                currentPose: {
                    position: [s.currentPose.position.x, s.currentPose.position.y, s.currentPose.position.z],
                    rotation: [s.currentPose.rotation.x, s.currentPose.rotation.y, s.currentPose.rotation.z, s.currentPose.rotation.w],
                    scale: [s.currentPose.scale.x, s.currentPose.scale.y, s.currentPose.scale.z]
                },
                velocity: [s.velocity.x, s.velocity.y, s.velocity.z],
                angularVelocity: [s.angularVelocity.x, s.angularVelocity.y, s.angularVelocity.z]
            }))
        };
        return JSON.stringify(data, null, 2);
    }
    /**
     * Import timeline state from JSON
     */
    importFromJSON(json) {
        const data = JSON.parse(json);
        this.timeline.totalTime = data.timeline.totalTime;
        this.timeline.currentTime = data.timeline.currentTime;
        this.timeline.speed = data.timeline.speed;
        // Clear existing policies
        this.timeline.policies.clear();
        this.timeline.states.clear();
        // Import policies
        for (const policyData of data.policies) {
            const clip = policyData.clip ? {
                ...policyData.clip,
                keyframes: policyData.clip.keyframes.map((k) => ({
                    ...k,
                    position: k.position ? new Vector3(...k.position) : undefined,
                    rotation: k.rotation?.length === 4
                        ? new Quaternion(...k.rotation)
                        : k.rotation?.length === 3
                            ? new Euler(...k.rotation)
                            : undefined,
                    scale: k.scale ? new Vector3(...k.scale) : undefined
                }))
            } : undefined;
            const policy = {
                ...policyData,
                clip
            };
            this.timeline.policies.set(policy.id, policy);
        }
        // Import states
        for (const stateData of data.states) {
            const state = {
                ...stateData,
                currentPose: {
                    position: new Vector3(...stateData.currentPose.position),
                    rotation: new Quaternion(...stateData.currentPose.rotation),
                    scale: new Vector3(...stateData.currentPose.scale)
                },
                velocity: new Vector3(...stateData.velocity),
                angularVelocity: new Vector3(...stateData.angularVelocity)
            };
            this.timeline.states.set(`${state.policyId}_${state.objectId}`, state);
        }
    }
    /**
     * Add an event listener for animation events
     */
    addEventListener(eventType, callback) {
        if (!this.eventListeners.has(eventType)) {
            this.eventListeners.set(eventType, new Set());
        }
        this.eventListeners.get(eventType).add(callback);
    }
    /**
     * Remove an event listener
     */
    removeEventListener(eventType, callback) {
        const listeners = this.eventListeners.get(eventType);
        if (listeners) {
            listeners.delete(callback);
        }
    }
    /**
     * Emit an event
     */
    emitEvent(eventType, data) {
        const listeners = this.eventListeners.get(eventType);
        if (listeners) {
            for (const listener of listeners) {
                listener(data);
            }
        }
    }
    /**
     * Get statistics about the animation system
     */
    getStatistics() {
        const policies = Array.from(this.timeline.policies.values());
        const states = Array.from(this.timeline.states.values());
        return {
            totalPolicies: policies.length,
            activePolicies: policies.filter(p => p.enabled).length,
            totalStates: states.length,
            playingStates: states.filter(s => s.isPlaying && !s.isPaused).length,
            registeredObjects: this.objectMap.size
        };
    }
}
export default AnimationPolicySystem;
//# sourceMappingURL=AnimationPolicySystem.js.map