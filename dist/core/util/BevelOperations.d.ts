import * as THREE from 'three';
/**
 * Bevel Operations System
 *
 * Mesh beveling and edge smoothing utilities:
 * - Chamfer (straight edge) bevels
 * - Rounded (curved) bevels with multiple segments
 * - Selective edge beveling
 * - Vertex beveling for soft corners
 * - Custom profile bevels
 *
 * @module BevelOperations
 */
/**
 * Bevel types supported
 */
export declare enum BevelType {
    /** Straight chamfer cut */
    CHAMFER = "chamfer",
    /** Rounded curve with segments */
    ROUNDED = "rounded",
    /** Custom profile curve */
    CUSTOM = "custom"
}
/**
 * Bevel configuration options
 */
export interface BevelConfig {
    /** Type of bevel to apply */
    type: BevelType;
    /** Bevel width/size */
    width: number;
    /** Number of segments for rounded bevels */
    segments?: number;
    /** Custom profile points (for custom type) */
    profile?: Array<{
        x: number;
        y: number;
    }>;
    /** Only bevel edges sharper than this angle (radians) */
    minAngle?: number;
    /** Maximum bevel distance before stopping */
    maxBevel?: number;
    /** Bevel both sides of edge or just one */
    symmetric?: boolean;
}
/**
 * Result of bevel operation
 */
export interface BevelResult {
    /** Original geometry */
    original: THREE.BufferGeometry;
    /** Beveled geometry */
    beveled: THREE.BufferGeometry;
    /** Number of edges beveled */
    edgesBeveled: number;
    /** Number of new vertices created */
    newVertices: number;
    /** Number of new faces created */
    newFaces: number;
    /** Processing time in milliseconds */
    processingTime: number;
}
/**
 * Bevel Operations Class
 *
 * Provides mesh beveling and edge smoothing functionality.
 */
export declare class BevelOperations {
    /** Default minimum angle for beveling (30 degrees) */
    private static readonly DEFAULT_MIN_ANGLE;
    /** Default segments for rounded bevels */
    private static readonly DEFAULT_SEGMENTS;
    /** Default bevel type */
    private static readonly DEFAULT_TYPE;
    /**
     * Apply bevel to a geometry
     */
    bevel(geometry: THREE.BufferGeometry, config: BevelConfig): BevelResult;
    /**
     * Extract edges from geometry
     */
    private extractEdges;
    /**
     * Bevel a single edge
     */
    private bevelEdge;
    /**
     * Generate chamfer (straight) bevel vertices
     */
    private generateChamferVertices;
    /**
     * Generate rounded bevel vertices
     */
    private generateRoundedVertices;
    /**
     * Generate custom profile bevel vertices
     */
    private generateCustomProfileVertices;
    /**
     * Apply vertex beveling (soften corners)
     */
    bevelVertices(geometry: THREE.BufferGeometry, radius: number): THREE.BufferGeometry;
    /**
     * Calculate per-vertex average normals
     */
    private calculateVertexNormals;
    /**
     * Selective edge beveling based on edge groups
     */
    bevelSelective(geometry: THREE.BufferGeometry, edgeIndices: number[], config: BevelConfig): BevelResult;
    /**
     * Visualize beveled edges
     */
    visualizeEdges(geometry: THREE.BufferGeometry, color?: number): THREE.LineSegments;
    /**
     * Export beveled geometry
     */
    export(geometry: THREE.BufferGeometry, format: 'json' | 'obj'): string;
}
export default BevelOperations;
//# sourceMappingURL=BevelOperations.d.ts.map