/**
 * TerrainNodeExecutors — Per-vertex executors for terrain surface evaluation
 *
 * Provides 17 per-vertex executor implementations needed for terrain feature
 * parity with the original infinigen procedural generation system. Each
 * executor operates on AttributeStreams — evaluating per-vertex data in
 * bulk rather than calling scalar node executors one vertex at a time.
 *
 * ## Supported Node Types
 *
 * | #  | Node Type              | Canonical Name             |
 * |----|------------------------|----------------------------|
 * |  1 | NoiseTexture           | ShaderNodeTexNoise         |
 * |  2 | MusgraveTexture        | ShaderNodeTexMusgrave      |
 * |  3 | VoronoiTexture         | ShaderNodeTexVoronoi       |
 * |  4 | WaveTexture            | ShaderNodeTexWave          |
 * |  5 | ColorRamp              | ShaderNodeValToRGB         |
 * |  6 | FloatCurve             | ShaderNodeFloatCurve       |
 * |  7 | MapRange               | ShaderNodeMapRange         |
 * |  8 | Mapping                | ShaderNodeMapping          |
 * |  9 | TextureCoordinate      | ShaderNodeTexCoord         |
 * | 10 | SeparateXYZ            | ShaderNodeSeparateXYZ      |
 * | 11 | CombineXYZ             | ShaderNodeCombineXYZ       |
 * | 12 | SeparateColor          | ShaderNodeSeparateColor    |
 * | 13 | CombineColor           | ShaderNodeCombineColor / FunctionNodeCombineColor |
 * | 14 | SurfaceKernel          | TerrainNodeSurfaceKernel   |
 * | 15 | TerrainAttribute       | TerrainNodeAttribute       |
 * | 16 | TerrainMask            | TerrainNodeMask            |
 * | 17 | TerrainBlend           | TerrainNodeBlend           |
 *
 * ## Registration
 *
 * Call `registerTerrainNodeExecutors(registry)` to register all executors
 * into a `Map<string, PerVertexExecutor>`. Each executor is registered under
 * both its canonical Blender-style name and the legacy NodeTypes enum value.
 *
 * @module @infinigen/r3f/nodes/execution/TerrainNodeExecutors
 */

import { AttributeStream, AttributeDataType } from '../core/attribute-stream';
import { GeometryContext } from '../core/geometry-context';
import { PerVertexExecutor } from '../core/per-vertex-evaluator';
import { SeededNoiseGenerator, NoiseType } from '../../util/math/noise';
import { NodeTypes } from '../core/node-types';

// ============================================================================
// Helpers
// ============================================================================

/** Get a float value from a stream at the given index, defaulting to `fallback`. */
function getFloatInput(
  inputs: Map<string, AttributeStream>,
  name: string,
  index: number,
  fallback: number,
): number {
  const stream = inputs.get(name);
  if (!stream) return fallback;
  if (stream.dataType === 'FLOAT' || stream.dataType === 'INT' || stream.dataType === 'BOOLEAN') {
    return stream.getFloat(index);
  }
  // For vector/color, return first component
  return stream.getRawData()[index * stream.componentCount];
}

/** Get a vec3 value from a stream at the given index. */
function getVectorInput(
  inputs: Map<string, AttributeStream>,
  name: string,
  index: number,
  fallback: [number, number, number],
): [number, number, number] {
  const stream = inputs.get(name);
  if (!stream) return fallback;
  if (stream.dataType === 'VECTOR') {
    return stream.getVector(index);
  }
  if (stream.dataType === 'COLOR') {
    const c = stream.getColor(index);
    return [c.r, c.g, c.b];
  }
  // Float: broadcast to all three components
  const v = stream.getFloat(index);
  return [v, v, v];
}

/** Get a color value from a stream at the given index. */
function getColorInput(
  inputs: Map<string, AttributeStream>,
  name: string,
  index: number,
  fallback: { r: number; g: number; b: number; a: number },
): { r: number; g: number; b: number; a: number } {
  const stream = inputs.get(name);
  if (!stream) return fallback;
  if (stream.dataType === 'COLOR') {
    return stream.getColor(index);
  }
  if (stream.dataType === 'VECTOR') {
    const v = stream.getVector(index);
    return { r: v[0], g: v[1], b: v[2], a: 1 };
  }
  const v = stream.getFloat(index);
  return { r: v, g: v, b: v, a: 1 };
}

/** Create a constant FLOAT stream filled with a single value. */
function constantFloatStream(
  name: string,
  value: number,
  vertexCount: number,
): AttributeStream {
  const stream = new AttributeStream(name, 'point', 'FLOAT', vertexCount);
  stream.fill(value);
  return stream;
}

