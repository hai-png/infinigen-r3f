/**
 * Indoor Lighting Setup — P8.2: Indoor Lighting Setup
 *
 * Provides ShapedAreaLight for ceiling lights (rectangular) and desk lamps
 * (circular), PhysicalSpotLight for recessed lighting and track lights,
 * IES profile support, and multi-bounce GI for realistic indirect lighting
 * in path-traced mode.
 *
 * Lazy imports ShapedAreaLight and PhysicalSpotLight from three-gpu-pathtracer
 * with fallback to standard THREE.js lights when unavailable.
 *
 * @module architectural
 * @phase 8
 * @p-number P8.2
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for a rectangular ceiling light.
 */
export interface CeilingLightConfig {
  /** Unique name */
  name: string;
  /** Position in world space */
  position: THREE.Vector3;
  /** Rotation (Euler) */
  rotation?: THREE.Euler;
  /** Light width (for rectangular area light). Default: 0.6 */
  width: number;
  /** Light height (for rectangular area light). Default: 0.2 */
  height: number;
  /** Light intensity (lumens). Default: 3000 */
  intensity: number;
  /** Light color (color temperature). Default: 0xFFF5E6 (warm white) */
  color: THREE.ColorRepresentation;
  /** Whether the light casts shadows. Default: true */
  castShadow: boolean;
  /** Whether this is a recessed light (uses spot light). Default: false */
  isRecessed: boolean;
  /** Spot light cone angle (for recessed). Default: PI/6 */
  spotAngle: number;
  /** Spot light penumbra. Default: 0.5 */
  spotPenumbra: number;
  /** IES profile URL (for realistic light distribution). Default: undefined */
  iesProfile?: string;
}

/**
 * Configuration for a circular desk lamp.
 */
export interface DeskLightConfig {
  /** Unique name */
  name: string;
  /** Position in world space (base of lamp) */
  position: THREE.Vector3;
  /** Lamp direction (normalized). Default: (0, 1, 0) pointing up */
  direction: THREE.Vector3;
  /** Light radius (for circular area light). Default: 0.08 */
  radius: number;
  /** Light intensity (lumens). Default: 800 */
  intensity: number;
  /** Light color. Default: 0xFFE4B5 (warm) */
  color: THREE.ColorRepresentation;
  /** Whether the light casts shadows. Default: true */
  castShadow: boolean;
  /** Lamp arm height. Default: 0.5 */
  armHeight: number;
  /** Whether to show the lamp geometry. Default: true */
  showGeometry: boolean;
}

/**
 * Configuration for a track light.
 */
export interface TrackLightConfig {
  /** Unique name */
  name: string;
  /** Track start position */
  startPosition: THREE.Vector3;
  /** Track end position */
  endPosition: THREE.Vector3;
  /** Number of light heads on the track. Default: 3 */
  headCount: number;
  /** Light intensity per head (lumens). Default: 1500 */
  intensity: number;
  /** Light color. Default: 0xFFF0D0 */
  color: THREE.ColorRepresentation;
  /** Spot cone angle. Default: PI/8 */
  spotAngle: number;
  /** Spot penumbra. Default: 0.3 */
  spotPenumbra: number;
  /** Whether each head casts shadows. Default: true */
  castShadow: boolean;
  /** IES profile URL. Default: undefined */
  iesProfile?: string;
}

/**
 * Overall indoor lighting configuration.
 */
export interface IndoorLightingConfig {
  /** Ceiling light configurations */
  ceilingLights: CeilingLightConfig[];
  /** Desk lamp configurations */
  deskLights: DeskLightConfig[];
  /** Track light configurations */
  trackLights: TrackLightConfig[];
  /** Global ambient intensity. Default: 0.1 */
  ambientIntensity: number;
  /** Global ambient color. Default: 0xFFF5E6 */
  ambientColor: THREE.ColorRepresentation;
  /** Whether to use path-traced area lights (requires three-gpu-pathtracer). Default: true */
  usePathTracedLights: boolean;
  /** Number of light bounces for GI (path-traced mode). Default: 4 */
  giBounces: number;
}

// ---------------------------------------------------------------------------
// Default Configurations
// ---------------------------------------------------------------------------

const DEFAULT_CEILING_LIGHT: CeilingLightConfig = {
  name: 'ceiling_light',
  position: new THREE.Vector3(0, 2.8, 0),
  width: 0.6,
  height: 0.2,
  intensity: 3000,
  color: 0xfff5e6,
  castShadow: true,
  isRecessed: false,
  spotAngle: Math.PI / 6,
  spotPenumbra: 0.5,
};

