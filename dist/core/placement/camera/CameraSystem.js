/**
 * Camera System for Infinigen R3F
 *
 * Complete camera placement, cinematography, and trajectory system.
 * Ported from: placement/camera.py (30.7KB)
 */
import { item } from '../../constraints/language/constants';
import { Visible, Proximity, InFrontOf, Facing, } from '../../constraints/language/relations';
import { FilterObjects, TagCondition, ForAll } from '../../constraints/language/set-reasoning';
import { SCENE } from '../../constraints/language/constants';
/**
 * Default camera properties by type
 */
export const DEFAULT_CAMERA_PROPERTIES = {
    perspective: {
        focalLength: 35,
        fStop: 2.8,
        focusDistance: 10,
        sensorSize: [36, 24],
        near: 0.1,
        far: 1000,
        enableDOF: false,
    },
    orthographic: {
        near: 0.1,
        far: 1000,
    },
    stereo: {
        focalLength: 35,
        fStop: 2.8,
        focusDistance: 10,
        interaxialDistance: 0.065, // Average human IPD
    },
    panoramic: {
        fov: 360,
        near: 0.1,
        far: 1000,
    },
    fisheye: {
        focalLength: 8,
        fov: 180,
        near: 0.1,
        far: 1000,
    },
};
/**
 * Shot size distance ranges (in meters from subject)
 */
export const SHOT_SIZE_DISTANCES = {
    extreme_close_up: [0.3, 0.5],
    close_up: [0.5, 1.0],
    medium_close_up: [1.0, 1.5],
    medium: [1.5, 2.5],
    medium_long: [2.5, 4.0],
    long: [4.0, 8.0],
    very_long: [8.0, 15.0],
    extreme_long: [15.0, 50.0],
};
/**
 * Camera angle elevation ranges (in degrees)
 */
export const CAMERA_ANGLE_ELEVATIONS = {
    bird_eye: [75, 90],
    high_angle: [45, 75],
    eye_level: [-15, 45],
    low_angle: [-45, -15],
    worm_eye: [-90, -45],
};
/**
 * Camera constraint: Frame a subject
 */
export function Frames(camera, subject, shotSize) {
    const cameraVar = typeof camera === 'string' ? item(camera) : camera;
    const subjectVar = typeof subject === 'string' ? item(subject) : subject;
    const constraints = [];
    // Camera must have line of sight to subject
    constraints.push(new Visible(subjectVar, cameraVar));
    // Camera should be in front of subject
    constraints.push(new InFrontOf(cameraVar, subjectVar));
    // Add distance constraint based on shot size
    if (shotSize) {
        const [minDist, maxDist] = SHOT_SIZE_DISTANCES[shotSize];
        constraints.push(new Proximity(cameraVar, subjectVar, maxDist, minDist));
    }
    return new AndRelations(constraints);
}
/**
 * Camera constraint: Maintain clear line of sight
 */
export function HasLineOfSight(camera, subject, minVisibility = 0.8) {
    const cameraVar = typeof camera === 'string' ? item(camera) : camera;
    const subjectVar = typeof subject === 'string' ? item(subject) : subject;
    return new Visible(subjectVar, cameraVar);
}
/**
 * Camera constraint: Maintain shot size
 */
export function MaintainsShotSize(camera, subject, shotSize) {
    const cameraVar = typeof camera === 'string' ? item(camera) : camera;
    const subjectVar = typeof subject === 'string' ? item(subject) : subject;
    const [minDist, maxDist] = SHOT_SIZE_DISTANCES[shotSize];
    return new Proximity(cameraVar, subjectVar, maxDist, minDist);
}
/**
 * Camera constraint: Specific camera angle
 */
export function HasCameraAngle(camera, subject, angle) {
    const cameraVar = typeof camera === 'string' ? item(camera) : camera;
    const subjectVar = typeof subject === 'string' ? item(subject) : subject;
    const [minElev, maxElev] = CAMERA_ANGLE_ELEVATIONS[angle];
    // This would need geometry predicate for angle calculation
    // Simplified version using facing constraint
    return new Facing(cameraVar, subjectVar);
}
/**
 * Camera constraint: Avoid obstruction
 */
export function AvoidsObstruction(camera, subject, maxOcclusion = 0.2) {
    const cameraVar = typeof camera === 'string' ? item(camera) : camera;
    const subjectVar = typeof subject === 'string' ? item(subject) : subject;
    // Get potential occluders (objects between camera and subject)
    const occluders = new FilterObjects(SCENE, new TagCondition('semantics', 'occluder'));
    // For all occluders, they should not block the view
    return new ForAll(occluders, (occluder) => new Visible(subjectVar, cameraVar));
}
/**
 * Camera constraint: Follow subject
 */
export function FollowsSubject(camera, subject, followDistance = 3.0) {
    const cameraVar = typeof camera === 'string' ? item(camera) : camera;
    const subjectVar = typeof subject === 'string' ? item(subject) : subject;
    return new Proximity(cameraVar, subjectVar, followDistance);
}
/**
 * Calculate optimal camera position based on composition rules
 */
