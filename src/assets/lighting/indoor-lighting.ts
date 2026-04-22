/**
 * Indoor Lighting System for R3F/Three.js
 * Based on infinigen/assets/lighting/
 * 
 * Provides three-point lighting and indoor scene illumination presets
 */

import * as THREE from 'three';

export interface ThreePointLightingConfig {
  keyIntensity?: number;
  fillIntensity?: number;
  backIntensity?: number;
  keyAngle?: number;
  fillAngle?: number;
  backAngle?: number;
  keyHeight?: number;
  fillHeight?: number;
  backHeight?: number;
  colorTemperature?: number; // in Kelvin
  shadows?: boolean;
  target?: THREE.Object3D;
}

export interface AreaLightConfig {
  width: number;
  height: number;
  intensity: number;
  color?: THREE.Color;
  position: THREE.Vector3;
  target?: THREE.Vector3;
  castShadows?: boolean;
}

export interface EmissiveLightConfig {
  mesh: THREE.Mesh;
  intensity: number;
  color?: THREE.Color;
  distance?: number;
  decay?: number;
}

/**
 * Creates a classic three-point lighting setup
 * Key light: Main directional light
 * Fill light: Softer light to reduce shadows
 * Back light: Rim light for separation
 */
export function createThreePointLighting(
  config: ThreePointLightingConfig = {}
): {
  lights: THREE.Light[];
  helpers: THREE.Object3D[];
  cleanup: () => void;
} {
  const {
    keyIntensity = 1.5,
    fillIntensity = 0.5,
    backIntensity = 0.8,
    keyAngle = Math.PI / 4,
    fillAngle = -Math.PI / 4,
    backAngle = Math.PI,
    keyHeight = 2,
    fillHeight = 1.5,
    backHeight = 2.5,
    colorTemperature = 5600,
    shadows = true,
    target = new THREE.Object3D(),
  } = config;

  const lights: THREE.Light[] = [];
  const helpers: THREE.Object3D[] = [];

  // Convert color temperature to RGB
  const baseColor = kelvinToRGB(colorTemperature);

  // Key Light (main light source)
  const keyLight = new THREE.DirectionalLight(baseColor, keyIntensity);
  keyLight.position.setFromSphericalCoords(5, keyAngle, keyHeight);
  keyLight.target = target;
  keyLight.castShadow = shadows;
  
  if (shadows) {
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 50;
    keyLight.shadow.camera.left = -5;
    keyLight.shadow.camera.right = 5;
    keyLight.shadow.camera.top = 5;
    keyLight.shadow.camera.bottom = -5;
  }
  
  lights.push(keyLight);

  // Fill Light (softer, opposite side)
  const fillLight = new THREE.DirectionalLight(baseColor, fillIntensity);
  fillLight.position.setFromSphericalCoords(4, fillAngle, fillHeight);
  fillLight.target = target;
  fillLight.castShadow = false;
  lights.push(fillLight);

  // Back Light (rim light for separation)
  const backLight = new THREE.DirectionalLight(baseColor, backIntensity);
  backLight.position.setFromSphericalCoords(4, backAngle, backHeight);
  backLight.target = target;
  backLight.castShadow = false;
  lights.push(backLight);

  // Optional: Add ambient light for base illumination
  const ambientLight = new THREE.AmbientLight(baseColor, 0.2);
  lights.push(ambientLight);

  const cleanup = () => {
    lights.forEach(light => {
      if (light instanceof THREE.DirectionalLight) {
        light.dispose();
      }
    });
  };

  return { lights, helpers, cleanup };
}

/**
 * Creates area lighting setup for indoor scenes
 * Simulates softbox/studio lighting
 */
export function createAreaLighting(
  configs: AreaLightConfig[]
): {
  lights: THREE.RectAreaLight[];
  helpers: THREE.RectAreaLightHelper[];
  cleanup: () => void;
} {
  const lights: THREE.RectAreaLight[] = [];
  const helpers: THREE.RectAreaLightHelper[] = [];

  for (const config of configs) {
    const {
      width,
      height,
      intensity,
      color = new THREE.Color(0xffffff),
      position,
      target,
      castShadows = false,
    } = config;

    const areaLight = new THREE.RectAreaLight(color, intensity, width, height);
    areaLight.position.copy(position);
    
    if (target) {
      areaLight.lookAt(target);
    }

    lights.push(areaLight);

    // Create helper for visualization (development only)
    const helper = new THREE.RectAreaLightHelper(areaLight);
    helpers.push(helper);
  }

  const cleanup = () => {
    lights.forEach(light => light.dispose());
    helpers.forEach(helper => helper.dispose());
  };

  return { lights, helpers, cleanup };
}