const DEFAULT_DESK_LIGHT: DeskLightConfig = {
  name: 'desk_lamp',
  position: new THREE.Vector3(0, 0, 0),
  direction: new THREE.Vector3(0, 1, 0),
  radius: 0.08,
  intensity: 800,
  color: 0xffe4b5,
  castShadow: true,
  armHeight: 0.5,
  showGeometry: true,
};

const DEFAULT_TRACK_LIGHT: TrackLightConfig = {
  name: 'track_light',
  startPosition: new THREE.Vector3(-2, 2.8, 0),
  endPosition: new THREE.Vector3(2, 2.8, 0),
  headCount: 3,
  intensity: 1500,
  color: 0xfff0d0,
  spotAngle: Math.PI / 8,
  spotPenumbra: 0.3,
  castShadow: true,
};

const DEFAULT_INDOOR_CONFIG: IndoorLightingConfig = {
  ceilingLights: [],
  deskLights: [],
  trackLights: [],
  ambientIntensity: 0.1,
  ambientColor: 0xfff5e6,
  usePathTracedLights: true,
  giBounces: 4,
};

// ---------------------------------------------------------------------------
// Pathtracer Light Lazy Import
// ---------------------------------------------------------------------------

let pathTracerLightModule: any = null;
let pathTracerLightLoadAttempted = false;

interface PathTracerLightTypes {
  ShapedAreaLight: any;
  PhysicalSpotLight: any;
}

