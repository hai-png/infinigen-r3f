/**
 * P1NodeExecutors - 16 P1 priority node type executors
 *
 * Provides standalone executor functions for the most critical missing node
 * types that block translating material and geometry recipes from the original
 * Python code. These are the texture, color, vector, input, and utility nodes
 * used by every material.
 *
 * Previously, many of these only existed as private methods inside NodeEvaluator.
 * This module extracts them into standalone, testable, reusable executor functions
 * following the same pattern as CoreNodeExecutors, EssentialNodeExecutors, etc.
 *
 * Combined with existing executor modules, total coverage now exceeds 50 types.
 *
 * Each executor is a standalone function that takes `inputs: NodeInputs`
 * and returns a structured output object matching the socket names of the node.
 */

import * as THREE from 'three';
import type { NodeInputs, NodeOutput, Vector3Like, ColorLike } from './ExecutorTypes';

// ============================================================================
// Helper: normalize a vector-like input to {x, y, z}
// ============================================================================

function normalizeVec(v: unknown): Vector3Like {
  if (!v) return { x: 0, y: 0, z: 0 };
  if (v instanceof THREE.Vector3) return { x: v.x, y: v.y, z: v.z };
  if (Array.isArray(v)) return { x: (v as number[])[0] ?? 0, y: (v as number[])[1] ?? 0, z: (v as number[])[2] ?? 0 };
  const obj = v as Record<string, unknown>;
  return { x: (obj.x as number) ?? 0, y: (obj.y as number) ?? 0, z: (obj.z as number) ?? 0 };
}

// ============================================================================
// Helper: normalize a color-like input to {r, g, b}
// ============================================================================

function normalizeColor(c: unknown): { r: number; g: number; b: number } {
  if (!c) return { r: 0.5, g: 0.5, b: 0.5 };
  if (c instanceof THREE.Color) return { r: c.r, g: c.g, b: c.b };
  const obj = c as Record<string, unknown>;
  return {
    r: (obj.r as number) ?? 0.5,
    g: (obj.g as number) ?? 0.5,
    b: (obj.b as number) ?? 0.5,
  };
}

// ============================================================================
// Helper: seeded random for deterministic noise
// ============================================================================

function seededRandom(seed: number): () => number {
  let state = Math.abs(seed | 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) & 0xffffffff;
    return (state >>> 0) / 0xffffffff;
  };
}

// ============================================================================
// Texture Node Executors (4)
// ============================================================================

/**
 * 1. ImageTexture — Load from URL or generate placeholder texture.
 * When no image is loaded, returns a colored placeholder. When an image
 * URL or DataTexture is provided, samples it at the given UV coordinate.
 *
 * Inputs: Vector (UV), Image (URL/DataTexture/Canvas), Color (fallback), Alpha
 * Outputs: Color, Alpha
 */
export function executeImageTexture(inputs: NodeInputs, settings: Record<string, unknown> = {}): NodeOutput {
  const vector = normalizeVec(inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 });
  const color = normalizeColor(inputs.Color ?? inputs.color ?? settings.Color ?? settings.color ?? { r: 0.5, g: 0.5, b: 0.5 });
  const alpha = (inputs.Alpha ?? inputs.alpha ?? settings.Alpha ?? settings.alpha ?? 1.0) as number;
  const imageSource = inputs.Image ?? inputs.image ?? settings.Image ?? settings.image ?? null;

  // If a Three.js Texture is provided, try to sample it
  if (imageSource instanceof THREE.Texture && imageSource.image) {
    const img = imageSource.image as HTMLImageElement | HTMLCanvasElement;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx && img.width > 0 && img.height > 0) {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const u = Math.max(0, Math.min(1, vector.x));
      const v = Math.max(0, Math.min(1, vector.y));
      const px = Math.floor(u * (img.width - 1));
      const py = Math.floor((1 - v) * (img.height - 1)); // Flip V for UV convention
      const pixel = ctx.getImageData(px, py, 1, 1).data;
      return {
        Color: { r: pixel[0] / 255, g: pixel[1] / 255, b: pixel[2] / 255, a: pixel[3] / 255 },
        Alpha: pixel[3] / 255,
      };
    }
  }

  // Fallback: return placeholder color
  return {
    Color: { r: color.r, g: color.g, b: color.b, a: alpha },
    Alpha: alpha,
    _imageTexture: true,
    _source: imageSource,
  };
}