/** Clamp a value to [min, max]. */
function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Smooth-step interpolation (Hermite). */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clampValue((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// ============================================================================
// 1. NoiseTexture — ShaderNodeTexNoise
// ============================================================================

/**
 * Evaluate 3D noise (simplex/perlin) per vertex using position input.
 * Returns Fac (float) and Color (vec3) streams.
 *
 * Properties: scale, detail, roughness, distortion, noiseType (perlin/simplex),
 *             noiseDimensions (3D), seed
 */
const noiseTextureExecutor: PerVertexExecutor = (
  inputs,
  props,
  geometry,
  vertexCount,
) => {
  const outputs = new Map<string, AttributeStream>();

  const scale = (props.scale as number) ?? 5.0;
  const detail = Math.floor(clampValue((props.detail as number) ?? 2, 0, 16));
  const roughness = clampValue((props.roughness as number) ?? 0.5, 0, 1);
  const distortion = (props.distortion as number) ?? 0.0;
  const noiseTypeStr = (props.noiseType as string) ?? 'perlin';
  const seed = (props.seed as number) ?? 0;

  const noiseType: NoiseType = noiseTypeStr === 'simplex'
    ? NoiseType.Simplex
    : NoiseType.Perlin;

  const generator = new SeededNoiseGenerator(seed);

  const facStream = new AttributeStream('Fac', 'point', 'FLOAT', vertexCount);
  const colorStream = new AttributeStream('Color', 'point', 'COLOR', vertexCount);

  // Get position input — either from the 'Vector' input or geometry positions
  const vectorInput = inputs.get('Vector');

  for (let i = 0; i < vertexCount; i++) {
    let pos: [number, number, number];
    if (vectorInput && vectorInput.dataType === 'VECTOR') {
      pos = vectorInput.getVector(i);
    } else if (vectorInput && vectorInput.dataType === 'FLOAT') {
      const v = vectorInput.getFloat(i);
      pos = [v, 0, 0];
    } else {
      pos = geometry.getPosition(i);
    }

    let x = pos[0] * scale;
    let y = pos[1] * scale;
    let z = pos[2] * scale;

    // Apply distortion
    if (Math.abs(distortion) > 0.0001) {
      const dx = generator.fbm(x + 13.5, y + 17.2, z + 7.1, {
        octaves: detail, gain: roughness, noiseType,
      });
      const dy = generator.fbm(x + 23.8, y + 31.4, z + 11.9, {
        octaves: detail, gain: roughness, noiseType,
      });
      const dz = generator.fbm(x + 41.3, y + 47.6, z + 23.5, {
        octaves: detail, gain: roughness, noiseType,
      });
      x += dx * distortion;
      y += dy * distortion;
      z += dz * distortion;
    }

    // Evaluate noise — Blender normalizes to [0, 1]
    const fac = (generator.fbm(x, y, z, {
      octaves: detail,
      gain: roughness,
      noiseType,
    }) + 1) * 0.5;

    const clampedFac = clampValue(fac, 0, 1);
    facStream.setFloat(i, clampedFac);

    // Color output: hash-based color from noise position
    const r = (generator.fbm(x + 71.3, y + 83.1, z + 47.9, {
      octaves: detail, gain: roughness, noiseType,
    }) + 1) * 0.5;
    const g = (generator.fbm(x + 113.7, y + 97.3, z + 61.1, {
      octaves: detail, gain: roughness, noiseType,
    }) + 1) * 0.5;
    const b = (generator.fbm(x + 157.1, y + 131.7, z + 79.3, {
      octaves: detail, gain: roughness, noiseType,
    }) + 1) * 0.5;

    colorStream.setColor(i, {
      r: clampValue(r, 0, 1),
      g: clampValue(g, 0, 1),
      b: clampValue(b, 0, 1),
      a: 1,
    });
  }

  outputs.set('Fac', facStream);
  outputs.set('Color', colorStream);
  return outputs;
};

// ============================================================================
// 2. MusgraveTexture — ShaderNodeTexMusgrave
// ============================================================================

/**
 * Evaluate Musgrave noise per vertex.
 * Supports fBM, RidgedMultifractal, HeteroTerrain, HybridMultifractal types.
 *
 * Properties: musgraveType, scale, detail, dimension, lacunarity, offset, gain, seed
 */
const musgraveTextureExecutor: PerVertexExecutor = (
  inputs,
  props,
  geometry,
  vertexCount,
) => {
  const outputs = new Map<string, AttributeStream>();

  const musgraveType = (props.musgraveType as string) ?? 'fbm';
  const scale = (props.scale as number) ?? 5.0;
  const detail = Math.floor(clampValue((props.detail as number) ?? 2, 0, 16));
  const dimension = (props.dimension as number) ?? 2.0;
  const lacunarity = (props.lacunarity as number) ?? 2.0;
  const offset = (props.offset as number) ?? 0.0;
  const gain = (props.gain as number) ?? 1.0;
  const seed = (props.seed as number) ?? 0;

  const generator = new SeededNoiseGenerator(seed);

  const facStream = new AttributeStream('Fac', 'point', 'FLOAT', vertexCount);

  const vectorInput = inputs.get('Vector');

  // Compute derived persistence from dimension
  const persistence = Math.pow(lacunarity, -dimension);

  for (let i = 0; i < vertexCount; i++) {
    let pos: [number, number, number];
    if (vectorInput && vectorInput.dataType === 'VECTOR') {
      pos = vectorInput.getVector(i);
    } else if (vectorInput && vectorInput.dataType === 'FLOAT') {
      const v = vectorInput.getFloat(i);
      pos = [v, 0, 0];
    } else {
      pos = geometry.getPosition(i);
    }

    const x = pos[0] * scale;
    const y = pos[1] * scale;
    const z = pos[2] * scale;

    let value: number;

    switch (musgraveType) {
      case 'ridged_multifractal':
      case 'RidgedMultifractal': {
        value = generator.ridgedMultifractal(x, y, z, {
          octaves: detail,
          lacunarity,
          gain: persistence,
          offset,
          scale: 1,
          noiseType: NoiseType.Perlin,
        });
        break;
      }
      case 'hetero_terrain':
      case 'HeteroTerrain': {
        // HeteroTerrain: accumulate weighted noise with offset
        let signal = generator.perlin3D(x, y, z) + offset;
        let amp = 1.0;
        let weight = 1.0;
        value = signal;
        let frequency = lacunarity;
        for (let o = 1; o < detail; o++) {
          signal = generator.perlin3D(
            x * frequency, y * frequency, z * frequency,
          ) + offset;
          weight = clampValue(signal * gain, 0, 1);
          value += weight * amp * signal;
          amp *= persistence;
          frequency *= lacunarity;
        }
        // Normalize
        value = value / (1 + (detail > 1 ? (1 - Math.pow(persistence, detail - 1)) / (1 - persistence) : 0));
        value = clampValue((value + 1) * 0.5, 0, 1);
        break;
      }
      case 'hybrid_multifractal':
      case 'HybridMultifractal': {
        // HybridMultifractal: combines fBM with ridged
        let signal2 = offset - Math.abs(generator.perlin3D(x, y, z));
        signal2 *= signal2;
        value = signal2;
        let amp2 = 1.0;
        let freq2 = lacunarity;
        for (let o = 1; o < detail; o++) {
          amp2 *= persistence;
          signal2 = offset - Math.abs(
            generator.perlin3D(x * freq2, y * freq2, z * freq2),
          );
          signal2 *= signal2;
          value += signal2 * amp2;
          freq2 *= lacunarity;
        }
        value = clampValue((value / (1 + (1 - Math.pow(persistence, detail)) / (1 - persistence))) * 4, 0, 1);
        break;
      }
      case 'fbm':
      case 'FBM':
      default: {
        value = (generator.fbm(x, y, z, {
          octaves: detail,
          lacunarity,
          gain: persistence,
          noiseType: NoiseType.Perlin,
          scale: 1,
        }) + 1) * 0.5;
        value = clampValue(value, 0, 1);
        break;
      }
    }

    facStream.setFloat(i, value);
  }

  outputs.set('Fac', facStream);
  return outputs;
};

// ============================================================================
// 3. VoronoiTexture — ShaderNodeTexVoronoi
// ============================================================================

/**
 * Evaluate Voronoi pattern per vertex.
 * Properties: scale, feature (F1/F2/Distance/Edge), distance (Euclidean/Manhattan/
 *             Chebyshev/Minkowski), smoothness. Returns Distance, Color, Position outputs.
 */
const voronoiTextureExecutor: PerVertexExecutor = (
  inputs,
  props,
  geometry,
  vertexCount,
) => {
  const outputs = new Map<string, AttributeStream>();

  const scale = (props.scale as number) ?? 5.0;
  const feature = (props.feature as string) ?? 'F1';
  const distanceType = (props.distance as string) ?? 'euclidean';
  const smoothness = (props.smoothness as number) ?? 0.0;
  const minkowskiExponent = (props.minkowskiExponent as number) ?? 0.5;
  const seed = (props.seed as number) ?? 0;

  const distStream = new AttributeStream('Distance', 'point', 'FLOAT', vertexCount);
  const colorStream = new AttributeStream('Color', 'point', 'COLOR', vertexCount);
  const posStream = new AttributeStream('Position', 'point', 'VECTOR', vertexCount);

  const vectorInput = inputs.get('Vector');

  // Distance function
  function distFn(dx: number, dy: number, dz: number): number {
    switch (distanceType) {
      case 'manhattan':
        return Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
      case 'chebyshev':
        return Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
      case 'minkowski': {
        const exp = minkowskiExponent;
        return Math.pow(
          Math.pow(Math.abs(dx), exp) +
          Math.pow(Math.abs(dy), exp) +
          Math.pow(Math.abs(dz), exp),
          1 / exp,
        );
      }
      case 'euclidean':
      default:
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  }

  // Simple seeded hash for Voronoi cell point positions
  function cellHash(cx: number, cy: number, cz: number, s: number): number {
    let h = (cx * 374761393 + cy * 668265263 + cz * 1013904223 + s * 15485863) | 0;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    h = (h ^ (h >> 16));
    return (Math.abs(h) & 0x7fffffff) / 0x7fffffff;
  }

  for (let i = 0; i < vertexCount; i++) {
    let pos: [number, number, number];
    if (vectorInput && vectorInput.dataType === 'VECTOR') {
      pos = vectorInput.getVector(i);
    } else if (vectorInput && vectorInput.dataType === 'FLOAT') {
      const v = vectorInput.getFloat(i);
      pos = [v, 0, 0];
    } else {
      pos = geometry.getPosition(i);
    }

    const sx = pos[0] * scale;
    const sy = pos[1] * scale;
    const sz = pos[2] * scale;

    const cellX = Math.floor(sx);
    const cellY = Math.floor(sy);
    const cellZ = Math.floor(sz);

    let dist1 = Infinity;
    let dist2 = Infinity;
    let closestPointX = 0;
    let closestPointY = 0;
    let closestPointZ = 0;
    let closestCellHash = 0;

    // Search 3x3x3 neighborhood
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const nx = cellX + dx;
          const ny = cellY + dy;
          const nz = cellZ + dz;

          // Generate feature point within cell using hash
          const h1 = cellHash(nx, ny, nz, seed);
          const h2 = cellHash(nx + 1000, ny + 1000, nz + 1000, seed);
          const h3 = cellHash(nx + 2000, ny + 2000, nz + 2000, seed);

          const fx = nx + h1;
          const fy = ny + h2;
          const fz = nz + h3;

          const distX = sx - fx;
          const distY = sy - fy;
          const distZ = sz - fz;

          const d = distFn(distX, distY, distZ);

          if (d < dist1) {
            dist2 = dist1;
            dist1 = d;
            closestPointX = fx;
            closestPointY = fy;
            closestPointZ = fz;
            closestCellHash = h1;
          } else if (d < dist2) {
            dist2 = d;
          }
        }
      }
    }

    let distanceValue: number;
    switch (feature) {
      case 'F2':
        distanceValue = dist2;
        break;
      case 'Distance':
        distanceValue = dist1;
        break;
      case 'N_Sphere':
      case 'Edge': {
        // Edge detection: difference between F2 and F1
        distanceValue = dist2 - dist1;
        break;
      }
      case 'F1':
      default:
        distanceValue = dist1;
        break;
    }

    // Apply smoothness (smooth F1)
    if (smoothness > 0 && feature !== 'Edge') {
      distanceValue = distanceValue * (1 - smoothness) + smoothness * smoothstep(0, 1, distanceValue);
    }

    // Clamp distance
    distanceValue = clampValue(distanceValue, 0, 1);

    distStream.setFloat(i, distanceValue);

    // Color: based on closest cell hash for cell coloring
    colorStream.setColor(i, {
      r: clampValue(closestCellHash * 2.3 % 1, 0, 1),
      g: clampValue(closestCellHash * 3.7 % 1, 0, 1),
      b: clampValue(closestCellHash * 5.1 % 1, 0, 1),
      a: 1,
    });

    // Position: normalized position of closest feature point
    posStream.setVector(i, [
      closestPointX / scale,
      closestPointY / scale,
      closestPointZ / scale,
    ]);
  }

  outputs.set('Distance', distStream);
  outputs.set('Color', colorStream);
  outputs.set('Position', posStream);
  return outputs;
};