/**
 * Creates emissive lighting from meshes
 * Useful for self-illuminating objects
 */
export function createEmissiveLighting(
  configs: EmissiveLightConfig[]
): {
  lights: THREE.PointLight[];
  meshes: THREE.Mesh[];
  cleanup: () => void;
} {
  const lights: THREE.PointLight[] = [];
  const meshes: THREE.Mesh[] = [];

  for (const config of configs) {
    const {
      mesh,
      intensity,
      color = new THREE.Color(0xffffff),
      distance = 10,
      decay = 2,
    } = config;

    // Create point light at mesh position
    const pointLight = new THREE.PointLight(color, intensity, distance, decay);
    pointLight.position.copy(mesh.position);
    lights.push(pointLight);

    // Make mesh emissive
    if (mesh.material instanceof THREE.MeshStandardMaterial ||
        mesh.material instanceof THREE.MeshPhysicalMaterial) {
      mesh.material.emissive = color;
      mesh.material.emissiveIntensity = intensity * 0.5;
    }

    meshes.push(mesh);
  }

  const cleanup = () => {
    lights.forEach(light => light.dispose());
    meshes.forEach(mesh => {
      if (mesh.material instanceof THREE.MeshStandardMaterial ||
          mesh.material instanceof THREE.MeshPhysicalMaterial) {
        mesh.material.emissive = new THREE.Color(0x000000);
        mesh.material.emissiveIntensity = 0;
      }
    });
  };

  return { lights, meshes, cleanup };
}

/**
 * Creates window light simulation (daylight through windows)
 */
export function createWindowLight(config: {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  color?: THREE.Color;
  intensity?: number;
  width?: number;
  height?: number;
  shadows?: boolean;
}): {
  lights: THREE.Light[];
  cleanup: () => void;
} {
  const {
    position,
    direction,
    color = new THREE.Color(0xe8f4ff),
    intensity = 2.0,
    width = 2,
    height = 3,
    shadows = true,
  } = config;

  const lights: THREE.Light[] = [];

  // Main window light (directional)
  const windowLight = new THREE.DirectionalLight(color, intensity);
  windowLight.position.copy(position);
  windowLight.target = new THREE.Object3D();
  windowLight.target.position.copy(direction);
  windowLight.castShadow = shadows;

  if (shadows) {
    windowLight.shadow.mapSize.width = 2048;
    windowLight.shadow.mapSize.height = 2048;
    windowLight.shadow.camera.near = 0.5;
    windowLight.shadow.camera.far = 50;
    
    // Adjust shadow camera to cover window area
    const aspect = width / height;
    windowLight.shadow.camera.left = -width;
    windowLight.shadow.camera.right = width;
    windowLight.shadow.camera.top = height;
    windowLight.shadow.camera.bottom = -height;
  }

  lights.push(windowLight);

  // Add subtle ambient fill
  const ambientFill = new THREE.AmbientLight(color, 0.3);
  lights.push(ambientFill);

  const cleanup = () => {
    windowLight.dispose();
  };

  return { lights, cleanup };
}

/**
 * Creates practical lighting (lamps, candles, etc.)
 */
export function createPracticalLight(config: {
  position: THREE.Vector3;
  type: 'lamp' | 'candle' | 'neon' | 'led';
  color?: THREE.Color;
  intensity?: number;
  flicker?: boolean;
}): {
  light: THREE.PointLight | THREE.SpotLight;
  animate: (time: number) => void;
  cleanup: () => void;
} {
  const {
    position,
    type,
    color = new THREE.Color(0xffaa77),
    intensity = 1.0,
    flicker = false,
  } = config;

  let light: THREE.PointLight | THREE.SpotLight;

  if (type === 'lamp' || type === 'candle') {
    const pointLight = new THREE.PointLight(color, intensity, 10, 2);
    pointLight.position.copy(position);
    light = pointLight;
  } else if (type === 'neon' || type === 'led') {
    const spotLight = new THREE.SpotLight(color, intensity);
    spotLight.position.copy(position);
    spotLight.angle = Math.PI / 6;
    spotLight.penumbra = 0.5;
    light = spotLight;
  } else {
    const pointLight = new THREE.PointLight(color, intensity, 10, 2);
    pointLight.position.copy(position);
    light = pointLight;
  }

  let time = 0;
  const animate = (deltaTime: number) => {
    if (!flicker) return;
    
    time += deltaTime;
    
    if (type === 'candle') {
      // Candle flicker pattern
      const flickerAmount = Math.sin(time * 10) * 0.1 + Math.sin(time * 23) * 0.05;
      light.intensity = intensity * (1 + flickerAmount);
    } else if (type === 'lamp') {
      // Subtle lamp flicker
      const flickerAmount = Math.sin(time * 5) * 0.02;
      light.intensity = intensity * (1 + flickerAmount);
    }
  };

  const cleanup = () => {
    light.dispose();
  };

  return { light, animate, cleanup };
}