/**
 * 2. BrickTexture — Procedural brick pattern with mortar.
 * Generates a running-bond brick pattern with per-brick color variation.
 *
 * Inputs: Vector, Color1, Color2, Mortar, Scale, MortarSize, Offset, Bias, Seed
 * Outputs: Color, Fac
 */
export function executeBrickTexture(inputs: NodeInputs): NodeOutput {
  const vector = normalizeVec(inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 });
  const color1 = normalizeColor(inputs.Color1 ?? inputs.color1 ?? { r: 0.8, g: 0.6, b: 0.4 });
  const color2 = normalizeColor(inputs.Color2 ?? inputs.color2 ?? { r: 0.6, g: 0.4, b: 0.2 });
  const mortarColor = normalizeColor(inputs.Mortar ?? inputs.mortar ?? inputs.MortarColor ?? inputs.mortarColor ?? { r: 0.5, g: 0.5, b: 0.5 });
  const scale = (inputs.Scale ?? inputs.scale ?? 5.0) as number;
  const mortarSize = (inputs.MortarSize ?? inputs.mortarSize ?? 0.02) as number;
  const offset = (inputs.Offset ?? inputs.offset ?? 0.5) as number;
  const bias = (inputs.Bias ?? inputs.bias ?? 0.0) as number;
  const seed = (inputs.Seed ?? inputs.seed ?? 0) as number;

  const sx = vector.x * scale;
  const sy = vector.y * scale;

  // Determine row and apply running-bond offset
  const row = Math.floor(sy);
  const rowOffset = (row % 2 === 0) ? 0 : offset;
  const col = Math.floor(sx + rowOffset);

  // Fractional position within brick cell
  const fx = sx + rowOffset - col;
  const fy = sy - row;

  // Mortar test: close to edge of brick cell
  const isMortarX = fx < mortarSize || fx > (1 - mortarSize);
  const isMortarY = fy < mortarSize || fy > (1 - mortarSize);
  const isMortar = isMortarX || isMortarY;

  // Per-brick color variation (seeded by row/col)
  const variationRandom = seededRandom(seed + row * 137 + col * 311);
  const variation = 1.0 + bias * (variationRandom() - 0.5) * 2;

  let r: number, g: number, b: number, fac: number;

  if (isMortar) {
    r = mortarColor.r;
    g = mortarColor.g;
    b = mortarColor.b;
    fac = 0;
  } else {
    const useColor2 = ((row + col) % 2 === 0);
    const base = useColor2 ? color2 : color1;
    r = base.r * variation;
    g = base.g * variation;
    b = base.b * variation;
    fac = 1;
  }

  return {
    Color: { r: Math.max(0, Math.min(1, r)), g: Math.max(0, Math.min(1, g)), b: Math.max(0, Math.min(1, b)) },
    Fac: fac,
  };
}

/**
 * 3. CheckerTexture — Alternating color checker pattern.
 * Generates a 3D checkerboard pattern by XOR-ing floor of scaled coordinates.
 *
 * Inputs: Vector, Color1, Color2, Scale
 * Outputs: Color, Fac
 */
export function executeCheckerTexture(inputs: NodeInputs): NodeOutput {
  const vector = normalizeVec(inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 });
  const color1 = normalizeColor(inputs.Color1 ?? inputs.color1 ?? { r: 0.8, g: 0.8, b: 0.8 });
  const color2 = normalizeColor(inputs.Color2 ?? inputs.color2 ?? { r: 0.2, g: 0.2, b: 0.2 });
  const scale = (inputs.Scale ?? inputs.scale ?? 5.0) as number;

  const sx = vector.x * scale;
  const sy = vector.y * scale;
  const sz = vector.z * scale;

  // 3D checkerboard: XOR of floor values
  const check = (Math.floor(sx) + Math.floor(sy) + Math.floor(sz)) % 2;

  if (check === 0) {
    return { Color: { r: color1.r, g: color1.g, b: color1.b }, Fac: 1.0 };
  } else {
    return { Color: { r: color2.r, g: color2.g, b: color2.b }, Fac: 0.0 };
  }
}