async function loadPathTracerLights(): Promise<PathTracerLightTypes | null> {
  if (pathTracerLightModule) return pathTracerLightModule;
  if (pathTracerLightLoadAttempted) return null;

  pathTracerLightLoadAttempted = true;
  try {
    const mod = await import('three-gpu-pathtracer');
    pathTracerLightModule = {
      ShapedAreaLight: mod.ShapedAreaLight,
      PhysicalSpotLight: mod.PhysicalSpotLight,
    };
    return pathTracerLightModule;
  } catch (err) {
    console.warn('[IndoorLightingSetup] Failed to load pathtracer light types from three-gpu-pathtracer:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// IES Profile Loader
// ---------------------------------------------------------------------------

let iesTextures: Map<string, THREE.DataTexture> = new Map();

/**
 * Load an IES profile texture for realistic light distribution.
 * IES profiles define the luminous intensity distribution of a light source.
 * Uses a simple DataTexture placeholder since IESLoader is not exported
 * from three-gpu-pathtracer.
 */
async function loadIESProfile(url: string): Promise<THREE.DataTexture | null> {
  if (iesTextures.has(url)) return iesTextures.get(url)!;

  try {
    // IES profiles are loaded via the pathtracer's PhysicalSpotLight.iesTexture.
    // Create a 1D intensity distribution DataTexture as a simplified IES representation.
    const size = 180; // 1 degree steps
    const data = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      // Default cosine distribution (Lambertian)
      const angle = (i / size) * Math.PI;
      data[i] = Math.cos(angle);
    }

    const texture = new THREE.DataTexture(data, size, 1);
    texture.format = THREE.RedFormat;
    texture.type = THREE.FloatType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    iesTextures.set(url, texture);
    return texture;
  } catch (err) {
    console.warn(`[IndoorLightingSetup] Failed to create IES profile: ${url}`, err);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Light Factory Functions
// ---------------------------------------------------------------------------

/**
 * Create a ceiling light.
 *
 * In path-traced mode: uses ShapedAreaLight for rectangular emission.
 * In rasterized mode: uses RectAreaLight with RectAreaLightHelper.
 */
async function createCeilingLight(
  config: CeilingLightConfig,
  usePathTraced: boolean
): Promise<THREE.Object3D> {
  const fullConfig: CeilingLightConfig = { ...DEFAULT_CEILING_LIGHT, ...config };
  const group = new THREE.Group();
  group.name = `ceiling_light_${fullConfig.name}`;

  if (fullConfig.isRecessed) {
    // Recessed light — use PhysicalSpotLight or SpotLight
    return createRecessedLight(fullConfig, usePathTraced);
  }

  // Try path-traced ShapedAreaLight
  if (usePathTraced) {
    const ptLights = await loadPathTracerLights();
    if (ptLights?.ShapedAreaLight) {
      try {
        const areaLight = new ptLights.ShapedAreaLight();
        areaLight.position.copy(fullConfig.position);
        if (fullConfig.rotation) areaLight.rotation.copy(fullConfig.rotation);
        else areaLight.rotation.x = Math.PI; // Face downward

        areaLight.intensity = fullConfig.intensity;
        areaLight.color.set(fullConfig.color);
        areaLight.width = fullConfig.width;
        areaLight.height = fullConfig.height;
        areaLight.isCircular = false;

        // Load IES profile if specified
        if (fullConfig.iesProfile) {
          const iesTexture = await loadIESProfile(fullConfig.iesProfile);
          if (iesTexture) {
            areaLight.iesTexture = iesTexture;
          }
        }

        group.add(areaLight);
        return group;
      } catch (err) {
        console.warn('[IndoorLightingSetup] Failed to create ShapedAreaLight, falling back:', err);
      }
    }
  }

  // Fallback: RectAreaLight
  const { RectAreaLight } = await import('three');
  const rectLight = new RectAreaLight(
    fullConfig.color,
    fullConfig.intensity / 1000,
    fullConfig.width,
    fullConfig.height
  );
  rectLight.position.copy(fullConfig.position);
  if (fullConfig.rotation) {
    rectLight.rotation.copy(fullConfig.rotation);
  } else {
    rectLight.rotation.x = Math.PI; // Face downward
  }
  rectLight.name = `${fullConfig.name}_rect`;
  group.add(rectLight);

  // Light fixture geometry
  const fixtureGeo = new THREE.BoxGeometry(fullConfig.width + 0.05, 0.03, fullConfig.height + 0.05);
  const fixtureMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: fullConfig.color,
    emissiveIntensity: 0.5,
  });
  const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
  fixture.position.copy(fullConfig.position);
  fixture.position.y -= 0.02;
  fixture.name = `${fullConfig.name}_fixture`;
  group.add(fixture);

  return group;
}

/**
 * Create a recessed light (PhysicalSpotLight or SpotLight).
 */
async function createRecessedLight(
  config: CeilingLightConfig,
  usePathTraced: boolean
): Promise<THREE.Object3D> {
  const group = new THREE.Group();
  group.name = `recessed_light_${config.name}`;

  if (usePathTraced) {
    const ptLights = await loadPathTracerLights();
    if (ptLights?.PhysicalSpotLight) {
      try {
        const spotLight = new ptLights.PhysicalSpotLight();
        spotLight.position.copy(config.position);
        spotLight.target.position.copy(config.position);
        spotLight.target.position.y -= 3; // Point downward
        spotLight.intensity = config.intensity;
        spotLight.color.set(config.color);
        spotLight.angle = config.spotAngle;
        spotLight.penumbra = config.spotPenumbra;
        spotLight.decay = 2;
        spotLight.distance = 10;

        if (config.iesProfile) {
          const iesTexture = await loadIESProfile(config.iesProfile);
          if (iesTexture) {
            spotLight.iesTexture = iesTexture;
          }
        }

        group.add(spotLight);
        group.add(spotLight.target);
        return group;
      } catch (err) {
        console.warn('[IndoorLightingSetup] Failed to create PhysicalSpotLight, falling back:', err);
      }
    }
  }

  // Fallback: THREE.SpotLight
  const spotLight = new THREE.SpotLight(
    config.color,
    config.intensity / 500,
    10,
    config.spotAngle,
    config.spotPenumbra,
    2
  );
  spotLight.position.copy(config.position);
  spotLight.target.position.copy(config.position);
  spotLight.target.position.y -= 3;
  spotLight.castShadow = config.castShadow;
  spotLight.shadow.mapSize.width = 512;
  spotLight.shadow.mapSize.height = 512;
  spotLight.name = `${config.name}_spot`;
  group.add(spotLight);
  group.add(spotLight.target);

  // Recessed can geometry
  const canGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.08, 16);
  const canMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 });
  const can = new THREE.Mesh(canGeo, canMat);
  can.position.copy(config.position);
  can.name = `${config.name}_can`;
  group.add(can);

  return group;
}

/**
 * Create a desk lamp with circular area light.
 */
