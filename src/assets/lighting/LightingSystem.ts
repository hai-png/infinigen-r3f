/**
 * Lighting System - Automated Scene Lighting
 * 
 * Ports: infinigen/assets/lighting/
 * 
 * Provides procedural lighting setup for indoor, outdoor, and studio scenes.
 */

import * as THREE from 'three';

export interface LightPreset {
  name: string;
  type: 'indoor' | 'outdoor' | 'studio' | 'dramatic' | 'natural';
  description: string;
}

export interface LightingConfig {
  preset?: LightPreset['type'];
  hdriPath?: string;
  ambientIntensity?: number;
  ambientColor?: THREE.Color;
  sunIntensity?: number;
  sunColor?: THREE.Color;
  sunPosition?: THREE.Vector3;
  fillLightIntensity?: number;
  fillLightPosition?: THREE.Vector3;
  rimLightIntensity?: number;
  rimLightPosition?: THREE.Vector3;
  shadowsEnabled?: boolean;
  shadowMapSize?: number;
}

const DEFAULT_CONFIG: Required<Omit<LightingConfig, 'hdriPath' | 'preset'>> = {
  ambientIntensity: 0.5,
  ambientColor: new THREE.Color(0xffffff),
  sunIntensity: 1.0,
  sunColor: new THREE.Color(0xffffee),
  sunPosition: new THREE.Vector3(10, 20, 10),
  fillLightIntensity: 0.3,
  fillLightPosition: new THREE.Vector3(-10, 10, -10),
  rimLightIntensity: 0.5,
  rimLightPosition: new THREE.Vector3(0, 5, -15),
  shadowsEnabled: true,
  shadowMapSize: 2048,
};

/**
 * Preset lighting configurations
 */
export const LIGHT_PRESETS: Record<string, LightingConfig> = {
  indoor: {
    preset: 'indoor',
    ambientIntensity: 0.3,
    ambientColor: new THREE.Color(0xfff5e6),
    sunIntensity: 0, // No direct sun indoors
    sunColor: new THREE.Color(0xffffff),
    sunPosition: new THREE.Vector3(0, 0, 0),
    fillLightIntensity: 0.5,
    fillLightPosition: new THREE.Vector3(5, 10, 5),
    rimLightIntensity: 0.3,
    rimLightPosition: new THREE.Vector3(-5, 8, -5),
    shadowsEnabled: true,
    shadowMapSize: 1024,
  },
  outdoor: {
    preset: 'outdoor',
    ambientIntensity: 0.4,
    ambientColor: new THREE.Color(0x87ceeb),
    sunIntensity: 1.5,
    sunColor: new THREE.Color(0xffffee),
    sunPosition: new THREE.Vector3(50, 100, 50),
    fillLightIntensity: 0.2,
    fillLightPosition: new THREE.Vector3(-20, 30, -20),
    rimLightIntensity: 0.4,
    rimLightPosition: new THREE.Vector3(0, 40, -60),
    shadowsEnabled: true,
    shadowMapSize: 4096,
  },
  studio: {
    preset: 'studio',
    ambientIntensity: 0.2,
    ambientColor: new THREE.Color(0xffffff),
    sunIntensity: 1.0,
    sunColor: new THREE.Color(0xffffff),
    sunPosition: new THREE.Vector3(10, 15, 10),
    fillLightIntensity: 0.6,
    fillLightPosition: new THREE.Vector3(-15, 10, -15),
    rimLightIntensity: 0.8,
    rimLightPosition: new THREE.Vector3(0, 10, -20),
    shadowsEnabled: true,
    shadowMapSize: 2048,
  },
  dramatic: {
    preset: 'dramatic',
    ambientIntensity: 0.1,
    ambientColor: new THREE.Color(0x1a1a2e),
    sunIntensity: 2.0,
    sunColor: new THREE.Color(0xffaa00),
    sunPosition: new THREE.Vector3(5, 30, 5),
    fillLightIntensity: 0.1,
    fillLightPosition: new THREE.Vector3(-20, 5, -20),
    rimLightIntensity: 1.0,
    rimLightPosition: new THREE.Vector3(0, 20, -30),
    shadowsEnabled: true,
    shadowMapSize: 2048,
  },
  natural: {
    preset: 'natural',
    ambientIntensity: 0.5,
    ambientColor: new THREE.Color(0xe6f3ff),
    sunIntensity: 0.8,
    sunColor: new THREE.Color(0xfffff0),
    sunPosition: new THREE.Vector3(30, 60, 30),
    fillLightIntensity: 0.3,
    fillLightPosition: new THREE.Vector3(-30, 40, -30),
    rimLightIntensity: 0.4,
    rimLightPosition: new THREE.Vector3(0, 50, -70),
    shadowsEnabled: true,
    shadowMapSize: 2048,
  },
};