// ============================================================================
// 4. WaveTexture — ShaderNodeTexWave
// ============================================================================

/**
 * Evaluate wave texture (bands/rings) per vertex.
 * Properties: waveType, bandsDirection, scale, distortion, detail,
 *             detailScale, detailRoughness, phaseOffset
 */
const waveTextureExecutor: PerVertexExecutor = (
  inputs,
  props,
  geometry,
  vertexCount,
) => {
  const outputs = new Map<string, AttributeStream>();

  const waveType = (props.waveType as string) ?? 'bands';
  const bandsDirection = (props.bandsDirection as string) ?? 'x';
  const scale = (props.scale as number) ?? 5.0;
  const distortion = (props.distortion as number) ?? 0.0;
  const detail = Math.floor(clampValue((props.detail as number) ?? 2, 0, 16));
  const detailScale = (props.detailScale as number) ?? 1.0;
  const detailRoughness = clampValue((props.detailRoughness as number) ?? 0.5, 0, 1);
  const phaseOffset = (props.phaseOffset as number) ?? 0.0;
  const seed = (props.seed as number) ?? 0;

  const generator = new SeededNoiseGenerator(seed);

  const facStream = new AttributeStream('Fac', 'point', 'FLOAT', vertexCount);
  const colorStream = new AttributeStream('Color', 'point', 'COLOR', vertexCount);

  const vectorInput = inputs.get('Vector');

  for (let i = 0; i < vertexCount; i++) {
    let pos: [number, number, number];
    if (vectorInput && vectorInput.dataType === 'VECTOR') {
      pos = vectorInput.getVector(i);
    } else if (vectorInput && vectorInput.dataType === 'FLOAT') {
      const v = vectorInput.getFloat(i);
      pos = [v, 0, 0];
    } else {
      pos = geometry.getPosition(i);
    }

    const x = pos[0] * scale;
    const y = pos[1] * scale;
    const z = pos[2] * scale;

    // Compute wave coordinate based on direction
    let waveCoord: number;
    if (waveType === 'rings') {
      waveCoord = Math.sqrt(x * x + y * y + z * z);
    } else {
      switch (bandsDirection) {
        case 'y':
          waveCoord = y;
          break;
        case 'z':
          waveCoord = z;
          break;
        case 'diagonal':
          waveCoord = (x + y + z) * 0.577;
          break;
        case 'x':
        default:
          waveCoord = x;
          break;
      }
    }

    // Apply distortion
    if (Math.abs(distortion) > 0.0001) {
      const n = generator.fbm(x, y, z, {
        octaves: detail,
        gain: detailRoughness,
        scale: detailScale,
      });
      waveCoord += n * distortion;
    }

    // Apply detail (additional harmonics)
    let detailValue = 0;
    if (detail > 0) {
      detailValue = generator.fbm(x * detailScale, y * detailScale, z * detailScale, {
        octaves: detail,
        gain: detailRoughness,
        scale: 1,
      }) * 0.5;
    }

    // Wave function (sine wave)
    const fac = clampValue(
      (Math.sin(waveCoord + phaseOffset + detailValue) + 1) * 0.5,
      0,
      1,
    );

    facStream.setFloat(i, fac);
    colorStream.setColor(i, { r: fac, g: fac, b: fac, a: 1 });
  }

  outputs.set('Fac', facStream);
  outputs.set('Color', colorStream);
  return outputs;
};

