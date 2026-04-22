/**
 * HDRI Lighting System for R3F/Three.js
 * Based on infinigen/assets/lighting/hdri_lighting.py
 * 
 * Provides procedural HDRI environment lighting setup
 */

import * as THREE from 'three';

export interface HDRILightingConfig {
  strength?: number | [number, number]; // Single value or [min, max] range
  rotation?: number; // Rotation around Y axis in radians
  hdriPath?: string; // Path to HDRI file
  useRandomHDRI?: boolean; // Whether to randomly select from available HDRIs
}

export interface HDRIResource {
  name: string;
  path: string;
  texture?: THREE.DataTexture;
}

/**
 * Default HDRI resources (to be populated with actual assets)
 */
const DEFAULT_HDRI_RESOURCES: HDRIResource[] = [
  { name: 'studio', path: '/assets/hdri/studio.exr' },
  { name: 'outdoor_day', path: '/assets/hdri/outdoor_day.exr' },
  { name: 'sunset', path: '/assets/hdri/sunset.exr' },
  { name: 'night', path: '/assets/hdri/night.exr' },
  { name: 'overcast', path: '/assets/hdri/overcast.exr' },
];

/**
 * Random utility functions
 */
function randomRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Create HDRI lighting setup
 * 
 * @param scene - Three.js scene
 * @param config - Configuration options
 * @returns Environment map and lighting setup
 */
export function createHDRILighting(
  scene: THREE.Scene,
  config: HDRILightingConfig = {}
): { environment: THREE.WebGLCubeRenderTarget | null; light: THREE.AmbientLight } {
  const {
    strength = [0.8, 1.2],
    rotation = randomRange(0, Math.PI * 2),
    hdriPath,
    useRandomHDRI = true,
  } = config;

  // Determine strength value
  const finalStrength = Array.isArray(strength)
    ? randomRange(strength[0], strength[1])
    : strength;

  // Select HDRI
  let selectedHDRI: HDRIResource | undefined;
  
  if (hdriPath) {
    selectedHDRI = DEFAULT_HDRI_RESOURCES.find(r => r.path === hdriPath);
  } else if (useRandomHDRI) {
    selectedHDRI = randomChoice(DEFAULT_HDRI_RESOURCES);
  }

  // Create ambient light as fallback/base
  const ambientLight = new THREE.AmbientLight(0xffffff, finalStrength);
  scene.add(ambientLight);

  // Note: In a real implementation, you would load the HDRI texture here
  // using THREE.RGBELoader or similar, then set it as the scene environment
  // This is a stub showing the structure
  
  /*
  if (selectedHDRI) {
    const rgbeLoader = new RGBELoader();
    rgbeLoader.load(selectedHDRI.path, (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      
      // Create environment render target
      const pmremGenerator = new PMREMGenerator(renderer);
      const environment = pmremGenerator.fromEquirectangular(texture);
      
      scene.environment = environment.texture;
      scene.background = texture; // Optional: use as background
      
      // Apply rotation
      texture.rotation = rotation;
      
      // Cleanup
      texture.dispose();
      pmremGenerator.dispose();
    });
  }
  */

  console.log(`HDRI Lighting created with strength: ${finalStrength}, HDRI: ${selectedHDRI?.name || 'none'}`);

  return {
    environment: null, // Would be populated in full implementation
    light: ambientLight,
  };
}

/**
 * Add HDRI lighting to scene (convenience function)
 */
export function addHDRILighting(
  scene: THREE.Scene,
  config?: HDRILightingConfig
): void {
  createHDRILighting(scene, config);
}

/**
 * Register a custom HDRI resource
 */
export function registerHDRIResource(resource: HDRIResource): void {
  DEFAULT_HDRI_RESOURCES.push(resource);
}

/**
 * Get all available HDRI resources
 */
export function getAvailableHDRIs(): HDRIResource[] {
  return [...DEFAULT_HDRI_RESOURCES];
}

export default {
  createHDRILighting,
  addHDRILighting,
  registerHDRIResource,
  getAvailableHDRIs,
};
