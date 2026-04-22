/**
 * Sky Lighting System for R3F/Three.js
 * Based on infinigen/assets/lighting/sky_lighting.py
 * 
 * Provides procedural sky/nishita lighting setup
 */

import * as THREE from 'three';

export interface SkyLightingConfig {
  // Dust density parameters (mean, stddev, min, max)
  dustDensity?: [number, number, number, number];
  // Air density parameters (mean, stddev, min, max)  
  airDensity?: [number, number, number, number];
  // Overall strength
  strength?: number | [number, number];
  // Sun intensity
  sunIntensity?: number | [number, number];
  // Sun elevation in degrees
  sunElevation?: number | [number, number];
  // Sun size in degrees
  sunSize?: number;
  // Dynamic animation
  dynamic?: boolean;
  // Rising angle for dynamic mode
  risingAngle?: number;
  // Camera-based rotation offset in degrees
  cameraBasedRotation?: number | null;
  // Ozone density
  ozoneDensity?: number;
  // Altitude
  altitude?: number;
}

/**
 * Clip Gaussian random value
 */
function clipGaussian(
  mean: number,
  stddev: number,
  min: number,
  max: number
): number {
  // Box-Muller transform for Gaussian distribution
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  const value = z0 * stddev + mean;
  return Math.max(min, Math.min(max, value));
}

/**
 * Random utility functions
 */
function randomRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function sphericalSample(minElevation: number): number {
  // Sample elevation with bias towards horizon
  const u = Math.random();
  return minElevation + (90 - minElevation) * Math.sqrt(u);
}

/**
 * Create Sky/Nishita lighting setup
 * 
 * Note: Three.js doesn't have built-in Nishita sky model,
 * so this uses a combination of Sky shader and directional light
 * to approximate the effect.
 * 
 * @param scene - Three.js scene
 * @param config - Configuration options
 * @returns Lighting setup including sun direction and sky material
 */
export function createSkyLighting(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  config: SkyLightingConfig = {}
): { 
  sunDirection: THREE.Vector3; 
  skyMesh: THREE.Mesh | null;
  sunLight: THREE.DirectionalLight;
} {
  const {
    dustDensity = [1, 1, 0.1, 2],
    airDensity = [1, 0.2, 0.7, 1.3],
    strength = [0.18, 0.22],
    sunIntensity = [0.8, 1],
    sunElevation = [10, 90],
    sunSize = 0.5,
    dynamic = false,
    risingAngle = 90,
    cameraBasedRotation = null,
    ozoneDensity = 1,
    altitude = 100,
  } = config;

  // Generate randomized parameters
  const finalDustDensity = clipGaussian(...dustDensity);
  const finalAirDensity = clipGaussian(...airDensity);
  const finalStrength = Array.isArray(strength)
    ? randomRange(strength[0], strength[1])
    : strength;
  const finalSunIntensity = Array.isArray(sunIntensity)
    ? randomRange(sunIntensity[0], sunIntensity[1])
    : sunIntensity;
  
  const finalSunElevation = Array.isArray(sunElevation)
    ? sphericalSample(sunElevation[0])
    : sunElevation;
  
  const sunAzimuth = randomRange(0, 2 * Math.PI);
  const sunElevationRad = THREE.MathUtils.degToRad(finalSunElevation);
  const sunSizeRad = THREE.MathUtils.degToRad(clipGaussian(sunSize, 0.3, 0.25, 5));

  // Calculate sun direction
  const sunDirection = new THREE.Vector3();
  sunDirection.x = Math.cos(sunElevationRad) * Math.sin(sunAzimuth);
  sunDirection.y = Math.sin(sunElevationRad);
  sunDirection.z = Math.cos(sunElevationRad) * Math.cos(sunAzimuth);
  sunDirection.normalize();

  // Create sun light (directional light)
  const sunColor = new THREE.Color().setHSL(0.1, 0.8, 0.6);
  const sunLight = new THREE.DirectionalLight(sunColor, finalSunIntensity * finalStrength);
  sunLight.position.copy(sunDirection).multiplyScalar(100);
  sunLight.castShadow = true;
  
  // Configure shadow properties
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 500;
  sunLight.shadow.bias = -0.0001;
  
  scene.add(sunLight);

  // Create sky mesh (using Three.js Sky shader if available)
  let skyMesh: THREE.Mesh | null = null;
  
  /*
  // This would be implemented with @react-three/drei or custom shader
  import { Sky } from '@react-three/drei';
  
  const sky = new Sky();
  sky.scale.setScalar(450000);
  
  const uniforms = sky.material.uniforms;
  uniforms['turbidity'].value = finalAirDensity * 10;
  uniforms['rayleigh'].value = finalDustDensity;
  uniforms['mieCoefficient'].value = 0.005;
  uniforms['mieDirectionalG'].value = 0.7;
  uniforms['sunPosition'].value.copy(sunDirection);
  
  scene.add(sky);
  skyMesh = sky;
  */

  // Add ambient light to simulate atmospheric scattering
  const skyColor = new THREE.Color().setHSL(0.6, 0.5, 0.5);
  const hemiLight = new THREE.HemisphereLight(skyColor, 0x444444, finalStrength * 0.5);
  hemiLight.position.set(0, 50, 0);
  scene.add(hemiLight);

  console.log(`Sky Lighting created - Elevation: ${finalSunElevation.toFixed(1)}°, Intensity: ${finalSunIntensity.toFixed(2)}`);

  return {
    sunDirection,
    skyMesh,
    sunLight,
  };
}

/**
 * Add sky lighting to scene (convenience function)
 */
export function addSkyLighting(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  config?: SkyLightingConfig
): void {
  createSkyLighting(scene, renderer, config);
}

/**
 * Animate sun position for day/night cycle
 */
export function animateSunPosition(
  sunLight: THREE.DirectionalLight,
  startTime: number,
  endTime: number,
  startElevation: number = -8,
  endElevation: number = 90
): void {
  // This would be called in an animation loop
  const duration = endTime - startTime;
  const currentTime = Date.now() / 1000;
  const progress = Math.min(1, Math.max(0, (currentTime - startTime) / duration));
  
  const elevation = startElevation + (endElevation - startElevation) * progress;
  const azimuth = 0; // Could be varied for seasonal effects
  
  const elevationRad = THREE.MathUtils.degToRad(elevation);
  const newPosition = new THREE.Vector3();
  newPosition.x = Math.cos(elevationRad) * Math.sin(azimuth);
  newPosition.y = Math.sin(elevationRad);
  newPosition.z = Math.cos(elevationRad) * Math.cos(azimuth);
  newPosition.normalize().multiplyScalar(100);
  
  sunLight.position.copy(newPosition);
}

export default {
  createSkyLighting,
  addSkyLighting,
  animateSunPosition,
};
