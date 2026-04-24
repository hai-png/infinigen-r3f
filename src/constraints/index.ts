/**
 * Consolidated Constraint System
 * 
 * This module unifies all constraint-related functionality from previously
 * fragmented modules (constraint-language, evaluator, solver, reasoning, room-solver)
 * into a single cohesive API.
 */

// Core Constraint Language
export * from './language/index.js';

// Evaluator - Evaluates constraint violations
export * from './evaluator/index.js';

// Solver - Optimization and search algorithms
export * from './solver/index.js';

// Reasoning - Domain propagation and inference
export * from './reasoning/index.js';

// Room Solver - Specialized room layout solving
export * from './room-solver/index.js';

// Additional constraint utilities
export * from './core/index.js';
export * from './dsl/index.js';
export * from './moves/index.js';
export * from './optimizer/index.js';
export * from './room/index.js';
export * from './utils/index.js';

