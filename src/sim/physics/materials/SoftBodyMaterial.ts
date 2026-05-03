/**
 * SoftBodyMaterial - Physics material properties for soft body simulation
 *
 * Defines the physical properties of soft bodies used in the spring-mass
 * simulation system. Different materials (rubber, gel, flesh, cloth, sponge)
 * have distinct stiffness, damping, and deformation properties.
 *
 * These properties map to the spring-mass model:
 *   - stiffness → spring constant k (Hooke's law: F = -kx)
 *   - damping → damping coefficient c (F = -cv)
 *   - poissonRatio → lateral/axial strain ratio (volume preservation)
 *   - yieldStress → stress threshold for plastic deformation
 */

// ============================================================================
// Public Types
// ============================================================================

/** Soft body type presets */
export type SoftBodyPreset =
  | 'rubber'
  | 'gel'
  | 'flesh'
  | 'cloth'
  | 'sponge'
  | 'foam'
  | 'leather'
  | 'jelly';

/** Physical properties of a soft body for spring-mass simulation */
export interface SoftBodyMaterial {
  /** Name/identifier for this soft body material */
  name: string;
  /** Spring stiffness in N/m. Rubber ≈ 5000, Flesh ≈ 1000, Cloth ≈ 200 */
  stiffness: number;
  /** Damping coefficient (energy dissipation). Range [0, 1]. Higher = more damping */
  damping: number;
  /** Poisson's ratio (volume preservation). 0 = no lateral expansion, 0.5 = incompressible. Default: 0.3 */
  poissonRatio: number;
  /** Density in kg/m³. Rubber ≈ 1100, Flesh ≈ 1050, Cloth ≈ 300 */
  density: number;
  /** Yield stress for plastic (permanent) deformation. 0 = no plastic deformation */
  yieldStress: number;
  /** Maximum strain before spring breaks. Default: 2.0 (200% stretch) */
  maxStrain: number;
  /** Compression stiffness multiplier (relative to tension stiffness). Default: 1.0 */
  compressionRatio: number;
  /** Bending stiffness for cloth-like materials. Default: 0 */
  bendingStiffness: number;
  /** Shear stiffness for cloth-like materials. Default: 0 */
  shearStiffness: number;
  /** Restitution (bounciness) on collision. Range [0, 1]. Default: 0.3 */
  restitution: number;
  /** Friction coefficient on collision. Default: 0.5 */
  friction: number;
  /** Number of substeps per simulation frame for stability. Default: 1 */
  substeps: number;
  /** Color for visualization (RGB, 0-1 range) */
  color: [number, number, number];
  /** Opacity for visualization. Range [0, 1]. Default: 0.9 */
  opacity: number;
  /** Whether gravity affects this soft body. Default: true */
  useGravity: boolean;
  /** Mass per particle/node in the spring-mass system. Default: 0.01 */
  particleMass: number;
  /** Internal pressure for pressure soft bodies (like balloons). Default: 0 */
  internalPressure: number;
}

// ============================================================================
// Soft Body Presets
// ============================================================================

