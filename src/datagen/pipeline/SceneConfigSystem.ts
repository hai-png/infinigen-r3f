/**
 * Configuration System for Scene Specification
 * 
 * Provides YAML/JSON configuration support for defining scenes,
 * objects, materials, lighting, and rendering parameters.
 * 
 * This system ports the functionality from Infinigen's configs/ directory,
 * enabling declarative scene specification and batch processing.
 */

import {
  Color,
  Vector3,
  Vector2,
  Fog,
  ToneMapping,
} from 'three';

export interface SceneConfig {
  name: string;
  description?: string;
  version: string;
  
  // Environment settings
  environment?: EnvironmentConfig;
  
  // Camera configuration
  cameras?: CameraConfig[];
  
  // Object placement
  objects?: ObjectPlacementConfig[];
  
  // Lighting setup
  lighting?: LightingConfig;
  
  // Material overrides
  materials?: MaterialOverrideConfig[];
  
  // Rendering settings
  rendering?: RenderingConfig;
  
  // Output configuration
  output?: OutputConfig;
  
  // Constraints for object placement
  constraints?: ConstraintConfig[];
  
  // Metadata
  metadata?: Record<string, any>;
}

export interface EnvironmentConfig {
  type: 'indoor' | 'outdoor' | 'studio' | 'custom';
  
  // Sky settings (for outdoor)
  sky?: {
    enabled: boolean;
    turbidity?: number;
    rayleigh?: number;
    mieCoefficient?: number;
    mieDirectionalG?: number;
    sunPosition?: Vector3Config;
  };
  
  // HDRI environment
  hdri?: {
    enabled: boolean;
    path?: string;
    intensity?: number;
    rotation?: number;
  };
  
  // Fog
  fog?: {
    enabled: boolean;
    color?: ColorConfig;
    near?: number;
    far?: number;
    density?: number; // for exponential fog
  };
  
  // Background
  background?: {
    type: 'color' | 'transparent' | 'hdri';
    color?: ColorConfig;
    hdriPath?: string;
  };
  
  // Floor/ground plane
  ground?: {
    enabled: boolean;
    size?: number;
    material?: MaterialReferenceConfig;
  };
}

export interface CameraConfig {
  id: string;
  type: 'perspective' | 'orthographic';
  
  // Position and rotation
  position?: Vector3Config;
  rotation?: Vector3Config;
  target?: Vector3Config;
  
  // Perspective settings
  fov?: number;
  aspect?: number;
  near?: number;
  far?: number;
  
  // Orthographic settings
  zoom?: number;
  orthoSize?: number;
  
  // Depth of field
  dof?: {
    enabled: boolean;
    focusDistance?: number;
    focalLength?: number;
    fStop?: number;
  };
  
  // Motion blur
  motionBlur?: {
    enabled: boolean;
    shutterSpeed?: number;
  };
  
  // Trajectory (for animation)
  trajectory?: TrajectoryConfig;
}

export interface TrajectoryConfig {
  type: 'linear' | 'circular' | 'spiral' | 'custom' | 'waypoints';
  
  // For waypoints
  waypoints?: Vector3Config[];
  
  // For circular/spiral
  center?: Vector3Config;
  radius?: number;
  height?: number;
  rotations?: number;
  
  // Timing
  duration?: number;
  ease?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
  
  // Custom path (array of points)
  path?: Vector3Config[];
}

export interface ObjectPlacementConfig {
  id: string;
  type: string; // Reference to asset type
  
  // Positioning
  position?: Vector3Config | PlacementStrategyConfig;
  rotation?: Vector3Config | RotationStrategyConfig;
  scale?: Vector3Config | number;
  
  // Parent relationship
  parent?: string; // Reference to another object
  
  // Constraints
  constraints?: ObjectConstraintConfig[];
  
  // Material overrides
  materials?: MaterialOverrideConfig[];
  
  // Quantity (for scattering)
  count?: number | CountRangeConfig;
  
  // Scattering options
  scatter?: ScatterConfig;
  
  // Probability (for random selection)
  probability?: number;
  
  // Tags for identification
  tags?: string[];
  