/**
 * Main lighting system class
 */
export class LightingSystem {
  private scene: THREE.Scene;
  private config: LightingConfig;
  private lights: Map<string, THREE.Light> = new Map();
  private hdriTexture: THREE.Texture | null = null;
  private environment: THREE.WebGLCubeRenderTarget | null = null;

  constructor(scene: THREE.Scene, config: LightingConfig = {}) {
    this.scene = scene;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Apply preset if specified
    if (config.preset && LIGHT_PRESETS[config.preset]) {
      this.config = { ...this.config, ...LIGHT_PRESETS[config.preset] };
    }
  }

  /**
   * Setup complete lighting for the scene
   */
  setup(): void {
    this.clearLights();
    this.setupAmbient();
    this.setupSun();
    this.setupFillLight();
    this.setupRimLight();
    this.setupShadows();
    
    if (this.config.hdriPath) {
      this.setupHDRI(this.config.hdriPath);
    }
  }

  /**
   * Clear all existing lights
   */
  clearLights(): void {
    this.lights.forEach(light => {
      this.scene.remove(light);
      if (light instanceof THREE.DirectionalLight) {
        light.dispose();
      }
    });
    this.lights.clear();
  }

  /**
   * Setup ambient light
   */
  setupAmbient(): THREE.AmbientLight {
    const light = new THREE.AmbientLight(
      this.config.ambientColor,
      this.config.ambientIntensity
    );
    this.scene.add(light);
    this.lights.set('ambient', light);
    return light;
  }

  /**
   * Setup sun/directional light
   */
  setupSun(): THREE.DirectionalLight {
    const light = new THREE.DirectionalLight(
      this.config.sunColor,
      this.config.sunIntensity
    );
    light.position.copy(this.config.sunPosition!);
    
    if (this.config.shadowsEnabled) {
      light.castShadow = true;
    }
    
    this.scene.add(light);
    this.lights.set('sun', light);
    return light;
  }

  /**
   * Setup fill light
   */
  setupFillLight(): THREE.PointLight | THREE.SpotLight {
    const light = new THREE.PointLight(
      this.config.ambientColor,
      this.config.fillLightIntensity
    );
    light.position.copy(this.config.fillLightPosition!);
    
    this.scene.add(light);
    this.lights.set('fill', light);
    return light;
  }

  /**
   * Setup rim/back light
   */
  setupRimLight(): THREE.SpotLight {
    const light = new THREE.SpotLight(
      this.config.ambientColor,
      this.config.rimLightIntensity
    );
    light.position.copy(this.config.rimLightPosition!);
    light.angle = Math.PI / 6;
    light.penumbra = 0.5;
    
    this.scene.add(light);
    this.lights.set('rim', light);
    return light;
  }

  /**
   * Enable shadows on renderer and lights
   */
  setupShadows(): void {
    if (!this.config.shadowsEnabled) return;

    this.lights.forEach(light => {
      if (light instanceof THREE.DirectionalLight ||
          light instanceof THREE.SpotLight ||
          light instanceof THREE.PointLight) {
        light.castShadow = true;
        
        if (light.shadow && light instanceof THREE.DirectionalLight) {
          const shadowMapSize = this.config.shadowMapSize ?? 2048;
          light.shadow.mapSize.width = shadowMapSize;
          light.shadow.mapSize.height = shadowMapSize;
          light.shadow.camera.near = 0.5;
          light.shadow.camera.far = 500;
        }
      }
    });
  }

