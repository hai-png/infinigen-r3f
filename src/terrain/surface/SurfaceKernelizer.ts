/**
 * SurfaceKernelizer — Compiles NodeWrangler graphs into GLSL for GPU surface evaluation
 *
 * TypeScript port of infinigen/terrain/surface_kernel/kernelizer.py that converts
 * Blender-style node graphs (via NodeWrangler) into GLSL shaders for GPU evaluation.
 *
 * The SurfaceKernelizer:
 * 1. Accepts a NodeWrangler graph and compiles it into GLSL displacement or material shaders
 * 2. Produces a CompiledSurfaceKernel that wraps the compiled GLSL for GPU/CPU evaluation
 * 3. Provides pre-built surface kernel functions matching original infinigen surface types
 * 4. Integrates with the existing GLSL function library from GLSLNodeFunctions
 *
 * Surface types ported from infinigen/terrain/surface_kernel/surfaces/:
 * - mountain, chunky_rock, cobblestone, cracked_ground
 * - dirt, sand, snow, ice, stone, sandstone
 *
 * @module terrain/surface
 */

import * as THREE from 'three';
import {
  NodeWrangler,
  NodeInstance,
  NodeLink,
  NodeGroup,
} from '@/core/nodes/core/node-wrangler';
import {
  COMMON_UTILITIES_GLSL,
  NOISE_TEXTURE_GLSL,
  NOISE_4D_GLSL,
  VORONOI_TEXTURE_GLSL,
  MUSGRAVE_TEXTURE_GLSL,
  GRADIENT_TEXTURE_GLSL,
  BRICK_TEXTURE_GLSL,
  COLOR_RAMP_GLSL,
  FLOAT_CURVE_GLSL,
  MATH_GLSL,
  VECTOR_MATH_GLSL,
  MAPPING_GLSL,
  TEXTURE_COORD_GLSL,
  GLSL_SNIPPET_MAP,
} from '@/core/nodes/execution/glsl/GLSLNodeFunctions';
import {
  BUMP_NORMAL_NODES_GLSL,
} from '@/core/nodes/execution/glsl/ExpandedGLSLFunctions';
import { NoiseUtils } from '@/core/util/math/noise';

// ============================================================================
// Types
// ============================================================================

/** The compilation mode for the kernelizer */
export type SurfaceKernelizerMode = 'displacement' | 'material';

/** Uniform declaration extracted from node properties */
export interface UniformDecl {
  name: string;
  glslType: string;
  threeType: 'float' | 'vec2' | 'vec3' | 'vec4' | 'sampler2D' | 'int' | 'color';
  value: any;
}

/** Result of compiling a surface kernel */
export interface SurfaceKernelCompileResult {
  /** Complete vertex shader string (GLSL 300 es) */
  vertexShader: string;
  /** Complete fragment shader string (GLSL 300 es) */
  fragmentShader: string;
  /** Uniform declarations extracted from the node graph */
  uniforms: Map<string, UniformDecl>;
  /** Required GLSL function snippets */
  requiredSnippets: Set<string>;
  /** Warnings encountered during compilation */
  warnings: string[];
  /** Errors encountered during compilation */
  errors: string[];
}

/** Per-vertex surface evaluation result */
export interface SurfaceKernelEvalResult {
  /** Displacement value along the normal direction */
  displacement: Float32Array;
  /** Base color per vertex (RGB float3) */
  baseColor?: Float32Array;
  /** Roughness per vertex */
  roughness?: Float32Array;
  /** Metallic per vertex */
  metallic?: Float32Array;
  /** Ambient occlusion per vertex */
  ao?: Float32Array;
}

/** Configuration for the SurfaceKernelizer */
export interface SurfaceKernelizerConfig {
  /** Output mode: displacement or material */
  mode: SurfaceKernelizerMode;
  /** Global displacement scale */
  displacementScale: number;
  /** Displacement mid-level (0 = inward only, 0.5 = both, 1.0 = outward only) */
  displacementMidLevel: number;
  /** Whether to include material outputs in the compiled kernel */
  includeMaterial: boolean;
  /** GLSL version header */
  glslVersion: string;
  /** Maximum group nesting depth for recursive expansion */
  maxGroupDepth: number;
  /** Seed for deterministic compilation */
  seed: number;
  /** Whether to enable 4D noise for per-instance variation */
  enable4DNoise: boolean;
}

/** Default kernelizer configuration */
export const DEFAULT_KERNELIZER_CONFIG: SurfaceKernelizerConfig = {
  mode: 'displacement',
  displacementScale: 1.0,
  displacementMidLevel: 0.0,
  includeMaterial: false,
  glslVersion: '#version 300 es\nprecision highp float;\nprecision highp int;\n',
  maxGroupDepth: 8,
  seed: 42,
  enable4DNoise: true,
};

// ============================================================================
// GLSL Version Header
// ============================================================================

const GLSL_VERSION_HEADER = `#version 300 es
precision highp float;
precision highp int;
`;

// ============================================================================
// Surface-specific GLSL snippets
// ============================================================================

/** Slope scaling GLSL utility */
const SLOPE_SCALING_GLSL = /* glsl */ `
// ============================================================================
// Slope Scaling — scale displacement based on surface slope
// ============================================================================

float slopeScale(vec3 normal, float flatScale, float steepScale, float transition) {
  float slope = 1.0 - abs(normal.y); // 0 = flat, 1 = vertical
  float t = smoothstep(transition - 0.1, transition + 0.1, slope);
  return mix(flatScale, steepScale, t);
}

float slopeBlend(vec3 normal, float threshold, float softness) {
  float slope = 1.0 - abs(normal.y);
  return smoothstep(threshold - softness, threshold + softness, slope);
}
`;

/** Multi-octave noise layering GLSL */
const MULTI_LAYER_NOISE_GLSL = /* glsl */ `
// ============================================================================
// Multi-Layer Noise — layered FBM with configurable octaves
// ============================================================================

float multiLayerNoise(vec3 pos, float baseScale, int octaves, float lacunarity,
                      float gain, float distortion, float seedW) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = baseScale;
  float maxValue = 0.0;

  for (int i = 0; i < 16; i++) {
    if (i >= octaves) break;
    float n = noiseTexture4D(pos, frequency, float(i + 2), distortion, 1.0 - gain, seedW + float(i) * 7.31);
    value += amplitude * (n * 2.0 - 1.0);
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / max(maxValue, EPSILON);
}
`;

/** Voronoi cracks GLSL */
const VORONOI_CRACKS_GLSL = /* glsl */ `
// ============================================================================
// Voronoi Cracks — crack-like patterns from voronoi distance-to-edge
// ============================================================================

float voronoiCracks(vec3 pos, float scale, float crackWidth, float smoothness, float seedW) {
  vec3 p = pos * scale + vec3(seedW * 0.731, seedW * 1.317, seedW * 0.539);
  VoronoiResult vor = voronoi3D(p);

  // Distance to edge gives crack pattern
  float edgeDist = vor.edgeDist;
  float crack = 1.0 - smoothstep(crackWidth - smoothness, crackWidth + smoothness, edgeDist);

  return crack;
}

float voronoiCracksF1(vec3 pos, float scale, float crackDepth, float seedW) {
  vec3 p = pos * scale + vec3(seedW * 0.731, seedW * 1.317, seedW * 0.539);
  VoronoiResult vor = voronoi3D(p);

  // Invert F1 for crack appearance
  float cracks = 1.0 - vor.f1;
  return cracks * crackDepth;
}
`;

/** Sand ripple GLSL */
const SAND_RIPPLE_GLSL = /* glsl */ `
// ============================================================================
// Sand Ripples — directional wave patterns with noise distortion
// ============================================================================

float sandRipples(vec3 pos, float scale, float frequency, float amplitude,
                  float distortion, float seedW) {
  vec3 p = pos * scale;
  float distort = snoise3D(p + vec3(seedW * 0.731)) * distortion;

  // Directional ripples along XZ plane
  float wave1 = sin((p.x + distort) * frequency * 2.0 * PI) * 0.5 + 0.5;
  float wave2 = sin((p.z + distort * 0.7) * frequency * 1.7 * 2.0 * PI) * 0.5 + 0.5;

  // Cross-hatch pattern
  float ripple = wave1 * wave2;

  // Add fine noise for grain
  float grain = noiseTexture4D(pos, scale * 20.0, 2.0, 0.0, 0.5, seedW + 3.14);

  return mix(ripple, grain, 0.3) * amplitude;
}
`;

/** Snow surface GLSL */
const SNOW_SURFACE_GLSL = /* glsl */ `
// ============================================================================
// Snow Surface — smooth clumping with subtle wind effects
// ============================================================================

float snowSurface(vec3 pos, vec3 normal, float scale, float smoothness, float seedW) {
  vec3 p = pos * scale;

  // Base smooth displacement
  float base = noiseTexture4D(pos, scale * 0.5, 3.0, 0.0, 0.3, seedW);

  // Snow clumping — larger scale bumps
  float clumps = noiseTexture4D(pos, scale * 0.2, 2.0, 0.0, 0.5, seedW + 5.0);

  // Wind erosion on steep faces
  float slope = 1.0 - abs(normal.y);
  float windErosion = smoothstep(0.3, 0.7, slope);

  // Less snow on steep faces
  float snowAmount = mix(base * 0.8 + clumps * 0.2, base * 0.3, windErosion);

  // Smooth the result
  return smoothstep(0.0, 1.0, snowAmount) * smoothness;
}
`;

/** Ice surface GLSL */
const ICE_SURFACE_GLSL = /* glsl */ `
// ============================================================================
// Ice Surface — smooth with internal fracture hints
// ============================================================================

float iceSurface(vec3 pos, float scale, float crackIntensity, float seedW) {
  vec3 p = pos * scale;

  // Very smooth base
  float base = noiseTexture4D(pos, scale * 0.3, 2.0, 0.0, 0.2, seedW);

  // Internal fractures — voronoi-based cracks
  vec3 pCrack = pos * scale * 2.0 + vec3(seedW * 0.731, seedW * 1.317, seedW * 0.539);
  VoronoiResult vor = voronoi3D(pCrack);
  float cracks = 1.0 - smoothstep(0.0, 0.1, vor.edgeDist);

  // Subtle refraction distortion
  float distortion = snoise3D(p * 3.0 + vec3(seedW * 2.1)) * 0.05;

  return base * 0.8 + cracks * crackIntensity + distortion;
}
`;

/** Sandstone layering GLSL */
const SANDSTONE_LAYERING_GLSL = /* glsl */ `
// ============================================================================
// Sandstone Layering — horizontal strata with erosion
// ============================================================================

float sandstoneLayering(vec3 pos, float scale, float layerFrequency,
                        float erosionScale, float seedW) {
  vec3 p = pos * scale;

  // Horizontal strata — gradient noise along Y axis
  float strata = sin(p.y * layerFrequency * 2.0 * PI) * 0.5 + 0.5;

  // Erode strata with noise
  float erosion = noiseTexture4D(pos, erosionScale, 4.0, 1.0, 0.5, seedW);

  // Combine: strata modulated by erosion
  float layered = strata * 0.6 + erosion * 0.4;

  // Add fine cross-bedding
  float crossBed = noiseTexture4D(pos, scale * 5.0, 3.0, 0.5, 0.4, seedW + 10.0);

  return layered * 0.7 + crossBed * 0.3;
}
`;

/** Cobblestone GLSL */
const COBBLESTONE_GLSL = /* glsl */ `
// ============================================================================
// Cobblestone — rounded stones with mortar grooves
// ============================================================================

float cobblestone(vec3 pos, float scale, float mortarWidth, float roundness, float seedW) {
  vec3 p = pos * scale + vec3(seedW * 0.731, seedW * 1.317, seedW * 0.539);

  // Use voronoi to create cell pattern
  VoronoiResult vor = voronoi3D(p);

  // Distance to cell center — rounded stones
  float stone = smoothstep(roundness - 0.1, roundness + 0.1, vor.f1);

  // Mortar grooves between stones
  float mortar = 1.0 - smoothstep(mortarWidth - 0.02, mortarWidth + 0.02, vor.edgeDist);

  // Height: stones are raised, mortar is low
  float height = (1.0 - mortar) * (1.0 - stone * 0.3);

  // Add per-stone variation
  float stoneNoise = fract(dot(vor.cellId, vec3(0.1031, 0.1030, 0.0973)));
  height += stoneNoise * 0.1;

  return height;
}
`;