// ============================================================================
// 5. ColorRamp — ShaderNodeValToRGB
// ============================================================================

/**
 * Interpolate color ramp from a Fac input.
 * Properties: colorMode, interpolation, colorRampElements (array of {position, color})
 */
const colorRampExecutor: PerVertexExecutor = (
  inputs,
  props,
  _geometry,
  vertexCount,
) => {
  const outputs = new Map<string, AttributeStream>();

  const interpolation = (props.interpolation as string) ?? 'linear';
  let elements = props.colorRampElements as Array<{
    position: number;
    color: { r: number; g: number; b: number; a?: number };
  }> | undefined;

  // Fallback: two-stop black-to-white ramp
  if (!elements || elements.length === 0) {
    elements = [
      { position: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
      { position: 1, color: { r: 1, g: 1, b: 1, a: 1 } },
    ];
  }

  // Sort elements by position
  const sorted = [...elements].sort((a, b) => a.position - b.position);

  const facInput = inputs.get('Fac');

  const colorStream = new AttributeStream('Color', 'point', 'COLOR', vertexCount);
  const alphaStream = new AttributeStream('Alpha', 'point', 'FLOAT', vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    const fac = facInput ? clampValue(getFloatInput(inputs, 'Fac', i, 0), 0, 1) : 0;

    // Find surrounding stops
    let lower = sorted[0];
    let upper = sorted[sorted.length - 1];

    for (let s = 0; s < sorted.length - 1; s++) {
      if (fac >= sorted[s].position && fac <= sorted[s + 1].position) {
        lower = sorted[s];
        upper = sorted[s + 1];
        break;
      }
    }

    const range = upper.position - lower.position;
    let t = range > 0 ? (fac - lower.position) / range : 0;

    // Apply interpolation
    switch (interpolation) {
      case 'constant':
        t = t < 0.5 ? 0 : 1;
        break;
      case 'ease':
        t = t * t * (3 - 2 * t);
        break;
      case 'cardinal_spline': {
        // Simple cubic smoothing
        t = t * t * (3 - 2 * t);
        break;
      }
      case 'b_spline': {
        // Smoother interpolation
        const s = t;
        t = s * s * s * (10 - s * (15 - 6 * s));
        break;
      }
      case 'linear':
      default:
        // t is already linear
        break;
    }

    const r = lower.color.r + t * (upper.color.r - lower.color.r);
    const g = lower.color.g + t * (upper.color.g - lower.color.g);
    const b = lower.color.b + t * (upper.color.b - lower.color.b);
    const a = (lower.color.a ?? 1) + t * ((upper.color.a ?? 1) - (lower.color.a ?? 1));

    colorStream.setColor(i, { r, g, b, a });
    alphaStream.setFloat(i, a);
  }

  outputs.set('Color', colorStream);
  outputs.set('Alpha', alphaStream);
  return outputs;
};

// ============================================================================
// 6. FloatCurve — ShaderNodeFloatCurve
// ============================================================================

/**
 * Evaluate float curve from a Fac input.
 * Properties: curvePoints (array of {position, value}), interpolation
 */
const floatCurveExecutor: PerVertexExecutor = (
  inputs,
  props,
  _geometry,
  vertexCount,
) => {
  const outputs = new Map<string, AttributeStream>();

  let curvePoints = props.curvePoints as Array<{ position: number; value: number }> | undefined;

  // Fallback: identity curve
  if (!curvePoints || curvePoints.length < 2) {
    curvePoints = [
      { position: 0, value: 0 },
      { position: 1, value: 1 },
    ];
  }

  const sorted = [...curvePoints].sort((a, b) => a.position - b.position);

  const facInput = inputs.get('Factor') ?? inputs.get('Fac') ?? inputs.get('Value');

  const resultStream = new AttributeStream('Value', 'point', 'FLOAT', vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    const fac = facInput
      ? clampValue(getFloatInput(inputs, facInput.name, i, 0), 0, 1)
      : 0;

    // Find surrounding control points
    let lower = sorted[0];
    let upper = sorted[sorted.length - 1];

    for (let p = 0; p < sorted.length - 1; p++) {
      if (fac >= sorted[p].position && fac <= sorted[p + 1].position) {
        lower = sorted[p];
        upper = sorted[p + 1];
        break;
      }
    }

    const range = upper.position - lower.position;
    const t = range > 0 ? (fac - lower.position) / range : 0;

    // Smooth interpolation (cubic Hermite-like)
    const st = t * t * (3 - 2 * t);
    const value = lower.value + st * (upper.value - lower.value);

    resultStream.setFloat(i, value);
  }

  outputs.set('Value', resultStream);
  return outputs;
};

// ============================================================================
// 7. MapRange — ShaderNodeMapRange
// ============================================================================

/**
 * Map value from one range to another.
 * Properties: fromMin, fromMax, toMin, toMax, clamp, interpolationType
 */
const mapRangeExecutor: PerVertexExecutor = (
  inputs,
  props,
  _geometry,
  vertexCount,
) => {
  const outputs = new Map<string, AttributeStream>();

  const fromMin = (props.fromMin as number) ?? 0;
  const fromMax = (props.fromMax as number) ?? 1;
  const toMin = (props.toMin as number) ?? 0;
  const toMax = (props.toMax as number) ?? 1;
  const shouldClamp = (props.clamp as boolean) ?? true;
  const interpType = (props.interpolationType as string) ?? 'linear';

  const valueInput = inputs.get('Value') ?? inputs.get('Fac') ?? inputs.get('Factor');

  const resultStream = new AttributeStream('Result', 'point', 'FLOAT', vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    // Get inputs, allowing per-vertex overrides
    const value = valueInput ? valueInput.getFloat(i) : 0;
    const fMin = inputs.has('From Min') ? getFloatInput(inputs, 'From Min', i, fromMin) : fromMin;
    const fMax = inputs.has('From Max') ? getFloatInput(inputs, 'From Max', i, fromMax) : fromMax;
    const tMin = inputs.has('To Min') ? getFloatInput(inputs, 'To Min', i, toMin) : toMin;
    const tMax = inputs.has('To Max') ? getFloatInput(inputs, 'To Max', i, toMax) : toMax;

    // Compute normalized position in source range
    const fromRange = fMax - fMin;
    let t = fromRange !== 0 ? (value - fMin) / fromRange : 0;

    // Apply interpolation
    switch (interpType) {
      case 'stepped': {
        // Snap to nearest step
        const steps = Math.max(1, Math.round(tMax - tMin));
        t = Math.round(t * steps) / steps;
        break;
      }
      case 'smoothstep':
        t = t * t * (3 - 2 * t);
        break;
      case 'smootherstep':
        t = t * t * t * (t * (t * 6 - 15) + 10);
        break;
      case 'linear':
      default:
        break;
    }

    // Map to target range
    let result = tMin + t * (tMax - tMin);

    // Clamp if requested
    if (shouldClamp) {
      const minR = Math.min(tMin, tMax);
      const maxR = Math.max(tMin, tMax);
      result = clampValue(result, minR, maxR);
    }

    resultStream.setFloat(i, result);
  }

  outputs.set('Result', resultStream);
  return outputs;
};

// ============================================================================
// 8. Mapping — ShaderNodeMapping
// ============================================================================

/**
 * Transform vector (scale, rotate, translate).
 * Properties: vector_type (point/vector/texture), location, rotation, scale
 */
const mappingExecutor: PerVertexExecutor = (
  inputs,
  props,
  _geometry,
  vertexCount,
) => {
  const outputs = new Map<string, AttributeStream>();

  const vectorType = (props.vector_type as string) ?? 'point';

  // Properties provide defaults; inputs can override per-vertex
  const locX = (props.location?.[0] as number) ?? (props.locationX as number) ?? 0;
  const locY = (props.location?.[1] as number) ?? (props.locationY as number) ?? 0;
  const locZ = (props.location?.[2] as number) ?? (props.locationZ as number) ?? 0;

  const rotX = ((props.rotation?.[0] as number) ?? (props.rotationX as number) ?? 0) * (Math.PI / 180);
  const rotY = ((props.rotation?.[1] as number) ?? (props.rotationY as number) ?? 0) * (Math.PI / 180);
  const rotZ = ((props.rotation?.[2] as number) ?? (props.rotationZ as number) ?? 0) * (Math.PI / 180);

  const sclX = (props.scale?.[0] as number) ?? (props.scaleX as number) ?? 1;
  const sclY = (props.scale?.[1] as number) ?? (props.scaleY as number) ?? 1;
  const sclZ = (props.scale?.[2] as number) ?? (props.scaleZ as number) ?? 1;

  const vectorInput = inputs.get('Vector');

  const resultStream = new AttributeStream('Vector', 'point', 'VECTOR', vertexCount);

  // Precompute rotation matrix (Euler ZYX convention)
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);

  // R = Rz * Ry * Rx
  const m00 = cosZ * cosY;
  const m01 = cosZ * sinY * sinX - sinZ * cosX;
  const m02 = cosZ * sinY * cosX + sinZ * sinX;
  const m10 = sinZ * cosY;
  const m11 = sinZ * sinY * sinX + cosZ * cosX;
  const m12 = sinZ * sinY * cosX - cosZ * sinX;
  const m20 = -sinY;
  const m21 = cosY * sinX;
  const m22 = cosY * cosX;

  for (let i = 0; i < vertexCount; i++) {
    const v = getVectorInput(inputs, 'Vector', i, [0, 0, 0]);
    let x = v[0], y = v[1], z = v[2];

    // Apply scale
    x *= sclX;
    y *= sclY;
    z *= sclZ;

    // Apply rotation
    const rx = m00 * x + m01 * y + m02 * z;
    const ry = m10 * x + m11 * y + m12 * z;
    const rz = m20 * x + m21 * y + m22 * z;

    x = rx;
    y = ry;
    z = rz;

    // Apply translation (only for point/texture type)
    if (vectorType === 'point' || vectorType === 'texture') {
      x += locX;
      y += locY;
      z += locZ;
    }

    resultStream.setVector(i, [x, y, z]);
  }

  outputs.set('Vector', resultStream);
  return outputs;
};

