/**
 * FluidMaterial - Physics material properties for fluid simulation
 *
 * Defines the physical properties of fluids used in the SPH (Smoothed
 * Particle Hydrodynamics) simulation. Different fluid types (water, oil,
 * honey, lava, mud) have distinct viscosity, density, surface tension,
 * and gas constant properties that affect particle behavior.
 *
 * These properties map directly to the SPH kernel parameters:
 *   - density → rest density ρ₀ in the Poly6 kernel
 *   - viscosity → viscosity coefficient μ in the viscosity kernel
 *   - gasConstant → stiffness k in the pressure equation P = k(ρ - ρ₀)
 *   - surfaceTension → surface tension coefficient σ for boundary forces
 */

// ============================================================================
// Public Types
// ============================================================================

/** Fluid type presets matching common simulation scenarios */
export type FluidPreset =
  | 'water'
  | 'seawater'
  | 'oil'
  | 'honey'
  | 'lava'
  | 'mud'
  | 'mercury'
  | 'acid';

/** Physical properties of a fluid for SPH simulation */
export interface FluidMaterial {
  /** Name/identifier for this fluid material */
  name: string;
  /** Dynamic viscosity in Pa·s (Pascal-seconds). Water ≈ 0.001, Honey ≈ 2-10 */
  viscosity: number;
  /** Rest density in kg/m³. Water = 1000, Oil ≈ 900, Honey ≈ 1400 */
  density: number;
  /** Gas constant / stiffness for the equation of state. Higher = less compressible. Default: 2000 */
  gasConstant: number;
  /** Surface tension coefficient in N/m. Water ≈ 0.0728, Mercury ≈ 0.487 */
  surfaceTension: number;
  /** Particle interaction radius for SPH kernels. Default: 0.1 */
  smoothingRadius: number;
  /** Rest pressure. Default: 0 */
  restPressure: number;
  /** Maximum velocity clamp to prevent particle explosion. Default: 10 */
  maxVelocity: number;
  /** Damping applied per frame to simulate energy loss. Range [0, 1]. Default: 0.01 */
  damping: number;
  /** Color for visualization (RGB, 0-1 range) */
  color: [number, number, number];
  /** Opacity for visualization. Range [0, 1]. Default: 0.8 */
  opacity: number;
  /** Whether this fluid is affected by gravity. Default: true */
  useGravity: boolean;
  /** Boundary restitution coefficient (bounce off walls). Range [0, 1]. Default: 0.3 */
  boundaryRestitution: number;
  /** Temperature in Kelvin (for lava and thermally-sensitive fluids). Default: 293 */
  temperature: number;
}

// ============================================================================
// Fluid Presets
// ============================================================================

/** Preset fluid materials matching common physical fluids */
export const FLUID_PRESETS: Record<FluidPreset, FluidMaterial> = {
  water: {
    name: 'water',
    viscosity: 0.001,
    density: 1000,
    gasConstant: 2000,
    surfaceTension: 0.0728,
    smoothingRadius: 0.1,
    restPressure: 0,
    maxVelocity: 10,
    damping: 0.01,
    color: [0.1, 0.4, 0.8],
    opacity: 0.7,
    useGravity: true,
    boundaryRestitution: 0.3,
    temperature: 293,
  },
  seawater: {
    name: 'seawater',
    viscosity: 0.00108,
    density: 1025,
    gasConstant: 2100,
    surfaceTension: 0.074,
    smoothingRadius: 0.1,
    restPressure: 0,
    maxVelocity: 10,
    damping: 0.01,
    color: [0.05, 0.3, 0.55],
    opacity: 0.75,
    useGravity: true,
    boundaryRestitution: 0.25,
    temperature: 288,
  },
  oil: {
    name: 'oil',
    viscosity: 0.03,
    density: 900,
    gasConstant: 1800,
    surfaceTension: 0.032,
    smoothingRadius: 0.12,
    restPressure: 0,
    maxVelocity: 5,
    damping: 0.02,
    color: [0.6, 0.5, 0.1],
    opacity: 0.85,
    useGravity: true,
    boundaryRestitution: 0.2,
    temperature: 293,
  },
  honey: {
    name: 'honey',
    viscosity: 5.0,
    density: 1400,
    gasConstant: 1500,
    surfaceTension: 0.05,
    smoothingRadius: 0.08,
    restPressure: 0,
    maxVelocity: 1,
    damping: 0.1,
    color: [0.85, 0.65, 0.1],
    opacity: 0.95,
    useGravity: true,
    boundaryRestitution: 0.05,
    temperature: 293,
  },
  lava: {
    name: 'lava',
    viscosity: 100,
    density: 2600,
    gasConstant: 5000,
    surfaceTension: 0.35,
    smoothingRadius: 0.15,
    restPressure: 0,
    maxVelocity: 0.5,
    damping: 0.15,
    color: [1.0, 0.3, 0.0],
    opacity: 1.0,
    useGravity: true,
    boundaryRestitution: 0.0,
    temperature: 1473,
  },
  mud: {
    name: 'mud',
    viscosity: 0.5,
    density: 1800,
    gasConstant: 1200,
    surfaceTension: 0.04,
    smoothingRadius: 0.1,
    restPressure: 0,
    maxVelocity: 2,
    damping: 0.08,
    color: [0.35, 0.25, 0.15],
    opacity: 1.0,
    useGravity: true,
    boundaryRestitution: 0.1,
    temperature: 293,
  },
  mercury: {
    name: 'mercury',
    viscosity: 0.00155,
    density: 13534,
    gasConstant: 8000,
    surfaceTension: 0.487,
    smoothingRadius: 0.06,
    restPressure: 0,
    maxVelocity: 15,
    damping: 0.005,
    color: [0.75, 0.75, 0.8],
    opacity: 1.0,
    useGravity: true,
    boundaryRestitution: 0.5,
    temperature: 293,
  },
  acid: {
    name: 'acid',
    viscosity: 0.002,
    density: 1100,
    gasConstant: 2200,
    surfaceTension: 0.05,
    smoothingRadius: 0.1,
    restPressure: 0,
    maxVelocity: 8,
    damping: 0.02,
    color: [0.2, 1.0, 0.1],
    opacity: 0.65,
    useGravity: true,
    boundaryRestitution: 0.35,
    temperature: 293,
  },
};

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a FluidMaterial from a preset name.
 *
 * @param preset - Name of the fluid preset
 * @returns FluidMaterial with preset properties
 * @throws Error if preset name is not recognized
 */