  /**
   * Setup HDRI environment lighting
   */
  async setupHDRI(path: string): Promise<void> {
    try {
      // Use RGBELoader for equirectangular HDR files (.hdr)
      const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js');
      const loader = new RGBELoader();
      
      const texture = await new Promise<THREE.Texture>((resolve, reject) => {
        loader.load(
          path,
          (texture: THREE.Texture) => resolve(texture),
          undefined,
          (error: unknown) => reject(error)
        );
      });
      
      // Convert equirectangular texture to environment map
      const pmremGenerator = new THREE.PMREMGenerator(
        // Will be set up when renderer is available
        null as any
      );
      
      this.hdriTexture = texture;
      this.scene.environment = texture as THREE.Texture;
      this.scene.background = texture as THREE.Texture;
      
    } catch (error) {
      console.warn('Failed to load HDRI:', error);
    }
  }

  /**
   * Update sun position (for time of day simulation)
   */
  updateSunPosition(azimuth: number, elevation: number): void {
    const sun = this.lights.get('sun') as THREE.DirectionalLight;
    if (!sun) return;

    const phi = (90 - elevation) * (Math.PI / 180);
    const theta = azimuth * (Math.PI / 180);

    const r = 100;
    sun.position.x = r * Math.sin(phi) * Math.cos(theta);
    sun.position.y = r * Math.cos(phi);
    sun.position.z = r * Math.sin(phi) * Math.sin(theta);
    
    // Adjust color based on elevation (warmer at sunrise/sunset)
    if (elevation < 30) {
      sun.color.setHex(0xffaa55);
    } else if (elevation > 60) {
      sun.color.setHex(0xffffee);
    } else {
      sun.color.setHex(0xffddaa);
    }
  }

  /**
   * Get a light by name
   */
  getLight(name: string): THREE.Light | undefined {
    return this.lights.get(name);
  }

  /**
   * Update lighting configuration
   */
  updateConfig(config: Partial<LightingConfig>): void {
    this.config = { ...this.config, ...config };
    this.setup();
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clearLights();
    if (this.hdriTexture) {
      this.hdriTexture.dispose();
    }
    if (this.environment) {
      this.environment.dispose();
    }
  }
}

/**
 * Create a three-point lighting setup
 */
export function createThreePointLighting(
  scene: THREE.Scene,
  intensity: number = 1.0
): LightingSystem {
  const lighting = new LightingSystem(scene, {
    preset: 'studio',
    ambientIntensity: 0.3 * intensity,
    sunIntensity: 1.0 * intensity,
    fillLightIntensity: 0.5 * intensity,
    rimLightIntensity: 0.7 * intensity,
  });
  
  lighting.setup();
  return lighting;
}

/**
 * Create outdoor daylight setup
 */
export function createDaylightLighting(
  scene: THREE.Scene,
  timeOfDay: 'morning' | 'noon' | 'evening' = 'noon'
): LightingSystem {
  const configs = {
    morning: { sunIntensity: 0.7, ambientIntensity: 0.4, sunColor: new THREE.Color(0xffaa55) },
    noon: { sunIntensity: 1.5, ambientIntensity: 0.5, sunColor: new THREE.Color(0xffffee) },
    evening: { sunIntensity: 0.8, ambientIntensity: 0.3, sunColor: new THREE.Color(0xff8844) },
  };
  
  const lighting = new LightingSystem(scene, {
    preset: 'outdoor',
    ...configs[timeOfDay],
  });
  
  lighting.setup();
  
  // Set appropriate sun position
  const elevations = { morning: 30, noon: 80, evening: 25 };
  const azimuths = { morning: 45, noon: 180, evening: 270 };
  lighting.updateSunPosition(azimuths[timeOfDay], elevations[timeOfDay]);
  
  return lighting;
}

/**
 * Create indoor ambient lighting
 */
export function createIndoorLighting(
  scene: THREE.Scene,
  warm: boolean = true
): LightingSystem {
  const lighting = new LightingSystem(scene, {
    preset: 'indoor',
    ambientColor: warm ? new THREE.Color(0xfff5e6) : new THREE.Color(0xffffff),
    fillLightIntensity: 0.6,
  });
  
  lighting.setup();
  return lighting;
}
