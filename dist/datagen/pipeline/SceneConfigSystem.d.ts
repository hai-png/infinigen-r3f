/**
 * Configuration System for Scene Specification
 *
 * Provides YAML/JSON configuration support for defining scenes,
 * objects, materials, lighting, and rendering parameters.
 *
 * This system ports the functionality from Infinigen's configs/ directory,
 * enabling declarative scene specification and batch processing.
 */
export interface SceneConfig {
    name: string;
    description?: string;
    version: string;
    environment?: EnvironmentConfig;
    cameras?: CameraConfig[];
    objects?: ObjectPlacementConfig[];
    lighting?: LightingConfig;
    materials?: MaterialOverrideConfig[];
    rendering?: RenderingConfig;
    output?: OutputConfig;
    constraints?: ConstraintConfig[];
    metadata?: Record<string, any>;
}
export interface EnvironmentConfig {
    type: 'indoor' | 'outdoor' | 'studio' | 'custom';
    sky?: {
        enabled: boolean;
        turbidity?: number;
        rayleigh?: number;
        mieCoefficient?: number;
        mieDirectionalG?: number;
        sunPosition?: Vector3Config;
    };
    hdri?: {
        enabled: boolean;
        path?: string;
        intensity?: number;
        rotation?: number;
    };
    fog?: {
        enabled: boolean;
        color?: ColorConfig;
        near?: number;
        far?: number;
        density?: number;
    };
    background?: {
        type: 'color' | 'transparent' | 'hdri';
        color?: ColorConfig;
        hdriPath?: string;
    };
    ground?: {
        enabled: boolean;
        size?: number;
        material?: MaterialReferenceConfig;
    };
}
export interface CameraConfig {
    id: string;
    type: 'perspective' | 'orthographic';
    position?: Vector3Config;
    rotation?: Vector3Config;
    target?: Vector3Config;
    fov?: number;
    aspect?: number;
    near?: number;
    far?: number;
    zoom?: number;
    orthoSize?: number;
    dof?: {
        enabled: boolean;
        focusDistance?: number;
        focalLength?: number;
        fStop?: number;
    };
    motionBlur?: {
        enabled: boolean;
        shutterSpeed?: number;
    };
    trajectory?: TrajectoryConfig;
}
export interface TrajectoryConfig {
    type: 'linear' | 'circular' | 'spiral' | 'custom' | 'waypoints';
    waypoints?: Vector3Config[];
    center?: Vector3Config;
    radius?: number;
    height?: number;
    rotations?: number;
    duration?: number;
    ease?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
    path?: Vector3Config[];
}
export interface ObjectPlacementConfig {
    id: string;
    type: string;
    position?: Vector3Config | PlacementStrategyConfig;
    rotation?: Vector3Config | RotationStrategyConfig;
    scale?: Vector3Config | number;
    parent?: string;
    constraints?: ObjectConstraintConfig[];
    materials?: MaterialOverrideConfig[];
    count?: number | CountRangeConfig;
    scatter?: ScatterConfig;
    probability?: number;
    tags?: string[];
    properties?: Record<string, any>;
}
export interface PlacementStrategyConfig {
    strategy: 'random' | 'grid' | 'surface' | 'volume' | 'path';
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
    surface?: {
        targetObjects?: string[];
        offset?: number;
        normalOffset?: number;
        alignToNormal?: boolean;
    };
    grid?: {
        rows: number;
        columns: number;
        spacing: Vector3Config | number;
    };
    seed?: number;
}
export interface RotationStrategyConfig {
    strategy: 'fixed' | 'random' | 'align' | 'lookAt';
    value?: Vector3Config;
    xRange?: [number, number];
    yRange?: [number, number];
    zRange?: [number, number];
    alignAxis?: 'x' | 'y' | 'z';
    target?: Vector3Config | string;
}
export interface ScatterConfig {
    enabled: boolean;
    density?: number;
    distribution: 'uniform' | 'gaussian' | 'poisson' | 'custom';
    exclude?: {
        objects?: string[];
        tags?: string[];
        bounds?: BoundingBoxConfig;
    };
    avoidOverlap?: boolean;
    minDistance?: number;
    scaleVariation?: [number, number];
    rotationVariation?: number;
}
export interface ObjectConstraintConfig {
    type: 'collision' | 'support' | 'proximity' | 'alignment' | 'custom';
    collision?: {
        enabled: boolean;
        objects?: string[];
        margin?: number;
    };
    support?: {
        required: boolean;
        surfaces?: string[];
        maxOverhang?: number;
    };
    proximity?: {
        target: string;
        minDistance?: number;
        maxDistance?: number;
    };
    alignment?: {
        axis: 'x' | 'y' | 'z';
        target: string;
        tolerance?: number;
    };
}
export interface LightingConfig {
    ambient?: {
        enabled: boolean;
        color?: ColorConfig;
        intensity?: number;
    };
    directional?: Array<{
        enabled: boolean;
        color?: ColorConfig;
        intensity?: number;
        direction?: Vector3Config;
        castShadow?: boolean;
        shadowMapSize?: number;
    }>;
    point?: Array<{
        enabled: boolean;
        color?: ColorConfig;
        intensity?: number;
        position?: Vector3Config;
        distance?: number;
        decay?: number;
        castShadow?: boolean;
    }>;
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
    target: string | string[];
    material?: MaterialReferenceConfig;
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
    preset?: 'wood' | 'metal' | 'plastic' | 'glass' | 'fabric' | 'ceramic' | 'stone';
    procedural?: {
        nodeTree?: string;
        parameters?: Record<string, any>;
    };
    textures?: {
        map?: string;
        normalMap?: string;
        roughnessMap?: string;
        metalnessMap?: string;
        displacementMap?: string;
        aoMap?: string;
    };
    ref?: string;
}
export interface RenderingConfig {
    resolution?: {
        width: number;
        height: number;
    } | {
        preset: 'hd' | 'fhd' | 'qhd' | '4k' | '8k';
    };
    antialias?: {
        enabled: boolean;
        samples?: number;
    };
    toneMapping?: {
        type: 'linear' | 'reinhard' | 'cineon' | 'aces';
        exposure?: number;
    };
    shadows?: {
        enabled: boolean;
        type: 'basic' | 'pcf' | 'pcfSoft' | 'vsm';
        mapSize?: number;
        bias?: number;
        normalBias?: number;
    };
    gi?: {
        enabled: boolean;
        method: 'baked' | 'rt' | 'lumen' | 'ssgi';
        bounces?: number;
    };
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
    passes?: string[];
}
export interface OutputConfig {
    directory: string;
    namingPattern?: string;
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
    parameters: Record<string, any>;
    priority?: number;
    weight?: number;
    targets?: string[];
}
export type Vector3Config = [number, number, number] | {
    x: number;
    y: number;
    z: number;
};
export type Vector2Config = [number, number] | {
    x: number;
    y: number;
};
export type ColorConfig = string | [number, number, number] | {
    r: number;
    g: number;
    b: number;
} | {
    h: number;
    s: number;
    l: number;
} | {
    h: number;
    s: number;
    v: number;
};
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
export declare class ConfigParser {
    /**
     * Parse a JSON configuration string
     */
    static parseJSON(jsonString: string): SceneConfig;
    /**
     * Parse a YAML configuration string
     * Note: Requires js-yaml package for full YAML support
     */
    static parseYAML(yamlString: string): SceneConfig;
    /**
     * Validate configuration structure
     */
    static validate(config: SceneConfig): void;
    /**
     * Convert configuration to JSON string
     */
    static toJSON(config: SceneConfig, pretty?: boolean): string;
    /**
     * Load configuration from file (Node.js environment)
     */
    static loadFromFile(filePath: string): Promise<SceneConfig>;
    /**
     * Create default configuration template
     */
    static createDefault(): SceneConfig;
    /**
     * Simple YAML parser for basic configurations
     * For production use, integrate with js-yaml package
     */
    private static simpleYAMLParse;
    /**
     * Parse YAML value to appropriate type
     */
    private static parseYAMLValue;
    /**
     * Merge multiple configurations
     */
    static merge(...configs: Partial<SceneConfig>[]): SceneConfig;
    /**
     * Deep merge two objects
     */
    private static deepMerge;
    /**
     * Check if value is an object
     */
    private static isObject;
    /**
     * Apply variable substitution in config values
     */
    static substituteVariables(config: SceneConfig, variables: Record<string, any>): SceneConfig;
}
export default ConfigParser;
//# sourceMappingURL=SceneConfigSystem.d.ts.map