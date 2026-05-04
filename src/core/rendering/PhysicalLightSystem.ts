/**
 * PhysicalLightSystem — Path-Tracer Compatible Physical Lights
 *
 * Replaces basic Three.js lights with pathtracer-compatible physical lights.
 * Supports PhysicalSpotLight, ShapedAreaLight, and MIS-compatible lights.
 *
 * Phase 1 — P1.3: Light System Upgrade
 *
 * @module rendering
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhysicalSpotLightConfig {
  /** Color of the light */
  color: THREE.ColorRepresentation;
  /** Light intensity in candela (cd) */
  intensity: number;
  /** Light position */
  position: THREE.Vector3;
  /** Target position (direction = target - position) */
  target: THREE.Vector3;
  /** Distance falloff (0 = infinite) */
  distance: number;
  /** Beam angle in radians */
  angle: number;
  /** Penumbra ratio (0 = hard edge, 1 = soft) */
  penumbra: number;
  /** Decay rate (2 = physically correct) */
  decay: number;
  /** Physical radius of the light source (for soft shadows) */
  radius: number;
  /** Whether to cast shadows */
  castShadow: boolean;
  /** Shadow map resolution */
  shadowMapSize: number;
  /** IES profile URL (optional) */
  iesProfile?: string;
}

export interface ShapedAreaLightConfig {
  /** Color of the light */
  color: THREE.ColorRepresentation;
  /** Light intensity */
  intensity: number;
  /** Light position */
  position: THREE.Vector3;
  /** Light rotation (euler angles) */
  rotation: THREE.Euler;
  /** Shape type: 'rect' or 'circle' */
  shape: 'rect' | 'circle';
  /** Width (for rect) or radius (for circle) */
  width: number;
  /** Height (for rect, ignored for circle) */
  height: number;
}

export interface PhysicalDirectionalLightConfig {
  /** Color of the light */
  color: THREE.ColorRepresentation;
  /** Light intensity in lux */
  intensity: number;
  /** Direction (normalized) */
  direction: THREE.Vector3;
  /** Whether to cast shadows */
  castShadow: boolean;
  /** Shadow camera configuration */
  shadowCamera?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    near: number;
    far: number;
  };
  shadowMapSize?: number;
}

// ---------------------------------------------------------------------------
// Light Factory
// ---------------------------------------------------------------------------

/**
 * Create a PhysicalSpotLight compatible with both rasterized and path-traced rendering.
 * In rasterize mode, falls back to THREE.SpotLight.
 * In pathtrace mode, uses PhysicalSpotLight from three-gpu-pathtracer.
 */
export async function createPhysicalSpotLight(
  config: Partial<PhysicalSpotLightConfig> = {}
): Promise<THREE.SpotLight> {
  const fullConfig: PhysicalSpotLightConfig = {
    color: 0xffffff,
    intensity: 100,
    position: new THREE.Vector3(0, 10, 0),
    target: new THREE.Vector3(0, 0, 0),
    distance: 0,
    angle: Math.PI / 6,
    penumbra: 0.5,
    decay: 2,
    radius: 0.1,
    castShadow: true,
    shadowMapSize: 1024,
    ...config,
  };

  // Try PhysicalSpotLight from three-gpu-pathtracer
  try {
    const { PhysicalSpotLight } = await import('three-gpu-pathtracer');
    const light = new PhysicalSpotLight(
      fullConfig.color,
      fullConfig.intensity,
      fullConfig.distance,
      fullConfig.angle,
      fullConfig.penumbra,
      fullConfig.decay,
    );

    light.position.copy(fullConfig.position);
    light.target.position.copy(fullConfig.target);
    light.radius = fullConfig.radius;
    light.castShadow = fullConfig.castShadow;

    if (light.shadow) {
      light.shadow.mapSize.set(fullConfig.shadowMapSize, fullConfig.shadowMapSize);
    }

    // Load IES profile if provided
    if (fullConfig.iesProfile) {
      try {
        const { IESLoader } = await import('three/examples/jsm/loaders/IESLoader.js');
        const loader = new IESLoader();
        const iesTexture = await loader.loadAsync(fullConfig.iesProfile);
        (light as any).iesMap = iesTexture;
      } catch (err) {
        // Silently fall back - IES profile loading may not be available in all environments
        console.warn('[PhysicalLightSystem] IES profile loading not available:', err);
      }
    }

    return light;
  } catch (err) {
    // Silently fall back - PhysicalSpotLight not available, using standard SpotLight
    if (process.env.NODE_ENV === 'development') console.debug('[PhysicalLightSystem] PhysicalSpotLight fallback:', err);
    const light = new THREE.SpotLight(
      fullConfig.color,
      fullConfig.intensity,
      fullConfig.distance,
      fullConfig.angle,
      fullConfig.penumbra,
      fullConfig.decay,
    );

    light.position.copy(fullConfig.position);
    light.target.position.copy(fullConfig.target);
    light.castShadow = fullConfig.castShadow;

    if (light.shadow) {
      light.shadow.mapSize.set(fullConfig.shadowMapSize, fullConfig.shadowMapSize);
    }

    return light;
  }
}

