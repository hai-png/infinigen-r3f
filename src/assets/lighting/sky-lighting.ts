/**
 * Sky Lighting - Sky and atmospheric lighting setup
 * 
 * Provides sky lighting configuration and setup utilities
 * for outdoor scene rendering.
 */

import * as THREE from 'three';

export interface SkyConfig {
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  elevation: number;
  azimuth: number;
  sunIntensity: number;
  ambientIntensity: number;
  skyColor: THREE.Color;
  groundColor: THREE.Color;
}

export const DEFAULT_SKY_CONFIG: SkyConfig = {
  turbidity: 10,
  rayleigh: 3,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.7,
  elevation: 45,
  azimuth: 180,
  sunIntensity: 1.5,
  ambientIntensity: 0.4,
  skyColor: new THREE.Color(0x87ceeb),
  groundColor: new THREE.Color(0x444422),
};

export function setupSkyLighting(
  scene: THREE.Scene,
  config: Partial<SkyConfig> = {}
): { sunLight: THREE.DirectionalLight; ambientLight: THREE.AmbientLight } {
  const fullConfig = { ...DEFAULT_SKY_CONFIG, ...config };

  const sunLight = new THREE.DirectionalLight(0xffffff, fullConfig.sunIntensity);
  const phi = THREE.MathUtils.degToRad(90 - fullConfig.elevation);
  const theta = THREE.MathUtils.degToRad(fullConfig.azimuth);
  sunLight.position.setFromSphericalCoords(100, phi, theta);
  sunLight.castShadow = true;

  const ambientLight = new THREE.AmbientLight(fullConfig.skyColor, fullConfig.ambientIntensity);

  scene.add(sunLight);
  scene.add(ambientLight);

  return { sunLight, ambientLight };
}