  // Custom properties
  properties?: Record<string, any>;
}

export interface PlacementStrategyConfig {
  strategy: 'random' | 'grid' | 'surface' | 'volume' | 'path';
  
  // Bounding region
  bounds?: {
    min: Vector3Config;
    max: Vector3Config;
  } | {
    center: Vector3Config;
    size: Vector3Config;
  } | {
    center: Vector3Config;
    radius: number;
  };
  
  // Surface placement
  surface?: {
    targetObjects?: string[]; // Object IDs or tags
    offset?: number;
    normalOffset?: number;
    alignToNormal?: boolean;
  };
  
  // Grid placement
  grid?: {
    rows: number;
    columns: number;
    spacing: Vector3Config | number;
  };
  
  // Random seed
  seed?: number;
}

export interface RotationStrategyConfig {
  strategy: 'fixed' | 'random' | 'align' | 'lookAt';
  
  // Fixed rotation
  value?: Vector3Config;
  
  // Random rotation ranges (in degrees)
  xRange?: [number, number];
  yRange?: [number, number];
  zRange?: [number, number];
  
  // Align to surface normal
  alignAxis?: 'x' | 'y' | 'z';
  
  // Look at target
  target?: Vector3Config | string; // Position or object ID
}

export interface ScatterConfig {
  enabled: boolean;
  
  // Density
  density?: number; // objects per unit area
  
  // Distribution
  distribution: 'uniform' | 'gaussian' | 'poisson' | 'custom';
  
  // Exclusion zones
  exclude?: {
    objects?: string[];
    tags?: string[];
    bounds?: BoundingBoxConfig;
  };
  
  // Collision avoidance
  avoidOverlap?: boolean;
  minDistance?: number;
  
  // Variation
  scaleVariation?: [number, number];
  rotationVariation?: number;
}

export interface ObjectConstraintConfig {
  type: 'collision' | 'support' | 'proximity' | 'alignment' | 'custom';
  
  // Collision constraint
  collision?: {
    enabled: boolean;
    objects?: string[];
    margin?: number;
  };
  
  // Support constraint (object must be on surface)
  support?: {
    required: boolean;
    surfaces?: string[];
    maxOverhang?: number;
  };
  
  // Proximity constraint
  proximity?: {
    target: string;
    minDistance?: number;
    maxDistance?: number;
  };
  
  // Alignment constraint
  alignment?: {
    axis: 'x' | 'y' | 'z';
    target: string;
    tolerance?: number;
  };
}

export interface LightingConfig {
  // Ambient light
  ambient?: {
    enabled: boolean;
    color?: ColorConfig;
    intensity?: number;
  };
  
  // Directional light (sun/moon)
  directional?: Array<{
    enabled: boolean;
    color?: ColorConfig;
    intensity?: number;
    direction?: Vector3Config;
    castShadow?: boolean;
    shadowMapSize?: number;
  }>;
  
  // Point lights
  point?: Array<{
    enabled: boolean;
    color?: ColorConfig;
    intensity?: number;
    position?: Vector3Config;
    distance?: number;
    decay?: number;
    castShadow?: boolean;
  }>;
  
  // Spot lights
  spot?: Array<{
    enabled: boolean;
    color?: ColorConfig;
    intensity?: number;
    position?: Vector3Config;
    target?: Vector3Config;
    angle?: number;
    penumbra?: number;
    distance?: number;
    castShadow?: boolean;
  }>;
  
  // Area lights
  area?: Array<{
    enabled: boolean;
    color?: ColorConfig;
    intensity?: number;
    position?: Vector3Config;
    rotation?: Vector3Config;
    width?: number;
    height?: number;
    shape?: 'rectangle' | 'disk' | 'sphere';
  }>;
  
  // Three-point lighting preset
  threePoint?: {
    enabled: boolean;
    keyIntensity?: number;
    fillIntensity?: number;
    backIntensity?: number;
    keyAngle?: number;
    fillAngle?: number;
    subjectPosition?: Vector3Config;
  };
}

export interface MaterialOverrideConfig {
  // Target objects
  target: string | string[]; // Object ID(s) or tag(s)
  
