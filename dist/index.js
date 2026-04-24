/**
 * Infinigen R3F - Main Entry Point
 *
 * A complete TypeScript port of Infinigen's constraint-based procedural generation system
 * for React Three Fiber. This library enables real-time constraint-based scene composition
 * in the browser.
 *
 * @packageDocumentation
 */
// Tag System
export * from './tags/index.js';
// Consolidated Constraint System (all submodules unified)
export * from './constraints/index.js';
// Math Utilities
export * from './math/index.js';
// Placement Algorithms
export * from './placement/index.js';
// SIM Module - Physics & Kinematics (NEW - Sprint 3)
export * from './sim/index.js';
// Hybrid Bridge (NEW - Sprint 4)
export * from './bridge/index.js';
// Room Decoration System (NEW - Sprint 5)
export * from './decorate/index.js';
// Animation Policy System (NEW - Sprint 6)
export * from './animation/index.js';
// Node System (NEW - Phase 1)
export * from './nodes/index.js';
// Shared Types
export * from './types.js';
// Pipeline & Export Systems (Phase 5)
export * from './pipeline/SceneExporter.js';
export * from './pipeline/AnnotationGenerator.js';
export * from './pipeline/DataPipeline.js';
export * from './pipeline/GroundTruthGenerator.js';
export * from './pipeline/JobManager.js';
export * from './pipeline/BatchProcessor.js';
export * from './pipeline/types.js';
//# sourceMappingURL=index.js.map