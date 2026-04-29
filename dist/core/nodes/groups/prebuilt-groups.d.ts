/**
 * Node Groups - Pre-built node group utilities
 *
 * Ports: infinigen/core/nodes/nodegroups/
 *
 * Provides reusable node groups for common procedural generation tasks.
 */
import { NodeWrangler } from '../core/node-wrangler.js';
/**
 * Create a noise-based displacement node group
 */
export declare function createNoiseDisplacementGroup(name?: string, scale?: number, detail?: number, strength?: number): NodeWrangler;
/**
 * Create a principled material node group
 */
export declare function createPrincipledMaterialGroup(name?: string, baseColor?: [number, number, number, number], roughness?: number, metallic?: number): NodeWrangler;
/**
 * Create a random distribution node group
 */
export declare function createRandomDistributionGroup(name?: string, min?: number, max?: number, seed?: number): NodeWrangler;
/**
 * Create an instance-on-points node group
 */
export declare function createInstanceOnPointsGroup(name?: string, rotateInstances?: boolean, scaleInstances?: boolean): NodeWrangler;
/**
 * Create a mesh boolean operation node group
 */
export declare function createMeshBooleanGroup(name?: string, operation?: 'Union' | 'Intersection' | 'Difference'): NodeWrangler;
/**
 * Create a texture coordinate + mapping node group
 */
export declare function createTextureMappingGroup(name?: string, location?: [number, number, number], rotation?: [number, number, number], scale?: [number, number, number]): NodeWrangler;
/**
 * Create a color ramp mapper node group
 */
export declare function createColorRampGroup(name?: string, stops?: Array<{
    position: number;
    color: [number, number, number, number];
}>): NodeWrangler;
/**
 * Export all pre-built node groups
 */
export declare const NodeGroups: {
    createNoiseDisplacementGroup: typeof createNoiseDisplacementGroup;
    createPrincipledMaterialGroup: typeof createPrincipledMaterialGroup;
    createRandomDistributionGroup: typeof createRandomDistributionGroup;
    createInstanceOnPointsGroup: typeof createInstanceOnPointsGroup;
    createMeshBooleanGroup: typeof createMeshBooleanGroup;
    createTextureMappingGroup: typeof createTextureMappingGroup;
    createColorRampGroup: typeof createColorRampGroup;
};
//# sourceMappingURL=prebuilt-groups.d.ts.map