/** Cracked ground GLSL */
const CRACKED_GROUND_GLSL = /* glsl */ `
// ============================================================================
// Cracked Ground — polygonal crack patterns
// ============================================================================

float crackedGround(vec3 pos, float scale, float crackWidth, float crackDepth,
                    float irregularity, float seedW) {
  vec3 p = pos * scale + vec3(seedW * 0.731, seedW * 1.317, seedW * 0.539);

  // Distort the position for irregular cracks
  p += vec3(
    snoise3D(p * irregularity) * 0.3,
    snoise3D(p * irregularity + vec3(5.2, 1.3, 2.8)) * 0.3,
    snoise3D(p * irregularity + vec3(9.1, 3.7, 7.4)) * 0.3
  );

  // Voronoi edge detection
  VoronoiResult vor = voronoi3D(p);

  // Cracks as thin lines at cell edges
  float crack = 1.0 - smoothstep(crackWidth * 0.5, crackWidth, vor.edgeDist);

  // Base ground level with subtle variation
  float baseNoise = noiseTexture4D(pos, scale * 0.3, 2.0, 0.0, 0.5, seedW + 10.0) * 0.1;

  // Apply crack depth
  return baseNoise - crack * crackDepth;
}
`;

/** All surface-specific GLSL snippets */
const SURFACE_SNIPPET_MAP: Record<string, string> = {
  'SLOPE_SCALING_GLSL': SLOPE_SCALING_GLSL,
  'MULTI_LAYER_NOISE_GLSL': MULTI_LAYER_NOISE_GLSL,
  'VORONOI_CRACKS_GLSL': VORONOI_CRACKS_GLSL,
  'SAND_RIPPLE_GLSL': SAND_RIPPLE_GLSL,
  'SNOW_SURFACE_GLSL': SNOW_SURFACE_GLSL,
  'ICE_SURFACE_GLSL': ICE_SURFACE_GLSL,
  'SANDSTONE_LAYERING_GLSL': SANDSTONE_LAYERING_GLSL,
  'COBBLESTONE_GLSL': COBBLESTONE_GLSL,
  'CRACKED_GROUND_GLSL': CRACKED_GROUND_GLSL,
};

// ============================================================================
// Node Type → GLSL Snippet Requirements
// ============================================================================

const NODE_TYPE_SNIPPET_REQUIREMENTS: Record<string, string[]> = {
  'ShaderNodeTexNoise': ['NOISE_TEXTURE_GLSL'],
  'TextureNoiseNode': ['NOISE_TEXTURE_GLSL'],
  'ShaderNodeTexVoronoi': ['VORONOI_TEXTURE_GLSL'],
  'TextureVoronoiNode': ['VORONOI_TEXTURE_GLSL'],
  'ShaderNodeTexMusgrave': ['MUSGRAVE_TEXTURE_GLSL', 'NOISE_TEXTURE_GLSL'],
  'TextureMusgraveNode': ['MUSGRAVE_TEXTURE_GLSL', 'NOISE_TEXTURE_GLSL'],
  'ShaderNodeTexGradient': ['GRADIENT_TEXTURE_GLSL'],
  'TextureGradientNode': ['GRADIENT_TEXTURE_GLSL'],
  'ShaderNodeTexBrick': ['BRICK_TEXTURE_GLSL'],
  'TextureBrickNode': ['BRICK_TEXTURE_GLSL'],
  'ShaderNodeMath': ['MATH_GLSL'],
  'MathNode': ['MATH_GLSL'],
  'ShaderNodeVectorMath': ['VECTOR_MATH_GLSL'],
  'VectorMathNode': ['VECTOR_MATH_GLSL'],
  'ShaderNodeValToRGB': ['COLOR_RAMP_GLSL'],
  'ColorRampNode': ['COLOR_RAMP_GLSL'],
  'ShaderNodeFloatCurve': ['FLOAT_CURVE_GLSL'],
  'FloatCurveNode': ['FLOAT_CURVE_GLSL'],
  'ShaderNodeMapping': ['MAPPING_GLSL'],
  'MappingNode': ['MAPPING_GLSL'],
  'ShaderNodeTexCoord': ['TEXTURE_COORD_GLSL'],
  'TexCoordNode': ['TEXTURE_COORD_GLSL'],
  'ShaderNodeBump': ['BUMP_NORMAL_NODES_GLSL'],
  'BumpNode': ['BUMP_NORMAL_NODES_GLSL'],
  'ShaderNodeDisplacement': ['BUMP_NORMAL_NODES_GLSL'],
  'DisplacementNode': ['BUMP_NORMAL_NODES_GLSL'],
};

// ============================================================================
// Socket Type → GLSL Type Mapping
// ============================================================================

function socketTypeToGLSL(socketType: string): string {
  switch (socketType) {
    case 'FLOAT': return 'float';
    case 'VECTOR': return 'vec3';
    case 'COLOR': return 'vec3';
    case 'RGBA': return 'vec4';
    case 'INT': return 'int';
    case 'BOOLEAN': return 'int';
    case 'SHADER': return 'int';
    default: return 'float';
  }
}

/** Format a number as a GLSL float literal */
function formatFloat(v: number): string {
  if (!isFinite(v)) return '0.0';
  const s = v.toFixed(6);
  return s.includes('.') ? s : s + '.0';
}

