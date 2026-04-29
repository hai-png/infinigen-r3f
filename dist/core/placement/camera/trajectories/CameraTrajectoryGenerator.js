import * as THREE from 'three';
/**
 * Camera Trajectory Generator
 *
 * Comprehensive camera path generation system supporting:
 * - Orbit trajectories (circular, elliptical, spiral)
 * - Spline-based paths (Catmull-Rom, Bezier, custom curves)
 * - FPS-style movement (waypoint navigation, free look)
 * - Cinematic shots (dolly, crane, tracking)
 *
 * @module CameraTrajectoryGenerator
 */
/**
 * Trajectory types supported by the generator
 */
export var TrajectoryType;
(function (TrajectoryType) {
    /** Circular orbit around a target */
    TrajectoryType["ORBIT_CIRCULAR"] = "orbit_circular";
    /** Elliptical orbit with varying radius */
    TrajectoryType["ORBIT_ELLIPTICAL"] = "orbit_elliptical";
    /** Spiral orbit moving up/down while rotating */
    TrajectoryType["ORBIT_SPIRAL"] = "orbit_spiral";
    /** Smooth spline through control points */
    TrajectoryType["SPLINE_CATMULLROM"] = "spline_catmullrom";
    /** Bezier curve trajectory */
    TrajectoryType["SPLINE_BEZIER"] = "spline_bezier";
    /** Custom curve defined by function */
    TrajectoryType["SPLINE_CUSTOM"] = "spline_custom";
    /** FPS-style waypoint navigation */
    TrajectoryType["FPS_WAYPOINT"] = "fps_waypoint";
    /** FPS free-look with movement */
    TrajectoryType["FPS_FREELOOK"] = "fps_freelook";
    /** Dolly shot (forward/backward movement) */
    TrajectoryType["CINEMATIC_DOLLY"] = "cinematic_dolly";
    /** Crane shot (vertical movement) */
    TrajectoryType["CINEMATIC_CRANE"] = "cinematic_crane";
    /** Tracking shot (follow subject) */
    TrajectoryType["CINEMATIC_TRACKING"] = "cinematic_tracking";
})(TrajectoryType || (TrajectoryType = {}));
/**
 * Easing functions for smooth motion
 */
export const EasingFunctions = {
    linear: (t) => t,
    easeIn: (t) => t * t,
    easeOut: (t) => t * (2 - t),
    easeInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
};
/**
 * Camera Trajectory Generator Class
 *
 * Generates various types of camera paths for automated cinematography,
 * surveillance simulation, and dynamic scene viewing.
 */
