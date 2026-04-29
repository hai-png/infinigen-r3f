import * as THREE from 'three';
import { InterpolationMode, generateTrajectory } from './TrajectoryGenerator';
/**
 * Create a crane shot (vertical camera movement up or down)
 */
export function createCraneShot(config) {
    const { start, end, duration = 4, target, arcHeight = 0, easeIn = true, easeOut = true, samplesPerSecond = 60, } = config;
    const keyframes = [];
    const totalSamples = Math.ceil(duration * samplesPerSecond);
    const midPoint = Math.floor(totalSamples / 2);
    for (let i = 0; i <= totalSamples; i++) {
        const t = i / totalSamples;
        const time = t * duration;
        // Apply easing
        let easedT = t;
        if (easeIn && easeOut) {
            easedT = t * t * (3 - 2 * t);
        }
        else if (easeIn) {
            easedT = t * t;
        }
        else if (easeOut) {
            easedT = t * (2 - t);
        }
        // Calculate position with optional arc
        let position;
        if (arcHeight > 0) {
            // Arc motion: go up then down (or vice versa)
            const arcFactor = Math.sin(t * Math.PI);
            const yOffset = arcHeight * arcFactor;
            position = new THREE.Vector3(THREE.MathUtils.lerp(start.x, end.x, easedT), THREE.MathUtils.lerp(start.y, end.y, easedT) + yOffset, THREE.MathUtils.lerp(start.z, end.z, easedT));
        }
        else {
            // Linear interpolation
            position = new THREE.Vector3().lerpVectors(start, end, easedT);
        }
        keyframes.push({
            time,
            position,
            target: target?.clone(),
            fov: 75,
            roll: 0,
        });
    }
    return keyframes;
}
/**
 * Generate sampled trajectory from crane shot
 */
export function generateCraneTrajectory(config) {
    const keyframes = createCraneShot(config);
    return generateTrajectory(keyframes, {
        keyframes,
        interpolation: InterpolationMode.CatmullRom,
        duration: config.duration ?? 4,
        samplesPerSecond: config.samplesPerSecond ?? 60,
    });
}
/**
 * Create a pan shot (horizontal camera rotation)
 */
export function createPanShot(config) {
    const { center, radius, startAngle = 0, endAngle = Math.PI / 4, // 45 degrees
    elevation = 0, duration = 3, lookAtCenter = true, samplesPerSecond = 60, } = config;
    const keyframes = [];
    const totalSamples = Math.ceil(duration * samplesPerSecond);
    for (let i = 0; i <= totalSamples; i++) {
        const t = i / totalSamples;
        const time = t * duration;
        const angle = startAngle + (endAngle - startAngle) * t;
        const x = center.x + radius * Math.cos(elevation) * Math.cos(angle);
        const y = center.y + radius * Math.sin(elevation);
        const z = center.z + radius * Math.cos(elevation) * Math.sin(angle);
        keyframes.push({
            time,
            position: new THREE.Vector3(x, y, z),
            target: lookAtCenter ? center.clone() : undefined,
            fov: 75,
            roll: 0,
        });
    }
    return keyframes;
}
/**
 * Create a tilt shot (vertical camera rotation)
 */
export function createTiltShot(config) {
    const { center, radius, startElevation = 0, endElevation = Math.PI / 6, // 30 degrees
    azimuth = 0, duration = 3, lookAtCenter = true, samplesPerSecond = 60, } = config;
    const keyframes = [];
    const totalSamples = Math.ceil(duration * samplesPerSecond);
    for (let i = 0; i <= totalSamples; i++) {
        const t = i / totalSamples;
        const time = t * duration;
        const elevation = startElevation + (endElevation - startElevation) * t;
        const x = center.x + radius * Math.cos(elevation) * Math.cos(azimuth);
        const y = center.y + radius * Math.sin(elevation);
        const z = center.z + radius * Math.cos(elevation) * Math.sin(azimuth);
        keyframes.push({
            time,
            position: new THREE.Vector3(x, y, z),
            target: lookAtCenter ? center.clone() : undefined,
            fov: 75,
            roll: 0,
        });
    }
    return keyframes;
}
/**
 * Create handheld camera simulation (organic shake)
 */
export function createHandheldSim(config) {
    const { basePosition, target, duration = 5, intensity = 0.05, frequency = 2, seed = Math.random(), samplesPerSecond = 60, } = config;
    const keyframes = [];
    const totalSamples = Math.ceil(duration * samplesPerSecond);
    // Simple pseudo-random based on seed
    const random = (() => {
        let s = seed;
        return () => {
            s = Math.sin(s * 12.9898 + 78.233) * 43758.5453;
            return s - Math.floor(s);
        };
    })();
    for (let i = 0; i <= totalSamples; i++) {
        const t = i / totalSamples;
        const time = t * duration;
        // Combine multiple sine waves for organic motion
        const shakeX = Math.sin(time * frequency * 2 * Math.PI) * intensity +
            Math.sin(time * frequency * 3.7 * Math.PI + random()) * intensity * 0.5 +
            Math.sin(time * frequency * 5.3 * Math.PI + random()) * intensity * 0.25;
        const shakeY = Math.sin(time * frequency * 2.5 * Math.PI + random()) * intensity +
            Math.sin(time * frequency * 4.1 * Math.PI + random()) * intensity * 0.5;
        const shakeZ = Math.sin(time * frequency * 1.8 * Math.PI) * intensity * 0.5 +
            Math.sin(time * frequency * 2.9 * Math.PI + random()) * intensity * 0.25;
        const position = new THREE.Vector3(basePosition.x + shakeX, basePosition.y + shakeY, basePosition.z + shakeZ);
        // Subtle roll for more realism
        const roll = Math.sin(time * frequency * Math.PI) * 0.02;
        keyframes.push({
            time,
            position,
            target: target?.clone(),
            fov: 75,
            roll,
        });
    }
    return keyframes;
}
export default {
    createCraneShot,
    generateCraneTrajectory,
    createPanShot,
    createTiltShot,
    createHandheldSim,
};
//# sourceMappingURL=CraneShot.js.map