/** Preset soft body materials matching common physical materials */
export const SOFTBODY_PRESETS: Record<SoftBodyPreset, SoftBodyMaterial> = {
  rubber: {
    name: 'rubber',
    stiffness: 5000,
    damping: 0.05,
    poissonRatio: 0.49,
    density: 1100,
    yieldStress: 0,
    maxStrain: 5.0,
    compressionRatio: 1.0,
    bendingStiffness: 0,
    shearStiffness: 0,
    restitution: 0.8,
    friction: 0.8,
    substeps: 4,
    color: [0.2, 0.2, 0.2],
    opacity: 1.0,
    useGravity: true,
    particleMass: 0.02,
    internalPressure: 0,
  },
  gel: {
    name: 'gel',
    stiffness: 800,
    damping: 0.15,
    poissonRatio: 0.45,
    density: 1200,
    yieldStress: 0,
    maxStrain: 3.0,
    compressionRatio: 1.2,
    bendingStiffness: 0,
    shearStiffness: 0,
    restitution: 0.2,
    friction: 0.3,
    substeps: 3,
    color: [0.5, 0.8, 0.9],
    opacity: 0.6,
    useGravity: true,
    particleMass: 0.015,
    internalPressure: 0,
  },
  flesh: {
    name: 'flesh',
    stiffness: 1000,
    damping: 0.3,
    poissonRatio: 0.45,
    density: 1050,
    yieldStress: 500,
    maxStrain: 1.5,
    compressionRatio: 1.5,
    bendingStiffness: 0,
    shearStiffness: 200,
    restitution: 0.1,
    friction: 0.6,
    substeps: 5,
    color: [0.85, 0.65, 0.55],
    opacity: 1.0,
    useGravity: true,
    particleMass: 0.025,
    internalPressure: 0,
  },
  cloth: {
    name: 'cloth',
    stiffness: 200,
    damping: 0.03,
    poissonRatio: 0.1,
    density: 300,
    yieldStress: 0,
    maxStrain: 1.2,
    compressionRatio: 0.01,
    bendingStiffness: 50,
    shearStiffness: 100,
    restitution: 0.0,
    friction: 0.4,
    substeps: 2,
    color: [0.7, 0.5, 0.3],
    opacity: 1.0,
    useGravity: true,
    particleMass: 0.005,
    internalPressure: 0,
  },
  sponge: {
    name: 'sponge',
    stiffness: 300,
    damping: 0.2,
    poissonRatio: 0.1,
    density: 100,
    yieldStress: 0,
    maxStrain: 4.0,
    compressionRatio: 0.5,
    bendingStiffness: 0,
    shearStiffness: 50,
    restitution: 0.3,
    friction: 0.7,
    substeps: 2,
    color: [0.9, 0.85, 0.5],
    opacity: 0.95,
    useGravity: true,
    particleMass: 0.005,
    internalPressure: 0,
  },
  foam: {
    name: 'foam',
    stiffness: 150,
    damping: 0.25,
    poissonRatio: 0.05,
    density: 50,
    yieldStress: 0,
    maxStrain: 6.0,
    compressionRatio: 0.3,
    bendingStiffness: 0,
    shearStiffness: 30,
    restitution: 0.15,
    friction: 0.5,
    substeps: 2,
    color: [0.95, 0.95, 0.95],
    opacity: 0.85,
    useGravity: true,
    particleMass: 0.003,
    internalPressure: 0,
  },
  leather: {
    name: 'leather',
    stiffness: 3000,
    damping: 0.1,
    poissonRatio: 0.35,
    density: 860,
    yieldStress: 2000,
    maxStrain: 0.5,
    compressionRatio: 0.8,
    bendingStiffness: 500,
    shearStiffness: 800,
    restitution: 0.1,
    friction: 0.7,
    substeps: 3,
    color: [0.45, 0.3, 0.15],
    opacity: 1.0,
    useGravity: true,
    particleMass: 0.02,
    internalPressure: 0,
  },
  jelly: {
    name: 'jelly',
    stiffness: 200,
    damping: 0.08,
    poissonRatio: 0.48,
    density: 1100,
    yieldStress: 0,
    maxStrain: 4.0,
    compressionRatio: 1.0,
    bendingStiffness: 0,
    shearStiffness: 0,
    restitution: 0.6,
    friction: 0.2,
    substeps: 3,
    color: [0.9, 0.3, 0.5],
    opacity: 0.7,
    useGravity: true,
    particleMass: 0.015,
    internalPressure: 100,
  },
};

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a SoftBodyMaterial from a preset name.
 *
 * @param preset - Name of the soft body preset
 * @returns SoftBodyMaterial with preset properties
 * @throws Error if preset name is not recognized
 */
export function createSoftBodyMaterial(preset: SoftBodyPreset): SoftBodyMaterial {
  const material = SOFTBODY_PRESETS[preset];
  if (!material) {
    throw new Error(
      `[SoftBodyMaterial] Unknown preset "${preset}". Available presets: ${Object.keys(SOFTBODY_PRESETS).join(', ')}`
    );
  }
  return { ...material };
}

/**
 * Create a custom SoftBodyMaterial by overriding specific properties of a preset.
 *
 * @param preset - Base preset to start from
 * @param overrides - Properties to override
 * @returns SoftBodyMaterial with custom properties
 *
 * @example
 * ```ts
 * const stiffCloth = createCustomSoftBodyMaterial('cloth', { stiffness: 500, bendingStiffness: 200 });
 * ```
 */