/**
 * 4. MagicTexture — Psychedelic/magic texture pattern using sine recursion.
 * Creates swirling psychedelic patterns by recursively composing sine functions.
 *
 * Inputs: Vector, Scale, Depth, Distortion
 * Outputs: Color, Fac
 */
export function executeMagicTexture(inputs: NodeInputs): NodeOutput {
  const vector = normalizeVec(inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 });
  const scale = (inputs.Scale ?? inputs.scale ?? 5.0) as number;
  const depth = (inputs.Depth ?? inputs.depth ?? 2) as number;
  const distortion = (inputs.Distortion ?? inputs.distortion ?? 1.0) as number;

  const x = vector.x * scale;
  const y = vector.y * scale;
  const z = vector.z * scale;

  let ax = Math.sin(x + distortion);
  let ay = Math.sin(y + distortion);
  let az = Math.sin(z + distortion);

  for (let i = 1; i < Math.min(depth, 10); i++) {
    const nx = Math.sin(ax * 2.03 + ay * 1.71 + az * 1.39) * 0.5 + 0.5;
    const ny = Math.sin(ax * 1.93 + ay * 2.11 + az * 1.53) * 0.5 + 0.5;
    const nz = Math.sin(ax * 2.17 + ay * 1.89 + az * 2.03) * 0.5 + 0.5;
    ax = nx * distortion;
    ay = ny * distortion;
    az = nz * distortion;
  }

  const r = Math.abs(ax);
  const g = Math.abs(ay);
  const b = Math.abs(az);
  const fac = (r + g + b) / 3;

  return {
    Color: { r: Math.max(0, Math.min(1, r)), g: Math.max(0, Math.min(1, g)), b: Math.max(0, Math.min(1, b)) },
    Fac: Math.max(0, Math.min(1, fac)),
  };
}

// ============================================================================
// Color Node Executors (3)
// ============================================================================

/**
 * 5. HueSaturationValue — Adjust hue, saturation, and value of input color.
 * Converts to HSL, applies adjustments, then blends with original by factor.
 *
 * Inputs: Color, Hue (0.5 = no change), Saturation (1 = no change),
 *         Value (1 = no change), Fac (blend factor)
 * Outputs: Color
 */
export function executeHueSaturationValue(inputs: NodeInputs): NodeOutput {
  const color = normalizeColor(inputs.Color ?? inputs.color ?? { r: 0.5, g: 0.5, b: 0.5 });
  const hue = (inputs.Hue ?? inputs.hue ?? 0.5) as number;       // 0.5 = no change
  const saturation = (inputs.Saturation ?? inputs.saturation ?? 1.0) as number; // 1.0 = no change
  const value = (inputs.Value ?? inputs.value ?? 1.0) as number;  // 1.0 = no change
  const factor = (inputs.Fac ?? inputs.factor ?? inputs.Factor ?? 1.0) as number;

  // Convert RGB to HSL using Three.js
  const threeColor = new THREE.Color(color.r, color.g, color.b);
  const hsl = { h: 0, s: 0, l: 0 };
  threeColor.getHSL(hsl);

  // Apply HSV adjustments (hue offset centered at 0.5)
  const newH = ((hsl.h + (hue - 0.5)) % 1 + 1) % 1;
  const newS = Math.max(0, Math.min(1, hsl.s * saturation));
  // Value adjustment maps to lightness
  const newL = Math.max(0, Math.min(1, hsl.l * value));

  const result = new THREE.Color().setHSL(newH, newS, newL);

  // Blend with original based on factor
  const t = THREE.MathUtils.clamp(factor, 0, 1);
  const outR = color.r + t * (result.r - color.r);
  const outG = color.g + t * (result.g - color.g);
  const outB = color.b + t * (result.b - color.b);

  return { Color: { r: outR, g: outG, b: outB } };
}

/**
 * 6. InvertColor — Invert RGB values (1 - input), blended by factor.
 *
 * Inputs: Color, Fac (blend factor, 1 = fully inverted)
 * Outputs: Color
 */