// ============================================================================
// 9. TextureCoordinate — ShaderNodeTexCoord
// ============================================================================

/**
 * Output position/normal/UV as coordinate sources.
 * Properties: from_instancer (boolean, currently unused in per-vertex eval)
 */
const textureCoordinateExecutor: PerVertexExecutor = (
  _inputs,
  _props,
  geometry,
  vertexCount,
) => {
  const outputs = new Map<string, AttributeStream>();

  // Generated: use position (same as object position for now)
  const generatedStream = new AttributeStream('Generated', 'point', 'VECTOR', vertexCount);
  // Normal
  const normalStream = new AttributeStream('Normal', 'point', 'VECTOR', vertexCount);
  // UV
  const uvStream = new AttributeStream('UV', 'point', 'VECTOR', vertexCount);
  // Object (same as generated in local space)
  const objectStream = new AttributeStream('Object', 'point', 'VECTOR', vertexCount);
  // Camera (placeholder — would need camera transform)
  const cameraStream = new AttributeStream('Camera', 'point', 'VECTOR', vertexCount);
  // Window (placeholder — would need screen-space projection)
  const windowStream = new AttributeStream('Window', 'point', 'VECTOR', vertexCount);
  // Reflection (use normal as approximation)
  const reflectionStream = new AttributeStream('Reflection', 'point', 'VECTOR', vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    const pos = geometry.getPosition(i);
    const norm = geometry.getNormal(i);
    const uv = geometry.getUV(i);

    generatedStream.setVector(i, pos);
    normalStream.setVector(i, norm);
    uvStream.setVector(i, [uv[0], uv[1], 0]);
    objectStream.setVector(i, pos);

    // Camera: normalized position (approximation)
    const len = Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2]);
    const safeLen = len > 0.0001 ? len : 1;
    cameraStream.setVector(i, [
      pos[0] / safeLen,
      pos[1] / safeLen,
      -pos[2] / safeLen,
    ]);

    windowStream.setVector(i, [uv[0], uv[1], 0]);
    reflectionStream.setVector(i, norm);
  }

  outputs.set('Generated', generatedStream);
  outputs.set('Normal', normalStream);
  outputs.set('UV', uvStream);
  outputs.set('Object', objectStream);
  outputs.set('Camera', cameraStream);
  outputs.set('Window', windowStream);
  outputs.set('Reflection', reflectionStream);
  return outputs;
};