/**
 * Utility: Convert color temperature (Kelvin) to RGB
 */
function kelvinToRGB(kelvin: number): THREE.Color {
  const temp = kelvin / 100;
  
  let r: number, g: number, b: number;

  // Calculate red
  if (temp <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    r = Math.max(0, Math.min(255, r));
  }

  // Calculate green
  if (temp <= 66) {
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
  }
  g = Math.max(0, Math.min(255, g));

  // Calculate blue
  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
    b = Math.max(0, Math.min(255, b));
  }

  return new THREE.Color(r / 255, g / 255, b / 255);
}

/**
 * Complete indoor lighting preset
 */
export function createIndoorPreset(options: {
  roomSize: [number, number, number];
  timeOfDay?: 'day' | 'evening' | 'night';
  hasWindows?: boolean;
  windowDirection?: THREE.Vector3;
}): {
  lights: THREE.Light[];
  cleanup: () => void;
} {
  const {
    roomSize,
    timeOfDay = 'day',
    hasWindows = true,
    windowDirection = new THREE.Vector3(1, 0, 0),
  } = options;

  const allLights: THREE.Light[] = [];
  const cleanups: (() => void)[] = [];

  const [width, height, depth] = roomSize;
  const center = new THREE.Vector3(0, height / 2, 0);

  // Base ambient light
  const ambientIntensity = timeOfDay === 'day' ? 0.4 : timeOfDay === 'evening' ? 0.3 : 0.2;
  const ambientColor = timeOfDay === 'day' ? 0xe8f4ff : timeOfDay === 'evening' ? 0xffd4a0 : 0x202040;
  const ambient = new THREE.AmbientLight(ambientColor, ambientIntensity);
  allLights.push(ambient);

  // Ceiling light (area light simulation)
  const ceilingLight = new THREE.PointLight(0xffffff, 1.5, 20, 2);
  ceilingLight.position.set(0, height - 0.5, 0);
  allLights.push(ceilingLight);

  // Window light if applicable
  if (hasWindows && timeOfDay === 'day') {
    const windowPos = new THREE.Vector3(width / 2 + 1, height / 2, 0);
    const { lights, cleanup } = createWindowLight({
      position: windowPos,
      direction: windowDirection.clone().negate(),
      intensity: 2.0,
    });
    allLights.push(...lights);
    cleanups.push(cleanup);
  }

  // Three-point lighting for center area
  const target = new THREE.Object3D();
  target.position.copy(center);
  
  const { lights: threePointLights, cleanup: threePointCleanup } = createThreePointLighting({
    keyIntensity: timeOfDay === 'day' ? 1.0 : 1.5,
    fillIntensity: timeOfDay === 'day' ? 0.3 : 0.5,
    backIntensity: timeOfDay === 'day' ? 0.5 : 0.8,
    colorTemperature: timeOfDay === 'day' ? 5600 : 3200,
    target,
  });
  
  allLights.push(...threePointLights);
  cleanups.push(threePointCleanup);

  const cleanup = () => {
    cleanups.forEach(fn => fn());
    allLights.forEach(light => {
      if (light instanceof THREE.DirectionalLight ||
          light instanceof THREE.PointLight ||
          light instanceof THREE.SpotLight) {
        light.dispose();
      }
    });
  };

  return { lights: allLights, cleanup };
}

export default {
  createThreePointLighting,
  createAreaLighting,
  createEmissiveLighting,
  createWindowLight,
  createPracticalLight,
  createIndoorPreset,
  kelvinToRGB,
};
