/**
 * PhysicsMaterial - Material properties for physics interactions
 */
export interface PhysicsMaterial {
  friction: number;
  restitution: number;
  density: number;
}

export const defaultMaterial: PhysicsMaterial = { friction: 0.5, restitution: 0.3, density: 1000 };

export const materialPresets: Record<string, PhysicsMaterial> = {
  default: { friction: 0.5, restitution: 0.3, density: 1000 },
  wood: { friction: 0.4, restitution: 0.2, density: 700 },
  metal: { friction: 0.3, restitution: 0.4, density: 7800 },
  rubber: { friction: 0.8, restitution: 0.6, density: 1100 },
  ice: { friction: 0.05, restitution: 0.1, density: 900 },
  stone: { friction: 0.6, restitution: 0.15, density: 2500 },
  glass: { friction: 0.2, restitution: 0.1, density: 2500 },
  concrete: { friction: 0.7, restitution: 0.1, density: 2400 },
  plastic: { friction: 0.4, restitution: 0.3, density: 1200 },
  fabric: { friction: 0.6, restitution: 0.05, density: 300 },
  water: { friction: 0.1, restitution: 0.0, density: 1000 },
};

/**
 * Combine two materials' friction using geometric mean
 */
export function combineFriction(a: PhysicsMaterial, b: PhysicsMaterial): number {
  return Math.sqrt(a.friction * b.friction);
}

/**
 * Combine two materials' restitution using minimum
 */
export function combineRestitution(a: PhysicsMaterial, b: PhysicsMaterial): number {
  return Math.min(a.restitution, b.restitution);
}

export default defaultMaterial;
