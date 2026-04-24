/**
 * Rendering Module Index for Infinigen R3F
 * 
 * Central export point for all rendering-related functionality.
 * 
 * @module rendering
 */

export { ShaderCompiler, type ShaderVariant, type ShaderCompilationResult, PREDEFINED_VARIANTS } from './shader-compiler';
export * from './postprocessing';

// Re-export Three.js postprocessing for convenience
export { EffectComposer } from '@react-three/postprocessing';
