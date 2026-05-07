/**
 * Node Groups Module
 *
 * Re-exports all group-related utilities:
 * - Pre-built node group templates (noise, PBR, displacement, etc.)
 * - NodeGroupComposition — deep nesting, parameterization & reuse API
 * - NodeGroupFactory — TypeScript equivalents of Infinigen's `@to_nodegroup`
 *   and `@to_material` decorators, plus `add_geomod` and
 *   `shaderfunc_to_material`
 */

export * from './prebuilt-groups';
export * from './NodeGroupComposition';
export * from './NodeGroupFactory';