/**
 * Create a ShapedAreaLight compatible with both rendering modes.
 * In rasterize mode, falls back to THREE.RectAreaLight.
 * In pathtrace mode, uses ShapedAreaLight from three-gpu-pathtracer.
 */
export async function createShapedAreaLight(
  config: Partial<ShapedAreaLightConfig> = {}
): Promise<THREE.RectAreaLight> {
  const fullConfig: ShapedAreaLightConfig = {
    color: 0xffffff,
    intensity: 50,
    position: new THREE.Vector3(0, 3, 0),
    rotation: new THREE.Euler(0, 0, 0),
    shape: 'rect',
    width: 1,
    height: 1,
    ...config,
  };

  try {
    const { ShapedAreaLight } = await import('three-gpu-pathtracer');
    const light = new ShapedAreaLight(
      fullConfig.color,
      fullConfig.intensity,
      fullConfig.width,
      fullConfig.height,
    );

    light.position.copy(fullConfig.position);
    light.rotation.copy(fullConfig.rotation);

    if (fullConfig.shape === 'circle') {
      (light as any).isCircular = true;
      (light as any).radius = fullConfig.width / 2;
    }

    return light;
  } catch (err) {
    // Silently fall back - ShapedAreaLight not available, using standard RectAreaLight
    if (process.env.NODE_ENV === 'development') console.debug('[PhysicalLightSystem] ShapedAreaLight fallback:', err);
    const light = new THREE.RectAreaLight(
      fullConfig.color,
      fullConfig.intensity,
      fullConfig.width,
      fullConfig.height,
    );
    light.position.copy(fullConfig.position);
    light.rotation.copy(fullConfig.rotation);
    return light;
  }
}

/**
 * Create a MIS-compatible directional light.
 */
export function createPhysicalDirectionalLight(
  config: Partial<PhysicalDirectionalLightConfig> = {}
): THREE.DirectionalLight {
  const fullConfig: PhysicalDirectionalLightConfig = {
    color: 0xffffff,
    intensity: 1.5,
    direction: new THREE.Vector3(-1, -1, -0.5).normalize(),
    castShadow: true,
    shadowCamera: {
      left: -120,
      right: 120,
      top: 120,
      bottom: -120,
      near: 0.5,
      far: 300,
    },
    shadowMapSize: 2048,
    ...config,
  };

  const light = new THREE.DirectionalLight(fullConfig.color, fullConfig.intensity);

  // Set position from direction (directional lights shine toward origin)
  const pos = fullConfig.direction.clone().negate().multiplyScalar(100);
  light.position.copy(pos);
  light.castShadow = fullConfig.castShadow;

  if (light.shadow && fullConfig.shadowCamera) {
    const cam = light.shadow.camera;
    cam.left = fullConfig.shadowCamera.left;
    cam.right = fullConfig.shadowCamera.right;
    cam.top = fullConfig.shadowCamera.top;
    cam.bottom = fullConfig.shadowCamera.bottom;
    cam.near = fullConfig.shadowCamera.near;
    cam.far = fullConfig.shadowCamera.far;

    light.shadow.mapSize.set(fullConfig.shadowMapSize ?? 2048, fullConfig.shadowMapSize ?? 2048);
    light.shadow.bias = -0.0005;
    light.shadow.normalBias = 0.02;
  }

  return light;
}

// ---------------------------------------------------------------------------
// Light Scene Setup Helpers
// ---------------------------------------------------------------------------

/**
 * Configure an outdoor scene with physically correct lighting.
 * Returns a group of lights suitable for both rasterized and path-traced rendering.
 */