export class CameraTrajectoryGenerator {
    /**
     * Generate a complete trajectory based on configuration
     */
    generate(type, config, duration, samplesPerSecond) {
        const sps = samplesPerSecond ?? CameraTrajectoryGenerator.DEFAULT_SAMPLES_PER_SECOND;
        let samples = [];
        switch (type) {
            case TrajectoryType.ORBIT_CIRCULAR:
            case TrajectoryType.ORBIT_ELLIPTICAL:
            case TrajectoryType.ORBIT_SPIRAL:
                samples = this.generateOrbit(type, config, duration, sps);
                break;
            case TrajectoryType.SPLINE_CATMULLROM:
            case TrajectoryType.SPLINE_BEZIER:
            case TrajectoryType.SPLINE_CUSTOM:
                samples = this.generateSpline(type, config, duration, sps);
                break;
            case TrajectoryType.FPS_WAYPOINT:
            case TrajectoryType.FPS_FREELOOK:
                samples = this.generateFPS(type, config, sps);
                break;
            case TrajectoryType.CINEMATIC_DOLLY:
            case TrajectoryType.CINEMATIC_CRANE:
            case TrajectoryType.CINEMATIC_TRACKING:
                samples = this.generateCinematic(type, config, duration, sps);
                break;
            default:
                throw new Error(`Unknown trajectory type: ${type}`);
        }
        // Calculate metadata
        const totalDistance = this.calculateTotalDistance(samples);
        const boundingBox = this.calculateBoundingBox(samples);
        const speeds = this.calculateSpeeds(samples);
        return {
            type,
            samples,
            duration: samples.length > 0 ? samples[samples.length - 1].time : 0,
            totalDistance,
            boundingBox,
            metadata: {
                controlPointCount: this.getControlPointCount(type, config),
                revolutions: type === TrajectoryType.ORBIT_SPIRAL ? config.revolutions : undefined,
                averageSpeed: speeds.average,
                maxSpeed: speeds.max,
                minSpeed: speeds.min,
            },
        };
    }
    /**
     * Generate orbit trajectory (circular, elliptical, or spiral)
     */
    generateOrbit(type, config, duration = 10, samplesPerSecond) {
        const samples = [];
        const totalSamples = Math.ceil(duration * samplesPerSecond);
        const center = config.center || new THREE.Vector3(0, 0, 0);
        const radius = config.radius || 5;
        const verticalRadius = config.verticalRadius || radius;
        const height = config.height || 0;
        const upAxis = config.upAxis || new THREE.Vector3(0, 1, 0);
        const startAngle = config.startAngle ?? 0;
        const revolutions = config.revolutions ?? 1;
        const endAngle = config.endAngle ?? startAngle + Math.PI * 2 * revolutions;
        const heightChange = config.heightChangePerRevolution || 0;
        const tiltAngle = config.tiltAngle || 0;
        // Create rotation matrix for tilted orbit
        const tiltMatrix = new THREE.Matrix4().makeRotationX(tiltAngle);
        for (let i = 0; i <= totalSamples; i++) {
            const t = i / totalSamples;
            const time = t * duration;
            // Interpolate angle
            const angle = THREE.MathUtils.lerp(startAngle, endAngle, t);
            // Calculate base position on orbit
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            // Apply vertical radius for elliptical orbits
            let y = Math.sin(angle) * (verticalRadius - radius);
            // Add height and spiral effect
            if (type === TrajectoryType.ORBIT_SPIRAL) {
                y += height + heightChange * (angle / (Math.PI * 2));
            }
            else {
                y += height;
            }
            // Create position vector
            const position = new THREE.Vector3(x, y, z);
            // Apply tilt rotation
            position.applyMatrix4(tiltMatrix);
            // Add center offset
            position.add(center);
            // Calculate target (look at center by default)
            const target = center.clone();
            // Calculate velocity (tangent to orbit)
            const velocity = new THREE.Vector3(-Math.sin(angle), Math.cos(angle), 0);
            velocity.applyMatrix4(tiltMatrix);
            velocity.normalize().multiplyScalar((radius * (endAngle - startAngle)) / duration);
            samples.push({
                time,
                position,
                target,
                up: upAxis.clone(),
                fov: CameraTrajectoryGenerator.DEFAULT_FOV,
                roll: 0,
                velocity,
                distanceTraveled: this.calculateDistanceTraveled(samples, position),
            });
        }
        return samples;
    }
    /**
     * Generate spline-based trajectory
     */
    generateSpline(type, config, duration = 10, samplesPerSecond) {
        const samples = [];
        const totalSamples = Math.ceil(duration * samplesPerSecond);
        const controlPoints = config.controlPoints;
        if (controlPoints.length < 2) {
            throw new Error('Spline requires at least 2 control points');
        }
        // Create curve based on interpolation type
        let curve;
        if (type === TrajectoryType.SPLINE_CUSTOM && config.customFunction) {
            curve = new THREE.CustomCurve(config.customFunction);
        }
        else if (type === TrajectoryType.SPLINE_BEZIER) {
            // For Bezier, we need groups of 4 points
            curve = this.createBezierCurve(controlPoints);
        }
        else {
            // Default to Catmull-Rom
            curve = new THREE.CatmullRomCurve3(controlPoints, config.closed ?? false, 'centripetal', config.tension ?? 0.5);
        }
        // Get targets if provided
        const targets = config.targets || [];
        for (let i = 0; i <= totalSamples; i++) {
            const t = i / totalSamples;
            const time = t * duration;
            // Get position on curve
            const position = curve.getPoint(t);
            // Get target (interpolate between provided targets or look ahead)
            let target;
            if (targets.length > 0) {
                const targetIndex = Math.min(Math.floor(t * targets.length), targets.length - 1);
                const nextTargetIndex = Math.min(targetIndex + 1, targets.length - 1);
                const targetT = (t * targets.length) % 1;
                target = new THREE.Vector3().lerpVectors(targets[targetIndex], targets[nextTargetIndex], targetT);
            }
            else {
                // Look ahead on the curve
                const lookAheadT = Math.min(t + 0.05, 1);
                target = curve.getPoint(lookAheadT);
            }
            // Calculate velocity (derivative approximation)
            const deltaT = 0.001;
            const nextPos = curve.getPoint(Math.min(t + deltaT, 1));
            const velocity = nextPos.clone().sub(position).divideScalar(deltaT);
            samples.push({
                time,
                position,
                target,
                up: new THREE.Vector3(0, 1, 0),
                fov: CameraTrajectoryGenerator.DEFAULT_FOV,
                roll: 0,
                velocity,
                distanceTraveled: this.calculateDistanceTraveled(samples, position),
            });
        }
        return samples;
    }
    /**
     * Generate FPS-style trajectory
     */
    generateFPS(type, config, samplesPerSecond) {
        const samples = [];
        const waypoints = config.waypoints;
        if (waypoints.length === 0) {
            return samples;
        }
        const movementSpeed = config.movementSpeed ?? CameraTrajectoryGenerator.DEFAULT_FPS_SPEED;
        const smoothTurning = config.smoothTurning ?? true;
        const turnSpeed = config.turnSpeed ?? Math.PI; // radians per second
        const waypointDurations = config.waypointDurations || [];
        const lookDirections = config.lookDirections || [];
        const fovValues = config.fovValues || [];
        const pauseDuration = config.pauseDuration ?? 0.5;
        let currentTime = 0;
        let currentPosition = waypoints[0].clone();
        let currentDirection = lookDirections[0]?.clone() || new THREE.Vector3(0, 0, -1);
        for (let i = 0; i < waypoints.length; i++) {
            const waypoint = waypoints[i];
            const nextWaypoint = waypoints[i + 1];
            // Add pause at waypoint (except first)
            if (i > 0 && pauseDuration > 0) {
                const pauseSamples = Math.ceil(pauseDuration * samplesPerSecond);
                for (let j = 0; j < pauseSamples; j++) {
                    const t = j / pauseSamples;
                    const time = currentTime + t * pauseDuration;
                    // Smooth look direction transition
                    const targetDirection = lookDirections[i]?.clone() ||
                        (nextWaypoint ? nextWaypoint.clone().sub(waypoint).normalize() : currentDirection);
                    let direction = currentDirection;
                    if (smoothTurning) {
                        direction = this.rotateTowards(currentDirection, targetDirection, turnSpeed * t * pauseDuration);
                    }
                    else {
                        direction = targetDirection;
                    }
                    const target = currentPosition.clone().add(direction);
                    samples.push({
                        time,
                        position: currentPosition.clone(),
                        target,
                        up: new THREE.Vector3(0, 1, 0),
                        fov: fovValues[i] ?? CameraTrajectoryGenerator.DEFAULT_FOV,
                        roll: 0,
                        velocity: new THREE.Vector3(0, 0, 0),
                        distanceTraveled: this.calculateDistanceTraveled(samples, currentPosition),
                    });
                }
                currentTime += pauseDuration;
            }
            // Move to next waypoint
            if (nextWaypoint) {
                const distance = currentPosition.distanceTo(nextWaypoint);
                const travelTime = distance / movementSpeed;
                const travelSamples = Math.ceil(travelTime * samplesPerSecond);
                for (let j = 0; j <= travelSamples; j++) {
                    const t = j / travelSamples;
                    const time = currentTime + t * travelTime;
                    // Interpolate position
                    const position = new THREE.Vector3().lerpVectors(currentPosition, nextWaypoint, t);
                    // Calculate desired look direction
                    const desiredDirection = lookDirections[i]?.clone() ||
                        nextWaypoint.clone().sub(position).normalize();
                    // Smooth turning
                    let direction = currentDirection;
                    if (smoothTurning) {
                        const maxTurn = turnSpeed * t * travelTime;
                        direction = this.rotateTowards(currentDirection, desiredDirection, maxTurn);
                    }
                    else {
                        direction = desiredDirection;
                    }
                    const target = position.clone().add(direction);
                    // Calculate velocity
                    const velocity = nextWaypoint.clone().sub(currentPosition).divideScalar(travelTime);
                    samples.push({
                        time,
                        position,
                        target,
                        up: new THREE.Vector3(0, 1, 0),
                        fov: fovValues[i] ?? CameraTrajectoryGenerator.DEFAULT_FOV,
                        roll: 0,
                        velocity,
                        distanceTraveled: this.calculateDistanceTraveled(samples, position),
                    });
                }
                currentTime += travelTime;
                currentPosition = nextWaypoint.clone();
                currentDirection = lookDirections[i]?.clone() ||
                    (waypoints[i + 2] ? waypoints[i + 2].clone().sub(nextWaypoint).normalize() : currentDirection);
            }
        }
        return samples;
    }
    /**
     * Generate cinematic trajectory
     */
    generateCinematic(type, config, duration = 5, samplesPerSecond) {
        const samples = [];
        const totalSamples = Math.ceil(duration * samplesPerSecond);
        const startPos = config.startPos;
        const endPos = config.endPos;
        const target = config.target;
        const startFOV = config.startFOV ?? CameraTrajectoryGenerator.DEFAULT_FOV;
        const endFOV = config.endFOV ?? startFOV;
        const roll = config.roll ?? 0;
        const easingFunc = EasingFunctions[config.easing ?? 'linear'];
        for (let i = 0; i <= totalSamples; i++) {
            const t = i / totalSamples;
            const time = t * duration;
            // Apply easing
            const easedT = easingFunc(t);
            // Interpolate position
            const position = new THREE.Vector3().lerpVectors(startPos, endPos, easedT);
            // For tracking shots, adjust target to follow moving subject
            let finalTarget = target.clone();
            if (type === TrajectoryType.CINEMATIC_TRACKING) {
                // Could add logic to predict subject movement here
                // For now, just use the provided target
            }
            // Interpolate FOV
            const fov = THREE.MathUtils.lerp(startFOV, endFOV, easedT);
            // Calculate velocity
            const deltaT = 0.001;
            const nextT = Math.min(t + deltaT, 1);
            const nextEasedT = easingFunc(nextT);
            const nextPosition = new THREE.Vector3().lerpVectors(startPos, endPos, nextEasedT);
            const velocity = nextPosition.clone().sub(position).divideScalar(deltaT);
            samples.push({
                time,
                position,
                target: finalTarget,
                up: new THREE.Vector3(0, 1, 0),
                fov,
                roll,
                velocity,
                distanceTraveled: this.calculateDistanceTraveled(samples, position),
            });
        }
        return samples;
    }
    /**
     * Helper: Rotate vector towards target direction
     */
    rotateTowards(current, target, maxAngle) {
        const currentNorm = current.clone().normalize();
        const targetNorm = target.clone().normalize();
        const dot = currentNorm.dot(targetNorm);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (angle <= maxAngle || angle < 0.001) {
            return targetNorm;
        }
        // Rotate by maxAngle towards target
        const axis = new THREE.Vector3().crossVectors(currentNorm, targetNorm).normalize();
        const quaternion = new THREE.Quaternion().setFromAxisAngle(axis, maxAngle);
        return currentNorm.applyQuaternion(quaternion);
    }
    /**
     * Helper: Calculate cumulative distance traveled
     */
    calculateDistanceTraveled(samples, newPosition) {
        if (samples.length === 0)
            return 0;
        const lastSample = samples[samples.length - 1];
        const lastDist = lastSample.distanceTraveled || 0;
        return lastDist + newPosition.distanceTo(lastSample.position);
    }
    /**
     * Helper: Calculate total distance of trajectory
     */
    calculateTotalDistance(samples) {
        if (samples.length < 2)
            return 0;
        let total = 0;
        for (let i = 1; i < samples.length; i++) {
            total += samples[i].position.distanceTo(samples[i - 1].position);
        }
        return total;
    }
    /**
     * Helper: Calculate bounding box of trajectory
     */
    calculateBoundingBox(samples) {
        const box = new THREE.Box3();
        for (const sample of samples) {
            box.expandByPoint(sample.position);
        }
        return box;
    }
    /**
     * Helper: Calculate speed statistics
     */
    calculateSpeeds(samples) {
        if (samples.length < 2) {
            return { average: 0, max: 0, min: 0 };
        }
        const speeds = [];
        for (let i = 1; i < samples.length; i++) {
            const dt = samples[i].time - samples[i - 1].time;
            if (dt > 0) {
                const dist = samples[i].position.distanceTo(samples[i - 1].position);
                speeds.push(dist / dt);
            }
        }
        if (speeds.length === 0) {
            return { average: 0, max: 0, min: 0 };
        }
        const sum = speeds.reduce((a, b) => a + b, 0);
        return {
            average: sum / speeds.length,
            max: Math.max(...speeds),
            min: Math.min(...speeds),
        };
    }
    /**
     * Helper: Get control point count for metadata
     */
    getControlPointCount(type, config) {
        if ('controlPoints' in config) {
            return config.controlPoints.length;
        }
        if ('waypoints' in config) {
            return config.waypoints.length;
        }
        return 0;
    }
    /**
     * Create Bezier curve from control points
     */
    createBezierCurve(points) {
        // Group points into sets of 4 for cubic Bezier segments
        const curves = [];
        for (let i = 0; i < points.length - 1; i += 3) {
            const p0 = points[i];
            const p1 = points[i + 1] || p0.clone().lerp(points[i + 1] || p0, 0.33);
            const p2 = points[i + 2] || p0.clone().lerp(points[i + 1] || p0, 0.66);
            const p3 = points[i + 3] || points[points.length - 1];
            curves.push(new THREE.CubicBezierCurve3(p0, p1, p2, p3));
        }
        // Create a composite curve
        return new CompositeCurve(curves);
    }
    /**
     * Visualize trajectory as a line mesh
     */
    visualize(data, color = 0x00ff00) {
        const points = data.samples.map(s => s.position);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color });
        return new THREE.Line(geometry, material);
    }
    /**
     * Export trajectory to JSON
     */
    toJSON(data) {
        return JSON.stringify({
            type: data.type,
            duration: data.duration,
            totalDistance: data.totalDistance,
            samples: data.samples.map(s => ({
                time: s.time,
                position: [s.position.x, s.position.y, s.position.z],
                target: [s.target.x, s.target.y, s.target.z],
                up: [s.up.x, s.up.y, s.up.z],
                fov: s.fov,
                roll: s.roll,
            })),
            metadata: data.metadata,
        }, null, 2);
    }
    /**
     * Import trajectory from JSON
     */
    fromJSON(json) {
        const parsed = JSON.parse(json);
        return {
            type: parsed.type,
            samples: parsed.samples.map((s) => ({
                time: s.time,
                position: new THREE.Vector3(...s.position),
                target: new THREE.Vector3(...s.target),
                up: new THREE.Vector3(...s.up),
                fov: s.fov,
                roll: s.roll,
            })),
            duration: parsed.duration,
            totalDistance: parsed.totalDistance,
            boundingBox: new THREE.Box3(),
            metadata: parsed.metadata || {},
        };
    }
}
/** Default samples per second for trajectory discretization */
CameraTrajectoryGenerator.DEFAULT_SAMPLES_PER_SECOND = 60;
/** Default movement speed for FPS trajectories */
CameraTrajectoryGenerator.DEFAULT_FPS_SPEED = 5.0;
/** Default FOV */
CameraTrajectoryGenerator.DEFAULT_FOV = 75;
/**
 * Custom curve class for user-defined trajectories
 */