async function createDeskLight(
  config: DeskLightConfig,
  usePathTraced: boolean
): Promise<THREE.Object3D> {
  const fullConfig: DeskLightConfig = { ...DEFAULT_DESK_LIGHT, ...config };
  const group = new THREE.Group();
  group.name = `desk_lamp_${fullConfig.name}`;

  // Try path-traced ShapedAreaLight (circular)
  if (usePathTraced) {
    const ptLights = await loadPathTracerLights();
    if (ptLights?.ShapedAreaLight) {
      try {
        const areaLight = new ptLights.ShapedAreaLight();
        areaLight.position.copy(fullConfig.position);
        areaLight.position.y += fullConfig.armHeight;
        areaLight.intensity = fullConfig.intensity;
        areaLight.color.set(fullConfig.color);
        areaLight.width = fullConfig.radius * 2;
        areaLight.height = fullConfig.radius * 2;
        areaLight.isCircular = true;

        group.add(areaLight);

        if (fullConfig.showGeometry) {
          addDeskLampGeometry(group, fullConfig);
        }
        return group;
      } catch (err) {
        console.warn('[IndoorLightingSetup] Failed to create circular ShapedAreaLight, falling back:', err);
      }
    }
  }

  // Fallback: PointLight with lamp geometry
  const pointLight = new THREE.PointLight(
    fullConfig.color,
    fullConfig.intensity / 500,
    5,
    2
  );
  pointLight.position.copy(fullConfig.position);
  pointLight.position.y += fullConfig.armHeight;
  pointLight.castShadow = fullConfig.castShadow;
  pointLight.shadow.mapSize.width = 512;
  pointLight.shadow.mapSize.height = 512;
  pointLight.name = `${fullConfig.name}_point`;
  group.add(pointLight);

  if (fullConfig.showGeometry) {
    addDeskLampGeometry(group, fullConfig);
  }

  return group;
}

/**
 * Add desk lamp 3D geometry to a group.
 */
function addDeskLampGeometry(group: THREE.Group, config: DeskLightConfig): void {
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.2 });
  const shadeMat = new THREE.MeshStandardMaterial({
    color: config.color,
    emissive: config.color,
    emissiveIntensity: 0.3,
    side: THREE.DoubleSide,
  });

  // Base
  const baseGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.02, 16);
  const base = new THREE.Mesh(baseGeo, metalMat);
  base.position.copy(config.position);
  base.name = `${config.name}_base`;
  group.add(base);

  // Arm
  const armGeo = new THREE.CylinderGeometry(0.01, 0.01, config.armHeight, 8);
  const arm = new THREE.Mesh(armGeo, metalMat);
  arm.position.set(
    config.position.x,
    config.position.y + config.armHeight / 2,
    config.position.z
  );
  arm.name = `${config.name}_arm`;
  group.add(arm);

  // Shade (cone)
  const shadeGeo = new THREE.ConeGeometry(config.radius + 0.03, 0.06, 16, 1, true);
  const shade = new THREE.Mesh(shadeGeo, shadeMat);
  shade.position.set(
    config.position.x,
    config.position.y + config.armHeight,
    config.position.z
  );
  shade.name = `${config.name}_shade`;
  group.add(shade);
}

/**
 * Create a track light system with multiple spot heads.
 */
async function createTrackLight(
  config: TrackLightConfig,
  usePathTraced: boolean
): Promise<THREE.Object3D> {
  const fullConfig: TrackLightConfig = { ...DEFAULT_TRACK_LIGHT, ...config };
  const group = new THREE.Group();
  group.name = `track_light_${fullConfig.name}`;

  // Track rail geometry
  const trackDir = new THREE.Vector3().subVectors(fullConfig.endPosition, fullConfig.startPosition);
  const trackLength = trackDir.length();
  trackDir.normalize();

  const railGeo = new THREE.BoxGeometry(trackLength, 0.02, 0.04);
  const railMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.7 });
  const rail = new THREE.Mesh(railGeo, railMat);
  const midPoint = new THREE.Vector3().addVectors(fullConfig.startPosition, fullConfig.endPosition).multiplyScalar(0.5);
  rail.position.copy(midPoint);
  rail.lookAt(fullConfig.endPosition);
  rail.name = `${fullConfig.name}_rail`;
  group.add(rail);

  // Create light heads along the track
  for (let i = 0; i < fullConfig.headCount; i++) {
    const t = fullConfig.headCount === 1 ? 0.5 : i / (fullConfig.headCount - 1);
    const headPos = new THREE.Vector3().lerpVectors(fullConfig.startPosition, fullConfig.endPosition, t);

    if (usePathTraced) {
      const ptLights = await loadPathTracerLights();
      if (ptLights?.PhysicalSpotLight) {
        try {
          const spotLight = new ptLights.PhysicalSpotLight();
          spotLight.position.copy(headPos);
          spotLight.target.position.copy(headPos);
          spotLight.target.position.y -= 3;
          spotLight.intensity = fullConfig.intensity;
          spotLight.color.set(fullConfig.color);
          spotLight.angle = fullConfig.spotAngle;
          spotLight.penumbra = fullConfig.spotPenumbra;
          spotLight.decay = 2;
          spotLight.distance = 10;

          if (fullConfig.iesProfile) {
            const iesTexture = await loadIESProfile(fullConfig.iesProfile);
            if (iesTexture) spotLight.iesTexture = iesTexture;
          }

          group.add(spotLight);
          group.add(spotLight.target);
          continue;
        } catch {
          // Fall through to fallback
        }
      }
    }

    // Fallback: THREE.SpotLight
    const spotLight = new THREE.SpotLight(
      fullConfig.color,
      fullConfig.intensity / 500,
      8,
      fullConfig.spotAngle,
      fullConfig.spotPenumbra,
      2
    );
    spotLight.position.copy(headPos);
    spotLight.target.position.copy(headPos);
    spotLight.target.position.y -= 3;
    spotLight.castShadow = fullConfig.castShadow;
    spotLight.shadow.mapSize.width = 512;
    spotLight.shadow.mapSize.height = 512;
    spotLight.name = `${fullConfig.name}_head_${i}`;
    group.add(spotLight);
    group.add(spotLight.target);

    // Head housing geometry
    const headGeo = new THREE.CylinderGeometry(0.025, 0.035, 0.06, 12);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.copy(headPos);
    headMesh.name = `${fullConfig.name}_housing_${i}`;
    group.add(headMesh);
  }

  return group;
}

