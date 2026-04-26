import * as THREE from 'three';
import { InterpolationMode, generateTrajectory } from './TrajectoryGenerator';
/**
 * Create an orbit camera trajectory around a center point
 */
export function createOrbitShot(config) {
    const { center, radius, startAngle = 0, endAngle = Math.PI * 2, elevation = Math.PI / 6, // 30 degrees
    minElevation, maxElevation, rotations = 1, duration = 5, clockwise = true, lookAtCenter = true, samplesPerSecond = 60, } = config;
    const keyframes = [];
    const totalSamples = Math.ceil(duration * samplesPerSecond);
    const totalAngle = (endAngle - startAngle) + (rotations - 1) * Math.PI * 2;
    const angleDirection = clockwise ? -1 : 1;
    for (let i = 0; i <= totalSamples; i++) {
        const t = i / totalSamples;
        const time = t * duration;
        // Calculate current angle
        const currentAngle = startAngle + angleDirection * totalAngle * t;
        // Calculate elevation (can vary for more dynamic shots)
        let currentElevation = elevation;
        if (minElevation !== undefined && maxElevation !== undefined) {
            // Oscillate between min and max elevation
            currentElevation = minElevation + (maxElevation - minElevation) * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
        }
        // Calculate position on sphere
        const x = center.x + radius * Math.cos(currentElevation) * Math.cos(currentAngle);
        const y = center.y + radius * Math.sin(currentElevation);
        const z = center.z + radius * Math.cos(currentElevation) * Math.sin(currentAngle);
        const position = new THREE.Vector3(x, y, z);
        const target = lookAtCenter ? center.clone() : undefined;
        keyframes.push({
            time,
            position,
            target,
            fov: 75,
            roll: 0,
        });
    }
    return keyframes;
}
/**
 * Generate sampled trajectory from orbit shot
 */
export function generateOrbitTrajectory(config) {
    const keyframes = createOrbitShot(config);
    return generateTrajectory(keyframes, {
        keyframes,
        interpolation: InterpolationMode.CatmullRom,
        duration: config.duration ?? 5,
        samplesPerSecond: config.samplesPerSecond ?? 60,
    });
}
/**
 * Create a simple circular orbit (convenience function)
 */
export function createCircularOrbit(center, radius, duration = 5, rotations = 1, elevation = Math.PI / 6) {
    return createOrbitShot({
        center,
        radius,
        duration,
        rotations,
        elevation,
        startAngle: 0,
        endAngle: Math.PI * 2,
    });
}
/**
 * Create a spiral orbit (changing radius over time)
 */
export function createSpiralOrbit(center, startRadius, endRadius, duration = 5, rotations = 2, elevation = Math.PI / 6) {
    const samplesPerSecond = 60;
    const totalSamples = Math.ceil(duration * samplesPerSecond);
    const keyframes = [];
    for (let i = 0; i <= totalSamples; i++) {
        const t = i / totalSamples;
        const time = t * duration;
        const angle = t * rotations * Math.PI * 2;
        // Interpolate radius
        const radius = startRadius + (endRadius - startRadius) * t;
        const x = center.x + radius * Math.cos(elevation) * Math.cos(angle);
        const y = center.y + radius * Math.sin(elevation);
        const z = center.z + radius * Math.cos(elevation) * Math.sin(angle);
        keyframes.push({
            time,
            position: new THREE.Vector3(x, y, z),
            target: center.clone(),
        });
    }
    return keyframes;
}
export default {
    createOrbitShot,
    generateOrbitTrajectory,
    createCircularOrbit,
    createSpiralOrbit,
};
//# sourceMappingURL=OrbitShot.js.map