export function calculateOptimalPosition(subjectPosition, subjectDirection, config) {
    const { shotSize = 'medium', angle = 'eye_level', minDistance = 1.0, maxDistance = 10.0, heightRange = [0.5, 3.0], } = config;
    // Get distance range for shot size
    const [sizeMinDist, sizeMaxDist] = SHOT_SIZE_DISTANCES[shotSize];
    const targetDistance = (sizeMinDist + sizeMaxDist) / 2;
    const clampedDistance = Math.max(minDistance, Math.min(maxDistance, targetDistance));
    // Get elevation for angle
    const [minElev, maxElev] = CAMERA_ANGLE_ELEVATIONS[angle];
    const elevation = ((minElev + maxElev) / 2) * (Math.PI / 180);
    // Calculate position based on subject direction
    const horizontalAngle = Math.atan2(subjectDirection.x, subjectDirection.z);
    // Offset camera behind and to the side of subject
    const offsetX = Math.sin(horizontalAngle) * clampedDistance * Math.cos(elevation);
    const offsetZ = Math.cos(horizontalAngle) * clampedDistance * Math.cos(elevation);
    const offsetY = Math.sin(elevation) * clampedDistance;
    // Clamp height
    const finalY = Math.max(heightRange[0], Math.min(heightRange[1], subjectPosition.y + offsetY));
    return {
        x: subjectPosition.x + offsetX,
        y: finalY,
        z: subjectPosition.z + offsetZ,
    };
}
/**
 * Generate trajectory keyframes for a movement type
 */
export function generateTrajectoryKeyframes(config, startPosition, startTarget) {
    const { movement, duration, keyframes } = config;
    // Return custom keyframes if provided
    if (keyframes && keyframes.length > 0) {
        return keyframes;
    }
    const keyframeCount = Math.max(2, Math.floor(duration * 2)); // 2 keyframes per second
    const keyframes_ = [];
    switch (movement) {
        case 'dolly': {
            // Push in/out along view direction
            const direction = normalizeVector(subtractVectors(startPosition, startTarget));
            for (let i = 0; i <= keyframeCount; i++) {
                const t = i / keyframeCount;
                const progress = easeInOut(t);
                const distance = lerp(3, 1, progress); // Move from 3m to 1m
                keyframes_.push({
                    time: t * duration,
                    position: addVectors(startTarget, scaleVector(direction, distance)),
                    target: startTarget,
                    easing: 'ease_in_out',
                });
            }
            break;
        }
        case 'orbit': {
            const center = config.orbitCenter || startTarget;
            const radius = config.orbitRadius || 3;
            const totalAngle = (config.arcAngle || 360) * (Math.PI / 180);
            for (let i = 0; i <= keyframeCount; i++) {
                const t = i / keyframeCount;
                const angle = t * totalAngle;
                keyframes_.push({
                    time: t * duration,
                    position: {
                        x: center.x + Math.sin(angle) * radius,
                        y: center.y,
                        z: center.z + Math.cos(angle) * radius,
                    },
                    target: center,
                    easing: 'linear',
                });
            }
            break;
        }
        case 'pan': {
            // Rotate camera around its position
            const panAngle = (Math.PI / 4) * (duration / 2); // 45 degrees over 2 seconds
            for (let i = 0; i <= keyframeCount; i++) {
                const t = i / keyframeCount;
                const angle = t * panAngle;
                keyframes_.push({
                    time: t * duration,
                    position: startPosition,
                    rotation: { x: 0, y: angle, z: 0 },
                    easing: 'linear',
                });
            }
            break;
        }
        case 'tracking': {
            // Would need subject trajectory - simplified version
            for (let i = 0; i <= keyframeCount; i++) {
                const t = i / keyframeCount;
                keyframes_.push({
                    time: t * duration,
                    position: startPosition, // Would follow subject in real implementation
                    target: startTarget,
                    easing: 'linear',
                });
            }
            break;
        }
        case 'crane': {
            // Vertical arc movement
            const startHeight = startPosition.y;
            const endHeight = startHeight + 2; // Rise 2 meters
            for (let i = 0; i <= keyframeCount; i++) {
                const t = i / keyframeCount;
                const progress = easeInOut(t);
                keyframes_.push({
                    time: t * duration,
                    position: {
                        x: startPosition.x,
                        y: lerp(startHeight, endHeight, progress),
                        z: startPosition.z,
                    },
                    target: startTarget,
                    easing: 'ease_in_out',
                });
            }
            break;
        }
        default:
            // Static or unknown - just return start position
            keyframes_.push({
                time: 0,
                position: startPosition,
                target: startTarget,
            });
            keyframes_.push({
                time: duration,
                position: startPosition,
                target: startTarget,
            });
    }
    return keyframes_;
}
// Helper math functions
function subtractVectors(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function addVectors(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function scaleVector(v, s) {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
}
function normalizeVector(v) {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (len === 0)
        return { x: 0, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
}
function lerp(a, b, t) {
    return a + (b - a) * t;
}
function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
// Placeholder for AndRelations (would be imported)
class AndRelations {
    constructor(children) {
        this.children = children;
        this.type = 'and';
    }
}
//# sourceMappingURL=CameraSystem.js.map