export function createCustomSoftBodyMaterial(
  preset: SoftBodyPreset,
  overrides: Partial<SoftBodyMaterial>
): SoftBodyMaterial {
  const base = createSoftBodyMaterial(preset);
  return { ...base, ...overrides, name: overrides.name ?? `${base.name}_custom` };
}

// ============================================================================
// Physics Helpers
// ============================================================================

/**
 * Compute the spring force from extension and velocity (Hooke's law + damping).
 *
 * F = -k * (x - x₀) - c * v
 *
 * @param material - Soft body material
 * @param extension - Current extension from rest length (positive = stretched)
 * @param velocity - Rate of change of extension (positive = stretching)
 * @returns Force in Newtons
 */
export function computeSpringForce(
  material: SoftBodyMaterial,
  extension: number,
  velocity: number
): number {
  // Spring force (Hooke's law)
  let force = -material.stiffness * extension;

  // Compression adjustment
  if (extension < 0) {
    force *= material.compressionRatio;
  }

  // Damping force
  force -= material.damping * velocity;

  return force;
}

/**
 * Compute the strain from extension and rest length.
 *
 * ε = (L - L₀) / L₀
 *
 * @param extension - Extension from rest length
 * @param restLength - Rest length of the spring
 * @returns Strain (dimensionless)
 */
export function computeStrain(extension: number, restLength: number): number {
  if (restLength === 0) return 0;
  return extension / restLength;
}

/**
 * Check if the spring has yielded (permanent deformation).
 *
 * A spring yields when the stress exceeds the yield stress.
 * Stress ≈ F / A, where A is the cross-sectional area.
 * For simplicity, we compare strain against yield strain.
 *
 * @param material - Soft body material
 * @param strain - Current strain
 * @returns True if the material has yielded
 */
export function hasYielded(material: SoftBodyMaterial, strain: number): boolean {
  if (material.yieldStress <= 0) return false;
  // Approximate yield strain from yield stress and stiffness
  // σ_yield = k * ε_yield → ε_yield = σ_yield / k
  const yieldStrain = material.yieldStress / material.stiffness;
  return Math.abs(strain) > yieldStrain;
}

/**
 * Check if the spring has broken (exceeded max strain).
 *
 * @param material - Soft body material
 * @param strain - Current strain
 * @returns True if the spring has broken
 */
export function hasBroken(material: SoftBodyMaterial, strain: number): boolean {
  return Math.abs(strain) > material.maxStrain;
}

/**
 * Compute the natural frequency of a spring-mass system.
 *
 * ω = sqrt(k / m)
 *
 * @param material - Soft body material
 * @returns Natural frequency in rad/s
 */
export function naturalFrequency(material: SoftBodyMaterial): number {
  return Math.sqrt(material.stiffness / material.particleMass);
}

/**
 * Compute the critical damping coefficient for this spring-mass system.
 *
 * c_crit = 2 * sqrt(k * m)
 *
 * @param material - Soft body material
 * @returns Critical damping coefficient
 */
export function criticalDamping(material: SoftBodyMaterial): number {
  return 2 * Math.sqrt(material.stiffness * material.particleMass);
}

/**
 * Compute the damping ratio (ζ) for this spring-mass system.
 *
 * ζ = c / c_crit
 *
 * - ζ < 1: Underdamped (oscillates)
 * - ζ = 1: Critically damped (fastest return without oscillation)
 * - ζ > 1: Overdamped (slow return, no oscillation)
 *
 * @param material - Soft body material
 * @returns Damping ratio
 */
export function dampingRatio(material: SoftBodyMaterial): number {
  const cCrit = criticalDamping(material);
  if (cCrit === 0) return 0;
  // Convert dimensionless damping [0,1] to actual damping coefficient
  const actualDamping = material.damping * cCrit;
  return actualDamping / cCrit;
}

// Backward compatibility
export const softBodyMaterial: SoftBodyMaterial = SOFTBODY_PRESETS.rubber;
export default softBodyMaterial;
