/**
 * Sky Lighting - Sky and atmospheric lighting setup
 *
 * Provides sky lighting configuration and setup utilities
 * for outdoor scene rendering.
 *
 * ⚠️  DEPRECATED: This module is superseded by the Nishita-backed
 *     {@link SkyLightingSystem} from `./SkyLightingSystem`.
 *
 * The `setupSkyLighting` function and `SkyConfig` type are retained for
 * backward compatibility only. They will be removed in a future release.
 *
 * Migration:
 *   OLD: import { setupSkyLighting } from './sky-lighting';
 *   NEW: import { SkyLightingSystem } from './SkyLightingSystem';
 *        const sky = new SkyLightingSystem(); await sky.attach(scene);
 *
 * @deprecated Use `./SkyLightingSystem` instead.
 */

import * as THREE from 'three';

// Re-export the Nishita-integrated SkyLightingSystem as the default sky solution
export { SkyLightingSystem } from './SkyLightingSystem';
export type { SkyLightingSystemConfig } from './SkyLightingSystem';

/**
 * @deprecated Use {@link SkyLightingSystemConfig} from `./SkyLightingSystem` instead.
 */
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
  /** Seed for randomization */
  seed?: number;
  /** Time of day (0-24 hours) */
  hour?: number;
}

/**
 * @deprecated Use {@link SkyLightingSystem} from `./SkyLightingSystem` instead.
 */
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

/**
 * @deprecated Use {@link SkyLightingSystem} from `./SkyLightingSystem` instead.
 *           To create a sky-lit scene, instantiate SkyLightingSystem and call
 *           `await sky.attach(scene)`.
 */
export function setupSkyLighting(
  sceneOrConfig: THREE.Scene | Partial<SkyConfig>,
  configOrUndefined?: Partial<SkyConfig>
): { sunLight: THREE.DirectionalLight; ambientLight: THREE.AmbientLight } | THREE.Group {
  let scene: THREE.Scene | null = null;
  let config: Partial<SkyConfig> = {};

  if (sceneOrConfig instanceof THREE.Scene) {
    scene = sceneOrConfig;
    config = configOrUndefined || {};
  } else {
    config = sceneOrConfig;
  }

  const fullConfig = { ...DEFAULT_SKY_CONFIG, ...config };
  // Map hour to elevation/azimuth if provided
  if (fullConfig.hour !== undefined) {
    fullConfig.elevation = Math.max(0, 90 - Math.abs(fullConfig.hour - 12) * 7.5);
    fullConfig.azimuth = fullConfig.hour < 12 ? 90 + fullConfig.hour * 7.5 : 180;
  }

  const sunLight = new THREE.DirectionalLight(0xffffff, fullConfig.sunIntensity);
  const phi = THREE.MathUtils.degToRad(90 - fullConfig.elevation);
  const theta = THREE.MathUtils.degToRad(fullConfig.azimuth);
  sunLight.position.setFromSphericalCoords(100, phi, theta);
  sunLight.castShadow = true;

  const ambientLight = new THREE.AmbientLight(fullConfig.skyColor, fullConfig.ambientIntensity);

  if (scene) {
    scene.add(sunLight);
    scene.add(ambientLight);
  }

  // If called with just config (no scene), return a Group
  if (!scene) {
    const group = new THREE.Group();
    group.add(sunLight);
    group.add(ambientLight);
    return group;
  }

  return { sunLight, ambientLight };
}

/**
 * @deprecated Use {@link SkyLightingSystem} instead for physically-based sky rendering.
 */
export const LegacySkyLighting = { setupSkyLighting, DEFAULT_SKY_CONFIG };
