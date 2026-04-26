/**
 * Marching Cubes Lookup Tables
 * Adapted from scikit-image's Lewiner marching cubes implementation
 * Used in original Infinigen for terrain mesh generation
 */
export declare const EDGE_TABLE: Uint8Array<ArrayBuffer>;
export declare const TRIANGLE_TABLE: Int8Array<ArrayBuffer>;
export declare const EDGE_VERTICES: Int8Array<ArrayBuffer>;
/**
 * Get the number of triangles for a given configuration
 */
export declare function getTriangleCount(configuration: number): number;
/**
 * Check if an edge is intersected for a given configuration
 */
export declare function isEdgeIntersected(configuration: number, edgeIndex: number): boolean;
/**
 * Get triangle vertices for a configuration
 */
export declare function getTriangleVertices(configuration: number): number[];
//# sourceMappingURL=MarchingCubesLUTs.d.ts.map