// ============================================================================
// 10. SeparateXYZ — ShaderNodeSeparateXYZ
// ============================================================================

/**
 * Split vec3 into X, Y, Z components.
 */
const separateXYZExecutor: PerVertexExecutor = (
  inputs,
  _props,
  _geometry,
  vertexCount,
) => {
  const outputs = new Map<string, AttributeStream>();

  const xStream = new AttributeStream('X', 'point', 'FLOAT', vertexCount);
  const yStream = new AttributeStream('Y', 'point', 'FLOAT', vertexCount);
  const zStream = new AttributeStream('Z', 'point', 'FLOAT', vertexCount);

  const vectorInput = inputs.get('Vector');

  for (let i = 0; i < vertexCount; i++) {
    const v = getVectorInput(inputs, 'Vector', i, [0, 0, 0]);
    xStream.setFloat(i, v[0]);
    yStream.setFloat(i, v[1]);
    zStream.setFloat(i, v[2]);
  }

  outputs.set('X', xStream);
  outputs.set('Y', yStream);
  outputs.set('Z', zStream);
  return outputs;
};

// ============================================================================
// 11. CombineXYZ — ShaderNodeCombineXYZ
// ============================================================================

/**
 * Combine X, Y, Z into a vec3.
 */
const combineXYZExecutor: PerVertexExecutor = (
  inputs,
  _props,
  _geometry,
  vertexCount,
) => {
  const outputs = new Map<string, AttributeStream>();

  const resultStream = new AttributeStream('Vector', 'point', 'VECTOR', vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    const x = getFloatInput(inputs, 'X', i, 0);
    const y = getFloatInput(inputs, 'Y', i, 0);
    const z = getFloatInput(inputs, 'Z', i, 0);
    resultStream.setVector(i, [x, y, z]);
  }

  outputs.set('Vector', resultStream);
  return outputs;
};

