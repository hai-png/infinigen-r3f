/**
 * Light Nodes - Light source definitions and properties
 * Based on Blender's light nodes and Three.js light types
 * 
 * @module nodes/light
 */

import { Color, Vector3 } from 'three';
import { Node, NodeSocket } from '../../core/types';
import { NodeTypes } from '../../core/node-types';

// ============================================================================
// Light Source Nodes
// ============================================================================

/**
 * PointLight Node
 * Omnidirectional point light source
 */
export interface PointLightNode extends Node {
  type: NodeTypes.PointLight;
  inputs: {
    Color: NodeSocket<Color>;
    Strength: NodeSocket<number>;
    Position: NodeSocket<Vector3>;
  };
  outputs: {
    Light: NodeSocket<any>;
  };
  params: {
    intensity: number;
    distance: number;
    decay: number;
  };
}

export const PointLightDefinition = {
  type: NodeTypes.PointLight,
  label: 'Point Light',
  category: 'Light',
  inputs: [
    { name: 'Color', type: 'COLOR', default: new Color(1, 1, 1) },
    { name: 'Strength', type: 'FLOAT', default: 100 },
    { name: 'Position', type: 'VECTOR', default: new Vector3(0, 0, 0) },
  ],
  outputs: [{ name: 'Light', type: 'LIGHT' }],
  params: {
    intensity: { type: 'float', default: 1, min: 0, max: 1000 },
    distance: { type: 'float', default: 0, min: 0 }, // 0 = infinite
    decay: { type: 'float', default: 2, min: 0, max: 3 },
  },
};

/**
 * SpotLight Node
 * Directional spotlight with cone angle
 */
export interface SpotLightNode extends Node {
  type: NodeTypes.SpotLight;
  inputs: {
    Color: NodeSocket<Color>;
    Strength: NodeSocket<number>;
    Position: NodeSocket<Vector3>;
    Target: NodeSocket<Vector3>;
  };
  outputs: {
    Light: NodeSocket<any>;
  };
  params: {
    intensity: number;
    distance: number;
    angle: number;
    penumbra: number;
    decay: number;
  };
}

export const SpotLightDefinition = {
  type: NodeTypes.SpotLight,
  label: 'Spot Light',
  category: 'Light',
  inputs: [
    { name: 'Color', type: 'COLOR', default: new Color(1, 1, 1) },
    { name: 'Strength', type: 'FLOAT', default: 100 },
    { name: 'Position', type: 'VECTOR', default: new Vector3(0, 5, 0) },
    { name: 'Target', type: 'VECTOR', default: new Vector3(0, 0, 0) },
  ],
  outputs: [{ name: 'Light', type: 'LIGHT' }],
  params: {
    intensity: { type: 'float', default: 1, min: 0, max: 1000 },
    distance: { type: 'float', default: 0, min: 0 },
    angle: { type: 'float', default: Math.PI / 6, min: 0, max: Math.PI / 2 },
    penumbra: { type: 'float', default: 0, min: 0, max: 1 },
    decay: { type: 'float', default: 2, min: 0, max: 3 },
  },
};

/**
 * AreaLight Node
 * Rectangular area light source
 */
export interface AreaLightNode extends Node {
  type: NodeTypes.AreaLight;
  inputs: {
    Color: NodeSocket<Color>;
    Strength: NodeSocket<number>;
    Position: NodeSocket<Vector3>;
  };
  outputs: {
    Light: NodeSocket<any>;
  };
  params: {
    intensity: number;
    width: number;
    height: number;
    shape: 'rectangle' | 'disk' | 'sphere';
  };
}

export const AreaLightDefinition = {
  type: NodeTypes.AreaLight,
  label: 'Area Light',
  category: 'Light',
  inputs: [
    { name: 'Color', type: 'COLOR', default: new Color(1, 1, 1) },
    { name: 'Strength', type: 'FLOAT', default: 100 },
    { name: 'Position', type: 'VECTOR', default: new Vector3(0, 5, 0) },
  ],
  outputs: [{ name: 'Light', type: 'LIGHT' }],
  params: {
    intensity: { type: 'float', default: 1, min: 0, max: 1000 },
    width: { type: 'float', default: 1, min: 0.01, max: 100 },
    height: { type: 'float', default: 1, min: 0.01, max: 100 },
    shape: { type: 'enum', options: ['rectangle', 'disk', 'sphere'], default: 'rectangle' },
  },
};

/**
 * SunLight Node
 * Directional sun light (infinite distance)
 */
export interface SunLightNode extends Node {
  type: NodeTypes.SunLight;
  inputs: {
    Color: NodeSocket<Color>;
    Strength: NodeSocket<number>;
    Direction: NodeSocket<Vector3>;
  };
  outputs: {
    Light: NodeSocket<any>;
  };
  params: {
    intensity: number;
    angle: number;
  };
}

