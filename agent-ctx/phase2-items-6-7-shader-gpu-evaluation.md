# Phase 2 Items 6 & 7: Shader Generation from Node Graphs & GPU Per-Vertex Evaluation

## Task ID: phase2-items-6-7
## Agent: main

## Summary

Implemented shader generation from node graphs (Item 6) and GPU per-vertex evaluation (Item 7) for the Infinigen R3F project.

## Files Created

### GLSL Shader Generation (Item 6)
1. **`src/core/nodes/execution/glsl/GLSLNodeFunctions.ts`** (~600 lines)
   - Complete GLSL implementations for all node types:
     - Noise Texture (simplex 3D, Perlin 3D, FBM)
     - Voronoi Texture (F1, F2, distance-to-edge, smooth F1)
     - Musgrave Texture (fBm, multifractal, ridged, heterogeneous terrain, hybrid multifractal)
     - Gradient Texture (linear, quadratic, eased, diagonal, spherical, quadratic sphere)
     - Brick Texture (with mortar, offset, squash)
     - Checker Texture (UV-based)
     - Magic Texture (swirl pattern)
     - ColorRamp (uniform array + interpolation: constant, linear, ease, cardinal, B-spline)
     - FloatCurve (uniform array + cubic interpolation)
     - MixRGB (15 blend modes: mix, add, multiply, subtract, screen, divide, difference, etc.)
     - Math (27 operations: add through modulo, floor, ceil, etc.)
     - VectorMath (15 operations: add through project)
     - PrincipledBSDF (Cook-Torrance BRDF with GGX distribution)
     - Mix Shader / Add Shader
     - Mapping Node
     - Texture Coordinate Node
     - IBL (Image-Based Lighting) support
     - Multi-light support (4 point lights + 1 directional)
     - Shadow mapping support
   - NODE_TYPE_GLSL_REQUIREMENTS map for dependency resolution
   - GLSL_SNIPPET_MAP for on-demand snippet inclusion

2. **`src/core/nodes/execution/glsl/GLSLShaderComposer.ts`** (~700 lines)
   - GLSLShaderComposer class that:
     - Takes a ShaderGraph and topologically sorts nodes
     - Generates GLSL variable declarations for each node output
     - Composes fragment shader by concatenating: header, utilities, uniforms, node functions, main body
     - Supports IBL and shadow mapping options
     - Generates fallback shaders on error
     - Provides uniform management with Three.js type mapping

3. **`src/core/nodes/execution/glsl/index.ts`**
   - Module exports for all GLSL components

### GPU Per-Vertex Evaluation (Item 7)
4. **`src/core/nodes/execution/gpu/WGSLNodeFunctions.ts`** (~450 lines)
   - Same node function library in WGSL syntax:
     - Common utilities (saturate, HSV/RGB conversion)
     - Simplex 3D noise, Perlin 3D noise, FBM
     - Voronoi (F1, F2, distance-to-edge, smooth F1)
     - Musgrave (fBm, multifractal, ridged, heterogeneous terrain)
     - Gradient, Brick, Checker textures
     - Math and Vector Math operations
     - Mapping node
   - ALL_WGSL_NODE_FUNCTIONS aggregate constant

5. **`src/core/nodes/execution/gpu/GPUPerVertexEvaluator.ts`** (~550 lines)
   - GPUPerVertexEvaluator class:
     - `initialize(device, geometry, graph)` - Sets up WebGPU compute pipeline
     - `evaluate(options)` - Runs compute shader, returns displaced positions/normals/colors
     - `updateUniforms(uniforms)` - Updates runtime parameters
     - `dispose()` - Cleans up GPU resources
   - WGSL compute shader template with workgroup_size 64
   - Reads vertex positions, normals, UVs from storage buffers
   - Evaluates node graph operations (noise, voronoi, musgrave, gradient, brick, checker)
   - Writes displaced positions + perturbed normals back to storage buffers
   - Outputs color, roughness, metallic channels
   - Parameter extraction from GPUShaderGraph

6. **`src/core/nodes/execution/gpu/GPUEvaluationPipeline.ts`** (~450 lines)
   - GPUEvaluationPipeline class:
     - `evaluate(geometry, graph, options)` - Auto-routes to GPU or CPU
     - `isGPUAvailable()` - Checks WebGPU availability
     - `dispose()` - Cleans up all resources
   - WebGPU feature detection via `isWebGPUAvailable()`
   - Cached device management
   - Shader cache for reuse (max 8 entries, LRU eviction)
   - CPU fallback with noise-based displacement matching GPU output
   - Progress callbacks for large meshes
   - Graceful fallback with warning logging

7. **`src/core/nodes/execution/gpu/index.ts`**
   - Module exports for all GPU components

### Updated Files
8. **`src/core/nodes/execution/ShaderCompiler.ts`** - Updated to:
   - Use GLSLShaderComposer for full node graph → GLSL generation
   - Add `compileToGLSL(graph)` method
   - Add `compileToMaterial(graph, options)` method with IBL/shadow support
   - Add `ShaderCompileOptions` interface
   - Retain legacy `compile()` method for backward compatibility
   - Convert NodeGraph to ShaderGraph for composer integration

9. **`src/core/nodes/execution/index.ts`** - Updated to export:
   - GLSLShaderComposer, ComposableNode, ShaderGraph, ComposedShader
   - ALL_GLSL_NODE_FUNCTIONS, NODE_TYPE_GLSL_REQUIREMENTS, GLSL_SNIPPET_MAP
   - GPUPerVertexEvaluator and GPU types
   - GPUEvaluationPipeline, isWebGPUAvailable, getWebGPUDevice
   - ALL_WGSL_NODE_FUNCTIONS
   - ShaderCompileOptions

## Architecture

```
ShaderGraphBuilder → ShaderGraph → GLSLShaderComposer → GLSL Fragment Shader
                                                    → Three.js ShaderMaterial

BufferGeometry + ShaderGraph → GPUPerVertexEvaluator → WebGPU Compute Pipeline
                                                      → Displaced Geometry (GPU)

BufferGeometry + ShaderGraph → GPUEvaluationPipeline → GPU path (WebGPU)
                                                     → CPU path (fallback)
                                                     → Modified Geometry
```

## TypeScript Compilation
- All new files compile without errors
- No lint issues in new code
- Backward compatible with existing codebase