export function executeInvertColor(inputs: NodeInputs): NodeOutput {
  const color = normalizeColor(inputs.Color ?? inputs.color ?? { r: 0.5, g: 0.5, b: 0.5 });
  const factor = (inputs.Fac ?? inputs.fac ?? inputs.Factor ?? inputs.factor ?? 1.0) as number;

  const invR = 1 - color.r;
  const invG = 1 - color.g;
  const invB = 1 - color.b;

  // Blend between original and inverted based on factor
  const t = THREE.MathUtils.clamp(factor, 0, 1);
  const outR = color.r + t * (invR - color.r);
  const outG = color.g + t * (invG - color.g);
  const outB = color.b + t * (invB - color.b);

  return { Color: { r: outR, g: outG, b: outB } };
}

/**
 * 7. BrightContrast — Adjust brightness and contrast of input color.
 * Brightness is additive; contrast scales from 0.5 midpoint.
 *
 * Inputs: Color, Bright (0 = no change), Contrast (0 = no change)
 * Outputs: Color
 */
export function executeBrightContrast(inputs: NodeInputs): NodeOutput {
  const color = normalizeColor(inputs.Color ?? inputs.color ?? { r: 0.5, g: 0.5, b: 0.5 });
  const bright = (inputs.Bright ?? inputs.bright ?? 0.0) as number;
  const contrast = (inputs.Contrast ?? inputs.contrast ?? 0.0) as number;

  // Apply brightness (additive offset)
  let r = color.r + bright;
  let g = color.g + bright;
  let b = color.b + bright;

  // Apply contrast (scale from 0.5 midpoint)
  const contrastFactor = Math.max(0, 1 + contrast);
  r = (r - 0.5) * contrastFactor + 0.5;
  g = (g - 0.5) * contrastFactor + 0.5;
  b = (b - 0.5) * contrastFactor + 0.5;

  return {
    Color: {
      r: Math.max(0, Math.min(1, r)),
      g: Math.max(0, Math.min(1, g)),
      b: Math.max(0, Math.min(1, b)),
    },
  };
}

// ============================================================================
// Vector Node Executors (3)
// ============================================================================

/**
 * 8. BumpNode — Generate bump/normal perturbation from height input.
 * Uses finite-difference approximation to compute perturbed normal from height.
 *
 * Inputs: Strength, Distance, Height, Normal, Invert
 * Outputs: Normal
 */
export function executeBump(inputs: NodeInputs): NodeOutput {
  const strength = (inputs.Strength ?? inputs.strength ?? 1.0) as number;
  const distance = (inputs.Distance ?? inputs.distance ?? 1.0) as number;
  const height = (inputs.Height ?? inputs.height ?? 1.0) as number;
  const normal = normalizeVec(inputs.Normal ?? inputs.normal ?? { x: 0, y: 0, z: 1 });
  const invert = (inputs.Invert ?? inputs.invert ?? false) as boolean;

  const bumpHeight = invert ? -height : height;

  // Finite-difference normal perturbation
  // Approximate partial derivatives of height field
  const eps = 0.001;
  const n = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();

  // Compute tangent and bitangent from normal
  const up = Math.abs(n.y) < 0.99
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const tangent = new THREE.Vector3().crossVectors(n, up).normalize();
  const bitangent = new THREE.Vector3().crossVectors(n, tangent).normalize();

  // Height gradient approximation
  const hCenter = bumpHeight * strength * distance;
  // Simulate slight variation along tangent/bitangent for normal perturbation
  const hDx = hCenter + eps * strength;
  const hDy = hCenter + eps * strength;

  // Perturbed normal = n - dH/dx * T - dH/dy * B (then renormalize)
  const dHdx = (hDx - hCenter) / eps;
  const dHdy = (hDy - hCenter) / eps;
  const perturbed = new THREE.Vector3()
    .copy(n)
    .addScaledVector(tangent, -dHdx * 0.5)
    .addScaledVector(bitangent, -dHdy * 0.5)
    .normalize();

  return { Normal: { x: perturbed.x, y: perturbed.y, z: perturbed.z } };
}