export function createFluidMaterial(preset: FluidPreset): FluidMaterial {
  const material = FLUID_PRESETS[preset];
  if (!material) {
    throw new Error(
      `[FluidMaterial] Unknown preset "${preset}". Available presets: ${Object.keys(FLUID_PRESETS).join(', ')}`
    );
  }
  return { ...material };
}

/**
 * Create a custom FluidMaterial by overriding specific properties of a preset.
 *
 * @param preset - Base preset to start from
 * @param overrides - Properties to override
 * @returns FluidMaterial with custom properties
 *
 * @example
 * ```ts
 * const thickWater = createCustomFluidMaterial('water', { viscosity: 0.01, density: 1100 });
 * ```
 */
export function createCustomFluidMaterial(
  preset: FluidPreset,
  overrides: Partial<FluidMaterial>
): FluidMaterial {
  const base = createFluidMaterial(preset);
  return { ...base, ...overrides, name: overrides.name ?? `${base.name}_custom` };
}

/**
 * Get the Reynolds number for a fluid at a given flow velocity and length scale.
 *
 * Re = ρ * v * L / μ
 *
 * - Re < 2300: Laminar flow
 * - 2300 < Re < 4000: Transitional flow
 * - Re > 4000: Turbulent flow
 *
 * @param material - Fluid material
 * @param velocity - Flow velocity in m/s
 * @param lengthScale - Characteristic length in meters
 * @returns Reynolds number
 */
export function reynoldsNumber(material: FluidMaterial, velocity: number, lengthScale: number): number {
  return (material.density * velocity * lengthScale) / material.viscosity;
}

/**
 * Compute the SPH pressure from density deviation using the Tait equation of state.
 *
 * P = B * ((ρ/ρ₀)^γ - 1)
 *
 * Where B = ρ₀ * c² / γ, c is the speed of sound, and γ = 7 for water.
 * For simplicity, we use a linearized version: P = k * (ρ - ρ₀)
 *
 * @param material - Fluid material
 * @param currentDensity - Current particle density
 * @returns Pressure in Pascals
 */
export function computePressure(material: FluidMaterial, currentDensity: number): number {
  return material.gasConstant * (currentDensity - material.density);
}

/**
 * Compute the speed of sound in the fluid.
 *
 * c = sqrt(k / ρ₀)
 *
 * This determines the maximum time step for stable SPH simulation:
 *   Δt < 0.4 * h / c
 *
 * @param material - Fluid material
 * @returns Speed of sound in m/s
 */
export function speedOfSound(material: FluidMaterial): number {
  return Math.sqrt(material.gasConstant / material.density);
}

/**
 * Compute the maximum stable time step for SPH simulation.
 *
 * Uses the Courant-Friedrichs-Lewy (CFL) condition:
 *   Δt_max = 0.4 * h / c
 *
 * Where h is the smoothing radius and c is the speed of sound.
 *
 * @param material - Fluid material
 * @returns Maximum stable time step in seconds
 */
export function maxStableTimeStep(material: FluidMaterial): number {
  const c = speedOfSound(material);
  return 0.4 * material.smoothingRadius / c;
}

// Backward compatibility: default export is water preset
export const waterMaterial: FluidMaterial = FLUID_PRESETS.water;
export default waterMaterial;