export async function createOutdoorLighting(config: {
  sunDirection: THREE.Vector3;
  sunIntensity: number;
  sunColor?: THREE.ColorRepresentation;
  ambientIntensity?: number;
  hemisphereSkyColor?: THREE.ColorRepresentation;
  hemisphereGroundColor?: THREE.ColorRepresentation;
}): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.name = 'outdoor-lighting';

  // Directional sun light
  const sunLight = createPhysicalDirectionalLight({
    direction: config.sunDirection.clone().negate(),
    intensity: config.sunIntensity,
    color: config.sunColor ?? 0xfffbe6,
    castShadow: true,
  });
  sunLight.name = 'sun-light';
  group.add(sunLight);

  // Fill light (opposite direction, lower intensity)
  const fillDir = config.sunDirection.clone().negate();
  fillDir.y = Math.abs(fillDir.y);
  const fillLight = createPhysicalDirectionalLight({
    direction: fillDir,
    intensity: config.sunIntensity * 0.3,
    color: 0xa8c8e8,
    castShadow: false,
  });
  fillLight.name = 'fill-light';
  group.add(fillLight);

  // Hemisphere light for ambient
  const hemiLight = new THREE.HemisphereLight(
    config.hemisphereSkyColor ?? 0x87ceeb,
    config.hemisphereGroundColor ?? 0x3a5f0b,
    config.ambientIntensity ?? 0.35,
  );
  hemiLight.name = 'hemi-light';
  group.add(hemiLight);

  // Ambient light for base illumination
  const ambientLight = new THREE.AmbientLight(0xb8d4e8, config.ambientIntensity ?? 0.4);
  ambientLight.name = 'ambient-light';
  group.add(ambientLight);

  return group;
}

/**
 * Configure an indoor scene with physically correct lighting.
 * Uses area lights and spot lights for realistic indoor illumination.
 */
export async function createIndoorLighting(config: {
  roomSize: { width: number; height: number; depth: number };
  ceilingLightColor?: THREE.ColorRepresentation;
  ceilingLightIntensity?: number;
  deskLightPosition?: THREE.Vector3;
  deskLightTarget?: THREE.Vector3;
}): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.name = 'indoor-lighting';

  // Ceiling area light
  const ceilingLight = await createShapedAreaLight({
    color: config.ceilingLightColor ?? 0xfff5e6,
    intensity: config.ceilingLightIntensity ?? 80,
    position: new THREE.Vector3(0, config.roomSize.height - 0.05, 0),
    rotation: new THREE.Euler(Math.PI, 0, 0), // face down
    shape: 'rect',
    width: config.roomSize.width * 0.3,
    height: config.roomSize.depth * 0.3,
  });
  ceilingLight.name = 'ceiling-light';
  group.add(ceilingLight);

  // Desk spot light
  if (config.deskLightPosition) {
    const deskLight = await createPhysicalSpotLight({
      color: 0xfff0d0,
      intensity: 200,
      position: config.deskLightPosition,
      target: config.deskLightTarget ?? new THREE.Vector3(0, 0, 0),
      angle: Math.PI / 5,
      penumbra: 0.8,
      radius: 0.05,
      castShadow: true,
    });
    deskLight.name = 'desk-light';
    group.add(deskLight);
  }

  return group;
}

// ---------------------------------------------------------------------------
// Light Conversion Utilities
// ---------------------------------------------------------------------------

/**
 * Convert existing scene lights to MIS-compatible format.
 * Scans a scene and upgrades compatible lights.
 */
export async function upgradeSceneLights(scene: THREE.Scene): Promise<number> {
  let upgradedCount = 0;

  const lights: THREE.Light[] = [];
  scene.traverse((child) => {
    if (child instanceof THREE.Light) {
      lights.push(child);
    }
  });

  for (const light of lights) {
    if (light instanceof THREE.SpotLight) {
      // Upgrade SpotLight to PhysicalSpotLight
      try {
        const { PhysicalSpotLight } = await import('three-gpu-pathtracer');
        const physicalLight = new PhysicalSpotLight(
          light.color,
          light.intensity,
          light.distance,
          light.angle,
          light.penumbra,
          light.decay,
        );
        physicalLight.position.copy(light.position);
        physicalLight.target = light.target;
        physicalLight.castShadow = light.castShadow;
        if (light.shadow) {
          physicalLight.shadow.mapSize.copy(light.shadow.mapSize);
        }
        physicalLight.radius = 0.05; // Small radius for soft shadows

        // Replace in parent
        const parent = light.parent;
        if (parent) {
          parent.remove(light);
          parent.add(physicalLight);
          upgradedCount++;
        }
      } catch (err) {
        // Silently fall back - PhysicalSpotLight not available in this environment
        if (process.env.NODE_ENV === 'development') console.debug('[PhysicalLightSystem] upgradeSceneLights fallback:', err);
      }
    }
  }

  return upgradedCount;
}
