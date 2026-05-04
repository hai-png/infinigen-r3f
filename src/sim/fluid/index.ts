/**
 * Fluid Simulation Module
 *
 * Provides both SPH (Smoothed Particle Hydrodynamics) and FLIP
 * (FLuid Implicit Particle) fluid simulation methods, plus fire
 * simulation and SPH mesh surface extraction.
 *
 * - SPH:  Purely Lagrangian, good for small-scale effects
 * - FLIP: Hybrid Eulerian-Lagrangian, better for large-scale water
 *         and rivers with accurate pressure handling
 * - Fire: Particle-based fire simulation with temperature fields and caching
 * - SPH Surface Extraction: Converts SPH particles to smooth mesh surfaces
 * - Lava Flow: Temperature-dependent lava simulation with flow patterns
 * - Whitewater: Foam, spray, and bubble generation from FLIP simulation
 */

// ── SPH Fluid ──
export { FluidSimulation } from './FluidSimulation';
export type { FluidConfig, FluidParticle } from './FluidSimulation';

export { FluidSurfaceRenderer, FluidRenderIntegration } from './FluidSurfaceRenderer';
export type { FluidSurfaceRendererConfig } from './FluidSurfaceRenderer';

// ── SPH Surface Extraction ──
export { SPHSurfaceExtractor } from './SPHSurfaceExtractor';
export type { SPHSurfaceExtractorConfig, ParticleWithPosition } from './SPHSurfaceExtractor';

// ── Fire Simulation ──
export { FireSimulation, FireCachingSystem, FireRenderer } from './FireSimulation';
export type { FireParticle, FireConfig } from './FireSimulation';

// ── FLIP Fluid ──
export { FLIPFluidSolver, FLIPGrid } from './FLIPFluidSolver';
export type { FLIPParticle, FLIPConfig, DomainSize } from './FLIPFluidSolver';

export { FLIPSurfaceExtractor } from './FLIPSurfaceExtractor';
export type { FLIPSurfaceExtractorConfig } from './FLIPSurfaceExtractor';

export { FLIPFluidRenderer } from './FLIPFluidRenderer';
export type { FLIPFluidRendererConfig, FLIPRenderMode } from './FLIPFluidRenderer';

// ── GPU-Accelerated Fluid ──
export { GPUFluidCompute } from './GPUFluidCompute';
export type { GPUFluidConfig, GPUFluidState } from './GPUFluidCompute';
export { DEFAULT_GPU_FLUID_CONFIG } from './GPUFluidCompute';

// ── Lava Flow ──
export { LavaFlowSimulation } from './LavaFlowPatterns';
export type {
  LavaFlowType,
  LavaFlowConfig,
  LavaParticleState,
  LavaSimulationResult,
} from './LavaFlowPatterns';

// ── Whitewater ──
export { WhitewaterSystem } from './WhitewaterGenerator';
export type {
  WhitewaterType,
  WhitewaterParams,
  WhitewaterParticle,
  WhitewaterParticles,
  WhitewaterRenderData,
} from './WhitewaterGenerator';
