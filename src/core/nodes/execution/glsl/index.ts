/**
 * GLSL Shader Generation Module - Index
 *
 * Provides GLSL node function libraries and shader composition
 * for generating complete GLSL shaders from node graphs.
 *
 * @module core/nodes/execution/glsl
 */

// GLSL Node Functions
export {
  COMMON_UTILITIES_GLSL,
  NOISE_TEXTURE_GLSL,
  VORONOI_TEXTURE_GLSL,
  MUSGRAVE_TEXTURE_GLSL,
  GRADIENT_TEXTURE_GLSL,
  BRICK_TEXTURE_GLSL,
  CHECKER_TEXTURE_GLSL,
  MAGIC_TEXTURE_GLSL,
  COLOR_RAMP_GLSL,
  FLOAT_CURVE_GLSL,
  MIX_RGB_GLSL,
  MATH_GLSL,
  VECTOR_MATH_GLSL,
  PRINCIPLED_BSDF_GLSL,
  MIX_ADD_SHADER_GLSL,
  MAPPING_GLSL,
  TEXTURE_COORD_GLSL,
  IBL_GLSL,
  MULTI_LIGHT_GLSL,
  SHADOW_MAPPING_GLSL,
  ALL_GLSL_NODE_FUNCTIONS,
  NODE_TYPE_GLSL_REQUIREMENTS,
  GLSL_SNIPPET_MAP,
} from './GLSLNodeFunctions';

// GLSL Shader Composer
export {
  GLSLShaderComposer,
  default as GLSLShaderComposerDefault,
} from './GLSLShaderComposer';

export type {
  ComposableNode,
  ShaderGraph,
  ComposedShader,
} from './GLSLShaderComposer';