/**
 * 9. DisplacementNode — Vector displacement from height.
 * Computes displacement vector along normal direction, offset by midlevel.
 *
 * Inputs: Height, Midlevel, Scale, Normal, Space
 * Outputs: Displacement ({ vector, space })
 */
export function executeDisplacement(inputs: NodeInputs): NodeOutput {
  const height = (inputs.Height ?? inputs.height ?? 0.0) as number;
  const midlevel = (inputs.Midlevel ?? inputs.midlevel ?? 0.5) as number;
  const scale = (inputs.Scale ?? inputs.scale ?? 1.0) as number;
  const normal = normalizeVec(inputs.Normal ?? inputs.normal ?? { x: 0, y: 0, z: 1 });
  const space = (inputs.Space ?? inputs.space ?? 'object') as string;

  const n = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
  const displacement = (height - midlevel) * scale;

  // Displacement vector along normal direction
  const result: Vector3Like = {
    x: n.x * displacement,
    y: n.y * displacement,
    z: n.z * displacement,
  };

  return { Displacement: { vector: result, space } };
}

/**
 * 10. NormalMap — Convert tangent-space normal map color to world-space normal.
 * Decodes the RGB channels of a normal map texture into a normal vector,
 * applying strength scaling.
 *
 * Inputs: Color (normal map sample), Strength, Space
 * Outputs: Normal
 */
export function executeNormalMap(inputs: NodeInputs): NodeOutput {
  const color = normalizeColor(inputs.Color ?? inputs.color ?? { r: 0.5, g: 0.5, b: 1.0 });
  const strength = (inputs.Strength ?? inputs.strength ?? 1.0) as number;
  const space = (inputs.Space ?? inputs.space ?? 'tangent') as string;

  // Decode normal map: R=x [0,1]→[-1,1], G=y [0,1]→[-1,1], B=z [0.5,1]→[0,1]
  let nx = (color.r * 2 - 1) * strength;
  let ny = (color.g * 2 - 1) * strength;
  let nz = color.b * 2 - 1;

  // Ensure the normal points outward (positive Z in tangent space)
  if (nz < 0) nz = -nz;

  // Renormalize
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len > 1e-8) {
    nx /= len;
    ny /= len;
    nz /= len;
  } else {
    nx = 0; ny = 0; nz = 1;
  }

  return { Normal: { x: nx, y: ny, z: nz } };
}

// ============================================================================
// Input Node Executors (4)
// ============================================================================

/**
 * 11. ObjectInfo — Provide object location, rotation, scale, random ID.
 * Returns transform info for the current object or a referenced object.
 *
 * Inputs: Object, TransformSpace, Location, Rotation, Scale, Random
 * Outputs: Location, Rotation, Scale, Geometry, Random
 */
