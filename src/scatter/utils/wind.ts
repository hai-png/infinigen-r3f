/**
 * Wind utilities for scatter systems
 * Based on infinigen/assets/scatters/utils/wind.py
 */

import * as THREE from 'three';

export interface WindParams {
  strength: number;
  direction?: THREE.Vector3;
  variability?: number;
  time?: number;
}

/**
 * Generates wind-based rotation offset for vegetation
 * @param strength - Wind strength (0-100)
 * @returns Rotation vector (x, y, z in radians)
 */
export function windRotation(strength: number = 10): THREE.Vector3 {
  const normalizedStrength = Math.min(strength / 100, 1);
  
  // Primary wind direction (typically along X or Z)
  const primaryAxis = Math.random() > 0.5 ? 'x' : 'z';
  
  // Base rotation from wind strength
  const maxRotation = normalizedStrength * 0.5; // Max ~0.5 radians (~30 degrees)
  
  // Add some variability
  const variability = 0.3;
  
  const rotation = new THREE.Vector3(
    primaryAxis === 'x' ? (Math.random() - 0.5) * maxRotation * 2 : (Math.random() - 0.5) * maxRotation * variability,
    0,
    primaryAxis === 'z' ? (Math.random() - 0.5) * maxRotation * 2 : (Math.random() - 0.5) * maxRotation * variability
  );
  
  return rotation;
}

/**
 * Generates animated wind effect for real-time applications
 * @param params - Wind parameters
 * @returns Time-varying rotation offset
 */
export function animatedWind(params: WindParams): THREE.Vector3 {
  const { strength, direction = new THREE.Vector3(1, 0, 0), variability = 0.3, time = 0 } = params;
  
  const normalizedStrength = Math.min(strength / 100, 1);
  const maxRotation = normalizedStrength * 0.5;
  
  // Perlin-like noise using sine waves
  const gustX = Math.sin(time * 0.5) * 0.5 + Math.sin(time * 1.3) * 0.3;
  const gustZ = Math.cos(time * 0.7) * 0.5 + Math.sin(time * 0.9) * 0.3;
  
  // Direction influence
  const dirFactor = new THREE.Vector3(
    Math.abs(direction.x),
    0,
    Math.abs(direction.z)
  ).normalize();
  
  const rotation = new THREE.Vector3(
    gustX * maxRotation * dirFactor.x * (1 + variability * Math.random()),
    0,
    gustZ * maxRotation * dirFactor.z * (1 + variability * Math.random())
  );
  
  return rotation;
}

/**
 * Applies wind force to vegetation vertices (for vertex animation)
 * @param positions - Vertex positions array
 * @param strength - Wind strength
 * @param time - Animation time
 * @returns Displaced positions
 */
export function applyWindToVertices(
  positions: Float32Array,
  strength: number = 10,
  time: number = 0
): Float32Array {
  const result = new Float32Array(positions.length);
  const normalizedStrength = Math.min(strength / 100, 1);
  
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    
    // Height-based wind effect (stronger at top)
    const heightFactor = Math.max(0, y) / 10; // Normalize height
    
    // Sway motion
    const swayX = Math.sin(time * 2 + z * 0.5) * normalizedStrength * heightFactor;
    const swayZ = Math.cos(time * 1.5 + x * 0.5) * normalizedStrength * heightFactor;
    
    result[i] = x + swayX;
    result[i + 1] = y;
    result[i + 2] = z + swayZ;
  }
  
  return result;
}

export default { windRotation, animatedWind, applyWindToVertices };