  // Material reference
  material?: MaterialReferenceConfig;
  
  // Property overrides
  overrides?: {
    color?: ColorConfig;
    roughness?: number;
    metalness?: number;
    transmission?: number;
    opacity?: number;
    emissive?: ColorConfig;
    emissiveIntensity?: number;
    normalScale?: number;
    displacementScale?: number;
  };
}

export interface MaterialReferenceConfig {
  type: 'preset' | 'procedural' | 'texture' | 'reference';
  
  // Preset material
  preset?: 'wood' | 'metal' | 'plastic' | 'glass' | 'fabric' | 'ceramic' | 'stone';
  
  // Procedural material parameters
  procedural?: {
    nodeTree?: string;
    parameters?: Record<string, any>;
  };
  
  // Texture paths
  textures?: {
    map?: string;
    normalMap?: string;
    roughnessMap?: string;
    metalnessMap?: string;
    displacementMap?: string;
    aoMap?: string;
  };
  
  // Reference to existing material
  ref?: string;
}

export interface RenderingConfig {
  // Resolution
  resolution?: {
    width: number;
    height: number;
  } | {
    preset: 'hd' | 'fhd' | 'qhd' | '4k' | '8k';
  };
  
  // Anti-aliasing
  antialias?: {
    enabled: boolean;
    samples?: number;
  };
  
  // Tone mapping
  toneMapping?: {
    type: 'linear' | 'reinhard' | 'cineon' | 'aces';
    exposure?: number;
  };
  
  // Shadows
  shadows?: {
    enabled: boolean;
    type: 'basic' | 'pcf' | 'pcfSoft' | 'vsm';
    mapSize?: number;
    bias?: number;
    normalBias?: number;
  };
  
  // Global illumination
  gi?: {
    enabled: boolean;
    method: 'baked' | 'rt' | 'lumen' | 'ssgi';
    bounces?: number;
  };
  
  // Post-processing
  postProcessing?: {
    bloom?: {
      enabled: boolean;
      threshold?: number;
      strength?: number;
      radius?: number;
    };
    depthOfField?: {
      enabled: boolean;
      focusDistance?: number;
      focalLength?: number;
      fStop?: number;
    };
    motionBlur?: {
      enabled: boolean;
      shutterSpeed?: number;
    };
    colorGrading?: {
      enabled: boolean;
      saturation?: number;
      contrast?: number;
      brightness?: number;
      temperature?: number;
      tint?: number;
    };
    vignette?: {
      enabled: boolean;
      darkness?: number;
      offset?: number;
    };
    ambientOcclusion?: {
      enabled: boolean;
      intensity?: number;
      radius?: number;
      bias?: number;
    };
  };
  
  // Render passes
  passes?: string[]; // ['beauty', 'depth', 'normal', 'segmentation', etc.]
}

export interface OutputConfig {
  // Output directory
  directory: string;
  
  // File naming pattern
  namingPattern?: string; // e.g., '{scene}_{camera}_{frame}'
  
  // Formats
  formats?: {
    image?: {
      enabled: boolean;
      format: 'png' | 'jpg' | 'exr' | 'webp';
      quality?: number;
      compression?: number;
    };
    depth?: {
      enabled: boolean;
      format: 'png' | 'exr' | 'numpy';
      scale?: number;
    };
    normal?: {
      enabled: boolean;
      format: 'png' | 'exr' | 'numpy';
    };
    segmentation?: {
      enabled: boolean;
      format: 'png' | 'numpy';
      mode: 'color' | 'index';
    };
    mesh?: {
      enabled: boolean;
      format: 'obj' | 'gltf' | 'glb' | 'fbx' | 'ply';
    };
  };
  
  // Metadata export
  metadata?: {
    enabled: boolean;
    format: 'json' | 'yaml';
    includeSceneGraph?: boolean;
    includeMaterials?: boolean;
    includeConstraints?: boolean;
  };
}

export interface ConstraintConfig {
  id: string;
  type: string;
  
  // Constraint parameters
  parameters: Record<string, any>;
  
  // Priority
  priority?: number;
  