class CustomCurve extends THREE.Curve {
    constructor(func) {
        super();
        this.func = func;
    }
    getPoint(t) {
        return this.func(t);
    }
}
/**
 * Composite curve that chains multiple curves together
 */
class CompositeCurve extends THREE.Curve {
    constructor(curves) {
        super();
        this.curves = curves;
        this.lengths = [];
        this.totalLength = 0;
        // Calculate lengths for proper parameterization
        this.lengths = this.curves.map(c => c.getLength());
        this.totalLength = this.lengths.reduce((a, b) => a + b, 0);
    }
    getPoint(t) {
        if (this.curves.length === 0)
            return new THREE.Vector3();
        if (this.curves.length === 1)
            return this.curves[0].getPoint(t);
        // Find which curve segment we're in
        let accumulatedLength = 0;
        for (let i = 0; i < this.curves.length; i++) {
            const segmentLength = this.lengths[i];
            const segmentEnd = (accumulatedLength + segmentLength) / this.totalLength;
            if (t <= segmentEnd || i === this.curves.length - 1) {
                const localT = (t - accumulatedLength / this.totalLength) / (segmentLength / this.totalLength);
                return this.curves[i].getPoint(Math.max(0, Math.min(1, localT)));
            }
            accumulatedLength += segmentLength;
        }
        return this.curves[this.curves.length - 1].getPoint(1);
    }
}
export default CameraTrajectoryGenerator;
//# sourceMappingURL=CameraTrajectoryGenerator.js.map