export interface PhysicsMaterial { friction: number; restitution: number; density: number; }
export const defaultMaterial: PhysicsMaterial = { friction: 0.5, restitution: 0.3, density: 1000 };
export default defaultMaterial;