// ============================================================================
// 12. SeparateColor — ShaderNodeSeparateColor
// ============================================================================

/**
 * Split color into R, G, B, A.
 * Properties: mode (rgb/hsv/hsl — currently only RGB is implemented)
 */
const separateColorExecutor: PerVertexExecutor = (
  inputs,
  props,
  _geometry,
  vertexCount,
) => {
  const outputs = new Map<string, AttributeStream>();

  const mode = (props.mode as string) ?? 'rgb';

  const rStream = new AttributeStream('Red', 'point', 'FLOAT', vertexCount);
  const gStream = new AttributeStream('Green', 'point', 'FLOAT', vertexCount);
  const bStream = new AttributeStream('Blue', 'point', 'FLOAT', vertexCount);
  const aStream = new AttributeStream('Alpha', 'point', 'FLOAT', vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    const c = getColorInput(inputs, 'Color', i, { r: 0, g: 0, b: 0, a: 1 });

    if (mode === 'hsv') {
      // Convert RGB to HSV
      const max = Math.max(c.r, c.g, c.b);
      const min = Math.min(c.r, c.g, c.b);
      const d = max - min;
      const v = max;
      const s = max === 0 ? 0 : d / max;
      let h = 0;
      if (d !== 0) {
        if (max === c.r) h = ((c.g - c.b) / d + (c.g < c.b ? 6 : 0)) / 6;
        else if (max === c.g) h = ((c.b - c.r) / d + 2) / 6;
        else h = ((c.r - c.g) / d + 4) / 6;
      }
      rStream.setFloat(i, h);
      gStream.setFloat(i, s);
      bStream.setFloat(i, v);
    } else if (mode === 'hsl') {
      // Convert RGB to HSL
      const max = Math.max(c.r, c.g, c.b);
      const min = Math.min(c.r, c.g, c.b);
      const l = (max + min) / 2;
      const d = max - min;
      const s = d === 0 ? 0 : d / (l <= 0.5 ? 2 * l : 2 - 2 * l);
      let h = 0;
      if (d !== 0) {
        if (max === c.r) h = ((c.g - c.b) / d + (c.g < c.b ? 6 : 0)) / 6;
        else if (max === c.g) h = ((c.b - c.r) / d + 2) / 6;
        else h = ((c.r - c.g) / d + 4) / 6;
      }
      rStream.setFloat(i, h);
      gStream.setFloat(i, s);
      bStream.setFloat(i, l);
    } else {
      // RGB mode (default)
      rStream.setFloat(i, c.r);
      gStream.setFloat(i, c.g);
      bStream.setFloat(i, c.b);
    }

    aStream.setFloat(i, c.a);
  }

  outputs.set('Red', rStream);
  outputs.set('Green', gStream);
  outputs.set('Blue', bStream);
  outputs.set('Alpha', aStream);
  return outputs;
};

// ============================================================================
// 13. CombineColor — ShaderNodeCombineColor / FunctionNodeCombineColor
// ============================================================================

/**
 * Combine R, G, B, A into color.
 * Properties: mode (rgb/hsv/hsl — currently only RGB is implemented)
 */
const combineColorExecutor: PerVertexExecutor = (
  inputs,
  props,
  _geometry,
  vertexCount,
) => {
  const outputs = new Map<string, AttributeStream>();

  const mode = (props.mode as string) ?? 'rgb';

  const resultStream = new AttributeStream('Result', 'point', 'COLOR', vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    const rVal = getFloatInput(inputs, 'Red', i, 0);
    const gVal = getFloatInput(inputs, 'Green', i, 0);
    const bVal = getFloatInput(inputs, 'Blue', i, 0);
    const aVal = getFloatInput(inputs, 'Alpha', i, 1);

    if (mode === 'hsv') {
      // HSV to RGB
      const h = rVal;
      const s = gVal;
      const v = bVal;
      const i_h = Math.floor(h * 6);
      const f = h * 6 - i_h;
      const p = v * (1 - s);
      const q = v * (1 - f * s);
      const t = v * (1 - (1 - f) * s);
      let cr: number, cg: number, cb: number;
      switch (i_h % 6) {
        case 0: cr = v; cg = t; cb = p; break;
        case 1: cr = q; cg = v; cb = p; break;
        case 2: cr = p; cg = v; cb = t; break;
        case 3: cr = p; cg = q; cb = v; break;
        case 4: cr = t; cg = p; cb = v; break;
        case 5: cr = v; cg = p; cb = q; break;
        default: cr = v; cg = t; cb = p; break;
      }
      resultStream.setColor(i, { r: cr, g: cg, b: cb, a: aVal });
    } else if (mode === 'hsl') {
      // HSL to RGB
      const h = rVal;
      const s = gVal;
      const l = bVal;
      if (s === 0) {
        resultStream.setColor(i, { r: l, g: l, b: l, a: aVal });
      } else {
        const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p2 = 2 * l - q2;
        const hue2rgb = (p: number, q: number, t: number) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1 / 6) return p + (q - p) * 6 * t;
          if (t < 1 / 2) return q;
          if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
          return p;
        };
        resultStream.setColor(i, {
          r: hue2rgb(p2, q2, h + 1 / 3),
          g: hue2rgb(p2, q2, h),
          b: hue2rgb(p2, q2, h - 1 / 3),
          a: aVal,
        });
      }
    } else {
      // RGB mode (default)
      resultStream.setColor(i, { r: rVal, g: gVal, b: bVal, a: aVal });
    }
  }

  outputs.set('Result', resultStream);
  return outputs;
};

// ============================================================================
// Registration
// ============================================================================

/**
 * All terrain node executors, organized as [nodeTypeKey, executor] pairs.
 *
 * Each entry is registered under:
 *   - The canonical Blender-style name (e.g., 'ShaderNodeTexNoise')
 *   - The legacy NodeTypes enum value (e.g., 'TextureNoiseNode')
 */