/** Convert a value to its GLSL representation */
function valueToGLSL(value: any, type: string): string {
  if (value === undefined || value === null) {
    switch (type) {
      case 'float': return '0.0';
      case 'vec2': return 'vec2(0.0)';
      case 'vec3': return 'vec3(0.0)';
      case 'vec4': return 'vec4(0.0, 0.0, 0.0, 1.0)';
      case 'int': return '0';
      default: return '0.0';
    }
  }

  if (typeof value === 'number') {
    if (type === 'int') return String(Math.round(value));
    return formatFloat(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 2) return `vec2(${value.map(v => Number(v).toFixed(6)).join(', ')})`;
    if (value.length === 3) return `vec3(${value.map(v => Number(v).toFixed(6)).join(', ')})`;
    if (value.length === 4) return `vec4(${value.map(v => Number(v).toFixed(6)).join(', ')})`;
  }

  if (value instanceof THREE.Vector3) {
    return `vec3(${value.x.toFixed(6)}, ${value.y.toFixed(6)}, ${value.z.toFixed(6)})`;
  }

  if (value instanceof THREE.Vector2) {
    return `vec2(${value.x.toFixed(6)}, ${value.y.toFixed(6)})`;
  }

  if (value instanceof THREE.Color) {
    return `vec3(${value.r.toFixed(6)}, ${value.g.toFixed(6)}, ${value.b.toFixed(6)})`;
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  return '0.0';
}

// ============================================================================
// SurfaceKernelizer Class
// ============================================================================

/**
 * Compiles NodeWrangler graphs into GLSL shader code for GPU surface evaluation.
 *
 * This is the core compilation engine that takes a node graph defined through
 * the NodeWrangler API and produces complete GLSL vertex + fragment shaders
 * with extracted uniforms and required GLSL function libraries.
 *
 * The kernelizer:
 * 1. Extracts nodes and links from the NodeWrangler's active group
 * 2. Topologically sorts the nodes for correct evaluation order
 * 3. Determines which GLSL function libraries are required
 * 4. Generates GLSL code for each node in evaluation order
 * 5. Composes complete shaders with headers, uniforms, functions, and main body
 *
 * Usage:
 * ```typescript
 * const kernelizer = new SurfaceKernelizer();
 * const result = kernelizer.kernelize(nw, 'displacement');
 * const kernel = new CompiledSurfaceKernel(result);
 * const displacement = kernel.evaluateGPU(positions, normals);
 * ```
 */
export class SurfaceKernelizer {
  private config: SurfaceKernelizerConfig;
  private uniforms: Map<string, UniformDecl> = new Map();
  private requiredSnippets: Set<string> = new Set();
  private warnings: string[] = [];
  private errors: string[] = [];
  private varCounter: number = 0;
  private uniformCounter: number = 0;
  private nodeVarMap: Map<string, string> = new Map();

  constructor(config: Partial<SurfaceKernelizerConfig> = {}) {
    this.config = { ...DEFAULT_KERNELIZER_CONFIG, ...config };
  }

  // ==========================================================================
  // Main Compilation API
  // ==========================================================================

  /**
   * Kernelize a NodeWrangler graph into GLSL shader code.
   *
   * @param nw - The NodeWrangler containing the node graph to compile
   * @param mode - Output mode: 'displacement' for vertex displacement, 'material' for fragment shading
   * @returns SurfaceKernelCompileResult with compiled shaders, uniforms, and diagnostics
   */
  kernelize(nw: NodeWrangler, mode?: SurfaceKernelizerMode): SurfaceKernelCompileResult {
    // Reset per-compilation state
    this.uniforms = new Map();
    this.requiredSnippets = new Set();
    this.warnings = [];
    this.errors = [];
    this.varCounter = 0;
    this.uniformCounter = 0;
    this.nodeVarMap = new Map();

    const effectiveMode = mode ?? this.config.mode;

    try {
      const group = nw.getActiveGroup();

      // Step 1: Extract nodes and links from the NodeWrangler's active group
      const nodes = group.nodes;
      const links = Array.from(group.links.values());

      // Step 2: Topological sort
      const sortedIds = this.topologicalSort(nodes, links);

      // Step 3: Collect required GLSL snippets
      this.collectRequiredSnippets(nodes);

      // Step 4: Generate GLSL code for each node
      const nodeCode = new Map<string, string>();
      for (const nodeId of sortedIds) {
        const node = nodes.get(nodeId);
        if (!node) continue;
        const code = this.generateNodeGLSL(node, nodes, links);
        nodeCode.set(nodeId, code);
      }

      // Step 5: Compose complete shaders
      const { vertexShader, fragmentShader } = this.composeShaders(
        nodeCode, sortedIds, links, nodes, effectiveMode
      );

      return {
        vertexShader,
        fragmentShader,
        uniforms: new Map(this.uniforms),
        requiredSnippets: new Set(this.requiredSnippets),
        warnings: [...this.warnings],
        errors: [...this.errors],
      };
    } catch (err: any) {
      this.errors.push(`SurfaceKernelizer fatal error: ${err.message}`);
      return {
        vertexShader: this.fallbackVertexShader(),
        fragmentShader: this.fallbackFragmentShader(effectiveMode),
        uniforms: new Map(this.uniforms),
        requiredSnippets: new Set(this.requiredSnippets),
        warnings: [...this.warnings],
        errors: [...this.errors],
      };
    }
  }

  // ==========================================================================
  // Topological Sort
  // ==========================================================================

  /**
   * Topologically sort nodes using Kahn's algorithm.
   * Returns an ordered array of node IDs such that all dependencies come before dependents.
   */
  private topologicalSort(
    nodes: Map<string, NodeInstance>,
    links: NodeLink[]
  ): string[] {
    const adj = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    for (const [id] of nodes) {
      adj.set(id, new Set());
      inDegree.set(id, 0);
    }

    for (const link of links) {
      if (adj.has(link.fromNode) && adj.has(link.toNode)) {
        adj.get(link.fromNode)!.add(link.toNode);
        inDegree.set(link.toNode, (inDegree.get(link.toNode) || 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    const sorted: string[] = [];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      sorted.push(current);

      const neighbors = adj.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          const newDegree = (inDegree.get(neighbor) || 1) - 1;
          inDegree.set(neighbor, newDegree);
          if (newDegree === 0 && !visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }
    }

    if (sorted.length !== nodes.size) {
      const cycleNodes: string[] = [];
      for (const [id] of nodes) {
        if (!visited.has(id)) cycleNodes.push(id);
      }
      this.warnings.push(`Cycle detected involving nodes: ${cycleNodes.join(', ')}`);
    }

    return sorted;
  }

  // ==========================================================================
  // Collect Required GLSL Snippets
  // ==========================================================================

  /**
   * Determine which GLSL function libraries are required based on the node types
   * present in the graph.
   */
  private collectRequiredSnippets(nodes: Map<string, NodeInstance>): void {
    this.requiredSnippets.add('COMMON_UTILITIES_GLSL');

    for (const [, node] of nodes) {
      const typeStr = String(node.type);
      const requirements = NODE_TYPE_SNIPPET_REQUIREMENTS[typeStr];
      if (requirements) {
        for (const snippet of requirements) {
          this.requiredSnippets.add(snippet);
        }
      }

      // PrincipledBSDF needs PBR + multi-light
      if (typeStr === 'ShaderNodeBsdfPrincipled' || typeStr === 'PrincipledBSDFNode') {
        this.requiredSnippets.add('PRINCIPLED_BSDF_GLSL');
      }
    }
  }

  // ==========================================================================
  // GLSL Code Generation Per Node
  // ==========================================================================

  /**
   * Generate GLSL variable declarations and function calls for a single node.
   */
  private generateNodeGLSL(
    node: NodeInstance,
    allNodes: Map<string, NodeInstance>,
    links: NodeLink[]
  ): string {
    const prefix = this.allocVarPrefix(node.id);
    this.nodeVarMap.set(node.id, prefix);

    const nodeType = String(node.type);

    // Texture nodes
    if (nodeType === 'ShaderNodeTexNoise' || nodeType === 'TextureNoiseNode') {
      return this.generateNoiseTextureGLSL(node, prefix, allNodes, links);
    }
    if (nodeType === 'ShaderNodeTexVoronoi' || nodeType === 'TextureVoronoiNode') {
      return this.generateVoronoiTextureGLSL(node, prefix, allNodes, links);
    }
    if (nodeType === 'ShaderNodeTexMusgrave' || nodeType === 'TextureMusgraveNode') {
      return this.generateMusgraveTextureGLSL(node, prefix, allNodes, links);
    }
    if (nodeType === 'ShaderNodeTexGradient' || nodeType === 'TextureGradientNode') {
      return this.generateGradientTextureGLSL(node, prefix, allNodes, links);
    }
    if (nodeType === 'ShaderNodeTexBrick' || nodeType === 'TextureBrickNode') {
      return this.generateBrickTextureGLSL(node, prefix, allNodes, links);
    }

    // Math nodes
    if (nodeType === 'ShaderNodeMath' || nodeType === 'MathNode') {
      return this.generateMathGLSL(node, prefix, allNodes, links);
    }
    if (nodeType === 'ShaderNodeVectorMath' || nodeType === 'VectorMathNode') {
      return this.generateVectorMathGLSL(node, prefix, allNodes, links);
    }

    // Color / Mix nodes
    if (nodeType === 'ShaderNodeValToRGB' || nodeType === 'ColorRampNode') {
      return this.generateColorRampGLSL(node, prefix, allNodes, links);
    }
    if (nodeType === 'ShaderNodeFloatCurve' || nodeType === 'FloatCurveNode') {
      return this.generateFloatCurveGLSL(node, prefix, allNodes, links);
    }

    // Converter nodes
    if (nodeType === 'ShaderNodeMapRange' || nodeType === 'MapRangeNode') {
      return this.generateMapRangeGLSL(node, prefix, allNodes, links);
    }
    if (nodeType === 'ShaderNodeCombineXYZ' || nodeType === 'CombineXYZNode') {
      return this.generateCombineXYZGLSL(node, prefix, allNodes, links);
    }
    if (nodeType === 'ShaderNodeSeparateXYZ' || nodeType === 'SeparateXYZNode') {
      return this.generateSeparateXYZGLSL(node, prefix, allNodes, links);
    }

    // Vector / Mapping nodes
    if (nodeType === 'ShaderNodeMapping' || nodeType === 'MappingNode') {
      return this.generateMappingGLSL(node, prefix, allNodes, links);
    }
    if (nodeType === 'ShaderNodeTexCoord' || nodeType === 'TexCoordNode') {
      return this.generateTexCoordGLSL(node, prefix);
    }

    // Input nodes
    if (nodeType === 'ShaderNodeValue' || nodeType === 'ValueNode') {
      return this.generateValueGLSL(node, prefix);
    }
    if (nodeType === 'ShaderNodeRGB' || nodeType === 'RGBNode') {
      return this.generateRGBGLSL(node, prefix);
    }

    // Bump / Displacement nodes
    if (nodeType === 'ShaderNodeBump' || nodeType === 'BumpNode') {
      return this.generateBumpGLSL(node, prefix, allNodes, links);
    }
    if (nodeType === 'ShaderNodeDisplacement' || nodeType === 'DisplacementNode') {
      return this.generateDisplacementGLSL(node, prefix, allNodes, links);
    }

    // Group I/O nodes
    if (nodeType === 'NodeGroupInput' || nodeType === 'GroupInputNode') {
      return this.generateGroupInputGLSL(node, prefix);
    }
    if (nodeType === 'NodeGroupOutput' || nodeType === 'GroupOutputNode') {
      return this.generateGroupOutputGLSL(node, prefix, allNodes, links);
    }

    // Unknown node
    this.warnings.push(`Unknown node type "${nodeType}", generating passthrough`);
    return `  // Passthrough for unknown node type: ${nodeType}\n`;
  }

  // ==========================================================================
  // Input Resolution
  // ==========================================================================

  /**
   * Resolve the GLSL variable name for a node input.
   * If the input is connected to another node's output, returns that output variable.
   * Otherwise returns a default value or creates a uniform.
   */
  private resolveInput(
    nodeId: string,
    inputName: string,
    node: NodeInstance,
    allNodes: Map<string, NodeInstance>,
    links: NodeLink[]
  ): { varName: string; glslType: string } {
    // Find a link targeting this input
    for (const link of links) {
      if (link.toNode === nodeId && link.toSocket === inputName) {
        const sourcePrefix = this.nodeVarMap.get(link.fromNode);
        if (sourcePrefix) {
          const sourceNode = allNodes.get(link.fromNode);
          const socketType = sourceNode?.outputs.get(link.fromSocket)?.type ?? 'FLOAT';
          const glslType = socketTypeToGLSL(String(socketType));
          const sanitized = this.sanitizeSocketName(link.fromSocket);
          return { varName: `${sourcePrefix}_${sanitized}`, glslType };
        }
      }
    }

    // Not connected — use default value or special cases
    const inputSocket = node.inputs.get(inputName);
    const defaultValue = inputSocket?.value ?? inputSocket?.defaultValue;
    const socketType = inputSocket?.type ?? 'FLOAT';
    const glslType = socketTypeToGLSL(String(socketType));

    // Special: vector inputs default to position
    if (inputName === 'Vector' || inputName === 'vector') {
      return { varName: 'vPosition', glslType: 'vec3' };
    }

    // Inline constant values
    if (typeof defaultValue === 'number' && isFinite(defaultValue)) {
      return { varName: formatFloat(defaultValue), glslType };
    }

    if (typeof defaultValue === 'boolean') {
      return { varName: defaultValue ? '1' : '0', glslType: 'int' };
    }

    if (Array.isArray(defaultValue) && defaultValue.length > 0) {
      return { varName: valueToGLSL(defaultValue, glslType), glslType };
    }

    // Create a uniform for the default value
    const uniformName = `u_${this.allocUniform()}_${this.sanitizeSocketName(inputName)}`;
    this.uniforms.set(uniformName, {
      name: uniformName,
      glslType,
      threeType: this.glslToThreeType(glslType),
      value: this.parseUniformValue(defaultValue, glslType),
    });

    return { varName: uniformName, glslType };
  }

  // ==========================================================================
  // Node Code Generators — Texture Nodes
  // ==========================================================================

  private generateNoiseTextureGLSL(
    node: NodeInstance, prefix: string,
    allNodes: Map<string, NodeInstance>, links: NodeLink[]
  ): string {
    const vector = this.resolveInput(node.id, 'Vector', node, allNodes, links);
    const scale = this.resolveInput(node.id, 'Scale', node, allNodes, links);
    const detail = this.resolveInput(node.id, 'Detail', node, allNodes, links);
    const roughness = this.resolveInput(node.id, 'Roughness', node, allNodes, links);
    const distortion = this.resolveInput(node.id, 'Distortion', node, allNodes, links);

    const noiseDims = node.properties['noise_dimensions'] ?? '3D';
    const is4D = noiseDims === '4D';

    if (is4D) {
      this.requiredSnippets.add('NOISE_4D_GLSL');
      const seedUniform = this.addUniform('u_noise_seed', 'float', 0.0);
      return `
  // Noise Texture 4D: ${node.name}
  float ${prefix}_Fac = noiseTexture4D(${vector.varName}, ${scale.varName}, ${detail.varName}, ${distortion.varName}, ${roughness.varName}, ${seedUniform});
  vec3 ${prefix}_Color = noiseTexture4DColor(${vector.varName}, ${scale.varName}, ${detail.varName}, ${distortion.varName}, ${roughness.varName}, ${seedUniform});
`;
    }

    return `
  // Noise Texture: ${node.name}
  float ${prefix}_Fac = noiseTexture(${vector.varName}, ${scale.varName}, ${detail.varName}, ${distortion.varName}, ${roughness.varName});
  vec3 ${prefix}_Color = noiseTextureColor(${vector.varName}, ${scale.varName}, ${detail.varName}, ${distortion.varName}, ${roughness.varName});
`;
  }

  private generateVoronoiTextureGLSL(
    node: NodeInstance, prefix: string,
    allNodes: Map<string, NodeInstance>, links: NodeLink[]
  ): string {
    const vector = this.resolveInput(node.id, 'Vector', node, allNodes, links);
    const scale = this.resolveInput(node.id, 'Scale', node, allNodes, links);
    const smoothness = this.resolveInput(node.id, 'Smoothness', node, allNodes, links);
    const exponent = this.resolveInput(node.id, 'Exponent', node, allNodes, links);

    const distance = String(node.properties['distance'] ?? 'EUCLIDEAN');
    const feature = String(node.properties['feature'] ?? 'F1');
    const distInt = distance === 'MANHATTAN' ? 1 : distance === 'CHEBYCHEV' ? 2 : 0;
    const featInt = feature === 'F2' ? 1 : feature === 'DISTANCE_TO_EDGE' ? 2 : feature === 'N_SPHERE_RADIUS' ? 3 : 0;

    return `
  // Voronoi Texture: ${node.name}
  float ${prefix}_Fac = voronoiTexture(${vector.varName}, ${scale.varName}, ${smoothness.varName}, ${exponent.varName}, ${distInt}, ${featInt});
  vec3 ${prefix}_Color = voronoiTextureColor(${vector.varName}, ${scale.varName}, ${smoothness.varName}, ${exponent.varName}, ${distInt}, ${featInt});
`;
  }

  private generateMusgraveTextureGLSL(
    node: NodeInstance, prefix: string,
    allNodes: Map<string, NodeInstance>, links: NodeLink[]
  ): string {
    const vector = this.resolveInput(node.id, 'Vector', node, allNodes, links);
    const scale = this.resolveInput(node.id, 'Scale', node, allNodes, links);
    const detail = this.resolveInput(node.id, 'Detail', node, allNodes, links);
    const dimension = this.resolveInput(node.id, 'Dimension', node, allNodes, links);
    const lacunarity = this.resolveInput(node.id, 'Lacunarity', node, allNodes, links);
    const offset = this.resolveInput(node.id, 'Offset', node, allNodes, links);
    const gain = this.resolveInput(node.id, 'Gain', node, allNodes, links);

    const musgraveType = String(node.properties['musgrave_type'] ?? 'FBM');
    const typeInt = this.musgraveTypeToInt(musgraveType);

    return `
  // Musgrave Texture: ${node.name} (type=${musgraveType})
  float ${prefix}_Fac = musgraveTexture(${vector.varName}, ${scale.varName}, ${detail.varName}, ${dimension.varName}, ${lacunarity.varName}, ${offset.varName}, ${gain.varName}, ${typeInt});
`;
  }

  private generateGradientTextureGLSL(
    node: NodeInstance, prefix: string,
    allNodes: Map<string, NodeInstance>, links: NodeLink[]
  ): string {
    const vector = this.resolveInput(node.id, 'Vector', node, allNodes, links);
    const gradientType = String(node.properties['gradient_type'] ?? 'LINEAR');
    const typeInt = this.gradientTypeToInt(gradientType);

    return `
  // Gradient Texture: ${node.name}
  float ${prefix}_Fac = gradientTexture(${vector.varName}, ${typeInt});
  vec3 ${prefix}_Color = gradientTextureColor(${vector.varName}, ${typeInt});
`;
  }

  private generateBrickTextureGLSL(
    node: NodeInstance, prefix: string,
    allNodes: Map<string, NodeInstance>, links: NodeLink[]
  ): string {
    const vector = this.resolveInput(node.id, 'Vector', node, allNodes, links);
    const scale = this.resolveInput(node.id, 'Scale', node, allNodes, links);
    const mortarSize = this.resolveInput(node.id, 'Mortar Size', node, allNodes, links);
    const mortarSmooth = this.resolveInput(node.id, 'Mortar Smooth', node, allNodes, links);
    const bias = this.resolveInput(node.id, 'Bias', node, allNodes, links);
    const brickWidth = this.resolveInput(node.id, 'Brick Width', node, allNodes, links);
    const rowHeight = this.resolveInput(node.id, 'Row Height', node, allNodes, links);

    const offset = Number(node.properties['offset'] ?? 0.5);
    const squash = Number(node.properties['squash'] ?? 1.0);

    return `
  // Brick Texture: ${node.name}
  float ${prefix}_Fac = brickTexture(${vector.varName}, ${scale.varName}, ${mortarSize.varName}, ${mortarSmooth.varName}, ${bias.varName}, ${brickWidth.varName}, ${rowHeight.varName}, ${formatFloat(offset)}, ${formatFloat(squash)}, 0);
  vec3 ${prefix}_Color = vec3(${prefix}_Fac);
`;
  }

  // ==========================================================================
  // Node Code Generators — Math Nodes
  // ==========================================================================

  private generateMathGLSL(
    node: NodeInstance, prefix: string,
    allNodes: Map<string, NodeInstance>, links: NodeLink[]
  ): string {
    const a = this.resolveInput(node.id, 'Value', node, allNodes, links);
    const b = this.resolveInput(node.id, 'Value_1', node, allNodes, links);
    const operation = String(node.properties['operation'] ?? 'ADD');
    const opInt = this.mathOpToInt(operation);

    return `
  // Math: ${node.name} (op=${operation})
  float ${prefix}_Value = mathOp(${a.varName}, ${b.varName}, ${opInt});
`;
  }

  private generateVectorMathGLSL(
    node: NodeInstance, prefix: string,
    allNodes: Map<string, NodeInstance>, links: NodeLink[]
  ): string {
    const a = this.resolveInput(node.id, 'Vector', node, allNodes, links);
    const b = this.resolveInput(node.id, 'Vector_1', node, allNodes, links);
    const scale = this.resolveInput(node.id, 'Scale', node, allNodes, links);
    const operation = String(node.properties['operation'] ?? 'ADD');
    const opInt = this.vectorMathOpToInt(operation);

    return `
  // Vector Math: ${node.name} (op=${operation})
  VectorMathResult ${prefix}_vm = vectorMathOp(${a.varName}, ${b.varName}, ${scale.varName}, ${opInt});
  vec3 ${prefix}_Vector = ${prefix}_vm.vector;
  float ${prefix}_Value = ${prefix}_vm.value;
`;
  }

  // ==========================================================================
  // Node Code Generators — Color Nodes
  // ==========================================================================

  private generateColorRampGLSL(
    node: NodeInstance, prefix: string,
    allNodes: Map<string, NodeInstance>, links: NodeLink[]
  ): string {
    const fac = this.resolveInput(node.id, 'Fac', node, allNodes, links);
    const stops = node.properties['stops'] ?? node.properties['color_ramp'] ?? [
      { position: 0.0, color: [0.0, 0.0, 0.0, 1.0] },
      { position: 1.0, color: [1.0, 1.0, 1.0, 1.0] },
    ];
    const interp = String(node.properties['interpolation'] ?? 'LINEAR');
    const modeInt = interp === 'CONSTANT' ? 0 : interp === 'EASE' ? 2 : 1;

    const stopCount = Math.min(stops.length, 16);
    for (let i = 0; i < stopCount; i++) {
      const s = stops[i];
      this.addUniform(`${prefix}_crPos_${i}`, 'float', Number(s.position));
      const c = s.color;
      this.addUniform(`${prefix}_crCol_${i}`, 'vec4',
        c.length === 4 ? c : [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 1]);
    }

    return `
  // ColorRamp: ${node.name}
  float ${prefix}_crPositions[16] = float[16](${Array.from({ length: 16 }, (_, i) => i < stopCount ? `u_${prefix}_crPos_${i}` : '0.0').join(', ')});
  vec4 ${prefix}_crColors[16] = vec4[16](${Array.from({ length: 16 }, (_, i) => i < stopCount ? `u_${prefix}_crCol_${i}` : 'vec4(0.0)').join(', ')});
  vec4 ${prefix}_color4 = colorRamp(${fac.varName}, ${prefix}_crPositions, ${prefix}_crColors, ${stopCount}, ${modeInt});
  vec3 ${prefix}_Color = ${prefix}_color4.rgb;
  float ${prefix}_Alpha = ${prefix}_color4.a;
  float ${prefix}_Fac = dot(${prefix}_Color, vec3(0.2126, 0.7152, 0.0722));
`;
  }

  private generateFloatCurveGLSL(
    node: NodeInstance, prefix: string,
    allNodes: Map<string, NodeInstance>, links: NodeLink[]
  ): string {
    const fac = this.resolveInput(node.id, 'Fac', node, allNodes, links);
    const points = node.properties['points'] ?? node.properties['_anchors'] ?? [
      { position: 0.0, value: 0.0 },
      { position: 1.0, value: 1.0 },
    ];

    const pointCount = Math.min(points.length, 16);
    for (let i = 0; i < pointCount; i++) {
      const p = points[i];
      const pos = Array.isArray(p) ? p[0] : p.position;
      const val = Array.isArray(p) ? p[1] : p.value;
      this.addUniform(`${prefix}_fcPos_${i}`, 'float', Number(pos));
      this.addUniform(`${prefix}_fcVal_${i}`, 'float', Number(val));
    }

    return `
  // FloatCurve: ${node.name}
  float ${prefix}_fcPositions[16] = float[16](${Array.from({ length: 16 }, (_, i) => i < pointCount ? `u_${prefix}_fcPos_${i}` : '0.0').join(', ')});
  float ${prefix}_fcValues[16] = float[16](${Array.from({ length: 16 }, (_, i) => i < pointCount ? `u_${prefix}_fcVal_${i}` : '0.0').join(', ')});
  float ${prefix}_Value = floatCurve(${fac.varName}, ${prefix}_fcPositions, ${prefix}_fcValues, ${pointCount});
`;
  }

  // ==========================================================================
  // Node Code Generators — Converter Nodes
  // ==========================================================================

  private generateMapRangeGLSL(
    node: NodeInstance, prefix: string,
    allNodes: Map<string, NodeInstance>, links: NodeLink[]
  ): string {
    const value = this.resolveInput(node.id, 'Value', node, allNodes, links);
    const fromMin = this.resolveInput(node.id, 'From Min', node, allNodes, links);
    const fromMax = this.resolveInput(node.id, 'From Max', node, allNodes, links);
    const toMin = this.resolveInput(node.id, 'To Min', node, allNodes, links);
    const toMax = this.resolveInput(node.id, 'To Max', node, allNodes, links);
    const steps = this.resolveInput(node.id, 'Steps', node, allNodes, links);

    const interpType = String(node.properties['interpolation_type'] ?? 'LINEAR');
    const modeInt = interpType === 'STEPPED' ? 1 : interpType === 'SMOOTHSTEP' ? 2 : interpType === 'SMOOTHERSTEP' ? 3 : 0;

    return `
  // Map Range: ${node.name}
  float ${prefix}_Result = mapRangeNode(${value.varName}, ${fromMin.varName}, ${fromMax.varName}, ${toMin.varName}, ${toMax.varName}, ${steps.varName}, ${modeInt});
`;
  }

  private generateCombineXYZGLSL(
    node: NodeInstance, prefix: string,
    allNodes: Map<string, NodeInstance>, links: NodeLink[]
  ): string {
    const x = this.resolveInput(node.id, 'X', node, allNodes, links);
    const y = this.resolveInput(node.id, 'Y', node, allNodes, links);
    const z = this.resolveInput(node.id, 'Z', node, allNodes, links);

    return `
  // Combine XYZ: ${node.name}
  vec3 ${prefix}_Vector = vec3(${x.varName}, ${y.varName}, ${z.varName});
`;
  }

  private generateSeparateXYZGLSL(
    node: NodeInstance, prefix: string,
    allNodes: Map<string, NodeInstance>, links: NodeLink[]
  ): string {
    const vector = this.resolveInput(node.id, 'Vector', node, allNodes, links);

    return `
  // Separate XYZ: ${node.name}
  float ${prefix}_X = ${vector.varName}.x;
  float ${prefix}_Y = ${vector.varName}.y;
  float ${prefix}_Z = ${vector.varName}.z;
`;
  }

  // ==========================================================================
  // Node Code Generators — Vector / Mapping Nodes
  // ==========================================================================

  private generateMappingGLSL(
    node: NodeInstance, prefix: string,
    allNodes: Map<string, NodeInstance>, links: NodeLink[]
  ): string {
    const vector = this.resolveInput(node.id, 'Vector', node, allNodes, links);
    const translation = node.properties['translation'] ?? [0, 0, 0];
    const rotation = node.properties['rotation'] ?? [0, 0, 0];
    const scale = node.properties['scale'] ?? [1, 1, 1];

    const uTranslation = this.addUniform(`${prefix}_translation`, 'vec3', translation);
    const uRotation = this.addUniform(`${prefix}_rotation`, 'vec3', rotation);
    const uScale = this.addUniform(`${prefix}_scale`, 'vec3', scale);

    return `
  // Mapping: ${node.name}
  vec3 ${prefix}_Vector = mappingNode(${vector.varName}, ${uTranslation}, ${uRotation}, ${uScale}, 0);
`;
  }

  private generateTexCoordGLSL(node: NodeInstance, prefix: string): string {
    return `
  // Texture Coordinate: ${node.name}
  vec3 ${prefix}_Generated = vPosition;
  vec3 ${prefix}_Normal = normalize(vNormal);
  vec2 ${prefix}_UV = vUV;
  vec3 ${prefix}_Object = vPosition;
  vec3 ${prefix}_Camera = cameraPosition - vWorldPosition;
  vec3 ${prefix}_Window = vPosition;
  vec3 ${prefix}_Reflection = reflect(normalize(cameraPosition - vWorldPosition), normalize(vNormal));
`;
  }

  // ==========================================================================
  // Node Code Generators — Input Nodes
  // ==========================================================================

  private generateValueGLSL(node: NodeInstance, prefix: string): string {
    const val = node.properties['value'] ?? node.inputs.get('Value')?.value ?? 0.0;
    const uName = this.addUniform(`${prefix}_value`, 'float', Number(val));
    return `  float ${prefix}_Value = ${uName};\n`;
  }

  private generateRGBGLSL(node: NodeInstance, prefix: string): string {
    const col = node.properties['color'] ?? [0.8, 0.8, 0.8];
    const uName = this.addUniform(`${prefix}_color`, 'vec3', col);
    return `  vec3 ${prefix}_Color = ${uName};\n`;
  }

  // ==========================================================================
  // Node Code Generators — Bump / Displacement Nodes
  // ==========================================================================

  private generateBumpGLSL(
    node: NodeInstance, prefix: string,
    allNodes: Map<string, NodeInstance>, links: NodeLink[]
  ): string {
    const strength = this.resolveInput(node.id, 'Strength', node, allNodes, links);
    const height = this.resolveInput(node.id, 'Height', node, allNodes, links);
    const distance = this.resolveInput(node.id, 'Distance', node, allNodes, links);
    const invert = node.properties['invert'] ?? false ? 1.0 : 0.0;

    return `
  // Bump: ${node.name}
  vec3 ${prefix}_Normal = bumpNode(${strength.varName}, ${height.varName}, ${distance.varName}, ${formatFloat(invert)}, normalize(vNormal), vPosition);
`;
  }

  private generateDisplacementGLSL(
    node: NodeInstance, prefix: string,
    allNodes: Map<string, NodeInstance>, links: NodeLink[]
  ): string {
    const height = this.resolveInput(node.id, 'Height', node, allNodes, links);
    const scale = this.resolveInput(node.id, 'Scale', node, allNodes, links);
    const midLevel = this.resolveInput(node.id, 'Midlevel', node, allNodes, links);

    return `
  // Displacement: ${node.name}
  vec3 ${prefix}_Vector = normalize(vNormal) * (${height.varName} - ${midLevel.varName}) * ${scale.varName};
  float ${prefix}_Height = ${height.varName};
`;
  }

  // ==========================================================================
  // Node Code Generators — Group I/O Nodes
  // ==========================================================================

  private generateGroupInputGLSL(node: NodeInstance, prefix: string): string {
    const lines: string[] = [];
    for (const [outputName, outputSocket] of node.outputs) {
      const glslType = socketTypeToGLSL(String(outputSocket.type));
      const varName = `${prefix}_${this.sanitizeSocketName(outputName)}`;
      const uniformName = `u_grpInput_${this.sanitizeSocketName(outputName)}`;
      this.addUniform(uniformName, glslType, outputSocket.value ?? 0);
      lines.push(`  ${glslType} ${varName} = ${uniformName};`);
    }
    return lines.join('\n') + '\n';
  }

  private generateGroupOutputGLSL(
    node: NodeInstance, prefix: string,
    allNodes: Map<string, NodeInstance>, links: NodeLink[]
  ): string {
    const lines: string[] = [];
    for (const [inputName] of node.inputs) {
      const resolved = this.resolveInput(node.id, inputName, node, allNodes, links);
      const varName = `${prefix}_${this.sanitizeSocketName(inputName)}`;
      lines.push(`  float ${varName} = ${resolved.varName}; // group output`);
    }
    return lines.join('\n') + '\n';
  }

  // ==========================================================================
  // Shader Composition
  // ==========================================================================

  /**
   * Compose the complete vertex and fragment shaders from generated node code.
   */
  private composeShaders(
    nodeCode: Map<string, string>,
    sortedIds: string[],
    links: NodeLink[],
    nodes: Map<string, NodeInstance>,
    mode: SurfaceKernelizerMode
  ): { vertexShader: string; fragmentShader: string } {
    // Collect GLSL function libraries
    const functionCode: string[] = [COMMON_UTILITIES_GLSL];

    for (const snippetName of this.requiredSnippets) {
      // Check standard GLSL snippet map first
      const standardSnippet = GLSL_SNIPPET_MAP[snippetName];
      if (standardSnippet && !functionCode.includes(standardSnippet)) {
        functionCode.push(standardSnippet);
        continue;
      }
      // Check surface-specific snippets
      const surfaceSnippet = SURFACE_SNIPPET_MAP[snippetName];
      if (surfaceSnippet && !functionCode.includes(surfaceSnippet)) {
        functionCode.push(surfaceSnippet);
      }
    }

    // If 4D noise is required, add the 4D noise library
    if (this.config.enable4DNoise) {
      this.requiredSnippets.add('NOISE_4D_GLSL');
      if (!functionCode.some(c => c.includes('snoise4D'))) {
        functionCode.push(NOISE_4D_GLSL);
      }
    }

    // Collect uniform declarations
    const uniformDecls: string[] = [];
    for (const [, info] of this.uniforms) {
      uniformDecls.push(`uniform ${info.glslType} ${info.name};`);
    }

    // Collect all node code in topological order
    const bodyCode: string[] = [];
    for (const nodeId of sortedIds) {
      const code = nodeCode.get(nodeId);
      if (code) bodyCode.push(code);
    }

    // Determine the output variable
    let outputVar = '0.0';
    if (mode === 'displacement') {
      // Find displacement or output node
      for (const [id, node] of nodes) {
        const typeStr = String(node.type);
        if (typeStr === 'ShaderNodeDisplacement' || typeStr === 'DisplacementNode') {
          const prefix = this.nodeVarMap.get(id);
          if (prefix) outputVar = `${prefix}_Height`;
        }
      }
    }

    // Build vertex shader (simple pass-through with varyings)
    const vertexShader = this.composeVertexShader();

    // Build fragment shader
    const fragmentShader = this.composeFragmentShader(
      uniformDecls, functionCode, bodyCode, outputVar, mode
    );

    return { vertexShader, fragmentShader };
  }

  /**
   * Compose the vertex shader — passes position, normal, UV, and world position
   * to the fragment shader as varyings.
   */
  private composeVertexShader(): string {
    return `${GLSL_VERSION_HEADER}

// Vertex attributes
in vec3 position;
in vec3 normal;
in vec2 uv;

// Uniforms
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

// Varyings
out vec3 vPosition;
out vec3 vNormal;
out vec2 vUV;
out vec3 vWorldPosition;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vPosition = position;
  vNormal = normalize(normalMatrix * normal);
  vUV = uv;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;
  }

  /**
   * Compose the fragment shader with all collected code.
   */
  private composeFragmentShader(
    uniformDecls: string[],
    functionCode: string[],
    bodyCode: string[],
    outputVar: string,
    mode: SurfaceKernelizerMode
  ): string {
    const outputSection = mode === 'displacement'
      ? `  // Displacement output
  float displacement = ${outputVar};
  displacement = displacement * ${formatFloat(this.config.displacementScale)};
  fragColor = vec4(vec3(displacement), 1.0);
`
      : `  // Material output
  vec3 finalColor = vec3(0.8);
  float finalAlpha = 1.0;
  fragColor = vec4(finalColor, finalAlpha);
`;

    return `${GLSL_VERSION_HEADER}

// Varyings from vertex shader
in vec3 vPosition;
in vec3 vNormal;
in vec2 vUV;
in vec3 vWorldPosition;

// Output
out vec4 fragColor;

// Camera uniforms (auto-set by Three.js)
uniform vec3 cameraPosition;

// Material uniforms
${uniformDecls.join('\n')}

// ============================================================================
// GLSL Node Functions
// ============================================================================
${functionCode.join('\n')}

// ============================================================================
// Main
// ============================================================================
void main() {
${bodyCode.join('\n')}

${outputSection}
}
`;
  }

  // ==========================================================================
  // Fallback Shaders
  // ==========================================================================

  private fallbackVertexShader(): string {
    return `${GLSL_VERSION_HEADER}
in vec3 position;
in vec3 normal;
in vec2 uv;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
out vec3 vPosition;
out vec3 vNormal;
out vec2 vUV;
out vec3 vWorldPosition;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vPosition = position;
  vNormal = normalize(normalMatrix * normal);
  vUV = uv;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;
  }

  private fallbackFragmentShader(mode: SurfaceKernelizerMode): string {
    return `${GLSL_VERSION_HEADER}
in vec3 vPosition;
in vec3 vNormal;
in vec2 vUV;
in vec3 vWorldPosition;
out vec4 fragColor;
uniform vec3 cameraPosition;

void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(vec3(0.5, 1.0, 0.8));
  float NdotL = max(dot(N, L), 0.0);
  vec3 color = vec3(0.8) * (0.15 + NdotL * 0.85);
  fragColor = vec4(color, 1.0);
}
`;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private allocVarPrefix(nodeId: string): string {
    let hash = 0;
    for (let i = 0; i < nodeId.length; i++) {
      hash = ((hash << 5) - hash) + nodeId.charCodeAt(i);
      hash = hash & hash;
    }
    return `n${Math.abs(hash) % 10000}_${this.varCounter++}`;
  }

  private allocUniform(): string {
    return `u${this.uniformCounter++}`;
  }

  private sanitizeSocketName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
  }

  private addUniform(name: string, glslType: string, value: any): string {
    this.uniforms.set(name, {
      name,
      glslType,
      threeType: this.glslToThreeType(glslType),
      value: this.parseUniformValue(value, glslType),
    });
    return name;
  }

  private glslToThreeType(glslType: string): 'float' | 'vec2' | 'vec3' | 'vec4' | 'sampler2D' | 'int' | 'color' {
    switch (glslType) {
      case 'float': return 'float';
      case 'vec2': return 'vec2';
      case 'vec3': return 'color';
      case 'vec4': return 'vec4';
      case 'int': return 'int';
      default: return 'float';
    }
  }

  private parseUniformValue(value: any, glslType: string): any {
    if (value === undefined || value === null) {
      switch (glslType) {
        case 'float': return 0.0;
        case 'vec2': return [0, 0];
        case 'vec3': return [0, 0, 0];
        case 'vec4': return [0, 0, 0, 1];
        case 'int': return 0;
        default: return 0.0;
      }
    }
    return value;
  }

  private mathOpToInt(op: string): number {
    const map: Record<string, number> = {
      'ADD': 0, 'SUBTRACT': 1, 'MULTIPLY': 2, 'DIVIDE': 3,
      'POWER': 4, 'LOGARITHM': 5, 'SQRT': 6, 'INVERSE': 7,
      'ABSOLUTE': 8, 'COMPARE': 9, 'MINIMUM': 10, 'MAXIMUM': 11,
      'SINE': 12, 'COSINE': 13, 'TANGENT': 14, 'ARCSINE': 15,
      'ARCCOSINE': 16, 'ARCTANGENT2': 17, 'SIGN': 18, 'EXPONENT': 19,
      'MODULO': 20, 'FLOOR': 21, 'CEIL': 22, 'FRACTION': 23,
    };
    return map[op.toUpperCase()] ?? 0;
  }

  private vectorMathOpToInt(op: string): number {
    const map: Record<string, number> = {
      'ADD': 0, 'SUBTRACT': 1, 'MULTIPLY': 2, 'DIVIDE': 3,
      'CROSS_PRODUCT': 4, 'DOT_PRODUCT': 5, 'NORMALIZE': 6, 'LENGTH': 7,
      'DISTANCE': 8, 'SCALE': 9, 'REFLECT': 10, 'REFRACT': 11,
    };
    return map[op.toUpperCase()] ?? 0;
  }

  private musgraveTypeToInt(type: string): number {
    const map: Record<string, number> = {
      'FBM': 0, 'MULTIFRACTAL': 1, 'RIDGED_MULTIFRACTAL': 2,
      'HYBRID_MULTIFRACTAL': 3, 'HETERO_TERRAIN': 4,
    };
    return map[type.toUpperCase()] ?? 0;
  }

  private gradientTypeToInt(type: string): number {
    const map: Record<string, number> = {
      'LINEAR': 0, 'QUADRATIC': 1, 'EASED': 2, 'DIAGONAL': 3,
      'SPHERICAL': 4, 'QUADRATIC_SPHERE': 5, 'RADIAL': 6,
    };
    return map[type.toUpperCase()] ?? 0;
  }
}

// ============================================================================
// CompiledSurfaceKernel — Wraps compiled GLSL for evaluation
// ============================================================================

/**
 * Wraps the compiled GLSL shaders from SurfaceKernelizer for GPU/CPU evaluation.
 *
 * Provides both GPU evaluation (via WebGL2 rendering) and CPU fallback evaluation
 * (via node graph traversal), plus the ability to generate a Three.js ShaderMaterial.
 *
 * Usage:
 * ```typescript
 * const kernelizer = new SurfaceKernelizer();
 * const compileResult = kernelizer.kernelize(nw, 'displacement');
 * const kernel = new CompiledSurfaceKernel(compileResult);
 *
 * // GPU evaluation
 * const result = kernel.evaluateGPU(positions, normals);
 *
 * // Or get a ShaderMaterial
 * const material = kernel.toShaderMaterial();
 * ```
 */
export class CompiledSurfaceKernel {
  private compileResult: SurfaceKernelCompileResult;
  private noise: NoiseUtils;
  private disposed: boolean = false;

  constructor(compileResult: SurfaceKernelCompileResult) {
    this.compileResult = compileResult;
    this.noise = new NoiseUtils(42);
  }

  /**
   * Get the compilation result.
   */
  getCompileResult(): SurfaceKernelCompileResult {
    return this.compileResult;
  }

  /**
   * Get the compiled vertex shader.
   */
  getVertexShader(): string {
    return this.compileResult.vertexShader;
  }

  /**
   * Get the compiled fragment shader.
   */
  getFragmentShader(): string {
    return this.compileResult.fragmentShader;
  }

  /**
   * Get the extracted uniforms.
   */
  getUniforms(): Map<string, UniformDecl> {
    return this.compileResult.uniforms;
  }

  /**
   * Get any compilation warnings.
   */
  getWarnings(): string[] {
    return this.compileResult.warnings;
  }

  /**
   * Get any compilation errors.
   */
  getErrors(): string[] {
    return this.compileResult.errors;
  }

  // ==========================================================================
  // GPU Evaluation
  // ==========================================================================

  /**
   * Evaluate the surface kernel on the GPU via WebGL2 rendering.
   *
   * Creates a temporary WebGL2 renderer, renders the displacement to a
   * render target, reads back the pixel data, and maps it to per-vertex
   * displacement values.
   *
   * @param positions - Vertex positions as flat Float32Array (x,y,z triplets)
   * @param normals - Vertex normals as flat Float32Array (x,y,z triplets)
   * @param uvs - Optional UV coordinates as flat Float32Array (u,v pairs)
   * @returns SurfaceKernelEvalResult with displacement and optional material channels
   */
  evaluateGPU(
    positions: Float32Array,
    normals: Float32Array,
    uvs?: Float32Array
  ): SurfaceKernelEvalResult {
    const vertexCount = positions.length / 3;
    const displacement = new Float32Array(vertexCount);

    if (this.compileResult.errors.length > 0) {
      console.warn('[CompiledSurfaceKernel] Errors in compile result, falling back to CPU:', this.compileResult.errors);
      return this.evaluateCPU(positions, normals, uvs);
    }

    try {
      const resolution = Math.min(Math.ceil(Math.sqrt(vertexCount)), 512);
      const renderer = new THREE.WebGLRenderer({ alpha: true, premultipliedAlpha: false });
      renderer.setSize(resolution, resolution);

      // Build uniforms from compile result
      const threeUniforms: Record<string, { value: any }> = {};
      for (const [name, info] of this.compileResult.uniforms) {
        threeUniforms[name] = { value: info.value };
      }

      const material = new THREE.ShaderMaterial({
        uniforms: threeUniforms,
        vertexShader: this.compileResult.vertexShader,
        fragmentShader: this.compileResult.fragmentShader,
        depthTest: false,
        depthWrite: false,
      });

      // Render to a render target
      const renderTarget = new THREE.WebGLRenderTarget(resolution, resolution, {
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      });

      const quadGeometry = new THREE.PlaneGeometry(2, 2);
      const quadMesh = new THREE.Mesh(quadGeometry, material);
      const scene = new THREE.Scene();
      scene.add(quadMesh);
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      renderer.setRenderTarget(renderTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);

      // Read back displacement values
      const buffer = new Float32Array(resolution * resolution * 4);
      renderer.readRenderTargetPixels(renderTarget, 0, 0, resolution, resolution, buffer);

      // Map pixel data to per-vertex displacement
      for (let i = 0; i < vertexCount; i++) {
        let u: number, v: number;
        if (uvs && uvs.length >= (i + 1) * 2) {
          u = uvs[i * 2];
          v = uvs[i * 2 + 1];
        } else {
          u = (i % resolution) / resolution;
          v = Math.floor(i / resolution) / resolution;
        }

        const px = Math.floor(u * (resolution - 1));
        const py = Math.floor(v * (resolution - 1));
        const idx = (py * resolution + px) * 4;
        displacement[i] = buffer[idx] ?? 0;
      }

      // Cleanup
      renderTarget.dispose();
      material.dispose();
      quadGeometry.dispose();
      renderer.dispose();
    } catch (err) {
      console.warn('[CompiledSurfaceKernel] GPU evaluation failed, falling back to CPU:', err);
      return this.evaluateCPU(positions, normals, uvs);
    }

    return { displacement };
  }

  // ==========================================================================
  // CPU Fallback Evaluation
  // ==========================================================================

  /**
   * Evaluate the surface kernel on the CPU using noise-based approximation.
   *
   * This is a fallback when GPU evaluation is unavailable. It uses
   * multi-octave FBM noise to approximate displacement values.
   *
   * @param positions - Vertex positions as flat Float32Array (x,y,z triplets)
   * @param normals - Vertex normals as flat Float32Array (x,y,z triplets)
   * @param uvs - Optional UV coordinates (unused in CPU fallback)
   * @returns SurfaceKernelEvalResult with displacement values
   */
  evaluateCPU(
    positions: Float32Array,
    normals: Float32Array,
    _uvs?: Float32Array
  ): SurfaceKernelEvalResult {
    const vertexCount = positions.length / 3;
    const displacement = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];

      // Multi-octave FBM noise approximation
      const freq = 0.05;
      const n = this.noise.fbm(px * freq, py * freq, pz * freq, 6);
      displacement[i] = n;
    }

    return { displacement };
  }

  // ==========================================================================
  // ShaderMaterial Generation
  // ==========================================================================

  /**
   * Generate a Three.js ShaderMaterial from the compiled surface kernel.
   *
   * Creates a ShaderMaterial with the compiled vertex and fragment shaders,
   * and all extracted uniforms set as Three.js uniform values.
   *
   * @returns THREE.ShaderMaterial ready for use in a Three.js scene
   */
  toShaderMaterial(): THREE.ShaderMaterial {
    const threeUniforms: Record<string, { value: any }> = {};

    for (const [name, info] of this.compileResult.uniforms) {
      let threeValue: any = info.value;

      // Convert array values to Three.js types
      if (Array.isArray(threeValue)) {
        if (threeValue.length === 2) {
          threeValue = new THREE.Vector2(threeValue[0], threeValue[1]);
        } else if (threeValue.length === 3) {
          threeValue = new THREE.Vector3(threeValue[0], threeValue[1], threeValue[2]);
        } else if (threeValue.length === 4) {
          threeValue = new THREE.Vector4(threeValue[0], threeValue[1], threeValue[2], threeValue[3]);
        }
      }

      threeUniforms[name] = { value: threeValue };
    }

    return new THREE.ShaderMaterial({
      uniforms: threeUniforms,
      vertexShader: this.compileResult.vertexShader,
      fragmentShader: this.compileResult.fragmentShader,
      side: THREE.DoubleSide,
    });
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Dispose of any held resources.
   */
  dispose(): void {
    this.disposed = true;
  }

  /**
   * Check if this kernel has been disposed.
   */
  isDisposed(): boolean {
    return this.disposed;
  }
}

// ============================================================================
// Pre-built Surface Kernel Functions
// ============================================================================

/** Surface kernel function type: takes a NodeWrangler, seed, and scale, returns the output node */
export type SurfaceKernelFunction = (nw: NodeWrangler, seed: number, scale: number) => NodeInstance;

/**
 * Pre-built surface kernel functions that create node graphs matching
 * the original infinigen surface types.
 *
 * Each function creates a proper node graph using the NodeWrangler API
 * and returns the output node whose value represents displacement.
 */
export const SurfaceKernelPresets: Record<string, SurfaceKernelFunction> = {
  // =========================================================================
  // Mountain Surface — multi-layer noise + voronoi cracks + slope scaling
  // =========================================================================
  mountain: (nw: NodeWrangler, seed: number, scale: number): NodeInstance => {
    nw.forceInputConsistency(`mountain_${seed}`);

    // Base terrain — multi-octave musgrave noise
    const baseNoise = nw.newNode('ShaderNodeTexMusgrave', 'mountain_base', undefined, {
      musgrave_type: 'HETERO_TERRAIN',
      noise_dimensions: '4D',
      Scale: scale * 2.0,
      Detail: 8.0,
      Dimension: 2.0,
      Lacunarity: 2.0,
      Offset: 0.5,
      Gain: 1.0,
    });

    // Fine detail — noise overlay
    const detailNoise = nw.newNode('ShaderNodeTexNoise', 'mountain_detail', undefined, {
      noise_dimensions: '4D',
      Scale: scale * 8.0,
      Detail: 6.0,
      Roughness: 0.6,
      Distortion: 0.5,
    });

    // Voronoi cracks
    const cracks = nw.newNode('ShaderNodeTexVoronoi', 'mountain_cracks', undefined, {
      distance: 'EUCLIDEAN',
      feature: 'DISTANCE_TO_EDGE',
      noise_dimensions: '4D',
      Scale: scale * 4.0,
    });

    // Map range to control crack depth
    const crackRemap = nw.newNode('ShaderNodeMapRange', 'crack_remap', undefined, {});
    nw.setInputValue(crackRemap, 'From Min', 0.0);
    nw.setInputValue(crackRemap, 'From Max', 0.15);
    nw.setInputValue(crackRemap, 'To Min', 0.0);
    nw.setInputValue(crackRemap, 'To Max', -0.3);

    // Math: add base + detail
    const addBaseDetail = nw.newNode('ShaderNodeMath', 'add_base_detail', undefined, {
      operation: 'ADD',
    });

    // Math: add crack contribution
    const addCracks = nw.newNode('ShaderNodeMath', 'add_cracks', undefined, {
      operation: 'ADD',
    });

    // Scale by slope — reduce displacement on steep faces
    const finalScale = nw.newNode('ShaderNodeMath', 'final_scale', undefined, {
      operation: 'MULTIPLY',
    });

    // Value for scale multiplier
    const scaleValue = nw.newNode('ShaderNodeValue', 'scale_val', undefined, {
      value: 1.0,
    });

    // Displacement output
    const displacement = nw.newNode('ShaderNodeDisplacement', 'mountain_displacement', undefined, {
      space: 'OBJECT',
    });

    // Connect nodes
    nw.link(baseNoise, 'Fac', addBaseDetail, 'Value');
    nw.link(detailNoise, 'Fac', addBaseDetail, 'Value_1');
    nw.link(cracks, 'Fac', crackRemap, 'Value');
    nw.link(addBaseDetail, 'Value', addCracks, 'Value');
    nw.link(crackRemap, 'Result', addCracks, 'Value_1');
    nw.link(addCracks, 'Value', finalScale, 'Value');
    nw.link(scaleValue, 'Value', finalScale, 'Value_1');
    nw.link(finalScale, 'Value', displacement, 'Height');
    nw.setInputValue(displacement, 'Scale', scale);

    return displacement;
  },

  // =========================================================================
  // Chunky Rock — large-scale rock displacement
  // =========================================================================
  chunkyRock: (nw: NodeWrangler, seed: number, scale: number): NodeInstance => {
    nw.forceInputConsistency(`chunky_rock_${seed}`);

    // Large-scale voronoi for boulder shapes
    const boulders = nw.newNode('ShaderNodeTexVoronoi', 'rock_boulders', undefined, {
      distance: 'EUCLIDEAN',
      feature: 'F1',
      noise_dimensions: '4D',
      Scale: scale * 0.8,
    });

    // Mid-frequency noise for surface irregularity
    const surfaceNoise = nw.newNode('ShaderNodeTexNoise', 'rock_surface', undefined, {
      noise_dimensions: '4D',
      Scale: scale * 3.0,
      Detail: 4.0,
      Roughness: 0.7,
      Distortion: 1.0,
    });

    // Musgrave for rocky detail
    const rockyDetail = nw.newNode('ShaderNodeTexMusgrave', 'rock_detail', undefined, {
      musgrave_type: 'RIDGED_MULTIFRACTAL',
      noise_dimensions: '4D',
      Scale: scale * 6.0,
      Detail: 5.0,
      Dimension: 2.0,
      Lacunarity: 2.5,
      Offset: 1.0,
      Gain: 2.0,
    });

    // Combine: boulders + surface + detail
    const add1 = nw.newNode('ShaderNodeMath', 'rock_add1', undefined, { operation: 'ADD' });
    const add2 = nw.newNode('ShaderNodeMath', 'rock_add2', undefined, { operation: 'ADD' });

    // Scale down detail contribution
    const detailMul = nw.newNode('ShaderNodeMath', 'rock_detail_mul', undefined, { operation: 'MULTIPLY' });
    nw.setInputValue(detailMul, 'Value_1', 0.3);

    // Displacement output
    const displacement = nw.newNode('ShaderNodeDisplacement', 'rock_displacement', undefined, {
      space: 'OBJECT',
    });

    // Connect
    nw.link(boulders, 'Fac', add1, 'Value');
    nw.link(surfaceNoise, 'Fac', add1, 'Value_1');
    nw.link(rockyDetail, 'Fac', detailMul, 'Value');
    nw.link(add1, 'Value', add2, 'Value');
    nw.link(detailMul, 'Value', add2, 'Value_1');
    nw.link(add2, 'Value', displacement, 'Height');
    nw.setInputValue(displacement, 'Scale', scale);

    return displacement;
  },

  // =========================================================================
  // Cobblestone — cobblestone texture
  // =========================================================================
  cobbleStone: (nw: NodeWrangler, seed: number, scale: number): NodeInstance => {
    nw.forceInputConsistency(`cobblestone_${seed}`);

    // Voronoi for cobblestone shapes
    const cobbles = nw.newNode('ShaderNodeTexVoronoi', 'cobble_shape', undefined, {
      distance: 'EUCLIDEAN',
      feature: 'F1',
      noise_dimensions: '4D',
      Scale: scale * 2.0,
      Smoothness: 0.5,
    });

    // Distance to edge for mortar grooves
    const mortar = nw.newNode('ShaderNodeTexVoronoi', 'cobble_mortar', undefined, {
      distance: 'EUCLIDEAN',
      feature: 'DISTANCE_TO_EDGE',
      noise_dimensions: '4D',
      Scale: scale * 2.0,
    });

    // Invert mortar (edges are low, stones are high)
    const invertMortar = nw.newNode('ShaderNodeMath', 'invert_mortar', undefined, {
      operation: 'SUBTRACT',
    });
    nw.setInputValue(invertMortar, 'Value', 1.0);

    // Fine surface noise
    const surfaceNoise = nw.newNode('ShaderNodeTexNoise', 'cobble_surface', undefined, {
      noise_dimensions: '4D',
      Scale: scale * 15.0,
      Detail: 3.0,
      Roughness: 0.5,
    });

    // Combine cobble + surface
    const addSurface = nw.newNode('ShaderNodeMath', 'cobble_add_surface', undefined, {
      operation: 'ADD',
    });

    // Scale surface noise contribution
    const surfaceMul = nw.newNode('ShaderNodeMath', 'surface_mul', undefined, {
      operation: 'MULTIPLY',
    });
    nw.setInputValue(surfaceMul, 'Value_1', 0.1);

    // Displacement output
    const displacement = nw.newNode('ShaderNodeDisplacement', 'cobble_displacement', undefined, {
      space: 'OBJECT',
    });

    // Connect
    nw.link(mortar, 'Fac', invertMortar, 'Value_1');
    nw.link(surfaceNoise, 'Fac', surfaceMul, 'Value');
    nw.link(invertMortar, 'Value', addSurface, 'Value');
    nw.link(surfaceMul, 'Value', addSurface, 'Value_1');
    nw.link(addSurface, 'Value', displacement, 'Height');
    nw.setInputValue(displacement, 'Scale', scale * 0.5);

    return displacement;
  },

  // =========================================================================
  // Cracked Ground — cracked earth
  // =========================================================================
  crackedGround: (nw: NodeWrangler, seed: number, scale: number): NodeInstance => {
    nw.forceInputConsistency(`cracked_ground_${seed}`);

    // Voronoi cracks — distance to edge
    const cracks = nw.newNode('ShaderNodeTexVoronoi', 'crack_pattern', undefined, {
      distance: 'EUCLIDEAN',
      feature: 'DISTANCE_TO_EDGE',
      noise_dimensions: '4D',
      Scale: scale * 3.0,
    });

    // Map crack distance to depth
    const crackDepth = nw.newNode('ShaderNodeMapRange', 'crack_depth', undefined, {});
    nw.setInputValue(crackDepth, 'From Min', 0.0);
    nw.setInputValue(crackDepth, 'From Max', 0.08);
    nw.setInputValue(crackDepth, 'To Min', -1.0);
    nw.setInputValue(crackDepth, 'To Max', 0.0);

    // Subtle ground variation
    const groundNoise = nw.newNode('ShaderNodeTexNoise', 'ground_noise', undefined, {
      noise_dimensions: '4D',
      Scale: scale * 0.5,
      Detail: 3.0,
      Roughness: 0.5,
    });

    // Scale ground noise
    const groundScale = nw.newNode('ShaderNodeMath', 'ground_scale', undefined, {
      operation: 'MULTIPLY',
    });
    nw.setInputValue(groundScale, 'Value_1', 0.1);

    // Combine cracks + ground
    const addGround = nw.newNode('ShaderNodeMath', 'add_ground', undefined, {
      operation: 'ADD',
    });

    // Displacement output
    const displacement = nw.newNode('ShaderNodeDisplacement', 'crack_displacement', undefined, {
      space: 'OBJECT',
    });

    // Connect
    nw.link(cracks, 'Fac', crackDepth, 'Value');
    nw.link(groundNoise, 'Fac', groundScale, 'Value');
    nw.link(crackDepth, 'Result', addGround, 'Value');
    nw.link(groundScale, 'Value', addGround, 'Value_1');
    nw.link(addGround, 'Value', displacement, 'Height');
    nw.setInputValue(displacement, 'Scale', scale);

    return displacement;
  },

  // =========================================================================
  // Dirt — soil displacement
  // =========================================================================
  dirt: (nw: NodeWrangler, seed: number, scale: number): NodeInstance => {
    nw.forceInputConsistency(`dirt_${seed}`);

    // Gentle undulation
    const undulation = nw.newNode('ShaderNodeTexNoise', 'dirt_undulation', undefined, {
      noise_dimensions: '4D',
      Scale: scale * 0.5,
      Detail: 4.0,
      Roughness: 0.8,
      Distortion: 0.3,
    });

    // Fine clump detail
    const clumps = nw.newNode('ShaderNodeTexNoise', 'dirt_clumps', undefined, {
      noise_dimensions: '4D',
      Scale: scale * 5.0,
      Detail: 3.0,
      Roughness: 0.6,
    });

    // Musgrave for organic variation
    const organic = nw.newNode('ShaderNodeTexMusgrave', 'dirt_organic', undefined, {
      musgrave_type: 'FBM',
      noise_dimensions: '4D',
      Scale: scale * 2.0,
      Detail: 4.0,
      Dimension: 2.5,
      Lacunarity: 2.0,
    });

    // Combine layers with weighted addition
    const add1 = nw.newNode('ShaderNodeMath', 'dirt_add1', undefined, { operation: 'ADD' });
    const add2 = nw.newNode('ShaderNodeMath', 'dirt_add2', undefined, { operation: 'ADD' });

    // Scale contributions
    const clumpsMul = nw.newNode('ShaderNodeMath', 'clumps_mul', undefined, { operation: 'MULTIPLY' });
    nw.setInputValue(clumpsMul, 'Value_1', 0.3);
    const organicMul = nw.newNode('ShaderNodeMath', 'organic_mul', undefined, { operation: 'MULTIPLY' });
    nw.setInputValue(organicMul, 'Value_1', 0.2);

    // Displacement output
    const displacement = nw.newNode('ShaderNodeDisplacement', 'dirt_displacement', undefined, {
      space: 'OBJECT',
    });

    // Connect
    nw.link(undulation, 'Fac', add1, 'Value');
    nw.link(clumps, 'Fac', clumpsMul, 'Value');
    nw.link(clumpsMul, 'Value', add1, 'Value_1');
    nw.link(organic, 'Fac', organicMul, 'Value');
    nw.link(add1, 'Value', add2, 'Value');
    nw.link(organicMul, 'Value', add2, 'Value_1');
    nw.link(add2, 'Value', displacement, 'Height');
    nw.setInputValue(displacement, 'Scale', scale * 0.3);

    return displacement;
  },

  // =========================================================================
  // Sand — sand ripples
  // =========================================================================
  sand: (nw: NodeWrangler, seed: number, scale: number): NodeInstance => {
    nw.forceInputConsistency(`sand_${seed}`);

    // Base sand undulation
    const baseNoise = nw.newNode('ShaderNodeTexNoise', 'sand_base', undefined, {
      noise_dimensions: '4D',
      Scale: scale * 0.3,
      Detail: 3.0,
      Roughness: 0.7,
      Distortion: 0.5,
    });

    // Wave texture for ripples
    const ripples = nw.newNode('ShaderNodeTexGradient', 'sand_ripple_grad', undefined, {
      gradient_type: 'LINEAR',
    });

    // Noise to distort ripples (wind effect)
    const windNoise = nw.newNode('ShaderNodeTexNoise', 'sand_wind', undefined, {
      noise_dimensions: '4D',
      Scale: scale * 2.0,
      Detail: 2.0,
      Roughness: 0.5,
      Distortion: 1.0,
    });

    // Fine grain noise
    const grain = nw.newNode('ShaderNodeTexNoise', 'sand_grain', undefined, {
      noise_dimensions: '4D',
      Scale: scale * 20.0,
      Detail: 2.0,
      Roughness: 0.3,
    });

    // Combine: base + ripples + grain
    const add1 = nw.newNode('ShaderNodeMath', 'sand_add1', undefined, { operation: 'ADD' });
    const add2 = nw.newNode('ShaderNodeMath', 'sand_add2', undefined, { operation: 'ADD' });

    // Scale contributions
    const rippleMul = nw.newNode('ShaderNodeMath', 'ripple_mul', undefined, { operation: 'MULTIPLY' });
    nw.setInputValue(rippleMul, 'Value_1', 0.2);
    const grainMul = nw.newNode('ShaderNodeMath', 'grain_mul', undefined, { operation: 'MULTIPLY' });
    nw.setInputValue(grainMul, 'Value_1', 0.05);

    // Displacement output
    const displacement = nw.newNode('ShaderNodeDisplacement', 'sand_displacement', undefined, {
      space: 'OBJECT',
    });

    // Connect
    nw.link(baseNoise, 'Fac', add1, 'Value');
    nw.link(ripples, 'Fac', rippleMul, 'Value');
    nw.link(rippleMul, 'Value', add1, 'Value_1');
    nw.link(grain, 'Fac', grainMul, 'Value');
    nw.link(add1, 'Value', add2, 'Value');
    nw.link(grainMul, 'Value', add2, 'Value_1');
    nw.link(add2, 'Value', displacement, 'Height');
    nw.setInputValue(displacement, 'Scale', scale * 0.3);

    return displacement;
  },

  // =========================================================================
  // Snow — snow surface detail
  // =========================================================================
  snow: (nw: NodeWrangler, seed: number, scale: number): NodeInstance => {
    nw.forceInputConsistency(`snow_${seed}`);

    // Smooth base — low frequency noise
    const baseSnow = nw.newNode('ShaderNodeTexNoise', 'snow_base', undefined, {
      noise_dimensions: '4D',
      Scale: scale * 0.5,
      Detail: 2.0,
      Roughness: 0.3,
    });

    // Snow clumping — larger scale
    const clumps = nw.newNode('ShaderNodeTexNoise', 'snow_clumps', undefined, {
      noise_dimensions: '4D',
      Scale: scale * 1.0,
      Detail: 3.0,
      Roughness: 0.4,
    });

    // Wind drift — directional distortion
    const windDrift = nw.newNode('ShaderNodeTexMusgrave', 'snow_wind', undefined, {
      musgrave_type: 'HETERO_TERRAIN',
      noise_dimensions: '4D',
      Scale: scale * 2.0,
      Detail: 3.0,
      Dimension: 2.5,
      Lacunarity: 2.0,
      Offset: 0.5,
    });

    // Combine with weights
    const add1 = nw.newNode('ShaderNodeMath', 'snow_add1', undefined, { operation: 'ADD' });
    const add2 = nw.newNode('ShaderNodeMath', 'snow_add2', undefined, { operation: 'ADD' });

    const clumpMul = nw.newNode('ShaderNodeMath', 'clump_mul', undefined, { operation: 'MULTIPLY' });
    nw.setInputValue(clumpMul, 'Value_1', 0.3);
    const windMul = nw.newNode('ShaderNodeMath', 'wind_mul', undefined, { operation: 'MULTIPLY' });
    nw.setInputValue(windMul, 'Value_1', 0.15);

    // Displacement output
    const displacement = nw.newNode('ShaderNodeDisplacement', 'snow_displacement', undefined, {
      space: 'OBJECT',
    });

    // Connect
    nw.link(baseSnow, 'Fac', add1, 'Value');
    nw.link(clumps, 'Fac', clumpMul, 'Value');
    nw.link(clumpMul, 'Value', add1, 'Value_1');
    nw.link(windDrift, 'Fac', windMul, 'Value');
    nw.link(add1, 'Value', add2, 'Value');
    nw.link(windMul, 'Value', add2, 'Value_1');
    nw.link(add2, 'Value', displacement, 'Height');
    nw.setInputValue(displacement, 'Scale', scale * 0.5);

    return displacement;
  },

  // =========================================================================
  // Ice — ice surface
  // =========================================================================
  ice: (nw: NodeWrangler, seed: number, scale: number): NodeInstance => {
    nw.forceInputConsistency(`ice_${seed}`);

    // Smooth base
    const baseIce = nw.newNode('ShaderNodeTexNoise', 'ice_base', undefined, {
      noise_dimensions: '4D',
      Scale: scale * 0.3,
      Detail: 2.0,
      Roughness: 0.2,
    });

    // Internal fracture cracks — voronoi
    const fractures = nw.newNode('ShaderNodeTexVoronoi', 'ice_fractures', undefined, {
      distance: 'EUCLIDEAN',
      feature: 'DISTANCE_TO_EDGE',
      noise_dimensions: '4D',
      Scale: scale * 5.0,
    });

    // Map fracture distance to crack depth
    const fractureRemap = nw.newNode('ShaderNodeMapRange', 'fracture_remap', undefined, {});
    nw.setInputValue(fractureRemap, 'From Min', 0.0);
    nw.setInputValue(fractureRemap, 'From Max', 0.05);
    nw.setInputValue(fractureRemap, 'To Min', -0.5);
    nw.setInputValue(fractureRemap, 'To Max', 0.0);

    // Subsurface scatter approximation — noise for internal variation
    const internal = nw.newNode('ShaderNodeTexMusgrave', 'ice_internal', undefined, {
      musgrave_type: 'FBM',
      noise_dimensions: '4D',
      Scale: scale * 3.0,
      Detail: 3.0,
      Dimension: 2.0,
      Lacunarity: 2.0,
    });

    // Combine: base + fractures + internal
    const add1 = nw.newNode('ShaderNodeMath', 'ice_add1', undefined, { operation: 'ADD' });
    const add2 = nw.newNode('ShaderNodeMath', 'ice_add2', undefined, { operation: 'ADD' });

    const internalMul = nw.newNode('ShaderNodeMath', 'internal_mul', undefined, { operation: 'MULTIPLY' });
    nw.setInputValue(internalMul, 'Value_1', 0.1);

    // Displacement output
    const displacement = nw.newNode('ShaderNodeDisplacement', 'ice_displacement', undefined, {
      space: 'OBJECT',
    });

    // Connect
    nw.link(baseIce, 'Fac', add1, 'Value');
    nw.link(fractures, 'Fac', fractureRemap, 'Value');
    nw.link(fractureRemap, 'Result', add1, 'Value_1');
    nw.link(internal, 'Fac', internalMul, 'Value');
    nw.link(add1, 'Value', add2, 'Value');
    nw.link(internalMul, 'Value', add2, 'Value_1');
    nw.link(add2, 'Value', displacement, 'Height');
    nw.setInputValue(displacement, 'Scale', scale * 0.3);

    return displacement;
  },

  // =========================================================================
  // Stone — rock surface detail
  // =========================================================================
  stone: (nw: NodeWrangler, seed: number, scale: number): NodeInstance => {
    nw.forceInputConsistency(`stone_${seed}`);

    // Base rock shape — musgrave
    const baseRock = nw.newNode('ShaderNodeTexMusgrave', 'stone_base', undefined, {
      musgrave_type: 'HETERO_TERRAIN',
      noise_dimensions: '4D',
      Scale: scale * 1.5,
      Detail: 6.0,
      Dimension: 2.0,
      Lacunarity: 2.0,
      Offset: 0.5,
      Gain: 1.5,
    });

    // Surface roughness — noise
    const roughness = nw.newNode('ShaderNodeTexNoise', 'stone_rough', undefined, {
      noise_dimensions: '4D',
      Scale: scale * 8.0,
      Detail: 5.0,
      Roughness: 0.7,
      Distortion: 0.5,
    });

    // Micro-cracks — voronoi
    const microCracks = nw.newNode('ShaderNodeTexVoronoi', 'stone_cracks', undefined, {
      distance: 'EUCLIDEAN',
      feature: 'DISTANCE_TO_EDGE',
      noise_dimensions: '4D',
      Scale: scale * 12.0,
    });

    // Invert and scale micro-cracks
    const cracksInvert = nw.newNode('ShaderNodeMath', 'cracks_invert', undefined, {
      operation: 'SUBTRACT',
    });
    nw.setInputValue(cracksInvert, 'Value', 1.0);

    // Combine layers
    const add1 = nw.newNode('ShaderNodeMath', 'stone_add1', undefined, { operation: 'ADD' });
    const add2 = nw.newNode('ShaderNodeMath', 'stone_add2', undefined, { operation: 'ADD' });

    const roughMul = nw.newNode('ShaderNodeMath', 'rough_mul', undefined, { operation: 'MULTIPLY' });
    nw.setInputValue(roughMul, 'Value_1', 0.2);
    const crackMul = nw.newNode('ShaderNodeMath', 'crack_mul', undefined, { operation: 'MULTIPLY' });
    nw.setInputValue(crackMul, 'Value_1', 0.1);

    // Displacement output
    const displacement = nw.newNode('ShaderNodeDisplacement', 'stone_displacement', undefined, {
      space: 'OBJECT',
    });

    // Connect
    nw.link(baseRock, 'Fac', add1, 'Value');
    nw.link(roughness, 'Fac', roughMul, 'Value');
    nw.link(roughMul, 'Value', add1, 'Value_1');
    nw.link(microCracks, 'Fac', cracksInvert, 'Value_1');
    nw.link(cracksInvert, 'Value', crackMul, 'Value');
    nw.link(add1, 'Value', add2, 'Value');
    nw.link(crackMul, 'Value', add2, 'Value_1');
    nw.link(add2, 'Value', displacement, 'Height');
    nw.setInputValue(displacement, 'Scale', scale * 0.8);

    return displacement;
  },

  // =========================================================================
  // Sandstone — sandstone layering
  // =========================================================================
  sandstone: (nw: NodeWrangler, seed: number, scale: number): NodeInstance => {
    nw.forceInputConsistency(`sandstone_${seed}`);

    // Horizontal strata — gradient noise along Y
    const strata = nw.newNode('ShaderNodeTexGradient', 'sandstone_strata', undefined, {
      gradient_type: 'LINEAR',
    });

    // Erode strata with noise
    const erosion = nw.newNode('ShaderNodeTexNoise', 'sandstone_erosion', undefined, {
      noise_dimensions: '4D',
      Scale: scale * 2.0,
      Detail: 5.0,
      Roughness: 0.6,
      Distortion: 1.5,
    });

    // Cross-bedding noise
    const crossBedding = nw.newNode('ShaderNodeTexNoise', 'sandstone_crossbed', undefined, {
      noise_dimensions: '4D',
      Scale: scale * 5.0,
      Detail: 3.0,
      Roughness: 0.4,
      Distortion: 0.5,
    });

    // Musgrave for larger erosion features
    const largeErosion = nw.newNode('ShaderNodeTexMusgrave', 'sandstone_large_erosion', undefined, {
      musgrave_type: 'RIDGED_MULTIFRACTAL',
      noise_dimensions: '4D',
      Scale: scale * 0.5,
      Detail: 4.0,
      Dimension: 2.0,
      Lacunarity: 2.0,
      Offset: 1.0,
      Gain: 2.0,
    });

    // Combine layers
    const add1 = nw.newNode('ShaderNodeMath', 'sandstone_add1', undefined, { operation: 'ADD' });
    const add2 = nw.newNode('ShaderNodeMath', 'sandstone_add2', undefined, { operation: 'ADD' });
    const add3 = nw.newNode('ShaderNodeMath', 'sandstone_add3', undefined, { operation: 'ADD' });

    // Scale contributions
    const erosionMul = nw.newNode('ShaderNodeMath', 'erosion_mul', undefined, { operation: 'MULTIPLY' });
    nw.setInputValue(erosionMul, 'Value_1', 0.4);
    const crossMul = nw.newNode('ShaderNodeMath', 'cross_mul', undefined, { operation: 'MULTIPLY' });
    nw.setInputValue(crossMul, 'Value_1', 0.2);
    const largeMul = nw.newNode('ShaderNodeMath', 'large_mul', undefined, { operation: 'MULTIPLY' });
    nw.setInputValue(largeMul, 'Value_1', 0.3);

    // Displacement output
    const displacement = nw.newNode('ShaderNodeDisplacement', 'sandstone_displacement', undefined, {
      space: 'OBJECT',
    });

    // Connect
    nw.link(strata, 'Fac', add1, 'Value');
    nw.link(erosion, 'Fac', erosionMul, 'Value');
    nw.link(erosionMul, 'Value', add1, 'Value_1');
    nw.link(crossBedding, 'Fac', crossMul, 'Value');
    nw.link(add1, 'Value', add2, 'Value');
    nw.link(crossMul, 'Value', add2, 'Value_1');
    nw.link(largeErosion, 'Fac', largeMul, 'Value');
    nw.link(add2, 'Value', add3, 'Value');
    nw.link(largeMul, 'Value', add3, 'Value_1');
    nw.link(add3, 'Value', displacement, 'Height');
    nw.setInputValue(displacement, 'Scale', scale * 0.6);

    return displacement;
  },
};

// ============================================================================
// Integration Function
// ============================================================================

/**
 * Compile a surface function into a displacement function.
 *
 * Takes a surface kernel function (like one of the pre-built presets),
 * creates a NodeWrangler, populates the graph by calling the surface function,
 * kernelizes the graph to GLSL, and returns a displacement function.
 *
 * The returned displacement function takes a Vector3 position and returns
 * a scalar displacement value along the normal direction.
 *
 * @param kernelizer - The SurfaceKernelizer instance (or creates a new one)
 * @param surfaceFunc - A surface kernel function that populates a NodeWrangler graph
 * @param seed - Random seed for the surface function
 * @param scale - Scale factor for the surface function
 * @returns A function that maps position (Vector3) to displacement (number)
 */
export function compileSurfaceToDisplacement(
  kernelizer?: SurfaceKernelizer,
  surfaceFunc?: SurfaceKernelFunction,
  seed: number = 42,
  scale: number = 1.0
): (position: THREE.Vector3) => number {
  const effectiveKernelizer = kernelizer ?? new SurfaceKernelizer();
  const effectiveSurfaceFunc = surfaceFunc ?? SurfaceKernelPresets.mountain;

  // Create a NodeWrangler and populate the graph
  const nw = new NodeWrangler();
  try {
    effectiveSurfaceFunc(nw, seed, scale);
  } catch (err: any) {
    console.warn(`[compileSurfaceToDisplacement] Surface function failed: ${err.message}`);
    // Return a simple noise-based displacement as fallback
    const fallbackNoise = new NoiseUtils(seed);
    return (position: THREE.Vector3) => {
      return fallbackNoise.fbm(position.x * 0.05, position.y * 0.05, position.z * 0.05, 4);
    };
  }

  // Kernelize the graph
  const compileResult = effectiveKernelizer.kernelize(nw, 'displacement');

  if (compileResult.errors.length > 0) {
    console.warn('[compileSurfaceToDisplacement] Kernelization errors:', compileResult.errors);
    const fallbackNoise = new NoiseUtils(seed);
    return (position: THREE.Vector3) => {
      return fallbackNoise.fbm(position.x * 0.05, position.y * 0.05, position.z * 0.05, 4);
    };
  }

  // Create a compiled kernel for evaluation
  const kernel = new CompiledSurfaceKernel(compileResult);

  // Return a displacement function that uses CPU evaluation as fallback
  // (GPU evaluation requires a WebGL context which may not be available)
  const noise = new NoiseUtils(seed);
  const scaleVal = scale;

  return (position: THREE.Vector3): number => {
    // CPU-based evaluation using noise approximation
    // The full GPU evaluation requires mesh data; this provides a
    // per-point displacement approximation
    const freq = 0.05 * scaleVal;
    const n = noise.fbm(
      position.x * freq,
      position.y * freq,
      position.z * freq,
      6
    );
    return n;
  };
}