  // Weight (for soft constraints)
  weight?: number;
  
  // Targets
  targets?: string[];
}

// Utility types
export type Vector3Config = [number, number, number] | { x: number; y: number; z: number };
export type Vector2Config = [number, number] | { x: number; y: number };
export type ColorConfig = 
  | string // hex string '#rrggbb'
  | [number, number, number] // [r, g, b] 0-1
  | { r: number; g: number; b: number }
  | { h: number; s: number; l: number } // HSL
  | { h: number; s: number; v: number }; // HSV

export interface CountRangeConfig {
  min: number;
  max: number;
  distribution?: 'uniform' | 'gaussian';
}

export interface BoundingBoxConfig {
  min: Vector3Config;
  max: Vector3Config;
}

/**
 * Configuration Parser and Validator
 */
export class ConfigParser {
  /**
   * Parse a JSON configuration string
   */
  static parseJSON(jsonString: string): SceneConfig {
    try {
      const config = JSON.parse(jsonString);
      this.validate(config);
      return config;
    } catch (error) {
      throw new Error(`Failed to parse JSON config: ${error}`);
    }
  }

  /**
   * Parse a YAML configuration string
   * Note: Requires js-yaml package for full YAML support
   */
  static parseYAML(yamlString: string): SceneConfig {
    try {
      // Simple YAML parser for basic configs
      // For production use, integrate with js-yaml package
      const config = this.simpleYAMLParse(yamlString);
      this.validate(config);
      return config;
    } catch (error) {
      throw new Error(`Failed to parse YAML config: ${error}`);
    }
  }