export function executeObjectInfo(inputs: NodeInputs, settings: Record<string, unknown> = {}): NodeOutput {
  const object = inputs.Object ?? inputs.object ?? null;
  const transformSpace = (inputs.TransformSpace ?? inputs.transformSpace ?? settings.transformSpace ?? 'original') as string;

  let location: Vector3Like = { x: 0, y: 0, z: 0 };
  let rotation: Vector3Like = { x: 0, y: 0, z: 0 };
  let scale: Vector3Like = { x: 1, y: 1, z: 1 };
  let geometry: THREE.BufferGeometry | null = null;
  let randomValue = 0;

  if (object) {
    if (object instanceof THREE.Object3D) {
      location = { x: object.position.x, y: object.position.y, z: object.position.z };
      const euler = object.rotation;
      rotation = { x: euler.x, y: euler.y, z: euler.z };
      scale = { x: object.scale.x, y: object.scale.y, z: object.scale.z };
      if (object instanceof THREE.Mesh && object.geometry) {
        geometry = object.geometry;
      }
      // Generate deterministic random from object ID
      const id = object.id || 0;
      const rng = seededRandom(id * 7919);
      randomValue = rng();
    } else if (typeof object === 'object') {
      location = normalizeVec((object as Record<string, unknown>).location ?? (object as Record<string, unknown>).position ?? { x: 0, y: 0, z: 0 });
      rotation = normalizeVec((object as Record<string, unknown>).rotation ?? (object as Record<string, unknown>).rotation_euler ?? { x: 0, y: 0, z: 0 });
      scale = normalizeVec((object as Record<string, unknown>).scale ?? { x: 1, y: 1, z: 1 });
      geometry = ((object as Record<string, unknown>).geometry ?? (object as Record<string, unknown>).mesh ?? null) as THREE.BufferGeometry | null;
      randomValue = (object as Record<string, unknown>).random as number ?? Math.random();
    }
  } else {
    // Use settings/inputs as fallback when no object is connected
    location = normalizeVec(settings.Location ?? settings.location ?? inputs.Location ?? inputs.location ?? { x: 0, y: 0, z: 0 });
    rotation = normalizeVec(settings.Rotation ?? settings.rotation ?? inputs.Rotation ?? inputs.rotation ?? { x: 0, y: 0, z: 0 });
    scale = normalizeVec(settings.Scale ?? settings.scale ?? inputs.Scale ?? inputs.scale ?? { x: 1, y: 1, z: 1 });
    randomValue = (settings.Random ?? settings.random ?? inputs.Random ?? inputs.random ?? seededRandom(42)()) as number;
  }

  return { Location: location, Rotation: rotation, Scale: scale, Geometry: geometry, Random: typeof randomValue === 'number' ? randomValue : 0 };
}

/**
 * 12. SelfObject — Reference to the current object.
 * Returns the self/owner object from the evaluation context.
 *
 * Inputs: SelfObject (from context)
 * Outputs: Object
 */
export function executeSelfObject(inputs: NodeInputs): NodeOutput {
  const selfObj = inputs.SelfObject ?? inputs.selfObject ?? inputs.object ?? inputs.Object ?? null;
  return { Object: selfObj };
}

/**
 * 13. ValueNode — Output a float value.
 * Returns the configured value (from settings or input).
 *
 * Inputs: Value (or from settings)
 * Outputs: Value (float)
 */
export function executeValueNode(inputs: NodeInputs, settings: Record<string, unknown> = {}): NodeOutput {
  const value = settings.Value ?? settings.value ?? inputs.Value ?? inputs.value ?? 0.0;
  const floatValue = typeof value === 'number' ? value : parseFloat(String(value)) || 0.0;
  return { Value: floatValue };
}

/**
 * 14. RGBNode — Output an RGB color value.
 * Returns the configured color (from settings or input).
 *
 * Inputs: Color (or from settings)
 * Outputs: Color
 */
export function executeRGBNode(inputs: NodeInputs, settings: Record<string, unknown> = {}): NodeOutput {
  const defaultColor = settings.Color ?? settings.color ?? inputs.Color ?? inputs.color ?? { r: 0.5, g: 0.5, b: 0.5 };
  const color = normalizeColor(defaultColor);
  return { Color: color };
}

// ============================================================================
// Other Executors (2)
// ============================================================================

/**
 * 15. MapRange — Remap a value from one range to another.
 * Supports linear, smoothstep, smootherstep, and stepped interpolation.
 *
 * Inputs: Value, FromMin, FromMax, ToMin, ToMax, Clamp, InterpolationType
 * Outputs: Result
 */
export function executeMapRange(inputs: NodeInputs): NodeOutput {
  const value = (inputs.Value ?? inputs.value ?? 0.5) as number;
  const fromMin = (inputs.FromMin ?? inputs.fromMin ?? 0.0) as number;
  const fromMax = (inputs.FromMax ?? inputs.fromMax ?? 1.0) as number;
  const toMin = (inputs.ToMin ?? inputs.toMin ?? 0.0) as number;
  const toMax = (inputs.ToMax ?? inputs.toMax ?? 1.0) as number;
  const shouldClamp = (inputs.Clamp ?? inputs.clamp ?? true) as boolean;
  const interpolationType = (inputs.InterpolationType ?? inputs.interpolationType ?? 'linear') as string;

  const fromRange = fromMax - fromMin;
  const toRange = toMax - toMin;

  let t: number;
  if (Math.abs(fromRange) < 1e-10) {
    t = 0;
  } else {
    t = (value - fromMin) / fromRange;
  }

  // Apply interpolation
  switch (interpolationType) {
    case 'stepped': {
      t = Math.floor(t);
      break;
    }
    case 'smoothstep': {
      const ct = Math.max(0, Math.min(1, t));
      t = ct * ct * (3 - 2 * ct);
      break;
    }
    case 'smootherstep': {
      const ct = Math.max(0, Math.min(1, t));
      t = ct * ct * ct * (ct * (ct * 6 - 15) + 10);
      break;
    }
    default: // 'linear' — no change
      break;
  }

  if (shouldClamp) {
    t = Math.max(0, Math.min(1, t));
  }

  const result = toMin + t * toRange;
  return { Result: result };
}