export const SunLightDefinition = {
  type: NodeTypes.SunLight,
  label: 'Sun Light',
  category: 'Light',
  inputs: [
    { name: 'Color', type: 'COLOR', default: new Color(1, 1, 0.95) },
    { name: 'Strength', type: 'FLOAT', default: 1 },
    { name: 'Direction', type: 'VECTOR', default: new Vector3(0, -1, 0) },
  ],
  outputs: [{ name: 'Light', type: 'LIGHT' }],
  params: {
    intensity: { type: 'float', default: 1, min: 0, max: 10 },
    angle: { type: 'float', default: 0.004, min: 0, max: 0.1 }, // Sun angular diameter
  },
};

// ============================================================================
// Light Property Nodes
// ============================================================================

/**
 * LightFalloff Node
 * Controls light attenuation over distance
 */
export interface LightFalloffNode extends Node {
  type: NodeTypes.LightFalloff;
  inputs: {
    Strength: NodeSocket<number>;
    Smooth: NodeSocket<number>;
  };
  outputs: {
    Strength: NodeSocket<number>;
  };
  params: {
    constant: number;
    linear: number;
    quadratic: number;
  };
}

export const LightFalloffDefinition = {
  type: NodeTypes.LightFalloff,
  label: 'Light Falloff',
  category: 'Light',
  inputs: [
    { name: 'Strength', type: 'FLOAT', default: 1 },
    { name: 'Smooth', type: 'FLOAT', default: 0 },
  ],
  outputs: [{ name: 'Strength', type: 'FLOAT' }],
  params: {
    constant: { type: 'float', default: 1, min: 0 },
    linear: { type: 'float', default: 0, min: 0 },
    quadratic: { type: 'float', default: 1, min: 0 },
  },
};

/**
 * LightAttenuation Node
 * Custom attenuation curve for lights
 */
export interface LightAttenuationNode extends Node {
  type: NodeTypes.LightAttenuation;
  inputs: {
    Distance: NodeSocket<number>;
    Curve: NodeSocket<any>;
  };
  outputs: {
    Factor: NodeSocket<number>;
  };
  params: {
    useCustomCurve: boolean;
  };
}

export const LightAttenuationDefinition = {
  type: NodeTypes.LightAttenuation,
  label: 'Light Attenuation',
  category: 'Light',
  inputs: [
    { name: 'Distance', type: 'FLOAT', default: 0 },
    { name: 'Curve', type: 'FLOAT_CURVE', default: null },
  ],
  outputs: [{ name: 'Factor', type: 'FLOAT' }],
  params: {
    useCustomCurve: { type: 'boolean', default: false },
  },
};

// ============================================================================
// Light Execution Functions
// ============================================================================

import { PointLight as ThreePointLight, SpotLight as ThreeSpotLight, DirectionalLight, RectangleAreaLight } from 'three';

export function createPointLight(
  color: Color,
  strength: number,
  position: Vector3,
  intensity: number = 1,
  distance: number = 0,
  decay: number = 2
): ThreePointLight {
  const light = new ThreePointLight(color, strength * intensity, distance, decay);
  light.position.copy(position);
  return light;
}

export function createSpotLight(
  color: Color,
  strength: number,
  position: Vector3,
  target: Vector3,
  intensity: number = 1,
  distance: number = 0,
  angle: number = Math.PI / 6,
  penumbra: number = 0,
  decay: number = 2
): ThreeSpotLight {
  const light = new ThreeSpotLight(color, strength * intensity, distance, angle, penumbra, decay);
  light.position.copy(position);
  light.target.position.copy(target);
  return light;
}

export function createSunLight(
  color: Color,
  strength: number,
  direction: Vector3,
  intensity: number = 1
): DirectionalLight {
  const light = new DirectionalLight(color, strength * intensity);
  light.position.copy(direction.clone().negate().multiplyScalar(100));
  light.target.position.set(0, 0, 0);
  return light;
}

export function calculateFalloff(
  distance: number,
  strength: number,
  smooth: number,
  constant: number = 1,
  linear: number = 0,
  quadratic: number = 1
): number {
  if (distance <= 0) return strength;
  
  const falloff = constant + linear * distance + quadratic * distance * distance;
  const smoothed = Math.max(0, strength - smooth);
  
  return smoothed / falloff;
}

// ============================================================================
// Exports
// ============================================================================

export const LightNodes = {
  PointLight: PointLightDefinition,
  SpotLight: SpotLightDefinition,
  AreaLight: AreaLightDefinition,
  SunLight: SunLightDefinition,
  LightFalloff: LightFalloffDefinition,
  LightAttenuation: LightAttenuationDefinition,
};

export const LightFunctions = {
  createPointLight,
  createSpotLight,
  createSunLight,
  calculateFalloff,
};