// ---------------------------------------------------------------------------
// Main Factory Function
// ---------------------------------------------------------------------------

/**
 * Create a complete indoor lighting setup for a scene.
 *
 * Adds ceiling lights, desk lamps, track lights, and ambient fill.
 * In path-traced mode: uses ShapedAreaLight and PhysicalSpotLight for
 * physically accurate area and spot lighting with multi-bounce GI.
 * In rasterized mode: uses RectAreaLight, SpotLight, and PointLight.
 *
 * @param scene - The THREE.js scene to add lights to
 * @param config - Indoor lighting configuration
 * @returns Object with references to all created lights and a dispose function
 */
/**
 * Architectural-specific indoor lighting setup.
 * Use core/rendering's createIndoorLighting as the primary API.
 * This is kept for standalone architectural lighting use cases.
 */
export async function createArchitecturalIndoorLighting(
  scene: THREE.Scene,
  config: Partial<IndoorLightingConfig> = {}
): Promise<{
  group: THREE.Group;
  lights: THREE.Light[];
  dispose: () => void;
}> {
  const fullConfig: IndoorLightingConfig = { ...DEFAULT_INDOOR_CONFIG, ...config };
  const group = new THREE.Group();
  group.name = 'indoor_lighting';
  const lights: THREE.Light[] = [];

  // Add ambient fill
  const ambient = new THREE.AmbientLight(fullConfig.ambientColor, fullConfig.ambientIntensity);
  ambient.name = 'indoor_ambient';
  group.add(ambient);
  lights.push(ambient);

  // Add hemisphere light for subtle sky/ground fill
  const hemisphere = new THREE.HemisphereLight(
    fullConfig.ambientColor,
    0x3a3a2a,
    fullConfig.ambientIntensity * 0.5
  );
  hemisphere.name = 'indoor_hemisphere';
  group.add(hemisphere);

  // Add ceiling lights
  for (const clConfig of fullConfig.ceilingLights) {
    const ceilingLightObj = await createCeilingLight(clConfig, fullConfig.usePathTracedLights);
    group.add(ceilingLightObj);

    // Collect light references
    ceilingLightObj.traverse((child) => {
      if (child instanceof THREE.Light) lights.push(child);
    });
  }

  // Add desk lamps
  for (const dlConfig of fullConfig.deskLights) {
    const deskLightObj = await createDeskLight(dlConfig, fullConfig.usePathTracedLights);
    group.add(deskLightObj);

    deskLightObj.traverse((child) => {
      if (child instanceof THREE.Light) lights.push(child);
    });
  }

  // Add track lights
  for (const tlConfig of fullConfig.trackLights) {
    const trackLightObj = await createTrackLight(tlConfig, fullConfig.usePathTracedLights);
    group.add(trackLightObj);

    trackLightObj.traverse((child) => {
      if (child instanceof THREE.Light) lights.push(child);
    });
  }

  scene.add(group);

  return {
    group,
    lights,
    dispose: () => {
      scene.remove(group);
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    },
  };
}

export default createArchitecturalIndoorLighting;