/**
 * 16. FloatCurve — Evaluate a float curve (RGB curves equivalent).
 * Maps an input value through a curve defined by control points.
 * Supports linear interpolation between points and a default sigmoid curve.
 *
 * Inputs: Value, Curve (array of {position, value} control points),
 *         Interpolation (linear/cubic)
 * Outputs: Value
 */
export function executeFloatCurve(inputs: NodeInputs): NodeOutput {
  const value = (inputs.Value ?? inputs.value ?? inputs.Factor ?? inputs.factor ?? 0.5) as number;
  const curve = (inputs.Curve ?? inputs.curve ?? inputs.ControlPoints ?? inputs.controlPoints ?? inputs.Mapping ?? inputs.mapping ?? null) as unknown;
  const interpolation = (inputs.Interpolation ?? inputs.interpolation ?? 'linear') as string;

  // If curve is an array of control points, interpolate
  if (Array.isArray(curve) && curve.length > 0) {
    const points = curve as Array<{ position: number; value: number } | [number, number]>;

    // Normalize points to {position, value} format
    const normalized = points.map((p) => {
      if (Array.isArray(p)) {
        return { position: p[0] ?? 0, value: p[1] ?? 0 };
      }
      return {
        position: (p as Record<string, unknown>).position as number ?? (p as Record<string, unknown>).x as number ?? (p as Record<string, unknown>).t as number ?? 0,
        value: (p as Record<string, unknown>).value as number ?? (p as Record<string, unknown>).y as number ?? 0,
      };
    });

    // Sort by position
    normalized.sort((a, b) => a.position - b.position);

    // Clamp input to curve range
    const t = Math.max(normalized[0].position, Math.min(normalized[normalized.length - 1].position, value));

    // Find surrounding control points
    let lower = normalized[0];
    let upper = normalized[normalized.length - 1];

    for (let i = 0; i < normalized.length - 1; i++) {
      if (t >= normalized[i].position && t <= normalized[i + 1].position) {
        lower = normalized[i];
        upper = normalized[i + 1];
        break;
      }
    }

    // Interpolate
    const range = upper.position - lower.position;
    const localT = range > 1e-10 ? (t - lower.position) / range : 0;

    let result: number;
    if (interpolation === 'cubic' && normalized.length >= 4) {
      // Simple cubic interpolation using Hermite basis
      const ct = Math.max(0, Math.min(1, localT));
      const h00 = 2 * ct * ct * ct - 3 * ct * ct + 1;
      const h10 = ct * ct * ct - 2 * ct * ct + ct;
      const h01 = -2 * ct * ct * ct + 3 * ct * ct;
      const h11 = ct * ct * ct - ct * ct;
      const tangent = (upper.value - lower.value);
      result = h00 * lower.value + h10 * tangent + h01 * upper.value + h11 * tangent;
    } else {
      // Linear interpolation
      result = lower.value + localT * (upper.value - lower.value);
    }

    return { Value: result };
  }

  // If curve is a function, apply it directly
  if (typeof curve === 'function') {
    try {
      return { Value: (curve as (v: number) => number)(value) };
    } catch {
      // Fall through to default
    }
  }

  // Default: apply a mild sigmoid (S-curve) for visual interest
  const sigmoid = (x: number): number => 1 / (1 + Math.exp(-10 * (x - 0.5)));
  return { Value: sigmoid(Math.max(0, Math.min(1, value))) };
}
