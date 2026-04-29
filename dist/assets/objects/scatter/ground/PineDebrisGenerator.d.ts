import * as THREE from 'three';
/**
 * Pine debris types for coniferous forest floors
 */
export declare enum PineDebrisType {
    NEEDLE_CARPET = "needle_carpet",
    LOOSE_NEEDLES = "loose_needles",
    PINECONE_SMALL = "pinecone_small",
    PINECONE_MEDIUM = "pinecone_medium",
    PINECONE_LARGE = "pinecone_large",
    MIXED = "mixed"
}
/**
 * Pine cone characteristics
 */
export declare enum PineConeState {
    CLOSED = "closed",// Fresh, tightly closed
    OPEN = "open",// Mature, scales open
    AGED = "aged",// Weathered, darker
    DAMAGED = "damaged"
}
export interface PineDebrisConfig {
    debrisType: PineDebrisType;
    density: number;
    area: THREE.Vector2;
    pineConeState?: PineConeState;
    needleColorVariation?: boolean;
    coneSizeVariation?: boolean;
    seedDispersal?: boolean;
}
/**
 * Generates pine needle carpets and pinecone scatter for coniferous forests
 */
export declare class PineDebrisGenerator {
    private static readonly NEEDLE_COLORS;
    private static readonly PINECONE_COLORS;
    /**
     * Generate pine needle carpet with instanced rendering
     */
    static generateNeedleCarpet(config: PineDebrisConfig): THREE.InstancedMesh;
    /**
     * Generate pinecones with instanced rendering
     */
    static generatePinecones(config: PineDebrisConfig): THREE.InstancedMesh;
    /**
     * Create individual pine needle geometry
     */
    private static createNeedleGeometry;
    /**
     * Create pinecone geometry with scale detail
     */
    private static createPineconeGeometry;
    /**
     * Helper to merge group geometries (simplified)
     */
    private static mergeGroupGeometries;
    /**
     * Calculate height based on terrain
     */
    private static calculateHeight;
    /**
     * Generate complete pine debris field (needles + cones)
     */
    static generateMixedDebris(config: PineDebrisConfig): THREE.Group;
    /**
     * Generate scattered pine seeds around cones
     */
    private static generateSeeds;
    /**
     * Generate dense needle clusters under trees
     */
    static generateNeedleClusters(config: PineDebrisConfig, clusterCount: number): THREE.Group;
}
//# sourceMappingURL=PineDebrisGenerator.d.ts.map