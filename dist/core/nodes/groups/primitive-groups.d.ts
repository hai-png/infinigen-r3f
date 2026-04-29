/**
 * Primitive Node Groups - Pre-built node group templates
 * Based on infinigen/core/nodes/nodegroups/
 *
 * Provides reusable node group patterns for common material effects
 */
import { NodeWrangler, NodeGroup } from '../core/node-wrangler';
export interface PrimitiveGroupConfig {
    name: string;
    wrangler: NodeWrangler;
    location?: [number, number];
}
/**
 * Creates a bump mapping node group
 * Converts height/displacement to normal vectors
 */
export declare function createBumpGroup(config: PrimitiveGroupConfig): NodeGroup;
/**
 * Creates a normal map processing node group
 */
export declare function createNormalMapGroup(config: PrimitiveGroupConfig): NodeGroup;
/**
 * Creates a color ramp node group for gradient mapping
 */
export declare function createColorRampGroup(config: PrimitiveGroupConfig): NodeGroup;
/**
 * Creates a texture coordinate transformation group
 */
export declare function createTexCoordGroup(config: PrimitiveGroupConfig): NodeGroup;
/**
 * Creates a noise texture with advanced controls
 */
export declare function createNoiseTextureGroup(config: PrimitiveGroupConfig): NodeGroup;
/**
 * Creates a principled BSDF material group with common inputs
 */
export declare function createPrincipledBSDFGroup(config: PrimitiveGroupConfig): NodeGroup;
/**
 * Creates a layer weight node group for fresnel effects
 */
export declare function createLayerWeightGroup(config: PrimitiveGroupConfig): NodeGroup;
/**
 * Creates a vector math operations group
 */
export declare function createVectorMathGroup(config: PrimitiveGroupConfig): NodeGroup;
/**
 * Registry of all primitive groups
 */
export declare const PRIMITIVE_GROUPS: Record<string, (config: PrimitiveGroupConfig) => NodeGroup>;
/**
 * Factory function to create primitive groups by name
 */
export declare function createPrimitiveGroup(name: string, wrangler: NodeWrangler, location?: [number, number]): NodeGroup | null;
declare const _default: {
    createBumpGroup: typeof createBumpGroup;
    createNormalMapGroup: typeof createNormalMapGroup;
    createColorRampGroup: typeof createColorRampGroup;
    createTexCoordGroup: typeof createTexCoordGroup;
    createNoiseTextureGroup: typeof createNoiseTextureGroup;
    createPrincipledBSDFGroup: typeof createPrincipledBSDFGroup;
    createLayerWeightGroup: typeof createLayerWeightGroup;
    createVectorMathGroup: typeof createVectorMathGroup;
    createPrimitiveGroup: typeof createPrimitiveGroup;
    PRIMITIVE_GROUPS: Record<string, (config: PrimitiveGroupConfig) => NodeGroup>;
};
export default _default;
//# sourceMappingURL=primitive-groups.d.ts.map