const TERRAIN_EXECUTORS: [string, PerVertexExecutor][] = [
  // 1. NoiseTexture
  ['ShaderNodeTexNoise', noiseTextureExecutor],
  [String(NodeTypes.TextureNoise), noiseTextureExecutor],
  ['TextureNoiseNode', noiseTextureExecutor],

  // 2. MusgraveTexture
  ['ShaderNodeTexMusgrave', musgraveTextureExecutor],
  [String(NodeTypes.TextureMusgrave), musgraveTextureExecutor],
  ['TextureMusgraveNode', musgraveTextureExecutor],

  // 3. VoronoiTexture
  ['ShaderNodeTexVoronoi', voronoiTextureExecutor],
  [String(NodeTypes.TextureVoronoi), voronoiTextureExecutor],
  ['TextureVoronoiNode', voronoiTextureExecutor],

  // 4. WaveTexture
  ['ShaderNodeTexWave', waveTextureExecutor],
  [String(NodeTypes.TextureWave), waveTextureExecutor],
  ['TextureWaveNode', waveTextureExecutor],

  // 5. ColorRamp
  ['ShaderNodeValToRGB', colorRampExecutor],
  [String(NodeTypes.ColorRamp), colorRampExecutor],
  ['ColorRampNode', colorRampExecutor],

  // 6. FloatCurve
  ['ShaderNodeFloatCurve', floatCurveExecutor],
  [String(NodeTypes.FloatCurve), floatCurveExecutor],
  ['FloatCurveNode', floatCurveExecutor],

  // 7. MapRange
  ['ShaderNodeMapRange', mapRangeExecutor],
  [String(NodeTypes.MapRange), mapRangeExecutor],
  ['MapRangeNode', mapRangeExecutor],

  // 8. Mapping
  ['ShaderNodeMapping', mappingExecutor],
  [String(NodeTypes.Mapping), mappingExecutor],
  ['MappingNode', mappingExecutor],

  // 9. TextureCoordinate
  ['ShaderNodeTexCoord', textureCoordinateExecutor],
  [String(NodeTypes.TextureCoord), textureCoordinateExecutor],
  ['TextureCoordNode', textureCoordinateExecutor],
  ['TextureCoordinateNode', textureCoordinateExecutor],

  // 10. SeparateXYZ
  ['ShaderNodeSeparateXYZ', separateXYZExecutor],
  [String(NodeTypes.SeparateXYZ), separateXYZExecutor],
  ['SeparateXYZNode', separateXYZExecutor],

  // 11. CombineXYZ
  ['ShaderNodeCombineXYZ', combineXYZExecutor],
  [String(NodeTypes.CombineXYZ), combineXYZExecutor],
  ['CombineXYZNode', combineXYZExecutor],

  // 12. SeparateColor
  ['ShaderNodeSeparateColor', separateColorExecutor],
  [String(NodeTypes.SeparateColor), separateColorExecutor],
  ['SeparateColorNode', separateColorExecutor],

  // 13. CombineColor (ShaderNodeCombineColor)
  ['ShaderNodeCombineColor', combineColorExecutor],
  [String(NodeTypes.CombineColor), combineColorExecutor],
  ['CombineColorNode', combineColorExecutor],

  // 13b. CombineColor (FunctionNodeCombineColor variant)
  ['FunctionNodeCombineColor', combineColorExecutor],
  [String(NodeTypes.FunctionCombineColor), combineColorExecutor],
  ['FunctionCombineColor', combineColorExecutor],

  // 14. SurfaceKernel — evaluates a surface kernel node graph per-vertex
  ['TerrainNodeSurfaceKernel', surfaceKernelExecutor],
  ['SurfaceKernelNode', surfaceKernelExecutor],
  ['surface_kernel', surfaceKernelExecutor],

  // 15. TerrainAttribute — reads terrain-specific per-vertex attributes
  ['TerrainNodeAttribute', terrainAttributeExecutor],
  ['TerrainAttributeNode', terrainAttributeExecutor],
  ['terrain_attribute', terrainAttributeExecutor],

  // 16. TerrainMask — generates terrain selection masks
  ['TerrainNodeMask', terrainMaskExecutor],
  ['TerrainMaskNode', terrainMaskExecutor],
  ['terrain_mask', terrainMaskExecutor],

  // 17. TerrainBlend — blends materials based on terrain masks
  ['TerrainNodeBlend', terrainBlendExecutor],
  ['TerrainBlendNode', terrainBlendExecutor],
  ['terrain_blend', terrainBlendExecutor],
];

/**
 * Register all terrain node executors into the given registry map.
 *
 * This function is idempotent — calling it multiple times will simply
 * overwrite existing entries for the same node type keys.
 *
 * @param registry - The Map<string, PerVertexExecutor> to register into.
 *                   Typically the `perVertexExecutors` map from
 *                   `per-vertex-evaluator.ts`.
 */
export function registerTerrainNodeExecutors(
  registry: Map<string, PerVertexExecutor>,
): void {
  for (const [key, executor] of TERRAIN_EXECUTORS) {
    registry.set(key, executor);
  }
}

/**
 * Get all terrain executor entries as an array of [key, executor] pairs.
 * Useful for inspection or selective registration.
 */
export function getTerrainExecutorEntries(): [string, PerVertexExecutor][] {
  return [...TERRAIN_EXECUTORS];
}

/**
 * Individual executor exports for granular access or testing.
 */
export {
  noiseTextureExecutor,
  musgraveTextureExecutor,
  voronoiTextureExecutor,
  waveTextureExecutor,
  colorRampExecutor,
  floatCurveExecutor,
  mapRangeExecutor,
  mappingExecutor,
  textureCoordinateExecutor,
  separateXYZExecutor,
  combineXYZExecutor,
  separateColorExecutor,
  combineColorExecutor,
  surfaceKernelExecutor,
  terrainAttributeExecutor,
  terrainMaskExecutor,
  terrainBlendExecutor,
};