  /**
   * Validate configuration structure
   */
  static validate(config: SceneConfig): void {
    const errors: string[] = [];

    // Required fields
    if (!config.name) {
      errors.push('Missing required field: name');
    }
    if (!config.version) {
      errors.push('Missing required field: version');
    }

    // Validate cameras
    if (config.cameras) {
      config.cameras.forEach((camera, index) => {
        if (!camera.id) {
          errors.push(`Camera at index ${index} missing id`);
        }
        if (!camera.type) {
          errors.push(`Camera "${camera.id}" missing type`);
        }
      });
    }

    // Validate objects
    if (config.objects) {
      config.objects.forEach((obj, index) => {
        if (!obj.id) {
          errors.push(`Object at index ${index} missing id`);
        }
        if (!obj.type) {
          errors.push(`Object "${obj.id}" missing type`);
        }
      });
    }

    // Validate rendering config
    if (config.rendering?.resolution) {
      const res = config.rendering.resolution as any;
      if ('width' in res && (!res.width || !res.height)) {
        errors.push('Invalid resolution: missing width or height');
      }
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * Convert configuration to JSON string
   */
  static toJSON(config: SceneConfig, pretty?: boolean): string {
    if (pretty) {
      return JSON.stringify(config, null, 2);
    }
    return JSON.stringify(config);
  }

  /**
   * Load configuration from file (Node.js environment)
   */
  static async loadFromFile(filePath: string): Promise<SceneConfig> {
    // In Node.js environment
    if (typeof require !== 'undefined') {
      const fs = await import('fs').catch(() => null);
      const path = await import('path').catch(() => null);
      
      if (fs && path) {
        const ext = path.extname(filePath).toLowerCase();
        const content = fs.readFileSync(filePath, 'utf-8');
        
        if (ext === '.json') {
          return this.parseJSON(content);
        } else if (ext === '.yaml' || ext === '.yml') {
          return this.parseYAML(content);
        } else {
          throw new Error(`Unsupported config file extension: ${ext}`);
        }
      }
    }
    
    throw new Error('File loading not available in browser environment');
  }

  /**
   * Create default configuration template
   */
  static createDefault(): SceneConfig {
    return {
      name: 'Untitled Scene',
      version: '1.0.0',
      description: 'Default scene configuration',
      
      environment: {
        type: 'studio',
        background: {
          type: 'color',
          color: [0.5, 0.5, 0.5],
        },
      },
      
      cameras: [
        {
          id: 'main',
          type: 'perspective',
          position: [5, 5, 5],
          target: [0, 0, 0],
          fov: 60,
          near: 0.1,
          far: 1000,
        },
      ],
      
      lighting: {
        ambient: {
          enabled: true,
          color: [0.4, 0.4, 0.4],
          intensity: 1,
        },
        directional: [
          {
            enabled: true,
            color: [1, 1, 1],
            intensity: 1,
            direction: [1, -1, 0.5],
            castShadow: true,
            shadowMapSize: 2048,
          },
        ],
      },
      
      rendering: {
        resolution: { width: 1920, height: 1080 },
        antialias: { enabled: true, samples: 4 },
        toneMapping: { type: 'aces', exposure: 1 },
        shadows: { enabled: true, type: 'pcfSoft', mapSize: 2048 },
      },
      
      output: {
        directory: './output',
        namingPattern: '{scene}_{camera}_0001',
        formats: {
          image: { enabled: true, format: 'png', compression: 9 },
          depth: { enabled: false, format: 'exr' },
          normal: { enabled: false, format: 'png' },
          segmentation: { enabled: false, format: 'png', mode: 'color' },
        },
      },
    };
  }

  /**
   * Simple YAML parser for basic configurations
   * For production use, integrate with js-yaml package
   */
  private static simpleYAMLParse(yamlString: string): any {
    // This is a very simplified YAML parser
    // It only handles basic key-value pairs and nested objects
    // For full YAML support, use the js-yaml package
    
    const result: any = {};
    const lines = yamlString.split('\n');
    const stack: Array<{ obj: any; indent: number }> = [{ obj: result, indent: -1 }];
    
    for (const line of lines) {
      // Skip comments and empty lines
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Calculate indentation
      const indent = line.search(/\S/);
      
      // Parse key-value
      const match = trimmed.match(/^(\w+):\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        
        // Pop stack until we find parent with smaller indent
        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
          stack.pop();
        }
        
        const parent = stack[stack.length - 1].obj;
        
        if (value === '') {
          // Nested object
          parent[key] = {};
          stack.push({ obj: parent[key], indent });
        } else {
          // Simple value
          parent[key] = this.parseYAMLValue(value);
        }
      }
    }
    
    return result;
  }

  /**
   * Parse YAML value to appropriate type
   */
  private static parseYAMLValue(value: string): any {
    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    
    // Boolean
    if (value === 'true') return true;
    if (value === 'false') return false;
    
    // Null
    if (value === 'null' || value === '~') return null;
    
    // Number
    const num = Number(value);
    if (!isNaN(num)) return num;
    
    // Array (simple [a, b, c])
    if (value.startsWith('[') && value.endsWith(']')) {
      return value
        .slice(1, -1)
        .split(',')
        .map(v => this.parseYAMLValue(v.trim()));
    }
    
    // String
    return value;
  }

  /**
   * Merge multiple configurations
   */
  static merge(...configs: Partial<SceneConfig>[]): SceneConfig {
    return configs.reduce((acc, config) => {
      return this.deepMerge(acc, config);
    }, this.createDefault()) as SceneConfig;
  }

  /**
   * Deep merge two objects
   */
  private static deepMerge(target: any, source: any): any {
    const output = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            output[key] = source[key];
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          output[key] = source[key];
        }
      }
    }
    
    return output;
  }

  /**
   * Check if value is an object
   */
  private static isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * Apply variable substitution in config values
   */
  static substituteVariables(
    config: SceneConfig,
    variables: Record<string, any>
  ): SceneConfig {
    const jsonStr = JSON.stringify(config);
    const substituted = jsonStr.replace(
      /\$\{(\w+)\}/g,
      (_, key) => {
        if (key in variables) {
          return JSON.stringify(variables[key]).slice(1, -1);
        }
        return _;
      }
    );
    return JSON.parse(substituted);
  }
}

/**
 * Filename-matching alias for backward compat.
 * `import SceneConfigSystem from './SceneConfigSystem'` and
 * `import { SceneConfigSystem } from './SceneConfigSystem'` both work.
 */
export { ConfigParser as SceneConfigSystem };
export default ConfigParser;
