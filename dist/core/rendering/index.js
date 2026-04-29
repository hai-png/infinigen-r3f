/**
 * Rendering Module Index for Infinigen R3F
 *
 * Central export point for all rendering-related functionality.
 *
 * @module rendering
 */
export { ShaderCompiler, PREDEFINED_VARIANTS } from './shader-compiler';
export * from './postprocessing';
export * as io from './io';
export * as shaders from './shaders';
// Re-export Three.js postprocessing for convenience
export { EffectComposer } from '@react-three/postprocessing';
//# sourceMappingURL=index.js.map