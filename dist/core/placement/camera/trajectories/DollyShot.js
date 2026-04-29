import * as THREE from 'three';
import { InterpolationMode, generateTrajectory } from './TrajectoryGenerator';
/**
 * Create a dolly shot (linear camera movement along Z-axis or arbitrary path)
 */
export function createDollyShot(config) {
    const { start, end, duration = 3, target, easeIn = true, easeOut = true, fovStart = 75, fovEnd = 75, samplesPerSecond = 60, } = config;
    const keyframes = [];
    const totalSamples = Math.ceil(duration * samplesPerSecond);
    for (let i = 0; i <= totalSamples; i++) {
        const t = i / totalSamples;
        const time = t * duration;
        // Apply easing
        let easedT = t;
        if (easeIn && easeOut) {
            // Ease in-out (smoothstep)
            easedT = t * t * (3 - 2 * t);
        }
        else if (easeIn) {
            // Ease in (quadratic)
            easedT = t * t;
        }
        else if (easeOut) {
            // Ease out (quadratic)
            easedT = t * (2 - t);
        }
        // Interpolate position
        const position = new THREE.Vector3().lerpVectors(start, end, easedT);
        // Interpolate FOV for dolly zoom effect
        const fov = THREE.MathUtils.lerp(fovStart, fovEnd, easedT);
        keyframes.push({
            time,
            position,
            target: target?.clone(),
            fov,
            roll: 0,
        });
    }
    return keyframes;
}
/**
 * Generate sampled trajectory from dolly shot
 */
export function generateDollyTrajectory(config) {
    const keyframes = createDollyShot(config);
    return generateTrajectory(keyframes, {
        keyframes,
        interpolation: InterpolationMode.CatmullRom,
        duration: config.duration ?? 3,
        samplesPerSecond: config.samplesPerSecond ?? 60,
    });
}
/**
 * Create a push-in shot (dolly forward)
 */
export function createPushIn(startPosition, targetPosition, duration = 3, fovChange = 0) {
    return createDollyShot({
        start: startPosition,
        end: targetPosition,
        duration,
        target: targetPosition.clone(),
        fovStart: 75,
        fovEnd: 75 + fovChange,
    });
}
/**
 * Create a pull-back shot (dolly backward)
 */
export function createPullBack(startPosition, endPosition, duration = 3, fovChange = 0) {
    return createDollyShot({
        start: startPosition,
        end: endPosition,
        duration,
        target: startPosition.clone(), // Look back at original subject
        fovStart: 75 + fovChange,
        fovEnd: 75,
    });
}
/**
 * Create a dolly zoom (Vertigo/Hitchcock effect)
 * Moves camera while adjusting FOV to keep subject same size
 */
export function createDollyZoom(start, end, subjectPosition, duration = 3, zoomIntensity = 1.5) {
    const startDist = start.distanceTo(subjectPosition);
    const endDist = end.distanceTo(subjectPosition);
    const fovMultiplier = startDist / endDist;
    return createDollyShot({
        start,
        end,
        duration,
        target: subjectPosition,
        fovStart: 75,
        fovEnd: 75 * fovMultiplier * zoomIntensity,
        easeIn: true,
        easeOut: true,
    });
}
/**
 * Create a tracking shot (lateral movement parallel to subject)
 */
export function createTrackingShot(start, end, trackTarget, duration = 4, offset = 2) {
    // Calculate perpendicular direction
    const direction = new THREE.Vector3().subVectors(end, start).normalize();
    const toTarget = new THREE.Vector3().subVectors(trackTarget, start).normalize();
    const perpendicular = new THREE.Vector3().crossVectors(direction, toTarget).normalize().multiplyScalar(offset);
    const adjustedStart = start.clone().add(perpendicular);
    const adjustedEnd = end.clone().add(perpendicular);
    return createDollyShot({
        start: adjustedStart,
        end: adjustedEnd,
        duration,
        target: trackTarget,
    });
}
export default {
    createDollyShot,
    generateDollyTrajectory,
    createPushIn,
    createPullBack,
    createDollyZoom,
    createTrackingShot,
};
//# sourceMappingURL=DollyShot.js.map