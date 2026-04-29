import * as THREE from 'three';
/**
 * Leaf litter types for seasonal ground cover
 */
export declare enum LeafType {
    OAK = "oak",
    MAPLE = "maple",
    BIRCH = "birch",
    PINE = "pine",
    MIXED = "mixed"
}
/**
 * Decomposition states for realistic leaf aging
 */
export declare enum DecompositionState {
    FRESH = "fresh",// Recently fallen, vibrant colors
    DRYING = "drying",// Losing moisture, curling edges
    DECAYING = "decaying",// Brown, breaking down
    HUMUS = "humus"
}
export interface LeafLitterConfig {
    leafType: LeafType;
    density: number;
    area: THREE.Vector2;
    decompositionState: DecompositionState;
    colorVariation: boolean;
    windDirection?: THREE.Vector3;
    clusterSize?: number;
    layerDepth?: number;
}
/**
 * Generates realistic leaf litter for forest floors and gardens
 */
export declare class LeafLitterGenerator {
    private static readonly LEAF_SHAPES;
    private static readonly COLORS;
    /**
     * Generate leaf litter mesh with instanced rendering
     */
    static generate(config: LeafLitterConfig): THREE.InstancedMesh;
    /**
     * Create leaf geometry based on type
     */
    private static createLeafGeometry;
    /**
     * Calculate height based on terrain noise
     */
    private static calculateHeight;
    /**
     * Generate clustered leaf piles
     */
    static generateClusters(config: LeafLitterConfig, clusterCount: number): THREE.Group;
    /**
     * Create multi-layer leaf litter for deep accumulation
     */
    static generateMultiLayer(config: LeafLitterConfig, layers: number): THREE.Group;
    private static getLayerDecomposition;
}
//# sourceMappingURL=LeafLitterGenerator.d.ts.map